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

  /** Pseudonymised funnel — never returns passport/address/payment details */
  async dashboard(consultancyId: string) {
    // Memory repo may expose list helpers differently; scan users via profiles.
    const allProfiles: Awaited<ReturnType<Repositories["profiles"]["get"]>>[] = [];
    // In-memory implementation detail: iterate known users through consultancies filter if available
    const students: {
      pseudoId: string;
      displayName: string;
      country: string;
      intake: string;
      stage: string;
      email?: string;
      phone?: string;
    }[] = [];

    // Use repository method if present for listing by consultancy
    const listBy =
      (
        this.repos.profiles as unknown as {
          listByConsultancy?: (id: string) => Promise<
            {
              userId: string;
              paymentStatus: string;
              identityComplete: boolean;
              shareProgressWithConsultancy: boolean;
            }[]
          >;
        }
      ).listByConsultancy;

    let profiles =
      listBy != null
        ? await listBy(consultancyId)
        : allProfiles.filter(Boolean);

    if (!listBy) {
      // Fallback: empty for repos without list helper — tests use create + direct upsert
      profiles = [];
    }

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
      counts: {
        registered: students.length,
        verified: students.filter((s) => s.stage !== "registered").length,
        paid: students.filter((s) =>
          ["paid", "identity_complete"].includes(s.stage),
        ).length,
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
