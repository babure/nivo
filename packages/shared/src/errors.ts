export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYMENT_REQUIRED",
  "PAYMENT_PROCESSING",
  "PAYMENT_FAILED",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_EMAIL_NOT_VERIFIED",
  "AUTH_2FA_REQUIRED",
  "AUTH_LOCKED",
  "AUTH_TOKEN_INVALID",
  "AUTH_2FA_INVALID",
  "CSRF_INVALID",
  "TERMS_REACCEPT_REQUIRED",
  "LEGAL_VERSION_STALE",
  "IDENTITY_INCOMPLETE",
  "CARD_LOCKED",
  "UPLOAD_REJECTED",
  "APPROVAL_REQUIRED",
  "STEP_UP_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "WEBHOOK_SIGNATURE_INVALID",
  "SELF_APPROVAL_FORBIDDEN",
  "APPROVAL_EXPIRED",
  "EMERGENCY_NOT_ALLOWED",
  "PUBLISH_VALIDATION_FAILED",
  "REFERRAL_CODE_INVALID",
  "EXPORT_LIMIT_EXCEEDED",
  "DOCUMENT_NOT_READY",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown[];
  };
};

export function apiError(
  code: ErrorCode,
  message: string,
  requestId: string,
  details: unknown[] = [],
): ApiErrorBody {
  return { error: { code, message, requestId, details } };
}
