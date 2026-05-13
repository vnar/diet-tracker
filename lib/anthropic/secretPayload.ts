/** Normalize Secrets Manager `SecretString` (plain sk-ant-… or JSON wrapper). */
export function normalizeAnthropicSecretPayload(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{")) return t;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    for (const k of ["apiKey", "ANTHROPIC_API_KEY", "key", "sk"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    return t;
  }
  return t;
}
