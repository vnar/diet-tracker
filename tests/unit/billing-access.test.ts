import { describe, expect, it } from "vitest";
import { isPaidPlanActive } from "@/lib/billing/access";

describe("isPaidPlanActive", () => {
  it("returns false for free or missing plan", () => {
    expect(isPaidPlanActive("free", "active")).toBe(false);
    expect(isPaidPlanActive(undefined, "active")).toBe(false);
  });

  it("returns true for paid plan with active or trialing status", () => {
    expect(isPaidPlanActive("pro_monthly", "active")).toBe(true);
    expect(isPaidPlanActive("pro_annual", "trialing")).toBe(true);
  });

  it("returns false for paid plan with inactive status", () => {
    expect(isPaidPlanActive("pro_monthly", "canceled")).toBe(false);
    expect(isPaidPlanActive("pro_monthly", "past_due")).toBe(false);
  });
});
