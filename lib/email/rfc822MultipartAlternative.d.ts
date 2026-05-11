/** RFC 2047 encoded-word (B) for UTF-8 subject when needed. */
export declare function encodeRfc2047Subject(subject: string): string;
/** RFC 2047 phrase or quoted-printable ASCII for display name in From. */
export declare function encodeFromDisplayName(displayName: string): string;
/** Extract domain from a bare email or a `Name <user@host>` style address. */
export declare function domainFromEmail(from: string): string | null;
export declare function isFreemailDomain(domain: string): boolean;
/**
 * Prefer explicit env domain for Message-ID (should match a domain you control + SES DKIM).
 * Otherwise use From domain unless it is a freemail consumer domain.
 */
export declare function resolveMessageIdDomain(fromAddress: string, explicitDomain: string | undefined): string | null;
export declare function buildMessageId(domain: string): string;
/** Minimal HTML → plain fallback when client omits textBody (multipart improves inbox placement). */
export declare function htmlToPlainTextFallback(html: string): string;
export type MultipartAlternativeRfc822Options = {
    from: string;
    fromDisplayName?: string;
    to: string;
    subject: string;
    textPlain: string;
    html: string;
    replyTo?: string;
    messageId?: string;
    /** Single angle-addr URL or mailto:, e.g. https://example.com/prefs */
    listUnsubscribe?: string;
    /**
     * When true and listUnsubscribe is https, adds RFC 8058 one-click. Default false so static sites
     * are not spam-penalized for rejecting POST.
     */
    listUnsubscribePost?: boolean;
    /**
     * Registered site domain (e.g. ojas-health.com). Adds RFC 3834 + RFC 2919 List-ID without
     * claiming From alignment — helps providers classify user-initiated digests.
     */
    brandListDomain?: string;
    date?: Date;
};
/**
 * RFC 5322-ish multipart/alternative message with base64 bodies (UTF-8 safe).
 * CRLF line endings throughout.
 */
export declare function buildMultipartAlternativeRfc822(opts: MultipartAlternativeRfc822Options): string;
