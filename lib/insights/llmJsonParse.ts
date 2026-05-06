/**
 * Parses headline/detail from Anthropic responses. Models often wrap JSON in
 * markdown fences; plain JSON.parse would fail and downstream code would fall
 * back to rule-only copy.
 */
export type LlmInsightCopy = { headline?: string; detail?: string };

export function parseInsightCopyFromLlmText(raw: string): LlmInsightCopy | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let s = raw.trim();

  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/im.exec(s);
  if (fence?.[1]) {
    s = fence[1].trim();
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(s.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    const headline = typeof o.headline === "string" ? o.headline : undefined;
    const detail = typeof o.detail === "string" ? o.detail : undefined;
    if (!headline?.trim() && !detail?.trim()) return null;
    return { headline, detail };
  } catch {
    return null;
  }
}
