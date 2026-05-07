import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderInsightEmphasis } from "@/lib/insights/renderRichPhrases";

describe("renderInsightEmphasis", () => {
  afterEach(() => {
    cleanup();
  });
  it("turns <b> segments into strong elements", () => {
    render(
      <p data-testid="wrap">{renderInsightEmphasis("<b>First</b> middle <b>Last</b>.")}</p>,
    );
    const strongs = screen.getByTestId("wrap").querySelectorAll("strong");
    expect(strongs).toHaveLength(2);
    expect(strongs[0]?.textContent).toBe("First");
    expect(strongs[1]?.textContent).toBe("Last");
    expect(screen.getByTestId("wrap").textContent).toContain("middle");
  });

  it("handles <strong> and case-insensitive tags", () => {
    render(<p data-testid="wrap">{renderInsightEmphasis("<STRONG>x</strong>y<B>z</b>")}</p>);
    expect(screen.getByTestId("wrap").querySelectorAll("strong")).toHaveLength(2);
  });

  it("decodes entity-wrapped bold tags", () => {
    render(
      <p data-testid="wrap">
        {renderInsightEmphasis("&lt;b&gt;Weigh-ins&lt;/b&gt; steady.")}
      </p>,
    );
    expect(screen.getByTestId("wrap").querySelector("strong")?.textContent).toBe("Weigh-ins");
  });

  it("returns empty array for empty string", () => {
    expect(renderInsightEmphasis("")).toEqual([]);
  });
});
