import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import Home from "./Home";

describe("Home", () => {
  it("renders brand, tagline and Start your journey CTA", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Home />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("brand")).toHaveTextContent("NIVO");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /a place for new beginnings/i,
      }),
    ).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: "Start your journey" });
    expect(ctas[0]).toHaveAttribute("href", "/register");
  });
});
