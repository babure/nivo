import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES } from "@nivo/shared";
import { decideApproval, type PolicyActor } from "./policy.js";

function admin(id: string, role: keyof typeof DEFAULT_ROLES): PolicyActor {
  return {
    id,
    role,
    permissions: DEFAULT_ROLES[role],
  };
}

describe("admin policy", () => {
  it("T-ADM-010: requester cannot approve own request", () => {
    const req = {
      id: "a1",
      requesterId: "u1",
      action: "payments:refund",
      status: "pending" as const,
    };
    expect(() => decideApproval(req, admin("u1", "operations_approver"))).toThrow();
    decideApproval(req, admin("u2", "operations_approver"));
    expect(req.status).toBe("approved");
  });
});
