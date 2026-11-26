import { expect, test } from "@playwright/test";

test.describe("public home", () => {
  test("shows NIVO hero and Register CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A place for new beginnings");
    await expect(page.getByRole("link", { name: "Start your journey" }).first()).toBeVisible();
  });

  test("cookie banner offers three equal choices", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: /cookies/i });
    await expect(banner.getByRole("button")).toHaveCount(3);
  });

  test("referral link /r/:code redirects to register with ref", async ({ page }) => {
    await page.goto("/r/ABC123");
    await expect(page).toHaveURL(/\/register\?ref=ABC123/);
  });
});
