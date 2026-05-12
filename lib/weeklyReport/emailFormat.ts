import type { WeeklyReportDocument } from "./types";
import {
  buildHumanEmailWeeklyBullets,
  humanEmailFooterNote,
  humanEmailLead,
} from "./emailHumanCopy";

/** When set, prepends a visible “transactional / consent” block for outbound email only (not in-app preview). */
export type WeeklyReportEmailDeliverabilityNotice = "userTapSend" | "scheduledDigest";

export type BuildWeeklyReportEmailOptions = {
  deliverabilityNotice?: WeeklyReportEmailDeliverabilityNotice;
};

function deliverabilityNoticeHtml(kind: WeeklyReportEmailDeliverabilityNotice): string {
  const box =
    "margin:0 0 18px;padding:12px 14px;border-radius:10px;border:1px solid #bbf7d0;background:#ecfdf5;font-size:13px;line-height:1.5;color:#166534;";
  const title = "display:block;margin-bottom:6px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#14532d;";
  const link = "color:#047857;text-decoration:underline;";
  if (kind === "userTapSend") {
    return `<div role="note" style="${box}">
      <strong style="${title}">Why you received this</strong>
      You asked Ojas Health to send this recap from the app (Send to my inbox). It is a personal summary from your logs—not a marketing list.
      <span style="display:block;margin-top:8px;font-size:12px;color:#15803d;">More: <a href="https://ojas-health.com/" style="${link}">ojas-health.com</a></span>
    </div>`;
  }
  return `<div role="note" style="${box}">
    <strong style="${title}">Why you received this</strong>
    Weekly recap emails are turned on in your Ojas Health settings. We only send this because you opted in.
    <span style="display:block;margin-top:8px;font-size:12px;color:#15803d;">Manage in the app or visit <a href="https://ojas-health.com/" style="${link}">ojas-health.com</a></span>
  </div>`;
}

function deliverabilityNoticePlain(kind: WeeklyReportEmailDeliverabilityNotice): string {
  if (kind === "userTapSend") {
    return [
      "Why you received this",
      "You asked Ojas Health to send this recap from the app (Send to my inbox). Personal summary from your logs—not marketing.",
      "https://ojas-health.com/",
    ].join("\n");
  }
  return [
    "Why you received this",
    "Weekly recap emails are turned on in your Ojas Health settings. We only send because you opted in.",
    "https://ojas-health.com/",
  ].join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]): string {
  if (!items.length) return "<p><em>No items.</em></p>";
  return `<ul style="margin:0;padding-left:1.1rem;line-height:1.55;">${items.map((t) => `<li style="margin:0 0 8px;color:#3f3f46;">${esc(t)}</li>`).join("")}</ul>`;
}

function aiInsightsEmailBlock(insights: NonNullable<WeeklyReportDocument["aiInsightsForEmail"]>): string {
  if (!insights.length) return "";
  const cards = insights
    .map((row) => {
      const badge =
        row.source === "llm"
          ? `<span style="display:inline-block;margin-bottom:8px;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:600;letter-spacing:0.02em;background:#ecfdf5;color:#047857;">Touched up with AI</span>`
          : `<span style="display:inline-block;margin-bottom:8px;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:600;letter-spacing:0.02em;background:#f4f4f5;color:#52525b;">From your logs</span>`;
      const detail = row.detail
        ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#3f3f46;">${esc(row.detail)}</p>`
        : "";
      return `<div style="margin:0 0 16px;padding:16px 16px 14px;border-radius:12px;border:1px solid #e4e4e7;background:#fafafa;">
        ${badge}
        <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#18181b;line-height:1.35;">${esc(row.headline)}</p>
        ${detail}
        <p style="margin:0;font-size:13px;line-height:1.5;color:#52525b;"><span style="color:#047857;font-weight:600;">Try:</span> ${esc(row.action)}</p>
      </div>`;
    })
    .join("");
  return `
      <div style="margin:28px 0 12px;padding:18px;border-radius:14px;border:1px solid #d4d4d8;background:linear-gradient(165deg,#fafafa 0%,#ffffff 55%);">
        <h2 style="font-size:17px;margin:0 0 6px;color:#18181b;font-weight:650;">A few reads from your week</h2>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#52525b;">Same nuggets you see in the app—here so you can skim them over coffee.</p>
        ${cards}
      </div>`;
}

