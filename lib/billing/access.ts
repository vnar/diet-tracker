/**
 * Pure helpers for subscription-gated product features (no AWS imports).
 */

export function isPaidPlanActive(
  plan: string | undefined,
  status: string | undefined,
): boolean {
  const p = (plan ?? "free").trim().toLowerCase();
  if (p === "free" || p === "") return false;
  const s = (status ?? "").trim().toLowerCase();
  return s === "active" || s === "trialing";
}
