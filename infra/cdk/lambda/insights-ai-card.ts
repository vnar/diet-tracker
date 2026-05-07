import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { OJAS_AI_INSIGHT_SYSTEM } from "../../../lib/insights/aiInsightPrompt";
import {
  avgDeltaMorningAfterWorkout,
  avgKcalOnWeightFallDays,
  avgKcalOnWeightRiseDays,
  avgMorningAfterLateSnack,
  avgMorningAfterNoLateSnack,
  avgSleepBeforeWeightDrop,
  avgSleepBeforeWeightRise,
  buildAiInsightFingerprint,
  buildAiInsightUserMessage,
  buildHabitLogTable,
  buildMealLogTable,
  buildSleepLogTable,
  buildStepsLogTable,
  buildWeightLogTable,
  countLateSnackInWindow,
  countWorkoutInWindow,
  currentSevenDayLossRateKgPerWeek,
  daysFromTo,
  entryByDateMap,
  lastNDates,
  loggingStreaks,
  requiredDailyLoss,
  requiredWeeklyLossRate,
  sevenDayMorningAverage,
  sortEntriesAsc,
  type InsightEntryRow,
  type MealDayTotal,
} from "../../../lib/insights/aiInsightData";
import {
  parseAiInsightStructured,
  type AiInsightStructured,
  type VerdictStatus,
} from "../../../lib/insights/aiInsightStructured";

const DAILY_LIMIT = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

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
  structured?: AiInsightStructured;
  degraded?: boolean;
};

function mealLibraryOn(): boolean {
  return process.env.FF_MEAL_LIBRARY === "true";
}

async function sumMealsForDay(
  ddb: DynamoDBClient,
  dayMealsTableName: string,
  userId: string,
  day: string,
): Promise<{ kcal: number; protein: number }> {
  const dayKey = `${userId}#${day}`;
  const out = await ddb.send(
    new QueryCommand({
      TableName: dayMealsTableName,
      KeyConditionExpression: "dayKey = :d",
      ExpressionAttributeValues: { ":d": { S: dayKey } },
    }),
  );
  let kcal = 0;
  let protein = 0;
  for (const it of out.Items ?? []) {
    if (it.deletedAt?.S) continue;
    const k = it.kcal?.N != null ? Number(it.kcal.N) : 0;
    const p = it.proteinG?.N != null ? Number(it.proteinG.N) : 0;
    if (Number.isFinite(k)) kcal += Math.round(k);
    if (Number.isFinite(p)) protein += p;
  }
  return { kcal, protein };
}

async function loadMealTotalsLast7Days(
  ddb: DynamoDBClient,
  table: string | undefined,
  userId: string,
  endDate: string,
): Promise<MealDayTotal[]> {
  if (!table || !mealLibraryOn()) return [];
  const days = lastNDates(endDate, 7);
  const out: MealDayTotal[] = [];
  for (const day of days) {
    const { kcal, protein } = await sumMealsForDay(ddb, table, userId, day);
    out.push({ day, kcal, protein });
  }
  return out;
}

function fmtOrDash(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
}

async function getCachedCard(
  ddb: DynamoDBClient,
  cacheTable: string,
  userId: string,
  cacheKey: string,
): Promise<LambdaInsightCard | null> {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: cacheTable,
      Key: { userId: { S: userId }, cacheKey: { S: cacheKey } },
      ConsistentRead: true,
    }),
  );
  const ts = out.Item?.ts?.S;
  if (!ts) return null;
  const age = Date.now() - Date.parse(ts);
  if (age > CACHE_TTL_MS) return null;
  const payload = out.Item?.payloadJson?.S;
  if (!payload) return null;
  try {
    return JSON.parse(payload) as LambdaInsightCard;
  } catch {
    return null;
  }
}

async function putCachedCard(
  ddb: DynamoDBClient,
  cacheTable: string,
  userId: string,
  cacheKey: string,
  card: LambdaInsightCard,
): Promise<void> {
  const now = new Date().toISOString();
  const withTs = { ...card, generatedAt: card.generatedAt ?? now };
  await ddb.send(
    new PutItemCommand({
      TableName: cacheTable,
      Item: {
        userId: { S: userId },
        cacheKey: { S: cacheKey },
        payloadJson: { S: JSON.stringify(withTs) },
        ts: { S: now },
      },
    }),
  );
}

