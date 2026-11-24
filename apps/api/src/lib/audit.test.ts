import { describe, expect, it } from "vitest";
import { AuditLogger, verifyAuditChain } from "./audit.js";
import { InMemoryRepositories } from "../repositories/memory.js";

describe("audit log", () => {
  it("T-ADM-030: detects tampering", async () => {
    const repos = new InMemoryRepositories();
    const log = new AuditLogger(repos.audit);
    await log.append({ actorId: "a", action: "x", entityType: "t", entityId: "1" });
    await log.append({ actorId: "a", action: "y", entityType: "t", entityId: "2" });
    expect(await log.verify()).toMatchObject({ valid: true });

    const entries = await log.list();
    entries[0]!.action = "TAMPERED";
    expect(verifyAuditChain(entries).valid).toBe(false);
  });
});
