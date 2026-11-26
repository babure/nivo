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
  reviewNote: string | null;
  createdAt: Date;
};

const memory = new Map<string, ProofRecord>();
let db: Db | null = null;

export function bindProofsDb(database: Db | null): void {
  db = database;
}

function mapRow(r: {
  id: string;
  userId: string;
  cardKey: string;
  fileId: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}): ProofRecord {
  return {
    id: r.id,
    userId: r.userId,
    cardKey: r.cardKey,
    fileId: r.fileId,
    status: r.status as ProofRecord["status"],
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt,
  };
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
    reviewNote: null,
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

export async function listProofs(filter?: {
  status?: ProofRecord["status"];
  userId?: string;
}): Promise<ProofRecord[]> {
  if (!db) {
    let all = [...memory.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter?.status) all = all.filter((p) => p.status === filter.status);
    if (filter?.userId) all = all.filter((p) => p.userId === filter.userId);
    return all;
  }
  const rows = await db.select().from(s.proofs).orderBy(desc(s.proofs.createdAt));
  return rows
    .filter((r) => (!filter?.status || r.status === filter.status) && (!filter?.userId || r.userId === filter.userId))
    .map(mapRow);
}

export async function getProof(id: string): Promise<ProofRecord | null> {
  if (!db) return memory.get(id) ?? null;
  const [row] = await db.select().from(s.proofs).where(eq(s.proofs.id, id)).limit(1);
  if (!row) return null;
  return mapRow(row);
}

export async function decideProof(
  id: string,
  decision: "approved" | "rejected",
  reviewerId: string,
  reviewNote: string | null = null,
): Promise<ProofRecord | null> {
  if (!db) {
    const rec = memory.get(id);
    if (!rec || rec.status !== "pending") return null;
    rec.status = decision;
    rec.reviewedBy = reviewerId;
    rec.reviewedAt = new Date();
    rec.reviewNote = reviewNote;
    return { ...rec };
  }
  const [row] = await db
    .update(s.proofs)
    .set({
      status: decision,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNote,
    })
    .where(and(eq(s.proofs.id, id), eq(s.proofs.status, "pending")))
    .returning();
  if (!row) return null;
  return mapRow(row);
}

export function clearProofs(): void {
  memory.clear();
}
