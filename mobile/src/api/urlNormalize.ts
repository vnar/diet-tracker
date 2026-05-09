/** Pure URL helpers (no Expo) — safe to import from Node/Vitest. */

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeAwsApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  return trimTrailingSlash(withScheme);
}
