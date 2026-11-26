import { describe, expect, it } from "vitest";
import { InMemoryRepositories } from "../../repositories/memory.js";
import { ConsultancyService } from "./service.js";

describe("ConsultancyService", () => {
  it("T-CON-010: cannot read another consultancy tenant", () => {
    const repos = new InMemoryRepositories();
    const svc = new ConsultancyService(repos);
    expect(() => svc.assertTenant("c1", "c2")).toThrow();
    expect(() => svc.assertTenant("c1", "c1")).not.toThrow();
  });

  it("creates consultancy with uppercase code", async () => {
    const repos = new InMemoryRepositories();
    const svc = new ConsultancyService(repos);
    const created = await svc.create("Sample", "abc");
    expect(created.code).toBe("ABC");
    expect(created.link).toBe("/r/ABC");
  });

  it("lookupByCode validates referral codes", async () => {
    const repos = new InMemoryRepositories();
    const svc = new ConsultancyService(repos);
    await svc.create("Delhi", "DELHI");
    expect(await svc.lookupByCode("nope")).toEqual({ valid: false });
    expect(await svc.lookupByCode("delhi")).toMatchObject({
      valid: true,
      name: "Delhi",
      code: "DELHI",
      link: "/r/DELHI",
    });
  });

  it("consultancy cannot read foreign students via listByConsultancy", async () => {
    const repos = new InMemoryRepositories();
    const a = repos.seedConsultancy("A Co", "ACODE");
    const b = repos.seedConsultancy("B Co", "BCODE");
    const now = new Date();
    await repos.users.create({
      id: "11111111-1111-4111-8111-111111111111",
      email: "a-student@nivo.test",
      fullName: "Alice A",
      phone: "+49170",
      country: "India",
      intake: "Winter 2026",
      passwordHash: "x",
      emailVerifiedAt: now,
      role: null,
      googleSub: null,
      avatarUrl: null,
      passwordSet: true,
      isBootstrap: false,
      failedLoginCount: 0,
      lockedUntil: null,
      blockedAt: null,
      createdAt: now,
      deletedAt: null,
    });
    await repos.profiles.upsert({
      userId: "11111111-1111-4111-8111-111111111111",
      paymentStatus: "unpaid",
      paidAt: null,
      identityComplete: false,
      consultancyId: a,
      referralCode: "ACODE",
      shareProgressWithConsultancy: true,
    });
    const foreign = await repos.profiles.listByConsultancy(b);
    expect(foreign).toHaveLength(0);
    const own = await repos.profiles.listByConsultancy(a);
    expect(own).toHaveLength(1);
    expect(own[0]!.userId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
