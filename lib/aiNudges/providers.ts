import type { AiNudge } from "@/lib/aiNudges/types";
import type { NormalizedUserHealthSnapshot } from "@/lib/aiNudges/types";
import { generateRuleBasedNudges } from "@/lib/aiNudges/ruleEngine";

export type NudgeGenerationContext = {
  snapshot: NormalizedUserHealthSnapshot;
  nowIso?: string;
};

/**
 * Pluggable provider for future LLM-backed nudges (returns empty by default).
 */
export interface AiNudgeProvider {
  readonly id: string;
  generate(ctx: NudgeGenerationContext): Promise<AiNudge[]>;
}

export class RuleBasedNudgeProvider implements AiNudgeProvider {
  readonly id: string = "rules";

  async generate(ctx: NudgeGenerationContext): Promise<AiNudge[]> {
    return generateRuleBasedNudges(ctx.snapshot, ctx.nowIso ?? new Date().toISOString());
  }
}

/** Reserved for Anthropic/OpenAI adapters — keep surface stable. */
export class LlmNudgeProvider implements AiNudgeProvider {
  readonly id: string = "llm";

  async generate(_ctx: NudgeGenerationContext): Promise<AiNudge[]> {
    return [];
  }
}

export async function generateFromProviders(
  providers: AiNudgeProvider[],
  ctx: NudgeGenerationContext,
): Promise<AiNudge[]> {
  const merged: AiNudge[] = [];
  for (const p of providers) {
    merged.push(...(await p.generate(ctx)));
  }
  const byCat = new Map<string, AiNudge>();
  for (const n of merged.sort((a, b) => b.confidence - a.confidence)) {
    if (!byCat.has(n.category)) byCat.set(n.category, n);
  }
  return [...byCat.values()].slice(0, 3);
}
