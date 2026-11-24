import { test } from "@playwright/test";

// Acceptance placeholders — implement once the API + seed data are available.
test.describe("student journey (acceptance placeholders)", () => {
  test.fixme("register -> verify email -> pay gate", async () => {});
  test.fixme("unpaid student sees all dashboard cards locked", async () => {});
  test.fixme("paid student completes identity onboarding (4 steps)", async () => {});
  test.fixme("SIM card unlocks only after required cards are completed", async () => {});
  test.fixme("accommodation lead form submits", async () => {});
});

test.describe("admin (acceptance placeholders)", () => {
  test.fixme("admin nav only shows items allowed by permissions", async () => {});
  test.fixme("approver cannot approve own request (maker-checker)", async () => {});
  test.fixme("support role cannot reveal identity data", async () => {});
});

test.describe("consent (acceptance placeholders)", () => {
  test.fixme("reject non-essential persists choice across reload", async () => {});
  test.fixme("footer 'Cookie settings' reopens the banner", async () => {});
});
