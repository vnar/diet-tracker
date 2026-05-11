import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listHtml(items: string[]): string {
  if (!items.length) return "<p><em>No items.</em></p>";
  return `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}

function aiInsightsEmailBlock(insights: NonNullable<WeeklyReportDocument["aiInsightsForEmail"]>): string {
  if (!insights.length) return "";
  const cards = insights
    .map((row) => {
      const badge =
        row.source === "llm"
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
        <p style="margin:0 0 12px;font-size:12px;line-height:1.45;color:#57534e;">From your dashboard insights.</p>
        ${cards}
      </div>`;
}

function emailFooterSourceLine(doc: WeeklyReportDocument): string {
  const base = `${doc.generationSource}`;
  if (doc.aiInsightsForEmail?.length) {
    return `${base} weekly card · ${doc.aiInsightsForEmail.length} insight card(s) from AI insights`;
  }
  return base;
}

/** Minimal inline-CSS HTML suitable for pasting into email clients (best-effort). */
export function buildWeeklyReportEmailHtml(doc: WeeklyReportDocument): string {
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
      ${sections.disclaimers.length ? sections.disclaimers.map((d) => `<p style="font-size:12px;color:#71717a;line-height:1.45;margin:0 0 10px;">${esc(d)}</p>`).join("") : ""}
      <p style="font-size:11px;color:#a1a1aa;margin:16px 0 0;">Generated ${esc(doc.generatedAt)} · ${esc(emailFooterSourceLine(doc))}</p>
    </td></tr>
  </table>
</body></html>`;
}

export function buildWeeklyReportEmailPlainText(doc: WeeklyReportDocument): string {
  const s = doc.sections;
  const exp = s.nextExperiment;
  const aiLines =
    doc.aiInsightsForEmail?.map((row, i) => {
      const src = row.source === "llm" ? " (AI refined)" : "";
      const det = row.detail ? `\n  ${row.detail}` : "";
      return `${i + 1}. ${row.headline}${src}${det}\n   Try: ${row.action}`;
    }).join("\n\n") ?? "";
  const aiBlock =
    doc.aiInsightsForEmail?.length && aiLines
      ? `AI insights for you\n${aiLines}\n\n`
      : "";
  const blocks = [
    `${s.title}\n${s.subtitle}\n`,
    aiBlock,
    `What changed\n${s.whatChanged.map((l) => `- ${l}`).join("\n")}\n`,
    `What helped\n${s.whatHelped.map((l) => `- ${l}`).join("\n")}\n`,
    `What may have made things harder\n${s.whatHarder.map((l) => `- ${l}`).join("\n")}\n`,
    `One experiment for next week\n${exp.title}\n${exp.description}\n`,
    s.disclaimers.length
      ? `Disclaimers\n${s.disclaimers.map((d) => `- ${d}`).join("\n")}\n`
      : "",
    `Generated: ${doc.generatedAt} (${emailFooterSourceLine(doc)})`,
  ];
  return blocks.join("\n");
}
