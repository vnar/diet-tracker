import { describe, expect, it } from "vitest";
import { isProUnlocked, shouldGateProFeature } from "@/lib/billing/proGate";
import type { SubscriptionSnapshot } from "@/lib/billing/types";

function sub(p: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    plan: "free",
    status: "inactive",
    currentPeriodEnd: null,
    ...p,
  };
}

describe("proGate", () => {
  it("isProUnlocked for active paid plans", () => {
    expect(isProUnlocked(sub({ plan: "pro_monthly", status: "active" }))).toBe(true);
    expect(isProUnlocked(sub({ plan: "pro_monthly", status: "trialing" }))).toBe(true);
    expect(isProUnlocked(sub({ plan: "free", status: "active" }))).toBe(false);
    expect(isProUnlocked(sub({ plan: "pro_monthly", status: "canceled" }))).toBe(false);
  });

  it("shouldGateProFeature respects monetization flag", () => {
    expect(shouldGateProFeature(false, sub({ plan: "pro_monthly", status: "active" }))).toBe(false);
    expect(shouldGateProFeature(true, sub({ plan: "pro_monthly", status: "active" }))).toBe(false);
    expect(shouldGateProFeature(true, sub({ plan: "free", status: "inactive" }))).toBe(true);
  });
});
