import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { HelpHint } from "@/components/ui/HelpHint";

describe("HelpHint", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens panel on click and shows content", async () => {
    const user = userEvent.setup();
    render(
      <HelpHint topic="Test metric">
        <p>Explanation body</p>
      </HelpHint>,
    );
    await user.click(screen.getByRole("button", { name: /help: test metric/i }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explanation body");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <HelpHint topic="Another">
        <p>Inner</p>
      </HelpHint>,
    );
    await user.click(screen.getByRole("button", { name: /help: another/i }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HelpHint topic="Outside test">
          <p>Inside</p>
        </HelpHint>
        <button type="button">Other</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /help: outside test/i }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
