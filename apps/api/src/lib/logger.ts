import pino, { type Logger, type LoggerOptions } from "pino";

const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "email",
  "phone",
  "fullName",
  "fatherName",
  "motherName",
  "passportNumber",
  "currentAddress",
  "permanentAddress",
  "passwordHash",
  "secret",
  "iban",
];

/** pino redact paths: top level, one nested level, and req/res bodies. */
export const LOG_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["stripe-signature"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  ...SENSITIVE_KEYS.map((k) => `body.${k}`),
  ...SENSITIVE_KEYS.map((k) => `req.body.${k}`),
  // 2FA one-time codes: only redact inside request bodies (err.code must stay visible)
  "body.code",
  "req.body.code",
];

export function loggerOptions(level: string = "info"): LoggerOptions {
  return {
    level,
    redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" },
    serializers: {
      req(req: { id?: string; method?: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          // strip the query string: it may carry tokens
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode?: number }) {
        return { statusCode: res.statusCode };
      },
    },
  };
}

export function createLogger(level = "info", destination?: pino.DestinationStream): Logger {
  const opts = loggerOptions(level);
  return destination ? pino(opts, destination) : pino(opts);
}
