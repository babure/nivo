import { describe, expect, it } from "vitest";
import { cookieFrom, createTestApp, signUpAndLogin } from "../../test/app-harness.js";

async function promote(
  repos: Awaited<ReturnType<typeof createTestApp>>["repos"],
  email: string,
  role: string,
) {
  const u = (await repos.users.findByEmail(email))!;
  await repos.users.update(u.id, {
    role,
    ...(role === "super_admin" ? { isBootstrap: true } : {}),
  });
}

describe("admin routes + permissions middleware", () => {
  it("requires authentication", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/v1/admin/students" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids students and consultancy from admin routes and audits the denial", async () => {
    const { app, mailer, repos } = await createTestApp();
    const student = await signUpAndLogin(app, mailer);
    const denied = await app.inject({
      method: "GET",
      url: "/v1/admin/students",
      headers: { cookie: student.cookie },
    });
    expect(denied.statusCode).toBe(403);

    const cons = await signUpAndLogin(app, mailer, { email: "cons@example.com" });
    await promote(repos, "cons@example.com", "consultancy");
    const list = await app.inject({
      method: "GET",
      url: "/v1/admin/students",
      headers: { cookie: cons.cookie },
    });
    expect(list.statusCode).toBe(403);

    const target = (await repos.users.findByEmail("ada@example.com"))!;
    const mark = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: cons.cookie },
      payload: { reason: "manual bank transfer received" },
    });
    expect(mark.statusCode).toBe(403);
    const audit = await repos.audit.all();
    expect(audit.some((a) => a.action === "admin.permission_denied")).toBe(true);
  });

  it("super_admin marks paid immediately and audit chain verifies", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const admin = await signUpAndLogin(app, mailer, { email: "root-paid@example.com" });
    await promote(repos, "root-paid@example.com", "super_admin");
    const target = (await repos.users.findByEmail("ada@example.com"))!;

    const bad = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: admin.cookie },
      payload: { reason: "manual bank transfer received", extra: 1 },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: admin.cookie },
      payload: { reason: "super admin override paid" },
    });
    expect(ok.statusCode).toBe(204);
    expect((await repos.profiles.get(target.id))?.paymentStatus).toBe("paid");

    const audit = await app.inject({
      method: "GET",
      url: "/v1/admin/audit",
      headers: { cookie: admin.cookie },
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().chain.valid).toBe(true);
    expect(audit.json().entries.some((e: { action: string }) => e.action === "payments.manual_mark_paid")).toBe(true);
  });

  it("detects tampering of the stored audit log", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const admin = await signUpAndLogin(app, mailer, { email: "root@example.com" });
    await promote(repos, "root@example.com", "super_admin");
    repos.tamperAudit(0, { action: "forged.action" });
    const res = await app.inject({ method: "GET", url: "/v1/admin/audit", headers: { cookie: admin.cookie } });
    expect(res.json().chain.valid).toBe(false);
  });

  it("identity reveal is forbidden for consultancy", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const cons = await signUpAndLogin(app, mailer, { email: "ops@example.com" });
    await promote(repos, "ops@example.com", "consultancy");
    const target = (await repos.users.findByEmail("ada@example.com"))!;
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/identity/reveal`,
      headers: { cookie: cons.cookie },
      payload: { reason: "verifying passport for blocked account" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("super_admin can create another admin and a consultancy with referral code", async () => {
    const { app, mailer, repos } = await createTestApp();
    const admin = await signUpAndLogin(app, mailer, { email: "root-team@example.com" });
    await promote(repos, "root-team@example.com", "super_admin");

    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/admins",
      headers: { cookie: admin.cookie },
      payload: {
        email: "second@nivo.test",
        fullName: "Second Admin",
        password: "NivoAdmin1234",
      },
    });
    expect(created.statusCode).toBe(201);
    const second = await repos.users.findByEmail("second@nivo.test");
    expect(second?.role).toBe("super_admin");

    const list = await app.inject({
      method: "GET",
      url: "/v1/admin/admins",
      headers: { cookie: admin.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().admins.some((a: { email: string }) => a.email === "second@nivo.test")).toBe(true);

    const cons = await app.inject({
      method: "POST",
      url: "/v1/admin/consultancies",
      headers: { cookie: admin.cookie },
      payload: {
        name: "Delhi Advisors",
        code: "delhi01",
        managerEmail: "delhi@nivo.test",
        managerName: "Delhi Manager",
      },
    });
    expect(cons.statusCode).toBe(201);
    expect(cons.json().code).toBe("DELHI01");
    expect(cons.json().link).toBe("/r/DELHI01");
    expect(cons.json().manager?.email).toBe("delhi@nivo.test");
    expect(cons.json().manager?.inviteSent).toBe(true);
    const manager = await repos.users.findByEmail("delhi@nivo.test");
    expect(manager?.role).toBe("consultancy");
    expect(manager?.passwordSet).toBe(false);
    expect(mailer.lastTokenFor("delhi@nivo.test", "consultancy_invite")).toBeTruthy();
    expect(await repos.consultancies.getMembership(manager!.id)).toMatchObject({
      consultancyId: cons.json().id,
    });

    const inviteTok = mailer.lastTokenFor("delhi@nivo.test", "consultancy_invite")!;
    const setPw = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: inviteTok, password: "NivoConsul1234" },
    });
    expect(setPw.statusCode).toBe(200);
    expect(setPw.json()).toMatchObject({ status: "password_updated" });
    const after = await repos.users.findByEmail("delhi@nivo.test");
    expect(after?.passwordSet).toBe(true);
    expect(after?.emailVerifiedAt).toBeTruthy();
  });
});

describe("partners, legal and consultancy routes", () => {
  it("serves published legal documents", async () => {
    const { app } = await createTestApp();
    const list = await app.inject({ method: "GET", url: "/v1/legal" });
    expect(list.json().documents.map((d: { slug: string }) => d.slug)).toContain("terms");
    const doc = await app.inject({ method: "GET", url: "/v1/legal/terms" });
    expect(doc.statusCode).toBe(200);
    const bad = await app.inject({ method: "GET", url: "/v1/legal/secret" });
    expect(bad.statusCode).toBe(400);
  });

  it("partner redirect only to http(s) links configured by an admin", async () => {
    const { app, mailer, repos } = await createTestApp();
    const editor = await signUpAndLogin(app, mailer, { email: "ed@example.com" });
    await promote(repos, "ed@example.com", "super_admin");

    const insecure = await app.inject({
      method: "PUT",
      url: "/v1/admin/settings/links",
      headers: { cookie: editor.cookie },
      payload: { links: { sim: "javascript:alert(1)" } },
    });
    expect(insecure.statusCode).toBe(400);

    const ok = await app.inject({
      method: "PUT",
      url: "/v1/admin/settings/links",
      headers: { cookie: editor.cookie },
      payload: { links: { sim: "https://partner.example/sim" } },
    });
    expect(ok.statusCode).toBe(204);

    const go = await app.inject({ method: "GET", url: "/v1/partners/sim/go" });
    expect(go.statusCode).toBe(302);
    expect(go.headers.location).toBe("https://partner.example/sim");
    expect((await repos.clicks.countByKey()).sim).toBe(1);

    const missing = await app.inject({ method: "GET", url: "/v1/partners/unknown/go" });
    expect(missing.statusCode).toBe(404);
    void cookieFrom;
  });

  it("consultancy dashboard is limited to the member's own tenant", async () => {
    const { app, mailer, repos } = await createTestApp();
    repos.seedConsultancy("Sample Consultancy", "SAMPLE");
    await signUpAndLogin(app, mailer, { referralCode: "sample" });
    const member = await signUpAndLogin(app, mailer, { email: "cons@example.com" });
    const memberUser = (await repos.users.findByEmail("cons@example.com"))!;
    const c = await repos.consultancies.findByReferralCode("SAMPLE");
    repos.seedConsultancy("Other", "OTHER", memberUser.id);

    const noMember = await signUpAndLogin(app, mailer, { email: "plain@example.com" });
    const denied = await app.inject({ method: "GET", url: "/v1/consultancy/dashboard", headers: { cookie: noMember.cookie } });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({ method: "GET", url: "/v1/consultancy/dashboard", headers: { cookie: member.cookie } });
    expect(res.statusCode).toBe(200);
    // member belongs to "Other": must not see Sample's referred student
    expect(res.json().students).toHaveLength(0);
    expect(res.json().organisation).toMatchObject({ name: "Other", code: "OTHER", link: "/r/OTHER" });
    expect(c).not.toBeNull();
  });

  it("consultancy can email a student referral invite", async () => {
    const { app, mailer, repos } = await createTestApp();
    const member = await signUpAndLogin(app, mailer, { email: "invite-mgr@example.com" });
    const memberUser = (await repos.users.findByEmail("invite-mgr@example.com"))!;
    repos.seedConsultancy("Invite Org", "INVITE1", memberUser.id);

    const sent = await app.inject({
      method: "POST",
      url: "/v1/consultancy/invite-student",
      headers: { cookie: member.cookie },
      payload: { email: "new-student@example.com", fullName: "New Student" },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({
      inviteSent: true,
      email: "new-student@example.com",
      referralCode: "INVITE1",
      link: "/r/INVITE1",
    });
    const mail = mailer.lastFor("new-student@example.com", "student_referral_invite");
    expect(mail?.vars?.referralCode).toBe("INVITE1");
    expect(mail?.vars?.organisationName).toBe("Invite Org");

    const conflict = await app.inject({
      method: "POST",
      url: "/v1/consultancy/invite-student",
      headers: { cookie: member.cookie },
      payload: { email: "invite-mgr@example.com" },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("public lookup and student referral apply work end-to-end", async () => {
    const { app, mailer, repos } = await createTestApp();
    repos.seedConsultancy("Delhi Partners", "DELHI");

    const bad = await app.inject({ method: "GET", url: "/v1/consultancy/lookup?code=NOPE" });
    expect(bad.json()).toEqual({ valid: false });

    const ok = await app.inject({ method: "GET", url: "/v1/consultancy/lookup?code=delhi" });
    expect(ok.json()).toMatchObject({ valid: true, name: "Delhi Partners", code: "DELHI", link: "/r/DELHI" });

    const student = await signUpAndLogin(app, mailer, { email: "late-ref@example.com" });
    const applied = await app.inject({
      method: "POST",
      url: "/v1/me/referral",
      headers: { cookie: student.cookie },
      payload: { code: "DELHI", shareProgressWithConsultancy: true },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({
      attributed: true,
      shareProgressWithConsultancy: true,
      organisation: { name: "Delhi Partners", code: "DELHI" },
    });

    const mine = await app.inject({ method: "GET", url: "/v1/me/referral", headers: { cookie: student.cookie } });
    expect(mine.json().organisation.name).toBe("Delhi Partners");
  });

  it("admin can suggest and regenerate a unique referral code before create", async () => {
    const { app, mailer, repos } = await createTestApp();
    const admin = await signUpAndLogin(app, mailer, { email: "code-boss@example.com" });
    await promote(repos, "code-boss@example.com", "super_admin");
    repos.seedConsultancy("Taken Org", "DELHIADVISORS");

    const first = await app.inject({
      method: "POST",
      url: "/v1/admin/consultancies/suggest-code",
      headers: { cookie: admin.cookie },
      payload: { name: "Delhi Advisors" },
    });
    expect(first.statusCode).toBe(200);
    const code1 = first.json().code as string;
    expect(code1).not.toBe("DELHIADVISORS");
    expect(code1.length).toBeGreaterThanOrEqual(4);

    const second = await app.inject({
      method: "POST",
      url: "/v1/admin/consultancies/suggest-code",
      headers: { cookie: admin.cookie },
      payload: { name: "Delhi Advisors", avoid: [code1] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().code).not.toBe(code1);
  });

  it("admin can add a manager to a managerless consultancy", async () => {
    const { app, mailer, repos } = await createTestApp();
    const admin = await signUpAndLogin(app, mailer, { email: "boss@example.com" });
    await promote(repos, "boss@example.com", "super_admin");

    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/consultancies",
      headers: { cookie: admin.cookie },
      payload: { name: "Orphan Co", code: "ORPHAN" },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const list = await app.inject({ method: "GET", url: "/v1/admin/consultancies", headers: { cookie: admin.cookie } });
    expect(list.json().consultancies.find((c: { id: string }) => c.id === id)?.hasManager).toBe(false);

    const mgr = await app.inject({
      method: "POST",
      url: `/v1/admin/consultancies/${id}/managers`,
      headers: { cookie: admin.cookie },
      payload: {
        email: "orphan-mgr@nivo.test",
        fullName: "Orphan Manager",
      },
    });
    expect(mgr.statusCode).toBe(201);
    expect(mgr.json().manager.email).toBe("orphan-mgr@nivo.test");
    expect(mgr.json().manager.inviteSent).toBe(true);
    expect(mailer.lastTokenFor("orphan-mgr@nivo.test", "consultancy_invite")).toBeTruthy();
    const managerUser = await repos.users.findByEmail("orphan-mgr@nivo.test");
    expect(managerUser?.passwordSet).toBe(false);

    const list2 = await app.inject({ method: "GET", url: "/v1/admin/consultancies", headers: { cookie: admin.cookie } });
    expect(list2.json().consultancies.find((c: { id: string }) => c.id === id)?.hasManager).toBe(true);
  });

  it("funnel metrics, card CRUD, and copy settings work for super_admin", async () => {
    const { app, mailer, repos } = await createTestApp();
    const student = await signUpAndLogin(app, mailer, { email: "funnel-student@example.com" });
    const admin = await signUpAndLogin(app, mailer, { email: "funnel-admin@example.com" });
    await promote(repos, "funnel-admin@example.com", "super_admin");

    const funnel = await app.inject({
      method: "GET",
      url: "/v1/admin/reports/funnel",
      headers: { cookie: admin.cookie },
    });
    expect(funnel.statusCode).toBe(200);
    expect(funnel.json().registrations).toBeGreaterThanOrEqual(1);
    expect(funnel.json()).toMatchObject({
      paid: expect.any(Number),
      simUnlocked: expect.any(Number),
      accommodationLeads: expect.any(Number),
      pendingProofs: expect.any(Number),
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/cards",
      headers: { cookie: admin.cookie },
      payload: {
        key: "insurance",
        title: "Health Insurance",
        description: "Coming soon card",
        comingSoon: true,
        published: true,
      },
    });
    expect(created.statusCode).toBe(201);

    const unpublished = await app.inject({
      method: "PUT",
      url: "/v1/admin/cards/insurance",
      headers: { cookie: admin.cookie },
      payload: {
        title: "Health Insurance",
        description: "Hidden",
        comingSoon: false,
        published: false,
      },
    });
    expect(unpublished.statusCode).toBe(200);

    const studentCards = await app.inject({
      method: "GET",
      url: "/v1/cards",
      headers: { cookie: student.cookie },
    });
    expect(studentCards.statusCode).toBe(200);
    expect(studentCards.json().cards.some((c: { key: string }) => c.key === "insurance")).toBe(false);

    await app.inject({
      method: "PUT",
      url: "/v1/admin/cards/insurance",
      headers: { cookie: admin.cookie },
      payload: {
        title: "Health Insurance",
        description: "Visible soon",
        comingSoon: true,
        published: true,
      },
    });
    const studentCards2 = await app.inject({
      method: "GET",
      url: "/v1/cards",
      headers: { cookie: student.cookie },
    });
    expect(studentCards2.json().cards.some((c: { key: string; comingSoon: boolean }) => c.key === "insurance" && c.comingSoon)).toBe(
      true,
    );

    const texts = await app.inject({
      method: "PUT",
      url: "/v1/admin/settings/texts",
      headers: { cookie: admin.cookie },
      payload: { texts: { "commission.disclosure": "Custom disclosure text." } },
    });
    expect(texts.statusCode).toBe(204);

    const copy = await app.inject({ method: "GET", url: "/v1/copy", headers: { cookie: student.cookie } });
    expect(copy.statusCode).toBe(200);
    expect(copy.json().texts["commission.disclosure"]).toBe("Custom disclosure text.");
  });

  it("legal publish, terms accept PDF, and re-accept flag on /me", async () => {
    const { app, mailer, repos } = await createTestApp();
    const student = await signUpAndLogin(app, mailer, { email: "legal-student@example.com" });
    const admin = await signUpAndLogin(app, mailer, { email: "legal-admin@example.com" });
    await promote(repos, "legal-admin@example.com", "super_admin");

    const meOk = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: student.cookie } });
    expect(meOk.statusCode).toBe(200);
    expect(meOk.json().termsReacceptRequired).toBe(false);

    const published = await app.inject({
      method: "PUT",
      url: "/v1/admin/legal/publish",
      headers: { cookie: admin.cookie },
      payload: {
        slug: "terms",
        version: "2025-11-draft2",
        title: "Terms of Service",
        body: "Updated provisional terms body for tests.",
      },
    });
    expect(published.statusCode).toBe(200);

    const meStale = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: student.cookie } });
    expect(meStale.json().termsReacceptRequired).toBe(true);

    const accept = await app.inject({
      method: "POST",
      url: "/v1/legal/accept",
      headers: { cookie: student.cookie },
      payload: { slug: "terms", version: "2025-11-draft2" },
    });
    expect(accept.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/v1/legal" });
    const termsDocs = (list.json().documents as { slug: string; version: string }[]).filter((d) => d.slug === "terms");
    expect(termsDocs).toHaveLength(1);
    expect(termsDocs[0]?.version).toBe("2025-11-draft2");

    const meFresh = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: student.cookie } });
    expect(meFresh.json().termsReacceptRequired).toBe(false);

    const docs = await app.inject({ method: "GET", url: "/v1/documents", headers: { cookie: student.cookie } });
    expect(docs.statusCode).toBe(200);
    expect(docs.json().documents.some((d: { kind: string; title: string }) => d.kind === "terms_pdf" && d.title.includes("2025-11-draft2"))).toBe(
      true,
    );

    const impressum = await app.inject({ method: "GET", url: "/v1/legal/impressum" });
    expect(impressum.statusCode).toBe(200);
    expect(impressum.json().slug).toBe("impressum");
  });
});
