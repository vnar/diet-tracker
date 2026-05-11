import { randomBytes } from "node:crypto";

/** Domains where From-address domain must not be used for Message-ID (third‑party send = misaligned). */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "msn.com",
  "aol.com",
]);

function wrap76Base64(b64: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }
  return chunks.join("\r\n");
}

/** RFC 2047 encoded-word (B) for UTF-8 subject when needed. */
export function encodeRfc2047Subject(subject: string): string {
  const oneLine = subject.replace(/\r\n|\n|\r/g, " ").trim();
  if (/^[\x09\x20-\x7E]*$/.test(oneLine)) {
    return oneLine;
  }
  const b = Buffer.from(oneLine, "utf8").toString("base64");
  return `=?UTF-8?B?${b}?=`;
}

/** RFC 2047 phrase or quoted-printable ASCII for display name in From. */
export function encodeFromDisplayName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "";
  if (/^[\x20-\x7E]*$/.test(t) && !t.includes('"') && !t.includes("\\")) {
    return `"${t}"`;
  }
  const b = Buffer.from(t, "utf8").toString("base64");
  return `=?UTF-8?B?${b}?=`;
}

/** Extract domain from a bare email or a `Name <user@host>` style address. */
export function domainFromEmail(from: string): string | null {
  const t = from.trim();
  const angle = t.match(/<([^>]+)>/);
  const addr = (angle?.[1] ?? t).trim();
  const at = addr.lastIndexOf("@");
  if (at < 0 || at === addr.length - 1) return null;
  return addr.slice(at + 1).trim().toLowerCase() || null;
}

export function isFreemailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Prefer explicit env domain for Message-ID (should match a domain you control + SES DKIM).
 * Otherwise use From domain unless it is a freemail consumer domain.
 */
export function resolveMessageIdDomain(
  fromAddress: string,
  explicitDomain: string | undefined,
): string | null {
  const ex = explicitDomain?.trim().toLowerCase();
  if (ex) return ex;
  const d = domainFromEmail(fromAddress);
  if (!d) return null;
  if (isFreemailDomain(d)) return null;
  return d;
}

export function buildMessageId(domain: string): string {
  const id = randomBytes(16).toString("hex");
  return `<weekly-${id}@${domain}>`;
}

/** Minimal HTML → plain fallback when client omits textBody (multipart improves inbox placement). */
export function htmlToPlainTextFallback(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const text = noScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 50_000);
}

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
export function buildMultipartAlternativeRfc822(opts: MultipartAlternativeRfc822Options): string {
  const boundary = `----=_Ojas_${randomBytes(12).toString("hex")}`;
  const date = opts.date ?? new Date();
  const dateStr = date.toUTCString();
  const fromLine = opts.fromDisplayName?.trim()
    ? `${encodeFromDisplayName(opts.fromDisplayName.trim())} <${opts.from.trim()}>`
    : opts.from.trim();

  const lines: string[] = [
    `From: ${fromLine}`,
    `To: ${opts.to.trim()}`,
    `Subject: ${encodeRfc2047Subject(opts.subject)}`,
    `Date: ${dateStr}`,
    "MIME-Version: 1.0",
    "X-Auto-Response-Suppress: All",
  ];

  if (opts.messageId?.trim()) {
    lines.push(`Message-ID: ${opts.messageId.trim()}`);
  }
  if (opts.replyTo?.trim()) {
    lines.push(`Reply-To: ${opts.replyTo.trim()}`);
  }
  if (opts.listUnsubscribe?.trim()) {
    const u = opts.listUnsubscribe.trim();
    lines.push(`List-Unsubscribe: <${u}>`);
    if (opts.listUnsubscribePost === true && u.startsWith("https://")) {
      lines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    }
  }
  if (opts.brandListDomain?.trim()) {
    const d = opts.brandListDomain.trim().toLowerCase();
    lines.push(`List-ID: "Ojas Health weekly digest" <weekly.${d}>`);
    lines.push("Auto-Submitted: auto-generated");
  }

  const textB64 = wrap76Base64(Buffer.from(opts.textPlain, "utf8").toString("base64"));
  const htmlB64 = wrap76Base64(Buffer.from(opts.html, "utf8").toString("base64"));

  lines.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    textB64,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    "",
    `--${boundary}--`,
    "",
  );

  return lines.join("\r\n");
}
