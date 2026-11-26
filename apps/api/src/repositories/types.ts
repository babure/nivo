import type { CardStatus, EncryptedBlob } from "@nivo/shared";

export type PaymentStatus = "unpaid" | "processing" | "paid" | "failed" | "refunded";

export type UserRecord = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  country: string;
  intake: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  /** staff role key; null for students */
  role: string | null;
  googleSub: string | null;
  avatarUrl: string | null;
  passwordSet: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

export type SessionRecord = {
  /** sha256 of the cookie token */
  id: string;
  userId: string;
  ipHash: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export type TokenPurpose = "verify_email" | "reset_password";

export type AuthTokenRecord = {
  tokenHash: string;
  userId: string;
  purpose: TokenPurpose;
  expiresAt: Date;
  usedAt: Date | null;
};

export type ProfileRecord = {
  userId: string;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  identityComplete: boolean;
  consultancyId: string | null;
  referralCode: string | null;
  shareProgressWithConsultancy: boolean;
};

export type ConsentRecord = {
  id: string;
  userId: string;
  kind: string;
  version: string;
  ipHash: string | null;
  acceptedAt: Date;
};

export type PaymentRecord = {
  id: string;
  userId: string;
  provider: "stripe" | "manual";
  providerRef: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  stripeEventId: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

export type InvoiceRecord = {
  id: string;
  number: string;
  userId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  issuedAt: Date;
};

export type CardDefinition = {
  key: string;
  title: string;
  description: string;
  position: number;
  comingSoon: boolean;
  /** When false, hidden from the student checklist. */
  published: boolean;
};

export type IdentityRecordRow = {
  userId: string;
  payload: EncryptedBlob;
  fullNameMasked: string;
  passportLast3: string;
  updatedAt: Date;
};

export type IdentityFileRecord = {
  id: string;
  userId: string;
  kind: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  /** encrypted file bytes (base64 fields); real deployments store this in object storage */
  blob: EncryptedBlob;
  createdAt: Date;
};

export const LEAD_STATUSES = ["new", "contacted", "viewing", "booked", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadRecord = {
  id: string;
  userId: string;
  city: string;
  budget: string;
  roomType: string;
  notes: string;
  phone: string;
  status: LeadStatus;
  createdAt: Date;
  updatedAt?: Date;
};

export type LeadNoteRecord = {
  id: string;
  leadId: string;
  authorId: string;
  body: string;
  createdAt: Date;
};

export type LegalDocumentRecord = {
  slug: string;
  version: string;
  title: string;
  body: string;
  published: boolean;
  publishedAt: Date | null;
};

export type AuditRecord = {
  seq: number;
  id: string;
  at: Date;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown>;
  prevHash: string;
  hash: string;
};

export class UniqueViolationError extends Error {
  constructor(readonly field: string) {
    super(`unique violation: ${field}`);
    this.name = "UniqueViolationError";
  }
}

export interface UserRepo {
  /** throws UniqueViolationError("email") on duplicate */
  create(user: UserRecord): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByGoogleSub(googleSub: string): Promise<UserRecord | null>;
  /** Drop google_sub on soft-deleted accounts so the same Google user can register again. */
  releaseDeletedGoogleSub(googleSub: string): Promise<void>;
  update(id: string, patch: Partial<Omit<UserRecord, "id">>): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
}

export interface SessionRepo {
  create(session: SessionRecord): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export interface TokenRepo {
  create(token: AuthTokenRecord): Promise<void>;
  /** Atomically marks a valid, unused, unexpired token as used. */
  consume(tokenHash: string, purpose: TokenPurpose, now: Date): Promise<AuthTokenRecord | null>;
}

export interface ProfileRepo {
  get(userId: string): Promise<ProfileRecord | null>;
  upsert(profile: ProfileRecord): Promise<void>;
  patch(userId: string, patch: Partial<Omit<ProfileRecord, "userId">>): Promise<ProfileRecord | null>;
  list(): Promise<ProfileRecord[]>;
  listByConsultancy(consultancyId: string): Promise<ProfileRecord[]>;
}

export interface ConsentRepo {
  add(consent: ConsentRecord): Promise<void>;
  listForUser(userId: string): Promise<ConsentRecord[]>;
}

export interface PaymentRepo {
  /** Insert-if-absent. Returns false when the event id was already seen (duplicate delivery). */
  claimEvent(eventId: string, type: string): Promise<boolean>;
  setEventOutcome(eventId: string, outcome: string): Promise<void>;
  /** Releases a claim so a failed handler can be retried by the provider. */
  releaseEvent(eventId: string): Promise<void>;
  createPayment(payment: PaymentRecord): Promise<void>;
  listForUser(userId: string): Promise<PaymentRecord[]>;
  nextInvoiceNumber(year: number): Promise<string>;
  createInvoice(invoice: InvoiceRecord): Promise<void>;
  listInvoicesForUser(userId: string): Promise<InvoiceRecord[]>;
}

export interface CardRepo {
  listDefinitions(): Promise<CardDefinition[]>;
  upsertDefinition(def: CardDefinition): Promise<CardDefinition>;
  listProgress(userId: string): Promise<{ cardKey: string; status: CardStatus }[]>;
  setProgress(userId: string, cardKey: string, status: CardStatus): Promise<void>;
  addNotifyRequest(userId: string, cardKey: string): Promise<boolean>;
}

export interface IdentityRepo {
  get(userId: string): Promise<IdentityRecordRow | null>;
  save(row: IdentityRecordRow): Promise<void>;
  addFile(file: IdentityFileRecord): Promise<void>;
  listFiles(userId: string): Promise<IdentityFileRecord[]>;
  getFile(id: string): Promise<IdentityFileRecord | null>;
  /** Returns false when the file id does not exist. */
  deleteFile(id: string): Promise<boolean>;
}

export interface AuditRepo {
  last(): Promise<AuditRecord | null>;
  append(entry: Omit<AuditRecord, "seq">): Promise<AuditRecord>;
  all(): Promise<AuditRecord[]>;
}

export interface LeadRepo {
  create(lead: LeadRecord): Promise<void>;
  list(): Promise<LeadRecord[]>;
  listByUser(userId: string): Promise<LeadRecord[]>;
  get(id: string): Promise<LeadRecord | null>;
  updateStatus(id: string, status: LeadStatus, now: Date): Promise<LeadRecord | null>;
  addNote(note: LeadNoteRecord): Promise<void>;
  listNotes(leadId: string): Promise<LeadNoteRecord[]>;
}

export interface LegalRepo {
  list(): Promise<LegalDocumentRecord[]>;
  getPublished(slug: string): Promise<LegalDocumentRecord | null>;
  publish(doc: LegalDocumentRecord): Promise<LegalDocumentRecord>;
}

export interface SettingsRepo {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, updatedBy: string | null): Promise<void>;
}

export interface ClickRepo {
  record(click: { linkKey: string; userId: string | null; ipHash: string | null; at: Date }): Promise<void>;
  countByKey(): Promise<Record<string, number>>;
}

export type ConsultancyRecord = { id: string; name: string; referralCode: string };

export interface ConsultancyRepo {
  create(input: { id: string; name: string; referralCode: string }): Promise<void>;
  list(): Promise<ConsultancyRecord[]>;
  findById(id: string): Promise<ConsultancyRecord | null>;
  findByReferralCode(code: string): Promise<ConsultancyRecord | null>;
  getMembership(userId: string): Promise<{ consultancyId: string; role: string } | null>;
  addMember(userId: string, consultancyId: string, role?: string): Promise<void>;
  hasMembers(consultancyId: string): Promise<boolean>;
  /** students of the consultancy who consented to progress sharing */
  listSharedStudents(consultancyId: string): Promise<string[]>;
}

export interface RequestRepo {
  addDeletionRequest(userId: string, at: Date): Promise<{ id: string; created: boolean }>;
}

export interface Repositories {
  users: UserRepo;
  sessions: SessionRepo;
  tokens: TokenRepo;
  profiles: ProfileRepo;
  consents: ConsentRepo;
  payments: PaymentRepo;
  cards: CardRepo;
  identity: IdentityRepo;
  audit: AuditRepo;
  leads: LeadRepo;
  legal: LegalRepo;
  settings: SettingsRepo;
  clicks: ClickRepo;
  consultancies: ConsultancyRepo;
  requests: RequestRepo;
}
