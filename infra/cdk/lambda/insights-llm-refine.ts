import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const DAILY_LIMIT = 100;

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
};

function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/** Mirrors app `isInsightsLlmRefineEnabled`: off only when explicitly false. */
export function isLambdaInsightsLlmRefineEnabled(): boolean {
  const legacy = parseBoolEnv(process.env.NEXT_PUBLIC_INSIGHTS_LLM_REFINE);
  if (legacy !== undefined) return legacy;
  const ff = parseBoolEnv(process.env.FF_INSIGHTS_LLM_REFINE);
  if (ff !== undefined) return ff;
  const pub = parseBoolEnv(process.env.NEXT_PUBLIC_FF_INSIGHTS_LLM_REFINE);
  if (pub !== undefined) return pub;
  const direct = parseBoolEnv(process.env.INSIGHTS_LLM_REFINE);
  if (direct !== undefined) return direct;
  return true;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getInsightCache(
  ddb: DynamoDBClient,
  tableName: string,
  userId: string,
  cacheKey: string,
): Promise<LambdaInsightCard | null> {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { userId: { S: userId }, cacheKey: { S: cacheKey } },
      ConsistentRead: true,
    }),
  );
  const payload = out.Item?.payloadJson?.S;
  if (!payload) return null;
  try {
    return JSON.parse(payload) as LambdaInsightCard;
  } catch {
    return null;
  }
}

async function putInsightCache(
  ddb: DynamoDBClient,
  tableName: string,
  userId: string,
  cacheKey: string,
  insight: LambdaInsightCard,
): Promise<void> {
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        userId: { S: userId },
        cacheKey: { S: cacheKey },
        payloadJson: { S: JSON.stringify(insight) },
        ts: { S: new Date().toISOString() },
      },
    }),
  );
}

async function incrementLlmUsage(ddb: DynamoDBClient, tableName: string, userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `__usage__#${day}`;
  const out = await ddb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { userId: { S: userId }, cacheKey: { S: key } },
      UpdateExpression: "ADD llmCalls :one SET ts = :ts",
      ExpressionAttributeValues: {
        ":one": { N: "1" },
        ":ts": { S: new Date().toISOString() },
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return Number(out.Attributes?.llmCalls?.N ?? 0);
}

async function refineOne(
  ddb: DynamoDBClient,
  cacheTableName: string,
  apiKey: string,
  userId: string,
  insight: LambdaInsightCard,
  ctx: { tone: string; firstName: string; recentNotes: string[] },
): Promise<LambdaInsightCard> {
  const cacheKey = `${insight.id}#${dayKey()}`;
  const cached = await getInsightCache(ddb, cacheTableName, userId, cacheKey);
  if (cached) return cached;

  const count = await incrementLlmUsage(ddb, cacheTableName, userId);
  if (count > DAILY_LIMIT) return insight;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const notes = ctx.recentNotes.slice(-3).join("\n- ");
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 180,
      temperature: 0.4,
      system:
        "Rewrite a health insight in a warmer, personalized tone while preserving facts. Return strict JSON with keys headline and detail only.",
      messages: [
        {
          role: "user",
          content: `Tone: ${ctx.tone}
First name: ${ctx.firstName}
Original headline: ${insight.headline}
Original detail: ${insight.detail ?? ""}
Why points:
- ${insight.why.join("\n- ")}
Recent notes sample:
- ${notes || "None"}`,
        },
      ],
    });
    const text = response.content.find((part) => part.type === "text")?.text;
    if (!text) return insight;
    const parsed = JSON.parse(text) as { headline?: string; detail?: string };
    const nextInsight: LambdaInsightCard = {
      ...insight,
      headline: parsed.headline?.trim() || insight.headline,
      detail: parsed.detail?.trim() || insight.detail,
    };
    await putInsightCache(ddb, cacheTableName, userId, cacheKey, nextInsight);
    return nextInsight;
  } catch {
    return insight;
  }
}

/**
 * Optionally rewrites insight copy via Anthropic when env is configured.
 * Never throws: failures fall back to the rule-based card.
 */
export async function maybeRefineInsightCards(
  ddb: DynamoDBClient,
  input: {
    userId: string;
    insights: LambdaInsightCard[];
    tone: string;
    firstName: string;
    recentNotes: string[];
  },
): Promise<LambdaInsightCard[]> {
  if (!isLambdaInsightsLlmRefineEnabled()) return input.insights;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return input.insights;
  const tableName = process.env.INSIGHT_CACHE_TABLE_NAME?.trim();
  if (!tableName) return input.insights;

  const out: LambdaInsightCard[] = [];
  for (const insight of input.insights) {
    out.push(
      await refineOne(ddb, tableName, apiKey, input.userId, insight, {
        tone: input.tone,
        firstName: input.firstName,
        recentNotes: input.recentNotes,
      }),
    );
  }
  return out;
}
