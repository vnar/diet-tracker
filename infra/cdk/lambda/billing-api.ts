import Stripe from "stripe";
import { getSubscription } from "../../../lib/billing/store";

export type HttpEvent = {
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function billingAppBaseUrl(): string {
  return (
    process.env.BILLING_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export async function handleBillingCheckoutSession(userId: string, event: HttpEvent): Promise<HttpResult> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return json(503, { error: "Stripe is not configured on this deployment." });
  }
  const raw = parseJsonBody(event);
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
  if (!priceId) return json(400, { error: "Missing priceId" });

  const stripe = new Stripe(key);
  const base = billingAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/account/billing?checkout=success`,
    cancel_url: `${base}/account/billing?checkout=cancel`,
    client_reference_id: userId,
    metadata: { userId },
  });
  if (!session.url) return json(500, { error: "Checkout session missing URL" });
  return json(200, { url: session.url });
}

export async function handleBillingPortalSession(userId: string): Promise<HttpResult> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return json(503, { error: "Stripe is not configured on this deployment." });
  }
  const subscription = await getSubscription(userId);
  const customerId = subscription?.stripeCustomerId?.trim();
  if (!customerId) {
    return json(400, { error: "No Stripe customer found for this account yet. Start a subscription from Upgrade first." });
  }
  const stripe = new Stripe(key);
  const base = billingAppBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/account/billing`,
  });
  if (!session.url) return json(500, { error: "Portal session missing URL" });
  return json(200, { url: session.url });
}
