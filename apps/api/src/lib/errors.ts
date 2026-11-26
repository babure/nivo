import { ZodError, type ZodTypeAny, type z } from "zod";
import type { ErrorCode } from "@nivo/shared";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  PAYMENT_PROCESSING: 402,
  PAYMENT_FAILED: 402,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_EMAIL_NOT_VERIFIED: 403,
  AUTH_LOCKED: 423,
  AUTH_TOKEN_INVALID: 400,
  CSRF_INVALID: 403,
  TERMS_REACCEPT_REQUIRED: 403,
  LEGAL_VERSION_STALE: 409,
  IDENTITY_INCOMPLETE: 409,
  CARD_LOCKED: 403,
  UPLOAD_REJECTED: 422,
  APPROVAL_REQUIRED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  WEBHOOK_SIGNATURE_INVALID: 400,
  SELF_APPROVAL_FORBIDDEN: 403,
  APPROVAL_EXPIRED: 409,
  EMERGENCY_NOT_ALLOWED: 403,
  PUBLISH_VALIDATION_FAILED: 400,
  REFERRAL_CODE_INVALID: 400,
  EXPORT_LIMIT_EXCEEDED: 429,
  DOCUMENT_NOT_READY: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = STATUS_BY_CODE[code];
  }
}

/** Parse with a zod schema; unknown keys are rejected (schema is made strict). */
export function parseStrict<S extends z.AnyZodObject>(
  schema: S,
  data: unknown,
): z.infer<S> {
  return schema.strict().parse(data ?? {});
}

export function parseWith<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function zodDetails(err: ZodError): { path: string; code: string; message: string }[] {
  // Never echo submitted values (may contain passwords / PII).
  return err.issues.map((i) => ({
    path: i.path.join("."),
    code: i.code,
    message: i.message,
  }));
}

/** Short actionable summary for the top-level error.message. */
export function zodSummary(err: ZodError): string {
  const details = zodDetails(err);
  if (details.length === 0) return "Request validation failed.";
  const parts = details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message));
  if (parts.length === 1) return parts[0]!;
  return `Fix ${parts.length} fields: ${parts.slice(0, 3).join(" · ")}${parts.length > 3 ? "…" : ""}`;
}
