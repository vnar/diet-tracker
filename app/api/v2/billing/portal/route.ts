import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { getSubscription } from "@/lib/billing/store";
import { getStripeClient } from "@/lib/billing/stripe";

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await getSubscription(userId);
  const customerId = subscription?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer found for user." }, { status: 400 });
  }

  const stripe = getStripeClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/account/billing`,
  });
  return NextResponse.json({ url: session.url });
}
