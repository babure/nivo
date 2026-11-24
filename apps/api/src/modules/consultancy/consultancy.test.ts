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
});
