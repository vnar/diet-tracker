"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWeeklyReportEmailHtml = buildWeeklyReportEmailHtml;
exports.buildWeeklyReportEmailPlainText = buildWeeklyReportEmailPlainText;
const emailHumanCopy_1 = require("./emailHumanCopy");
function deliverabilityNoticeHtml(kind) {
    const box = "margin:0 0 18px;padding:12px 14px;border-radius:10px;border:1px solid #bbf7d0;background:#ecfdf5;font-size:13px;line-height:1.5;color:#166534;";
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
function deliverabilityNoticePlain(kind) {
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
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function listHtml(items) {
    if (!items.length)
        return "<p><em>No items.</em></p>";
    return `<ul style="margin:0;padding-left:1.1rem;line-height:1.55;">${items.map((t) => `<li style="margin:0 0 8px;color:#3f3f46;">${esc(t)}</li>`).join("")}</ul>`;
}
function aiInsightsEmailBlock(insights) {
    if (!insights.length)
        return "";
    const cards = insights
        .map((row) => {
        const badge = row.source === "llm"
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
function buildWeeklyReportEmailHtml(doc, options) {
    const { sections, aggregate: agg } = doc;
    const exp = sections.nextExperiment;
    const aiBlock = doc.aiInsightsForEmail?.length ? aiInsightsEmailBlock(doc.aiInsightsForEmail) : "";
    const lead = (0, emailHumanCopy_1.humanEmailLead)(doc);
    const bullets = (0, emailHumanCopy_1.buildHumanEmailWeeklyBullets)(doc);
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
      <p style="font-size:12px;color:#a1a1aa;margin:0;line-height:1.45;">${esc((0, emailHumanCopy_1.humanEmailFooterNote)(doc))}</p>
    </td></tr>
  </table>
</body></html>`;
}
function buildWeeklyReportEmailPlainText(doc, options) {
    const exp = doc.sections.nextExperiment;
    const lead = (0, emailHumanCopy_1.humanEmailLead)(doc);
    const bullets = (0, emailHumanCopy_1.buildHumanEmailWeeklyBullets)(doc);
    const noticePrefix = options?.deliverabilityNotice
        ? `${deliverabilityNoticePlain(options.deliverabilityNotice)}\n\n`
        : "";
    const aiLines = doc.aiInsightsForEmail?.map((row, i) => {
        const src = row.source === "llm" ? " (touched up with AI)" : "";
        const det = row.detail ? `\n  ${row.detail}` : "";
        return `${i + 1}. ${row.headline}${src}${det}\n   Try: ${row.action}`;
    }).join("\n\n") ?? "";
    const aiBlock = doc.aiInsightsForEmail?.length && aiLines
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
        (0, emailHumanCopy_1.humanEmailFooterNote)(doc),
    ];
    return parts.filter(Boolean).join("\n");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWxGb3JtYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbWFpbEZvcm1hdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXlGQSxnRUFpQ0M7QUFFRCwwRUFnQ0M7QUEzSkQscURBSTBCO0FBUzFCLFNBQVMsd0JBQXdCLENBQUMsSUFBMkM7SUFDM0UsTUFBTSxHQUFHLEdBQ1AsZ0pBQWdKLENBQUM7SUFDbkosTUFBTSxLQUFLLEdBQUcsOEhBQThILENBQUM7SUFDN0ksTUFBTSxJQUFJLEdBQUcsMENBQTBDLENBQUM7SUFDeEQsSUFBSSxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7UUFDM0IsT0FBTywyQkFBMkIsR0FBRzt1QkFDbEIsS0FBSzs7aUlBRXFHLElBQUk7V0FDMUgsQ0FBQztJQUNWLENBQUM7SUFDRCxPQUFPLDJCQUEyQixHQUFHO3FCQUNsQixLQUFLOztvSkFFMEgsSUFBSTtTQUMvSSxDQUFDO0FBQ1YsQ0FBQztBQUVELFNBQVMseUJBQXlCLENBQUMsSUFBMkM7SUFDNUUsSUFBSSxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7UUFDM0IsT0FBTztZQUNMLHVCQUF1QjtZQUN2QiwwSEFBMEg7WUFDMUgsMEJBQTBCO1NBQzNCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2YsQ0FBQztJQUNELE9BQU87UUFDTCx1QkFBdUI7UUFDdkIsb0dBQW9HO1FBQ3BHLDBCQUEwQjtLQUMzQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLEdBQUcsQ0FBQyxDQUFTO0lBQ3BCLE9BQU8sQ0FBQztTQUNMLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDO1NBQ3RCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDN0IsQ0FBQztB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QUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzVELE1BQU0sS0FBSyxHQUFHO1FBQ1osR0FBRyxZQUFZLGdCQUFnQixJQUFJLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxPQUFPLElBQUk7UUFDOUQsT0FBTztRQUNQLG1CQUFtQixXQUFXLElBQUk7UUFDbEMsMEJBQTBCLEdBQUcsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLFdBQVcsSUFBSTtRQUMzRCxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNO1lBQzdCLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSTtZQUN2RSxDQUFDLENBQUMsRUFBRTtRQUNOLElBQUEscUNBQW9CLEVBQUMsR0FBRyxDQUFDO0tBQzFCLENBQUM7SUFDRixPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFdlZWtseVJlcG9ydERvY3VtZW50IH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7XG4gIGJ1aWxkSHVtYW5FbWFpbFdlZWtseUJ1bGxldHMsXG4gIGh1bWFuRW1haWxGb290ZXJOb3RlLFxuICBodW1hbkVtYWlsTGVhZCxcbn0gZnJvbSBcIi4vZW1haWxIdW1hbkNvcHlcIjtcblxuLyoqIFdoZW4gc2V0LCBwcmVwZW5kcyBhIHZpc2libGUg4oCcdHJhbnNhY3Rpb25hbCAvIGNvbnNlbnTigJ0gYmxvY2sgZm9yIG91dGJvdW5kIGVtYWlsIG9ubHkgKG5vdCBpbi1hcHAgcHJldmlldykuICovXG5leHBvcnQgdHlwZSBXZWVrbHlSZXBvcnRFbWFpbERlbGl2ZXJhYmlsaXR5Tm90aWNlID0gXCJ1c2VyVGFwU2VuZFwiIHwgXCJzY2hlZHVsZWREaWdlc3RcIjtcblxuZXhwb3J0IHR5cGUgQnVpbGRXZWVrbHlSZXBvcnRFbWFpbE9wdGlvbnMgPSB7XG4gIGRlbGl2ZXJhYmlsaXR5Tm90aWNlPzogV2Vla2x5UmVwb3J0RW1haWxEZWxpdmVyYWJpbGl0eU5vdGljZTtcbn07XG5cbmZ1bmN0aW9uIGRlbGl2ZXJhYmlsaXR5Tm90aWNlSHRtbChraW5kOiBXZWVrbHlSZXBvcnRFbWFpbERlbGl2ZXJhYmlsaXR5Tm90aWNlKTogc3RyaW5nIHtcbiAgY29uc3QgYm94ID1cbiAgICBcIm1hcmdpbjowIDAgMThweDtwYWRkaW5nOjEycHggMTRweDtib3JkZXItcmFkaXVzOjEwcHg7Ym9yZGVyOjFweCBzb2xpZCAjYmJmN2QwO2JhY2tncm91bmQ6I2VjZmRmNTtmb250LXNpemU6MTNweDtsaW5lLWhlaWdodDoxLjU7Y29sb3I6IzE2NjUzNDtcIjtcbiAgY29uc3QgdGl0bGUgPSBcImRpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo2cHg7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2xldHRlci1zcGFjaW5nOjAuMDZlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Y29sb3I6IzE0NTMyZDtcIjtcbiAgY29uc3QgbGluayA9IFwiY29sb3I6IzA0Nzg1Nzt0ZXh0LWRlY29yYXRpb246dW5kZXJsaW5lO1wiO1xuICBpZiAoa2luZCA9PT0gXCJ1c2VyVGFwU2VuZFwiKSB7XG4gICAgcmV0dXJuIGA8ZGl2IHJvbGU9XCJub3RlXCIgc3R5bGU9XCIke2JveH1cIj5cbiAgICAgIDxzdHJvbmcgc3R5bGU9XCIke3RpdGxlfVwiPldoeSB5b3UgcmVjZWl2ZWQgdGhpczwvc3Ryb25nPlxuICAgICAgWW91IGFza2VkIE9qYXMgSGVhbHRoIHRvIHNlbmQgdGhpcyByZWNhcCBmcm9tIHRoZSBhcHAgKFNlbmQgdG8gbXkgaW5ib3gpLiBJdCBpcyBhIHBlcnNvbmFsIHN1bW1hcnkgZnJvbSB5b3VyIGxvZ3PigJRub3QgYSBtYXJrZXRpbmcgbGlzdC5cbiAgICAgIDxzcGFuIHN0eWxlPVwiZGlzcGxheTpibG9jazttYXJnaW4tdG9wOjhweDtmb250LXNpemU6MTJweDtjb2xvcjojMTU4MDNkO1wiPk1vcmU6IDxhIGhyZWY9XCJodHRwczovL29qYXMtaGVhbHRoLmNvbS9cIiBzdHlsZT1cIiR7bGlua31cIj5vamFzLWhlYWx0aC5jb208L2E+PC9zcGFuPlxuICAgIDwvZGl2PmA7XG4gIH1cbiAgcmV0dXJuIGA8ZGl2IHJvbGU9XCJub3RlXCIgc3R5bGU9XCIke2JveH1cIj5cbiAgICA8c3Ryb25nIHN0eWxlPVwiJHt0aXRsZX1cIj5XaHkgeW91IHJlY2VpdmVkIHRoaXM8L3N0cm9uZz5cbiAgICBXZWVrbHkgcmVjYXAgZW1haWxzIGFyZSB0dXJuZWQgb24gaW4geW91ciBPamFzIEhlYWx0aCBzZXR0aW5ncy4gV2Ugb25seSBzZW5kIHRoaXMgYmVjYXVzZSB5b3Ugb3B0ZWQgaW4uXG4gICAgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6OHB4O2ZvbnQtc2l6ZToxMnB4O2NvbG9yOiMxNTgwM2Q7XCI+TWFuYWdlIGluIHRoZSBhcHAgb3IgdmlzaXQgPGEgaHJlZj1cImh0dHBzOi8vb2phcy1oZWFsdGguY29tL1wiIHN0eWxlPVwiJHtsaW5rfVwiPm9qYXMtaGVhbHRoLmNvbTwvYT48L3NwYW4+XG4gIDwvZGl2PmA7XG59XG5cbmZ1bmN0aW9uIGRlbGl2ZXJhYmlsaXR5Tm90aWNlUGxhaW4oa2luZDogV2Vla2x5UmVwb3J0RW1haWxEZWxpdmVyYWJpbGl0eU5vdGljZSk6IHN0cmluZyB7XG4gIGlmIChraW5kID09PSBcInVzZXJUYXBTZW5kXCIpIHtcbiAgICByZXR1cm4gW1xuICAgICAgXCJXaHkgeW91IHJlY2VpdmVkIHRoaXNcIixcbiAgICAgIFwiWW91IGFza2VkIE9qYXMgSGVhbHRoIHRvIHNlbmQgdGhpcyByZWNhcCBmcm9tIHRoZSBhcHAgKFNlbmQgdG8gbXkgaW5ib3gpLiBQZXJzb25hbCBzdW1tYXJ5IGZyb20geW91ciBsb2dz4oCUbm90IG1hcmtldGluZy5cIixcbiAgICAgIFwiaHR0cHM6Ly9vamFzLWhlYWx0aC5jb20vXCIsXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuICB9XG4gIHJldHVybiBbXG4gICAgXCJXaHkgeW91IHJlY2VpdmVkIHRoaXNcIixcbiAgICBcIldlZWtseSByZWNhcCBlbWFpbHMgYXJlIHR1cm5lZCBvbiBpbiB5b3VyIE9qYXMgSGVhbHRoIHNldHRpbmdzLiBXZSBvbmx5IHNlbmQgYmVjYXVzZSB5b3Ugb3B0ZWQgaW4uXCIsXG4gICAgXCJodHRwczovL29qYXMtaGVhbHRoLmNvbS9cIixcbiAgXS5qb2luKFwiXFxuXCIpO1xufVxuXG5mdW5jdGlvbiBlc2Moczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpXG4gICAgLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpXG4gICAgLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpXG4gICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpO1xufVxuXG5mdW5jdGlvbiBsaXN0SHRtbChpdGVtczogc3RyaW5nW10pOiBzdHJpbmcge1xuICBpZiAoIWl0ZW1zLmxlbmd0aCkgcmV0dXJuIFwiPHA+PGVtPk5vIGl0ZW1zLjwvZW0+PC9wPlwiO1xuICByZXR1cm4gYDx1bCBzdHlsZT1cIm1hcmdpbjowO3BhZGRpbmctbGVmdDoxLjFyZW07bGluZS1oZWlnaHQ6MS41NTtcIj4ke2l0ZW1zLm1hcCgodCkgPT4gYDxsaSBzdHlsZT1cIm1hcmdpbjowIDAgOHB4O2NvbG9yOiMzZjNmNDY7XCI+JHtlc2ModCl9PC9saT5gKS5qb2luKFwiXCIpfTwvdWw+YDtcbn1cblxuZnVuY3Rpb24gYWlJbnNpZ2h0c0VtYWlsQmxvY2soaW5zaWdodHM6IE5vbk51bGxhYmxlPFdlZWtseVJlcG9ydERvY3VtZW50W1wiYWlJbnNpZ2h0c0ZvckVtYWlsXCJdPik6IHN0cmluZyB7XG4gIGlmICghaW5zaWdodHMubGVuZ3RoKSByZXR1cm4gXCJcIjtcbiAgY29uc3QgY2FyZHMgPSBpbnNpZ2h0c1xuICAgIC5tYXAoKHJvdykgPT4ge1xuICAgICAgY29uc3QgYmFkZ2UgPVxuICAgICAgICByb3cuc291cmNlID09PSBcImxsbVwiXG4gICAgICAgICAgPyBgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1ibG9jazttYXJnaW4tYm90dG9tOjhweDtwYWRkaW5nOjNweCAxMHB4O2JvcmRlci1yYWRpdXM6OTk5OXB4O2ZvbnQtc2l6ZToxMHB4O2ZvbnQtd2VpZ2h0OjYwMDtsZXR0ZXItc3BhY2luZzowLjAyZW07YmFja2dyb3VuZDojZWNmZGY1O2NvbG9yOiMwNDc4NTc7XCI+VG91Y2hlZCB1cCB3aXRoIEFJPC9zcGFuPmBcbiAgICAgICAgICA6IGA8c3BhbiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWJsb2NrO21hcmdpbi1ib3R0b206OHB4O3BhZGRpbmc6M3B4IDEwcHg7Ym9yZGVyLXJhZGl1czo5OTk5cHg7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NjAwO2xldHRlci1zcGFjaW5nOjAuMDJlbTtiYWNrZ3JvdW5kOiNmNGY0ZjU7Y29sb3I6IzUyNTI1YjtcIj5Gcm9tIHlvdXIgbG9nczwvc3Bhbj5gO1xuICAgICAgY29uc3QgZGV0YWlsID0gcm93LmRldGFpbFxuICAgICAgICA/IGA8cCBzdHlsZT1cIm1hcmdpbjowIDAgMTBweDtmb250LXNpemU6MTRweDtsaW5lLWhlaWdodDoxLjU1O2NvbG9yOiMzZjNmNDY7XCI+JHtlc2Mocm93LmRldGFpbCl9PC9wPmBcbiAgICAgICAgOiBcIlwiO1xuICAgICAgcmV0dXJuIGA8ZGl2IHN0eWxlPVwibWFyZ2luOjAgMCAxNnB4O3BhZGRpbmc6MTZweCAxNnB4IDE0cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2JvcmRlcjoxcHggc29saWQgI2U0ZTRlNztiYWNrZ3JvdW5kOiNmYWZhZmE7XCI+XG4gICAgICAgICR7YmFkZ2V9XG4gICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCA4cHg7Zm9udC1zaXplOjE2cHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOiMxODE4MWI7bGluZS1oZWlnaHQ6MS4zNTtcIj4ke2VzYyhyb3cuaGVhZGxpbmUpfTwvcD5cbiAgICAgICAgJHtkZXRhaWx9XG4gICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjA7Zm9udC1zaXplOjEzcHg7bGluZS1oZWlnaHQ6MS41O2NvbG9yOiM1MjUyNWI7XCI+PHNwYW4gc3R5bGU9XCJjb2xvcjojMDQ3ODU3O2ZvbnQtd2VpZ2h0OjYwMDtcIj5Ucnk6PC9zcGFuPiAke2VzYyhyb3cuYWN0aW9uKX08L3A+XG4gICAgICA8L2Rpdj5gO1xuICAgIH0pXG4gICAgLmpvaW4oXCJcIik7XG4gIHJldHVybiBgXG4gICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luOjI4cHggMCAxMnB4O3BhZGRpbmc6MThweDtib3JkZXItcmFkaXVzOjE0cHg7Ym9yZGVyOjFweCBzb2xpZCAjZDRkNGQ4O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2NWRlZywjZmFmYWZhIDAlLCNmZmZmZmYgNTUlKTtcIj5cbiAgICAgICAgPGgyIHN0eWxlPVwiZm9udC1zaXplOjE3cHg7bWFyZ2luOjAgMCA2cHg7Y29sb3I6IzE4MTgxYjtmb250LXdlaWdodDo2NTA7XCI+QSBmZXcgcmVhZHMgZnJvbSB5b3VyIHdlZWs8L2gyPlxuICAgICAgICA8cCBzdHlsZT1cIm1hcmdpbjowIDAgMTZweDtmb250LXNpemU6MTNweDtsaW5lLWhlaWdodDoxLjU7Y29sb3I6IzUyNTI1YjtcIj5TYW1lIG51Z2dldHMgeW91IHNlZSBpbiB0aGUgYXBw4oCUaGVyZSBzbyB5b3UgY2FuIHNraW0gdGhlbSBvdmVyIGNvZmZlZS48L3A+XG4gICAgICAgICR7Y2FyZHN9XG4gICAgICA8L2Rpdj5gO1xufVxuXG4vKiogTWluaW1hbCBpbmxpbmUtQ1NTIEhUTUwgc3VpdGFibGUgZm9yIGVtYWlsIGNsaWVudHMgKGJlc3QtZWZmb3J0KS4gSHVtYW4tY2VudHJpYyBjb3B5LCBub3QgY2xpbmljYWwgcmVwb3J0IHN0cmluZ3MuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRXZWVrbHlSZXBvcnRFbWFpbEh0bWwoXG4gIGRvYzogV2Vla2x5UmVwb3J0RG9jdW1lbnQsXG4gIG9wdGlvbnM/OiBCdWlsZFdlZWtseVJlcG9ydEVtYWlsT3B0aW9ucyxcbik6IHN0cmluZyB7XG4gIGNvbnN0IHsgc2VjdGlvbnMsIGFnZ3JlZ2F0ZTogYWdnIH0gPSBkb2M7XG4gIGNvbnN0IGV4cCA9IHNlY3Rpb25zLm5leHRFeHBlcmltZW50O1xuICBjb25zdCBhaUJsb2NrID0gZG9jLmFpSW5zaWdodHNGb3JFbWFpbD8ubGVuZ3RoID8gYWlJbnNpZ2h0c0VtYWlsQmxvY2soZG9jLmFpSW5zaWdodHNGb3JFbWFpbCkgOiBcIlwiO1xuICBjb25zdCBsZWFkID0gaHVtYW5FbWFpbExlYWQoZG9jKTtcbiAgY29uc3QgYnVsbGV0cyA9IGJ1aWxkSHVtYW5FbWFpbFdlZWtseUJ1bGxldHMoZG9jKTtcbiAgY29uc3Qgbm90aWNlQmxvY2sgPSBvcHRpb25zPy5kZWxpdmVyYWJpbGl0eU5vdGljZVxuICAgID8gZGVsaXZlcmFiaWxpdHlOb3RpY2VIdG1sKG9wdGlvbnMuZGVsaXZlcmFiaWxpdHlOb3RpY2UpXG4gICAgOiBcIlwiO1xuICByZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuPGh0bWw+PGhlYWQ+PG1ldGEgY2hhcnNldD1cInV0Zi04XCIgLz48dGl0bGU+JHtlc2MobGVhZC50aXRsZSl9PC90aXRsZT48L2hlYWQ+XG48Ym9keSBzdHlsZT1cImZvbnQtZmFtaWx5OnN5c3RlbS11aSxTZWdvZSBVSSxSb2JvdG8sSGVsdmV0aWNhLEFyaWFsLHNhbnMtc2VyaWY7YmFja2dyb3VuZDojZWNlY2VmO2NvbG9yOiMxODE4MWI7cGFkZGluZzoyNHB4O1wiPlxuICA8dGFibGUgd2lkdGg9XCIxMDAlXCIgY2VsbHBhZGRpbmc9XCIwXCIgY2VsbHNwYWNpbmc9XCIwXCIgcm9sZT1cInByZXNlbnRhdGlvblwiIHN0eWxlPVwibWF4LXdpZHRoOjU2MHB4O21hcmdpbjowIGF1dG87YmFja2dyb3VuZDojZmZmZmZmO2JvcmRlci1yYWRpdXM6MTRweDtib3JkZXI6MXB4IHNvbGlkICNlNGU0ZTc7b3ZlcmZsb3c6aGlkZGVuO1wiPlxuICAgIDx0cj48dGQgc3R5bGU9XCJwYWRkaW5nOjI2cHggMjRweCAyMnB4O1wiPlxuICAgICAgJHtub3RpY2VCbG9ja31cbiAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCAxMHB4O2ZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjYwMDtsZXR0ZXItc3BhY2luZzowLjE0ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOiM3MTcxN2E7XCI+T2phcyB3ZWVrbHk8L3A+XG4gICAgICA8aDEgc3R5bGU9XCJmb250LXNpemU6MjJweDttYXJnaW46MCAwIDEycHg7bGluZS1oZWlnaHQ6MS4yNTtjb2xvcjojMTgxODFiO2ZvbnQtd2VpZ2h0OjcwMDtcIj4ke2VzYyhsZWFkLnRpdGxlKX08L2gxPlxuICAgICAgPHAgc3R5bGU9XCJtYXJnaW46MCAwIDIycHg7Y29sb3I6IzUyNTI1Yjtmb250LXNpemU6MTVweDtsaW5lLWhlaWdodDoxLjU1O1wiPiR7ZXNjKGxlYWQudGFnbGluZSl9PC9wPlxuICAgICAgJHthaUJsb2NrfVxuICAgICAgPGgyIHN0eWxlPVwiZm9udC1zaXplOjE2cHg7bWFyZ2luOjAgMCAxMHB4O2NvbG9yOiMxODE4MWI7Zm9udC13ZWlnaHQ6NjUwO1wiPldoYXQgc3Rvb2Qgb3V0PC9oMj5cbiAgICAgICR7bGlzdEh0bWwoYnVsbGV0cyl9XG4gICAgICA8aDIgc3R5bGU9XCJmb250LXNpemU6MTZweDttYXJnaW46MjhweCAwIDEwcHg7Y29sb3I6IzE4MTgxYjtmb250LXdlaWdodDo2NTA7XCI+T25lIHRoaW5nIHRvIHRyeSBuZXh0PC9oMj5cbiAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCA4cHg7Zm9udC13ZWlnaHQ6NjAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOiMyNzI3MmE7XCI+JHtlc2MoZXhwLnRpdGxlKX08L3A+XG4gICAgICA8cCBzdHlsZT1cIm1hcmdpbjowIDAgMjBweDtmb250LXNpemU6MTVweDtsaW5lLWhlaWdodDoxLjU1O2NvbG9yOiMzZjNmNDY7XCI+JHtlc2MoZXhwLmRlc2NyaXB0aW9uKX08L3A+XG4gICAgICA8aHIgc3R5bGU9XCJib3JkZXI6bm9uZTtib3JkZXItdG9wOjFweCBzb2xpZCAjZTRlNGU3O21hcmdpbjoyMnB4IDAgMTZweDtcIiAvPlxuICAgICAgJHtzZWN0aW9ucy5kaXNjbGFpbWVycy5sZW5ndGggPyBzZWN0aW9ucy5kaXNjbGFpbWVycy5tYXAoKGQpID0+IGA8cCBzdHlsZT1cImZvbnQtc2l6ZToxMnB4O2NvbG9yOiM3MTcxN2E7bGluZS1oZWlnaHQ6MS40NTttYXJnaW46MCAwIDEwcHg7XCI+JHtlc2MoZCl9PC9wPmApLmpvaW4oXCJcIikgOiBcIlwifVxuICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6MTJweDtjb2xvcjojYTFhMWFhO21hcmdpbjowO2xpbmUtaGVpZ2h0OjEuNDU7XCI+JHtlc2MoaHVtYW5FbWFpbEZvb3Rlck5vdGUoZG9jKSl9PC9wPlxuICAgIDwvdGQ+PC90cj5cbiAgPC90YWJsZT5cbjwvYm9keT48L2h0bWw+YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV2Vla2x5UmVwb3J0RW1haWxQbGFpblRleHQoXG4gIGRvYzogV2Vla2x5UmVwb3J0RG9jdW1lbnQsXG4gIG9wdGlvbnM/OiBCdWlsZFdlZWtseVJlcG9ydEVtYWlsT3B0aW9ucyxcbik6IHN0cmluZyB7XG4gIGNvbnN0IGV4cCA9IGRvYy5zZWN0aW9ucy5uZXh0RXhwZXJpbWVudDtcbiAgY29uc3QgbGVhZCA9IGh1bWFuRW1haWxMZWFkKGRvYyk7XG4gIGNvbnN0IGJ1bGxldHMgPSBidWlsZEh1bWFuRW1haWxXZWVrbHlCdWxsZXRzKGRvYyk7XG4gIGNvbnN0IG5vdGljZVByZWZpeCA9IG9wdGlvbnM/LmRlbGl2ZXJhYmlsaXR5Tm90aWNlXG4gICAgPyBgJHtkZWxpdmVyYWJpbGl0eU5vdGljZVBsYWluKG9wdGlvbnMuZGVsaXZlcmFiaWxpdHlOb3RpY2UpfVxcblxcbmBcbiAgICA6IFwiXCI7XG4gIGNvbnN0IGFpTGluZXMgPVxuICAgIGRvYy5haUluc2lnaHRzRm9yRW1haWw/Lm1hcCgocm93LCBpKSA9PiB7XG4gICAgICBjb25zdCBzcmMgPSByb3cuc291cmNlID09PSBcImxsbVwiID8gXCIgKHRvdWNoZWQgdXAgd2l0aCBBSSlcIiA6IFwiXCI7XG4gICAgICBjb25zdCBkZXQgPSByb3cuZGV0YWlsID8gYFxcbiAgJHtyb3cuZGV0YWlsfWAgOiBcIlwiO1xuICAgICAgcmV0dXJuIGAke2kgKyAxfS4gJHtyb3cuaGVhZGxpbmV9JHtzcmN9JHtkZXR9XFxuICAgVHJ5OiAke3Jvdy5hY3Rpb259YDtcbiAgICB9KS5qb2luKFwiXFxuXFxuXCIpID8/IFwiXCI7XG4gIGNvbnN0IGFpQmxvY2sgPVxuICAgIGRvYy5haUluc2lnaHRzRm9yRW1haWw/Lmxlbmd0aCAmJiBhaUxpbmVzXG4gICAgICA/IGBBIGZldyByZWFkcyBmcm9tIHlvdXIgd2Vla1xcbiR7YWlMaW5lc31cXG5cXG5gXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGJ1bGxldEJsb2NrID0gYnVsbGV0cy5tYXAoKGwpID0+IGDigKIgJHtsfWApLmpvaW4oXCJcXG5cIik7XG4gIGNvbnN0IHBhcnRzID0gW1xuICAgIGAke25vdGljZVByZWZpeH1PamFzIHdlZWtseVxcbiR7bGVhZC50aXRsZX1cXG4ke2xlYWQudGFnbGluZX1cXG5gLFxuICAgIGFpQmxvY2ssXG4gICAgYFdoYXQgc3Rvb2Qgb3V0XFxuJHtidWxsZXRCbG9ja31cXG5gLFxuICAgIGBPbmUgdGhpbmcgdG8gdHJ5IG5leHRcXG4ke2V4cC50aXRsZX1cXG4ke2V4cC5kZXNjcmlwdGlvbn1cXG5gLFxuICAgIGRvYy5zZWN0aW9ucy5kaXNjbGFpbWVycy5sZW5ndGhcbiAgICAgID8gYE5vdGVcXG4ke2RvYy5zZWN0aW9ucy5kaXNjbGFpbWVycy5tYXAoKGQpID0+IGAtICR7ZH1gKS5qb2luKFwiXFxuXCIpfVxcbmBcbiAgICAgIDogXCJcIixcbiAgICBodW1hbkVtYWlsRm9vdGVyTm90ZShkb2MpLFxuICBdO1xuICByZXR1cm4gcGFydHMuZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCJcXG5cIik7XG59XG4iXX0=