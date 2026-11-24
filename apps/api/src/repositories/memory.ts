import { randomUUID } from "node:crypto";
import type { CardStatus } from "@nivo/shared";
import {
  UniqueViolationError,
  type AuditRecord,
  type AuthTokenRecord,
  type CardDefinition,
  type ConsentRecord,
  type IdentityFileRecord,
  type IdentityRecordRow,
  type InvoiceRecord,
  type LeadNoteRecord,
  type LeadRecord,
  type LegalDocumentRecord,
  type PaymentRecord,
  type ProfileRecord,
  type Repositories,
  type SessionRecord,
  type UserRecord,
} from "./types.js";

export const DEFAULT_CARDS: CardDefinition[] = [
  {
    key: "blocked_account",
    title: "Blocked Account",
    description: "Open your German blocked account (Sperrkonto).",
    position: 1,
    comingSoon: false,
  },
  {
    key: "sim",
    title: "SIM Card",
    description: "Unlocks once the required steps are completed.",
    position: 2,
    comingSoon: false,
  },
  {
    key: "accommodation",
    title: "Accommodation",
    description: "Find verified student housing.",
    position: 3,
    comingSoon: false,
  },
  {
    key: "jobs",
    title: "Job References",
    description: "We are talking to employers and job partners. Job references will appear here soon.",
    position: 4,
    comingSoon: true,
  },
];

export const DEFAULT_LEGAL: LegalDocumentRecord[] = [
  {
    slug: "terms",
    version: "2025-01",
    title: "Terms of Service",
    body: `These Terms govern your use of the NIVO student platform operated by NIVO UG (Berlin).

1. Service
NIVO provides a digital dashboard and referral support for steps such as blocked account, SIM, and accommodation introductions. Partner products are contracted separately with those providers.

2. Fee
The one-time NIVO service fee unlocks the paid areas of the platform. Partner prices are charged by partners.

3. Account
You must provide accurate information, keep credentials secure, and be of legal age to contract.

4. Acceptable use
Do not misuse the platform, attempt unauthorised access, or upload unlawful content.

5. Liability
NIVO is not liable for partner performance, visa outcomes, or university decisions. Statutory rights remain unaffected.

6. Changes
We may update these Terms; material changes may require re-acceptance.

Draft for counsel review.`,
    published: true,
    publishedAt: new Date("2025-01-01T00:00:00Z"),
  },
  {
    slug: "privacy",
    version: "2025-01",
    title: "Privacy Policy",
    body: `This Privacy Policy explains how NIVO UG processes personal data under the GDPR.

Controller: NIVO UG, Berlin. Contact: hello@nivo.example

Data we process: account details, payment status, encrypted identity fields, card progress, accommodation leads, and technical logs.

Purposes: provide the service, payments, fraud prevention, support, and (with consent) consultancy progress sharing.

Legal bases: contract (Art. 6(1)(b)), legitimate interests (Art. 6(1)(f)), and consent where required (Art. 6(1)(a)).

Retention: identity and files are retained only as long as needed for the service and legal obligations; exact periods pending counsel confirmation.

Rights: access, rectification, erasure, restriction, portability, and objection. You may lodge a complaint with a supervisory authority.

Draft for counsel review.`,
    published: true,
    publishedAt: new Date("2025-01-01T00:00:00Z"),
  },
  {
    slug: "refund",
    version: "2025-01",
    title: "Right of Withdrawal / Refunds",
    body: `Consumers in the EU generally have a 14-day right of withdrawal for distance contracts.

If you ask us to start the service immediately (checkbox at checkout), you may lose part or all of the withdrawal right for the digital service already performed, to the extent permitted by law.

Refund requests after activation are handled case-by-case under our refund policy and maker-checker admin controls.

Partner fees (blocked account, SIM, rent) are outside NIVO’s fee and follow the partner’s terms.

Draft for counsel review.`,
    published: true,
    publishedAt: new Date("2025-01-01T00:00:00Z"),
  },
  {
    slug: "cookies",
    version: "2025-01",
    title: "Cookie Policy",
    body: `NIVO uses essential cookies for authentication (session) and security. These are required for the service to function.

Optional analytics or marketing cookies are only set after consent via the cookie banner, where enabled.

You can clear cookies in your browser; doing so will sign you out.

Draft for counsel review.`,
    published: true,
    publishedAt: new Date("2025-01-01T00:00:00Z"),
  },
];

