export type BillingPlan = "pro_monthly" | "pro_annual" | "family_monthly" | "elite_monthly";
export declare const BILLING_PLANS: Record<BillingPlan, {
    label: string;
    price: string;
    interval: "month" | "year";
}>;
export declare function mapPriceIdToPlan(priceId: string): BillingPlan | null;
