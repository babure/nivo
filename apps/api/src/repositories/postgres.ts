import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { EncryptedBlob } from "@nivo/shared";
import type { Db } from "../db/client.js";
import * as s from "../db/schema.js";
import { readEncryptedBlob, writeEncryptedBlob } from "../lib/storage.js";
import { DEFAULT_CARDS, DEFAULT_LEGAL } from "./memory.js";
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
  type LeadStatus,
  type LegalDocumentRecord,
  type PaymentRecord,
  type ProfileRecord,
  type Repositories,
  type SessionRecord,
  type UserRecord,
} from "./types.js";

type LeadDb = "new" | "contacted" | "qualified" | "voucher_sent" | "closed" | "lost";

function toDbLead(status: LeadStatus): LeadDb {
  if (status === "viewing") return "qualified";
  if (status === "booked") return "voucher_sent";
  if (status === "closed") return "closed";
  if (status === "contacted") return "contacted";
  return "new";
}

function fromDbLead(status: string): LeadStatus {
  if (status === "qualified") return "viewing";
  if (status === "voucher_sent") return "booked";
  if (status === "closed" || status === "lost") return "closed";
  if (status === "contacted") return "contacted";
  return "new";
}

function mapUser(row: typeof s.users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    country: row.country,
    intake: row.intake,
    passwordHash: row.passwordHash,
    emailVerifiedAt: row.emailVerifiedAt,
    role: row.role,
    googleSub: row.googleSub ?? null,
    avatarUrl: row.avatarUrl ?? null,
    passwordSet: row.passwordSet,
    totpSecret: (row.totpSecret as EncryptedBlob | null) ?? null,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505");
}

/** Postgres-backed repositories (Drizzle). Used by the running API. */
export class PostgresRepositories implements Repositories {
  constructor(private readonly db: Db) {}

  /** Idempotent bootstrap of cards, legal docs, default settings. */
  async ensureDefaults(): Promise<void> {
    for (const c of DEFAULT_CARDS) {
      await this.db
        .insert(s.cards)
        .values({
          key: c.key,
          title: c.title,
          description: c.description,
          position: c.position,
          comingSoon: c.comingSoon,
          published: true,
        })
        .onConflictDoNothing();
    }
    for (const d of DEFAULT_LEGAL) {
      await this.db
        .insert(s.legalDocuments)
        .values({
          slug: d.slug,
          version: d.version,
          title: d.title,
          body: d.body,
          published: d.published,
          publishedAt: d.publishedAt,
        })
        .onConflictDoNothing();
    }
    await this.settings.set("partner_links", {
      expatrio: "https://example.com/expatrio",
      vodafone: "https://example.com/vodafone",
      swarajya: "https://example.com/swarajya",
    }, null);
    const roshan = await this.settings.get<string>("roshan.email");
    if (!roshan) await this.settings.set("roshan.email", "roshan@example.com", null);
  }

