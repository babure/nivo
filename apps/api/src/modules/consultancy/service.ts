import { randomUUID } from "node:crypto";
import type { Repositories } from "../../repositories/types.js";

export class ConsultancyService {
  constructor(private repos: Repositories) {}

  async create(name: string, code: string) {
    const id = randomUUID();
    const referralCode = code.toUpperCase();
    await this.repos.consultancies.create({ id, name, referralCode });
    return { id, code: referralCode, link: `/r/${referralCode}` };
  }

  async lookupByCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return { valid: false as const };
    const c = await this.repos.consultancies.findByReferralCode(trimmed);
    if (!c || !c.active || c.deletedAt) return { valid: false as const };
    return { valid: true as const, id: c.id, name: c.name, code: c.referralCode, link: `/r/${c.referralCode}` };
  }

  /** Pseudonymised funnel — never returns passport/address/payment details */
  async dashboard(consultancyId: string) {
    const org = await this.repos.consultancies.findById(consultancyId);
    const students: {
      pseudoId: string;
      displayName: string;
      country: string;
      intake: string;
      stage: string;
      email?: string;
      phone?: string;
    }[] = [];

    const profiles = await this.repos.profiles.listByConsultancy(consultancyId);

    for (const p of profiles) {
      if (!p) continue;
      const user = await this.repos.users.findById(p.userId);
      if (!user || user.role) continue;
      const first = user.fullName.split(/\s+/)[0] ?? "";
      const initial = (user.fullName.split(/\s+/)[1] ?? "").slice(0, 1);
      let stage = "registered";
      if (user.emailVerifiedAt) stage = "verified";
      if (p.paymentStatus === "paid") stage = "paid";
      if (p.identityComplete) stage = "identity_complete";

      students.push({
        pseudoId: user.id.slice(0, 8),
        displayName: `${first} ${initial}.`.trim(),
        country: user.country,
        intake: user.intake,
        stage,
        email: p.shareProgressWithConsultancy ? user.email : undefined,
        phone: p.shareProgressWithConsultancy ? user.phone : undefined,
      });
    }

    return {
      organisation: org
        ? { id: org.id, name: org.name, code: org.referralCode, link: `/r/${org.referralCode}` }
        : null,
      counts: {
        registered: students.length,
        verified: students.filter((s) => s.stage !== "registered").length,
        paid: students.filter((s) => ["paid", "identity_complete"].includes(s.stage)).length,
        identity: students.filter((s) => s.stage === "identity_complete").length,
      },
      students,
    };
  }

  assertTenant(viewerConsultancyId: string, targetConsultancyId: string) {
    if (viewerConsultancyId !== targetConsultancyId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
  }
}
