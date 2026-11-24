import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors.js";
import { createTestServices, registerInput } from "../../test/harness.js";
import type { Services } from "../../services.js";
import type { MemoryMailer } from "../../lib/mailer.js";
import type { InMemoryRepositories } from "../../repositories/memory.js";

describe("AuthService", () => {
  let svc: Services & { mailer: MemoryMailer; repos: InMemoryRepositories };

  beforeEach(() => {
    svc = createTestServices();
  });

  it("T-AUTH-001: registers and requires verification before login", async () => {
    await svc.auth.register(registerInput);
    const token = svc.mailer.lastTokenFor(registerInput.email, "verify_email");
    expect(token).toBeTruthy();

    await expect(
      svc.auth.login({ email: registerInput.email, password: registerInput.password }),
    ).rejects.toBeInstanceOf(AppError);

    await svc.auth.verifyEmail(token!);
    const session = await svc.auth.login({
      email: registerInput.email,
      password: registerInput.password,
    });
    expect(session.user.email).toBe("ada@example.com");
  });

  it("T-AUTH-030: invalid login throws AUTH_INVALID_CREDENTIALS", async () => {
    await expect(
      svc.auth.login({ email: "nobody@example.com", password: "GoodPassword1" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("T-CON-001: stores referral consultancy id", async () => {
    await svc.repos.consultancies.create({
      id: "c1",
      name: "Sample",
      referralCode: "SAMPLE",
    });
    await svc.auth.register({ ...registerInput, referralCode: "SAMPLE" });
    const user = await svc.repos.users.findByEmail(registerInput.email);
    const profile = await svc.repos.profiles.get(user!.id);
    expect(profile?.consultancyId).toBe("c1");
  });
});
