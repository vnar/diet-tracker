import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OjasMarketingShell } from "@/components/v2/marketing/OjasMarketingShell";

vi.mock("@/components/CognitoAuthProvider", () => ({
  useCognitoAuth: () => ({
    status: "unauthenticated",
    user: null,
    signOut: vi.fn(),
  }),
}));

describe("OjasMarketingShell", () => {
  afterEach(() => cleanup());

  it("renders hero, feature anchors, pricing section, and sign-in slot", () => {
    render(
      <OjasMarketingShell>
        <span data-testid="child">form-here</span>
      </OjasMarketingShell>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("form-here");
    expect(document.getElementById("features")).toBeTruthy();
    expect(document.getElementById("pricing")).toBeTruthy();
    expect(document.getElementById("sign-in")).toBeTruthy();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/account/billing");
  });
});
