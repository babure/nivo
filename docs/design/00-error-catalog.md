# Error Catalog

Uniform API error shape. Never leak account existence, stack traces, or PII.

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "requestId": "uuid",
    "details": []
  }
}
```

| Code | HTTP | When | User message |
|------|------|------|--------------|
| `VALIDATION_FAILED` | 400 | Zod / schema fail | Check the highlighted fields. |
| `UNAUTHORIZED` | 401 | No/invalid session | Please sign in again. |
| `FORBIDDEN` | 403 | Missing permission | You do not have permission. |
| `NOT_FOUND` | 404 | Resource missing (or IDOR hide) | Not found. |
| `CONFLICT` | 409 | Duplicate / state conflict | This action is not available in the current state. |
| `RATE_LIMITED` | 429 | Too many requests | Please wait and try again. |
| `PAYMENT_REQUIRED` | 402 | Unpaid accessing dashboard | Complete payment to continue. |
| `PAYMENT_PROCESSING` | 202 | Webhook not yet confirmed | We are confirming your payment. |
| `PAYMENT_FAILED` | 402 | Checkout failed | Payment failed. You can retry. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Bad login | Email or password is incorrect. |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | Login before verify | Verify your email to continue. |
| `AUTH_2FA_REQUIRED` | 401 | 2FA step needed | Enter your authenticator code. |
| `AUTH_LOCKED` | 423 | Lockout | Try again later. |
| `AUTH_TOKEN_INVALID` | 400 | Verify/reset/invite link bad, expired or used | This link is invalid or has expired. |
| `AUTH_2FA_INVALID` | 401 | Wrong TOTP / recovery code | The code is incorrect. |
| `CSRF_INVALID` | 403 | Missing/wrong CSRF or Origin | Your session could not be verified. Reload and try again. |
| `TERMS_REACCEPT_REQUIRED` | 403 | New Terms version | Please accept the updated Terms. |
| `LEGAL_VERSION_STALE` | 409 | Checkout/register with outdated legal version | Please review the updated legal text. |
| `IDENTITY_INCOMPLETE` | 403 | Card 1 before identity | Complete your details first. |
| `CARD_LOCKED` | 403 | Card not available | This step is locked. |
| `UPLOAD_REJECTED` | 400 | Bad file / AV fail | Upload a JPG, PNG, HEIC or PDF under 8 MB. |
| `APPROVAL_REQUIRED` | 409 | Maker-checker pending | Waiting for another admin to approve. |
| `STEP_UP_REQUIRED` | 401 | Sensitive action | Confirm your password or 2FA. |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different body | This request was already used with different data. |
| `WEBHOOK_SIGNATURE_INVALID` | 400 | Stripe (or partner) signature fail | Invalid webhook signature. |
| `SELF_APPROVAL_FORBIDDEN` | 403 | Maker-checker self-approve attempt | You cannot approve your own request. |
| `APPROVAL_EXPIRED` | 409 | Approval request past expiry | This approval request has expired. |
| `EMERGENCY_NOT_ALLOWED` | 403 | Emergency override not permitted | Emergency override is not available for this action. |
| `PUBLISH_VALIDATION_FAILED` | 400 | Draft fails publish checks (HTTPS, allow-list, empty text) | This change cannot be published yet. Fix the highlighted issues. |
| `REFERRAL_CODE_INVALID` | 400 | Unknown or suspended consultancy code | This referral code is not valid. |
| `EXPORT_LIMIT_EXCEEDED` | 429 | Export row/rate cap hit | Export limit reached. Try a smaller range or wait. |
| `DOCUMENT_NOT_READY` | 409 | PDF/document still generating | Your document is not ready yet. Try again shortly. |
| `INTERNAL` | 500 | Unexpected | Something went wrong. Reference: {requestId}. |
