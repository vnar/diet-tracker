/**
 * Subscription snapshot returned with settings (additive API field).
 * Plan strings align with Dynamo `Subscriptions` table and Stripe webhook mapping.
 */
export type SubscriptionSnapshot = {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
};

export type PlanTier = "free" | "pro" | "family";
