/** Shared limits for POST /v2/weekly-report/send-email (Lambda + optional Next proxy). */

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export const WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES = 450_000;
export const WEEKLY_REPORT_EMAIL_SUBJECT_MAX = 200;

export type WeeklyReportEmailSendPayload = {
  htmlBody: string;
  textBody?: string;
  subject?: string;
};

export function validateWeeklyReportEmailPayload(raw: unknown):
  | { ok: true; value: WeeklyReportEmailSendPayload }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Expected JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const htmlBody = typeof o.htmlBody === "string" ? o.htmlBody : "";
  if (!htmlBody.trim()) {
    return { ok: false, error: "htmlBody is required." };
  }
  const bytes = utf8ByteLength(htmlBody);
  if (bytes > WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES) {
    return { ok: false, error: `htmlBody exceeds ${WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES} bytes.` };
  }
  const textBody = typeof o.textBody === "string" ? o.textBody : undefined;
  if (textBody != null && utf8ByteLength(textBody) > 100_000) {
    return { ok: false, error: "textBody is too large." };
  }
  let subject: string | undefined;
  if (typeof o.subject === "string" && o.subject.trim()) {
    subject = o.subject.trim().slice(0, WEEKLY_REPORT_EMAIL_SUBJECT_MAX);
  }
  return {
    ok: true,
    value: {
      htmlBody,
      ...(textBody != null && textBody.trim() ? { textBody: textBody.trim() } : {}),
      ...(subject ? { subject } : {}),
    },
  };
}
