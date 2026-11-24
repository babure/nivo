import { randomUUID } from "node:crypto";

export type ApprovalAction = "students:mark_paid" | "identity:reveal";

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

/** Process-local store for Phase 1 maker-checker (in-memory API). */
const store = new Map<string, ApprovalRecord>();

export function listApprovals(filter?: { status?: ApprovalRecord["status"] }): ApprovalRecord[] {
  const all = [...store.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (!filter?.status) return all;
  return all.filter((r) => r.status === filter.status);
}

export function getApproval(id: string): ApprovalRecord | null {
  return store.get(id) ?? null;
}

export function createApproval(input: {
  action: ApprovalAction;
  requesterId: string;
  requesterEmail: string;
  targetUserId: string;
  reason: string;
  payload?: Record<string, unknown>;
}): ApprovalRecord {
  const rec: ApprovalRecord = {
    id: randomUUID(),
    action: input.action,
    status: "pending",
    requesterId: input.requesterId,
    requesterEmail: input.requesterEmail,
    targetUserId: input.targetUserId,
    reason: input.reason,
    payload: input.payload ?? {},
    createdAt: new Date(),
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
  };
  store.set(rec.id, rec);
  return { ...rec };
}

export function decideApprovalRecord(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
): ApprovalRecord | null {
  const rec = store.get(id);
  if (!rec || rec.status !== "pending") return null;
  rec.status = decision;
  rec.decidedAt = new Date();
  rec.decidedBy = decidedBy;
  rec.decisionNote = note ?? null;
  return { ...rec };
}

/** Test / seed helper */
export function clearApprovals(): void {
  store.clear();
}
