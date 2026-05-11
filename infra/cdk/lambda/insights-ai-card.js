"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAiInsightCard = generateAiInsightCard;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const aiInsightPrompt_1 = require("../../../lib/insights/aiInsightPrompt");
const aiInsightData_1 = require("../../../lib/insights/aiInsightData");
const aiInsightStructured_1 = require("../../../lib/insights/aiInsightStructured");
const DAILY_LIMIT = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;
function mealLibraryOn() {
    return process.env.FF_MEAL_LIBRARY === "true";
}
async function sumMealsForDay(ddb, dayMealsTableName, userId, day) {
    const dayKey = `${userId}#${day}`;
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: dayMealsTableName,
        KeyConditionExpression: "dayKey = :d",
        ExpressionAttributeValues: { ":d": { S: dayKey } },
    }));
    let kcal = 0;
    let protein = 0;
    for (const it of out.Items ?? []) {
        if (it.deletedAt?.S)
            continue;
        const k = it.kcal?.N != null ? Number(it.kcal.N) : 0;
        const p = it.proteinG?.N != null ? Number(it.proteinG.N) : 0;
        if (Number.isFinite(k))
            kcal += Math.round(k);
        if (Number.isFinite(p))
            protein += p;
    }
    return { kcal, protein };
}
async function loadMealTotalsLast7Days(ddb, table, userId, endDate) {
    if (!table || !mealLibraryOn())
        return [];
    const days = (0, aiInsightData_1.lastNDates)(endDate, 7);
    const out = [];
    for (const day of days) {
        const { kcal, protein } = await sumMealsForDay(ddb, table, userId, day);
        out.push({ day, kcal, protein });
    }
    return out;
}
function fmtOrDash(n, digits = 2) {
    if (n == null || !Number.isFinite(n))
        return "—";
    return (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
}
async function getCachedCard(ddb, cacheTable, userId, cacheKey) {
    const out = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: cacheTable,
        Key: { userId: { S: userId }, cacheKey: { S: cacheKey } },
        ConsistentRead: true,
    }));
    const ts = out.Item?.ts?.S;
    if (!ts)
        return null;
    const age = Date.now() - Date.parse(ts);
    if (age > CACHE_TTL_MS)
        return null;
    const payload = out.Item?.payloadJson?.S;
    if (!payload)
        return null;
    try {
        return JSON.parse(payload);
    }
    catch {
        return null;
    }
}
/** Legacy rows may have omitted `degraded` while storing this placeholder headline. */
function isPoisonedCachedAiCard(hit) {
    const h = hit.structured?.verdict?.headline ?? "";
    return h.includes("Analysis updating") && h.toLowerCase().includes("check back");
}
async function putCachedCard(ddb, cacheTable, userId, cacheKey, card) {
    const now = new Date().toISOString();
    const withTs = { ...card, generatedAt: card.generatedAt ?? now };
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: cacheTable,
        Item: {
            userId: { S: userId },
            cacheKey: { S: cacheKey },
            payloadJson: { S: JSON.stringify(withTs) },
            ts: { S: now },
        },
    }));
}
async function incrementLlmUsage(ddb, cacheTable, userId) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `__usage_ai_card__#${day}`;
    const out = await ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: cacheTable,
        Key: { userId: { S: userId }, cacheKey: { S: key } },
        UpdateExpression: "ADD llmCalls :one SET ts = :ts",
        ExpressionAttributeValues: {
            ":one": { N: "1" },
            ":ts": { S: new Date().toISOString() },
        },
        ReturnValues: "UPDATED_NEW",
    }));
    return Number(out.Attributes?.llmCalls?.N ?? 0);
}
function buildFallbackStructured(input) {
    const last = input.entriesAsc[input.entriesAsc.length - 1];
    let daysNoWorkout = 0;
    for (let i = input.entriesAsc.length - 1; i >= 0; i -= 1) {
        if (input.entriesAsc[i]?.workout)
            break;
        daysNoWorkout += 1;
    }
    const sleep = last?.sleep != null && Number.isFinite(last.sleep) ? `${fmtOrDash(last.sleep, 1)}h` : "—";
    let protein = "—";
    if (last?.protein != null && Number.isFinite(last.protein)) {
        protein = `${Math.round(last.protein)}g`;
    }
    else if (input.mealTotals.length > 0) {
        const mt = input.mealTotals[input.mealTotals.length - 1];
        if (mt && mt.protein > 0)
            protein = `${Math.round(mt.protein)}g`;
    }
    const w = input.weekly != null ? fmtOrDash(input.weekly, 2) : "—";
    const rq = input.reqWeekly != null ? fmtOrDash(input.reqWeekly, 2) : "—";
    let status = "at_risk";
    if (input.weekly != null && input.reqWeekly != null) {
        if (input.weekly >= input.reqWeekly)
            status = "on_track";
        else if (input.weekly < input.reqWeekly * 0.35)
            status = "off_track";
        else
            status = "at_risk";
    }
    const headline = status === "on_track"
        ? `Pace matches goal — ${w} kg/wk vs ${rq} needed`
        : status === "off_track"
            ? `Well under required pace — ${w} vs ${rq} kg/wk`
            : `Below target pace — ${w} kg/wk vs ${rq} needed`;
    const detail = `${input.nLogs} weigh-ins through ${input.today}; goal ${fmtOrDash(input.goalWeight, 2)} kg by ${input.targetDate}.`;
    return {
        verdict: { status, headline, detail },
        working: {
            body: input.nLogs >= 2
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
function lambdaCardFromStructured(base, structured, source) {
    const a0 = structured.actions[0];
    const generatedAt = new Date().toISOString();
    return {
        ...base(),
        headline: structured.verdict.headline,
        detail: structured.verdict.detail,
        action: a0 ? `${a0.action} — ${a0.reason}` : "",
        why: [],
        structured,
        generationSource: source,
        generatedAt,
    };
}
/**
 * Single high-signal AI insight card. Cached 30 minutes per data fingerprint.
 */
async function generateAiInsightCard(ddb, ctx) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const cacheTable = process.env.INSIGHT_CACHE_TABLE_NAME?.trim();
    const model = process.env.ANTHROPIC_INSIGHTS_MODEL?.trim() || "claude-haiku-4-5";
    const entriesAsc = (0, aiInsightData_1.sortEntriesAsc)(ctx.entriesRaw);
    const today = new Date().toISOString().slice(0, 10);
    const entryMap = (0, aiInsightData_1.entryByDateMap)(entriesAsc);
    const mealTotals = await loadMealTotalsLast7Days(ddb, ctx.dayMealsTableName, ctx.userId, entriesAsc.length > 0 ? entriesAsc[entriesAsc.length - 1].date : today);
    const mealByDay = new Map(mealTotals.map((m) => [m.day, m]));
    const mealDigest = mealTotals.map((m) => `${m.day}:${m.kcal}:${m.protein}`).join(";");
    const last = entriesAsc[entriesAsc.length - 1];
    const latestDate = last?.date ?? today;
    const latestMorning = last?.morningWeight ?? 0;
    const habitTail = entriesAsc
        .slice(-5)
        .map((e) => `${e.date}:${e.workout ? 1 : 0}${e.alcohol ? 1 : 0}${e.lateSnack ? 1 : 0}`)
        .join("|") || "none";
    const fingerprint = (0, aiInsightData_1.buildAiInsightFingerprint)({
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
        /** Skip prose-only cache, parse-failure placeholders (`degraded`), poisoned legacy payloads, and pre-v4 keys. */
        if (hit?.structured && !hit.degraded && !isPoisonedCachedAiCard(hit))
            return [hit];
    }
    const currentW = last?.morningWeight ?? ctx.startWeight;
    const sevenAvg = (0, aiInsightData_1.sevenDayMorningAverage)(entriesAsc);
    const daysToGoal = String(Math.max(0, (0, aiInsightData_1.daysFromTo)(today, ctx.targetDate)));
    const win14 = (0, aiInsightData_1.lastNDates)(latestDate, 14);
    const lateSnack14 = `${(0, aiInsightData_1.countLateSnackInWindow)(win14, entryMap)}/14`;
    const workout14 = `${(0, aiInsightData_1.countWorkoutInWindow)(win14, entryMap)}/14`;
    const avgAfterSnack = (0, aiInsightData_1.avgMorningAfterLateSnack)(entriesAsc);
    const avgNoSnack = (0, aiInsightData_1.avgMorningAfterNoLateSnack)(entriesAsc);
    const avgWorkDelta = (0, aiInsightData_1.avgDeltaMorningAfterWorkout)(entriesAsc);
    const weeklyLoss = (0, aiInsightData_1.currentSevenDayLossRateKgPerWeek)(entriesAsc);
    const reqWeekly = (0, aiInsightData_1.requiredWeeklyLossRate)(currentW, ctx.goalWeight, today, ctx.targetDate);
    const streaks = (0, aiInsightData_1.loggingStreaks)(entriesAsc, today);
    const avgKcalRise = (0, aiInsightData_1.avgKcalOnWeightRiseDays)(entriesAsc, mealByDay);
    const avgKcalFall = (0, aiInsightData_1.avgKcalOnWeightFallDays)(entriesAsc, mealByDay);
    const avgSleepDrop = (0, aiInsightData_1.avgSleepBeforeWeightDrop)(entriesAsc);
    const avgSleepRise = (0, aiInsightData_1.avgSleepBeforeWeightRise)(entriesAsc);
    const dates14 = (0, aiInsightData_1.lastNDates)(latestDate, 14);
    const userMsg = (0, aiInsightData_1.buildAiInsightUserMessage)({
        today,
        currentWeight: fmtOrDash(currentW, 2),
        sevenDayAvg: sevenAvg != null ? fmtOrDash(sevenAvg, 2) : "—",
        startWeight: fmtOrDash(ctx.startWeight, 2),
        targetWeight: fmtOrDash(ctx.goalWeight, 2),
        daysToGoal,
        goalDate: ctx.targetDate,
        dailyLossNeeded: (0, aiInsightData_1.requiredDailyLoss)(currentW, ctx.goalWeight, today, ctx.targetDate),
        weightLogTable: entriesAsc.length ? (0, aiInsightData_1.buildWeightLogTable)(entriesAsc, 30) : "(no rows)",
        habitLogTable: entriesAsc.length ? (0, aiInsightData_1.buildHabitLogTable)(entriesAsc, 30) : "(no rows)",
        mealLogTable: mealTotals.length > 0
            ? (0, aiInsightData_1.buildMealLogTable)(mealTotals, entryMap)
            : entriesAsc.length
                ? (0, aiInsightData_1.lastNDates)(latestDate, 7)
                    .map((d) => {
                    const e = entryMap.get(d);
                    return `${d} · ${e?.calories ?? 0} · ${e?.protein ?? 0}`;
                })
                    .join("\n")
                : "(no rows)",
        stepsLogTable: (0, aiInsightData_1.buildStepsLogTable)(dates14, entryMap),
        sleepLogTable: (0, aiInsightData_1.buildSleepLogTable)(dates14, entryMap),
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
    const baseCard = () => ({
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
        const Anthropic = (await Promise.resolve().then(() => __importStar(require("@anthropic-ai/sdk")))).default;
        const client = new Anthropic({ apiKey });
        const run = (messages) => client.messages.create({
            model,
            /** JSON schema needs more room than prose; 300 often truncates and triggers the degraded fallback. */
            max_tokens: 1200,
            temperature: 0,
            system: aiInsightPrompt_1.OJAS_AI_INSIGHT_SYSTEM,
            messages,
        });
        let messages = [{ role: "user", content: userMsg }];
        let response = await run(messages);
        let text = response.content.find((part) => part.type === "text")?.text ?? "";
        let parsed = (0, aiInsightStructured_1.parseAiInsightStructured)(text);
        if (!parsed.ok) {
            console.error(JSON.stringify({
                msg: "insights_ai_parse_failed_first",
                error: parsed.error,
                sample: text.slice(0, 400),
            }));
            messages = [
                { role: "user", content: userMsg },
                { role: "assistant", content: text },
                {
                    role: "user",
                    content: "Your previous reply was not valid JSON. Reply with ONLY one JSON object matching the schema from the system prompt. No markdown, no code fences, no extra text. Use double quotes for all keys and string values.",
                },
            ];
            response = await run(messages);
            text = response.content.find((part) => part.type === "text")?.text ?? "";
            parsed = (0, aiInsightStructured_1.parseAiInsightStructured)(text);
        }
        let card;
        if (parsed.ok) {
            card = lambdaCardFromStructured(baseCard, parsed.data, "llm");
            if (cacheTable) {
                await putCachedCard(ddb, cacheTable, ctx.userId, fingerprint, card);
            }
        }
        else {
            console.error(JSON.stringify({
                msg: "insights_ai_parse_failed_final",
                error: parsed.error,
                sample: text.slice(0, 400),
            }));
            const structured = buildFallbackStructured(fallbackCtx);
            card = lambdaCardFromStructured(baseCard, structured, "rules");
            if (cacheTable) {
                await putCachedCard(ddb, cacheTable, ctx.userId, fingerprint, card);
            }
        }
        return [card];
    }
    catch (err) {
        console.error(JSON.stringify({
            msg: "insights_ai_card_failed",
            error: err instanceof Error ? err.message : String(err),
        }));
        const structured = buildFallbackStructured(fallbackCtx);
        return [lambdaCardFromStructured(baseCard, structured, "rules")];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zaWdodHMtYWktY2FyZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluc2lnaHRzLWFpLWNhcmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE4UUEsc0RBMk5DO0FBeGVELDhEQUEyRztBQUMzRywyRUFBK0U7QUFDL0UsdUVBNEI2QztBQUM3QyxtRkFJbUQ7QUFFbkQsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQ3hCLE1BQU0sWUFBWSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0FBaUJwQyxTQUFTLGFBQWE7SUFDcEIsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsS0FBSyxNQUFNLENBQUM7QUFDaEQsQ0FBQztBQUVELEtBQUssVUFBVSxjQUFjLENBQzNCLEdBQW1CLEVBQ25CLGlCQUF5QixFQUN6QixNQUFjLEVBQ2QsR0FBVztJQUVYLE1BQU0sTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2xDLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FDeEIsSUFBSSw4QkFBWSxDQUFDO1FBQ2YsU0FBUyxFQUFFLGlCQUFpQjtRQUM1QixzQkFBc0IsRUFBRSxhQUFhO1FBQ3JDLHlCQUF5QixFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFO0tBQ25ELENBQUMsQ0FDSCxDQUFDO0lBQ0YsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLEtBQUssTUFBTSxFQUFFLElBQUksR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUNqQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUFFLFNBQVM7UUFDOUIsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLElB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LE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7YUFDM0IsQ0FBQyxDQUNILENBQUM7WUFDRixNQUFNLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN4RCxJQUFJLEdBQUcsd0JBQXdCLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMvRCxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNmLE1BQU0sYUFBYSxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdEUsQ0FBQztRQUNILENBQUM7UUFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEIsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDYixPQUFPLENBQUMsS0FBSyxDQUNYLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDYixHQUFHLEVBQUUseUJBQXlCO1lBQzlCLEtBQUssRUFBRSxHQUFHLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO1NBQ3hELENBQUMsQ0FDSCxDQUFDO1FBQ0YsTUFBTSxVQUFVLEdBQUcsdUJBQXVCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDeEQsT0FBTyxDQUFDLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNuRSxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgRHluYW1vREJDbGllbnQgfSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBHZXRJdGVtQ29tbWFuZCwgUHV0SXRlbUNvbW1hbmQsIFF1ZXJ5Q29tbWFuZCwgVXBkYXRlSXRlbUNvbW1hbmQgfSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBPSkFTX0FJX0lOU0lHSFRfU1lTVEVNIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9pbnNpZ2h0cy9haUluc2lnaHRQcm9tcHRcIjtcbmltcG9ydCB7XG4gIGF2Z0RlbHRhTW9ybmluZ0FmdGVyV29ya291dCxcbiAgYXZnS2NhbE9uV2VpZ2h0RmFsbERheXMsXG4gIGF2Z0tjYWxPbldlaWdodFJpc2VEYXlzLFxuICBhdmdNb3JuaW5nQWZ0ZXJMYXRlU25hY2ssXG4gIGF2Z01vcm5pbmdBZnRlck5vTGF0ZVNuYWNrLFxuICBhdmdTbGVlcEJlZm9yZVdlaWdodERyb3AsXG4gIGF2Z1NsZWVwQmVmb3JlV2VpZ2h0UmlzZSxcbiAgYnVpbGRBaUluc2lnaHRGaW5nZXJwcmludCxcbiAgYnVpbGRBaUluc2lnaHRVc2VyTWVzc2FnZSxcbiAgYnVpbGRIYWJpdExvZ1RhYmxlLFxuICBidWlsZE1lYWxMb2dUYWJsZSxcbiAgYnVpbGRTbGVlcExvZ1RhYmxlLFxuICBidWlsZFN0ZXBzTG9nVGFibGUsXG4gIGJ1aWxkV2VpZ2h0TG9nVGFibGUsXG4gIGNvdW50TGF0ZVNuYWNrSW5XaW5kb3csXG4gIGNvdW50V29ya291dEluV2luZG93LFxuICBjdXJyZW50U2V2ZW5EYXlMb3NzUmF0ZUtnUGVyV2VlayxcbiAgZGF5c0Zyb21UbyxcbiAgZW50cnlCeURhdGVNYXAsXG4gIGxhc3RORGF0ZXMsXG4gIGxvZ2dpbmdTdHJlYWtzLFxuICByZXF1aXJlZERhaWx5TG9zcyxcbiAgcmVxdWlyZWRXZWVrbHlMb3NzUmF0ZSxcbiAgc2V2ZW5EYXlNb3JuaW5nQXZlcmFnZSxcbiAgc29ydEVudHJpZXNBc2MsXG4gIHR5cGUgSW5zaWdodEVudHJ5Um93LFxuICB0eXBlIE1lYWxEYXlUb3RhbCxcbn0gZnJvbSBcIi4uLy4uLy4uL2xpYi9pbnNpZ2h0cy9haUluc2lnaHREYXRhXCI7XG5pbXBvcnQge1xuICBwYXJzZUFpSW5zaWdodFN0cnVjdHVyZWQsXG4gIHR5cGUgQWlJbnNpZ2h0U3RydWN0dXJlZCxcbiAgdHlwZSBWZXJkaWN0U3RhdHVzLFxufSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2FpSW5zaWdodFN0cnVjdHVyZWRcIjtcblxuY29uc3QgREFJTFlfTElNSVQgPSAxMDA7XG5jb25zdCBDQUNIRV9UVExfTVMgPSAzMCAqIDYwICogMTAwMDtcblxuZXhwb3J0IHR5cGUgTGFtYmRhSW5zaWdodENhcmQgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIHJ1bGVJZDogc3RyaW5nO1xuICBwcmlvcml0eTogbnVtYmVyO1xuICBoZWFkbGluZTogc3RyaW5nO1xuICBkZXRhaWw/OiBzdHJpbmc7XG4gIHdoeTogc3RyaW5nW107XG4gIGFjdGlvbjogc3RyaW5nO1xuICBjYXRlZ29yeTogXCJzb2RpdW1cIiB8IFwiYWxjb2hvbFwiIHwgXCJsYXRlX3NuYWNrXCIgfCBcIndvcmtvdXRcIiB8IFwicGxhdGVhdVwiIHwgXCJzdHJlYWtcIiB8IFwidHJhamVjdG9yeVwiO1xuICBnZW5lcmF0aW9uU291cmNlPzogXCJsbG1cIiB8IFwicnVsZXNcIjtcbiAgZ2VuZXJhdGVkQXQ/OiBzdHJpbmc7XG4gIHN0cnVjdHVyZWQ/OiBBaUluc2lnaHRTdHJ1Y3R1cmVkO1xuICBkZWdyYWRlZD86IGJvb2xlYW47XG59O1xuXG5mdW5jdGlvbiBtZWFsTGlicmFyeU9uKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuRkZfTUVBTF9MSUJSQVJZID09PSBcInRydWVcIjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3VtTWVhbHNGb3JEYXkoXG4gIGRkYjogRHluYW1vREJDbGllbnQsXG4gIGRheU1lYWxzVGFibGVOYW1lOiBzdHJpbmcsXG4gIHVzZXJJZDogc3RyaW5nLFxuICBkYXk6IHN0cmluZyxcbik6IFByb21pc2U8eyBrY2FsOiBudW1iZXI7IHByb3RlaW46IG51bWJlciB9PiB7XG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRheU1lYWxzVGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJkYXlLZXkgPSA6ZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjpkXCI6IHsgUzogZGF5S2V5IH0gfSxcbiAgICB9KSxcbiAgKTtcbiAgbGV0IGtjYWwgPSAwO1xuICBsZXQgcHJvdGVpbiA9IDA7XG4gIGZvciAoY29uc3QgaXQgb2Ygb3V0Lkl0ZW1zID8/IFtdKSB7XG4gICAgaWYgKGl0LmRlbGV0ZWRBdD8uUykgY29udGludWU7XG4gICAgY29uc3QgayA9IGl0LmtjYWw/Lk4gIT0gbnVsbCA/IE51bWJlcihpdC5rY2FsLk4pIDogMDtcbiAgICBjb25zdCBwID0gaXQucHJvdGVpbkc/Lk4gIT0gbnVsbCA/IE51bWJlcihpdC5wcm90ZWluRy5OKSA6IDA7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShrKSkga2NhbCArPSBNYXRoLnJvdW5kKGspO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUocCkpIHByb3RlaW4gKz0gcDtcbiAgfVxuICByZXR1cm4geyBrY2FsLCBwcm90ZWluIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRNZWFsVG90YWxzTGFzdDdEYXlzKFxuICBkZGI6IER5bmFtb0RCQ2xpZW50LFxuICB0YWJsZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZW5kRGF0ZTogc3RyaW5nLFxuKTogUHJvbWlzZTxNZWFsRGF5VG90YWxbXT4ge1xuICBpZiAoIXRhYmxlIHx8ICFtZWFsTGlicmFyeU9uKCkpIHJldHVybiBbXTtcbiAgY29uc3QgZGF5cyA9IGxhc3RORGF0ZXMoZW5kRGF0ZSwgNyk7XG4gIGNvbnN0IG91dDogTWVhbERheVRvdGFsW10gPSBbXTtcbiAgZm9yIChjb25zdCBkYXkgb2YgZGF5cykge1xuICAgIGNvbnN0IHsga2NhbCwgcHJvdGVpbiB9ID0gYXdhaXQgc3VtTWVhbHNGb3JEYXkoZGRiLCB0YWJsZSwgdXNlcklkLCBkYXkpO1xuICAgIG91dC5wdXNoKHsgZGF5LCBrY2FsLCBwcm90ZWluIH0pO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZtdE9yRGFzaChuOiBudW1iZXIgfCBudWxsLCBkaWdpdHMgPSAyKTogc3RyaW5nIHtcbiAgaWYgKG4gPT0gbnVsbCB8fCAhTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4gXCLigJRcIjtcbiAgcmV0dXJuIChNYXRoLnJvdW5kKG4gKiAxMCAqKiBkaWdpdHMpIC8gMTAgKiogZGlnaXRzKS50b0ZpeGVkKGRpZ2l0cyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldENhY2hlZENhcmQoXG4gIGRkYjogRHluYW1vREJDbGllbnQsXG4gIGNhY2hlVGFibGU6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGNhY2hlS2V5OiBzdHJpbmcsXG4pOiBQcm9taXNlPExhbWJkYUluc2lnaHRDYXJkIHwgbnVsbD4ge1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBjYWNoZVRhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSwgY2FjaGVLZXk6IHsgUzogY2FjaGVLZXkgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHRzID0gb3V0Lkl0ZW0/LnRzPy5TO1xuICBpZiAoIXRzKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgYWdlID0gRGF0ZS5ub3coKSAtIERhdGUucGFyc2UodHMpO1xuICBpZiAoYWdlID4gQ0FDSEVfVFRMX01TKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcGF5bG9hZCA9IG91dC5JdGVtPy5wYXlsb2FkSnNvbj8uUztcbiAgaWYgKCFwYXlsb2FkKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShwYXlsb2FkKSBhcyBMYW1iZGFJbnNpZ2h0Q2FyZDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqIExlZ2FjeSByb3dzIG1heSBoYXZlIG9taXR0ZWQgYGRlZ3JhZGVkYCB3aGlsZSBzdG9yaW5nIHRoaXMgcGxhY2Vob2xkZXIgaGVhZGxpbmUuICovXG5mdW5jdGlvbiBpc1BvaXNvbmVkQ2FjaGVkQWlDYXJkKGhpdDogTGFtYmRhSW5zaWdodENhcmQpOiBib29sZWFuIHtcbiAgY29uc3QgaCA9IGhpdC5zdHJ1Y3R1cmVkPy52ZXJkaWN0Py5oZWFkbGluZSA/PyBcIlwiO1xuICByZXR1cm4gaC5pbmNsdWRlcyhcIkFuYWx5c2lzIHVwZGF0aW5nXCIpICYmIGgudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhcImNoZWNrIGJhY2tcIik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHB1dENhY2hlZENhcmQoXG4gIGRkYjogRHluYW1vREJDbGllbnQsXG4gIGNhY2hlVGFibGU6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGNhY2hlS2V5OiBzdHJpbmcsXG4gIGNhcmQ6IExhbWJkYUluc2lnaHRDYXJkLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3Qgd2l0aFRzID0geyAuLi5jYXJkLCBnZW5lcmF0ZWRBdDogY2FyZC5nZW5lcmF0ZWRBdCA/PyBub3cgfTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogY2FjaGVUYWJsZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBjYWNoZUtleTogeyBTOiBjYWNoZUtleSB9LFxuICAgICAgICBwYXlsb2FkSnNvbjogeyBTOiBKU09OLnN0cmluZ2lmeSh3aXRoVHMpIH0sXG4gICAgICAgIHRzOiB7IFM6IG5vdyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50TGxtVXNhZ2UoZGRiOiBEeW5hbW9EQkNsaWVudCwgY2FjaGVUYWJsZTogc3RyaW5nLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IGRheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGtleSA9IGBfX3VzYWdlX2FpX2NhcmRfXyMke2RheX1gO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBjYWNoZVRhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSwgY2FjaGVLZXk6IHsgUzoga2V5IH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiQUREIGxsbUNhbGxzIDpvbmUgU0VUIHRzID0gOnRzXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOm9uZVwiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIFwiOnRzXCI6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiBcIlVQREFURURfTkVXXCIsXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBOdW1iZXIob3V0LkF0dHJpYnV0ZXM/LmxsbUNhbGxzPy5OID8/IDApO1xufVxuXG5mdW5jdGlvbiBidWlsZEZhbGxiYWNrU3RydWN0dXJlZChpbnB1dDoge1xuICB0b2RheTogc3RyaW5nO1xuICBjdXJyZW50VzogbnVtYmVyO1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgbkxvZ3M6IG51bWJlcjtcbiAgd2Vla2x5OiBudW1iZXIgfCBudWxsO1xuICByZXFXZWVrbHk6IG51bWJlciB8IG51bGw7XG4gIGVudHJpZXNBc2M6IEluc2lnaHRFbnRyeVJvd1tdO1xuICBtZWFsVG90YWxzOiBNZWFsRGF5VG90YWxbXTtcbn0pOiBBaUluc2lnaHRTdHJ1Y3R1cmVkIHtcbiAgY29uc3QgbGFzdCA9IGlucHV0LmVudHJpZXNBc2NbaW5wdXQuZW50cmllc0FzYy5sZW5ndGggLSAxXTtcbiAgbGV0IGRheXNOb1dvcmtvdXQgPSAwO1xuICBmb3IgKGxldCBpID0gaW5wdXQuZW50cmllc0FzYy5sZW5ndGggLSAxOyBpID49IDA7IGkgLT0gMSkge1xuICAgIGlmIChpbnB1dC5lbnRyaWVzQXNjW2ldPy53b3Jrb3V0KSBicmVhaztcbiAgICBkYXlzTm9Xb3Jrb3V0ICs9IDE7XG4gIH1cbiAgY29uc3Qgc2xlZXAgPVxuICAgIGxhc3Q/LnNsZWVwICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKGxhc3Quc2xlZXApID8gYCR7Zm10T3JEYXNoKGxhc3Quc2xlZXAsIDEpfWhgIDogXCLigJRcIjtcbiAgbGV0IHByb3RlaW4gPSBcIuKAlFwiO1xuICBpZiAobGFzdD8ucHJvdGVpbiAhPSBudWxsICYmIE51bWJlci5pc0Zpbml0ZShsYXN0LnByb3RlaW4pKSB7XG4gICAgcHJvdGVpbiA9IGAke01hdGgucm91bmQobGFzdC5wcm90ZWluKX1nYDtcbiAgfSBlbHNlIGlmIChpbnB1dC5tZWFsVG90YWxzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtdCA9IGlucHV0Lm1lYWxUb3RhbHNbaW5wdXQubWVhbFRvdGFscy5sZW5ndGggLSAxXTtcbiAgICBpZiAobXQgJiYgbXQucHJvdGVpbiA+IDApIHByb3RlaW4gPSBgJHtNYXRoLnJvdW5kKG10LnByb3RlaW4pfWdgO1xuICB9XG4gIGNvbnN0IHcgPSBpbnB1dC53ZWVrbHkgIT0gbnVsbCA/IGZtdE9yRGFzaChpbnB1dC53ZWVrbHksIDIpIDogXCLigJRcIjtcbiAgY29uc3QgcnEgPSBpbnB1dC5yZXFXZWVrbHkgIT0gbnVsbCA/IGZtdE9yRGFzaChpbnB1dC5yZXFXZWVrbHksIDIpIDogXCLigJRcIjtcbiAgbGV0IHN0YXR1czogVmVyZGljdFN0YXR1cyA9IFwiYXRfcmlza1wiO1xuICBpZiAoaW5wdXQud2Vla2x5ICE9IG51bGwgJiYgaW5wdXQucmVxV2Vla2x5ICE9IG51bGwpIHtcbiAgICBpZiAoaW5wdXQud2Vla2x5ID49IGlucHV0LnJlcVdlZWtseSkgc3RhdHVzID0gXCJvbl90cmFja1wiO1xuICAgIGVsc2UgaWYgKGlucHV0LndlZWtseSA8IGlucHV0LnJlcVdlZWtseSAqIDAuMzUpIHN0YXR1cyA9IFwib2ZmX3RyYWNrXCI7XG4gICAgZWxzZSBzdGF0dXMgPSBcImF0X3Jpc2tcIjtcbiAgfVxuICBjb25zdCBoZWFkbGluZSA9XG4gICAgc3RhdHVzID09PSBcIm9uX3RyYWNrXCJcbiAgICAgID8gYFBhY2UgbWF0Y2hlcyBnb2FsIOKAlCAke3d9IGtnL3drIHZzICR7cnF9IG5lZWRlZGBcbiAgICAgIDogc3RhdHVzID09PSBcIm9mZl90cmFja1wiXG4gICAgICAgID8gYFdlbGwgdW5kZXIgcmVxdWlyZWQgcGFjZSDigJQgJHt3fSB2cyAke3JxfSBrZy93a2BcbiAgICAgICAgOiBgQmVsb3cgdGFyZ2V0IHBhY2Ug4oCUICR7d30ga2cvd2sgdnMgJHtycX0gbmVlZGVkYDtcbiAgY29uc3QgZGV0YWlsID0gYCR7aW5wdXQubkxvZ3N9IHdlaWdoLWlucyB0aHJvdWdoICR7aW5wdXQudG9kYXl9OyBnb2FsICR7Zm10T3JEYXNoKGlucHV0LmdvYWxXZWlnaHQsIDIpfSBrZyBieSAke2lucHV0LnRhcmdldERhdGV9LmA7XG4gIHJldHVybiB7XG4gICAgdmVyZGljdDogeyBzdGF0dXMsIGhlYWRsaW5lLCBkZXRhaWwgfSxcbiAgICB3b3JraW5nOiB7XG4gICAgICBib2R5OlxuICAgICAgICBpbnB1dC5uTG9ncyA+PSAyXG4gICAgICAgICAgPyBgQ3VycmVudCB3ZWlnaHQgJHtmbXRPckRhc2goaW5wdXQuY3VycmVudFcsIDIpfSBrZyBvbiAke2xhc3Q/LmRhdGUgPz8gaW5wdXQudG9kYXl9LmBcbiAgICAgICAgICA6IFwiTG9nIGEgZmV3IG1vcmUgZGF5cyB0byBzaGFycGVuIHJlY29tbWVuZGF0aW9ucy5cIixcbiAgICB9LFxuICAgIHN0YWxsaW5nOiB7XG4gICAgICBib2R5OiBgVmVsb2NpdHkgfiR7d30ga2cvd2VlayB2cyB+JHtycX0ga2cvd2VlayByZXF1aXJlZCBieSAke2lucHV0LnRhcmdldERhdGV9LmAsXG4gICAgICBtZXRyaWNzOiBbXG4gICAgICAgIHsgdmFsdWU6IFN0cmluZyhkYXlzTm9Xb3Jrb3V0KSwgbGFiZWw6IFwiZGF5cyBubyB3b3Jrb3V0XCIgfSxcbiAgICAgICAgeyB2YWx1ZTogc2xlZXAsIGxhYmVsOiBcInNsZWVwIGxhc3QgbG9nXCIgfSxcbiAgICAgICAgeyB2YWx1ZTogcHJvdGVpbiwgbGFiZWw6IFwicHJvdGVpbiBzYW1lIGRheVwiIH0sXG4gICAgICBdLFxuICAgIH0sXG4gICAgYWN0aW9uczogW1xuICAgICAgeyBpY29uOiBcIndhbGtcIiwgYWN0aW9uOiBcIjEw4oCTMjAgbWluIHdhbGtcIiwgcmVhc29uOiBcIkVhc3kgdm9sdW1lIHdpdGhvdXQgb3ZlcnRyYWluaW5nXCIgfSxcbiAgICAgIHsgaWNvbjogXCJmb29kXCIsIGFjdGlvbjogXCJIaXQgZGFpbHkgcHJvdGVpblwiLCByZWFzb246IFwiUHJlc2VydmVzIG11c2NsZSBpbiBhIGRlZmljaXRcIiB9LFxuICAgICAgeyBpY29uOiBcIm1vb25cIiwgYWN0aW9uOiBcIlRhcmdldCA3aCBzbGVlcFwiLCByZWFzb246IFwiU3RlYWRpZXIgbW9ybmluZ3Mgd2l0aCBhZGVxdWF0ZSByZXN0XCIgfSxcbiAgICBdLFxuICAgIHByZWRpY3Rpb246IHtcbiAgICAgIGhlYWRsaW5lOiBgVHJlbmQgdG93YXJkICR7Zm10T3JEYXNoKGlucHV0LmdvYWxXZWlnaHQsIDIpfSBrZyBieSAke2lucHV0LnRhcmdldERhdGV9YCxcbiAgICAgIGJhc2lzOiBcIkZyb20gY3VycmVudCA3LWRheSByYXRlIHZzIHJlcXVpcmVkIHdlZWtseSByYXRlXCIsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGFtYmRhQ2FyZEZyb21TdHJ1Y3R1cmVkKFxuICBiYXNlOiAoKSA9PiBMYW1iZGFJbnNpZ2h0Q2FyZCxcbiAgc3RydWN0dXJlZDogQWlJbnNpZ2h0U3RydWN0dXJlZCxcbiAgc291cmNlOiBcImxsbVwiIHwgXCJydWxlc1wiLFxuKTogTGFtYmRhSW5zaWdodENhcmQge1xuICBjb25zdCBhMCA9IHN0cnVjdHVyZWQuYWN0aW9uc1swXTtcbiAgY29uc3QgZ2VuZXJhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIHJldHVybiB7XG4gICAgLi4uYmFzZSgpLFxuICAgIGhlYWRsaW5lOiBzdHJ1Y3R1cmVkLnZlcmRpY3QuaGVhZGxpbmUsXG4gICAgZGV0YWlsOiBzdHJ1Y3R1cmVkLnZlcmRpY3QuZGV0YWlsLFxuICAgIGFjdGlvbjogYTAgPyBgJHthMC5hY3Rpb259IOKAlCAke2EwLnJlYXNvbn1gIDogXCJcIixcbiAgICB3aHk6IFtdLFxuICAgIHN0cnVjdHVyZWQsXG4gICAgZ2VuZXJhdGlvblNvdXJjZTogc291cmNlLFxuICAgIGdlbmVyYXRlZEF0LFxuICB9O1xufVxuXG4vKipcbiAqIFNpbmdsZSBoaWdoLXNpZ25hbCBBSSBpbnNpZ2h0IGNhcmQuIENhY2hlZCAzMCBtaW51dGVzIHBlciBkYXRhIGZpbmdlcnByaW50LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVBaUluc2lnaHRDYXJkKFxuICBkZGI6IER5bmFtb0RCQ2xpZW50LFxuICBjdHg6IHtcbiAgICB1c2VySWQ6IHN0cmluZztcbiAgICBlbnRyaWVzUmF3OiBJbnNpZ2h0RW50cnlSb3dbXTtcbiAgICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gICAgc3RhcnRXZWlnaHQ6IG51bWJlcjtcbiAgICB0YXJnZXREYXRlOiBzdHJpbmc7XG4gICAgZGF5TWVhbHNUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIH0sXG4pOiBQcm9taXNlPExhbWJkYUluc2lnaHRDYXJkW10+IHtcbiAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk/LnRyaW0oKTtcbiAgY29uc3QgY2FjaGVUYWJsZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfQ0FDSEVfVEFCTEVfTkFNRT8udHJpbSgpO1xuICBjb25zdCBtb2RlbCA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19JTlNJR0hUU19NT0RFTD8udHJpbSgpIHx8IFwiY2xhdWRlLWhhaWt1LTQtNVwiO1xuXG4gIGNvbnN0IGVudHJpZXNBc2MgPSBzb3J0RW50cmllc0FzYyhjdHguZW50cmllc1Jhdyk7XG4gIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZW50cnlNYXAgPSBlbnRyeUJ5RGF0ZU1hcChlbnRyaWVzQXNjKTtcblxuICBjb25zdCBtZWFsVG90YWxzID0gYXdhaXQgbG9hZE1lYWxUb3RhbHNMYXN0N0RheXMoXG4gICAgZGRiLFxuICAgIGN0eC5kYXlNZWFsc1RhYmxlTmFtZSxcbiAgICBjdHgudXNlcklkLFxuICAgIGVudHJpZXNBc2MubGVuZ3RoID4gMCA/IGVudHJpZXNBc2NbZW50cmllc0FzYy5sZW5ndGggLSAxXS5kYXRlIDogdG9kYXksXG4gICk7XG4gIGNvbnN0IG1lYWxCeURheSA9IG5ldyBNYXAobWVhbFRvdGFscy5tYXAoKG0pID0+IFttLmRheSwgbV0pKTtcbiAgY29uc3QgbWVhbERpZ2VzdCA9IG1lYWxUb3RhbHMubWFwKChtKSA9PiBgJHttLmRheX06JHttLmtjYWx9OiR7bS5wcm90ZWlufWApLmpvaW4oXCI7XCIpO1xuXG4gIGNvbnN0IGxhc3QgPSBlbnRyaWVzQXNjW2VudHJpZXNBc2MubGVuZ3RoIC0gMV07XG4gIGNvbnN0IGxhdGVzdERhdGUgPSBsYXN0Py5kYXRlID8/IHRvZGF5O1xuICBjb25zdCBsYXRlc3RNb3JuaW5nID0gbGFzdD8ubW9ybmluZ1dlaWdodCA/PyAwO1xuICBjb25zdCBoYWJpdFRhaWwgPVxuICAgIGVudHJpZXNBc2NcbiAgICAgIC5zbGljZSgtNSlcbiAgICAgIC5tYXAoKGUpID0+IGAke2UuZGF0ZX06JHtlLndvcmtvdXQgPyAxIDogMH0ke2UuYWxjb2hvbCA/IDEgOiAwfSR7ZS5sYXRlU25hY2sgPyAxIDogMH1gKVxuICAgICAgLmpvaW4oXCJ8XCIpIHx8IFwibm9uZVwiO1xuXG4gIGNvbnN0IGZpbmdlcnByaW50ID0gYnVpbGRBaUluc2lnaHRGaW5nZXJwcmludCh7XG4gICAgdXNlcklkOiBjdHgudXNlcklkLFxuICAgIGxhdGVzdERhdGUsXG4gICAgbGF0ZXN0TW9ybmluZyxcbiAgICBnb2FsV2VpZ2h0OiBjdHguZ29hbFdlaWdodCxcbiAgICB0YXJnZXREYXRlOiBjdHgudGFyZ2V0RGF0ZSxcbiAgICBtZWFsRGlnZXN0LFxuICAgIGhhYml0VGFpbCxcbiAgfSk7XG5cbiAgaWYgKGNhY2hlVGFibGUpIHtcbiAgICBjb25zdCBoaXQgPSBhd2FpdCBnZXRDYWNoZWRDYXJkKGRkYiwgY2FjaGVUYWJsZSwgY3R4LnVzZXJJZCwgZmluZ2VycHJpbnQpO1xuICAgIC8qKiBTa2lwIHByb3NlLW9ubHkgY2FjaGUsIHBhcnNlLWZhaWx1cmUgcGxhY2Vob2xkZXJzIChgZGVncmFkZWRgKSwgcG9pc29uZWQgbGVnYWN5IHBheWxvYWRzLCBhbmQgcHJlLXY0IGtleXMuICovXG4gICAgaWYgKGhpdD8uc3RydWN0dXJlZCAmJiAhaGl0LmRlZ3JhZGVkICYmICFpc1BvaXNvbmVkQ2FjaGVkQWlDYXJkKGhpdCkpIHJldHVybiBbaGl0XTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnRXID0gbGFzdD8ubW9ybmluZ1dlaWdodCA/PyBjdHguc3RhcnRXZWlnaHQ7XG4gIGNvbnN0IHNldmVuQXZnID0gc2V2ZW5EYXlNb3JuaW5nQXZlcmFnZShlbnRyaWVzQXNjKTtcbiAgY29uc3QgZGF5c1RvR29hbCA9IFN0cmluZyhNYXRoLm1heCgwLCBkYXlzRnJvbVRvKHRvZGF5LCBjdHgudGFyZ2V0RGF0ZSkpKTtcbiAgY29uc3Qgd2luMTQgPSBsYXN0TkRhdGVzKGxhdGVzdERhdGUsIDE0KTtcbiAgY29uc3QgbGF0ZVNuYWNrMTQgPSBgJHtjb3VudExhdGVTbmFja0luV2luZG93KHdpbjE0LCBlbnRyeU1hcCl9LzE0YDtcbiAgY29uc3Qgd29ya291dDE0ID0gYCR7Y291bnRXb3Jrb3V0SW5XaW5kb3cod2luMTQsIGVudHJ5TWFwKX0vMTRgO1xuXG4gIGNvbnN0IGF2Z0FmdGVyU25hY2sgPSBhdmdNb3JuaW5nQWZ0ZXJMYXRlU25hY2soZW50cmllc0FzYyk7XG4gIGNvbnN0IGF2Z05vU25hY2sgPSBhdmdNb3JuaW5nQWZ0ZXJOb0xhdGVTbmFjayhlbnRyaWVzQXNjKTtcbiAgY29uc3QgYXZnV29ya0RlbHRhID0gYXZnRGVsdGFNb3JuaW5nQWZ0ZXJXb3Jrb3V0KGVudHJpZXNBc2MpO1xuICBjb25zdCB3ZWVrbHlMb3NzID0gY3VycmVudFNldmVuRGF5TG9zc1JhdGVLZ1BlcldlZWsoZW50cmllc0FzYyk7XG4gIGNvbnN0IHJlcVdlZWtseSA9IHJlcXVpcmVkV2Vla2x5TG9zc1JhdGUoY3VycmVudFcsIGN0eC5nb2FsV2VpZ2h0LCB0b2RheSwgY3R4LnRhcmdldERhdGUpO1xuICBjb25zdCBzdHJlYWtzID0gbG9nZ2luZ1N0cmVha3MoZW50cmllc0FzYywgdG9kYXkpO1xuXG4gIGNvbnN0IGF2Z0tjYWxSaXNlID0gYXZnS2NhbE9uV2VpZ2h0UmlzZURheXMoZW50cmllc0FzYywgbWVhbEJ5RGF5KTtcbiAgY29uc3QgYXZnS2NhbEZhbGwgPSBhdmdLY2FsT25XZWlnaHRGYWxsRGF5cyhlbnRyaWVzQXNjLCBtZWFsQnlEYXkpO1xuICBjb25zdCBhdmdTbGVlcERyb3AgPSBhdmdTbGVlcEJlZm9yZVdlaWdodERyb3AoZW50cmllc0FzYyk7XG4gIGNvbnN0IGF2Z1NsZWVwUmlzZSA9IGF2Z1NsZWVwQmVmb3JlV2VpZ2h0UmlzZShlbnRyaWVzQXNjKTtcblxuICBjb25zdCBkYXRlczE0ID0gbGFzdE5EYXRlcyhsYXRlc3REYXRlLCAxNCk7XG4gIGNvbnN0IHVzZXJNc2cgPSBidWlsZEFpSW5zaWdodFVzZXJNZXNzYWdlKHtcbiAgICB0b2RheSxcbiAgICBjdXJyZW50V2VpZ2h0OiBmbXRPckRhc2goY3VycmVudFcsIDIpLFxuICAgIHNldmVuRGF5QXZnOiBzZXZlbkF2ZyAhPSBudWxsID8gZm10T3JEYXNoKHNldmVuQXZnLCAyKSA6IFwi4oCUXCIsXG4gICAgc3RhcnRXZWlnaHQ6IGZtdE9yRGFzaChjdHguc3RhcnRXZWlnaHQsIDIpLFxuICAgIHRhcmdldFdlaWdodDogZm10T3JEYXNoKGN0eC5nb2FsV2VpZ2h0LCAyKSxcbiAgICBkYXlzVG9Hb2FsLFxuICAgIGdvYWxEYXRlOiBjdHgudGFyZ2V0RGF0ZSxcbiAgICBkYWlseUxvc3NOZWVkZWQ6IHJlcXVpcmVkRGFpbHlMb3NzKGN1cnJlbnRXLCBjdHguZ29hbFdlaWdodCwgdG9kYXksIGN0eC50YXJnZXREYXRlKSxcbiAgICB3ZWlnaHRMb2dUYWJsZTogZW50cmllc0FzYy5sZW5ndGggPyBidWlsZFdlaWdodExvZ1RhYmxlKGVudHJpZXNBc2MsIDMwKSA6IFwiKG5vIHJvd3MpXCIsXG4gICAgaGFiaXRMb2dUYWJsZTogZW50cmllc0FzYy5sZW5ndGggPyBidWlsZEhhYml0TG9nVGFibGUoZW50cmllc0FzYywgMzApIDogXCIobm8gcm93cylcIixcbiAgICBtZWFsTG9nVGFibGU6XG4gICAgICBtZWFsVG90YWxzLmxlbmd0aCA+IDBcbiAgICAgICAgPyBidWlsZE1lYWxMb2dUYWJsZShtZWFsVG90YWxzLCBlbnRyeU1hcClcbiAgICAgICAgOiBlbnRyaWVzQXNjLmxlbmd0aFxuICAgICAgICAgID8gbGFzdE5EYXRlcyhsYXRlc3REYXRlLCA3KVxuICAgICAgICAgICAgICAubWFwKChkKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZSA9IGVudHJ5TWFwLmdldChkKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYCR7ZH0gwrcgJHtlPy5jYWxvcmllcyA/PyAwfSDCtyAke2U/LnByb3RlaW4gPz8gMH1gO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbihcIlxcblwiKVxuICAgICAgICAgIDogXCIobm8gcm93cylcIixcbiAgICBzdGVwc0xvZ1RhYmxlOiBidWlsZFN0ZXBzTG9nVGFibGUoZGF0ZXMxNCwgZW50cnlNYXApLFxuICAgIHNsZWVwTG9nVGFibGU6IGJ1aWxkU2xlZXBMb2dUYWJsZShkYXRlczE0LCBlbnRyeU1hcCksXG4gICAgbGF0ZVNuYWNrQ291bnQxNDogbGF0ZVNuYWNrMTQsXG4gICAgYXZnV2VpZ2h0QWZ0ZXJTbmFjazogYXZnQWZ0ZXJTbmFjayAhPSBudWxsID8gZm10T3JEYXNoKGF2Z0FmdGVyU25hY2ssIDIpIDogXCLigJRcIixcbiAgICBhdmdXZWlnaHROb1NuYWNrOiBhdmdOb1NuYWNrICE9IG51bGwgPyBmbXRPckRhc2goYXZnTm9TbmFjaywgMikgOiBcIuKAlFwiLFxuICAgIHdvcmtvdXRDb3VudDE0OiB3b3Jrb3V0MTQsXG4gICAgYXZnRGVsdGFBZnRlcldvcmtvdXQ6IGF2Z1dvcmtEZWx0YSAhPSBudWxsID8gZm10T3JEYXNoKGF2Z1dvcmtEZWx0YSwgMikgOiBcIuKAlFwiLFxuICAgIHdlZWtseUxvc3NSYXRlOiB3ZWVrbHlMb3NzICE9IG51bGwgPyBmbXRPckRhc2god2Vla2x5TG9zcywgMikgOiBcIuKAlFwiLFxuICAgIHJlcXVpcmVkV2Vla2x5UmF0ZTogcmVxV2Vla2x5ICE9IG51bGwgPyBmbXRPckRhc2gocmVxV2Vla2x5LCAyKSA6IFwi4oCUXCIsXG4gICAgbG9uZ2VzdFN0cmVhazogU3RyaW5nKHN0cmVha3MubG9uZ2VzdCksXG4gICAgY3VycmVudFN0cmVhazogU3RyaW5nKHN0cmVha3MuY3VycmVudCksXG4gICAgYXZnS2NhbFJpc2U6IGF2Z0tjYWxSaXNlICE9IG51bGwgPyBmbXRPckRhc2goYXZnS2NhbFJpc2UsIDEpIDogXCLigJRcIixcbiAgICBhdmdLY2FsRmFsbDogYXZnS2NhbEZhbGwgIT0gbnVsbCA/IGZtdE9yRGFzaChhdmdLY2FsRmFsbCwgMSkgOiBcIuKAlFwiLFxuICAgIGF2Z1NsZWVwRHJvcDogYXZnU2xlZXBEcm9wICE9IG51bGwgPyBmbXRPckRhc2goYXZnU2xlZXBEcm9wLCAyKSA6IFwi4oCUXCIsXG4gICAgYXZnU2xlZXBSaXNlOiBhdmdTbGVlcFJpc2UgIT0gbnVsbCA/IGZtdE9yRGFzaChhdmdTbGVlcFJpc2UsIDIpIDogXCLigJRcIixcbiAgfSk7XG5cbiAgY29uc3QgYmFzZUNhcmQgPSAoKTogTGFtYmRhSW5zaWdodENhcmQgPT4gKHtcbiAgICBpZDogYGFpLWluc2lnaHQtJHt0b2RheX1gLFxuICAgIHJ1bGVJZDogXCJhaV9pbnRlbGxpZ2VuY2VcIixcbiAgICBwcmlvcml0eTogMTAwLFxuICAgIGhlYWRsaW5lOiBcIlwiLFxuICAgIHdoeTogW10sXG4gICAgYWN0aW9uOiBcIlwiLFxuICAgIGNhdGVnb3J5OiBcInRyYWplY3RvcnlcIixcbiAgICBnZW5lcmF0aW9uU291cmNlOiBcImxsbVwiLFxuICB9KTtcblxuICBjb25zdCBmYWxsYmFja0N0eCA9IHtcbiAgICB0b2RheSxcbiAgICBjdXJyZW50VyxcbiAgICBnb2FsV2VpZ2h0OiBjdHguZ29hbFdlaWdodCxcbiAgICB0YXJnZXREYXRlOiBjdHgudGFyZ2V0RGF0ZSxcbiAgICBuTG9nczogZW50cmllc0FzYy5sZW5ndGgsXG4gICAgd2Vla2x5OiB3ZWVrbHlMb3NzLFxuICAgIHJlcVdlZWtseSxcbiAgICBlbnRyaWVzQXNjLFxuICAgIG1lYWxUb3RhbHMsXG4gIH07XG5cbiAgaWYgKCFhcGlLZXkpIHtcbiAgICBjb25zdCBzdHJ1Y3R1cmVkID0gYnVpbGRGYWxsYmFja1N0cnVjdHVyZWQoZmFsbGJhY2tDdHgpO1xuICAgIHJldHVybiBbbGFtYmRhQ2FyZEZyb21TdHJ1Y3R1cmVkKGJhc2VDYXJkLCBzdHJ1Y3R1cmVkLCBcInJ1bGVzXCIpXTtcbiAgfVxuXG4gIGlmIChjYWNoZVRhYmxlKSB7XG4gICAgY29uc3QgY291bnQgPSBhd2FpdCBpbmNyZW1lbnRMbG1Vc2FnZShkZGIsIGNhY2hlVGFibGUsIGN0eC51c2VySWQpO1xuICAgIGlmIChjb3VudCA+IERBSUxZX0xJTUlUKSB7XG4gICAgICBjb25zdCBzdHJ1Y3R1cmVkID0gYnVpbGRGYWxsYmFja1N0cnVjdHVyZWQoZmFsbGJhY2tDdHgpO1xuICAgICAgcmV0dXJuIFtsYW1iZGFDYXJkRnJvbVN0cnVjdHVyZWQoYmFzZUNhcmQsIHN0cnVjdHVyZWQsIFwicnVsZXNcIildO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgdHlwZSBNc2cgPSB7IHJvbGU6IFwidXNlclwiIHwgXCJhc3Npc3RhbnRcIjsgY29udGVudDogc3RyaW5nIH07XG4gICAgY29uc3QgcnVuID0gKG1lc3NhZ2VzOiBNc2dbXSkgPT5cbiAgICAgIGNsaWVudC5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgICBtb2RlbCxcbiAgICAgICAgLyoqIEpTT04gc2NoZW1hIG5lZWRzIG1vcmUgcm9vbSB0aGFuIHByb3NlOyAzMDAgb2Z0ZW4gdHJ1bmNhdGVzIGFuZCB0cmlnZ2VycyB0aGUgZGVncmFkZWQgZmFsbGJhY2suICovXG4gICAgICAgIG1heF90b2tlbnM6IDEyMDAsXG4gICAgICAgIHRlbXBlcmF0dXJlOiAwLFxuICAgICAgICBzeXN0ZW06IE9KQVNfQUlfSU5TSUdIVF9TWVNURU0sXG4gICAgICAgIG1lc3NhZ2VzLFxuICAgICAgfSk7XG5cbiAgICBsZXQgbWVzc2FnZXM6IE1zZ1tdID0gW3sgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXJNc2cgfV07XG4gICAgbGV0IHJlc3BvbnNlID0gYXdhaXQgcnVuKG1lc3NhZ2VzKTtcbiAgICBsZXQgdGV4dCA9IHJlc3BvbnNlLmNvbnRlbnQuZmluZCgocGFydCkgPT4gcGFydC50eXBlID09PSBcInRleHRcIik/LnRleHQgPz8gXCJcIjtcbiAgICBsZXQgcGFyc2VkID0gcGFyc2VBaUluc2lnaHRTdHJ1Y3R1cmVkKHRleHQpO1xuICAgIGlmICghcGFyc2VkLm9rKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbXNnOiBcImluc2lnaHRzX2FpX3BhcnNlX2ZhaWxlZF9maXJzdFwiLFxuICAgICAgICAgIGVycm9yOiBwYXJzZWQuZXJyb3IsXG4gICAgICAgICAgc2FtcGxlOiB0ZXh0LnNsaWNlKDAsIDQwMCksXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICAgIG1lc3NhZ2VzID0gW1xuICAgICAgICB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1c2VyTXNnIH0sXG4gICAgICAgIHsgcm9sZTogXCJhc3Npc3RhbnRcIiwgY29udGVudDogdGV4dCB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgICAgY29udGVudDpcbiAgICAgICAgICAgIFwiWW91ciBwcmV2aW91cyByZXBseSB3YXMgbm90IHZhbGlkIEpTT04uIFJlcGx5IHdpdGggT05MWSBvbmUgSlNPTiBvYmplY3QgbWF0Y2hpbmcgdGhlIHNjaGVtYSBmcm9tIHRoZSBzeXN0ZW0gcHJvbXB0LiBObyBtYXJrZG93biwgbm8gY29kZSBmZW5jZXMsIG5vIGV4dHJhIHRleHQuIFVzZSBkb3VibGUgcXVvdGVzIGZvciBhbGwga2V5cyBhbmQgc3RyaW5nIHZhbHVlcy5cIixcbiAgICAgICAgfSxcbiAgICAgIF07XG4gICAgICByZXNwb25zZSA9IGF3YWl0IHJ1bihtZXNzYWdlcyk7XG4gICAgICB0ZXh0ID0gcmVzcG9uc2UuY29udGVudC5maW5kKChwYXJ0KSA9PiBwYXJ0LnR5cGUgPT09IFwidGV4dFwiKT8udGV4dCA/PyBcIlwiO1xuICAgICAgcGFyc2VkID0gcGFyc2VBaUluc2lnaHRTdHJ1Y3R1cmVkKHRleHQpO1xuICAgIH1cblxuICAgIGxldCBjYXJkOiBMYW1iZGFJbnNpZ2h0Q2FyZDtcbiAgICBpZiAocGFyc2VkLm9rKSB7XG4gICAgICBjYXJkID0gbGFtYmRhQ2FyZEZyb21TdHJ1Y3R1cmVkKGJhc2VDYXJkLCBwYXJzZWQuZGF0YSwgXCJsbG1cIik7XG4gICAgICBpZiAoY2FjaGVUYWJsZSkge1xuICAgICAgICBhd2FpdCBwdXRDYWNoZWRDYXJkKGRkYiwgY2FjaGVUYWJsZSwgY3R4LnVzZXJJZCwgZmluZ2VycHJpbnQsIGNhcmQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbXNnOiBcImluc2lnaHRzX2FpX3BhcnNlX2ZhaWxlZF9maW5hbFwiLFxuICAgICAgICAgIGVycm9yOiBwYXJzZWQuZXJyb3IsXG4gICAgICAgICAgc2FtcGxlOiB0ZXh0LnNsaWNlKDAsIDQwMCksXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IHN0cnVjdHVyZWQgPSBidWlsZEZhbGxiYWNrU3RydWN0dXJlZChmYWxsYmFja0N0eCk7XG4gICAgICBjYXJkID0gbGFtYmRhQ2FyZEZyb21TdHJ1Y3R1cmVkKGJhc2VDYXJkLCBzdHJ1Y3R1cmVkLCBcInJ1bGVzXCIpO1xuICAgICAgaWYgKGNhY2hlVGFibGUpIHtcbiAgICAgICAgYXdhaXQgcHV0Q2FjaGVkQ2FyZChkZGIsIGNhY2hlVGFibGUsIGN0eC51c2VySWQsIGZpbmdlcnByaW50LCBjYXJkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFtjYXJkXTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbXNnOiBcImluc2lnaHRzX2FpX2NhcmRfZmFpbGVkXCIsXG4gICAgICAgIGVycm9yOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG4gICAgICB9KSxcbiAgICApO1xuICAgIGNvbnN0IHN0cnVjdHVyZWQgPSBidWlsZEZhbGxiYWNrU3RydWN0dXJlZChmYWxsYmFja0N0eCk7XG4gICAgcmV0dXJuIFtsYW1iZGFDYXJkRnJvbVN0cnVjdHVyZWQoYmFzZUNhcmQsIHN0cnVjdHVyZWQsIFwicnVsZXNcIildO1xuICB9XG59XG4iXX0=