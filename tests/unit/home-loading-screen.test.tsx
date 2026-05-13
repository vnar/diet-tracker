import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeLoadingScreen } from "@/components/v2/marketing/HomeLoadingScreen";

describe("HomeLoadingScreen", () => {
  afterEach(() => cleanup());

  it("shows branded loading copy instead of a bare Loading label", () => {
    render(<HomeLoadingScreen />);
    expect(screen.getByText(/calm weight & meal tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/Loading your dashboard/i)).toBeInTheDocument();
  });
});
