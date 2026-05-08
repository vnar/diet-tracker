import type { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import Anthropic from "@anthropic-ai/sdk";

export type HttpEvent = {
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type HttpResult = {
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

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

const ACTIVITY_ESTIMATE_SYSTEM = `You estimate daily activity calorie burn.
Return ONLY one JSON object with:
{
  "activity_summary": string,
  "minutes": number,
  "met": number,
  "kcal_burn": number,
  "confidence": number
}
Rules:
- Use user's weight_kg.
- kcal_burn = met * 3.5 * weight_kg / 200 * minutes
- Round kcal_burn to nearest integer.
- confidence is 0-100.
- If text is vague, choose conservative values and confidence <= 75.
- No markdown, no prose.`;

export async function handleV2ActivityEstimateBurn(event: HttpEvent): Promise<HttpResult> {
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const activityText = typeof body.activityText === "string" ? body.activityText.trim() : "";
  const weightKg = Number(body.weightKg);
  if (!activityText) return json(400, { error: "Missing activityText" });
  if (!Number.isFinite(weightKg) || weightKg <= 0) return json(400, { error: "Missing/invalid weightKg" });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return json(503, { error: "AI is not configured." });
  const model = process.env.ANTHROPIC_ACTIVITY_MODEL?.trim() || "claude-haiku-4-5";

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model,
      max_tokens: 400,
      temperature: 0,
      system: ACTIVITY_ESTIMATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            activity_text: activityText,
            weight_kg: Math.round(weightKg * 10) / 10,
          }),
        },
      ],
    });
    const text = resp.content.find((p) => p.type === "text")?.text ?? "";
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .replace(/,\s*([}\]])/g, "$1");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return json(422, { error: "Could not parse activity estimate." });
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const minutes = Number(parsed.minutes);
    const met = Number(parsed.met);
    const kcal = Number(parsed.kcal_burn);
    const confidence = Number(parsed.confidence);
    const summary = typeof parsed.activity_summary === "string" ? parsed.activity_summary.trim() : activityText;
    if (!Number.isFinite(minutes) || !Number.isFinite(met) || !Number.isFinite(kcal)) {
      return json(422, { error: "Could not parse activity estimate." });
    }
    return json(200, {
      activitySummary: summary || activityText,
      minutes: Math.max(1, Math.round(minutes)),
      met: Math.max(1, Math.round(met * 10) / 10),
      kcalBurn: Math.max(0, Math.round(kcal)),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 70,
    });
  } catch (error) {
    console.error("activity_estimate_failed", error);
    return json(502, { error: "Couldn't estimate activity burn right now." });
  }
}

function isDateString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function estimateBaseline(weightKg: number): number {
  return Math.round(weightKg * 22);
}

function estimateStepsBurn(steps?: number): number {
  if (!steps || steps <= 0) return 0;
  return Math.round(steps * 0.04);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastNDates(endDate: string, n: number): string[] {
  const out: string[] = [];
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  for (let i = 0; i < n; i += 1) {
    out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  }
  return out.reverse();
}

type EnergySummaryRow = {
  day: string;
  consumedKcal: number;
  baselineKcal: number;
  stepsKcal: number;
  activityKcal: number;
  burnKcal: number;
  netKcal: number;
};

export async function handleV2ActivityLog(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; entriesTableName: string },
): Promise<HttpResult> {
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const day = typeof body.day === "string" ? body.day.trim() : "";
  const activityText = typeof body.activityText === "string" ? body.activityText.trim() : "";
  const activitySummary = typeof body.activitySummary === "string" ? body.activitySummary.trim() : "";
  const burnKcal = Number(body.kcalBurn);
  const met = Number(body.met);
  const minutes = Number(body.minutes);
  const confidence = Number(body.confidence);

  if (!isDateString(day)) return json(400, { error: "Invalid day" });
  if (!activityText) return json(400, { error: "Missing activityText" });
  if (!Number.isFinite(burnKcal) || burnKcal < 0) return json(400, { error: "Invalid kcalBurn" });

  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.entriesTableName,
      Key: { userId: { S: userId }, date: { S: day } },
      UpdateExpression:
        "SET activityText = :t, activitySummary = :s, activityBurnKcal = :k, activityMinutes = :m, activityMet = :met, activityConfidence = :c",
      ExpressionAttributeValues: {
        ":t": { S: activityText.slice(0, 500) },
        ":s": { S: (activitySummary || activityText).slice(0, 500) },
        ":k": { N: String(Math.round(burnKcal)) },
        ":m": { N: String(Number.isFinite(minutes) ? Math.max(1, Math.round(minutes)) : 0) },
        ":met": { N: String(Number.isFinite(met) ? Math.max(1, Math.round(met * 10) / 10) : 1) },
        ":c": { N: String(Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 70) },
      },
    }),
  );
  return json(200, { ok: true });
}

