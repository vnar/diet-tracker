import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
/** Same shape as Insight in the app + Lambda handler. */
export type LambdaInsightCard = {
    id: string;
    ruleId: string;
    priority: number;
    headline: string;
    detail?: string;
    why: string[];
    action: string;
    category: "sodium" | "alcohol" | "late_snack" | "workout" | "plateau" | "streak" | "trajectory";
    generationSource?: "llm" | "rules";
};
/** Mirrors app `isInsightsLlmRefineEnabled`: off only when explicitly false. */
export declare function isLambdaInsightsLlmRefineEnabled(): boolean;
/**
 * Optionally rewrites insight copy via Anthropic when env is configured.
 * Never throws: failures fall back to the rule-based card.
 */
export declare function maybeRefineInsightCards(ddb: DynamoDBClient, input: {
    userId: string;
    insights: LambdaInsightCard[];
    tone: string;
    firstName: string;
    recentNotes: string[];
}): Promise<LambdaInsightCard[]>;
