import Stripe from "stripe";
import { mapPriceIdToPlan } from "@/lib/billing/plans";

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export function verifyStripeWebhookSignature(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export function mapStripeSubscriptionToPlan(
  subscription: Stripe.Subscription,
): ReturnType<typeof mapPriceIdToPlan> {
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id;
  if (!priceId) return null;
  return mapPriceIdToPlan(priceId);
}
