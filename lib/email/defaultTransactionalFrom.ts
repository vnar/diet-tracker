/**
 * Default SES "From" for weekly report + digest sends when `TRANSACTIONAL_EMAIL_FROM` is unset.
 * Must match a verified identity in Amazon SES (same region as the Lambda).
 */
export const DEFAULT_TRANSACTIONAL_EMAIL_FROM = "ojashealth2026@gmail.com";

/** Resolves the outbound From address; explicit env wins, otherwise product default. */
export function resolveTransactionalEmailFrom(): string {
  const v = (process.env.TRANSACTIONAL_EMAIL_FROM ?? "").trim();
  return v || DEFAULT_TRANSACTIONAL_EMAIL_FROM;
}
