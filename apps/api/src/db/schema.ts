import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
// NOTE: no runtime imports from @nivo/shared here — drizzle-kit loads this file as CJS.

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** AES-256-GCM blob produced by @nivo/shared encryptField. */
export type EncryptedBlobJson = { keyId: string; iv: string; tag: string; ciphertext: string };

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "processing",
  "paid",
  "failed",
  "refunded",
]);
// keep in sync with CARD_STATUSES in @nivo/shared
export const cardStatusEnum = pgEnum("card_status", [
  "locked",
  "available",
  "in_progress",
  "completed",
  "coming_soon",
]);
export const tokenPurposeEnum = pgEnum("auth_token_purpose", ["verify_email", "reset_password"]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "voucher_sent",
  "closed",
  "lost",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const proofStatusEnum = pgEnum("proof_status", ["pending", "approved", "rejected"]);
export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "processing",
  "completed",
  "rejected",
]);

// ───────────────────────────── identity & access ─────────────────────────────

export const consultancies = pgTable("consultancies", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  referralCode: varchar("referral_code", { length: 32 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 254 }).notNull(),
    fullName: varchar("full_name", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    country: varchar("country", { length: 56 }).notNull(),
    intake: varchar("intake", { length: 40 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** staff role key (see DEFAULT_ROLES in @nivo/shared); null for students */
    role: varchar("role", { length: 64 }),
    totpSecret: jsonb("totp_secret").$type<EncryptedBlobJson>(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: varchar("user_agent", { length: 256 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId)],
);

export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  identityComplete: boolean("identity_complete").notNull().default(false),
  consultancyId: uuid("consultancy_id").references(() => consultancies.id),
  referralCode: varchar("referral_code", { length: 32 }),
  shareProgressWithConsultancy: boolean("share_progress_with_consultancy").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(), // terms | privacy | identity | consultancy_share
    version: varchar("version", { length: 40 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

// ─────────────────────────── roles / permissions stubs ───────────────────────────

export const roles = pgTable("roles", {
  key: varchar("key", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  system: boolean("system").notNull().default(true),
});

export const permissions = pgTable("permissions", {
  key: varchar("key", { length: 80 }).primaryKey(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleKey: varchar("role_key", { length: 64 }).notNull().references(() => roles.key, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 80 }).notNull().references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleKey, t.permissionKey] })],
);

// ───────────────────────────────── payments ─────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    provider: varchar("provider", { length: 20 }).notNull().default("stripe"),
    providerRef: varchar("provider_ref", { length: 120 }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: paymentStatusEnum("status").notNull(),
    stripeEventId: varchar("stripe_event_id", { length: 120 }),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("payments_user_idx").on(t.userId)],
);

/** Idempotency ledger: one row per Stripe event id. PK collision == duplicate delivery. */
export const paymentEvents = pgTable("payment_events", {
  eventId: varchar("event_id", { length: 120 }).primaryKey(),
  type: varchar("type", { length: 80 }).notNull(),
  outcome: varchar("outcome", { length: 40 }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  number: varchar("number", { length: 32 }).notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────── cards ───────────────────────────────────

export const cards = pgTable("cards", {
  key: varchar("key", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  comingSoon: boolean("coming_soon").notNull().default(false),
  published: boolean("published").notNull().default(true),
});

export const cardProgress = pgTable(
  "card_progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cardKey: varchar("card_key", { length: 64 }).notNull().references(() => cards.key),
    status: cardStatusEnum("status").notNull().default("locked"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardKey] })],
);

export const simUnlockRules = pgTable("sim_unlock_rules", {
  id: id(),
  requiredCardKeys: jsonb("required_card_keys").$type<string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

// ───────────────────────────── identity & documents ─────────────────────────────

export const identityRecords = pgTable("identity_records", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** encrypted JSON of the full identity form */
  payload: jsonb("payload").$type<EncryptedBlobJson>().notNull(),
  fullNameMasked: varchar("full_name_masked", { length: 120 }),
  passportLast3: varchar("passport_last3", { length: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const identityFiles = pgTable(
  "identity_files",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    mime: varchar("mime", { length: 80 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    storageKey: varchar("storage_key", { length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("identity_files_user_idx").on(t.userId)],
);

export const proofs = pgTable("proofs", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardKey: varchar("card_key", { length: 64 }).notNull(),
  fileId: uuid("file_id").references(() => identityFiles.id),
  status: proofStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const documents = pgTable("documents", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(), // voucher | invoice_pdf | ...
  title: varchar("title", { length: 200 }).notNull(),
  storageKey: varchar("storage_key", { length: 200 }).notNull(),
  createdAt: createdAt(),
});

// ───────────────────────── marketing / partners / leads ─────────────────────────

export const linkClicks = pgTable(
  "link_clicks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    linkKey: varchar("link_key", { length: 64 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipHash: varchar("ip_hash", { length: 64 }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("link_clicks_key_idx").on(t.linkKey)],
);

export const accommodationLeads = pgTable("accommodation_leads", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  city: varchar("city", { length: 80 }).notNull(),
  budget: varchar("budget", { length: 40 }).notNull(),
  roomType: varchar("room_type", { length: 40 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  notes: text("notes").notNull().default(""),
  status: leadStatusEnum("status").notNull().default("new"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const leadNotes = pgTable("lead_notes", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => accommodationLeads.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const consultancyUsers = pgTable(
  "consultancy_users",
  {
    consultancyId: uuid("consultancy_id").notNull().references(() => consultancies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 40 }).notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.consultancyId, t.userId] })],
);

// ───────────────────────────── content & settings ─────────────────────────────

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: id(),
    slug: varchar("slug", { length: 40 }).notNull(), // terms | privacy | refund | cookies
    version: varchar("version", { length: 40 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("legal_documents_slug_version").on(t.slug, t.version)],
);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

// ───────────────────────── approvals (maker-checker) ─────────────────────────

export const approvalRequests = pgTable("approval_requests", {
  id: id(),
  action: varchar("action", { length: 80 }).notNull(),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  payload: jsonb("payload").notNull(),
  status: approvalStatusEnum("status").notNull().default("pending"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const approvalDecisions = pgTable("approval_decisions", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => approvalRequests.id, { onDelete: "cascade" }),
  approverId: uuid("approver_id").notNull().references(() => users.id),
  approved: boolean("approved").notNull(),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

// ────────────────────────────── audit & requests ──────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    id: varchar("id", { length: 32 }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: varchar("entity_id", { length: 64 }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    prevHash: varchar("prev_hash", { length: 64 }).notNull(),
    hash: varchar("hash", { length: 64 }).notNull().unique(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

export const deletionRequests = pgTable("deletion_requests", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: requestStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const notifyRequests = pgTable(
  "notify_requests",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cardKey: varchar("card_key", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notify_requests_user_card").on(t.userId, t.cardKey)],
);