  users: Repositories["users"] = {
    create: async (user) => {
      try {
        const [row] = await this.db
          .insert(s.users)
          .values({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            phone: user.phone,
            country: user.country,
            intake: user.intake,
            passwordHash: user.passwordHash,
            emailVerifiedAt: user.emailVerifiedAt,
            role: user.role,
            googleSub: user.googleSub,
            avatarUrl: user.avatarUrl,
            passwordSet: user.passwordSet,
            totpSecret: user.totpSecret,
            failedLoginCount: user.failedLoginCount,
            lockedUntil: user.lockedUntil,
            createdAt: user.createdAt,
            deletedAt: user.deletedAt,
          })
          .returning();
        return mapUser(row!);
      } catch (err) {
        if (isUniqueViolation(err)) throw new UniqueViolationError("email");
        throw err;
      }
    },
    findByEmail: async (email) => {
      const [row] = await this.db
        .select()
        .from(s.users)
        .where(and(eq(s.users.email, email.toLowerCase()), isNull(s.users.deletedAt)))
        .limit(1);
      return row ? mapUser(row) : null;
    },
    findById: async (id) => {
      const [row] = await this.db
        .select()
        .from(s.users)
        .where(and(eq(s.users.id, id), isNull(s.users.deletedAt)))
        .limit(1);
      return row ? mapUser(row) : null;
    },
    findByGoogleSub: async (googleSub) => {
      const [row] = await this.db
        .select()
        .from(s.users)
        .where(and(eq(s.users.googleSub, googleSub), isNull(s.users.deletedAt)))
        .limit(1);
      return row ? mapUser(row) : null;
    },
    update: async (id, patch) => {
      const [row] = await this.db
        .update(s.users)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(s.users.id, id))
        .returning();
      return row ? mapUser(row) : null;
    },
    list: async () => {
      const rows = await this.db.select().from(s.users).where(isNull(s.users.deletedAt));
      return rows.map(mapUser);
    },
  };

  sessions: Repositories["sessions"] = {
    create: async (session) => {
      await this.db.insert(s.sessions).values({
        id: session.id,
        userId: session.userId,
        ipHash: session.ipHash,
        userAgent: session.userAgent,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      });
    },
    findById: async (id) => {
      const [row] = await this.db.select().from(s.sessions).where(eq(s.sessions.id, id)).limit(1);
      return row
        ? {
            id: row.id,
            userId: row.userId,
            ipHash: row.ipHash,
            userAgent: row.userAgent,
            expiresAt: row.expiresAt,
            createdAt: row.createdAt,
          }
        : null;
    },
    delete: async (id) => {
      await this.db.delete(s.sessions).where(eq(s.sessions.id, id));
    },
    deleteAllForUser: async (userId) => {
      await this.db.delete(s.sessions).where(eq(s.sessions.userId, userId));
    },
  };

  tokens: Repositories["tokens"] = {
    create: async (token) => {
      await this.db.insert(s.authTokens).values({
        tokenHash: token.tokenHash,
        userId: token.userId,
        purpose: token.purpose,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
      });
    },
    consume: async (tokenHash, purpose, now) => {
      const [row] = await this.db
        .update(s.authTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(s.authTokens.tokenHash, tokenHash),
            eq(s.authTokens.purpose, purpose),
            isNull(s.authTokens.usedAt),
            sql`${s.authTokens.expiresAt} > ${now}`,
          ),
        )
        .returning();
      if (!row) return null;
      return {
        tokenHash: row.tokenHash,
        userId: row.userId,
        purpose: row.purpose,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
      } satisfies AuthTokenRecord;
    },
  };

  profiles: Repositories["profiles"] = {
    get: async (userId) => {
      const [row] = await this.db
        .select()
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.userId, userId))
        .limit(1);
      return row
        ? {
            userId: row.userId,
            paymentStatus: row.paymentStatus as ProfileRecord["paymentStatus"],
            paidAt: row.paidAt,
            identityComplete: row.identityComplete,
            consultancyId: row.consultancyId,
            referralCode: row.referralCode,
            shareProgressWithConsultancy: row.shareProgressWithConsultancy,
          }
        : null;
    },
    upsert: async (profile) => {
      await this.db
        .insert(s.studentProfiles)
        .values({
          userId: profile.userId,
          paymentStatus: profile.paymentStatus,
          paidAt: profile.paidAt,
          identityComplete: profile.identityComplete,
          consultancyId: profile.consultancyId,
          referralCode: profile.referralCode,
          shareProgressWithConsultancy: profile.shareProgressWithConsultancy,
        })
        .onConflictDoUpdate({
          target: s.studentProfiles.userId,
          set: {
            paymentStatus: profile.paymentStatus,
            paidAt: profile.paidAt,
            identityComplete: profile.identityComplete,
            consultancyId: profile.consultancyId,
            referralCode: profile.referralCode,
            shareProgressWithConsultancy: profile.shareProgressWithConsultancy,
            updatedAt: new Date(),
          },
        });
    },
    patch: async (userId, patch) => {
      const [row] = await this.db
        .update(s.studentProfiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(s.studentProfiles.userId, userId))
        .returning();
      return row
        ? {
            userId: row.userId,
            paymentStatus: row.paymentStatus as ProfileRecord["paymentStatus"],
            paidAt: row.paidAt,
            identityComplete: row.identityComplete,
            consultancyId: row.consultancyId,
            referralCode: row.referralCode,
            shareProgressWithConsultancy: row.shareProgressWithConsultancy,
          }
        : null;
    },
    list: async () => {
      const rows = await this.db.select().from(s.studentProfiles);
      return rows.map((row) => ({
        userId: row.userId,
        paymentStatus: row.paymentStatus as ProfileRecord["paymentStatus"],
        paidAt: row.paidAt,
        identityComplete: row.identityComplete,
        consultancyId: row.consultancyId,
        referralCode: row.referralCode,
        shareProgressWithConsultancy: row.shareProgressWithConsultancy,
      }));
    },
    listByConsultancy: async (consultancyId) => {
      const rows = await this.db
        .select()
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.consultancyId, consultancyId));
      return rows.map((row) => ({
        userId: row.userId,
        paymentStatus: row.paymentStatus as ProfileRecord["paymentStatus"],
        paidAt: row.paidAt,
        identityComplete: row.identityComplete,
        consultancyId: row.consultancyId,
        referralCode: row.referralCode,
        shareProgressWithConsultancy: row.shareProgressWithConsultancy,
      }));
    },
  };

  consents: Repositories["consents"] = {
    add: async (consent) => {
      await this.db.insert(s.consents).values({
        id: consent.id,
        userId: consent.userId,
        kind: consent.kind,
        version: consent.version,
        ipHash: consent.ipHash,
        acceptedAt: consent.acceptedAt,
      });
    },
    listForUser: async (userId) => {
      const rows = await this.db.select().from(s.consents).where(eq(s.consents.userId, userId));
      return rows.map(
        (r): ConsentRecord => ({
          id: r.id,
          userId: r.userId,
          kind: r.kind,
          version: r.version,
          ipHash: r.ipHash,
          acceptedAt: r.acceptedAt,
        }),
      );
    },
  };

  payments: Repositories["payments"] = {
    claimEvent: async (eventId, type) => {
      try {
        await this.db.insert(s.paymentEvents).values({ eventId, type, outcome: null });
        return true;
      } catch (err) {
        if (isUniqueViolation(err)) return false;
        throw err;
      }
    },
    setEventOutcome: async (eventId, outcome) => {
      await this.db.update(s.paymentEvents).set({ outcome }).where(eq(s.paymentEvents.eventId, eventId));
    },
    releaseEvent: async (eventId) => {
      await this.db.delete(s.paymentEvents).where(eq(s.paymentEvents.eventId, eventId));
    },
    createPayment: async (payment) => {
      await this.db.insert(s.payments).values({
        id: payment.id,
        userId: payment.userId,
        provider: payment.provider,
        providerRef: payment.providerRef,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        stripeEventId: payment.stripeEventId,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
      });
    },
    listForUser: async (userId) => {
      const rows = await this.db.select().from(s.payments).where(eq(s.payments.userId, userId));
      return rows.map(
        (r): PaymentRecord => ({
          id: r.id,
          userId: r.userId,
          provider: r.provider as PaymentRecord["provider"],
          providerRef: r.providerRef,
          amountCents: r.amountCents,
          currency: r.currency,
          status: r.status as PaymentRecord["status"],
          stripeEventId: r.stripeEventId,
          createdAt: r.createdAt,
          paidAt: r.paidAt,
        }),
      );
    },
    nextInvoiceNumber: async (year) => {
      const prefix = `NIVO-${year}-`;
      const rows = await this.db
        .select({ number: s.invoices.number })
        .from(s.invoices)
        .where(sql`${s.invoices.number} like ${`${prefix}%`}`)
        .orderBy(desc(s.invoices.number))
        .limit(1);
      const max = rows[0]?.number ?? null;
      const n = max ? Number(max.slice(prefix.length)) + 1 : 1;
      return `${prefix}${String(n).padStart(6, "0")}`;
    },
    createInvoice: async (invoice) => {
      await this.db.insert(s.invoices).values({
        id: invoice.id,
        number: invoice.number,
        userId: invoice.userId,
        paymentId: invoice.paymentId,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        issuedAt: invoice.issuedAt,
      });
    },
    listInvoicesForUser: async (userId) => {
      const rows = await this.db.select().from(s.invoices).where(eq(s.invoices.userId, userId));
      return rows.map(
        (r): InvoiceRecord => ({
          id: r.id,
          number: r.number,
          userId: r.userId,
          paymentId: r.paymentId ?? "",
          amountCents: r.amountCents,
          currency: r.currency,
          issuedAt: r.issuedAt,
        }),
      );
    },
  };

  cards: Repositories["cards"] = {
    listDefinitions: async () => {
      const rows = await this.db
        .select()
        .from(s.cards)
        .where(eq(s.cards.published, true))
        .orderBy(asc(s.cards.position));
      return rows.map(
        (r): CardDefinition => ({
          key: r.key,
          title: r.title,
          description: r.description ?? "",
          position: r.position,
          comingSoon: r.comingSoon,
        }),
      );
    },
    listProgress: async (userId) => {
      const rows = await this.db.select().from(s.cardProgress).where(eq(s.cardProgress.userId, userId));
      return rows.map((r) => ({ cardKey: r.cardKey, status: r.status }));
    },
    setProgress: async (userId, cardKey, status) => {
      await this.db
        .insert(s.cardProgress)
        .values({ userId, cardKey, status, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [s.cardProgress.userId, s.cardProgress.cardKey],
          set: { status, updatedAt: new Date() },
        });
    },
    addNotifyRequest: async (userId, cardKey) => {
      try {
        await this.db.insert(s.notifyRequests).values({ userId, cardKey });
        return true;
      } catch (err) {
        if (isUniqueViolation(err)) return false;
        throw err;
      }
    },
  };

  identity: Repositories["identity"] = {
    get: async (userId) => {
      const [row] = await this.db
        .select()
        .from(s.identityRecords)
        .where(eq(s.identityRecords.userId, userId))
        .limit(1);
      return row
        ? ({
            userId: row.userId,
            payload: row.payload as EncryptedBlob,
            fullNameMasked: row.fullNameMasked ?? "",
            passportLast3: row.passportLast3 ?? "",
            updatedAt: row.updatedAt,
          } satisfies IdentityRecordRow)
        : null;
    },
    save: async (row) => {
      await this.db
        .insert(s.identityRecords)
        .values({
          userId: row.userId,
          payload: row.payload,
          fullNameMasked: row.fullNameMasked,
          passportLast3: row.passportLast3,
          updatedAt: row.updatedAt,
        })
        .onConflictDoUpdate({
          target: s.identityRecords.userId,
          set: {
            payload: row.payload,
            fullNameMasked: row.fullNameMasked,
            passportLast3: row.passportLast3,
            updatedAt: row.updatedAt,
          },
        });
    },
    addFile: async (file) => {
      const storageKey = `identity/${file.userId}/${file.id}.json`;
      await writeEncryptedBlob(storageKey, file.blob);
      await this.db.insert(s.identityFiles).values({
        id: file.id,
        userId: file.userId,
        kind: file.kind,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        storageKey,
        createdAt: file.createdAt,
      });
    },
    listFiles: async (userId) => {
      const rows = await this.db.select().from(s.identityFiles).where(eq(s.identityFiles.userId, userId));
      const out: IdentityFileRecord[] = [];
      for (const r of rows) {
        const blob = await readEncryptedBlob(r.storageKey);
        if (!blob) continue;
        out.push({
          id: r.id,
          userId: r.userId,
          kind: r.kind,
          mime: r.mime,
          sizeBytes: r.sizeBytes,
          sha256: r.sha256,
          blob,
          createdAt: r.createdAt,
        });
      }
      return out;
    },
    getFile: async (id) => {
      const [r] = await this.db.select().from(s.identityFiles).where(eq(s.identityFiles.id, id)).limit(1);
      if (!r) return null;
      const blob = await readEncryptedBlob(r.storageKey);
      if (!blob) return null;
      return {
        id: r.id,
        userId: r.userId,
        kind: r.kind,
        mime: r.mime,
        sizeBytes: r.sizeBytes,
        sha256: r.sha256,
        blob,
        createdAt: r.createdAt,
      };
    },
  };

  audit: Repositories["audit"] = {
    last: async () => {
      const [row] = await this.db.select().from(s.auditLog).orderBy(desc(s.auditLog.seq)).limit(1);
      return row
        ? ({
            seq: row.seq,
            id: row.id,
            at: row.at,
            actorId: row.actorId,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            meta: row.meta,
            prevHash: row.prevHash,
            hash: row.hash,
          } satisfies AuditRecord)
        : null;
    },
    append: async (entry) => {
      const [row] = await this.db
        .insert(s.auditLog)
        .values({
          id: entry.id,
          at: entry.at,
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          meta: entry.meta,
          prevHash: entry.prevHash,
          hash: entry.hash,
        })
        .returning();
      return {
        seq: row!.seq,
        id: row!.id,
        at: row!.at,
        actorId: row!.actorId,
        action: row!.action,
        entityType: row!.entityType,
        entityId: row!.entityId,
        meta: row!.meta,
        prevHash: row!.prevHash,
        hash: row!.hash,
      };
    },
    all: async () => {
      const rows = await this.db.select().from(s.auditLog).orderBy(asc(s.auditLog.seq));
      return rows.map(
        (row): AuditRecord => ({
          seq: row.seq,
          id: row.id,
          at: row.at,
          actorId: row.actorId,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          meta: row.meta,
          prevHash: row.prevHash,
          hash: row.hash,
        }),
      );
    },
  };

  leads: Repositories["leads"] = {
    create: async (lead) => {
      await this.db.insert(s.accommodationLeads).values({
        id: lead.id,
        userId: lead.userId,
        city: lead.city,
        budget: lead.budget,
        roomType: lead.roomType,
        phone: lead.phone,
        notes: lead.notes,
        status: toDbLead(lead.status),
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt ?? lead.createdAt,
      });
    },
    list: async () => {
      const rows = await this.db.select().from(s.accommodationLeads).orderBy(desc(s.accommodationLeads.createdAt));
      return rows.map(
        (r): LeadRecord => ({
          id: r.id,
          userId: r.userId,
          city: r.city,
          budget: r.budget,
          roomType: r.roomType,
          phone: r.phone,
          notes: r.notes,
          status: fromDbLead(r.status),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
      );
    },
    listByUser: async (userId) => {
      const rows = await this.db
        .select()
        .from(s.accommodationLeads)
        .where(eq(s.accommodationLeads.userId, userId))
        .orderBy(desc(s.accommodationLeads.createdAt));
      return rows.map(
        (r): LeadRecord => ({
          id: r.id,
          userId: r.userId,
          city: r.city,
          budget: r.budget,
          roomType: r.roomType,
          phone: r.phone,
          notes: r.notes,
          status: fromDbLead(r.status),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }),
      );
    },
    get: async (id) => {
      const [r] = await this.db.select().from(s.accommodationLeads).where(eq(s.accommodationLeads.id, id)).limit(1);
      return r
        ? {
            id: r.id,
            userId: r.userId,
            city: r.city,
            budget: r.budget,
            roomType: r.roomType,
            phone: r.phone,
            notes: r.notes,
            status: fromDbLead(r.status),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }
        : null;
    },
    updateStatus: async (id, status, now) => {
      const [r] = await this.db
        .update(s.accommodationLeads)
        .set({ status: toDbLead(status), updatedAt: now })
        .where(eq(s.accommodationLeads.id, id))
        .returning();
      return r
        ? {
            id: r.id,
            userId: r.userId,
            city: r.city,
            budget: r.budget,
            roomType: r.roomType,
            phone: r.phone,
            notes: r.notes,
            status: fromDbLead(r.status),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }
        : null;
    },
    addNote: async (note) => {
      await this.db.insert(s.leadNotes).values({
        id: note.id,
        leadId: note.leadId,
        authorId: note.authorId,
        body: note.body,
        createdAt: note.createdAt,
      });
    },
    listNotes: async (leadId) => {
      const rows = await this.db.select().from(s.leadNotes).where(eq(s.leadNotes.leadId, leadId));
      return rows.map(
        (r): LeadNoteRecord => ({
          id: r.id,
          leadId: r.leadId,
          authorId: r.authorId,
          body: r.body,
          createdAt: r.createdAt,
        }),
      );
    },
  };

  legal: Repositories["legal"] = {
    list: async () => {
      const rows = await this.db.select().from(s.legalDocuments).where(eq(s.legalDocuments.published, true));
      return rows.map(
        (r): LegalDocumentRecord => ({
          slug: r.slug,
          version: r.version,
          title: r.title,
          body: r.body,
          published: r.published,
          publishedAt: r.publishedAt,
        }),
      );
    },
    getPublished: async (slug) => {
      const rows = await this.db
        .select()
        .from(s.legalDocuments)
        .where(and(eq(s.legalDocuments.slug, slug), eq(s.legalDocuments.published, true)))
        .orderBy(desc(s.legalDocuments.publishedAt));
      const r = rows[0];
      return r
        ? {
            slug: r.slug,
            version: r.version,
            title: r.title,
            body: r.body,
            published: r.published,
            publishedAt: r.publishedAt,
          }
        : null;
    },
    publish: async (doc) => {
      await this.db.insert(s.legalDocuments).values({
        slug: doc.slug,
        version: doc.version,
        title: doc.title,
        body: doc.body,
        published: doc.published,
        publishedAt: doc.publishedAt,
      });
      return { ...doc };
    },
  };

  settings: Repositories["settings"] = {
    get: async <T>(key: string) => {
      const [row] = await this.db.select().from(s.settings).where(eq(s.settings.key, key)).limit(1);
      return row ? (row.value as T) : null;
    },
    set: async (key, value, updatedBy) => {
      await this.db
        .insert(s.settings)
        .values({ key, value, updatedBy, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: s.settings.key,
          set: { value, updatedBy, updatedAt: new Date() },
        });
    },
  };

  clicks: Repositories["clicks"] = {
    record: async (click) => {
      await this.db.insert(s.linkClicks).values({
        linkKey: click.linkKey,
        userId: click.userId,
        ipHash: click.ipHash,
        clickedAt: click.at,
      });
    },
    countByKey: async () => {
      const rows = await this.db
        .select({
          linkKey: s.linkClicks.linkKey,
          count: sql<number>`count(*)::int`,
        })
        .from(s.linkClicks)
        .groupBy(s.linkClicks.linkKey);
      const out: Record<string, number> = {};
      for (const r of rows) out[r.linkKey] = Number(r.count);
      return out;
    },
  };

  consultancies: Repositories["consultancies"] = {
    create: async (input) => {
      await this.db.insert(s.consultancies).values({
        id: input.id,
        name: input.name,
        referralCode: input.referralCode,
      });
    },
    findByReferralCode: async (code) => {
      const [row] = await this.db
        .select()
        .from(s.consultancies)
        .where(sql`upper(${s.consultancies.referralCode}) = ${code.toUpperCase()}`)
        .limit(1);
      return row ? { id: row.id, name: row.name } : null;
    },
    getMembership: async (userId) => {
      const [row] = await this.db
        .select()
        .from(s.consultancyUsers)
        .where(eq(s.consultancyUsers.userId, userId))
        .limit(1);
      return row ? { consultancyId: row.consultancyId, role: row.role } : null;
    },
    listSharedStudents: async (consultancyId) => {
      const rows = await this.db
        .select({ userId: s.studentProfiles.userId })
        .from(s.studentProfiles)
        .where(
          and(
            eq(s.studentProfiles.consultancyId, consultancyId),
            eq(s.studentProfiles.shareProgressWithConsultancy, true),
          ),
        );
      return rows.map((r) => r.userId);
    },
  };

  /** Seed helper — create consultancy (+ optional membership). */
  async seedConsultancy(
    name: string,
    referralCode: string,
    memberUserId?: string,
    opts: { id?: string; memberRole?: string } = {},
  ): Promise<string> {
    const id = opts.id ?? randomUUID();
    await this.db
      .insert(s.consultancies)
      .values({ id, name, referralCode })
      .onConflictDoNothing();
    if (memberUserId) {
      await this.seedMembership(memberUserId, id, opts.memberRole ?? "member");
    }
    return id;
  }

  /** Seed helper — attach staff/consultancy members. */
  async seedMembership(userId: string, consultancyId: string, role = "member"): Promise<void> {
    await this.db
      .insert(s.consultancyUsers)
      .values({ userId, consultancyId, role })
      .onConflictDoNothing();
  }

  requests: Repositories["requests"] = {
    addDeletionRequest: async (userId, at) => {
      const [existing] = await this.db
        .select()
        .from(s.deletionRequests)
        .where(and(eq(s.deletionRequests.userId, userId), eq(s.deletionRequests.status, "pending")))
        .limit(1);
      if (existing) return { id: existing.id, created: false };
      const [row] = await this.db
        .insert(s.deletionRequests)
        .values({ userId, status: "pending", requestedAt: at })
        .returning();
      return { id: row!.id, created: true };
    },
  };
}
