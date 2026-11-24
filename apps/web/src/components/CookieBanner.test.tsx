import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CookieBanner } from "./CookieBanner";
import { ConsentProvider } from "../lib/consent";

function setup() {
  return render(
    <MemoryRouter>
      <ConsentProvider>
        <CookieBanner />
      </ConsentProvider>
    </MemoryRouter>,
  );
}

describe("CookieBanner", () => {
  it("shows three equal buttons", () => {
    setup();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Accept all", "Reject non-essential", "Settings"]);
    expect(new Set(buttons.map((b) => b.className)).size).toBe(1);
  });

  it("persists a rejection and hides", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Reject non-essential" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("nivo.cookie-consent")!)).toMatchObject({
      choice: "essential",
      analytics: false,
      marketing: false,
    });
  });
});
