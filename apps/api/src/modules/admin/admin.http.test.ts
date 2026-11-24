import { describe, expect, it } from "vitest";
import { cookieFrom, createTestApp, signUpAndLogin } from "../../test/app-harness.js";

async function promote(
  repos: Awaited<ReturnType<typeof createTestApp>>["repos"],
  email: string,
  role: string,
) {
  const u = (await repos.users.findByEmail(email))!;
  await repos.users.update(u.id, { role });
}

describe("admin routes + permissions middleware", () => {
  it("requires authentication", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/v1/admin/students" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids students and roles lacking the permission, and audits the denial", async () => {
    const { app, mailer, repos } = await createTestApp();
    const student = await signUpAndLogin(app, mailer);
    const denied = await app.inject({
      method: "GET",
      url: "/v1/admin/students",
      headers: { cookie: student.cookie },
    });
    expect(denied.statusCode).toBe(403);

    // support can read students but not mark paid
    const staff = await signUpAndLogin(app, mailer, { email: "support@example.com" });
    await promote(repos, "support@example.com", "support");
    const list = await app.inject({ method: "GET", url: "/v1/admin/students", headers: { cookie: staff.cookie } });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("passwordHash");

    const target = (await repos.users.findByEmail("ada@example.com"))!;
    const mark = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: staff.cookie },
      payload: { reason: "manual bank transfer received" },
    });
    expect(mark.statusCode).toBe(403);
    const audit = await repos.audit.all();
    expect(audit.some((a) => a.action === "admin.permission_denied")).toBe(true);
  });

  it("finance queues mark-paid for approval; second approver executes; audit chain verifies", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const fin = await signUpAndLogin(app, mailer, { email: "fin@example.com" });
    await promote(repos, "fin@example.com", "finance");
    const ops = await signUpAndLogin(app, mailer, { email: "ops2@example.com" });
    await promote(repos, "ops2@example.com", "operations_approver");
    const target = (await repos.users.findByEmail("ada@example.com"))!;

    const bad = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: fin.cookie },
      payload: { reason: "manual bank transfer received", extra: 1 },
    });
    expect(bad.statusCode).toBe(400);

    const queued = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: fin.cookie },
      payload: { reason: "manual bank transfer received" },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json().status).toBe("pending_approval");
    expect((await repos.profiles.get(target.id))?.paymentStatus).toBe("unpaid");

    const approvalId = queued.json().approvalId as string;
    const decided = await app.inject({
      method: "POST",
      url: `/v1/admin/approvals/${approvalId}/decide`,
      headers: { cookie: ops.cookie },
      payload: { decision: "approved" },
    });
    expect(decided.statusCode).toBe(200);
    expect((await repos.profiles.get(target.id))?.paymentStatus).toBe("paid");

    const audit = await app.inject({ method: "GET", url: "/v1/admin/audit", headers: { cookie: fin.cookie } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().chain.valid).toBe(true);
    expect(audit.json().entries.some((e: { action: string }) => e.action === "payments.manual_mark_paid")).toBe(true);
  });

  it("super_admin marks paid immediately without approval", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const admin = await signUpAndLogin(app, mailer, { email: "root-paid@example.com" });
    await promote(repos, "root-paid@example.com", "super_admin");
    const target = (await repos.users.findByEmail("ada@example.com"))!;
    const ok = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/mark-paid`,
      headers: { cookie: admin.cookie },
      payload: { reason: "super admin override paid" },
    });
    expect(ok.statusCode).toBe(204);
    expect((await repos.profiles.get(target.id))?.paymentStatus).toBe("paid");
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

  it("identity reveal needs identity:reveal and a reason", async () => {
    const { app, mailer, repos } = await createTestApp();
    await signUpAndLogin(app, mailer);
    const ops = await signUpAndLogin(app, mailer, { email: "ops@example.com" });
    await promote(repos, "ops@example.com", "operations_approver");
    const target = (await repos.users.findByEmail("ada@example.com"))!;
    const res = await app.inject({
      method: "POST",
      url: `/v1/admin/students/${target.id}/identity/reveal`,
      headers: { cookie: ops.cookie },
      payload: { reason: "verifying passport for blocked account" },
    });
    expect(res.statusCode).toBe(403); // operations_approver only has identity:view_masked
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

  it("partner redirect only to https links configured by an editor", async () => {
    const { app, mailer, repos } = await createTestApp();
    const editor = await signUpAndLogin(app, mailer, { email: "ed@example.com" });
    await promote(repos, "ed@example.com", "content_legal_editor");

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
    expect(c).not.toBeNull();
  });
});
