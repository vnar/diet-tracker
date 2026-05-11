/**
 * Shared SES SendRawEmail path for weekly report HTML (user-initiated API + scheduled digest).
 */
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import {
  buildMessageId,
  buildMultipartAlternativeRfc822,
  htmlToPlainTextFallback,
  resolveMessageIdDomain,
} from "../../../../lib/email/rfc822MultipartAlternative";

const ses = new SESClient({});

function transactionalFrom(): string {
  return (process.env.TRANSACTIONAL_EMAIL_FROM ?? "").trim();
}

function transactionalFromDisplayName(): string {
  return (process.env.TRANSACTIONAL_EMAIL_FROM_NAME ?? "Ojas Health").trim() || "Ojas Health";
}

function transactionalReplyTo(): string | undefined {
  const v = (process.env.TRANSACTIONAL_EMAIL_REPLY_TO ?? "").trim();
  return v || undefined;
}

function transactionalMessageIdDomain(): string | undefined {
  const v = (process.env.TRANSACTIONAL_EMAIL_MESSAGE_ID_DOMAIN ?? "").trim();
  return v || undefined;
}

function transactionalListUnsubscribeUrl(): string | undefined {
  const v = (process.env.TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_URL ?? "").trim();
  return v || undefined;
}

function transactionalBrandListDomain(): string | undefined {
  const v = (process.env.TRANSACTIONAL_EMAIL_BRAND_DOMAIN ?? "").trim();
  return v || undefined;
}

function transactionalListUnsubscribeOneClick(): boolean {
  return process.env.TRANSACTIONAL_EMAIL_LIST_UNSUBSCRIBE_ONE_CLICK === "true";
}

function resolvedListUnsubscribeUrl(): string | undefined {
  const explicit = transactionalListUnsubscribeUrl();
  if (explicit) return explicit;
  const brand = transactionalBrandListDomain();
  if (brand) return `https://${brand}/`;
  return undefined;
}

export async function sendTransactionalWeeklyReportMime(opts: {
  to: string;
  subject: string;
  html: string;
  textPlain?: string;
}): Promise<void> {
  const from = transactionalFrom();
  if (!from) throw new Error("TRANSACTIONAL_EMAIL_FROM is not configured");
  const textPlain = opts.textPlain?.trim() ? opts.textPlain.trim() : htmlToPlainTextFallback(opts.html);
  const midDomain = resolveMessageIdDomain(from, transactionalMessageIdDomain());
  const messageId = midDomain ? buildMessageId(midDomain) : undefined;
  const rawMime = buildMultipartAlternativeRfc822({
    from,
    fromDisplayName: transactionalFromDisplayName(),
    to: opts.to.trim(),
    subject: opts.subject.trim(),
    textPlain,
    html: opts.html,
    replyTo: transactionalReplyTo(),
    messageId,
    listUnsubscribe: resolvedListUnsubscribeUrl(),
    listUnsubscribePost: transactionalListUnsubscribeOneClick(),
    brandListDomain: transactionalBrandListDomain(),
  });
  await ses.send(
    new SendRawEmailCommand({
      Destinations: [opts.to.trim()],
      RawMessage: { Data: Buffer.from(rawMime, "utf8") },
    }),
  );
}
