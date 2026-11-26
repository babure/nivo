import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { InMemoryRepositories } from "../repositories/memory.js";
import { bootstrapAdmin } from "./bootstrap-admin.js";

describe("bootstrapAdmin", () => {
  it("creates the first super_admin from ADMIN_EMAIL/PASSWORD", async () => {
    const repos = new InMemoryRepositories();
    const config = loadConfig({
      NODE_ENV: "test",
      ADMIN_EMAIL: "boot@nivo.test",
      ADMIN_PASSWORD: "Bootstrap1234",
      ADMIN_FULL_NAME: "Boot Admin",
      IDENTITY_ENCRYPTION_KEY: "test-identity-encryption-key-00000001",
      ARGON2_MEMORY_KIB: "1024",
      ARGON2_TIME_COST: "2",
    });
    const log = { info: vi.fn(), warn: vi.fn() };
    await bootstrapAdmin(repos, config, log);
    const user = await repos.users.findByEmail("boot@nivo.test");
    expect(user?.role).toBe("super_admin");
    expect(user?.fullName).toBe("Boot Admin");
    expect(user?.isBootstrap).toBe(true);
    expect(log.info).toHaveBeenCalled();

    await bootstrapAdmin(repos, config, log);
    const all = (await repos.users.list()).filter((u) => u.role === "super_admin");
    expect(all).toHaveLength(1);
    expect(all.filter((u) => u.isBootstrap)).toHaveLength(1);
  });
});
