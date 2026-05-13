import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { BatchWriteItemCommand, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import Anthropic from "@anthropic-ai/sdk";
import { NL_MEAL_PARSER_SYSTEM } from "../../../lib/meals/nlMealParsePrompt";
import { ensureAnthropicApiKeyFromSecrets } from "../../../lib/anthropic/lambdaApiKeyFromSecrets";
import {
  parseNlMealLlmJson,
  type NlMealParseItem,
  type NlMealParseResponse,
} from "../../../lib/meals/nlMealParseResult";
import { heuristicNlMealParse } from "../../../lib/meals/nlMealParseHeuristic";

type HttpEvent = {
  rawPath: string;
  body?: string | null;
  requestContext?: {
    http?: { method?: string };
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown> | string;
      };
    };
  };
};

type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getJwtClaims(event: HttpEvent): Record<string, unknown> | undefined {
  const raw = event.requestContext?.authorizer?.jwt?.claims;
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function getUserId(event: HttpEvent): string | undefined {
  const sub = getJwtClaims(event)?.sub;
  return typeof sub === "string" ? sub : undefined;
}

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function nlFlagsOn(): boolean {
  return process.env.FF_NL_MEAL_PARSE === "true" && process.env.FF_MEAL_LIBRARY === "true";
}

function mealIdNameFromAttrs(it: Record<string, AttributeValue>): { id: string; name: string } | null {
  const mealId = it.mealId?.S;
  const name = it.name?.S;
  if (!mealId?.startsWith("MEAL#") || !name) return null;
  if (it.deletedAt?.S) return null;
  return { id: mealId.slice(5), name };
}

async function listMealLibraryNames(
  ddb: DynamoDBClient,
  table: string,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "userId = :u AND begins_with(mealId, :p)",
      ExpressionAttributeValues: {
        ":u": { S: userId },
        ":p": { S: "MEAL#" },
      },
    }),
  );
  const rows: Array<{ id: string; name: string }> = [];
  for (const it of out.Items ?? []) {
    const m = mealIdNameFromAttrs(it as Record<string, AttributeValue>);
    if (m) rows.push(m);
  }
  return rows;
}

function enrichItems(items: NlMealParseItem[], lib: Array<{ id: string; name: string }>): NlMealParseItem[] {
  return items.map((item) => {
    const found = lib.find((m) => m.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    return {
      ...item,
      isInLibrary: Boolean(found),
      libraryId: found?.id ?? null,
    };
  });
}

async function deleteAllInsightCacheForUser(ddb: DynamoDBClient, table: string, userId: string): Promise<void> {
  let startKey: Record<string, AttributeValue> | undefined;
  const pending: Array<{ DeleteRequest: { Key: Record<string, AttributeValue> } }> = [];
  async function flush(force?: boolean) {
    while (pending.length >= 25 || (force && pending.length > 0)) {
      const slice = pending.splice(0, 25);
      if (slice.length === 0) break;
      await ddb.send(new BatchWriteItemCommand({ RequestItems: { [table]: slice } }));
    }
  }
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": { S: userId } },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of out.Items ?? []) {
      const uid = it.userId?.S;
      const ck = it.cacheKey?.S;
      if (!uid || !ck) continue;
      pending.push({
        DeleteRequest: { Key: { userId: { S: uid }, cacheKey: { S: ck } } },
      });
      await flush();
    }
    startKey = out.LastEvaluatedKey;
  } while (startKey);
  await flush(true);
}

function clampConfidence(data: NlMealParseResponse): NlMealParseResponse {
  if (data.confidence >= 60) return data;
  return {
    ...data,
    confidence: 60,
    notes: data.notes?.trim()
      ? `${data.notes} (Confidence adjusted; please verify portions.)`
      : "Confidence adjusted; please verify portions.",
  };
}

const ddb = new DynamoDBClient({});

export async function handler(event: HttpEvent): Promise<HttpResult> {
  if (!nlFlagsOn()) {
    return json(403, { error: "Natural language meal parse is disabled." });
  }

  const userId = getUserId(event);
  if (!userId) {
    return json(401, { error: "Unauthorized" });
  }

  const method = event.requestContext?.http?.method ?? "POST";
  if (method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  await ensureAnthropicApiKeyFromSecrets();

  const mealsTable = process.env.MEALS_TABLE_NAME?.trim();
  const insightCacheTable = process.env.INSIGHT_CACHE_TABLE_NAME?.trim();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_NL_MEAL_MODEL?.trim() || "claude-sonnet-4-20250514";

  if (event.rawPath === "/v2/meals/nl-parse/invalidate-insights") {
    if (!insightCacheTable) return json(500, { error: "Cache table not configured." });
    try {
      await deleteAllInsightCacheForUser(ddb, insightCacheTable, userId);
      return json(200, { ok: true });
    } catch (e) {
      console.error(JSON.stringify({ msg: "nl_meal_invalidate_cache_failed", error: String(e) }));
      return json(500, { error: "Could not invalidate insight cache." });
    }
  }

  if (event.rawPath !== "/v2/meals/nl-parse") {
    return json(404, { error: "Not found" });
  }

  if (!mealsTable) return json(500, { error: "Meals table not configured." });

  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json(400, { error: "Missing text." });

  let lib: Array<{ id: string; name: string }> = [];
  try {
    lib = await listMealLibraryNames(ddb, mealsTable, userId);
  } catch (e) {
    console.error(JSON.stringify({ msg: "nl_meal_library_list_failed", error: String(e) }));
    return json(500, { error: "Could not read meal library." });
  }

  function jsonHeuristicResponse(data: NlMealParseResponse, source: "heuristic"): HttpResult {
    const clamped = clampConfidence(data);
    const items = enrichItems(clamped.items, lib);
    return json(200, {
      title: clamped.title,
      confidence: clamped.confidence,
      items,
      meal_type_guess: clamped.meal_type_guess,
      notes: clamped.notes,
      parseSource: source,
    });
  }

  if (!apiKey) {
    const data = heuristicNlMealParse(text);
    return jsonHeuristicResponse(data, "heuristic");
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      temperature: 0,
      system: NL_MEAL_PARSER_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    const outText = msg.content.find((p) => p.type === "text");
    const rawLlm = outText && outText.type === "text" ? outText.text : "";
    const parsed = parseNlMealLlmJson(rawLlm);
    if (!parsed.ok) {
      console.error(JSON.stringify({ msg: "nl_meal_parse_failed", error: parsed.error, sample: rawLlm.slice(0, 400) }));
      return json(422, { error: "Could not parse meal description.", code: parsed.error });
    }
    const data = clampConfidence(parsed.data);
    const items = enrichItems(data.items, lib);
    return json(200, {
      title: data.title,
      confidence: data.confidence,
      items,
      meal_type_guess: data.meal_type_guess,
      notes: data.notes,
      parseSource: "llm" as const,
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "nl_meal_anthropic_failed", error: e instanceof Error ? e.message : String(e) }));
    const fallback = heuristicNlMealParse(text);
    const merged: NlMealParseResponse = {
      ...fallback,
      notes: `AI unavailable — ${fallback.notes ?? "verify portions."}`.trim(),
    };
    return jsonHeuristicResponse(merged, "heuristic");
  }
}
