import { NextResponse } from "next/server";
import { hasBillingEvent, putBillingEvent, putSubscription } from "@/lib/billing/store";
import { mapStripeSubscriptionToPlan, verifyStripeWebhookSignature } from "@/lib/billing/stripe";
import { shouldProcessBillingEvent } from "@/lib/billing/webhook-utils";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();
  let event;
  try {
    event = verifyStripeWebhookSignature(payload, signature);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (!shouldProcessBillingEvent(await hasBillingEvent(event.id))) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object;
    if (sub && typeof sub === "object" && "metadata" in sub) {
      const casted = sub as {
        metadata?: Record<string, string>;
        customer?: string;
        id?: string;
        status?: string;
        current_period_end?: number;
      };
      const userId = casted.metadata?.userId;
      if (userId) {
        const plan = mapStripeSubscriptionToPlan(event.data.object as never) ?? "free";
        await putSubscription({
          userId,
          stripeCustomerId: casted.customer ?? "",
          stripeSubscriptionId: casted.id ?? "",
          plan,
          status: casted.status ?? "unknown",
          currentPeriodEnd: casted.current_period_end
            ? new Date(casted.current_period_end * 1000).toISOString()
            : "",
        });
      }
    }
  }

  await putBillingEvent({
    id: event.id,
    userId:
      ((event.data.object as { metadata?: Record<string, string> }).metadata?.userId as string) ||
      "__unknown__",
    type: event.type,
    payloadJson: payload,
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