/** Minimal inline-CSS HTML suitable for email clients (best-effort). Human-centric copy, not clinical report strings. */
export function buildWeeklyReportEmailHtml(
  doc: WeeklyReportDocument,
  options?: BuildWeeklyReportEmailOptions,
): string {
  const { sections, aggregate: agg } = doc;
  const exp = sections.nextExperiment;
  const aiBlock = doc.aiInsightsForEmail?.length ? aiInsightsEmailBlock(doc.aiInsightsForEmail) : "";
  const lead = humanEmailLead(doc);
  const bullets = buildHumanEmailWeeklyBullets(doc);
  const noticeBlock = options?.deliverabilityNotice
    ? deliverabilityNoticeHtml(options.deliverabilityNotice)
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${esc(lead.title)}</title></head>
<body style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#ececef;color:#18181b;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7;overflow:hidden;">
    <tr><td style="padding:26px 24px 22px;">
      ${noticeBlock}
      <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">Ojas weekly</p>
      <h1 style="font-size:22px;margin:0 0 12px;line-height:1.25;color:#18181b;font-weight:700;">${esc(lead.title)}</h1>
      <p style="margin:0 0 22px;color:#52525b;font-size:15px;line-height:1.55;">${esc(lead.tagline)}</p>
      ${aiBlock}
      <h2 style="font-size:16px;margin:0 0 10px;color:#18181b;font-weight:650;">What stood out</h2>
      ${listHtml(bullets)}
      <h2 style="font-size:16px;margin:28px 0 10px;color:#18181b;font-weight:650;">One thing to try next</h2>
      <p style="margin:0 0 8px;font-weight:600;font-size:15px;color:#27272a;">${esc(exp.title)}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3f3f46;">${esc(exp.description)}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:22px 0 16px;" />
      ${sections.disclaimers.length ? sections.disclaimers.map((d) => `<p style="font-size:12px;color:#71717a;line-height:1.45;margin:0 0 10px;">${esc(d)}</p>`).join("") : ""}
      <p style="font-size:12px;color:#a1a1aa;margin:0;line-height:1.45;">${esc(humanEmailFooterNote(doc))}</p>
    </td></tr>
  </table>
</body></html>`;
}

export function buildWeeklyReportEmailPlainText(
  doc: WeeklyReportDocument,
  options?: BuildWeeklyReportEmailOptions,
): string {
  const exp = doc.sections.nextExperiment;
  const lead = humanEmailLead(doc);
  const bullets = buildHumanEmailWeeklyBullets(doc);
  const noticePrefix = options?.deliverabilityNotice
    ? `${deliverabilityNoticePlain(options.deliverabilityNotice)}\n\n`
    : "";
  const aiLines =
    doc.aiInsightsForEmail?.map((row, i) => {
      const src = row.source === "llm" ? " (touched up with AI)" : "";
      const det = row.detail ? `\n  ${row.detail}` : "";
      return `${i + 1}. ${row.headline}${src}${det}\n   Try: ${row.action}`;
    }).join("\n\n") ?? "";
  const aiBlock =
    doc.aiInsightsForEmail?.length && aiLines
      ? `A few reads from your week\n${aiLines}\n\n`
      : "";
  const bulletBlock = bullets.map((l) => `• ${l}`).join("\n");
  const parts = [
    `${noticePrefix}Ojas weekly\n${lead.title}\n${lead.tagline}\n`,
    aiBlock,
    `What stood out\n${bulletBlock}\n`,
    `One thing to try next\n${exp.title}\n${exp.description}\n`,
    doc.sections.disclaimers.length
      ? `Note\n${doc.sections.disclaimers.map((d) => `- ${d}`).join("\n")}\n`
      : "",
    humanEmailFooterNote(doc),
  ];
  return parts.filter(Boolean).join("\n");
}
