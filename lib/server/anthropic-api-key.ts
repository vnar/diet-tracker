import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER_HINTS = /^your-anthropic/i;

/**
 * Anthropic key for Next.js server routes only (never `NEXT_PUBLIC_*`).
 * Resolution order:
 * 1. `ANTHROPIC_API_KEY` when non-empty
 * 2. In non-production only: `secrets.toml` at repo root (`ANTHROPIC_API_KEY = "…"`), skipping placeholders
 */
export function getAnthropicApiKeyForServer(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") return undefined;

  try {
    const file = path.join(process.cwd(), "secrets.toml");
    if (!fs.existsSync(file)) return undefined;
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^ANTHROPIC_API_KEY\s*=\s*"(.*)"\s*$/);
      if (!m?.[1]) continue;
      const v = m[1].trim();
      if (!v || PLACEHOLDER_HINTS.test(v)) continue;
      return v;
    }
  } catch {
    /* ignore missing file / parse issues */
  }
  return undefined;
}
