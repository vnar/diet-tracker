"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { useSubscriptionSnapshot } from "@/components/v2/billing/SubscriptionContext";
import {
  getSettings,
  isAwsBackendEnabled,
  postBillingCheckoutSession,
  postBillingPortalSession,
} from "@/lib/frontend-api-client";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { isProUnlocked } from "@/lib/billing/proGate";
import { track } from "@/lib/analytics";
import { isEnabled, isProMonetizationEnabled } from "@/lib/featureFlags";

const PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY?.trim() ?? "";

function BillingPageContent() {
  const params = useSearchParams();
  const { status, getAccessToken, user } = useCognitoAuth();
  const { subscription, setSubscription } = useSubscriptionSnapshot();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const wasPaidRef = useRef(false);
  const subscriptionCreatedTracked = useRef(false);

  const proMon = Boolean(user?.id && isProMonetizationEnabled(user.id));
  const billingFlagOn = Boolean(user?.id && isEnabled("FF_BILLING_ENABLED", user.id));
  const checkoutAllowed = proMon || billingFlagOn;
  const paid = isProUnlocked(subscription);
  const displayPrice = BILLING_PLANS.pro_monthly.price;

  useEffect(() => {
    track("paywall_viewed", { surface: "billing_page" });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isAwsBackendEnabled()) return;
    const token = getAccessToken();
    if (!token) return;
    void getSettings(token).then((r) => {
      if (r.ok) setSubscription(r.data.subscription ?? null);
    });
  }, [status, getAccessToken, setSubscription]);

  useEffect(() => {
    const paidNow = isProUnlocked(subscription);
    if (wasPaidRef.current && !paidNow) {
      const s = (subscription?.status ?? "").toLowerCase();
      if (s === "canceled" || s === "cancelled") {
        track("subscription_cancelled", {
          plan: subscription?.plan ?? "unknown",
          status: subscription?.status,
        });
      }
    }
    wasPaidRef.current = paidNow;
  }, [subscription]);

  const checkoutResult = params.get("checkout");
  useEffect(() => {
    if (checkoutResult !== "success") return;
    if (status !== "authenticated" || !isAwsBackendEnabled()) return;
    const token = getAccessToken();
    if (!token) return;
    void getSettings(token).then((r) => {
      if (!r.ok) return;
      setSubscription(r.data.subscription ?? null);
      if (!subscriptionCreatedTracked.current && isProUnlocked(r.data.subscription)) {
        subscriptionCreatedTracked.current = true;
        track("subscription_created", { surface: "checkout_success" });
      }
    });
  }, [checkoutResult, status, getAccessToken, setSubscription]);

  async function startCheckout() {
    setCheckoutError(null);
    const token = getAccessToken();
    if (!token) {
      setCheckoutError("Sign in to subscribe.");
      return;
    }
    if (!PRICE_ID) {
      setCheckoutError("Billing is not fully configured (missing price id).");
      return;
    }
    track("upgrade_clicked", { surface: "billing_page", cta: "subscribe_pro" });
    setBusy("checkout");
    track("checkout_started", { price_id: PRICE_ID });
    const res = await postBillingCheckoutSession(PRICE_ID, token);
    setBusy(null);
    if (!res.ok) {
      setCheckoutError(res.error ?? "Could not start checkout.");
      return;
    }
    window.location.href = res.data.url;
  }

  async function openPortal() {
    setCheckoutError(null);
    const token = getAccessToken();
    if (!token) {
      setCheckoutError("Sign in to manage billing.");
      return;
    }
    setBusy("portal");
    const res = await postBillingPortalSession(token);
    setBusy(null);
    if (!res.ok) {
      setCheckoutError(res.error ?? "Could not open billing portal.");
      return;
    }
    window.location.href = res.data.url;
  }

  const cancelQuery = params.get("checkout") === "cancel";

  return (
    /** Full dark surface: page text is tuned for dark bg; root layout defaults to light mode. */
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
    <main className="mx-auto max-w-3xl space-y-8 p-6 pb-16 text-zinc-200">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Ojas Pro</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Pro is built to feel like unlocking intelligence on top of what you already log — not a penalty
          for staying on Free. Your history, weights, and photos stay yours either way.
        </p>
      </div>

      {cancelQuery ? (
        <div className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-300">
          Checkout was cancelled. No charges were made. You can pick up where you left off anytime.
        </div>
      ) : null}

      <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-zinc-950 p-6 ring-1 ring-violet-400/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/90">Current plan</p>
            <p className="mt-1 text-xl font-semibold text-zinc-50">
              {paid ? "Pro" : "Free"}
            </p>
            {paid && subscription?.currentPeriodEnd ? (
              <p className="mt-1 text-xs text-zinc-500">
                Renews or ends · {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            ) : null}
            {!checkoutAllowed ? (
              <p className="mt-3 text-xs text-zinc-500">
                Pro checkout appears when Pro monetization or billing is enabled for your account, and this
                deployment has Stripe configured.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {!paid ? (
              <button
                type="button"
                disabled={
                  busy !== null ||
                  status !== "authenticated" ||
                  !checkoutAllowed ||
                  !PRICE_ID
                }
                onClick={() => void startCheckout()}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "checkout" ? "Starting…" : `Upgrade — ${displayPrice}/mo`}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null || status !== "authenticated"}
                onClick={() => void openPortal()}
                className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "portal" ? "Opening…" : "Manage subscription"}
              </button>
            )}
            <p className="text-center text-[11px] text-zinc-500 sm:text-right">
              Cancel anytime from the Stripe customer portal. No long-term lock-in.
            </p>
          </div>
        </div>
        {checkoutError ? (
          <p className="mt-4 text-sm text-rose-300" role="alert">
            {checkoutError}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-50">What Pro unlocks</h2>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-zinc-400">
          <li>Personalized AI coaching nudges from your own logs</li>
          <li>Natural-language and photo meal logging at full convenience</li>
          <li>Generous voice check-in parsing (soft free cap when monetization is on)</li>
          <li>Trajectory, weekly AI summaries, integrations, and exports (rolling out)</li>
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-900/80">
              <th className="px-4 py-3 font-medium text-zinc-300">Feature</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Free</th>
              <th className="px-4 py-3 font-medium text-violet-200">Pro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
            <tr>
              <td className="px-4 py-2.5 text-zinc-400">Core logging (weight, day log, history)</td>
              <td className="px-4 py-2.5 text-emerald-400/90">Included</td>
              <td className="px-4 py-2.5 text-zinc-500">Included</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-zinc-400">Personalized coaching nudges</td>
              <td className="px-4 py-2.5 text-zinc-500">Preview / gated</td>
              <td className="px-4 py-2.5 text-emerald-400/90">Full</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-zinc-400">NL + photo meal AI</td>
              <td className="px-4 py-2.5 text-zinc-500">Gated when monetization on</td>
              <td className="px-4 py-2.5 text-emerald-400/90">Full</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-zinc-400">Voice parse quota</td>
              <td className="px-4 py-2.5 text-zinc-500">Monthly soft cap</td>
              <td className="px-4 py-2.5 text-emerald-400/90">High allowance</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-zinc-400">Integrations & trajectory (roadmap)</td>
              <td className="px-4 py-2.5 text-zinc-500">—</td>
              <td className="px-4 py-2.5 text-emerald-400/90">In rollout</td>
            </tr>
          </tbody>
        </table>
      </section>

      <p className="text-center text-xs text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Back to dashboard
        </Link>
      </p>
    </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-200">
          <main className="mx-auto max-w-3xl p-6">
            <p className="text-sm">Loading…</p>
          </main>
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}
