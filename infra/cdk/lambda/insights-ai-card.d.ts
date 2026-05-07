import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { type InsightEntryRow } from "../../../lib/insights/aiInsightData";
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
    generatedAt?: string;
};
/**
 * Single high-signal AI insight card. Cached 30 minutes per data fingerprint.
 */
export declare function generateAiInsightCard(ddb: DynamoDBClient, ctx: {
    userId: string;
    entriesRaw: InsightEntryRow[];
    goalWeight: number;
    startWeight: number;
    targetDate: string;
    dayMealsTableName?: string;
}): Promise<LambdaInsightCard[]>;