export async function handleV2ActivityCalibrationPatch(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; settingsTableName: string },
): Promise<HttpResult> {
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const factor = Number(body.factor);
  if (!Number.isFinite(factor) || factor < 0.6 || factor > 1.6) {
    return json(400, { error: "factor must be between 0.6 and 1.6" });
  }
  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.settingsTableName,
      Key: { userId: { S: userId } },
      UpdateExpression: "SET activityCalibrationFactor = :f",
      ExpressionAttributeValues: { ":f": { N: String(Math.round(factor * 100) / 100) } },
    }),
  );
  return json(200, { ok: true, factor: Math.round(factor * 100) / 100 });
}

function readNum(v?: { N?: string }): number | undefined {
  if (!v?.N) return undefined;
  const n = Number(v.N);
  return Number.isFinite(n) ? n : undefined;
}

export async function handleV2EnergyWeeklySummary(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; entriesTableName: string; dayMealsTableName: string; settingsTableName: string },
): Promise<HttpResult> {
  const end = event.queryStringParameters?.endDate?.trim() || isoToday();
  if (!isDateString(end)) return json(400, { error: "Invalid endDate" });
  const days = lastNDates(end, 7);
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const [entriesOut, settingsOut] = await Promise.all([
    deps.ddb.send(
      new QueryCommand({
        TableName: deps.entriesTableName,
        KeyConditionExpression: "userId = :u AND #date BETWEEN :f AND :t",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: { ":u": { S: userId }, ":f": { S: first }, ":t": { S: last } },
        ConsistentRead: true,
      }),
    ),
    deps.ddb.send(
      new QueryCommand({
        TableName: deps.settingsTableName,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": { S: userId } },
        Limit: 1,
        ConsistentRead: true,
      }),
    ),
  ]);

  const calibration = (() => {
    const n = readNum((settingsOut.Items?.[0] as Record<string, AttributeValue> | undefined)?.activityCalibrationFactor as
      | { N?: string }
      | undefined);
    return n && Number.isFinite(n) ? n : 1;
  })();

  const byDay = new Map<string, Record<string, AttributeValue>>();
  for (const item of entriesOut.Items ?? []) {
    const day = (item as Record<string, AttributeValue>).date?.S;
    if (day) byDay.set(day, item as Record<string, AttributeValue>);
  }

  const rows: EnergySummaryRow[] = [];
  for (const day of days) {
    const e = byDay.get(day);
    const weightKg = readNum(e?.morningWeight as { N?: string } | undefined) ?? 70;
    const manualConsumed = readNum(e?.calories as { N?: string } | undefined) ?? 0;
    const steps = readNum(e?.steps as { N?: string } | undefined) ?? 0;
    const savedActivity = readNum(e?.activityBurnKcal as { N?: string } | undefined) ?? 0;
    const baseline = estimateBaseline(weightKg);
    const stepBurn = estimateStepsBurn(steps);
    const activity = Math.round(savedActivity * calibration);

    const dayKey = `${userId}#${day}`;
    const mealsOut = await deps.ddb.send(
      new QueryCommand({
        TableName: deps.dayMealsTableName,
        KeyConditionExpression: "dayKey = :d",
        ExpressionAttributeValues: { ":d": { S: dayKey } },
      }),
    );
    let mealConsumed = 0;
    for (const it of mealsOut.Items ?? []) {
      const deletedAt = (it as Record<string, AttributeValue>).deletedAt?.S;
      if (deletedAt) continue;
      const n = readNum((it as Record<string, AttributeValue>).kcal as { N?: string } | undefined) ?? 0;
      mealConsumed += n;
    }
    const consumed = mealConsumed > 0 ? Math.round(mealConsumed) : Math.round(manualConsumed);
    const burn = baseline + stepBurn + activity;
    rows.push({
      day,
      consumedKcal: consumed,
      baselineKcal: baseline,
      stepsKcal: stepBurn,
      activityKcal: activity,
      burnKcal: burn,
      netKcal: consumed - burn,
    });
  }

  const avgNet =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.netKcal, 0) / rows.length)
      : 0;
  const trend = avgNet < -250 ? "deficit" : avgNet > 250 ? "surplus" : "near_maintenance";

  return json(200, {
    calibrationFactor: calibration,
    avgNetKcal: avgNet,
    trend,
    rows,
  });
}

