import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { mapPriceIdToPlan } from "@/lib/billing/plans";
import { verifyStripeWebhookSignature } from "@/lib/billing/stripe";
import { shouldProcessBillingEvent } from "@/lib/billing/webhook-utils";

describe("billing webhook utilities", () => {
  it("verifies webhook signatures with Stripe test header", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    const payload = JSON.stringify({
      id: "evt_test_1",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const event = verifyStripeWebhookSignature(payload, header);
    expect(event.id).toBe("evt_test_1");
  });

  it("skips already-processed events for idempotency", () => {
    expect(shouldProcessBillingEvent(true)).toBe(false);
    expect(shouldProcessBillingEvent(false)).toBe(true);
  });

  it("maps stripe price ids to internal plans", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_month";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_year";
    process.env.STRIPE_PRICE_FAMILY_MONTHLY = "price_family_month";
    process.env.STRIPE_PRICE_ELITE_MONTHLY = "price_elite_month";
    expect(mapPriceIdToPlan("price_pro_month")).toBe("pro_monthly");
    expect(mapPriceIdToPlan("price_pro_year")).toBe("pro_annual");
    expect(mapPriceIdToPlan("price_unknown")).toBeNull();
  });
});