async function incrementLlmUsage(ddb: DynamoDBClient, cacheTable: string, userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `__usage_ai_card__#${day}`;
  const out = await ddb.send(
    new UpdateItemCommand({
      TableName: cacheTable,
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

function buildFallbackStructured(input: {
  today: string;
  currentW: number;
  goalWeight: number;
  targetDate: string;
  nLogs: number;
  weekly: number | null;
  reqWeekly: number | null;
  entriesAsc: InsightEntryRow[];
  mealTotals: MealDayTotal[];
}): AiInsightStructured {
  const last = input.entriesAsc[input.entriesAsc.length - 1];
  let daysNoWorkout = 0;
  for (let i = input.entriesAsc.length - 1; i >= 0; i -= 1) {
    if (input.entriesAsc[i]?.workout) break;
    daysNoWorkout += 1;
  }
  const sleep =
    last?.sleep != null && Number.isFinite(last.sleep) ? `${fmtOrDash(last.sleep, 1)}h` : "—";
  let protein = "—";
  if (last?.protein != null && Number.isFinite(last.protein)) {
    protein = `${Math.round(last.protein)}g`;
  } else if (input.mealTotals.length > 0) {
    const mt = input.mealTotals[input.mealTotals.length - 1];
    if (mt && mt.protein > 0) protein = `${Math.round(mt.protein)}g`;
  }
  const w = input.weekly != null ? fmtOrDash(input.weekly, 2) : "—";
  const rq = input.reqWeekly != null ? fmtOrDash(input.reqWeekly, 2) : "—";
  let status: VerdictStatus = "at_risk";
  if (input.weekly != null && input.reqWeekly != null) {
    if (input.weekly >= input.reqWeekly) status = "on_track";
    else if (input.weekly < input.reqWeekly * 0.35) status = "off_track";
    else status = "at_risk";
  }
  const headline =
    status === "on_track"
      ? `Pace matches goal — ${w} kg/wk vs ${rq} needed`
      : status === "off_track"
        ? `Well under required pace — ${w} vs ${rq} kg/wk`
        : `Below target pace — ${w} kg/wk vs ${rq} needed`;
  const detail = `${input.nLogs} weigh-ins through ${input.today}; goal ${fmtOrDash(input.goalWeight, 2)} kg by ${input.targetDate}.`;
  return {
    verdict: { status, headline, detail },
    working: {
      body:
        input.nLogs >= 2
          ? `Current weight ${fmtOrDash(input.currentW, 2)} kg on ${last?.date ?? input.today}.`
          : "Log a few more days to sharpen recommendations.",
    },
    stalling: {
      body: `Velocity ~${w} kg/week vs ~${rq} kg/week required by ${input.targetDate}.`,
      metrics: [
        { value: String(daysNoWorkout), label: "days no workout" },
        { value: sleep, label: "sleep last log" },
        { value: protein, label: "protein same day" },
      ],
    },
    actions: [
      { icon: "walk", action: "10–20 min walk", reason: "Easy volume without overtraining" },
      { icon: "food", action: "Hit daily protein", reason: "Preserves muscle in a deficit" },
      { icon: "moon", action: "Target 7h sleep", reason: "Steadier mornings with adequate rest" },
    ],
    prediction: {
      headline: `Trend toward ${fmtOrDash(input.goalWeight, 2)} kg by ${input.targetDate}`,
      basis: "From current 7-day rate vs required weekly rate",
    },
  };
}

function buildDegradedStructured(): AiInsightStructured {
  return {
    verdict: {
      status: "off_track",
      headline: "Analysis updating — check back in a moment.",
      detail: "",
    },
    working: { body: "" },
    stalling: {
      body: "",
      metrics: [
        { value: "—", label: "—" },
        { value: "—", label: "—" },
        { value: "—", label: "—" },
      ],
    },
    actions: [
      { icon: "walk", action: "Refresh below", reason: "Reload this insight" },
      { icon: "food", action: "—", reason: "—" },
      { icon: "moon", action: "—", reason: "—" },
    ],
    prediction: { headline: "", basis: "" },
  };
}

function lambdaCardFromStructured(
  base: () => LambdaInsightCard,
  structured: AiInsightStructured,
  source: "llm" | "rules",
  degraded?: boolean,
): LambdaInsightCard {
  const a0 = structured.actions[0];
  const generatedAt = new Date().toISOString();
  return {
    ...base(),
    headline: structured.verdict.headline,
    detail: structured.verdict.detail,
    action: a0 ? `${a0.action} — ${a0.reason}` : "",
    why: [],
    structured,
    degraded: degraded === true,
    generationSource: source,
    generatedAt,
  };
}

/**
 * Single high-signal AI insight card. Cached 30 minutes per data fingerprint.
 */
export async function generateAiInsightCard(
  ddb: DynamoDBClient,
  ctx: {
    userId: string;
    entriesRaw: InsightEntryRow[];
    goalWeight: number;
    startWeight: number;
    targetDate: string;
    dayMealsTableName?: string;
  },
): Promise<LambdaInsightCard[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const cacheTable = process.env.INSIGHT_CACHE_TABLE_NAME?.trim();
  const model = process.env.ANTHROPIC_INSIGHTS_MODEL?.trim() || "claude-haiku-4-5";

  const entriesAsc = sortEntriesAsc(ctx.entriesRaw);
  const today = new Date().toISOString().slice(0, 10);
  const entryMap = entryByDateMap(entriesAsc);

  const mealTotals = await loadMealTotalsLast7Days(
    ddb,
    ctx.dayMealsTableName,
    ctx.userId,
    entriesAsc.length > 0 ? entriesAsc[entriesAsc.length - 1].date : today,
  );
  const mealByDay = new Map(mealTotals.map((m) => [m.day, m]));
  const mealDigest = mealTotals.map((m) => `${m.day}:${m.kcal}:${m.protein}`).join(";");

  const last = entriesAsc[entriesAsc.length - 1];
  const latestDate = last?.date ?? today;
  const latestMorning = last?.morningWeight ?? 0;
  const habitTail =
    entriesAsc
      .slice(-5)
      .map((e) => `${e.date}:${e.workout ? 1 : 0}${e.alcohol ? 1 : 0}${e.lateSnack ? 1 : 0}`)
      .join("|") || "none";

  const fingerprint = buildAiInsightFingerprint({
    userId: ctx.userId,
    latestDate,
    latestMorning,
    goalWeight: ctx.goalWeight,
    targetDate: ctx.targetDate,
    mealDigest,
    habitTail,
  });

  if (cacheTable) {
    const hit = await getCachedCard(ddb, cacheTable, ctx.userId, fingerprint);
    if (hit) return [hit];
  }

  const currentW = last?.morningWeight ?? ctx.startWeight;
  const sevenAvg = sevenDayMorningAverage(entriesAsc);
  const daysToGoal = String(Math.max(0, daysFromTo(today, ctx.targetDate)));
  const win14 = lastNDates(latestDate, 14);
  const lateSnack14 = `${countLateSnackInWindow(win14, entryMap)}/14`;
  const workout14 = `${countWorkoutInWindow(win14, entryMap)}/14`;

  const avgAfterSnack = avgMorningAfterLateSnack(entriesAsc);
  const avgNoSnack = avgMorningAfterNoLateSnack(entriesAsc);
  const avgWorkDelta = avgDeltaMorningAfterWorkout(entriesAsc);
  const weeklyLoss = currentSevenDayLossRateKgPerWeek(entriesAsc);
  const reqWeekly = requiredWeeklyLossRate(currentW, ctx.goalWeight, today, ctx.targetDate);
  const streaks = loggingStreaks(entriesAsc, today);

  const avgKcalRise = avgKcalOnWeightRiseDays(entriesAsc, mealByDay);
  const avgKcalFall = avgKcalOnWeightFallDays(entriesAsc, mealByDay);
  const avgSleepDrop = avgSleepBeforeWeightDrop(entriesAsc);
  const avgSleepRise = avgSleepBeforeWeightRise(entriesAsc);

  const dates14 = lastNDates(latestDate, 14);
  const userMsg = buildAiInsightUserMessage({
    today,
    currentWeight: fmtOrDash(currentW, 2),
    sevenDayAvg: sevenAvg != null ? fmtOrDash(sevenAvg, 2) : "—",
    startWeight: fmtOrDash(ctx.startWeight, 2),
    targetWeight: fmtOrDash(ctx.goalWeight, 2),
    daysToGoal,
    goalDate: ctx.targetDate,
    dailyLossNeeded: requiredDailyLoss(currentW, ctx.goalWeight, today, ctx.targetDate),
    weightLogTable: entriesAsc.length ? buildWeightLogTable(entriesAsc, 30) : "(no rows)",
    habitLogTable: entriesAsc.length ? buildHabitLogTable(entriesAsc, 30) : "(no rows)",
    mealLogTable:
      mealTotals.length > 0
        ? buildMealLogTable(mealTotals, entryMap)
        : entriesAsc.length
          ? lastNDates(latestDate, 7)
              .map((d) => {
                const e = entryMap.get(d);
                return `${d} · ${e?.calories ?? 0} · ${e?.protein ?? 0}`;
              })
              .join("\n")
          : "(no rows)",
    stepsLogTable: buildStepsLogTable(dates14, entryMap),
    sleepLogTable: buildSleepLogTable(dates14, entryMap),
    lateSnackCount14: lateSnack14,
    avgWeightAfterSnack: avgAfterSnack != null ? fmtOrDash(avgAfterSnack, 2) : "—",
    avgWeightNoSnack: avgNoSnack != null ? fmtOrDash(avgNoSnack, 2) : "—",
    workoutCount14: workout14,
    avgDeltaAfterWorkout: avgWorkDelta != null ? fmtOrDash(avgWorkDelta, 2) : "—",
    weeklyLossRate: weeklyLoss != null ? fmtOrDash(weeklyLoss, 2) : "—",
    requiredWeeklyRate: reqWeekly != null ? fmtOrDash(reqWeekly, 2) : "—",
    longestStreak: String(streaks.longest),
    currentStreak: String(streaks.current),
    avgKcalRise: avgKcalRise != null ? fmtOrDash(avgKcalRise, 1) : "—",
    avgKcalFall: avgKcalFall != null ? fmtOrDash(avgKcalFall, 1) : "—",
    avgSleepDrop: avgSleepDrop != null ? fmtOrDash(avgSleepDrop, 2) : "—",
    avgSleepRise: avgSleepRise != null ? fmtOrDash(avgSleepRise, 2) : "—",
  });

  const baseCard = (): LambdaInsightCard => ({
    id: `ai-insight-${today}`,
    ruleId: "ai_intelligence",
    priority: 100,
    headline: "",
    why: [],
    action: "",
    category: "trajectory",
    generationSource: "llm",
  });

  const fallbackCtx = {
    today,
    currentW,
    goalWeight: ctx.goalWeight,
    targetDate: ctx.targetDate,
    nLogs: entriesAsc.length,
    weekly: weeklyLoss,
    reqWeekly,
    entriesAsc,
    mealTotals,
  };

  if (!apiKey) {
    const structured = buildFallbackStructured(fallbackCtx);
    return [lambdaCardFromStructured(baseCard, structured, "rules")];
  }

  if (cacheTable) {
    const count = await incrementLlmUsage(ddb, cacheTable, ctx.userId);
    if (count > DAILY_LIMIT) {
      const structured = buildFallbackStructured(fallbackCtx);
      return [lambdaCardFromStructured(baseCard, structured, "rules")];
    }
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    type Msg = { role: "user" | "assistant"; content: string };
    const run = (messages: Msg[]) =>
      client.messages.create({
        model,
        max_tokens: 300,
        temperature: 0,
        system: OJAS_AI_INSIGHT_SYSTEM,
        messages,
      });

    let messages: Msg[] = [{ role: "user", content: userMsg }];
    let response = await run(messages);
    let text = response.content.find((part) => part.type === "text")?.text ?? "";
    let parsed = parseAiInsightStructured(text);
    if (!parsed.ok) {
      messages = [
        { role: "user", content: userMsg },
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Your previous reply was not valid JSON. Reply with ONLY one JSON object matching the schema from the system prompt. No markdown, no code fences, no extra text.",
        },
      ];
      response = await run(messages);
      text = response.content.find((part) => part.type === "text")?.text ?? "";
      parsed = parseAiInsightStructured(text);
    }

    let card: LambdaInsightCard;
    if (parsed.ok) {
      card = lambdaCardFromStructured(baseCard, parsed.data, "llm");
    } else {
      card = lambdaCardFromStructured(baseCard, buildDegradedStructured(), "llm", true);
    }
    if (cacheTable) {
      await putCachedCard(ddb, cacheTable, ctx.userId, fingerprint, card);
    }
    return [card];
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "insights_ai_card_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    const structured = buildFallbackStructured(fallbackCtx);
    return [lambdaCardFromStructured(baseCard, structured, "rules")];
  }
}
