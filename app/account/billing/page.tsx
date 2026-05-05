"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { isEnabled } from "@/lib/featureFlags";

export default function BillingPage() {
  const [showToast, setShowToast] = useState(false);
  const billingEnabled = isEnabled("FF_BILLING_ENABLED");

  function onUpgradeClick() {
    track("billing_upgrade_clicked", { source: "billing_page", billingEnabled });
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 1800);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-200">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-400">Current plan</p>
        <p className="mt-1 text-lg font-medium text-zinc-100">Free</p>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-4 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-400"
        >
          Upgrade
        </button>
      </div>
      {showToast ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          Coming soon
        </div>
      ) : null}
    </main>
  );
}
