import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import * as s from "../../db/schema.js";

export type ApprovalAction = "students:mark_paid" | "identity:reveal" | "payments:refund" | "exports:students" | "exports:leads";

export type ApprovalRecord = {
  id: string;
  action: ApprovalAction;
  status: "pending" | "approved" | "rejected";
  requesterId: string;
  requesterEmail: string;
  targetUserId: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  decisionNote: string | null;
};

type PayloadShape = {
  requesterEmail: string;
  targetUserId: string;
  reason: string;
  decidedBy?: string | null;
  decisionNote?: string | null;
  extra?: Record<string, unknown>;
};

/** Process-local fallback for tests without Postgres. */
const memory = new Map<string, ApprovalRecord>();
let db: Db | null = null;

export function bindApprovalsDb(database: Db | null): void {
  db = database;
}

function mapRow(
  row: typeof s.approvalRequests.$inferSelect,
  decision?: typeof s.approvalDecisions.$inferSelect | null,
): ApprovalRecord {
  const payload = (row.payload ?? {}) as PayloadShape;
  return {
    id: row.id,
    action: row.action as ApprovalAction,
    status: row.status as ApprovalRecord["status"],
    requesterId: row.requesterId,
    requesterEmail: payload.requesterEmail ?? "",
    targetUserId: payload.targetUserId ?? "",
    reason: payload.reason ?? "",
    payload: payload.extra ?? {},
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedBy: decision?.approverId ?? payload.decidedBy ?? null,
    decisionNote: decision?.comment ?? payload.decisionNote ?? null,
  };
}

export async function listApprovals(filter?: {
  status?: ApprovalRecord["status"];
}): Promise<ApprovalRecord[]> {
  if (!db) {
    const all = [...memory.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (!filter?.status) return all;
    return all.filter((r) => r.status === filter.status);
  }
  const rows = await db.select().from(s.approvalRequests).orderBy(desc(s.approvalRequests.createdAt));
  const out: ApprovalRecord[] = [];
  for (const row of rows) {
    if (filter?.status && row.status !== filter.status) continue;
    const [decision] = await db
      .select()
      .from(s.approvalDecisions)
      .where(eq(s.approvalDecisions.requestId, row.id))
      .orderBy(desc(s.approvalDecisions.decidedAt))
      .limit(1);
    out.push(mapRow(row, decision));
  }
  return out;
}

export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  if (!db) return memory.get(id) ?? null;
  const [row] = await db.select().from(s.approvalRequests).where(eq(s.approvalRequests.id, id)).limit(1);
  if (!row) return null;
  const [decision] = await db
    .select()
    .from(s.approvalDecisions)
    .where(eq(s.approvalDecisions.requestId, id))
    .orderBy(desc(s.approvalDecisions.decidedAt))
    .limit(1);
  return mapRow(row, decision);
}

export async function createApproval(input: {
  action: ApprovalAction;
  requesterId: string;
  requesterEmail: string;
  targetUserId: string;
  reason: string;
  payload?: Record<string, unknown>;
}): Promise<ApprovalRecord> {
  const id = randomUUID();
  const createdAt = new Date();
  const payload: PayloadShape = {
    requesterEmail: input.requesterEmail,
    targetUserId: input.targetUserId,
    reason: input.reason,
    extra: input.payload ?? {},
  };
  if (!db) {
    const rec: ApprovalRecord = {
      id,
      action: input.action,
      status: "pending",
      requesterId: input.requesterId,
      requesterEmail: input.requesterEmail,
      targetUserId: input.targetUserId,
      reason: input.reason,
      payload: input.payload ?? {},
      createdAt,
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
    };
    memory.set(id, rec);
    return { ...rec };
  }
  await db.insert(s.approvalRequests).values({
    id,
    action: input.action,
    requesterId: input.requesterId,
    payload,
    status: "pending",
    createdAt,
  });
  return {
    id,
    action: input.action,
    status: "pending",
    requesterId: input.requesterId,
    requesterEmail: input.requesterEmail,
    targetUserId: input.targetUserId,
    reason: input.reason,
    payload: input.payload ?? {},
    createdAt,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
  };
}

export async function decideApprovalRecord(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
): Promise<ApprovalRecord | null> {
  if (!db) {
    const rec = memory.get(id);
    if (!rec || rec.status !== "pending") return null;
    rec.status = decision;
    rec.decidedAt = new Date();
    rec.decidedBy = decidedBy;
    rec.decisionNote = note ?? null;
    return { ...rec };
  }
  const [row] = await db
    .update(s.approvalRequests)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(s.approvalRequests.id, id), eq(s.approvalRequests.status, "pending")))
    .returning();
  if (!row) return null;
  await db.insert(s.approvalDecisions).values({
    requestId: id,
    approverId: decidedBy,
    approved: decision === "approved",
    comment: note ?? null,
  });
  return mapRow(row, {
    id: randomUUID(),
    requestId: id,
    approverId: decidedBy,
    approved: decision === "approved",
    comment: note ?? null,
    decidedAt: new Date(),
  });
}

/** Test / seed helper */
export function clearApprovals(): void {
  memory.clear();
}
