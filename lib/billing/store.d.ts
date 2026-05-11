import type { BillingPlan } from "@/lib/billing/plans";
export declare function getSubscription(userId: string): Promise<{
    userId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
} | null>;
export declare function putSubscription(input: {
    userId: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    plan: BillingPlan | "free";
    status: string;
    currentPeriodEnd?: string | null;
}): Promise<void>;
export declare function hasBillingEvent(eventId: string): Promise<boolean>;
export declare function putBillingEvent(input: {
    id: string;
    userId: string;
    type: string;
    payloadJson: string;
    ts: string;
}): Promise<void>;
