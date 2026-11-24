/** Central permission registry — every admin/API action maps to one of these. */
export const PERMISSIONS = [
  "students:read",
  "students:mark_paid",
  "students:set_card_status",
  "payments:refund",
  "proofs:approve",
  "proofs:reject",
  "identity:view_masked",
  "identity:reveal",
  "identity:download_file",
  "cards:create",
  "cards:edit",
  "cards:publish",
  "settings:links:edit",
  "settings:sim_rules:edit",
  "legal:edit",
  "legal:publish",
  "leads:read",
  "leads:update_status",
  "exports:students",
  "exports:leads",
  "consultancies:manage",
  "partners:csv_import",
  "admins:manage",
  "roles:manage",
  "audit:read",
  "approvals:decide",
  "vouchers:mark_sent",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  operations_approver: [
    "students:read",
    "students:mark_paid",
    "students:set_card_status",
    "payments:refund",
    "proofs:approve",
    "proofs:reject",
    "identity:view_masked",
    "approvals:decide",
    "audit:read",
    "vouchers:mark_sent",
  ],
  support: ["students:read", "identity:view_masked", "leads:read", "audit:read"],
  finance: [
    "students:read",
    "students:mark_paid",
    "payments:refund",
    "exports:students",
    "approvals:decide",
    "audit:read",
  ],
  content_legal_editor: [
    "cards:create",
    "cards:edit",
    "cards:publish",
    "settings:links:edit",
    "settings:sim_rules:edit",
    "legal:edit",
    "legal:publish",
    "approvals:decide",
  ],
  accommodation_agent: ["leads:read", "leads:update_status"],
  consultancy_manager: ["consultancies:manage", "students:read", "exports:students"],
  auditor: ["audit:read", "students:read", "leads:read"],
};

export function hasPermission(
  granted: readonly Permission[],
  required: Permission,
): boolean {
  return granted.includes(required);
}

export function assertPermission(
  granted: readonly Permission[],
  required: Permission,
): void {
  if (!hasPermission(granted, required)) {
    throw new Error(`FORBIDDEN:${required}`);
  }
}

/** Requester cannot approve their own request (maker-checker). */
export function canApproveRequest(
  requesterId: string,
  approverId: string,
  approverPerms: readonly Permission[],
): boolean {
  if (requesterId === approverId) return false;
  return hasPermission(approverPerms, "approvals:decide");
}
