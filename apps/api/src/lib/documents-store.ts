import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import * as s from "../db/schema.js";

export type DocumentRecord = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  storageKey: string;
  createdAt: Date;
};

const memory = new Map<string, DocumentRecord>();
let db: Db | null = null;

export function bindDocumentsDb(database: Db | null): void {
  db = database;
}

export async function createDocument(input: {
  userId: string;
  kind: string;
  title: string;
  storageKey: string;
}): Promise<DocumentRecord> {
  const rec: DocumentRecord = {
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    storageKey: input.storageKey,
    createdAt: new Date(),
  };
  if (!db) {
    memory.set(rec.id, rec);
    return { ...rec };
  }
  await db.insert(s.documents).values({
    id: rec.id,
    userId: rec.userId,
    kind: rec.kind,
    title: rec.title,
    storageKey: rec.storageKey,
    createdAt: rec.createdAt,
  });
  return rec;
}

export async function listDocumentsForUser(userId: string): Promise<DocumentRecord[]> {
  if (!db) {
    return [...memory.values()].filter((d) => d.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const rows = await db.select().from(s.documents).where(eq(s.documents.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId!,
    kind: r.kind,
    title: r.title,
    storageKey: r.storageKey,
    createdAt: r.createdAt,
  }));
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  if (!db) return memory.get(id) ?? null;
  const [row] = await db.select().from(s.documents).where(eq(s.documents.id, id)).limit(1);
  if (!row?.userId) return null;
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    storageKey: row.storageKey,
    createdAt: row.createdAt,
  };
}

export async function findInvoiceDocument(userId: string, invoiceNumber: string): Promise<DocumentRecord | null> {
  const all = await listDocumentsForUser(userId);
  return all.find((d) => d.kind === "invoice_pdf" && d.title === invoiceNumber) ?? null;
}

export async function findTermsDocument(userId: string, version: string): Promise<DocumentRecord | null> {
  const all = await listDocumentsForUser(userId);
  const title = `Terms ${version}`;
  return all.find((d) => d.kind === "terms_pdf" && d.title === title) ?? null;
}

export function clearDocuments(): void {
  memory.clear();
}
