import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app-harness.js";

describe("health + security headers", () => {
  it("GET /health is ok and carries security headers", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", service: "nivo-api" });
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("GET /health/ready reflects datastore state", async () => {
    const up = await createTestApp({}, { health: { dbCheck: async () => true } });
    expect((await up.app.inject({ method: "GET", url: "/health/ready" })).statusCode).toBe(200);
    const down = await createTestApp({}, { health: { dbCheck: async () => false } });
    const res = await down.app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.database).toBe("down");
  });

  it("unknown routes use the error envelope", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: "NOT_FOUND" });
    expect(res.json().error.requestId).toBeTruthy();
  });
});
