import type { AiNudge } from "@/lib/aiNudges/types";
import type { NormalizedUserHealthSnapshot } from "@/lib/aiNudges/types";
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
export declare class RuleBasedNudgeProvider implements AiNudgeProvider {
    readonly id: string;
    generate(ctx: NudgeGenerationContext): Promise<AiNudge[]>;
}
/** Reserved for Anthropic/OpenAI adapters — keep surface stable. */
export declare class LlmNudgeProvider implements AiNudgeProvider {
    readonly id: string;
    generate(_ctx: NudgeGenerationContext): Promise<AiNudge[]>;
}
export declare function generateFromProviders(providers: AiNudgeProvider[], ctx: NudgeGenerationContext): Promise<AiNudge[]>;
