import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";

describe("Home", () => {
  it("renders brand, tagline and Register CTA", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("NIVO")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /a place for new beginnings/i })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Register" });
    expect(cta).toHaveAttribute("href", "/register");
  });
});
