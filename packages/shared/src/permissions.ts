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
  "settings:texts:edit",
  "reports:read",
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
  "vouchers:mark_sent",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Product roles: `super_admin` (admin UI), `consultancy` (portal).
 * Students have `role = null` and no admin permissions.
 */
export const DEFAULT_ROLES: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  /** Portal uses membership checks, not admin permissions — keep empty to block /v1/admin/*. */
  consultancy: [],
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