/** In-memory repositories: used by unit tests and local dev without Postgres. */
export class InMemoryRepositories implements Repositories {
  private usersById = new Map<string, UserRecord>();
  private sessionsById = new Map<string, SessionRecord>();
  private tokenMap = new Map<string, AuthTokenRecord>();
  private profileMap = new Map<string, ProfileRecord>();
  private consentList: ConsentRecord[] = [];
  private paymentList: PaymentRecord[] = [];
  private events = new Map<string, { type: string; outcome: string | null }>();
  private invoiceList: InvoiceRecord[] = [];
  private invoiceSeq = new Map<number, number>();
  private progress = new Map<string, CardStatus>(); // `${userId}:${cardKey}`
  private notify = new Set<string>();
  private identityRows = new Map<string, IdentityRecordRow>();
  private files = new Map<string, IdentityFileRecord>();
  private auditRows: AuditRecord[] = [];
  private leadMap = new Map<string, LeadRecord>();
  private noteList: LeadNoteRecord[] = [];
  private settingMap = new Map<string, unknown>();
  private clickList: { linkKey: string }[] = [];
  private deletionRequests = new Map<string, string>();
  private consultancyList: { id: string; name: string; referralCode: string }[] = [];
  private memberships = new Map<string, { consultancyId: string; role: string }>();
  readonly cardDefs: CardDefinition[];
  readonly legalDocs: LegalDocumentRecord[];

  constructor(opts: { cards?: CardDefinition[]; legal?: LegalDocumentRecord[] } = {}) {
    this.cardDefs = opts.cards ?? DEFAULT_CARDS;
    this.legalDocs = opts.legal ?? DEFAULT_LEGAL;
    this.settingMap.set("partner_links", {
      expatrio: "https://example.com/expatrio",
      vodafone: "https://example.com/vodafone",
      swarajya: "https://example.com/swarajya",
    });
    this.settingMap.set("roshan.email", "roshan@example.com");
  }

  /** Test / seed helpers (not part of the Repositories contract). */
  seedConsultancy(
    name: string,
    referralCode: string,
    memberUserId?: string,
    opts: { id?: string; memberRole?: string } = {},
  ): string {
    const id = opts.id ?? randomUUID();
    this.consultancyList.push({ id, name, referralCode });
    if (memberUserId) {
      this.memberships.set(memberUserId, {
        consultancyId: id,
        role: opts.memberRole ?? "member",
      });
    }
    return id;
  }

  seedMembership(userId: string, consultancyId: string, role = "member"): void {
    this.memberships.set(userId, { consultancyId, role });
  }

  users: Repositories["users"] = {
    create: async (user) => {
      for (const u of this.usersById.values()) {
        if (u.email === user.email) throw new UniqueViolationError("email");
      }
      this.usersById.set(user.id, { ...user });
      return { ...user };
    },
    findByEmail: async (email) => {
      for (const u of this.usersById.values()) {
        if (u.email === email && !u.deletedAt) return { ...u };
      }
      return null;
    },
    findById: async (id) => {
      const u = this.usersById.get(id);
      return u && !u.deletedAt ? { ...u } : null;
    },
    update: async (id, patch) => {
      const u = this.usersById.get(id);
      if (!u) return null;
      const next = { ...u, ...patch };
      this.usersById.set(id, next);
      return { ...next };
    },
    list: async () => [...this.usersById.values()].filter((u) => !u.deletedAt).map((u) => ({ ...u })),
  };

  sessions: Repositories["sessions"] = {
    create: async (s) => void this.sessionsById.set(s.id, { ...s }),
    findById: async (id) => {
      const s = this.sessionsById.get(id);
      return s ? { ...s } : null;
    },
    delete: async (id) => void this.sessionsById.delete(id),
    deleteAllForUser: async (userId) => {
      for (const [k, s] of this.sessionsById) if (s.userId === userId) this.sessionsById.delete(k);
    },
  };

  tokens: Repositories["tokens"] = {
    create: async (t) => void this.tokenMap.set(t.tokenHash, { ...t }),
    consume: async (hash, purpose, now) => {
      const t = this.tokenMap.get(hash);
      if (!t || t.purpose !== purpose || t.usedAt || t.expiresAt <= now) return null;
      // single-threaded JS: check+set is atomic here
      t.usedAt = now;
      return { ...t };
    },
  };

  profiles: Repositories["profiles"] = {
    get: async (userId) => {
      const p = this.profileMap.get(userId);
      return p ? { ...p } : null;
    },
    upsert: async (p) => void this.profileMap.set(p.userId, { ...p }),
    patch: async (userId, patch) => {
      const p = this.profileMap.get(userId);
      if (!p) return null;
      const next = { ...p, ...patch };
      this.profileMap.set(userId, next);
      return { ...next };
    },
    list: async () => [...this.profileMap.values()].map((p) => ({ ...p })),
    listByConsultancy: async (consultancyId) =>
      [...this.profileMap.values()]
        .filter((p) => p.consultancyId === consultancyId)
        .map((p) => ({ ...p })),
  };

  consents: Repositories["consents"] = {
    add: async (c) => void this.consentList.push({ ...c }),
    listForUser: async (userId) => this.consentList.filter((c) => c.userId === userId).map((c) => ({ ...c })),
  };

