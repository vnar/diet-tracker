/**
 * POST /v2/weekly-report/send-email — sends HTML to the caller's verified Cognito email via SES.
 * Uses TRANSACTIONAL_EMAIL_FROM when set; otherwise verified default ojashealth2026@gmail.com. Disabled when FF_WEEKLY_REPORT_EMAIL=false on the function.
 * Uses SendRawEmail (multipart/alternative + deliverability headers). User-initiated sends omit list-bulk
 * headers (List-ID / Auto-Submitted / List-Unsubscribe) so Gmail is less likely to treat them as bulk.
 * For best inbox placement, use a domain-aligned From + SES DKIM (not consumer @gmail.com).
 */
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { validateWeeklyReportEmailPayload } from "../../../lib/email/weeklyReportEmailPayload";
import { sendTransactionalWeeklyReportMime } from "./lib/transactionalWeeklySesSend";

type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

type JsonFn = (statusCode: number, payload: unknown) => HttpResult;

type EmailSendEvent = {
  body?: string | null;
};

const cognitoIdp = new CognitoIdentityProviderClient({});

function parseJson(event: EmailSendEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error("Invalid JSON");
  }
}

function weeklyReportEmailEnabled(): boolean {
  return process.env.FF_WEEKLY_REPORT_EMAIL === "true";
}

export async function handlePostV2WeeklyReportSendEmail(
  accessToken: string | undefined,
  event: EmailSendEvent,
  json: JsonFn,
): Promise<HttpResult> {
  if (!weeklyReportEmailEnabled()) {
    return json(403, { error: "Weekly report email is disabled for this deployment." });
  }
  if (!accessToken) {
    return json(401, { error: "Missing access token." });
  }

  let raw: unknown;
  try {
    raw = parseJson(event);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const validated = validateWeeklyReportEmailPayload(raw);
  if (!validated.ok) {
    return json(400, { error: validated.error });
  }
  const { htmlBody, textBody, subject } = validated.value;

  let email: string | undefined;
  let verified = false;
  try {
    const out = await cognitoIdp.send(new GetUserCommand({ AccessToken: accessToken }));
    const attrs = out.UserAttributes ?? [];
    email = attrs.find((a) => a.Name === "email")?.Value?.trim();
    verified = attrs.find((a) => a.Name === "email_verified")?.Value === "true";
  } catch {
    return json(401, { error: "Invalid or expired session." });
  }

  if (!email) {
    return json(400, { error: "No email address on this account." });
  }
  if (!verified) {
    return json(403, { error: "Verify your email in Cognito before receiving reports." });
  }

  const subj = subject?.trim() || "Your Ojas Health weekly report";

  try {
    await sendTransactionalWeeklyReportMime({
      to: email,
      subject: subj,
      html: htmlBody,
      textPlain: textBody?.trim(),
      emailKind: "transactional",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ msg: "weekly_report_ses_send_failed", err: msg }));
    return json(502, { error: "Could not send email. Check SES identity, region, and sandbox limits." });
  }

  return json(200, { ok: true, to: email });
}
