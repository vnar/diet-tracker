import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Insight } from "@/lib/insights/types";

const ddb = new DynamoDBClient({});

function tableName(): string | null {
  return process.env.INSIGHT_CACHE_TABLE_NAME ?? null;
}

export async function getInsightCache(input: {
  userId: string;
  cacheKey: string;
}): Promise<Insight | null> {
  const table = tableName();
  if (!table) return null;
  const out = await ddb.send(
    new GetItemCommand({
      TableName: table,
      Key: {
        userId: { S: input.userId },
        cacheKey: { S: input.cacheKey },
      },
      ConsistentRead: true,
    }),
  );
  const payload = out.Item?.payloadJson?.S;
  if (!payload) return null;
  try {
    return JSON.parse(payload) as Insight;
  } catch {
    return null;
  }
}

export async function putInsightCache(input: {
  userId: string;
  cacheKey: string;
  insight: Insight;
}) {
  const table = tableName();
  if (!table) return;
  await ddb.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        userId: { S: input.userId },
        cacheKey: { S: input.cacheKey },
        payloadJson: { S: JSON.stringify(input.insight) },
        ts: { S: new Date().toISOString() },
      },
    }),
  );
}

export async function incrementLlmUsage(userId: string): Promise<number> {
  const table = tableName();
  if (!table) return 0;
  const day = new Date().toISOString().slice(0, 10);
  const key = `__usage__#${day}`;
  const out = await ddb.send(
    new UpdateItemCommand({
      TableName: table,
      Key: {
        userId: { S: userId },
        cacheKey: { S: key },
      },
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
