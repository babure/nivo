import { describe, expect, it } from "vitest";
import { registerInput } from "../../test/harness.js";
import { cookieFrom, createTestApp, signUpAndLogin } from "../../test/app-harness.js";

describe("auth HTTP", () => {
  it("rejects unknown keys on register (strict zod)", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { ...registerInput, isAdmin: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
    // submitted values are never echoed back
    expect(res.body).not.toContain(registerInput.password);
  });

  it("stores an Argon2id hash, never the plaintext password", async () => {
    const { app, repos } = await createTestApp();
    await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerInput });
    const user = await repos.users.findByEmail(registerInput.email);
    expect(user?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user?.passwordHash).not.toContain(registerInput.password);
  });

  it("does not reveal whether an email is already registered", async () => {
    const { app, repos } = await createTestApp();
    const a = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerInput });
    const b = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerInput });
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(202);
    expect(b.json()).toEqual(a.json());
    expect((await repos.users.list()).length).toBe(1);
  });

  it("rejects stale terms versions", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { ...registerInput, acceptedTermsVersion: "1999-01" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TERMS_REACCEPT_REQUIRED");
  });

  it("login requires verified email, then sets an httpOnly session cookie; logout revokes it", async () => {
    const { app, mailer } = await createTestApp();
    await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerInput });

    const early = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: registerInput.email, password: registerInput.password },
    });
    expect(early.json().error.code).toBe("AUTH_EMAIL_NOT_VERIFIED");

    const token = mailer.lastTokenFor(registerInput.email, "verify_email")!;
    await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
    // verification tokens are single use
    const again = await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
    expect(again.statusCode).toBe(400);

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: registerInput.email, password: registerInput.password },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = String(login.headers["set-cookie"]);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = cookieFrom(login);

    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(registerInput.email);
    expect(JSON.stringify(me.json())).not.toContain("passwordHash");

    const out = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("locks the account after 5 failed attempts", async () => {
    const { app, mailer } = await createTestApp();
    await signUpAndLogin(app, mailer);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: registerInput.email, password: "WrongPassword9" },
      });
      expect(r.json().error.code).toBe("AUTH_INVALID_CREDENTIALS");
    }
    const locked = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: registerInput.email, password: registerInput.password },
    });
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe("AUTH_LOCKED");
  });

  it("forgot-password answers identically for unknown emails; reset revokes sessions", async () => {
    const { app, mailer } = await createTestApp();
    const { cookie } = await signUpAndLogin(app, mailer);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "ghost@example.com" },
    });
    const known = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: registerInput.email },
    });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json()).toEqual(known.json());
    expect(mailer.lastTokenFor("ghost@example.com", "reset_password")).toBeUndefined();

    const token = mailer.lastTokenFor(registerInput.email, "reset_password")!;
    const reset = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, password: "BrandNewPassw0rd" },
    });
    expect(reset.statusCode).toBe(200);

    const old = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(old.statusCode).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: registerInput.email, password: "BrandNewPassw0rd" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("rate limits auth endpoints", async () => {
    const { app } = await createTestApp({ AUTH_RATE_LIMIT_MAX: "3" });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "x@example.com", password: "whatever" },
      });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes.slice(3)).toEqual([429, 429]);
  });

  it("blocks cross-origin mutations on cookie-authenticated requests", async () => {
    const { app, mailer } = await createTestApp();
    const { cookie } = await signUpAndLogin(app, mailer);
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(res.statusCode).toBe(403);
  });
});
