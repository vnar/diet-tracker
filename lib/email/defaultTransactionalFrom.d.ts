/**
 * Default SES "From" for weekly report + digest sends when `TRANSACTIONAL_EMAIL_FROM` is unset.
 * Must match a verified identity in Amazon SES (same region as the Lambda).
 */
export declare const DEFAULT_TRANSACTIONAL_EMAIL_FROM = "ojashealth2026@gmail.com";
/** Resolves the outbound From address; explicit env wins, otherwise product default. */
export declare function resolveTransactionalEmailFrom(): string;
