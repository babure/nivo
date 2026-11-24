import { describe, expect, it } from "vitest";
import { LOG_REDACT_PATHS } from "./logger.js";

describe("logger redaction", () => {
  it("T-SEC-002: includes sensitive keys in redact paths", () => {
    expect(LOG_REDACT_PATHS.some((p) => p.includes("passportNumber"))).toBe(true);
    expect(LOG_REDACT_PATHS.some((p) => p.includes("password"))).toBe(true);
    expect(LOG_REDACT_PATHS).toContain("req.headers.authorization");
  });
});
