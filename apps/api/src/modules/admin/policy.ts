import {
  canApproveRequest,
  hasPermission,
  type Permission,
} from "@nivo/shared";

const STEP_UP_MS = 5 * 60 * 1000;

export type PolicyActor = {
  id: string;
  role: string | null;
  permissions: readonly Permission[];
};

export function requirePermission(user: PolicyActor, perm: Permission) {
  if (!user.role) {
    throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
  }
  if (!hasPermission(user.permissions, perm)) {
    throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
  }
}

export function requireStepUp(lastStepUpAt: number | undefined) {
  if (!lastStepUpAt || Date.now() - lastStepUpAt > STEP_UP_MS) {
    throw Object.assign(new Error("Step up required"), {
      code: "STEP_UP_REQUIRED",
    });
  }
}

export type ApprovalRequest = {
  id: string;
  requesterId: string;
  action: string;
  status: "pending" | "approved" | "rejected";
};

export function decideApproval(
  request: ApprovalRequest,
  approver: PolicyActor,
): void {
  if (request.status !== "pending") {
    throw Object.assign(new Error("Not pending"), { code: "CONFLICT" });
  }
  if (
    !canApproveRequest(request.requesterId, approver.id, approver.permissions)
  ) {
    throw Object.assign(new Error("Cannot approve"), { code: "FORBIDDEN" });
  }
  request.status = "approved";
}
