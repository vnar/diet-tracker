/**
 * Client-only hint for showing admin UI. Real enforcement is on the API (Lambda + ADMIN_EMAILS).
 */
export function isAppAdminViewer(email: string | undefined | null): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (!email?.trim() || !raw?.trim()) return false;
  const allow = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allow.has(email.trim().toLowerCase());
}
