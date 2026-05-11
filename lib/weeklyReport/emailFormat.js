"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWeeklyReportEmailHtml = buildWeeklyReportEmailHtml;
exports.buildWeeklyReportEmailPlainText = buildWeeklyReportEmailPlainText;
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
    return `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}
function aiInsightsEmailBlock(insights) {
    if (!insights.length)
        return "";
    const cards = insights
        .map((row) => {
        const badge = row.source === "llm"
            ? `<span style="display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;background:#ecfdf5;color:#047857;">AI refined</span>`
            : `<span style="display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;background:#f4f4f5;color:#52525b;">Insights</span>`;
        const detail = row.detail
            ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#3f3f46;">${esc(row.detail)}</p>`
            : "";
        return `<div style="margin:0 0 14px;padding:14px 14px 12px;border-radius:10px;border:1px solid #e4e4e7;background:linear-gradient(135deg,#fafafa 0%,#ffffff 55%);">
        ${badge}
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#18181b;line-height:1.35;">${esc(row.headline)}</p>
        ${detail}
        <p style="margin:0;font-size:12px;line-height:1.45;color:#52525b;"><span style="font-weight:600;color:#71717a;">Try this:</span> ${esc(row.action)}</p>
      </div>`;
    })
        .join("");
    return `
      <div style="margin:24px 0 8px;padding:16px;border-radius:12px;border:1px solid #d9f99d;background:linear-gradient(180deg,#f7fee7 0%,#ffffff 72%);">
        <h2 style="font-size:15px;margin:0 0 4px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:18px;line-height:1;" aria-hidden="true">✨</span>
          AI insights for you
        </h2>
        <p style="margin:0 0 12px;font-size:12px;line-height:1.45;color:#57534e;">Pulled from your live Ojas Health insights — same engine as the dashboard.</p>
        ${cards}
      </div>`;
}
function emailFooterSourceLine(doc) {
    const base = `${doc.generationSource}`;
    if (doc.aiInsightsForEmail?.length) {
        return `${base} weekly card · ${doc.aiInsightsForEmail.length} insight card(s) from AI insights`;
    }
    return base;
}
/** Minimal inline-CSS HTML suitable for pasting into email clients (best-effort). */
function buildWeeklyReportEmailHtml(doc) {
    const { sections, aggregate: agg } = doc;
    const exp = sections.nextExperiment;
    const aiBlock = doc.aiInsightsForEmail?.length ? aiInsightsEmailBlock(doc.aiInsightsForEmail) : "";
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${esc(sections.title)}</title></head>
<body style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;color:#18181b;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:24px;">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 8px;">${esc(sections.title)}</h1>
      <p style="margin:0 0 16px;color:#52525b;font-size:14px;">${esc(sections.subtitle)}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#71717a;">Window: ${esc(agg.weekStart)} – ${esc(agg.weekEnd)}</p>
      ${aiBlock}
      <h2 style="font-size:15px;margin:20px 0 8px;">What changed</h2>
      ${listHtml(sections.whatChanged)}
      <h2 style="font-size:15px;margin:20px 0 8px;">What helped</h2>
      ${listHtml(sections.whatHelped)}
      <h2 style="font-size:15px;margin:20px 0 8px;">What may have made things harder</h2>
      ${listHtml(sections.whatHarder)}
      <h2 style="font-size:15px;margin:20px 0 8px;">One experiment for next week</h2>
      <p style="margin:0 0 6px;font-weight:600;">${esc(exp.title)}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${esc(exp.description)}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />
      ${sections.disclaimers.map((d) => `<p style="font-size:12px;color:#71717a;line-height:1.45;margin:0 0 10px;">${esc(d)}</p>`).join("")}
      <p style="font-size:11px;color:#a1a1aa;margin:16px 0 0;">Generated ${esc(doc.generatedAt)} · ${esc(emailFooterSourceLine(doc))}</p>
    </td></tr>
  </table>
</body></html>`;
}
function buildWeeklyReportEmailPlainText(doc) {
    const s = doc.sections;
    const exp = s.nextExperiment;
    const aiLines = doc.aiInsightsForEmail?.map((row, i) => {
        const src = row.source === "llm" ? " (AI refined)" : "";
        const det = row.detail ? `\n  ${row.detail}` : "";
        return `${i + 1}. ${row.headline}${src}${det}\n   Try: ${row.action}`;
    }).join("\n\n") ?? "";
    const aiBlock = doc.aiInsightsForEmail?.length && aiLines
        ? `AI insights for you\n${aiLines}\n\n`
        : "";
    const blocks = [
        `${s.title}\n${s.subtitle}\n`,
        aiBlock,
        `What changed\n${s.whatChanged.map((l) => `- ${l}`).join("\n")}\n`,
        `What helped\n${s.whatHelped.map((l) => `- ${l}`).join("\n")}\n`,
        `What may have made things harder\n${s.whatHarder.map((l) => `- ${l}`).join("\n")}\n`,
        `One experiment for next week\n${exp.title}\n${exp.description}\n`,
        `Disclaimers\n${s.disclaimers.map((d) => `- ${d}`).join("\n")}\n`,
        `Generated: ${doc.generatedAt} (${emailFooterSourceLine(doc)})`,
    ];
    return blocks.join("\n");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1haWxGb3JtYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbWFpbEZvcm1hdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXNEQSxnRUE0QkM7QUFFRCwwRUF3QkM7QUExR0QsU0FBUyxHQUFHLENBQUMsQ0FBUztJQUNwQixPQUFPLENBQUM7U0FDTCxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQztTQUN0QixPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztTQUNyQixPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztTQUNyQixPQUFPLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFFRCxTQUFTLFFBQVEsQ0FBQyxLQUFlO0lBQy9CLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTTtRQUFFLE9BQU8sMkJBQTJCLENBQUM7SUFDdEQsT0FBTyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQztBQUN2RSxDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxRQUFpRTtJQUM3RixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU07UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUNoQyxNQUFNLEtBQUssR0FBRyxRQUFRO1NBQ25CLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1FBQ1gsTUFBTSxLQUFLLEdBQ1QsR0FBRyxDQUFDLE1BQU0sS0FBSyxLQUFLO1lBQ2xCLENBQUMsQ0FBQyw2TkFBNk47WUFDL04sQ0FBQyxDQUFDLDJOQUEyTixDQUFDO1FBQ2xPLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNO1lBQ3ZCLENBQUMsQ0FBQyw0RUFBNEUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTTtZQUNuRyxDQUFDLENBQUMs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QUFJLENBQUMsQ0FBQztBQUMzQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBXZWVrbHlSZXBvcnREb2N1bWVudCB9IGZyb20gXCJAL2xpYi93ZWVrbHlSZXBvcnQvdHlwZXNcIjtcblxuZnVuY3Rpb24gZXNjKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyYvZywgXCImYW1wO1wiKVxuICAgIC5yZXBsYWNlKC88L2csIFwiJmx0O1wiKVxuICAgIC5yZXBsYWNlKC8+L2csIFwiJmd0O1wiKVxuICAgIC5yZXBsYWNlKC9cIi9nLCBcIiZxdW90O1wiKTtcbn1cblxuZnVuY3Rpb24gbGlzdEh0bWwoaXRlbXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcbiAgaWYgKCFpdGVtcy5sZW5ndGgpIHJldHVybiBcIjxwPjxlbT5ObyBpdGVtcy48L2VtPjwvcD5cIjtcbiAgcmV0dXJuIGA8dWw+JHtpdGVtcy5tYXAoKHQpID0+IGA8bGk+JHtlc2ModCl9PC9saT5gKS5qb2luKFwiXCIpfTwvdWw+YDtcbn1cblxuZnVuY3Rpb24gYWlJbnNpZ2h0c0VtYWlsQmxvY2soaW5zaWdodHM6IE5vbk51bGxhYmxlPFdlZWtseVJlcG9ydERvY3VtZW50W1wiYWlJbnNpZ2h0c0ZvckVtYWlsXCJdPik6IHN0cmluZyB7XG4gIGlmICghaW5zaWdodHMubGVuZ3RoKSByZXR1cm4gXCJcIjtcbiAgY29uc3QgY2FyZHMgPSBpbnNpZ2h0c1xuICAgIC5tYXAoKHJvdykgPT4ge1xuICAgICAgY29uc3QgYmFkZ2UgPVxuICAgICAgICByb3cuc291cmNlID09PSBcImxsbVwiXG4gICAgICAgICAgPyBgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1ibG9jazttYXJnaW4tYm90dG9tOjZweDtwYWRkaW5nOjJweCA4cHg7Ym9yZGVyLXJhZGl1czo5OTk5cHg7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NjAwO2xldHRlci1zcGFjaW5nOjAuMDRlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7YmFja2dyb3VuZDojZWNmZGY1O2NvbG9yOiMwNDc4NTc7XCI+QUkgcmVmaW5lZDwvc3Bhbj5gXG4gICAgICAgICAgOiBgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1ibG9jazttYXJnaW4tYm90dG9tOjZweDtwYWRkaW5nOjJweCA4cHg7Ym9yZGVyLXJhZGl1czo5OTk5cHg7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NjAwO2xldHRlci1zcGFjaW5nOjAuMDRlbTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7YmFja2dyb3VuZDojZjRmNGY1O2NvbG9yOiM1MjUyNWI7XCI+SW5zaWdodHM8L3NwYW4+YDtcbiAgICAgIGNvbnN0IGRldGFpbCA9IHJvdy5kZXRhaWxcbiAgICAgICAgPyBgPHAgc3R5bGU9XCJtYXJnaW46MCAwIDhweDtmb250LXNpemU6MTNweDtsaW5lLWhlaWdodDoxLjU1O2NvbG9yOiMzZjNmNDY7XCI+JHtlc2Mocm93LmRldGFpbCl9PC9wPmBcbiAgICAgICAgOiBcIlwiO1xuICAgICAgcmV0dXJuIGA8ZGl2IHN0eWxlPVwibWFyZ2luOjAgMCAxNHB4O3BhZGRpbmc6MTRweCAxNHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMHB4O2JvcmRlcjoxcHggc29saWQgI2U0ZTRlNztiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMzVkZWcsI2ZhZmFmYSAwJSwjZmZmZmZmIDU1JSk7XCI+XG4gICAgICAgICR7YmFkZ2V9XG4gICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCA2cHg7Zm9udC1zaXplOjE1cHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOiMxODE4MWI7bGluZS1oZWlnaHQ6MS4zNTtcIj4ke2VzYyhyb3cuaGVhZGxpbmUpfTwvcD5cbiAgICAgICAgJHtkZXRhaWx9XG4gICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjA7Zm9udC1zaXplOjEycHg7bGluZS1oZWlnaHQ6MS40NTtjb2xvcjojNTI1MjViO1wiPjxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6NjAwO2NvbG9yOiM3MTcxN2E7XCI+VHJ5IHRoaXM6PC9zcGFuPiAke2VzYyhyb3cuYWN0aW9uKX08L3A+XG4gICAgICA8L2Rpdj5gO1xuICAgIH0pXG4gICAgLmpvaW4oXCJcIik7XG4gIHJldHVybiBgXG4gICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luOjI0cHggMCA4cHg7cGFkZGluZzoxNnB4O2JvcmRlci1yYWRpdXM6MTJweDtib3JkZXI6MXB4IHNvbGlkICNkOWY5OWQ7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCNmN2ZlZTcgMCUsI2ZmZmZmZiA3MiUpO1wiPlxuICAgICAgICA8aDIgc3R5bGU9XCJmb250LXNpemU6MTVweDttYXJnaW46MCAwIDRweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7XCI+XG4gICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6MThweDtsaW5lLWhlaWdodDoxO1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPuKcqDwvc3Bhbj5cbiAgICAgICAgICBBSSBpbnNpZ2h0cyBmb3IgeW91XG4gICAgICAgIDwvaDI+XG4gICAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCAxMnB4O2ZvbnQtc2l6ZToxMnB4O2xpbmUtaGVpZ2h0OjEuNDU7Y29sb3I6IzU3NTM0ZTtcIj5QdWxsZWQgZnJvbSB5b3VyIGxpdmUgT2phcyBIZWFsdGggaW5zaWdodHMg4oCUIHNhbWUgZW5naW5lIGFzIHRoZSBkYXNoYm9hcmQuPC9wPlxuICAgICAgICAke2NhcmRzfVxuICAgICAgPC9kaXY+YDtcbn1cblxuZnVuY3Rpb24gZW1haWxGb290ZXJTb3VyY2VMaW5lKGRvYzogV2Vla2x5UmVwb3J0RG9jdW1lbnQpOiBzdHJpbmcge1xuICBjb25zdCBiYXNlID0gYCR7ZG9jLmdlbmVyYXRpb25Tb3VyY2V9YDtcbiAgaWYgKGRvYy5haUluc2lnaHRzRm9yRW1haWw/Lmxlbmd0aCkge1xuICAgIHJldHVybiBgJHtiYXNlfSB3ZWVrbHkgY2FyZCDCtyAke2RvYy5haUluc2lnaHRzRm9yRW1haWwubGVuZ3RofSBpbnNpZ2h0IGNhcmQocykgZnJvbSBBSSBpbnNpZ2h0c2A7XG4gIH1cbiAgcmV0dXJuIGJhc2U7XG59XG5cbi8qKiBNaW5pbWFsIGlubGluZS1DU1MgSFRNTCBzdWl0YWJsZSBmb3IgcGFzdGluZyBpbnRvIGVtYWlsIGNsaWVudHMgKGJlc3QtZWZmb3J0KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdlZWtseVJlcG9ydEVtYWlsSHRtbChkb2M6IFdlZWtseVJlcG9ydERvY3VtZW50KTogc3RyaW5nIHtcbiAgY29uc3QgeyBzZWN0aW9ucywgYWdncmVnYXRlOiBhZ2cgfSA9IGRvYztcbiAgY29uc3QgZXhwID0gc2VjdGlvbnMubmV4dEV4cGVyaW1lbnQ7XG4gIGNvbnN0IGFpQmxvY2sgPSBkb2MuYWlJbnNpZ2h0c0ZvckVtYWlsPy5sZW5ndGggPyBhaUluc2lnaHRzRW1haWxCbG9jayhkb2MuYWlJbnNpZ2h0c0ZvckVtYWlsKSA6IFwiXCI7XG4gIHJldHVybiBgPCFET0NUWVBFIGh0bWw+XG48aHRtbD48aGVhZD48bWV0YSBjaGFyc2V0PVwidXRmLThcIiAvPjx0aXRsZT4ke2VzYyhzZWN0aW9ucy50aXRsZSl9PC90aXRsZT48L2hlYWQ+XG48Ym9keSBzdHlsZT1cImZvbnQtZmFtaWx5OnN5c3RlbS11aSxTZWdvZSBVSSxSb2JvdG8sSGVsdmV0aWNhLEFyaWFsLHNhbnMtc2VyaWY7YmFja2dyb3VuZDojZjRmNGY1O2NvbG9yOiMxODE4MWI7cGFkZGluZzoyNHB4O1wiPlxuICA8dGFibGUgd2lkdGg9XCIxMDAlXCIgY2VsbHBhZGRpbmc9XCIwXCIgY2VsbHNwYWNpbmc9XCIwXCIgcm9sZT1cInByZXNlbnRhdGlvblwiIHN0eWxlPVwibWF4LXdpZHRoOjU2MHB4O21hcmdpbjowIGF1dG87YmFja2dyb3VuZDojZmZmZmZmO2JvcmRlci1yYWRpdXM6MTJweDtib3JkZXI6MXB4IHNvbGlkICNlNGU0ZTc7cGFkZGluZzoyNHB4O1wiPlxuICAgIDx0cj48dGQ+XG4gICAgICA8aDEgc3R5bGU9XCJmb250LXNpemU6MjBweDttYXJnaW46MCAwIDhweDtcIj4ke2VzYyhzZWN0aW9ucy50aXRsZSl9PC9oMT5cbiAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCAxNnB4O2NvbG9yOiM1MjUyNWI7Zm9udC1zaXplOjE0cHg7XCI+JHtlc2Moc2VjdGlvbnMuc3VidGl0bGUpfTwvcD5cbiAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCA4cHg7Zm9udC1zaXplOjEzcHg7Y29sb3I6IzcxNzE3YTtcIj5XaW5kb3c6ICR7ZXNjKGFnZy53ZWVrU3RhcnQpfSDigJMgJHtlc2MoYWdnLndlZWtFbmQpfTwvcD5cbiAgICAgICR7YWlCbG9ja31cbiAgICAgIDxoMiBzdHlsZT1cImZvbnQtc2l6ZToxNXB4O21hcmdpbjoyMHB4IDAgOHB4O1wiPldoYXQgY2hhbmdlZDwvaDI+XG4gICAgICAke2xpc3RIdG1sKHNlY3Rpb25zLndoYXRDaGFuZ2VkKX1cbiAgICAgIDxoMiBzdHlsZT1cImZvbnQtc2l6ZToxNXB4O21hcmdpbjoyMHB4IDAgOHB4O1wiPldoYXQgaGVscGVkPC9oMj5cbiAgICAgICR7bGlzdEh0bWwoc2VjdGlvbnMud2hhdEhlbHBlZCl9XG4gICAgICA8aDIgc3R5bGU9XCJmb250LXNpemU6MTVweDttYXJnaW46MjBweCAwIDhweDtcIj5XaGF0IG1heSBoYXZlIG1hZGUgdGhpbmdzIGhhcmRlcjwvaDI+XG4gICAgICAke2xpc3RIdG1sKHNlY3Rpb25zLndoYXRIYXJkZXIpfVxuICAgICAgPGgyIHN0eWxlPVwiZm9udC1zaXplOjE1cHg7bWFyZ2luOjIwcHggMCA4cHg7XCI+T25lIGV4cGVyaW1lbnQgZm9yIG5leHQgd2VlazwvaDI+XG4gICAgICA8cCBzdHlsZT1cIm1hcmdpbjowIDAgNnB4O2ZvbnQtd2VpZ2h0OjYwMDtcIj4ke2VzYyhleHAudGl0bGUpfTwvcD5cbiAgICAgIDxwIHN0eWxlPVwibWFyZ2luOjAgMCAxNnB4O2ZvbnQtc2l6ZToxNHB4O2xpbmUtaGVpZ2h0OjEuNTtcIj4ke2VzYyhleHAuZGVzY3JpcHRpb24pfTwvcD5cbiAgICAgIDxociBzdHlsZT1cImJvcmRlcjpub25lO2JvcmRlci10b3A6MXB4IHNvbGlkICNlNGU0ZTc7bWFyZ2luOjIwcHggMDtcIiAvPlxuICAgICAgJHtzZWN0aW9ucy5kaXNjbGFpbWVycy5tYXAoKGQpID0+IGA8cCBzdHlsZT1cImZvbnQtc2l6ZToxMnB4O2NvbG9yOiM3MTcxN2E7bGluZS1oZWlnaHQ6MS40NTttYXJnaW46MCAwIDEwcHg7XCI+JHtlc2MoZCl9PC9wPmApLmpvaW4oXCJcIil9XG4gICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZToxMXB4O2NvbG9yOiNhMWExYWE7bWFyZ2luOjE2cHggMCAwO1wiPkdlbmVyYXRlZCAke2VzYyhkb2MuZ2VuZXJhdGVkQXQpfSDCtyAke2VzYyhlbWFpbEZvb3RlclNvdXJjZUxpbmUoZG9jKSl9PC9wPlxuICAgIDwvdGQ+PC90cj5cbiAgPC90YWJsZT5cbjwvYm9keT48L2h0bWw+YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV2Vla2x5UmVwb3J0RW1haWxQbGFpblRleHQoZG9jOiBXZWVrbHlSZXBvcnREb2N1bWVudCk6IHN0cmluZyB7XG4gIGNvbnN0IHMgPSBkb2Muc2VjdGlvbnM7XG4gIGNvbnN0IGV4cCA9IHMubmV4dEV4cGVyaW1lbnQ7XG4gIGNvbnN0IGFpTGluZXMgPVxuICAgIGRvYy5haUluc2lnaHRzRm9yRW1haWw/Lm1hcCgocm93LCBpKSA9PiB7XG4gICAgICBjb25zdCBzcmMgPSByb3cuc291cmNlID09PSBcImxsbVwiID8gXCIgKEFJIHJlZmluZWQpXCIgOiBcIlwiO1xuICAgICAgY29uc3QgZGV0ID0gcm93LmRldGFpbCA/IGBcXG4gICR7cm93LmRldGFpbH1gIDogXCJcIjtcbiAgICAgIHJldHVybiBgJHtpICsgMX0uICR7cm93LmhlYWRsaW5lfSR7c3JjfSR7ZGV0fVxcbiAgIFRyeTogJHtyb3cuYWN0aW9ufWA7XG4gICAgfSkuam9pbihcIlxcblxcblwiKSA/PyBcIlwiO1xuICBjb25zdCBhaUJsb2NrID1cbiAgICBkb2MuYWlJbnNpZ2h0c0ZvckVtYWlsPy5sZW5ndGggJiYgYWlMaW5lc1xuICAgICAgPyBgQUkgaW5zaWdodHMgZm9yIHlvdVxcbiR7YWlMaW5lc31cXG5cXG5gXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGJsb2NrcyA9IFtcbiAgICBgJHtzLnRpdGxlfVxcbiR7cy5zdWJ0aXRsZX1cXG5gLFxuICAgIGFpQmxvY2ssXG4gICAgYFdoYXQgY2hhbmdlZFxcbiR7cy53aGF0Q2hhbmdlZC5tYXAoKGwpID0+IGAtICR7bH1gKS5qb2luKFwiXFxuXCIpfVxcbmAsXG4gICAgYFdoYXQgaGVscGVkXFxuJHtzLndoYXRIZWxwZWQubWFwKChsKSA9PiBgLSAke2x9YCkuam9pbihcIlxcblwiKX1cXG5gLFxuICAgIGBXaGF0IG1heSBoYXZlIG1hZGUgdGhpbmdzIGhhcmRlclxcbiR7cy53aGF0SGFyZGVyLm1hcCgobCkgPT4gYC0gJHtsfWApLmpvaW4oXCJcXG5cIil9XFxuYCxcbiAgICBgT25lIGV4cGVyaW1lbnQgZm9yIG5leHQgd2Vla1xcbiR7ZXhwLnRpdGxlfVxcbiR7ZXhwLmRlc2NyaXB0aW9ufVxcbmAsXG4gICAgYERpc2NsYWltZXJzXFxuJHtzLmRpc2NsYWltZXJzLm1hcCgoZCkgPT4gYC0gJHtkfWApLmpvaW4oXCJcXG5cIil9XFxuYCxcbiAgICBgR2VuZXJhdGVkOiAke2RvYy5nZW5lcmF0ZWRBdH0gKCR7ZW1haWxGb290ZXJTb3VyY2VMaW5lKGRvYyl9KWAsXG4gIF07XG4gIHJldHVybiBibG9ja3Muam9pbihcIlxcblwiKTtcbn1cbiJdfQ==