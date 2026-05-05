export type BillingPlan = "pro_monthly" | "pro_annual" | "family_monthly" | "elite_monthly";

export const BILLING_PLANS: Record<
  BillingPlan,
  { label: string; price: string; interval: "month" | "year" }
> = {
  pro_monthly: { label: "Pro Monthly", price: "$9.99", interval: "month" },
  pro_annual: { label: "Pro Annual", price: "$79.00", interval: "year" },
  family_monthly: { label: "Family Monthly", price: "$14.99", interval: "month" },
  elite_monthly: { label: "Elite Monthly", price: "$69.00", interval: "month" },
};

export function mapPriceIdToPlan(priceId: string): BillingPlan | null {
  const key = priceId.trim();
  const fromEnv: Record<string, BillingPlan | undefined> = {
    [process.env.STRIPE_PRICE_PRO_MONTHLY ?? ""]: "pro_monthly",
    [process.env.STRIPE_PRICE_PRO_ANNUAL ?? ""]: "pro_annual",
    [process.env.STRIPE_PRICE_FAMILY_MONTHLY ?? ""]: "family_monthly",
    [process.env.STRIPE_PRICE_ELITE_MONTHLY ?? ""]: "elite_monthly",
  };
  return fromEnv[key] ?? null;
}
