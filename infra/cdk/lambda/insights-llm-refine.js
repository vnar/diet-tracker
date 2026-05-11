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
exports.isLambdaInsightsLlmRefineEnabled = isLambdaInsightsLlmRefineEnabled;
exports.maybeRefineInsightCards = maybeRefineInsightCards;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const llmJsonParse_1 = require("../../../lib/insights/llmJsonParse");
const DAILY_LIMIT = 100;
function parseBoolEnv(value) {
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return undefined;
}
/** Mirrors app `isInsightsLlmRefineEnabled`: off only when explicitly false. */
function isLambdaInsightsLlmRefineEnabled() {
    const legacy = parseBoolEnv(process.env.NEXT_PUBLIC_INSIGHTS_LLM_REFINE);
    if (legacy !== undefined)
        return legacy;
    const ff = parseBoolEnv(process.env.FF_INSIGHTS_LLM_REFINE);
    if (ff !== undefined)
        return ff;
    const pub = parseBoolEnv(process.env.NEXT_PUBLIC_FF_INSIGHTS_LLM_REFINE);
    if (pub !== undefined)
        return pub;
    const direct = parseBoolEnv(process.env.INSIGHTS_LLM_REFINE);
    if (direct !== undefined)
        return direct;
    return true;
}
function dayKey() {
    return new Date().toISOString().slice(0, 10);
}
function withRulesCard(insight) {
    return { ...insight, generationSource: "rules" };
}
function withLlmCard(insight) {
    return { ...insight, generationSource: "llm" };
}
async function getInsightCache(ddb, tableName, userId, cacheKey) {
    const out = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: userId }, cacheKey: { S: cacheKey } },
        ConsistentRead: true,
    }));
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
async function putInsightCache(ddb, tableName, userId, cacheKey, insight) {
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: {
            userId: { S: userId },
            cacheKey: { S: cacheKey },
            payloadJson: { S: JSON.stringify(insight) },
            ts: { S: new Date().toISOString() },
        },
    }));
}
async function incrementLlmUsage(ddb, tableName, userId) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `__usage__#${day}`;
    const out = await ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: tableName,
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
async function refineOne(ddb, cacheTableName, apiKey, userId, insight, ctx) {
    const cacheKey = `${insight.id}#${dayKey()}`;
    const cached = await getInsightCache(ddb, cacheTableName, userId, cacheKey);
    if (cached)
        return withLlmCard({ ...insight, ...cached, generationSource: "llm" });
    const count = await incrementLlmUsage(ddb, cacheTableName, userId);
    if (count > DAILY_LIMIT)
        return withRulesCard(insight);
    try {
        const Anthropic = (await Promise.resolve().then(() => __importStar(require("@anthropic-ai/sdk")))).default;
        const client = new Anthropic({ apiKey });
        const notes = ctx.recentNotes.slice(-3).join("\n- ");
        const toneGuide = ctx.tone === "clinical"
            ? "Use neutral, concise, factual language. No cheerleading. Do not add diagnoses or claims not supported by the why points."
            : ctx.tone === "tough-love"
                ? "Be direct and motivating; never shameful or insulting. No personal attacks. Preserve every factual claim from the original."
                : ctx.tone === "ayurvedic"
                    ? "Use gentle rhythm/balance/wellness framing only; do not claim dosha types, Ayurvedic diagnoses, or cures. Preserve facts."
                    : "Warm and supportive; preserve facts.";
        const response = await client.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 180,
            temperature: 0.4,
            system: `Rewrite a health insight for the user's coach tone while preserving all factual claims from the original (numbers, comparisons, dates). Reply with ONLY a single JSON object (no markdown, no code fences) with keys headline and detail (strings). Style: ${toneGuide}`,
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
        if (!text)
            return withRulesCard(insight);
        const parsed = (0, llmJsonParse_1.parseInsightCopyFromLlmText)(text);
        if (!parsed) {
            console.error(JSON.stringify({
                msg: "insights_llm_parse_failed",
                insightId: insight.id,
                textPreview: text.slice(0, 200),
            }));
            return withRulesCard(insight);
        }
        const nextInsight = withLlmCard({
            ...insight,
            headline: parsed.headline?.trim() || insight.headline,
            detail: parsed.detail !== undefined ? parsed.detail.trim() || insight.detail : insight.detail,
        });
        await putInsightCache(ddb, cacheTableName, userId, cacheKey, nextInsight);
        return nextInsight;
    }
    catch (err) {
        console.error(JSON.stringify({
            msg: "insights_llm_request_failed",
            insightId: insight.id,
            error: err instanceof Error ? err.message : String(err),
        }));
        return withRulesCard(insight);
    }
}
/**
 * Optionally rewrites insight copy via Anthropic when env is configured.
 * Never throws: failures fall back to the rule-based card.
 */
