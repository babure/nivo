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

/** Newest published document per slug. Undated rows lose to any dated publication. */
function currentLegalDocuments(docs: LegalDocumentRecord[], slug?: string): LegalDocumentRecord[] {
  const best = new Map<string, LegalDocumentRecord>();
  for (const doc of docs) {
    if (!doc.published) continue;
    if (slug && doc.slug !== slug) continue;
    const prev = best.get(doc.slug);
    const at = doc.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const prevAt = prev ? (prev.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
    if (!prev || at >= prevAt) best.set(doc.slug, { ...doc });
  }
  return [...best.values()];
}

export const DEFAULT_CARDS: CardDefinition[] = [
  {
    key: "blocked_account",
    title: "Blocked Account",
    description: "Open your German blocked account (Sperrkonto) with Expatrio.",
    position: 1,
    comingSoon: false,
    published: true,
  },
  {
    key: "sim",
    title: "SIM Card",
    description: "Unlocks once the required steps are completed.",
    position: 2,
    comingSoon: false,
    published: true,
  },
  {
    key: "accommodation",
    title: "Accommodation",
    description: "Find verified student housing.",
    position: 3,
    comingSoon: false,
    published: true,
  },
  {
    key: "jobs",
    title: "Job References",
    description: "We are talking to employers and job partners. Job references will appear here soon.",
    position: 4,
    comingSoon: true,
    published: true,
  },
];

const LEGAL_DRAFT_BANNER =
  "DRAFT FOR COUNSEL REVIEW — Placeholder text for product/legal iteration. Replace with counsel-approved German/English versions before go-live. Not legal advice.";

export const DEFAULT_LEGAL: LegalDocumentRecord[] = [
  {
    slug: "terms",
    version: "2025-11-draft1",
    title: "Terms of Service",
    body: `${LEGAL_DRAFT_BANNER}

These Terms of Service (“Terms”) govern access to and use of the NIVO student platform operated by NIVO UG (haftungsbeschränkt), Berlin, Germany (“NIVO”, “we”).

1. Who we are and what we offer
NIVO provides a guided digital dashboard and referral support for international students preparing for studies in Germany. Typical steps include blocked account (Sperrkonto), SIM setup, accommodation introductions, and related checklist items. Partner products and services (for example Expatrio, Fintiba, Vodafone, or housing partners) are offered by those third parties. When you follow a partner link you leave NIVO and contract directly with that partner.

2. Eligibility and account
You must be at least 18 years old and able to enter a binding contract. You agree to provide accurate registration details (including passport name), keep login credentials confidential, and notify us of unauthorised use. We may suspend accounts that appear abusive or fraudulent.

3. NIVO service fee
Access to paid areas of the platform requires payment of the one-time NIVO service fee shown at checkout (currently €149 unless updated). Partner prices, deposits, insurance premiums, rent, and similar costs are charged by partners under their own terms and are not included in the NIVO fee.

4. Digital service and immediate start
Checkout may ask you to acknowledge that the digital service begins immediately. Where you request immediate performance, your statutory right of withdrawal may be limited for the portion already performed, to the extent permitted by applicable law. See the Right of Withdrawal document for details.

5. Acceptable use
You must not misuse the platform, attempt unauthorised access, interfere with security, upload unlawful or infringing content, or use NIVO to harm others. We may remove content and restrict access where reasonably necessary.

6. Partner relationships and commissions
NIVO may receive a commission or referral fee from partners. This does not increase the price you pay the partner for their product. NIVO does not control partner availability, onboarding decisions, or contract performance.

7. No immigration, legal, or tax advice
NIVO does not provide legal, tax, visa, or immigration advice. University admission, visa, and residence decisions remain with the competent authorities and institutions.

8. Liability
To the extent permitted by law, NIVO is not liable for partner performance, visa or university outcomes, or damages arising from incorrect information you provide. Mandatory consumer rights and liability for intent or gross negligence remain unaffected.

9. Changes
We may update these Terms. Material changes may require re-acceptance before you continue using the service.

10. Contact
Questions: hello@nivo.example (replace with production support channel).`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
  },
  {
    slug: "privacy",
    version: "2025-11-draft1",
    title: "Privacy Policy",
    body: `${LEGAL_DRAFT_BANNER}

This Privacy Policy explains how NIVO UG (haftungsbeschränkt) (“NIVO”, “we”) processes personal data under the EU General Data Protection Regulation (GDPR) and applicable German law.

1. Controller
Controller: NIVO UG (haftungsbeschränkt), Berlin, Germany.
Contact: hello@nivo.example (privacy inbox to be confirmed).

2. Categories of data
Account and profile data (name, email, phone, country, intake); authentication and security logs; payment status and invoice metadata; encrypted identity fields and uploaded identity/proof files; checklist/card progress; accommodation enquiry details; cookie/consent records; referral/consultancy attribution where applicable.

3. Purposes and legal bases
- Provide and secure the platform and account (Art. 6(1)(b) GDPR — contract; Art. 6(1)(f) — security).
- Process the service fee and issue invoices (Art. 6(1)(b); legal obligations Art. 6(1)(c) where applicable).
- Identity verification and document storage for the student path (Art. 6(1)(b) and/or consent Art. 6(1)(a) as confirmed with counsel).
- Accommodation lead handling and partner introductions (Art. 6(1)(b)/(f)).
- Optional progress sharing with a consultancy (consent Art. 6(1)(a)).
- Non-essential cookies only after consent (Art. 6(1)(a)).

4. Recipients
Processors (hosting, email, payment provider such as Stripe, storage) under contracts; partners only when you choose to engage them; accommodation agents for leads you submit; authorities where legally required.

5. Transfers
If data is transferred outside the EEA, we use appropriate safeguards (e.g. SCCs) as applicable.

6. Retention
We retain data only as long as needed for the service and legal obligations. Identity materials follow product retention rules (including a hard cap); invoice records may be kept longer where tax law requires. Exact schedules will be confirmed with counsel.

7. Your rights
Access, rectification, erasure, restriction, portability, and objection where applicable; withdraw consent without affecting prior lawful processing; lodge a complaint with a supervisory authority (e.g. Berliner Beauftragte für Datenschutz).

8. Children
The service is intended for adults (18+).`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
  },
  {
    slug: "refund",
    version: "2025-11-draft1",
    title: "Right of Withdrawal / Refunds",
    body: `${LEGAL_DRAFT_BANNER}

Right of withdrawal (consumers in the EU/EEA)

For distance contracts, consumers generally have a 14-day right of withdrawal without giving reasons.

Digital services and immediate performance
At checkout you may be asked to expressly request that we start the digital service immediately and to acknowledge that you may lose the right of withdrawal for services already performed once performance has begun, to the extent permitted by law (see Directive 2011/83/EU implementation in Germany).

How to withdraw
Contact us within the withdrawal period using the contact details in the Impressum / support channel. A clear statement is sufficient. Model withdrawal form text can be provided by counsel.

Refunds after activation
Where withdrawal no longer applies or has been waived for performed digital services, refund requests are assessed case-by-case under our internal refund policy by NIVO admin staff. Statutory rights remain unaffected.

Partner fees
Blocked account deposits, insurance premiums, SIM fees, rent, and similar partner charges are outside the NIVO service fee and follow the partner’s own withdrawal and refund terms.`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
  },
  {
    slug: "cookies",
    version: "2025-11-draft1",
    title: "Cookie Policy",
    body: `${LEGAL_DRAFT_BANNER}

This Cookie Policy explains how NIVO uses cookies and similar technologies on the website and student platform.

1. Essential cookies
We use essential cookies/storage required for authentication (session), security (e.g. CSRF), and remembering essential preferences. These are necessary for the service to function and cannot be switched off in our systems.

2. Non-essential cookies
Analytics, marketing, or similar non-essential technologies — if introduced — are only set after you choose Accept all (or equivalent) in the cookie banner. Reject non-essential keeps essential cookies only.

3. Managing choices
Use Cookie settings in the footer to revisit your choice. You can also clear cookies in your browser; clearing session cookies will sign you out.

4. More information
See our Privacy Policy for broader processing details.`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
  },
  {
    slug: "impressum",
    version: "2025-11-draft1",
    title: "Impressum",
    body: `${LEGAL_DRAFT_BANNER}

Information according to § 5 TMG / § 18 MStV (placeholders)

NIVO UG (haftungsbeschränkt)
[Street address — to be inserted]
[PLZ] Berlin
Germany

Represented by the managing director(s): [Names — to be inserted]

Contact
Email: hello@nivo.example
Phone: [to be inserted]

Register entry
Register court: [Amtsgericht — to be inserted]
Commercial register number: [HRB — to be inserted]

VAT ID
Umsatzsteuer-Identifikationsnummer according to § 27a UStG: [to be inserted if applicable]

Responsible for editorial content (§ 18 Abs. 2 MStV): [Name, address — to be inserted]

Dispute resolution
The European Commission provides a platform for online dispute resolution (OS): https://ec.europa.eu/consumers/odr/
We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board unless required by law.`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
  },
  {
    slug: "our_role",
    version: "2025-11-draft1",
    title: "Our Role",
    body: `${LEGAL_DRAFT_BANNER}

What NIVO does
NIVO is a referral and support platform for international students preparing for Germany. We provide a guided checklist, document storage for your arrival path, and introductions to partners for steps such as blocked accounts (e.g. Expatrio), health insurance (e.g. Fintiba), SIM setup, and accommodation enquiries.

What NIVO does not do
We do not sell partner products ourselves as the contracting provider for those products. We do not provide legal, tax, or immigration advice. We do not guarantee visa, university, or housing outcomes.

Partner contracts and commissions
When you open a partner link or submit a housing enquiry, you interact with that partner (or accommodation agent) under their terms. NIVO may receive a commission from partners; this does not increase the price you pay the partner.

Your contract with NIVO
Your contract with NIVO covers access to the platform and related digital services against the NIVO service fee described in the Terms.`,
    published: true,
    publishedAt: new Date("2025-11-01T00:00:00Z"),
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
  private consultancyList: {
    id: string;
    name: string;
    referralCode: string;
    active: boolean;
    deletedAt: Date | null;
  }[] = [];
  private memberships = new Map<string, { consultancyId: string; role: string }>();
  readonly cardDefs: CardDefinition[];
  legalDocs: LegalDocumentRecord[];

  constructor(opts: { cards?: CardDefinition[]; legal?: LegalDocumentRecord[] } = {}) {
    this.cardDefs = (opts.cards ?? DEFAULT_CARDS).map((c) => ({ ...c, published: c.published !== false }));
    this.legalDocs = [...(opts.legal ?? DEFAULT_LEGAL)];
    this.settingMap.set("partner_links", {
      expatrio: "https://www.expatrio.com/?p=nivoug",
      fintiba: "http://partner.fintiba.com/nivoug",
      vodafone: "https://example.com/vodafone",
    });
    this.settingMap.set("roshan.email", "roshan@example.com");
    this.settingMap.set("accommodation.notify_email", "roshan@example.com");
  }

  /** Test / seed helpers (not part of the Repositories contract). */
  seedConsultancy(
    name: string,
    referralCode: string,
    memberUserId?: string,
    opts: { id?: string; memberRole?: string } = {},
  ): string {
    const id = opts.id ?? randomUUID();
    this.consultancyList.push({ id, name, referralCode, active: true, deletedAt: null });
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
    findByGoogleSub: async (googleSub) => {
      for (const u of this.usersById.values()) {
        if (u.googleSub === googleSub && !u.deletedAt) return { ...u };
      }
      return null;
    },
    releaseDeletedGoogleSub: async (googleSub) => {
      for (const u of this.usersById.values()) {
        if (u.googleSub === googleSub && u.deletedAt) {
          this.usersById.set(u.id, { ...u, googleSub: null });
        }
      }
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
    listDefinitions: async () => this.cardDefs.map((c) => ({ ...c, published: c.published !== false })),
    upsertDefinition: async (def) => {
      const next: CardDefinition = { ...def, published: def.published !== false };
      const i = this.cardDefs.findIndex((c) => c.key === next.key);
      if (i >= 0) this.cardDefs[i] = next;
      else this.cardDefs.push(next);
      return { ...next };
    },
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
    deleteFile: async (id) => this.files.delete(id),
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
    listByUser: async (userId) =>
      [...this.leadMap.values()].filter((l) => l.userId === userId).map((l) => ({ ...l })),
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
    list: async () => currentLegalDocuments(this.legalDocs),
    getPublished: async (slug) => currentLegalDocuments(this.legalDocs, slug)[0] ?? null,
    publish: async (doc) => {
      this.legalDocs.push({ ...doc });
      return { ...doc };
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
      this.consultancyList.push({
        id: input.id,
        name: input.name,
        referralCode: input.referralCode,
        active: input.active ?? true,
        deletedAt: null,
      });
    },
    list: async () =>
      this.consultancyList.filter((c) => !c.deletedAt).map((c) => ({ ...c })),
    findById: async (id) => {
      const c = this.consultancyList.find((x) => x.id === id && !x.deletedAt);
      return c ? { ...c } : null;
    },
    findByReferralCode: async (code) => {
      const c = this.consultancyList.find(
        (x) => !x.deletedAt && x.referralCode.toUpperCase() === code.toUpperCase(),
      );
      return c ? { ...c } : null;
    },
    setActive: async (id, active) => {
      const idx = this.consultancyList.findIndex((x) => x.id === id && !x.deletedAt);
      if (idx < 0) return null;
      this.consultancyList[idx] = { ...this.consultancyList[idx]!, active };
      return { ...this.consultancyList[idx]! };
    },
    softDelete: async (id, at) => {
      const idx = this.consultancyList.findIndex((x) => x.id === id && !x.deletedAt);
      if (idx < 0) return null;
      this.consultancyList[idx] = { ...this.consultancyList[idx]!, active: false, deletedAt: at };
      return { ...this.consultancyList[idx]! };
    },
    getMembership: async (userId) => this.memberships.get(userId) ?? null,
    addMember: async (userId, consultancyId, role = "owner") => {
      this.memberships.set(userId, { consultancyId, role });
    },
    listMembers: async (consultancyId) =>
      [...this.memberships.entries()]
        .filter(([, m]) => m.consultancyId === consultancyId)
        .map(([userId, m]) => ({ userId, role: m.role })),
    hasMembers: async (consultancyId) =>
      [...this.memberships.values()].some((m) => m.consultancyId === consultancyId),
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
