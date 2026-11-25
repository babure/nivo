import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import * as s from "../../db/schema.js";

export type ProofRecord = {
  id: string;
  userId: string;
  cardKey: string;
  fileId: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

const memory = new Map<string, ProofRecord>();
let db: Db | null = null;

export function bindProofsDb(database: Db | null): void {
  db = database;
}

export async function createProof(input: {
  userId: string;
  cardKey: string;
  fileId: string | null;
}): Promise<ProofRecord> {
  const rec: ProofRecord = {
    id: randomUUID(),
    userId: input.userId,
    cardKey: input.cardKey,
    fileId: input.fileId,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
  if (!db) {
    memory.set(rec.id, rec);
    return { ...rec };
  }
  await db.insert(s.proofs).values({
    id: rec.id,
    userId: rec.userId,
    cardKey: rec.cardKey,
    fileId: rec.fileId,
    status: "pending",
    createdAt: rec.createdAt,
  });
  return rec;
}

export async function listProofs(filter?: { status?: ProofRecord["status"] }): Promise<ProofRecord[]> {
  if (!db) {
    let all = [...memory.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter?.status) all = all.filter((p) => p.status === filter.status);
    return all;
  }
  const rows = await db.select().from(s.proofs).orderBy(desc(s.proofs.createdAt));
  return rows
    .filter((r) => !filter?.status || r.status === filter.status)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      cardKey: r.cardKey,
      fileId: r.fileId,
      status: r.status as ProofRecord["status"],
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));
}

export async function getProof(id: string): Promise<ProofRecord | null> {
  if (!db) return memory.get(id) ?? null;
  const [row] = await db.select().from(s.proofs).where(eq(s.proofs.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    cardKey: row.cardKey,
    fileId: row.fileId,
    status: row.status as ProofRecord["status"],
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

export async function decideProof(
  id: string,
  decision: "approved" | "rejected",
  reviewerId: string,
): Promise<ProofRecord | null> {
  if (!db) {
    const rec = memory.get(id);
    if (!rec || rec.status !== "pending") return null;
    rec.status = decision;
    rec.reviewedBy = reviewerId;
    rec.reviewedAt = new Date();
    return { ...rec };
  }
  const [row] = await db
    .update(s.proofs)
    .set({ status: decision, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(and(eq(s.proofs.id, id), eq(s.proofs.status, "pending")))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    cardKey: row.cardKey,
    fileId: row.fileId,
    status: row.status as ProofRecord["status"],
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

export function clearProofs(): void {
  memory.clear();
}
