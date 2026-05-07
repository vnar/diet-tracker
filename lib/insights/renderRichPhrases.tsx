import type { ReactNode } from "react";

const DEFAULT_STRONG_CLASS =
  "font-semibold text-slate-50 [text-wrap:pretty]";

/** Decode only bold/strong tag entities (avoids turning arbitrary &lt; into HTML). */
function decodeBoldTagEntities(s: string): string {
  return s
    .replace(/&lt;\s*b\s*&gt;/gi, "<b>")
    .replace(/&lt;\s*\/\s*b\s*&gt;/gi, "</b>")
    .replace(/&lt;\s*strong\s*&gt;/gi, "<strong>")
    .replace(/&lt;\s*\/\s*strong\s*&gt;/gi, "</strong>");
}

/**
 * Renders &lt;b&gt; / &lt;strong&gt; (and real &lt;…&gt; tags), case-insensitive, as <strong>.
 * No general HTML engine — only these paired tags; everything else stays plain text.
 */
export function renderInsightEmphasis(
  html: string,
  options?: { strongClassName?: string },
): ReactNode[] {
  if (typeof html !== "string" || !html.length) return [];

  const cls = options?.strongClassName ?? DEFAULT_STRONG_CLASS;
  const s = decodeBoldTagEntities(html);
  const parts: ReactNode[] = [];
  let key = 0;
  const re = /<(b|strong)(?:\s[^>]*)?>([\s\S]*?)<\/\s*\1\s*>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      parts.push(s.slice(last, m.index));
    }
    parts.push(
      <strong key={`ins-em-${key++}`} className={cls}>
        {m[2]}
      </strong>,
    );
    last = re.lastIndex;
  }
  if (last < s.length) {
    parts.push(s.slice(last));
  }
  return parts.length ? parts : [s];
}