async function maybeRefineInsightCards(ddb, input) {
    if (!isLambdaInsightsLlmRefineEnabled()) {
        return input.insights.map((i) => withRulesCard(i));
    }
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
        return input.insights.map((i) => withRulesCard(i));
    const tableName = process.env.INSIGHT_CACHE_TABLE_NAME?.trim();
    if (!tableName)
        return input.insights.map((i) => withRulesCard(i));
    const out = [];
    for (const insight of input.insights) {
        out.push(await refineOne(ddb, tableName, apiKey, input.userId, insight, {
            tone: input.tone,
            firstName: input.firstName,
            recentNotes: input.recentNotes,
        }));
    }
    return out;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zaWdodHMtbGxtLXJlZmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluc2lnaHRzLWxsbS1yZWZpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEwQkEsNEVBVUM7QUE2SkQsMERBNkJDO0FBN05ELDhEQUE2RjtBQUM3RixxRUFBaUY7QUFFakYsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBZXhCLFNBQVMsWUFBWSxDQUFDLEtBQXlCO0lBQzdDLElBQUksS0FBSyxLQUFLLE1BQU07UUFBRSxPQUFPLElBQUksQ0FBQztJQUNsQyxJQUFJLEtBQUssS0FBSyxPQUFPO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDcEMsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELGdGQUFnRjtBQUNoRixTQUFnQixnQ0FBZ0M7SUFDOUMsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUN6RSxJQUFJLE1BQU0sS0FBSyxTQUFTO1FBQUUsT0FBTyxNQUFNLENBQUM7SUFDeEMsTUFBTSxFQUFFLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUM1RCxJQUFJLEVBQUUsS0FBSyxTQUFTO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFDaEMsTUFBTSxHQUFHLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUN6RSxJQUFJLEdBQUcsS0FBSyxTQUFTO1FBQUUsT0FBTyxHQUFHLENBQUM7SUFDbEMsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztJQUM3RCxJQUFJLE1BQU0sS0FBSyxTQUFTO1FBQUUsT0FBTyxNQUFNLENBQUM7SUFDeEMsT0FBTyxJQUFJLENBQUM7QUFD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QUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBQ0QsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNyRCxJQUFJLENBQUMsTUFBTTtRQUFFLE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDL0QsSUFBSSxDQUFDLFNBQVM7UUFBRSxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVuRSxNQUFNLEdBQUcsR0FBd0IsRUFBRSxDQUFDO0lBQ3BDLEtBQUssTUFBTSxPQUFPLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3JDLEdBQUcsQ0FBQyxJQUFJLENBQ04sTUFBTSxTQUFTLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUU7WUFDN0QsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2hCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztZQUMxQixXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7U0FDL0IsQ0FBQyxDQUNILENBQUM7SUFDSixDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldEl0ZW1Db21tYW5kLCBQdXRJdGVtQ29tbWFuZCwgVXBkYXRlSXRlbUNvbW1hbmQgfSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBwYXJzZUluc2lnaHRDb3B5RnJvbUxsbVRleHQgfSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2xsbUpzb25QYXJzZVwiO1xuXG5jb25zdCBEQUlMWV9MSU1JVCA9IDEwMDtcblxuLyoqIFNhbWUgc2hhcGUgYXMgSW5zaWdodCBpbiB0aGUgYXBwICsgTGFtYmRhIGhhbmRsZXIuICovXG5leHBvcnQgdHlwZSBMYW1iZGFJbnNpZ2h0Q2FyZCA9IHtcbiAgaWQ6IHN0cmluZztcbiAgcnVsZUlkOiBzdHJpbmc7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIGhlYWRsaW5lOiBzdHJpbmc7XG4gIGRldGFpbD86IHN0cmluZztcbiAgd2h5OiBzdHJpbmdbXTtcbiAgYWN0aW9uOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBcInNvZGl1bVwiIHwgXCJhbGNvaG9sXCIgfCBcImxhdGVfc25hY2tcIiB8IFwid29ya291dFwiIHwgXCJwbGF0ZWF1XCIgfCBcInN0cmVha1wiIHwgXCJ0cmFqZWN0b3J5XCI7XG4gIGdlbmVyYXRpb25Tb3VyY2U/OiBcImxsbVwiIHwgXCJydWxlc1wiO1xufTtcblxuZnVuY3Rpb24gcGFyc2VCb29sRW52KHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgaWYgKHZhbHVlID09PSBcInRydWVcIikgcmV0dXJuIHRydWU7XG4gIGlmICh2YWx1ZSA9PT0gXCJmYWxzZVwiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKiBNaXJyb3JzIGFwcCBgaXNJbnNpZ2h0c0xsbVJlZmluZUVuYWJsZWRgOiBvZmYgb25seSB3aGVuIGV4cGxpY2l0bHkgZmFsc2UuICovXG5leHBvcnQgZnVuY3Rpb24gaXNMYW1iZGFJbnNpZ2h0c0xsbVJlZmluZUVuYWJsZWQoKTogYm9vbGVhbiB7XG4gIGNvbnN0IGxlZ2FjeSA9IHBhcnNlQm9vbEVudihwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19JTlNJR0hUU19MTE1fUkVGSU5FKTtcbiAgaWYgKGxlZ2FjeSAhPT0gdW5kZWZpbmVkKSByZXR1cm4gbGVnYWN5O1xuICBjb25zdCBmZiA9IHBhcnNlQm9vbEVudihwcm9jZXNzLmVudi5GRl9JTlNJR0hUU19MTE1fUkVGSU5FKTtcbiAgaWYgKGZmICE9PSB1bmRlZmluZWQpIHJldHVybiBmZjtcbiAgY29uc3QgcHViID0gcGFyc2VCb29sRW52KHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0ZGX0lOU0lHSFRTX0xMTV9SRUZJTkUpO1xuICBpZiAocHViICE9PSB1bmRlZmluZWQpIHJldHVybiBwdWI7XG4gIGNvbnN0IGRpcmVjdCA9IHBhcnNlQm9vbEVudihwcm9jZXNzLmVudi5JTlNJR0hUU19MTE1fUkVGSU5FKTtcbiAgaWYgKGRpcmVjdCAhPT0gdW5kZWZpbmVkKSByZXR1cm4gZGlyZWN0O1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZGF5S2V5KCk6IHN0cmluZyB7XG4gIHJldHVybiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiB3aXRoUnVsZXNDYXJkKGluc2lnaHQ6IExhbWJkYUluc2lnaHRDYXJkKTogTGFtYmRhSW5zaWdodENhcmQge1xuICByZXR1cm4geyAuLi5pbnNpZ2h0LCBnZW5lcmF0aW9uU291cmNlOiBcInJ1bGVzXCIgfTtcbn1cblxuZnVuY3Rpb24gd2l0aExsbUNhcmQoaW5zaWdodDogTGFtYmRhSW5zaWdodENhcmQpOiBMYW1iZGFJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7IC4uLmluc2lnaHQsIGdlbmVyYXRpb25Tb3VyY2U6IFwibGxtXCIgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5zaWdodENhY2hlKFxuICBkZGI6IER5bmFtb0RCQ2xpZW50LFxuICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGNhY2hlS2V5OiBzdHJpbmcsXG4pOiBQcm9taXNlPExhbWJkYUluc2lnaHRDYXJkIHwgbnVsbD4ge1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBjYWNoZUtleTogeyBTOiBjYWNoZUtleSB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgcGF5bG9hZCA9IG91dC5JdGVtPy5wYXlsb2FkSnNvbj8uUztcbiAgaWYgKCFwYXlsb2FkKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShwYXlsb2FkKSBhcyBMYW1iZGFJbnNpZ2h0Q2FyZDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHV0SW5zaWdodENhY2hlKFxuICBkZGI6IER5bmFtb0RCQ2xpZW50LFxuICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGNhY2hlS2V5OiBzdHJpbmcsXG4gIGluc2lnaHQ6IExhbWJkYUluc2lnaHRDYXJkLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBjYWNoZUtleTogeyBTOiBjYWNoZUtleSB9LFxuICAgICAgICBwYXlsb2FkSnNvbjogeyBTOiBKU09OLnN0cmluZ2lmeShpbnNpZ2h0KSB9LFxuICAgICAgICB0czogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudExsbVVzYWdlKGRkYjogRHluYW1vREJDbGllbnQsIHRhYmxlTmFtZTogc3RyaW5nLCB1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IGRheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGtleSA9IGBfX3VzYWdlX18jJHtkYXl9YDtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSwgY2FjaGVLZXk6IHsgUzoga2V5IH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiQUREIGxsbUNhbGxzIDpvbmUgU0VUIHRzID0gOnRzXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOm9uZVwiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIFwiOnRzXCI6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiBcIlVQREFURURfTkVXXCIsXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBOdW1iZXIob3V0LkF0dHJpYnV0ZXM/LmxsbUNhbGxzPy5OID8/IDApO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZWZpbmVPbmUoXG4gIGRkYjogRHluYW1vREJDbGllbnQsXG4gIGNhY2hlVGFibGVOYW1lOiBzdHJpbmcsXG4gIGFwaUtleTogc3RyaW5nLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgaW5zaWdodDogTGFtYmRhSW5zaWdodENhcmQsXG4gIGN0eDogeyB0b25lOiBzdHJpbmc7IGZpcnN0TmFtZTogc3RyaW5nOyByZWNlbnROb3Rlczogc3RyaW5nW10gfSxcbik6IFByb21pc2U8TGFtYmRhSW5zaWdodENhcmQ+IHtcbiAgY29uc3QgY2FjaGVLZXkgPSBgJHtpbnNpZ2h0LmlkfSMke2RheUtleSgpfWA7XG4gIGNvbnN0IGNhY2hlZCA9IGF3YWl0IGdldEluc2lnaHRDYWNoZShkZGIsIGNhY2hlVGFibGVOYW1lLCB1c2VySWQsIGNhY2hlS2V5KTtcbiAgaWYgKGNhY2hlZCkgcmV0dXJuIHdpdGhMbG1DYXJkKHsgLi4uaW5zaWdodCwgLi4uY2FjaGVkLCBnZW5lcmF0aW9uU291cmNlOiBcImxsbVwiIH0pO1xuXG4gIGNvbnN0IGNvdW50ID0gYXdhaXQgaW5jcmVtZW50TGxtVXNhZ2UoZGRiLCBjYWNoZVRhYmxlTmFtZSwgdXNlcklkKTtcbiAgaWYgKGNvdW50ID4gREFJTFlfTElNSVQpIHJldHVybiB3aXRoUnVsZXNDYXJkKGluc2lnaHQpO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgY29uc3Qgbm90ZXMgPSBjdHgucmVjZW50Tm90ZXMuc2xpY2UoLTMpLmpvaW4oXCJcXG4tIFwiKTtcbiAgICBjb25zdCB0b25lR3VpZGUgPVxuICAgICAgY3R4LnRvbmUgPT09IFwiY2xpbmljYWxcIlxuICAgICAgICA/IFwiVXNlIG5ldXRyYWwsIGNvbmNpc2UsIGZhY3R1YWwgbGFuZ3VhZ2UuIE5vIGNoZWVybGVhZGluZy4gRG8gbm90IGFkZCBkaWFnbm9zZXMgb3IgY2xhaW1zIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIHdoeSBwb2ludHMuXCJcbiAgICAgICAgOiBjdHgudG9uZSA9PT0gXCJ0b3VnaC1sb3ZlXCJcbiAgICAgICAgICA/IFwiQmUgZGlyZWN0IGFuZCBtb3RpdmF0aW5nOyBuZXZlciBzaGFtZWZ1bCBvciBpbnN1bHRpbmcuIE5vIHBlcnNvbmFsIGF0dGFja3MuIFByZXNlcnZlIGV2ZXJ5IGZhY3R1YWwgY2xhaW0gZnJvbSB0aGUgb3JpZ2luYWwuXCJcbiAgICAgICAgICA6IGN0eC50b25lID09PSBcImF5dXJ2ZWRpY1wiXG4gICAgICAgICAgICA/IFwiVXNlIGdlbnRsZSByaHl0aG0vYmFsYW5jZS93ZWxsbmVzcyBmcmFtaW5nIG9ubHk7IGRvIG5vdCBjbGFpbSBkb3NoYSB0eXBlcywgQXl1cnZlZGljIGRpYWdub3Nlcywgb3IgY3VyZXMuIFByZXNlcnZlIGZhY3RzLlwiXG4gICAgICAgICAgICA6IFwiV2FybSBhbmQgc3VwcG9ydGl2ZTsgcHJlc2VydmUgZmFjdHMuXCI7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiBcImNsYXVkZS1oYWlrdS00LTVcIixcbiAgICAgIG1heF90b2tlbnM6IDE4MCxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjQsXG4gICAgICBzeXN0ZW06XG4gICAgICAgIGBSZXdyaXRlIGEgaGVhbHRoIGluc2lnaHQgZm9yIHRoZSB1c2VyJ3MgY29hY2ggdG9uZSB3aGlsZSBwcmVzZXJ2aW5nIGFsbCBmYWN0dWFsIGNsYWltcyBmcm9tIHRoZSBvcmlnaW5hbCAobnVtYmVycywgY29tcGFyaXNvbnMsIGRhdGVzKS4gUmVwbHkgd2l0aCBPTkxZIGEgc2luZ2xlIEpTT04gb2JqZWN0IChubyBtYXJrZG93biwgbm8gY29kZSBmZW5jZXMpIHdpdGgga2V5cyBoZWFkbGluZSBhbmQgZGV0YWlsIChzdHJpbmdzKS4gU3R5bGU6ICR7dG9uZUd1aWRlfWAsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgICAgY29udGVudDogYFRvbmU6ICR7Y3R4LnRvbmV9XG5GaXJzdCBuYW1lOiAke2N0eC5maXJzdE5hbWV9XG5PcmlnaW5hbCBoZWFkbGluZTogJHtpbnNpZ2h0LmhlYWRsaW5lfVxuT3JpZ2luYWwgZGV0YWlsOiAke2luc2lnaHQuZGV0YWlsID8/IFwiXCJ9XG5XaHkgcG9pbnRzOlxuLSAke2luc2lnaHQud2h5LmpvaW4oXCJcXG4tIFwiKX1cblJlY2VudCBub3RlcyBzYW1wbGU6XG4tICR7bm90ZXMgfHwgXCJOb25lXCJ9YCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgdGV4dCA9IHJlc3BvbnNlLmNvbnRlbnQuZmluZCgocGFydCkgPT4gcGFydC50eXBlID09PSBcInRleHRcIik/LnRleHQ7XG4gICAgaWYgKCF0ZXh0KSByZXR1cm4gd2l0aFJ1bGVzQ2FyZChpbnNpZ2h0KTtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUluc2lnaHRDb3B5RnJvbUxsbVRleHQodGV4dCk7XG4gICAgaWYgKCFwYXJzZWQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtc2c6IFwiaW5zaWdodHNfbGxtX3BhcnNlX2ZhaWxlZFwiLFxuICAgICAgICAgIGluc2lnaHRJZDogaW5zaWdodC5pZCxcbiAgICAgICAgICB0ZXh0UHJldmlldzogdGV4dC5zbGljZSgwLCAyMDApLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgICByZXR1cm4gd2l0aFJ1bGVzQ2FyZChpbnNpZ2h0KTtcbiAgICB9XG4gICAgY29uc3QgbmV4dEluc2lnaHQgPSB3aXRoTGxtQ2FyZCh7XG4gICAgICAuLi5pbnNpZ2h0LFxuICAgICAgaGVhZGxpbmU6IHBhcnNlZC5oZWFkbGluZT8udHJpbSgpIHx8IGluc2lnaHQuaGVhZGxpbmUsXG4gICAgICBkZXRhaWw6IHBhcnNlZC5kZXRhaWwgIT09IHVuZGVmaW5lZCA/IHBhcnNlZC5kZXRhaWwudHJpbSgpIHx8IGluc2lnaHQuZGV0YWlsIDogaW5zaWdodC5kZXRhaWwsXG4gICAgfSk7XG4gICAgYXdhaXQgcHV0SW5zaWdodENhY2hlKGRkYiwgY2FjaGVUYWJsZU5hbWUsIHVzZXJJZCwgY2FjaGVLZXksIG5leHRJbnNpZ2h0KTtcbiAgICByZXR1cm4gbmV4dEluc2lnaHQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1zZzogXCJpbnNpZ2h0c19sbG1fcmVxdWVzdF9mYWlsZWRcIixcbiAgICAgICAgaW5zaWdodElkOiBpbnNpZ2h0LmlkLFxuICAgICAgICBlcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpLFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4gd2l0aFJ1bGVzQ2FyZChpbnNpZ2h0KTtcbiAgfVxufVxuXG4vKipcbiAqIE9wdGlvbmFsbHkgcmV3cml0ZXMgaW5zaWdodCBjb3B5IHZpYSBBbnRocm9waWMgd2hlbiBlbnYgaXMgY29uZmlndXJlZC5cbiAqIE5ldmVyIHRocm93czogZmFpbHVyZXMgZmFsbCBiYWNrIHRvIHRoZSBydWxlLWJhc2VkIGNhcmQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXliZVJlZmluZUluc2lnaHRDYXJkcyhcbiAgZGRiOiBEeW5hbW9EQkNsaWVudCxcbiAgaW5wdXQ6IHtcbiAgICB1c2VySWQ6IHN0cmluZztcbiAgICBpbnNpZ2h0czogTGFtYmRhSW5zaWdodENhcmRbXTtcbiAgICB0b25lOiBzdHJpbmc7XG4gICAgZmlyc3ROYW1lOiBzdHJpbmc7XG4gICAgcmVjZW50Tm90ZXM6IHN0cmluZ1tdO1xuICB9LFxuKTogUHJvbWlzZTxMYW1iZGFJbnNpZ2h0Q2FyZFtdPiB7XG4gIGlmICghaXNMYW1iZGFJbnNpZ2h0c0xsbVJlZmluZUVuYWJsZWQoKSkge1xuICAgIHJldHVybiBpbnB1dC5pbnNpZ2h0cy5tYXAoKGkpID0+IHdpdGhSdWxlc0NhcmQoaSkpO1xuICB9XG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4gaW5wdXQuaW5zaWdodHMubWFwKChpKSA9PiB3aXRoUnVsZXNDYXJkKGkpKTtcbiAgY29uc3QgdGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuSU5TSUdIVF9DQUNIRV9UQUJMRV9OQU1FPy50cmltKCk7XG4gIGlmICghdGFibGVOYW1lKSByZXR1cm4gaW5wdXQuaW5zaWdodHMubWFwKChpKSA9PiB3aXRoUnVsZXNDYXJkKGkpKTtcblxuICBjb25zdCBvdXQ6IExhbWJkYUluc2lnaHRDYXJkW10gPSBbXTtcbiAgZm9yIChjb25zdCBpbnNpZ2h0IG9mIGlucHV0Lmluc2lnaHRzKSB7XG4gICAgb3V0LnB1c2goXG4gICAgICBhd2FpdCByZWZpbmVPbmUoZGRiLCB0YWJsZU5hbWUsIGFwaUtleSwgaW5wdXQudXNlcklkLCBpbnNpZ2h0LCB7XG4gICAgICAgIHRvbmU6IGlucHV0LnRvbmUsXG4gICAgICAgIGZpcnN0TmFtZTogaW5wdXQuZmlyc3ROYW1lLFxuICAgICAgICByZWNlbnROb3RlczogaW5wdXQucmVjZW50Tm90ZXMsXG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG4iXX0=