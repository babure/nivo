import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  canTransition,
  evaluateSimUnlock,
  isSimGrandfathered,
  simProgress,
  dashboardCardAvailability,
  CARD_STATUSES,
} from "./cards.js";

describe("SIM unlock engine", () => {
  it("T-CARD-010: unlocks when required cards completed and paid", () => {
    const status = evaluateSimUnlock({
      paymentPaid: true,
      identityComplete: true,
      requiredCardKeys: ["blocked_account"],
      progress: [{ cardKey: "blocked_account", status: "completed" }],
      simStatus: "locked",
    });
    expect(status).toBe("available");
  });

  it("T-CARD-010b: stays locked if required not completed", () => {
    expect(
      evaluateSimUnlock({
        paymentPaid: true,
        identityComplete: true,
        requiredCardKeys: ["blocked_account"],
        progress: [{ cardKey: "blocked_account", status: "in_progress" }],
        simStatus: "locked",
      }),
    ).toBe("locked");
  });

  it("T-ADM-SIM: grandfathering — never relock unlocked students", () => {
    for (const simStatus of ["available", "in_progress", "completed"] as const) {
      expect(
        evaluateSimUnlock({
          paymentPaid: true,
          identityComplete: true,
          requiredCardKeys: ["blocked_account", "insurance"],
          progress: [{ cardKey: "blocked_account", status: "completed" }],
          simStatus,
        }),
      ).toBe(simStatus);
    }
  });

  it("property: grandfathered statuses always preserved", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("available", "in_progress", "completed"),
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 5 }),
        (simStatus, keys) => {
          expect(isSimGrandfathered(simStatus)).toBe(true);
          const out = evaluateSimUnlock({
            paymentPaid: true,
            identityComplete: true,
            requiredCardKeys: keys,
            progress: [],
            simStatus,
          });
          expect(out).toBe(simStatus);
        },
      ),
    );
  });

  it("T-CARD-001: unpaid keeps cards locked", () => {
    expect(
      dashboardCardAvailability({
        paymentPaid: false,
        identityComplete: false,
        cardKey: "blocked_account",
        requiredForSim: ["blocked_account"],
        progress: [],
        comingSoon: false,
      }),
    ).toBe("locked");
  });

  it("identity incomplete gates blocked_account", () => {
    expect(
      dashboardCardAvailability({
        paymentPaid: true,
        identityComplete: false,
        cardKey: "blocked_account",
        requiredForSim: ["blocked_account"],
        progress: [],
        comingSoon: false,
      }),
    ).toBe("locked");
  });

  it("identity incomplete gates accommodation (REQ-CARD-08)", () => {
    expect(
      dashboardCardAvailability({
        paymentPaid: true,
        identityComplete: false,
        cardKey: "accommodation",
        requiredForSim: ["blocked_account"],
        progress: [],
        comingSoon: false,
      }),
    ).toBe("locked");
  });

  it("sim progress counts required completions", () => {
    expect(
      simProgress({
        requiredCardKeys: ["blocked_account", "insurance"],
        progress: [{ cardKey: "blocked_account", status: "completed" }],
      }),
    ).toEqual({ done: 1, total: 2 });
  });

  it("completed cannot transition", () => {
    for (const to of CARD_STATUSES) {
      expect(canTransition("completed", to)).toBe(false);
    }
  });
});
