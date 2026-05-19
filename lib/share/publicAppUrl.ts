/** Canonical marketing / production app origin for links shared outside the app. */
export const CANONICAL_PUBLIC_APP_URL = "https://ojas-health.com";

function isLocalOrPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local")) {
    return true;
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return true;
  }
  return false;
}

/** Returns a public https origin, or "" if the value is missing or not suitable for external share links. */
export function sanitizePublicAppUrl(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withScheme);
    if (isLocalOrPrivateHostname(u.hostname)) return "";
    return u.origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** First suitable public origin, else {@link CANONICAL_PUBLIC_APP_URL}. */
export function resolvePublicAppBaseUrl(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const normalized = sanitizePublicAppUrl(raw);
    if (normalized) return normalized;
  }
  return CANONICAL_PUBLIC_APP_URL;
}