  payments: Repositories["payments"] = {
    claimEvent: async (eventId, type) => {
      if (this.events.has(eventId)) return false;
      this.events.set(eventId, { type, outcome: null });
      return true;
    },
    setEventOutcome: async (eventId, outcome) => {
      const e = this.events.get(eventId);
      if (e) e.outcome = outcome;
    },
    releaseEvent: async (eventId) => void this.events.delete(eventId),
    createPayment: async (p) => void this.paymentList.push({ ...p }),
    listForUser: async (userId) => this.paymentList.filter((p) => p.userId === userId).map((p) => ({ ...p })),
    nextInvoiceNumber: async (year) => {
      const n = (this.invoiceSeq.get(year) ?? 0) + 1;
      this.invoiceSeq.set(year, n);
      return `NIVO-${year}-${String(n).padStart(6, "0")}`;
    },
    createInvoice: async (i) => void this.invoiceList.push({ ...i }),
    listInvoicesForUser: async (userId) => this.invoiceList.filter((i) => i.userId === userId).map((i) => ({ ...i })),
  };

  cards: Repositories["cards"] = {
    listDefinitions: async () => this.cardDefs.map((c) => ({ ...c })),
    listProgress: async (userId) => {
      const out: { cardKey: string; status: CardStatus }[] = [];
      for (const [k, status] of this.progress) {
        const [uid, cardKey] = k.split(":");
        if (uid === userId) out.push({ cardKey: cardKey!, status });
      }
      return out;
    },
    setProgress: async (userId, cardKey, status) => void this.progress.set(`${userId}:${cardKey}`, status),
    addNotifyRequest: async (userId, cardKey) => {
      const k = `${userId}:${cardKey}`;
      if (this.notify.has(k)) return false;
      this.notify.add(k);
      return true;
    },
  };

  identity: Repositories["identity"] = {
    get: async (userId) => {
      const r = this.identityRows.get(userId);
      return r ? { ...r } : null;
    },
    save: async (row) => void this.identityRows.set(row.userId, { ...row }),
    addFile: async (f) => void this.files.set(f.id, { ...f }),
    listFiles: async (userId) => [...this.files.values()].filter((f) => f.userId === userId),
    getFile: async (id) => this.files.get(id) ?? null,
  };

  audit: Repositories["audit"] = {
    last: async () => this.auditRows[this.auditRows.length - 1] ?? null,
    append: async (entry) => {
      const rec: AuditRecord = { ...entry, seq: this.auditRows.length + 1 };
      this.auditRows.push(rec);
      return { ...rec };
    },
    all: async () => this.auditRows.map((r) => ({ ...r })),
  };

  /** Test hook: simulate tampering with the stored audit log. */
  tamperAudit(index: number, patch: Partial<AuditRecord>): void {
    const row = this.auditRows[index];
    if (row) this.auditRows[index] = { ...row, ...patch };
  }

  leads: Repositories["leads"] = {
    create: async (l) => void this.leadMap.set(l.id, { ...l }),
    list: async () => [...this.leadMap.values()].map((l) => ({ ...l })),
    get: async (id) => {
      const l = this.leadMap.get(id);
      return l ? { ...l } : null;
    },
    updateStatus: async (id, status, now) => {
      const l = this.leadMap.get(id);
      if (!l) return null;
      const next = { ...l, status, updatedAt: now };
      this.leadMap.set(id, next);
      return { ...next };
    },
    addNote: async (n) => void this.noteList.push({ ...n }),
    listNotes: async (leadId) => this.noteList.filter((n) => n.leadId === leadId).map((n) => ({ ...n })),
  };

  legal: Repositories["legal"] = {
    list: async () => this.legalDocs.filter((d) => d.published).map((d) => ({ ...d })),
    getPublished: async (slug) => {
      const docs = this.legalDocs
        .filter((d) => d.slug === slug && d.published)
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
      return docs[0] ? { ...docs[0] } : null;
    },
  };

  settings: Repositories["settings"] = {
    get: async <T>(key: string) => (this.settingMap.has(key) ? (this.settingMap.get(key) as T) : null),
    set: async (key, value) => void this.settingMap.set(key, value),
  };

  clicks: Repositories["clicks"] = {
    record: async (c) => void this.clickList.push({ linkKey: c.linkKey }),
    countByKey: async () => {
      const out: Record<string, number> = {};
      for (const c of this.clickList) out[c.linkKey] = (out[c.linkKey] ?? 0) + 1;
      return out;
    },
  };

  consultancies: Repositories["consultancies"] = {
    create: async (input) => {
      this.consultancyList.push({ ...input });
    },
    findByReferralCode: async (code) => {
      const c = this.consultancyList.find((x) => x.referralCode.toUpperCase() === code.toUpperCase());
      return c ? { id: c.id, name: c.name } : null;
    },
    getMembership: async (userId) => this.memberships.get(userId) ?? null,
    listSharedStudents: async (consultancyId) =>
      [...this.profileMap.values()]
        .filter((p) => p.consultancyId === consultancyId && p.shareProgressWithConsultancy)
        .map((p) => p.userId),
  };

  requests: Repositories["requests"] = {
    addDeletionRequest: async (userId) => {
      const existing = this.deletionRequests.get(userId);
      if (existing) return { id: existing, created: false };
      const id = randomUUID();
      this.deletionRequests.set(userId, id);
      return { id, created: true };
    },
  };
}
