import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { getStripeClient } from "@/lib/billing/stripe";

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { priceId?: string };
  if (!body.priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  const stripe = getStripeClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: body.priceId, quantity: 1 }],
    success_url: `${baseUrl}/account/billing?status=success`,
    cancel_url: `${baseUrl}/account/billing?status=cancel`,
    client_reference_id: userId,
    metadata: { userId },
  });

  return NextResponse.json({ url: session.url });
}
