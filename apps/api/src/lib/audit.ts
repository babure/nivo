import { randomBytes } from "node:crypto";
import { AUDIT_GENESIS, auditHash } from "@nivo/shared";
import type { AuditRecord, AuditRepo } from "../repositories/types.js";

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  /** Must not contain secrets or raw PII — ids and reason codes only. */
  meta?: Record<string, unknown>;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/** Deterministic serialisation of everything that is covered by the hash. */
export function auditPayload(e: Pick<AuditRecord, "id" | "at" | "actorId" | "action" | "entityType" | "entityId" | "meta">): string {
  return JSON.stringify(
    sortKeys({
      id: e.id,
      at: e.at.toISOString(),
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      meta: e.meta,
    }),
  );
}

export type ChainVerification = { valid: true; length: number } | { valid: false; brokenAtSeq: number; reason: string };

export function verifyAuditChain(entries: AuditRecord[]): ChainVerification {
  let prev = AUDIT_GENESIS;
  for (const e of entries) {
    if (e.prevHash !== prev) {
      return { valid: false, brokenAtSeq: e.seq, reason: "prev_hash_mismatch" };
    }
    if (auditHash(prev, auditPayload(e)) !== e.hash) {
      return { valid: false, brokenAtSeq: e.seq, reason: "hash_mismatch" };
    }
    prev = e.hash;
  }
  return { valid: true, length: entries.length };
}

/**
 * Hash-chained, append-only audit log. Appends are serialised in-process;
 * a multi-instance Postgres implementation must additionally take an advisory lock.
 */
export class AuditLogger {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repo: AuditRepo,
    private readonly now: () => Date = () => new Date(),
  ) {}

  append(input: AuditInput): Promise<AuditRecord> {
    const run = async (): Promise<AuditRecord> => {
      const last = await this.repo.last();
      const prevHash = last?.hash ?? AUDIT_GENESIS;
      const base = {
        id: randomBytes(12).toString("hex"),
        at: this.now(),
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ?? {},
      };
      const hash = auditHash(prevHash, auditPayload(base));
      return this.repo.append({ ...base, prevHash, hash });
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async verify(): Promise<ChainVerification> {
    return verifyAuditChain(await this.repo.all());
  }

  list(): Promise<AuditRecord[]> {
    return this.repo.all();
  }
}
