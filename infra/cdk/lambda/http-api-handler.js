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
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const node_crypto_1 = require("node:crypto");
const s3Uri_1 = require("../../../lib/food/s3Uri");
const index_1 = require("../../../lib/aiNudges/index");
const insights_ai_card_1 = require("./insights-ai-card");
const food_log_api_1 = require("./food-log-api");
const activity_api_1 = require("./activity-api");
const meals_api_1 = require("./meals-api");
const lambdaApiKeyFromSecrets_1 = require("../../../lib/anthropic/lambdaApiKeyFromSecrets");
const parseTranscript_1 = require("../../../lib/voiceDailyLog/parseTranscript");
const billing_api_1 = require("./billing-api");
const weekly_report_email_send_1 = require("./weekly-report-email-send");
const ddb = new client_dynamodb_1.DynamoDBClient({});
const s3 = new client_s3_1.S3Client({});
const cognitoIdp = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const entriesTableName = process.env.ENTRIES_TABLE_NAME;
const settingsTableName = process.env.SETTINGS_TABLE_NAME;
const insightFeedbackTableName = process.env.INSIGHT_FEEDBACK_TABLE_NAME;
const featureFlagOverridesTableName = process.env.FEATURE_FLAG_OVERRIDES_TABLE_NAME;
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
const foodLogEntriesTableName = process.env.FOOD_LOG_ENTRIES_TABLE_NAME;
const mealsTableName = process.env.MEALS_TABLE_NAME;
const dayMealEntriesTableName = process.env.DAY_MEAL_ENTRIES_TABLE_NAME;
const progressPhotosTableName = process.env.PROGRESS_PHOTOS_TABLE_NAME;
const uploadUrlTtlSeconds = Number(process.env.UPLOAD_URL_TTL_SECONDS ?? "900");
const downloadUrlTtlSeconds = Number(process.env.DOWNLOAD_URL_TTL_SECONDS ?? "3600");
const analyticsMetaUserId = "__meta__";
const userPoolIdEnv = process.env.USER_POOL_ID;
/** CORS on every JSON response so browsers can read bodies on errors (API-level CORS alone can miss edge cases). */
const JSON_CORS_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type,x-cognito-access-token",
    "access-control-allow-methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
};
function json(statusCode, payload) {
    return {
        statusCode,
        headers: JSON_CORS_HEADERS,
        body: JSON.stringify(payload),
    };
}
function getRequiredEnv(name, value) {
    if (!value) {
        throw new Error(`Missing required env var ${name}`);
    }
    return value;
}
function parseJsonBody(event) {
    if (!event.body)
        return {};
    try {
        return JSON.parse(event.body);
    }
    catch {
        throw new Error("Invalid JSON");
    }
}
function isDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function envFlagTriState(name) {
    const v = process.env[name];
    if (v === "true")
        return true;
    if (v === "false")
        return false;
    return undefined;
}
function isBodyCompareAiEnabledLambda() {
    return process.env.FF_BODY_COMPARE_AI !== "false";
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isIntNonNegative(value) {
    return Number.isInteger(value) && isNonNegativeNumber(value);
}
function validateEntry(input) {
    if (!input || typeof input !== "object") {
        return { ok: false, error: "Body must be an object" };
    }
    const body = input;
    if (!isDateString(body.date))
        return { ok: false, error: "Invalid date" };
    if (!isPositiveNumber(body.morningWeight))
        return { ok: false, error: "Invalid morningWeight" };
    if (typeof body.lateSnack !== "boolean")
        return { ok: false, error: "Invalid lateSnack" };
    if (typeof body.highSodium !== "boolean")
        return { ok: false, error: "Invalid highSodium" };
    if (typeof body.workout !== "boolean")
        return { ok: false, error: "Invalid workout" };
    if (typeof body.alcohol !== "boolean")
        return { ok: false, error: "Invalid alcohol" };
    if (body.nightWeight !== undefined &&
        body.nightWeight !== null &&
        !isPositiveNumber(body.nightWeight)) {
        return { ok: false, error: "Invalid nightWeight" };
    }
    if (body.calories !== undefined && !isIntNonNegative(body.calories)) {
        return { ok: false, error: "Invalid calories" };
    }
    if (body.protein !== undefined && !isIntNonNegative(body.protein)) {
        return { ok: false, error: "Invalid protein" };
    }
    if (body.steps !== undefined && !isIntNonNegative(body.steps)) {
        return { ok: false, error: "Invalid steps" };
    }
    if (body.sleep !== undefined && !isNonNegativeNumber(body.sleep)) {
        return { ok: false, error: "Invalid sleep" };
    }
    if (body.photoUrl !== undefined &&
        body.photoUrl !== null &&
        (typeof body.photoUrl !== "string" || body.photoUrl.length > 600000)) {
        return { ok: false, error: "Invalid photoUrl" };
    }
    if (body.notes !== undefined &&
        body.notes !== null &&
        (typeof body.notes !== "string" || body.notes.length > 2000)) {
        return { ok: false, error: "Invalid notes" };
    }
    if (body.activityText !== undefined &&
        (typeof body.activityText !== "string" || body.activityText.length > 500)) {
        return { ok: false, error: "Invalid activityText" };
    }
    if (body.activitySummary !== undefined &&
        (typeof body.activitySummary !== "string" || body.activitySummary.length > 500)) {
        return { ok: false, error: "Invalid activitySummary" };
    }
    if (body.activityBurnKcal !== undefined && !isIntNonNegative(body.activityBurnKcal)) {
        return { ok: false, error: "Invalid activityBurnKcal" };
    }
    if (body.activityMinutes !== undefined && !isIntNonNegative(body.activityMinutes)) {
        return { ok: false, error: "Invalid activityMinutes" };
    }
    if (body.activityMet !== undefined && !isPositiveNumber(body.activityMet)) {
        return { ok: false, error: "Invalid activityMet" };
    }
    if (body.activityConfidence !== undefined &&
        (!isNonNegativeNumber(body.activityConfidence) || body.activityConfidence > 100)) {
        return { ok: false, error: "Invalid activityConfidence" };
    }
    return {
        ok: true,
        data: {
            date: body.date,
            morningWeight: body.morningWeight,
            nightWeight: body.nightWeight ?? undefined,
            calories: body.calories,
            protein: body.protein,
            steps: body.steps,
            sleep: body.sleep,
            lateSnack: body.lateSnack,
            highSodium: body.highSodium,
            workout: body.workout,
            alcohol: body.alcohol,
            photoUrl: body.photoUrl ?? undefined,
            notes: body.notes ?? undefined,
            activityText: body.activityText,
            activitySummary: body.activitySummary,
            activityBurnKcal: body.activityBurnKcal,
            activityMet: body.activityMet,
            activityMinutes: body.activityMinutes,
            activityConfidence: body.activityConfidence,
        },
    };
}
function validateSettings(input) {
    if (!input || typeof input !== "object") {
        return { ok: false, error: "Body must be an object" };
    }
    const body = input;
    if (!isPositiveNumber(body.goalWeight))
        return { ok: false, error: "Invalid goalWeight" };
    if (!isPositiveNumber(body.startWeight))
        return { ok: false, error: "Invalid startWeight" };
    if (!isDateString(body.targetDate))
        return { ok: false, error: "Invalid targetDate" };
    if (body.unit !== "kg" && body.unit !== "lbs")
        return { ok: false, error: "Invalid unit" };
    if (body.tone !== undefined &&
        body.tone !== "friendly" &&
        body.tone !== "clinical" &&
        body.tone !== "tough-love" &&
        body.tone !== "ayurvedic") {
        return { ok: false, error: "Invalid tone" };
    }
    if (body.optInForecast !== undefined && typeof body.optInForecast !== "boolean") {
        return { ok: false, error: "Invalid optInForecast" };
    }
    if (body.forecastGeneratedAt !== undefined &&
        (typeof body.forecastGeneratedAt !== "string" || body.forecastGeneratedAt.length > 64)) {
        return { ok: false, error: "Invalid forecastGeneratedAt" };
    }
    if (body.forecastDisclaimerAccepted !== undefined &&
        typeof body.forecastDisclaimerAccepted !== "boolean") {
        return { ok: false, error: "Invalid forecastDisclaimerAccepted" };
    }
    if (Object.prototype.hasOwnProperty.call(body, "weeklyDigestEmail") &&
        typeof body.weeklyDigestEmail !== "boolean") {
        return { ok: false, error: "Invalid weeklyDigestEmail" };
    }
    return {
        ok: true,
        data: {
            goalWeight: body.goalWeight,
            startWeight: body.startWeight,
            targetDate: body.targetDate,
            unit: body.unit,
            tone: body.tone,
            optInForecast: body.optInForecast,
            forecastGeneratedAt: body.forecastGeneratedAt,
            forecastDisclaimerAccepted: body.forecastDisclaimerAccepted,
            weeklyDigestEmail: Object.prototype.hasOwnProperty.call(body, "weeklyDigestEmail")
                ? body.weeklyDigestEmail
                : undefined,
        },
    };
}
function getJwtClaims(event) {
    const raw = event.requestContext?.authorizer?.jwt?.claims;
    if (raw == null)
        return undefined;
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
            return undefined;
        }
        catch {
            return undefined;
        }
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return raw;
    }
    return undefined;
}
function getUserId(event) {
    const sub = getJwtClaims(event)?.sub;
    return typeof sub === "string" ? sub : undefined;
}
function firstNameFromJwtClaims(claims) {
    if (!claims)
        return undefined;
    const given = claims.given_name;
    if (typeof given === "string" && given.trim())
        return given.trim();
    const name = claims.name;
    if (typeof name === "string" && name.trim()) {
        const first = name.trim().split(/\s+/)[0];
        return first || undefined;
    }
    return undefined;
}
function plateauSettingsFromItem(item) {
    if (!item)
        return undefined;
    const out = {};
    const rw = item.plateauRollingWindowDays?.N;
    const span = item.plateauComparisonSpanDays?.N;
    const mv = item.plateauMaxMovementKg?.N;
    if (rw != null) {
        const n = Number(rw);
        if (Number.isFinite(n))
            out.rollingWindowDays = n;
    }
    if (span != null) {
        const n = Number(span);
        if (Number.isFinite(n))
            out.comparisonSpanDays = n;
    }
    if (mv != null) {
        const n = Number(mv);
        if (Number.isFinite(n))
            out.maxAvgMovementKg = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function validatePlateauPatchObject(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "plateau must be an object" };
    }
    const o = raw;
    const data = {};
    if (o.rollingWindowDays !== undefined) {
        const n = Number(o.rollingWindowDays);
        if (!Number.isFinite(n))
            return { ok: false, error: "Invalid plateau.rollingWindowDays" };
        data.rollingWindowDays = n;
    }
    if (o.comparisonSpanDays !== undefined) {
        const n = Number(o.comparisonSpanDays);
        if (!Number.isFinite(n))
            return { ok: false, error: "Invalid plateau.comparisonSpanDays" };
        data.comparisonSpanDays = n;
    }
    if (o.maxAvgMovementKg !== undefined) {
        const n = Number(o.maxAvgMovementKg);
        if (!Number.isFinite(n))
            return { ok: false, error: "Invalid plateau.maxAvgMovementKg" };
        data.maxAvgMovementKg = n;
    }
    return { ok: true, data };
}
/** Gmail treats dots and +labels as aliases; normalize so admin list matches real sign-in identities. */
function normalizeEmailForAdminMatch(email) {
    const lower = email.trim().toLowerCase();
    const at = lower.lastIndexOf("@");
    if (at <= 0)
        return lower;
    const local = lower.slice(0, at);
    const domain = lower.slice(at + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
        const baseLocal = (local.split("+")[0] ?? local).replace(/\./g, "");
        return `${baseLocal}@${domain}`;
    }
    return lower;
}
function getAdminAllowListNormalized() {
    const raw = process.env.ADMIN_EMAILS?.trim() || "ojashealth2026@gmail.com";
    const parts = raw
        .split(",")
        .map((s) => normalizeEmailForAdminMatch(s.trim()))
        .filter(Boolean);
    const set = new Set(parts);
    if (set.size === 0) {
        set.add(normalizeEmailForAdminMatch("ojashealth2026@gmail.com"));
    }
    return set;
}
const ADMIN_CLAIM_KEYS = ["username", "cognito:username", "email", "preferred_username"];
function collectAdminIdentityCandidates(claims) {
    const found = [];
    const emailish = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const key of ADMIN_CLAIM_KEYS) {
        const v = claims[key];
        if (typeof v === "string" && emailish.test(v.trim())) {
            found.push(v.trim().toLowerCase());
        }
    }
    for (const v of Object.values(claims)) {
        if (typeof v === "string" && emailish.test(v.trim())) {
            found.push(v.trim().toLowerCase());
        }
    }
    return [...new Set(found)];
}
/** True if JWT claims include an email identity that matches the configured admin allow list. */
function isAdminCaller(event) {
    const claims = getJwtClaims(event);
    if (!claims)
        return false;
    const allow = getAdminAllowListNormalized();
    if (allow.size === 0)
        return false;
    const candidates = collectAdminIdentityCandidates(claims);
    for (const c of candidates) {
        if (allow.has(normalizeEmailForAdminMatch(c)))
            return true;
    }
    return false;
}
function headerValue(headers, name) {
    if (!headers)
        return undefined;
    const want = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === want && typeof v === "string" && v.length > 0) {
            return v;
        }
    }
    return undefined;
}
/**
 * JWT HTTP API authorizers validate Authorization but typically do not forward that header to Lambda.
 * Clients also send x-cognito-access-token (see frontend-api-client) so we can call cognito-idp:GetUser.
 */
function bearerAccessToken(event) {
    const h = event.headers;
    const custom = headerValue(h, "x-cognito-access-token");
    if (custom?.trim())
        return custom.trim();
    const raw = headerValue(h, "authorization");
    if (!raw)
        return undefined;
    const m = raw.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim();
}
/** When claims lack a resolvable email, verify admin via GetUser; token sub must match JWT sub. */
async function isAdminViaGetUser(event) {
    const token = bearerAccessToken(event);
    if (!token)
        return false;
    const jwtSub = getUserId(event);
    if (!jwtSub)
        return false;
    const allow = getAdminAllowListNormalized();
    if (allow.size === 0)
        return false;
    try {
        const out = await cognitoIdp.send(new client_cognito_identity_provider_1.GetUserCommand({ AccessToken: token }));
        const attrs = out.UserAttributes ?? [];
        const tokenSub = attrs.find((a) => a.Name === "sub")?.Value;
        if (tokenSub !== jwtSub)
            return false;
        const email = attrs.find((a) => a.Name === "email")?.Value ??
            attrs.find((a) => a.Name === "preferred_username")?.Value;
        const fromUsername = out.Username?.includes("@") ? out.Username : undefined;
        const candidate = (email ?? fromUsername ?? "").trim().toLowerCase();
        if (!candidate)
            return false;
        return allow.has(normalizeEmailForAdminMatch(candidate));
    }
    catch {
        return false;
    }
}
async function isAdminAllowed(event) {
    if (isAdminCaller(event))
        return true;
    return isAdminViaGetUser(event);
}
function defaultTargetDate() {
    const d = new Date();
    d.setDate(d.getDate() + 118);
    return d.toISOString().slice(0, 10);
}
function normalizePhotoReference(photoUrl) {
    if (!photoUrl || typeof photoUrl !== "string")
        return undefined;
    if (photoUrl.startsWith("s3://"))
        return photoUrl;
    if (!photoUrl.includes("://")) {
        const keyOnly = photoUrl.replace(/^\/+/, "");
        if (!keyOnly)
            return undefined;
        if (photoBucketName) {
            return `s3://${photoBucketName}/${keyOnly}`;
        }
        return undefined;
    }
    try {
        const parsed = new URL(photoUrl);
        const host = parsed.hostname.toLowerCase();
        const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
        if (!path)
            return undefined;
        // Virtual-hosted-style URL: bucket.s3.<region>.amazonaws.com/key
        const virtualHosted = host.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/);
        if (virtualHosted?.[1]) {
            return `s3://${virtualHosted[1]}/${path}`;
        }
        // Legacy global endpoint: bucket.s3.amazonaws.com/key
        const globalHosted = host.match(/^(.+)\.s3\.amazonaws\.com$/);
        if (globalHosted?.[1]) {
            return `s3://${globalHosted[1]}/${path}`;
        }
        // Path-style URL: s3.<region>.amazonaws.com/bucket/key
        if (/^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host) || host === "s3.amazonaws.com") {
            const slash = path.indexOf("/");
            if (slash <= 0)
                return undefined;
            const bucket = path.slice(0, slash);
            const key = path.slice(slash + 1);
            if (!bucket || !key)
                return undefined;
            return `s3://${bucket}/${key}`;
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
function sortByDateAsc(rows) {
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}
function average(values) {
    if (values.length === 0)
        return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function nextMorningDeltas(logs, predicate) {
    const sorted = sortByDateAsc(logs);
    const flagged = [];
    const baseline = [];
    for (let idx = 0; idx < sorted.length - 1; idx += 1) {
        const delta = sorted[idx + 1].morningWeight - sorted[idx].morningWeight;
        if (predicate(sorted[idx]))
            flagged.push(delta);
        else
            baseline.push(delta);
    }
    return { flagged, baseline };
}
function sodiumInsight(logs) {
    const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.highSodium);
    if (flagged.length < 4 || baseline.length < 1)
        return null;
    const flaggedAvg = average(flagged);
    const baselineAvg = average(baseline);
    if (flaggedAvg == null || baselineAvg == null)
        return null;
    const excess = flaggedAvg - baselineAvg;
    if (excess <= 0.3)
        return null;
    return {
        id: `sodium-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
        ruleId: "sodiumBump",
        priority: 95,
        headline: "High-sodium days are linked to heavier next-morning weigh-ins.",
        detail: `You average +${round2(excess)} kg vs your non-sodium baseline the next morning.`,
        why: [
            `${flagged.length} high-sodium days in the last 90 days`,
            `Average next-morning change on high-sodium days: +${round2(flaggedAvg)} kg`,
            `Baseline next-morning change: +${round2(baselineAvg)} kg`,
        ],
        action: "Try one lower-sodium dinner swap tonight.",
        category: "sodium",
    };
}
function alcoholInsight(logs) {
    const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.alcohol);
    if (flagged.length < 4 || baseline.length < 1)
        return null;
    const flaggedAvg = average(flagged);
    const baselineAvg = average(baseline);
    if (flaggedAvg == null || baselineAvg == null)
        return null;
    const excess = flaggedAvg - baselineAvg;
    if (excess <= 0.3)
        return null;
    return {
        id: `alcohol-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
        ruleId: "alcohol",
        priority: 90,
        headline: "Alcohol days tend to show a next-day weight bump.",
        detail: `You average +${round2(excess)} kg versus non-alcohol days the next morning.`,
        why: [
            `${flagged.length} alcohol-logged days in the last 90 days`,
            `Average next-morning change after alcohol: +${round2(flaggedAvg)} kg`,
            `Baseline next-morning change: +${round2(baselineAvg)} kg`,
        ],
        action: "Plan alcohol-free weekdays for steadier trend lines.",
        category: "alcohol",
    };
}
function lateSnackInsight(logs) {
    const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.lateSnack);
    if (flagged.length < 4 || baseline.length < 1)
        return null;
    const flaggedAvg = average(flagged);
    const baselineAvg = average(baseline);
    if (flaggedAvg == null || baselineAvg == null)
        return null;
    const excess = flaggedAvg - baselineAvg;
    if (excess <= 0.3)
        return null;
    return {
        id: `late-snack-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
        ruleId: "lateSnack",
        priority: 88,
        headline: "Late snacks are correlated with heavier next-morning scale readings.",
        detail: `Your next-day change is +${round2(excess)} kg higher than your non-late-snack baseline.`,
        why: [
            `${flagged.length} late-snack days in the last 90 days`,
            `Average next-morning change with late snack: +${round2(flaggedAvg)} kg`,
            `Baseline next-morning change: +${round2(baselineAvg)} kg`,
        ],
        action: "Set a 2-hour kitchen close time before bed.",
        category: "late_snack",
    };
}
function baselineInsightWithLogs(entryCount, latestDate) {
    return {
        id: `baseline-insight-${latestDate}`,
        ruleId: "baseline",
        priority: 10,
        headline: "Great consistency so far — keep logging daily for sharper insights.",
        detail: "We need a bit more signal to detect strong personal patterns, but your data flow is active.",
        why: [
            `${entryCount} logs analyzed from the last 90 days`,
            "No rule crossed confidence thresholds yet",
        ],
        action: "Keep tracking daily habits and weight to unlock stronger personalized insights.",
        category: "streak",
    };
}
function baselineInsightNoLogs(asOfDate) {
    return {
        id: `baseline-insight-${asOfDate}`,
        ruleId: "baseline",
        priority: 10,
        headline: "Start logging weight and habits to unlock personalized insights.",
        detail: "Once you have a few weeks of entries, we will highlight patterns that match your data.",
        why: ["No entries found in the last 90 days"],
        action: "Add today's weight on the left to begin.",
        category: "streak",
    };
}
async function getInsightsV2(userId, _event) {
    const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 89);
    const from = fromDate.toISOString().slice(0, 10);
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND #date BETWEEN :fromDate AND :toDate",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: {
            ":userId": { S: userId },
            ":fromDate": { S: from },
            ":toDate": { S: to },
        },
        ScanIndexForward: true,
        ConsistentRead: true,
    }));
    const entriesRaw = (out.Items ?? []).map((item) => ({
        date: item.date?.S ?? "",
        morningWeight: Number(item.morningWeight?.N ?? 0),
        nightWeight: item.nightWeight?.N ? Number(item.nightWeight.N) : undefined,
        calories: item.calories?.N ? Number(item.calories.N) : undefined,
        protein: item.protein?.N ? Number(item.protein.N) : undefined,
        steps: item.steps?.N ? Number(item.steps.N) : undefined,
        sleep: item.sleep?.N ? Number(item.sleep.N) : undefined,
        lateSnack: item.lateSnack?.BOOL ?? false,
        highSodium: item.highSodium?.BOOL ?? false,
        workout: item.workout?.BOOL ?? false,
        alcohol: item.alcohol?.BOOL ?? false,
    })).filter((e) => e.date && e.morningWeight > 0);
    const settingsTable = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const settingsRow = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: settingsTable,
        Key: { userId: { S: userId } },
        ConsistentRead: true,
    }));
    const gItem = settingsRow.Item;
    const goalWeight = gItem ? Number(gItem.goalWeight?.N ?? 72) : 72;
    const startWeight = gItem ? Number(gItem.startWeight?.N ?? 85) : 85;
    const targetDate = gItem?.targetDate?.S ?? to;
    const insights = await (0, insights_ai_card_1.generateAiInsightCard)(ddb, {
        userId,
        entriesRaw,
        goalWeight,
        startWeight,
        targetDate,
        dayMealsTableName: dayMealEntriesTableName,
    });
    const bodyOut = { insights };
    if (process.env.FF_PERSONALIZED_AI_COACHING !== "false") {
        const subsTable = process.env.SUBSCRIPTIONS_TABLE_NAME;
        let plan;
        let subscriptionStatus;
        if (subsTable) {
            try {
                const subOut = await ddb.send(new client_dynamodb_1.GetItemCommand({
                    TableName: subsTable,
                    Key: { userId: { S: userId } },
                    ConsistentRead: true,
                }));
                plan = subOut.Item?.plan?.S ?? "free";
                subscriptionStatus = subOut.Item?.status?.S ?? "inactive";
            }
            catch {
                plan = "free";
                subscriptionStatus = "inactive";
            }
        }
        const sorted = [...entriesRaw].sort((a, b) => a.date.localeCompare(b.date));
        const last7 = sorted.slice(-7);
        const kcals = last7.map((e) => e.calories).filter((c) => typeof c === "number" && c > 0);
        const recentAvgDailyCalories = kcals.length >= 2 ? kcals.reduce((a, b) => a + b, 0) / kcals.length : null;
        bodyOut.personalizedCoaching = (0, index_1.buildPersonalizedCoachingPayload)({
            entriesRaw,
            goalWeight,
            startWeight,
            targetDate,
            asOfDate: to,
            plan,
            subscriptionStatus,
            recentAvgDailyCalories,
        });
    }
    return json(200, bodyOut);
}
async function saveInsightFeedback(userId, event) {
    const tableName = getRequiredEnv("INSIGHT_FEEDBACK_TABLE_NAME", insightFeedbackTableName);
    const payload = parseJsonBody(event);
    if (!payload || typeof payload !== "object")
        return json(400, { error: "Body must be an object" });
    const body = payload;
    const insightId = typeof body.insightId === "string" ? body.insightId.trim() : "";
    const voteRaw = body.vote;
    const allowedVotes = new Set(["up", "down", "helpful", "not_helpful", "dismiss"]);
    const vote = typeof voteRaw === "string" && allowedVotes.has(voteRaw)
        ? voteRaw
        : null;
    if (!insightId || !vote)
        return json(400, { error: "Invalid insight feedback payload" });
    const commentRaw = body.comment;
    const comment = typeof commentRaw === "string" && commentRaw.trim().length > 0
        ? commentRaw.trim().slice(0, 2000)
        : undefined;
    const feedbackType = body.feedbackType === "negative" ? "negative" : undefined;
    const ts = new Date().toISOString();
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: {
            userId: { S: userId },
            insightTs: { S: `${ts}#${insightId}` },
            insightId: { S: insightId },
            vote: { S: vote },
            ts: { S: ts },
            ...(comment ? { comment: { S: comment } } : {}),
            ...(feedbackType ? { feedbackType: { S: feedbackType } } : {}),
        },
    }));
    return json(200, { ok: true });
}
async function getEntries(userId, query) {
    const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
    const from = query?.from;
    const to = query?.to;
    if (from && !isDateString(from))
        return json(400, { error: "Invalid from date" });
    if (to && !isDateString(to))
        return json(400, { error: "Invalid to date" });
    const expressionValues = { ":userId": { S: userId } };
    let keyCondition = "userId = :userId";
    if (from && to) {
        keyCondition += " AND #date BETWEEN :fromDate AND :toDate";
        expressionValues[":fromDate"] = { S: from };
        expressionValues[":toDate"] = { S: to };
    }
    else if (from) {
        keyCondition += " AND #date >= :fromDate";
        expressionValues[":fromDate"] = { S: from };
    }
    else if (to) {
        keyCondition += " AND #date <= :toDate";
        expressionValues[":toDate"] = { S: to };
    }
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyCondition,
        ...(keyCondition.includes("#date")
            ? { ExpressionAttributeNames: { "#date": "date" } }
            : {}),
        ExpressionAttributeValues: expressionValues,
        ScanIndexForward: true,
        ConsistentRead: true,
    }));
    const entries = (out.Items ?? []).map((item) => ({
        id: item.id?.S ?? `${userId}:${item.date?.S ?? ""}`,
        userId: item.userId?.S ?? userId,
        date: item.date?.S ?? "",
        morningWeight: Number(item.morningWeight?.N ?? 0),
        nightWeight: item.nightWeight?.N ? Number(item.nightWeight.N) : undefined,
        calories: item.calories?.N ? Number(item.calories.N) : undefined,
        protein: item.protein?.N ? Number(item.protein.N) : undefined,
        steps: item.steps?.N ? Number(item.steps.N) : undefined,
        sleep: item.sleep?.N ? Number(item.sleep.N) : undefined,
        lateSnack: item.lateSnack?.BOOL ?? false,
        highSodium: item.highSodium?.BOOL ?? false,
        workout: item.workout?.BOOL ?? false,
        alcohol: item.alcohol?.BOOL ?? false,
        photoUrl: item.photoUrl?.S ?? undefined,
        notes: item.notes?.S ?? undefined,
        activityText: item.activityText?.S ?? undefined,
        activitySummary: item.activitySummary?.S ?? undefined,
        activityBurnKcal: item.activityBurnKcal?.N ? Number(item.activityBurnKcal.N) : undefined,
        activityMet: item.activityMet?.N ? Number(item.activityMet.N) : undefined,
        activityMinutes: item.activityMinutes?.N ? Number(item.activityMinutes.N) : undefined,
        activityConfidence: item.activityConfidence?.N ? Number(item.activityConfidence.N) : undefined,
    }));
    const entriesWithSignedPhotoUrls = await Promise.all(entries.map(async (entry) => {
        const photo = normalizePhotoReference(entry.photoUrl);
        if (!photo)
            return entry;
        try {
            const withoutScheme = photo.slice("s3://".length);
            const firstSlash = withoutScheme.indexOf("/");
            if (firstSlash <= 0)
                return entry;
            const bucket = withoutScheme.slice(0, firstSlash);
            const key = withoutScheme.slice(firstSlash + 1);
            if (!key)
                return entry;
            const signedPhotoUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: downloadUrlTtlSeconds });
            return { ...entry, photoUrl: signedPhotoUrl };
        }
        catch {
            return entry;
        }
    }));
    return json(200, { entries: entriesWithSignedPhotoUrls });
}
async function upsertEntry(userId, event) {
    const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
    const payload = parseJsonBody(event);
    const parsed = validateEntry(payload);
    if (!parsed.ok)
        return json(400, { error: "Validation failed", details: parsed.error });
    const data = parsed.data;
    const id = `${userId}:${data.date}`;
    const item = {
        userId: { S: userId },
        date: { S: data.date },
        id: { S: id },
        morningWeight: { N: String(data.morningWeight) },
        lateSnack: { BOOL: data.lateSnack },
        highSodium: { BOOL: data.highSodium },
        workout: { BOOL: data.workout },
        alcohol: { BOOL: data.alcohol },
    };
    if (data.nightWeight !== undefined && data.nightWeight !== null) {
        item.nightWeight = { N: String(data.nightWeight) };
    }
    if (data.calories !== undefined)
        item.calories = { N: String(data.calories) };
    if (data.protein !== undefined)
        item.protein = { N: String(data.protein) };
    if (data.steps !== undefined)
        item.steps = { N: String(data.steps) };
    if (data.sleep !== undefined)
        item.sleep = { N: String(data.sleep) };
    const normalizedPhotoReference = normalizePhotoReference(data.photoUrl);
    if (normalizedPhotoReference)
        item.photoUrl = { S: normalizedPhotoReference };
    if (typeof data.notes === "string")
        item.notes = { S: data.notes };
    if (typeof data.activityText === "string")
        item.activityText = { S: data.activityText };
    if (typeof data.activitySummary === "string")
        item.activitySummary = { S: data.activitySummary };
    if (data.activityBurnKcal !== undefined)
        item.activityBurnKcal = { N: String(data.activityBurnKcal) };
    if (data.activityMet !== undefined)
        item.activityMet = { N: String(data.activityMet) };
    if (data.activityMinutes !== undefined)
        item.activityMinutes = { N: String(data.activityMinutes) };
    if (data.activityConfidence !== undefined)
        item.activityConfidence = { N: String(data.activityConfidence) };
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: item,
    }));
    return json(200, { entry: { ...data, id } });
}
async function deleteEntry(userId, query) {
    const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
    const date = query?.date;
    if (!isDateString(date))
        return json(400, { error: "Invalid date" });
    await ddb.send(new client_dynamodb_1.DeleteItemCommand({
        TableName: tableName,
        Key: {
            userId: { S: userId },
            date: { S: date },
        },
    }));
    return json(200, { ok: true, date });
}
async function loadSubscriptionSnapshot(userId) {
    const subsTable = process.env.SUBSCRIPTIONS_TABLE_NAME;
    if (!subsTable) {
        return { plan: "free", status: "inactive", currentPeriodEnd: null };
    }
    try {
        const subOut = await ddb.send(new client_dynamodb_1.GetItemCommand({
            TableName: subsTable,
            Key: { userId: { S: userId } },
            ConsistentRead: true,
        }));
        if (!subOut.Item) {
            return { plan: "free", status: "inactive", currentPeriodEnd: null };
        }
        const cpe = subOut.Item.currentPeriodEnd?.S?.trim();
        return {
            plan: subOut.Item.plan?.S ?? "free",
            status: subOut.Item.status?.S ?? "inactive",
            currentPeriodEnd: cpe && cpe.length > 0 ? cpe : null,
        };
    }
    catch {
        return { plan: "free", status: "inactive", currentPeriodEnd: null };
    }
}
async function getSettings(userId) {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const out = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: userId } },
    }));
    const subscription = await loadSubscriptionSnapshot(userId);
    if (!out.Item) {
        const settings = {
            userId,
            goalWeight: 72,
            startWeight: 85,
            targetDate: defaultTargetDate(),
            unit: "kg",
            tone: "friendly",
        };
        await ddb.send(new client_dynamodb_1.PutItemCommand({
            TableName: tableName,
            Item: {
                userId: { S: userId },
                goalWeight: { N: String(settings.goalWeight) },
                startWeight: { N: String(settings.startWeight) },
                targetDate: { S: settings.targetDate },
                unit: { S: settings.unit },
                tone: { S: settings.tone ?? "friendly" },
                weeklyDigestEmail: { N: "0" },
            },
        }));
        return json(200, {
            settings: {
                goalWeight: settings.goalWeight,
                startWeight: settings.startWeight,
                targetDate: settings.targetDate,
                unit: settings.unit,
                tone: settings.tone,
                plateau: undefined,
                activityCalibrationFactor: settings.activityCalibrationFactor ?? 1,
                weeklyDigestEmail: false,
            },
            subscription,
        });
    }
    return json(200, {
        settings: {
            goalWeight: Number(out.Item.goalWeight?.N ?? 72),
            startWeight: Number(out.Item.startWeight?.N ?? 85),
            targetDate: out.Item.targetDate?.S ?? defaultTargetDate(),
            unit: out.Item.unit?.S === "lbs" ? "lbs" : "kg",
            tone: out.Item.tone?.S === "clinical" ||
                out.Item.tone?.S === "tough-love" ||
                out.Item.tone?.S === "ayurvedic"
                ? out.Item.tone.S
                : "friendly",
            plateau: plateauSettingsFromItem(out.Item),
            activityCalibrationFactor: Number(out.Item.activityCalibrationFactor?.N ?? 1),
            optInForecast: Number(out.Item.optInForecast?.N ?? "0") === 1,
            forecastGeneratedAt: out.Item.forecastGeneratedAt?.S,
            forecastDisclaimerAccepted: Number(out.Item.forecastDisclaimerAccepted?.N ?? "0") === 1,
            weeklyDigestEmail: Number(out.Item.weeklyDigestEmail?.N ?? "0") === 1,
        },
        subscription,
    });
}
async function patchSettings(userId, event) {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const existingOut = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: userId } },
        ConsistentRead: true,
    }));
    const payload = parseJsonBody(event);
    const parsed = validateSettings(payload);
    if (!parsed.ok)
        return json(400, { error: "Validation failed", details: parsed.error });
    const data = parsed.data;
    const body = payload && typeof payload === "object" ? payload : {};
    const existingTone = existingOut.Item?.tone?.S === "clinical" ||
        existingOut.Item?.tone?.S === "tough-love" ||
        existingOut.Item?.tone?.S === "ayurvedic" ||
        existingOut.Item?.tone?.S === "friendly"
        ? existingOut.Item.tone.S
        : undefined;
    const tone = data.tone ?? existingTone ?? "friendly";
    const existingCalibration = Number(existingOut.Item?.activityCalibrationFactor?.N ?? 1);
    const existingOptInForecast = Number(existingOut.Item?.optInForecast?.N ?? "0") === 1;
    const existingForecastGeneratedAt = existingOut.Item?.forecastGeneratedAt?.S;
    const existingForecastDisclaimerAccepted = Number(existingOut.Item?.forecastDisclaimerAccepted?.N ?? "0") === 1;
    const existingWeeklyDigestEmail = Number(existingOut.Item?.weeklyDigestEmail?.N ?? "0") === 1;
    let nextPlateau = plateauSettingsFromItem(existingOut.Item);
    if (Object.prototype.hasOwnProperty.call(body, "plateau")) {
        const rawPlateau = body.plateau;
        if (rawPlateau === null) {
            nextPlateau = undefined;
        }
        else {
            const p = validatePlateauPatchObject(rawPlateau);
            if (!p.ok)
                return json(400, { error: "Validation failed", details: p.error });
            nextPlateau = { ...nextPlateau, ...p.data };
        }
    }
    const item = {
        userId: { S: userId },
        goalWeight: { N: String(data.goalWeight) },
        startWeight: { N: String(data.startWeight) },
        targetDate: { S: data.targetDate },
        unit: { S: data.unit },
        tone: { S: tone },
    };
    if (nextPlateau?.rollingWindowDays != null) {
        item.plateauRollingWindowDays = { N: String(Math.round(nextPlateau.rollingWindowDays)) };
    }
    if (nextPlateau?.comparisonSpanDays != null) {
        item.plateauComparisonSpanDays = { N: String(Math.round(nextPlateau.comparisonSpanDays)) };
    }
    if (nextPlateau?.maxAvgMovementKg != null) {
        item.plateauMaxMovementKg = { N: String(nextPlateau.maxAvgMovementKg) };
    }
    item.activityCalibrationFactor = { N: String(existingCalibration) };
    item.optInForecast = {
        N: (data.optInForecast ?? existingOptInForecast) ? "1" : "0",
    };
    const nextForecastGeneratedAt = data.forecastGeneratedAt ?? existingForecastGeneratedAt;
    if (typeof nextForecastGeneratedAt === "string" && nextForecastGeneratedAt.length > 0) {
        item.forecastGeneratedAt = { S: nextForecastGeneratedAt };
    }
    item.forecastDisclaimerAccepted = {
        N: (data.forecastDisclaimerAccepted ?? existingForecastDisclaimerAccepted) ? "1" : "0",
    };
    const nextWeeklyDigestEmail = data.weeklyDigestEmail ?? existingWeeklyDigestEmail;
    item.weeklyDigestEmail = { N: nextWeeklyDigestEmail ? "1" : "0" };
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: item,
    }));
    return json(200, {
        settings: {
            goalWeight: data.goalWeight,
            startWeight: data.startWeight,
            targetDate: data.targetDate,
            unit: data.unit,
            tone,
            plateau: nextPlateau,
            activityCalibrationFactor: existingCalibration,
            optInForecast: data.optInForecast ?? existingOptInForecast,
            forecastGeneratedAt: data.forecastGeneratedAt ?? existingForecastGeneratedAt,
            forecastDisclaimerAccepted: data.forecastDisclaimerAccepted ?? existingForecastDisclaimerAccepted,
            weeklyDigestEmail: nextWeeklyDigestEmail,
        },
    });
}
function parseProgressPhotoFromItem(item) {
    const photoId = item.photoId?.S;
    const userId = item.userId?.S;
    const date = item.date?.S;
    const createdAt = item.createdAt?.S;
    if (!photoId || !userId || !date || !createdAt)
        return null;
    const imageUrl = item.imageUrl?.S;
    const storageKey = item.storageKey?.S;
    const weightRaw = item.weightAtPhoto?.N;
    const weightAtPhoto = weightRaw != null ? Number(weightRaw) : undefined;
    return {
        photoId,
        userId,
        date,
        imageUrl: imageUrl || undefined,
        storageKey: storageKey || undefined,
        weightAtPhoto: Number.isFinite(weightAtPhoto ?? NaN) ? weightAtPhoto : undefined,
        createdAt,
    };
}
async function listProgressPhotos(userId) {
    const table = getRequiredEnv("PROGRESS_PHOTOS_TABLE_NAME", progressPhotosTableName);
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: table,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": { S: userId } },
        ConsistentRead: true,
    }));
    const items = (out.Items ?? [])
        .map((item) => parseProgressPhotoFromItem(item))
        .filter((row) => row !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
    return json(200, { items });
}
async function createProgressPhoto(userId, event) {
    const table = getRequiredEnv("PROGRESS_PHOTOS_TABLE_NAME", progressPhotosTableName);
    const payload = parseJsonBody(event);
    const body = payload && typeof payload === "object" ? payload : {};
    const date = isDateString(body.date) ? body.date : undefined;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const storageKey = typeof body.storageKey === "string" ? body.storageKey.trim() : "";
    const weightAtPhoto = body.weightAtPhoto === undefined ? undefined : Number(body.weightAtPhoto);
    if (!date)
        return json(400, { error: "Invalid date" });
    if (!imageUrl && !storageKey)
        return json(400, { error: "Missing imageUrl or storageKey" });
    if (weightAtPhoto !== undefined &&
        (!Number.isFinite(weightAtPhoto) || weightAtPhoto <= 0 || weightAtPhoto > 1000)) {
        return json(400, { error: "Invalid weightAtPhoto" });
    }
    const photoId = (0, node_crypto_1.randomUUID)();
    const createdAt = new Date().toISOString();
    const item = {
        userId: { S: userId },
        photoId: { S: photoId },
        date: { S: date },
        createdAt: { S: createdAt },
    };
    if (imageUrl)
        item.imageUrl = { S: imageUrl };
    if (storageKey)
        item.storageKey = { S: storageKey };
    if (weightAtPhoto !== undefined)
        item.weightAtPhoto = { N: String(weightAtPhoto) };
    await ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: table, Item: item }));
    return json(200, {
        item: {
            photoId,
            userId,
            date,
            imageUrl: imageUrl || undefined,
            storageKey: storageKey || undefined,
            weightAtPhoto,
            createdAt,
        },
    });
}
async function deleteProgressPhoto(userId, photoId) {
    const table = getRequiredEnv("PROGRESS_PHOTOS_TABLE_NAME", progressPhotosTableName);
    await ddb.send(new client_dynamodb_1.DeleteItemCommand({
        TableName: table,
        Key: {
            userId: { S: userId },
            photoId: { S: photoId },
        },
    }));
    return json(200, { ok: true });
}
function extractFirstJsonObject(raw) {
    const text = raw.trim();
    const start = text.indexOf("{");
    if (start < 0)
        return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i += 1) {
        const c = text[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (c === "\\" && inString) {
            escape = true;
            continue;
        }
        if (c === "\"") {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (c === "{")
                depth += 1;
            if (c === "}") {
                depth -= 1;
                if (depth === 0)
                    return text.slice(start, i + 1);
            }
        }
    }
    return null;
}
function parseBodyCompareAssessment(raw) {
    const jsonText = extractFirstJsonObject(raw);
    if (!jsonText)
        return null;
    try {
        const parsed = JSON.parse(jsonText);
        const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
        const confidence = Number(parsed.confidence);
        const disclaimer = typeof parsed.disclaimer === "string" ? parsed.disclaimer.trim() : "";
        if (!summary || !Number.isFinite(confidence) || !disclaimer)
            return null;
        const highlightsRaw = Array.isArray(parsed.highlights) ? parsed.highlights : [];
        const highlights = highlightsRaw
            .map((entry) => {
            const e = entry;
            const area = typeof e.area === "string" ? e.area.trim() : "";
            const assessment = typeof e.assessment === "string" ? e.assessment.trim() : "";
            const directionRaw = typeof e.direction === "string" ? e.direction : "uncertain";
            const direction = directionRaw === "leaner" || directionRaw === "unchanged" || directionRaw === "uncertain"
                ? directionRaw
                : "uncertain";
            if (!area || !assessment)
                return null;
            return { area, assessment, direction };
        })
            .filter((v) => v !== null);
        return {
            summary,
            confidence: Math.max(0, Math.min(100, Math.round(confidence))),
            estimated: true,
            disclaimer,
            highlights,
        };
    }
    catch {
        return null;
    }
}
async function assessProgressPhotos(userId, event) {
    if (!isBodyCompareAiEnabledLambda()) {
        return json(403, { error: "AI photo compare is disabled." });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
        return json(503, { error: "AI compare is not configured." });
    const raw = parseJsonBody(event);
    if (!raw || typeof raw !== "object")
        return json(400, { error: "Invalid body" });
    const body = raw;
    const photosRaw = Array.isArray(body.photos) ? body.photos : [];
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const photos = [];
    for (const raw of photosRaw) {
        const p = raw;
        const date = typeof p.date === "string" ? p.date : "";
        const photoUrl = typeof p.photoUrl === "string" ? p.photoUrl.trim() : "";
        const imageBase64 = typeof p.imageBase64 === "string" ? p.imageBase64.replace(/\s/g, "") : "";
        const mediaType = typeof p.mediaType === "string" ? p.mediaType.trim().toLowerCase() : "";
        if (!isDateString(date))
            continue;
        if (photoUrl) {
            photos.push({ date, photoUrl, imageBase64: "", mediaType: "" });
        }
        else if (imageBase64 &&
            (mediaType === "image/jpeg" ||
                mediaType === "image/png" ||
                mediaType === "image/gif" ||
                mediaType === "image/webp")) {
            photos.push({ date, photoUrl: "", imageBase64, mediaType });
        }
    }
    if (photos.length < 2) {
        return json(400, { error: "At least two photos are required." });
    }
    const selected = photos.slice(0, 8).sort((a, b) => a.date.localeCompare(b.date));
    const content = [];
    for (const p of selected) {
        let buf;
        let mediaType;
        if (p.photoUrl) {
            const normalized = normalizePhotoReference(p.photoUrl);
            if (!normalized)
                return json(400, { error: "Invalid photo reference." });
            const ref = (0, s3Uri_1.parseS3Uri)(normalized);
            if (!ref)
                return json(400, { error: "Only s3:// photo references are supported." });
            if (!photoBucketName || ref.bucket !== photoBucketName) {
                return json(400, { error: "Invalid photo bucket." });
            }
            if (!(0, s3Uri_1.s3KeyAllowedForUser)(ref.key, userId)) {
                return json(403, { error: "Photo does not belong to this user." });
            }
            let bytes;
            let contentType;
            try {
                const out = await s3.send(new client_s3_1.GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
                bytes = await out.Body?.transformToByteArray();
                contentType = out.ContentType;
            }
            catch {
                return json(400, { error: "Could not read one of the photos." });
            }
            if (!bytes || bytes.length === 0)
                return json(400, { error: "Empty photo found." });
            buf = Buffer.from(bytes);
            if (bytes.length > 12 * 1024 * 1024)
                return json(400, { error: "A photo is too large." });
            if ((0, s3Uri_1.isUnsupportedFoodImageFormat)(ref.key, contentType) || (0, s3Uri_1.bufferLooksLikeHeicOrHeif)(buf)) {
                return json(400, { error: "HEIC/HEIF images are not supported. Use JPEG/PNG/WebP." });
            }
            mediaType = (0, s3Uri_1.guessFoodImageMediaType)(ref.key, contentType);
        }
        else {
            let decoded;
            try {
                decoded = Buffer.from(p.imageBase64, "base64");
            }
            catch {
                return json(400, { error: "Invalid inline photo encoding." });
            }
            if (decoded.length === 0 || decoded.length > 12 * 1024 * 1024) {
                return json(400, { error: "Inline photo empty or too large." });
            }
            if ((0, s3Uri_1.bufferLooksLikeHeicOrHeif)(decoded)) {
                return json(400, { error: "HEIC/HEIF images are not supported. Use JPEG/PNG/WebP." });
            }
            buf = decoded;
            mediaType = p.mediaType;
        }
        content.push({ type: "text", text: `Photo date: ${p.date}` });
        content.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
        });
    }
    const system = `You are an assistant for a fitness app. Compare user progress photos and provide a careful ESTIMATE only.
Rules:
- Do NOT provide diagnosis, disease claims, or medical advice.
- If angle, lighting, clothing, or posture differ, explicitly mention uncertainty.
- Focus on visible trend cues only (midsection, waistline, face fullness, posture consistency).
- Return ONLY JSON:
{
  "summary": "2-4 sentence plain-language estimate",
  "confidence": 0-100,
  "disclaimer": "One sentence: estimate only, not medical advice.",
  "highlights": [
    { "area": "string", "assessment": "string", "direction": "leaner|unchanged|uncertain" }
  ]
}`;
    const model = process.env.ANTHROPIC_BODY_COMPARE_MODEL?.trim() || "claude-sonnet-4-20250514";
    try {
        const Anthropic = (await Promise.resolve().then(() => __importStar(require("@anthropic-ai/sdk")))).default;
        const client = new Anthropic({ apiKey });
        const resp = await client.messages.create({
            model,
            max_tokens: 700,
            temperature: 0.2,
            system,
            messages: [
                {
                    role: "user",
                    content: [
                        ...content,
                        {
                            type: "text",
                            text: query ||
                                "Compare these photos from oldest to newest and summarize visible change trends and uncertainty.",
                        },
                    ],
                },
            ],
        });
        const text = resp.content.find((p) => p.type === "text")?.text ?? "";
        const parsed = parseBodyCompareAssessment(text);
        if (!parsed)
            return json(502, { error: "Could not parse AI compare result." });
        return json(200, {
            ...parsed,
            timeframe: { from: selected[0]?.date, to: selected[selected.length - 1]?.date },
        });
    }
    catch (e) {
        console.error(JSON.stringify({ msg: "progress_photo_assessment_failed", err: String(e) }));
        return json(502, { error: "AI compare failed. Please try again." });
    }
}
async function createUploadUrl(userId, event) {
    const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
    const payload = parseJsonBody(event);
    const body = payload && typeof payload === "object" ? payload : {};
    const contentType = typeof body.contentType === "string" && body.contentType.length > 0
        ? body.contentType
        : "application/octet-stream";
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const extFromFileName = fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "";
    const extFromBody = typeof body.extension === "string" && /^[a-zA-Z0-9]+$/.test(body.extension)
        ? body.extension.toLowerCase()
        : "";
    const extension = extFromFileName && /^[a-z0-9]+$/.test(extFromFileName)
        ? extFromFileName
        : extFromBody && /^[a-z0-9]+$/.test(extFromBody)
            ? extFromBody
            : "jpg";
    const date = isDateString(body.date) ? body.date : new Date().toISOString().slice(0, 10);
    const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
    const key = kind === "food"
        ? `${userId}/food/${date}/${Date.now()}.${extension}`
        : `${userId}/${date}/${Date.now()}.${extension}`;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: uploadUrlTtlSeconds });
    return json(200, {
        uploadUrl,
        key,
        photoUrl: `s3://${bucket}/${key}`,
        expiresIn: uploadUrlTtlSeconds,
    });
}
async function getStats() {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const [usersOut, viewsOut] = await Promise.all([
        ddb.send(new client_dynamodb_1.ScanCommand({
            TableName: tableName,
            Select: "COUNT",
            FilterExpression: "#uid <> :metaUserId AND attribute_exists(goalWeight)",
            ExpressionAttributeNames: { "#uid": "userId" },
            ExpressionAttributeValues: { ":metaUserId": { S: analyticsMetaUserId } },
        })),
        ddb.send(new client_dynamodb_1.GetItemCommand({
            TableName: tableName,
            Key: { userId: { S: analyticsMetaUserId } },
        })),
    ]);
    return json(200, {
        users: Number(usersOut.Count ?? 0),
        pageViews: Number(viewsOut.Item?.pageViews?.N ?? 0),
    });
}
async function listCognitoUsersForAdmin() {
    const poolId = getRequiredEnv("USER_POOL_ID", userPoolIdEnv);
    const users = [];
    let paginationToken;
    do {
        const out = await cognitoIdp.send(new client_cognito_identity_provider_1.ListUsersCommand({
            UserPoolId: poolId,
            Limit: 60,
            PaginationToken: paginationToken,
        }));
        for (const u of out.Users ?? []) {
            const attrs = {};
            for (const a of u.Attributes ?? []) {
                if (a.Name && a.Value)
                    attrs[a.Name] = a.Value;
            }
            const fullName = attrs.name;
            const given = attrs.given_name;
            const firstName = given ?? (fullName ? fullName.trim().split(/\s+/)[0] : undefined);
            users.push({
                sub: attrs.sub ?? u.Username ?? "",
                email: attrs.email,
                firstName,
                fullName,
                status: u.UserStatus,
            });
        }
        paginationToken = out.PaginationToken;
    } while (paginationToken);
    return json(200, { count: users.length, users });
}
async function incrementPageView() {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const out = await ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: tableName,
        Key: { userId: { S: analyticsMetaUserId } },
        UpdateExpression: "ADD pageViews :inc SET updatedAt = :updatedAt",
        ExpressionAttributeValues: {
            ":inc": { N: "1" },
            ":updatedAt": { S: new Date().toISOString() },
        },
        ReturnValues: "UPDATED_NEW",
    }));
    return json(200, {
        pageViews: Number(out.Attributes?.pageViews?.N ?? 0),
    });
}
async function getFeatureFlagsForUser(userId) {
    const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": { S: userId } },
        ConsistentRead: true,
    }));
    const fromDb = (out.Items ?? []).reduce((acc, item) => {
        const flag = item.flag?.S;
        const enabledRaw = item.enabled?.BOOL;
        if (typeof flag === "string" && typeof enabledRaw === "boolean") {
            acc[flag] = enabledRaw;
        }
        return acc;
    }, {});
    const serverDefaults = {};
    const photoFood = envFlagTriState("FF_PHOTO_FOOD_LOG");
    serverDefaults.FF_PHOTO_FOOD_LOG = photoFood !== false;
    const mealLibrary = envFlagTriState("FF_MEAL_LIBRARY");
    serverDefaults.FF_MEAL_LIBRARY = mealLibrary !== false;
    const nlMealParse = envFlagTriState("FF_NL_MEAL_PARSE");
    serverDefaults.FF_NL_MEAL_PARSE = nlMealParse !== false;
    const bodyCompareAi = envFlagTriState("FF_BODY_COMPARE_AI");
    serverDefaults.FF_BODY_COMPARE_AI = bodyCompareAi !== false;
    const personalizedCoaching = envFlagTriState("FF_PERSONALIZED_AI_COACHING");
    serverDefaults.FF_PERSONALIZED_AI_COACHING = personalizedCoaching !== false;
    const overrides = { ...serverDefaults, ...fromDb };
    return json(200, { userId, overrides });
}
async function listFeatureFlagOverrides(event) {
    const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
    const targetUserId = event.queryStringParameters?.userId;
    if (!targetUserId) {
        return json(400, { error: "Missing userId query parameter" });
    }
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": { S: targetUserId } },
        ConsistentRead: true,
    }));
    const overrides = (out.Items ?? []).map((item) => ({
        userId: item.userId?.S ?? targetUserId,
        flag: item.flag?.S ?? "",
        enabled: item.enabled?.BOOL ?? false,
        ts: item.ts?.S ?? "",
    }));
    return json(200, { overrides });
}
async function upsertFeatureFlagOverride(event) {
    const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
    const payload = parseJsonBody(event);
    if (!payload || typeof payload !== "object")
        return json(400, { error: "Body must be an object" });
    const body = payload;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const rawFlag = typeof body.flag === "string" ? body.flag.trim() : "";
    const enabled = typeof body.enabled === "boolean" ? body.enabled : null;
    if (!userId || !rawFlag || enabled === null) {
        return json(400, { error: "Invalid payload. Expected userId, flag, enabled." });
    }
    const normalizedFlag = rawFlag.startsWith("FF_") ? rawFlag : `FF_${rawFlag}`;
    const ts = new Date().toISOString();
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: {
            userId: { S: userId },
            flag: { S: normalizedFlag },
            enabled: { BOOL: enabled },
            ts: { S: ts },
        },
    }));
    return json(200, { ok: true, override: { userId, flag: normalizedFlag, enabled, ts } });
}
async function handler(event) {
    try {
        await (0, lambdaApiKeyFromSecrets_1.ensureAnthropicApiKeyFromSecrets)();
        const userId = getUserId(event);
        if (!userId)
            return json(401, { error: "Unauthorized" });
        const method = event.requestContext?.http?.method;
        if (event.rawPath === "/entries") {
            if (method === "GET") {
                return getEntries(userId, event.queryStringParameters);
            }
            if (method === "PUT") {
                return upsertEntry(userId, event);
            }
            if (method === "DELETE") {
                return deleteEntry(userId, event.queryStringParameters);
            }
        }
        if (event.rawPath === "/settings") {
            if (method === "GET") {
                return getSettings(userId);
            }
            if (method === "PATCH") {
                return patchSettings(userId, event);
            }
        }
        if (event.rawPath === "/v2/billing/checkout-session" && method === "POST") {
            return (0, billing_api_1.handleBillingCheckoutSession)(userId, event);
        }
        if (event.rawPath === "/v2/billing/portal" && method === "POST") {
            return (0, billing_api_1.handleBillingPortalSession)(userId);
        }
        if (event.rawPath === "/v2/weekly-report/send-email" && method === "POST") {
            return (0, weekly_report_email_send_1.handlePostV2WeeklyReportSendEmail)(bearerAccessToken(event), event, json);
        }
        if (event.rawPath === "/stats" && method === "GET") {
            return getStats();
        }
        if (event.rawPath === "/metrics/page-view" && method === "POST") {
            return incrementPageView();
        }
        if (event.rawPath === "/photos/upload-url" && method === "POST") {
            return createUploadUrl(userId, event);
        }
        if (event.rawPath === "/v2/insights" && method === "GET") {
            return getInsightsV2(userId, event);
        }
        if (event.rawPath === "/v2/insights/feedback" && method === "POST") {
            return saveInsightFeedback(userId, event);
        }
        if (event.rawPath === "/v2/food/estimate" && method === "POST") {
            const table = foodLogEntriesTableName;
            const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
            if (!table)
                return json(500, { error: "Food log storage is not configured." });
            return (0, food_log_api_1.handleV2FoodEstimate)(userId, event, {
                ddb,
                s3,
                foodLogTableName: table,
                photoBucketName: bucket,
            });
        }
        if (event.rawPath === "/v2/food/log-confirm" && method === "POST") {
            const table = foodLogEntriesTableName;
            if (!table)
                return json(500, { error: "Food log storage is not configured." });
            return (0, food_log_api_1.handleV2FoodLogConfirm)(userId, event, { ddb, foodLogTableName: table });
        }
        if (event.rawPath === "/v2/activity/estimate-burn" && method === "POST") {
            return (0, activity_api_1.handleV2ActivityEstimateBurn)(event);
        }
        if (event.rawPath === "/v2/voice-daily-log/parse" && method === "POST") {
            let payload;
            try {
                payload = parseJsonBody(event);
            }
            catch {
                return json(400, { error: "Invalid JSON" });
            }
            const body = payload && typeof payload === "object" ? payload : {};
            const transcript = typeof body.transcript === "string" ? body.transcript : "";
            if (!transcript.trim()) {
                return json(400, { error: "transcript required" });
            }
            const result = await (0, parseTranscript_1.parseVoiceDailyTranscriptWithAnthropic)(transcript);
            if (!result.ok) {
                const status = result.error === "no_api_key" || result.error === "voice_parse_timeout" ? 503 : 422;
                return json(status, { ok: false, error: result.error });
            }
            return json(200, { ok: true, parsed: result.parsed });
        }
        if (event.rawPath === "/v2/activity/log" && method === "POST") {
            const table = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
            return (0, activity_api_1.handleV2ActivityLog)(userId, event, { ddb, entriesTableName: table });
        }
        if (event.rawPath === "/v2/activity/calibration" && method === "PATCH") {
            const table = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
            return (0, activity_api_1.handleV2ActivityCalibrationPatch)(userId, event, { ddb, settingsTableName: table });
        }
        if (event.rawPath === "/v2/activity/energy-weekly-summary" && method === "GET") {
            const eT = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
            const dT = getRequiredEnv("DAY_MEAL_ENTRIES_TABLE_NAME", dayMealEntriesTableName);
            const sT = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
            return (0, activity_api_1.handleV2EnergyWeeklySummary)(userId, event, {
                ddb,
                entriesTableName: eT,
                dayMealsTableName: dT,
                settingsTableName: sT,
            });
        }
        if (event.rawPath === "/v2/progress-photos" && method === "GET") {
            return listProgressPhotos(userId);
        }
        if (event.rawPath === "/v2/progress-photos" && method === "POST") {
            return createProgressPhoto(userId, event);
        }
        if (event.rawPath === "/v2/progress-photos/assessment" && method === "POST") {
            return assessProgressPhotos(userId, event);
        }
        const progressDelMatch = event.rawPath.match(/^\/v2\/progress-photos\/([^/]+)$/);
        if (progressDelMatch && method === "DELETE") {
            return deleteProgressPhoto(userId, decodeURIComponent(progressDelMatch[1] ?? ""));
        }
        if (event.rawPath === "/v2/food/meal-complete" && method === "POST") {
            const foodT = foodLogEntriesTableName;
            const mT = mealsTableName;
            const dT = dayMealEntriesTableName;
            if (!foodT || !mT || !dT) {
                return json(500, { error: "Meal library storage is not configured." });
            }
            return (0, meals_api_1.handleV2FoodMealComplete)(userId, event, {
                ddb,
                foodLogTableName: foodT,
                mealsTableName: mT,
                dayMealsTableName: dT,
            });
        }
        if (event.rawPath === "/v2/meals/suggest-match" && method === "GET") {
            const mT = mealsTableName;
            if (!mT)
                return json(500, { error: "Meals storage is not configured." });
            return (0, meals_api_1.handleV2MealsSuggestMatch)(userId, event, { ddb, mealsTableName: mT });
        }
        if (event.rawPath === "/v2/meals" && method === "GET") {
            const mT = mealsTableName;
            if (!mT)
                return json(500, { error: "Meals storage is not configured." });
            return (0, meals_api_1.handleV2MealsList)(userId, event, { ddb, mealsTableName: mT });
        }
        if (event.rawPath === "/v2/meals" && method === "POST") {
            const mT = mealsTableName;
            if (!mT)
                return json(500, { error: "Meals storage is not configured." });
            return (0, meals_api_1.handleV2MealsCreate)(userId, event, { ddb, mealsTableName: mT });
        }
        const mealHistoryMatch = event.rawPath.match(/^\/v2\/meals\/([^/]+)\/history$/);
        if (mealHistoryMatch && method === "GET") {
            const dT = dayMealEntriesTableName;
            if (!dT)
                return json(500, { error: "Day meal entries storage is not configured." });
            return (0, meals_api_1.handleV2MealsHistory)(userId, mealHistoryMatch[1], { ddb, dayMealsTableName: dT });
        }
        const mealPatchDel = event.rawPath.match(/^\/v2\/meals\/([^/]+)$/);
        if (mealPatchDel && mealPatchDel[1] !== "suggest-match" && method === "PATCH") {
            const mT = mealsTableName;
            if (!mT)
                return json(500, { error: "Meals storage is not configured." });
            return (0, meals_api_1.handleV2MealsPatch)(userId, mealPatchDel[1], event, { ddb, mealsTableName: mT });
        }
        if (mealPatchDel && mealPatchDel[1] !== "suggest-match" && method === "DELETE") {
            const mT = mealsTableName;
            if (!mT)
                return json(500, { error: "Meals storage is not configured." });
            return (0, meals_api_1.handleV2MealsDelete)(userId, mealPatchDel[1], { ddb, mealsTableName: mT });
        }
        const dayMealListOrCreate = event.rawPath.match(/^\/v2\/days\/([\d-]+)\/meal-entries$/);
        if (dayMealListOrCreate && method === "GET") {
            const dT = dayMealEntriesTableName;
            if (!dT)
                return json(500, { error: "Day meal entries storage is not configured." });
            return (0, meals_api_1.handleV2DayMealEntriesList)(userId, dayMealListOrCreate[1], { ddb, dayMealsTableName: dT });
        }
        if (dayMealListOrCreate && method === "POST") {
            const dT = dayMealEntriesTableName;
            const mT = mealsTableName;
            if (!dT || !mT)
                return json(500, { error: "Meal library storage is not configured." });
            return (0, meals_api_1.handleV2DayMealEntriesCreate)(userId, dayMealListOrCreate[1], event, {
                ddb,
                dayMealsTableName: dT,
                mealsTableName: mT,
            });
        }
        const dayMealDel = event.rawPath.match(/^\/v2\/days\/([\d-]+)\/meal-entries\/([^/]+)$/);
        if (dayMealDel && method === "DELETE") {
            const dT = dayMealEntriesTableName;
            if (!dT)
                return json(500, { error: "Day meal entries storage is not configured." });
            return (0, meals_api_1.handleV2DayMealEntryDelete)(userId, dayMealDel[1], dayMealDel[2], { ddb, dayMealsTableName: dT });
        }
        if (event.rawPath === "/admin/users" && method === "GET") {
            if (!(await isAdminAllowed(event))) {
                return json(403, { error: "Forbidden" });
            }
            return listCognitoUsersForAdmin();
        }
        if (event.rawPath === "/feature-flags" && method === "GET") {
            return getFeatureFlagsForUser(userId);
        }
        if (event.rawPath === "/admin/flags" && method === "GET") {
            if (!(await isAdminAllowed(event)))
                return json(403, { error: "Forbidden" });
            return listFeatureFlagOverrides(event);
        }
        if (event.rawPath === "/admin/flags" && method === "PUT") {
            if (!(await isAdminAllowed(event)))
                return json(403, { error: "Forbidden" });
            return upsertFeatureFlagOverride(event);
        }
        return json(404, { error: "Not Found" });
    }
    catch (error) {
        if (error instanceof Error && error.message === "Invalid JSON") {
            return json(400, { error: "Invalid JSON" });
        }
        console.error("Lambda handler error", error);
        return json(500, { error: "Internal Server Error" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE0d0RBLDBCQWtQQztBQTkvREQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZDQUF5QztBQUN6QyxtREFNaUM7QUFFakMsdURBQStFO0FBQy9FLHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsaURBS3dCO0FBQ3hCLDJDQVdxQjtBQUNyQiw0RkFBa0c7QUFDbEcsZ0ZBQW9HO0FBQ3BHLCtDQUF5RjtBQUN6Rix5RUFBK0U7QUFFL0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLGdFQUE2QixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXpELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUN4RCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7QUFDMUQsTUFBTSx3QkFBd0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3pFLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztBQUNwRixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDO0FBQ3RELE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN4RSxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDO0FB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QyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUM3RSxPQUFPLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssY0FBYyxJQUFJLE1BQU0sS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUN6RCxJQUFJLENBQUMsQ0FBQyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUM3RSxPQUFPLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLElBQUksS0FBSyxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQy9ELE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdDLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCxcbiAgR2V0VXNlckNvbW1hbmQsXG4gIExpc3RVc2Vyc0NvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtY29nbml0by1pZGVudGl0eS1wcm92aWRlclwiO1xuaW1wb3J0IHtcbiAgRHluYW1vREJDbGllbnQsXG4gIERlbGV0ZUl0ZW1Db21tYW5kLFxuICBHZXRJdGVtQ29tbWFuZCxcbiAgUHV0SXRlbUNvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbiAgU2NhbkNvbW1hbmQsXG4gIFVwZGF0ZUl0ZW1Db21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtczNcIjtcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gXCJAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lclwiO1xuaW1wb3J0IHsgcmFuZG9tVVVJRCB9IGZyb20gXCJub2RlOmNyeXB0b1wiO1xuaW1wb3J0IHtcbiAgYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZixcbiAgZ3Vlc3NGb29kSW1hZ2VNZWRpYVR5cGUsXG4gIGlzVW5zdXBwb3J0ZWRGb29kSW1hZ2VGb3JtYXQsXG4gIHBhcnNlUzNVcmksXG4gIHMzS2V5QWxsb3dlZEZvclVzZXIsXG59IGZyb20gXCIuLi8uLi8uLi9saWIvZm9vZC9zM1VyaVwiO1xuaW1wb3J0IHR5cGUgeyBBaUluc2lnaHRTdHJ1Y3R1cmVkIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9pbnNpZ2h0cy9haUluc2lnaHRTdHJ1Y3R1cmVkXCI7XG5pbXBvcnQgeyBidWlsZFBlcnNvbmFsaXplZENvYWNoaW5nUGF5bG9hZCB9IGZyb20gXCIuLi8uLi8uLi9saWIvYWlOdWRnZXMvaW5kZXhcIjtcbmltcG9ydCB7IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZCB9IGZyb20gXCIuL2luc2lnaHRzLWFpLWNhcmRcIjtcbmltcG9ydCB7IGhhbmRsZVYyRm9vZEVzdGltYXRlLCBoYW5kbGVWMkZvb2RMb2dDb25maXJtIH0gZnJvbSBcIi4vZm9vZC1sb2ctYXBpXCI7XG5pbXBvcnQge1xuICBoYW5kbGVWMkFjdGl2aXR5Q2FsaWJyYXRpb25QYXRjaCxcbiAgaGFuZGxlVjJBY3Rpdml0eUVzdGltYXRlQnVybixcbiAgaGFuZGxlVjJBY3Rpdml0eUxvZyxcbiAgaGFuZGxlVjJFbmVyZ3lXZWVrbHlTdW1tYXJ5LFxufSBmcm9tIFwiLi9hY3Rpdml0eS1hcGlcIjtcbmltcG9ydCB7XG4gIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNDcmVhdGUsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNMaXN0LFxuICBoYW5kbGVWMkRheU1lYWxFbnRyeURlbGV0ZSxcbiAgaGFuZGxlVjJGb29kTWVhbENvbXBsZXRlLFxuICBoYW5kbGVWMk1lYWxzQ3JlYXRlLFxuICBoYW5kbGVWMk1lYWxzRGVsZXRlLFxuICBoYW5kbGVWMk1lYWxzSGlzdG9yeSxcbiAgaGFuZGxlVjJNZWFsc0xpc3QsXG4gIGhhbmRsZVYyTWVhbHNQYXRjaCxcbiAgaGFuZGxlVjJNZWFsc1N1Z2dlc3RNYXRjaCxcbn0gZnJvbSBcIi4vbWVhbHMtYXBpXCI7XG5pbXBvcnQgeyBlbnN1cmVBbnRocm9waWNBcGlLZXlGcm9tU2VjcmV0cyB9IGZyb20gXCIuLi8uLi8uLi9saWIvYW50aHJvcGljL2xhbWJkYUFwaUtleUZyb21TZWNyZXRzXCI7XG5pbXBvcnQgeyBwYXJzZVZvaWNlRGFpbHlUcmFuc2NyaXB0V2l0aEFudGhyb3BpYyB9IGZyb20gXCIuLi8uLi8uLi9saWIvdm9pY2VEYWlseUxvZy9wYXJzZVRyYW5zY3JpcHRcIjtcbmltcG9ydCB7IGhhbmRsZUJpbGxpbmdDaGVja291dFNlc3Npb24sIGhhbmRsZUJpbGxpbmdQb3J0YWxTZXNzaW9uIH0gZnJvbSBcIi4vYmlsbGluZy1hcGlcIjtcbmltcG9ydCB7IGhhbmRsZVBvc3RWMldlZWtseVJlcG9ydFNlbmRFbWFpbCB9IGZyb20gXCIuL3dlZWtseS1yZXBvcnQtZW1haWwtc2VuZFwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgY29nbml0b0lkcCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5cbmNvbnN0IGVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBzZXR0aW5nc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlNFVFRJTkdTX1RBQkxFX05BTUU7XG5jb25zdCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5JTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU7XG5jb25zdCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTtcbmNvbnN0IHBob3RvQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlBIT1RPX0JVQ0tFVF9OQU1FO1xuY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GT09EX0xPR19FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBtZWFsc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52Lk1FQUxTX1RBQkxFX05BTUU7XG5jb25zdCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHByb2dyZXNzUGhvdG9zVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUU7XG5jb25zdCB1cGxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LlVQTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCI5MDBcIik7XG5jb25zdCBkb3dubG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiMzYwMFwiKTtcbmNvbnN0IGFuYWx5dGljc01ldGFVc2VySWQgPSBcIl9fbWV0YV9fXCI7XG5jb25zdCB1c2VyUG9vbElkRW52ID0gcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEO1xuXG50eXBlIENsYWltcyA9IHtcbiAgc3ViOiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247XG59O1xuXG50eXBlIEh0dHBFdmVudCA9IHtcbiAgcmF3UGF0aDogc3RyaW5nO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcbiAgcmVxdWVzdENvbnRleHQ/OiB7XG4gICAgYXV0aG9yaXplcj86IHtcbiAgICAgIGp3dD86IHtcbiAgICAgICAgY2xhaW1zPzogQ2xhaW1zO1xuICAgICAgfTtcbiAgICB9O1xuICB9O1xuICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbDtcbiAgYm9keT86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIGJvZHk6IHN0cmluZztcbn07XG5cbnR5cGUgRGFpbHlFbnRyeVVwc2VydCA9IHtcbiAgZGF0ZTogc3RyaW5nO1xuICBtb3JuaW5nV2VpZ2h0OiBudW1iZXI7XG4gIG5pZ2h0V2VpZ2h0PzogbnVtYmVyIHwgbnVsbDtcbiAgY2Fsb3JpZXM/OiBudW1iZXI7XG4gIHByb3RlaW4/OiBudW1iZXI7XG4gIHN0ZXBzPzogbnVtYmVyO1xuICBzbGVlcD86IG51bWJlcjtcbiAgbGF0ZVNuYWNrOiBib29sZWFuO1xuICBoaWdoU29kaXVtOiBib29sZWFuO1xuICB3b3Jrb3V0OiBib29sZWFuO1xuICBhbGNvaG9sOiBib29sZWFuO1xuICBwaG90b1VybD86IHN0cmluZyB8IG51bGw7XG4gIG5vdGVzPzogc3RyaW5nIHwgbnVsbDtcbiAgYWN0aXZpdHlUZXh0Pzogc3RyaW5nO1xuICBhY3Rpdml0eVN1bW1hcnk/OiBzdHJpbmc7XG4gIGFjdGl2aXR5QnVybktjYWw/OiBudW1iZXI7XG4gIGFjdGl2aXR5TWV0PzogbnVtYmVyO1xuICBhY3Rpdml0eU1pbnV0ZXM/OiBudW1iZXI7XG4gIGFjdGl2aXR5Q29uZmlkZW5jZT86IG51bWJlcjtcbn07XG5cbnR5cGUgU2V0dGluZ3NQYXRjaCA9IHtcbiAgZ29hbFdlaWdodDogbnVtYmVyO1xuICBzdGFydFdlaWdodDogbnVtYmVyO1xuICB0YXJnZXREYXRlOiBzdHJpbmc7XG4gIHVuaXQ6IFwia2dcIiB8IFwibGJzXCI7XG4gIHRvbmU/OiBcImZyaWVuZGx5XCIgfCBcImNsaW5pY2FsXCIgfCBcInRvdWdoLWxvdmVcIiB8IFwiYXl1cnZlZGljXCI7XG4gIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/OiBudW1iZXI7XG4gIG9wdEluRm9yZWNhc3Q/OiBib29sZWFuO1xuICBmb3JlY2FzdEdlbmVyYXRlZEF0Pzogc3RyaW5nO1xuICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZD86IGJvb2xlYW47XG4gIHdlZWtseURpZ2VzdEVtYWlsPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7XG4gIHJvbGxpbmdXaW5kb3dEYXlzPzogbnVtYmVyO1xuICBjb21wYXJpc29uU3BhbkRheXM/OiBudW1iZXI7XG4gIG1heEF2Z01vdmVtZW50S2c/OiBudW1iZXI7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xuICBhY3Rpb246IHN0cmluZztcbiAgY2F0ZWdvcnk6IFwic29kaXVtXCIgfCBcImFsY29ob2xcIiB8IFwibGF0ZV9zbmFja1wiIHwgXCJ3b3Jrb3V0XCIgfCBcInBsYXRlYXVcIiB8IFwic3RyZWFrXCIgfCBcInRyYWplY3RvcnlcIjtcbiAgZ2VuZXJhdGlvblNvdXJjZT86IFwibGxtXCIgfCBcInJ1bGVzXCI7XG4gIGdlbmVyYXRlZEF0Pzogc3RyaW5nO1xuICBzdHJ1Y3R1cmVkPzogQWlJbnNpZ2h0U3RydWN0dXJlZDtcbiAgZGVncmFkZWQ/OiBib29sZWFuO1xufTtcblxuLyoqIENPUlMgb24gZXZlcnkgSlNPTiByZXNwb25zZSBzbyBicm93c2VycyBjYW4gcmVhZCBib2RpZXMgb24gZXJyb3JzIChBUEktbGV2ZWwgQ09SUyBhbG9uZSBjYW4gbWlzcyBlZGdlIGNhc2VzKS4gKi9cbmNvbnN0IEpTT05fQ09SU19IRUFERVJTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb247IGNoYXJzZXQ9dXRmLThcIixcbiAgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1vcmlnaW5cIjogXCIqXCIsXG4gIFwiYWNjZXNzLWNvbnRyb2wtYWxsb3ctaGVhZGVyc1wiOiBcImF1dGhvcml6YXRpb24sY29udGVudC10eXBlLHgtY29nbml0by1hY2Nlc3MtdG9rZW5cIixcbiAgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1tZXRob2RzXCI6IFwiR0VULFBVVCxQT1NULFBBVENILERFTEVURSxPUFRJT05TXCIsXG59O1xuXG5mdW5jdGlvbiBqc29uKHN0YXR1c0NvZGU6IG51bWJlciwgcGF5bG9hZDogdW5rbm93bik6IEh0dHBSZXN1bHQge1xuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGUsXG4gICAgaGVhZGVyczogSlNPTl9DT1JTX0hFQURFUlMsXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVpcmVkRW52KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52IHZhciAke25hbWV9YCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUpzb25Cb2R5KGV2ZW50OiBIdHRwRXZlbnQpOiB1bmtub3duIHtcbiAgaWYgKCFldmVudC5ib2R5KSByZXR1cm4ge307XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gIH0gY2F0Y2gge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgSlNPTlwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0RhdGVTdHJpbmcodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiICYmIC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZW52RmxhZ1RyaVN0YXRlKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICBjb25zdCB2ID0gcHJvY2Vzcy5lbnZbbmFtZV07XG4gIGlmICh2ID09PSBcInRydWVcIikgcmV0dXJuIHRydWU7XG4gIGlmICh2ID09PSBcImZhbHNlXCIpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNCb2R5Q29tcGFyZUFpRW5hYmxlZExhbWJkYSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIHByb2Nlc3MuZW52LkZGX0JPRFlfQ09NUEFSRV9BSSAhPT0gXCJmYWxzZVwiO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVRleHQgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVRleHQgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVRleHQubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlUZXh0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVN1bW1hcnkubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlTdW1tYXJ5XCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5hY3Rpdml0eUJ1cm5LY2FsKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUJ1cm5LY2FsXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1pbnV0ZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmFjdGl2aXR5TWludXRlcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlNaW51dGVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1ldCAhPT0gdW5kZWZpbmVkICYmICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuYWN0aXZpdHlNZXQpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5TWV0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICghaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSkgfHwgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgPiAxMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUNvbmZpZGVuY2VcIiB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBkYXRlOiBib2R5LmRhdGUsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBib2R5Lm1vcm5pbmdXZWlnaHQsXG4gICAgICBuaWdodFdlaWdodDogKGJvZHkubmlnaHRXZWlnaHQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGJvZHkuY2Fsb3JpZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogYm9keS5wcm90ZWluIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBib2R5LnN0ZXBzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBib2R5LnNsZWVwIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogYm9keS5sYXRlU25hY2sgYXMgYm9vbGVhbixcbiAgICAgIGhpZ2hTb2RpdW06IGJvZHkuaGlnaFNvZGl1bSBhcyBib29sZWFuLFxuICAgICAgd29ya291dDogYm9keS53b3Jrb3V0IGFzIGJvb2xlYW4sXG4gICAgICBhbGNvaG9sOiBib2R5LmFsY29ob2wgYXMgYm9vbGVhbixcbiAgICAgIHBob3RvVXJsOiAoYm9keS5waG90b1VybCBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBub3RlczogKGJvZHkubm90ZXMgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlUZXh0OiBib2R5LmFjdGl2aXR5VGV4dCBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eVN1bW1hcnk6IGJvZHkuYWN0aXZpdHlTdW1tYXJ5IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5QnVybktjYWw6IGJvZHkuYWN0aXZpdHlCdXJuS2NhbCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1ldDogYm9keS5hY3Rpdml0eU1ldCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1pbnV0ZXM6IGJvZHkuYWN0aXZpdHlNaW51dGVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5Q29uZmlkZW5jZTogYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU2V0dGluZ3MoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBTZXR0aW5nc1BhdGNoIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuZ29hbFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBnb2FsV2VpZ2h0XCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuc3RhcnRXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhcnRXZWlnaHRcIiB9O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LnRhcmdldERhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdGFyZ2V0RGF0ZVwiIH07XG4gIGlmIChib2R5LnVuaXQgIT09IFwia2dcIiAmJiBib2R5LnVuaXQgIT09IFwibGJzXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB1bml0XCIgfTtcbiAgaWYgKFxuICAgIGJvZHkudG9uZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS50b25lICE9PSBcImZyaWVuZGx5XCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiY2xpbmljYWxcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJ0b3VnaC1sb3ZlXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiYXl1cnZlZGljXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRvbmVcIiB9O1xuICB9XG4gIGlmIChib2R5Lm9wdEluRm9yZWNhc3QgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgYm9keS5vcHRJbkZvcmVjYXN0ICE9PSBcImJvb2xlYW5cIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBvcHRJbkZvcmVjYXN0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0ICE9PSB1bmRlZmluZWQgJiZcbiAgICAodHlwZW9mIGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQubGVuZ3RoID4gNjQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBmb3JlY2FzdEdlbmVyYXRlZEF0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCAhPT0gdW5kZWZpbmVkICYmXG4gICAgdHlwZW9mIGJvZHkuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgIT09IFwiYm9vbGVhblwiXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChib2R5LCBcIndlZWtseURpZ2VzdEVtYWlsXCIpICYmXG4gICAgdHlwZW9mIGJvZHkud2Vla2x5RGlnZXN0RW1haWwgIT09IFwiYm9vbGVhblwiXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3ZWVrbHlEaWdlc3RFbWFpbFwiIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBib2R5LmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogYm9keS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGJvZHkudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGJvZHkudW5pdCxcbiAgICAgIHRvbmU6IGJvZHkudG9uZSBhcyBTZXR0aW5nc1BhdGNoW1widG9uZVwiXSxcbiAgICAgIG9wdEluRm9yZWNhc3Q6IGJvZHkub3B0SW5Gb3JlY2FzdCBhcyBib29sZWFuIHwgdW5kZWZpbmVkLFxuICAgICAgZm9yZWNhc3RHZW5lcmF0ZWRBdDogYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkOiBib2R5LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkIGFzIGJvb2xlYW4gfCB1bmRlZmluZWQsXG4gICAgICB3ZWVrbHlEaWdlc3RFbWFpbDogT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGJvZHksIFwid2Vla2x5RGlnZXN0RW1haWxcIilcbiAgICAgICAgPyAoYm9keS53ZWVrbHlEaWdlc3RFbWFpbCBhcyBib29sZWFuKVxuICAgICAgICA6IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRKd3RDbGFpbXMoZXZlbnQ6IEh0dHBFdmVudCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgcmF3ID0gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/Lmp3dD8uY2xhaW1zO1xuICBpZiAocmF3ID09IG51bGwpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyB1bmtub3duO1xuICAgICAgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShyYXcpKSB7XG4gICAgcmV0dXJuIHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRVc2VySWQoZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHN1YiA9IGdldEp3dENsYWltcyhldmVudCk/LnN1YjtcbiAgcmV0dXJuIHR5cGVvZiBzdWIgPT09IFwic3RyaW5nXCIgPyBzdWIgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGZpcnN0TmFtZUZyb21Kd3RDbGFpbXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBnaXZlbiA9IGNsYWltcy5naXZlbl9uYW1lO1xuICBpZiAodHlwZW9mIGdpdmVuID09PSBcInN0cmluZ1wiICYmIGdpdmVuLnRyaW0oKSkgcmV0dXJuIGdpdmVuLnRyaW0oKTtcbiAgY29uc3QgbmFtZSA9IGNsYWltcy5uYW1lO1xuICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIgJiYgbmFtZS50cmltKCkpIHtcbiAgICBjb25zdCBmaXJzdCA9IG5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF07XG4gICAgcmV0dXJuIGZpcnN0IHx8IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShcbiAgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+IHwgdW5kZWZpbmVkLFxuKTogUGxhdGVhdVVzZXJTZXR0aW5ncyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaXRlbSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgb3V0OiBQbGF0ZWF1VXNlclNldHRpbmdzID0ge307XG4gIGNvbnN0IHJ3ID0gaXRlbS5wbGF0ZWF1Um9sbGluZ1dpbmRvd0RheXM/Lk47XG4gIGNvbnN0IHNwYW4gPSBpdGVtLnBsYXRlYXVDb21wYXJpc29uU3BhbkRheXM/Lk47XG4gIGNvbnN0IG12ID0gaXRlbS5wbGF0ZWF1TWF4TW92ZW1lbnRLZz8uTjtcbiAgaWYgKHJ3ICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKHJ3KTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQucm9sbGluZ1dpbmRvd0RheXMgPSBuO1xuICB9XG4gIGlmIChzcGFuICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKHNwYW4pO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5jb21wYXJpc29uU3BhbkRheXMgPSBuO1xuICB9XG4gIGlmIChtdiAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihtdik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0Lm1heEF2Z01vdmVtZW50S2cgPSBuO1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhvdXQpLmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUGxhdGVhdVBhdGNoT2JqZWN0KFxuICByYXc6IHVua25vd24sXG4pOiB7IG9rOiB0cnVlOyBkYXRhOiBQbGF0ZWF1VXNlclNldHRpbmdzIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcInBsYXRlYXUgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IG8gPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGRhdGE6IFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7fTtcbiAgaWYgKG8ucm9sbGluZ1dpbmRvd0RheXMgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5yb2xsaW5nV2luZG93RGF5cyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1LnJvbGxpbmdXaW5kb3dEYXlzXCIgfTtcbiAgICBkYXRhLnJvbGxpbmdXaW5kb3dEYXlzID0gbjtcbiAgfVxuICBpZiAoby5jb21wYXJpc29uU3BhbkRheXMgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5jb21wYXJpc29uU3BhbkRheXMpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5jb21wYXJpc29uU3BhbkRheXNcIiB9O1xuICAgIGRhdGEuY29tcGFyaXNvblNwYW5EYXlzID0gbjtcbiAgfVxuICBpZiAoby5tYXhBdmdNb3ZlbWVudEtnICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8ubWF4QXZnTW92ZW1lbnRLZyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1Lm1heEF2Z01vdmVtZW50S2dcIiB9O1xuICAgIGRhdGEubWF4QXZnTW92ZW1lbnRLZyA9IG47XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGEgfTtcbn1cblxuLyoqIEdtYWlsIHRyZWF0cyBkb3RzIGFuZCArbGFiZWxzIGFzIGFsaWFzZXM7IG5vcm1hbGl6ZSBzbyBhZG1pbiBsaXN0IG1hdGNoZXMgcmVhbCBzaWduLWluIGlkZW50aXRpZXMuICovXG5mdW5jdGlvbiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goZW1haWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGxvd2VyID0gZW1haWwudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IGF0ID0gbG93ZXIubGFzdEluZGV4T2YoXCJAXCIpO1xuICBpZiAoYXQgPD0gMCkgcmV0dXJuIGxvd2VyO1xuICBjb25zdCBsb2NhbCA9IGxvd2VyLnNsaWNlKDAsIGF0KTtcbiAgY29uc3QgZG9tYWluID0gbG93ZXIuc2xpY2UoYXQgKyAxKTtcbiAgaWYgKGRvbWFpbiA9PT0gXCJnbWFpbC5jb21cIiB8fCBkb21haW4gPT09IFwiZ29vZ2xlbWFpbC5jb21cIikge1xuICAgIGNvbnN0IGJhc2VMb2NhbCA9IChsb2NhbC5zcGxpdChcIitcIilbMF0gPz8gbG9jYWwpLnJlcGxhY2UoL1xcLi9nLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7YmFzZUxvY2FsfUAke2RvbWFpbn1gO1xuICB9XG4gIHJldHVybiBsb3dlcjtcbn1cblxuZnVuY3Rpb24gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk6IFNldDxzdHJpbmc+IHtcbiAgY29uc3QgcmF3ID0gcHJvY2Vzcy5lbnYuQURNSU5fRU1BSUxTPy50cmltKCkgfHwgXCJvamFzaGVhbHRoMjAyNkBnbWFpbC5jb21cIjtcbiAgY29uc3QgcGFydHMgPSByYXdcbiAgICAuc3BsaXQoXCIsXCIpXG4gICAgLm1hcCgocykgPT4gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKHMudHJpbSgpKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0KHBhcnRzKTtcbiAgaWYgKHNldC5zaXplID09PSAwKSB7XG4gICAgc2V0LmFkZChub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goXCJvamFzaGVhbHRoMjAyNkBnbWFpbC5jb21cIikpO1xuICB9XG4gIHJldHVybiBzZXQ7XG59XG5cbmNvbnN0IEFETUlOX0NMQUlNX0tFWVMgPSBbXCJ1c2VybmFtZVwiLCBcImNvZ25pdG86dXNlcm5hbWVcIiwgXCJlbWFpbFwiLCBcInByZWZlcnJlZF91c2VybmFtZVwiXSBhcyBjb25zdDtcblxuZnVuY3Rpb24gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGZvdW5kOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBlbWFpbGlzaCA9IC9eW15cXHNAXStAW15cXHNAXStcXC5bXlxcc0BdKyQvO1xuICBmb3IgKGNvbnN0IGtleSBvZiBBRE1JTl9DTEFJTV9LRVlTKSB7XG4gICAgY29uc3QgdiA9IGNsYWltc1trZXldO1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCB2IG9mIE9iamVjdC52YWx1ZXMoY2xhaW1zKSkge1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFsuLi5uZXcgU2V0KGZvdW5kKV07XG59XG5cbi8qKiBUcnVlIGlmIEpXVCBjbGFpbXMgaW5jbHVkZSBhbiBlbWFpbCBpZGVudGl0eSB0aGF0IG1hdGNoZXMgdGhlIGNvbmZpZ3VyZWQgYWRtaW4gYWxsb3cgbGlzdC4gKi9cbmZ1bmN0aW9uIGlzQWRtaW5DYWxsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IGJvb2xlYW4ge1xuICBjb25zdCBjbGFpbXMgPSBnZXRKd3RDbGFpbXMoZXZlbnQpO1xuICBpZiAoIWNsYWltcykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltcyk7XG4gIGZvciAoY29uc3QgYyBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goYykpKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhlYWRlclZhbHVlKFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkLFxuICBuYW1lOiBzdHJpbmcsXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWhlYWRlcnMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IHdhbnQgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpKSB7XG4gICAgaWYgKGsudG9Mb3dlckNhc2UoKSA9PT0gd2FudCAmJiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2Lmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB2O1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEpXVCBIVFRQIEFQSSBhdXRob3JpemVycyB2YWxpZGF0ZSBBdXRob3JpemF0aW9uIGJ1dCB0eXBpY2FsbHkgZG8gbm90IGZvcndhcmQgdGhhdCBoZWFkZXIgdG8gTGFtYmRhLlxuICogQ2xpZW50cyBhbHNvIHNlbmQgeC1jb2duaXRvLWFjY2Vzcy10b2tlbiAoc2VlIGZyb250ZW5kLWFwaS1jbGllbnQpIHNvIHdlIGNhbiBjYWxsIGNvZ25pdG8taWRwOkdldFVzZXIuXG4gKi9cbmZ1bmN0aW9uIGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBoID0gZXZlbnQuaGVhZGVycztcbiAgY29uc3QgY3VzdG9tID0gaGVhZGVyVmFsdWUoaCwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCIpO1xuICBpZiAoY3VzdG9tPy50cmltKCkpIHJldHVybiBjdXN0b20udHJpbSgpO1xuICBjb25zdCByYXcgPSBoZWFkZXJWYWx1ZShoLCBcImF1dGhvcml6YXRpb25cIik7XG4gIGlmICghcmF3KSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBtID0gcmF3Lm1hdGNoKC9eQmVhcmVyXFxzKyguKykkL2kpO1xuICByZXR1cm4gbT8uWzFdPy50cmltKCk7XG59XG5cbi8qKiBXaGVuIGNsYWltcyBsYWNrIGEgcmVzb2x2YWJsZSBlbWFpbCwgdmVyaWZ5IGFkbWluIHZpYSBHZXRVc2VyOyB0b2tlbiBzdWIgbXVzdCBtYXRjaCBKV1Qgc3ViLiAqL1xuYXN5bmMgZnVuY3Rpb24gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBjb25zdCB0b2tlbiA9IGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50KTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBqd3RTdWIgPSBnZXRVc2VySWQoZXZlbnQpO1xuICBpZiAoIWp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICB0cnkge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChuZXcgR2V0VXNlckNvbW1hbmQoeyBBY2Nlc3NUb2tlbjogdG9rZW4gfSkpO1xuICAgIGNvbnN0IGF0dHJzID0gb3V0LlVzZXJBdHRyaWJ1dGVzID8/IFtdO1xuICAgIGNvbnN0IHRva2VuU3ViID0gYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInN1YlwiKT8uVmFsdWU7XG4gICAgaWYgKHRva2VuU3ViICE9PSBqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBlbWFpbCA9XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwiZW1haWxcIik/LlZhbHVlID8/XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwicHJlZmVycmVkX3VzZXJuYW1lXCIpPy5WYWx1ZTtcbiAgICBjb25zdCBmcm9tVXNlcm5hbWUgPSBvdXQuVXNlcm5hbWU/LmluY2x1ZGVzKFwiQFwiKSA/IG91dC5Vc2VybmFtZSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBjYW5kaWRhdGUgPSAoZW1haWwgPz8gZnJvbVVzZXJuYW1lID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghY2FuZGlkYXRlKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goY2FuZGlkYXRlKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluQWxsb3dlZChldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGlmIChpc0FkbWluQ2FsbGVyKGV2ZW50KSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBpc0FkbWluVmlhR2V0VXNlcihldmVudCk7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXREYXRlKCk6IHN0cmluZyB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICBkLnNldERhdGUoZC5nZXREYXRlKCkgKyAxMTgpO1xuICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocGhvdG9Vcmw6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIXBob3RvVXJsIHx8IHR5cGVvZiBwaG90b1VybCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHBob3RvVXJsLnN0YXJ0c1dpdGgoXCJzMzovL1wiKSkgcmV0dXJuIHBob3RvVXJsO1xuICBpZiAoIXBob3RvVXJsLmluY2x1ZGVzKFwiOi8vXCIpKSB7XG4gICAgY29uc3Qga2V5T25seSA9IHBob3RvVXJsLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gICAgaWYgKCFrZXlPbmx5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGlmIChwaG90b0J1Y2tldE5hbWUpIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3Bob3RvQnVja2V0TmFtZX0vJHtrZXlPbmx5fWA7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHBob3RvVXJsKTtcbiAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJzZWQucGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCBcIlwiKSk7XG4gICAgaWYgKCFwYXRoKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgLy8gVmlydHVhbC1ob3N0ZWQtc3R5bGUgVVJMOiBidWNrZXQuczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCB2aXJ0dWFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmICh2aXJ0dWFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3ZpcnR1YWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIExlZ2FjeSBnbG9iYWwgZW5kcG9pbnQ6IGJ1Y2tldC5zMy5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IGdsb2JhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKGdsb2JhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtnbG9iYWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIFBhdGgtc3R5bGUgVVJMOiBzMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2J1Y2tldC9rZXlcbiAgICBpZiAoL15zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8udGVzdChob3N0KSB8fCBob3N0ID09PSBcInMzLmFtYXpvbmF3cy5jb21cIikge1xuICAgICAgY29uc3Qgc2xhc2ggPSBwYXRoLmluZGV4T2YoXCIvXCIpO1xuICAgICAgaWYgKHNsYXNoIDw9IDApIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBidWNrZXQgPSBwYXRoLnNsaWNlKDAsIHNsYXNoKTtcbiAgICAgIGNvbnN0IGtleSA9IHBhdGguc2xpY2Uoc2xhc2ggKyAxKTtcbiAgICAgIGlmICghYnVja2V0IHx8ICFrZXkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICByZXR1cm4gYHMzOi8vJHtidWNrZXR9LyR7a2V5fWA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRCeURhdGVBc2M8VCBleHRlbmRzIHsgZGF0ZTogc3RyaW5nIH0+KHJvd3M6IFRbXSk6IFRbXSB7XG4gIHJldHVybiBbLi4ucm93c10uc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG59XG5cbmZ1bmN0aW9uIGF2ZXJhZ2UodmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB8IG51bGwge1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB2YWx1ZXMucmVkdWNlKChhY2MsIHZhbHVlKSA9PiBhY2MgKyB2YWx1ZSwgMCkgLyB2YWx1ZXMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiByb3VuZDIodmFsdWU6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnJvdW5kKHZhbHVlICogMTAwKSAvIDEwMDtcbn1cblxuZnVuY3Rpb24gbmV4dE1vcm5pbmdEZWx0YXMoXG4gIGxvZ3M6IFN0b3JlZEVudHJ5W10sXG4gIHByZWRpY2F0ZTogKGxvZzogU3RvcmVkRW50cnkpID0+IGJvb2xlYW4sXG4pOiB7IGZsYWdnZWQ6IG51bWJlcltdOyBiYXNlbGluZTogbnVtYmVyW10gfSB7XG4gIGNvbnN0IHNvcnRlZCA9IHNvcnRCeURhdGVBc2MobG9ncyk7XG4gIGNvbnN0IGZsYWdnZWQ6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGJhc2VsaW5lOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBzb3J0ZWQubGVuZ3RoIC0gMTsgaWR4ICs9IDEpIHtcbiAgICBjb25zdCBkZWx0YSA9IHNvcnRlZFtpZHggKyAxXS5tb3JuaW5nV2VpZ2h0IC0gc29ydGVkW2lkeF0ubW9ybmluZ1dlaWdodDtcbiAgICBpZiAocHJlZGljYXRlKHNvcnRlZFtpZHhdKSkgZmxhZ2dlZC5wdXNoKGRlbHRhKTtcbiAgICBlbHNlIGJhc2VsaW5lLnB1c2goZGVsdGEpO1xuICB9XG4gIHJldHVybiB7IGZsYWdnZWQsIGJhc2VsaW5lIH07XG59XG5cbmZ1bmN0aW9uIHNvZGl1bUluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5oaWdoU29kaXVtKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgc29kaXVtLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwic29kaXVtQnVtcFwiLFxuICAgIHByaW9yaXR5OiA5NSxcbiAgICBoZWFkbGluZTogXCJIaWdoLXNvZGl1bSBkYXlzIGFyZSBsaW5rZWQgdG8gaGVhdmllciBuZXh0LW1vcm5pbmcgd2VpZ2gtaW5zLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2cyB5b3VyIG5vbi1zb2RpdW0gYmFzZWxpbmUgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGhpZ2gtc29kaXVtIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIG9uIGhpZ2gtc29kaXVtIGRheXM6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJUcnkgb25lIGxvd2VyLXNvZGl1bSBkaW5uZXIgc3dhcCB0b25pZ2h0LlwiLFxuICAgIGNhdGVnb3J5OiBcInNvZGl1bVwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBhbGNvaG9sSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmFsY29ob2wpO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBhbGNvaG9sLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwiYWxjb2hvbFwiLFxuICAgIHByaW9yaXR5OiA5MCxcbiAgICBoZWFkbGluZTogXCJBbGNvaG9sIGRheXMgdGVuZCB0byBzaG93IGEgbmV4dC1kYXkgd2VpZ2h0IGJ1bXAuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZlcnN1cyBub24tYWxjb2hvbCBkYXlzIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBhbGNvaG9sLWxvZ2dlZCBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBhZnRlciBhbGNvaG9sOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiUGxhbiBhbGNvaG9sLWZyZWUgd2Vla2RheXMgZm9yIHN0ZWFkaWVyIHRyZW5kIGxpbmVzLlwiLFxuICAgIGNhdGVnb3J5OiBcImFsY29ob2xcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGF0ZVNuYWNrSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmxhdGVTbmFjayk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGxhdGUtc25hY2stYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJsYXRlU25hY2tcIixcbiAgICBwcmlvcml0eTogODgsXG4gICAgaGVhZGxpbmU6IFwiTGF0ZSBzbmFja3MgYXJlIGNvcnJlbGF0ZWQgd2l0aCBoZWF2aWVyIG5leHQtbW9ybmluZyBzY2FsZSByZWFkaW5ncy5cIixcbiAgICBkZXRhaWw6IGBZb3VyIG5leHQtZGF5IGNoYW5nZSBpcyArJHtyb3VuZDIoZXhjZXNzKX0ga2cgaGlnaGVyIHRoYW4geW91ciBub24tbGF0ZS1zbmFjayBiYXNlbGluZS5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGxhdGUtc25hY2sgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugd2l0aCBsYXRlIHNuYWNrOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiU2V0IGEgMi1ob3VyIGtpdGNoZW4gY2xvc2UgdGltZSBiZWZvcmUgYmVkLlwiLFxuICAgIGNhdGVnb3J5OiBcImxhdGVfc25hY2tcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0V2l0aExvZ3MoZW50cnlDb3VudDogbnVtYmVyLCBsYXRlc3REYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7bGF0ZXN0RGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJiYXNlbGluZVwiLFxuICAgIHByaW9yaXR5OiAxMCxcbiAgICBoZWFkbGluZTogXCJHcmVhdCBjb25zaXN0ZW5jeSBzbyBmYXIg4oCUIGtlZXAgbG9nZ2luZyBkYWlseSBmb3Igc2hhcnBlciBpbnNpZ2h0cy5cIixcbiAgICBkZXRhaWw6XG4gICAgICBcIldlIG5lZWQgYSBiaXQgbW9yZSBzaWduYWwgdG8gZGV0ZWN0IHN0cm9uZyBwZXJzb25hbCBwYXR0ZXJucywgYnV0IHlvdXIgZGF0YSBmbG93IGlzIGFjdGl2ZS5cIixcbiAgICB3aHk6IFtcbiAgICAgIGAke2VudHJ5Q291bnR9IGxvZ3MgYW5hbHl6ZWQgZnJvbSB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIFwiTm8gcnVsZSBjcm9zc2VkIGNvbmZpZGVuY2UgdGhyZXNob2xkcyB5ZXRcIixcbiAgICBdLFxuICAgIGFjdGlvbjogXCJLZWVwIHRyYWNraW5nIGRhaWx5IGhhYml0cyBhbmQgd2VpZ2h0IHRvIHVubG9jayBzdHJvbmdlciBwZXJzb25hbGl6ZWQgaW5zaWdodHMuXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGJhc2VsaW5lSW5zaWdodE5vTG9ncyhhc09mRGF0ZTogc3RyaW5nKTogSW5zaWdodENhcmQge1xuICByZXR1cm4ge1xuICAgIGlkOiBgYmFzZWxpbmUtaW5zaWdodC0ke2FzT2ZEYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIlN0YXJ0IGxvZ2dpbmcgd2VpZ2h0IGFuZCBoYWJpdHMgdG8gdW5sb2NrIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBkZXRhaWw6IFwiT25jZSB5b3UgaGF2ZSBhIGZldyB3ZWVrcyBvZiBlbnRyaWVzLCB3ZSB3aWxsIGhpZ2hsaWdodCBwYXR0ZXJucyB0aGF0IG1hdGNoIHlvdXIgZGF0YS5cIixcbiAgICB3aHk6IFtcIk5vIGVudHJpZXMgZm91bmQgaW4gdGhlIGxhc3QgOTAgZGF5c1wiXSxcbiAgICBhY3Rpb246IFwiQWRkIHRvZGF5J3Mgd2VpZ2h0IG9uIHRoZSBsZWZ0IHRvIGJlZ2luLlwiLFxuICAgIGNhdGVnb3J5OiBcInN0cmVha1wiLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbnNpZ2h0c1YyKHVzZXJJZDogc3RyaW5nLCBfZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgdG8gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBmcm9tRGF0ZSA9IG5ldyBEYXRlKCk7XG4gIGZyb21EYXRlLnNldERhdGUoZnJvbURhdGUuZ2V0RGF0ZSgpIC0gODkpO1xuICBjb25zdCBmcm9tID0gZnJvbURhdGUudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWQgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9LFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgXCI6ZnJvbURhdGVcIjogeyBTOiBmcm9tIH0sXG4gICAgICAgIFwiOnRvRGF0ZVwiOiB7IFM6IHRvIH0sXG4gICAgICB9LFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBlbnRyaWVzUmF3ID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIH0pLFxuICApLmZpbHRlcigoZSkgPT4gZS5kYXRlICYmIGUubW9ybmluZ1dlaWdodCA+IDApO1xuXG4gIGNvbnN0IHNldHRpbmdzVGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBzZXR0aW5nc1JvdyA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHNldHRpbmdzVGFibGUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZ0l0ZW0gPSBzZXR0aW5nc1Jvdy5JdGVtO1xuICBjb25zdCBnb2FsV2VpZ2h0ID0gZ0l0ZW0gPyBOdW1iZXIoZ0l0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MikgOiA3MjtcbiAgY29uc3Qgc3RhcnRXZWlnaHQgPSBnSXRlbSA/IE51bWJlcihnSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSkgOiA4NTtcbiAgY29uc3QgdGFyZ2V0RGF0ZSA9IGdJdGVtPy50YXJnZXREYXRlPy5TID8/IHRvO1xuXG4gIGNvbnN0IGluc2lnaHRzID0gYXdhaXQgZ2VuZXJhdGVBaUluc2lnaHRDYXJkKGRkYiwge1xuICAgIHVzZXJJZCxcbiAgICBlbnRyaWVzUmF3LFxuICAgIGdvYWxXZWlnaHQsXG4gICAgc3RhcnRXZWlnaHQsXG4gICAgdGFyZ2V0RGF0ZSxcbiAgICBkYXlNZWFsc1RhYmxlTmFtZTogZGF5TWVhbEVudHJpZXNUYWJsZU5hbWUsXG4gIH0pO1xuXG4gIGNvbnN0IGJvZHlPdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyBpbnNpZ2h0cyB9O1xuICBpZiAocHJvY2Vzcy5lbnYuRkZfUEVSU09OQUxJWkVEX0FJX0NPQUNISU5HICE9PSBcImZhbHNlXCIpIHtcbiAgICBjb25zdCBzdWJzVGFibGUgPSBwcm9jZXNzLmVudi5TVUJTQ1JJUFRJT05TX1RBQkxFX05BTUU7XG4gICAgbGV0IHBsYW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgc3Vic2NyaXB0aW9uU3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgaWYgKHN1YnNUYWJsZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3ViT3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgICAgICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogc3Vic1RhYmxlLFxuICAgICAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG4gICAgICAgIHBsYW4gPSBzdWJPdXQuSXRlbT8ucGxhbj8uUyA/PyBcImZyZWVcIjtcbiAgICAgICAgc3Vic2NyaXB0aW9uU3RhdHVzID0gc3ViT3V0Lkl0ZW0/LnN0YXR1cz8uUyA/PyBcImluYWN0aXZlXCI7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcGxhbiA9IFwiZnJlZVwiO1xuICAgICAgICBzdWJzY3JpcHRpb25TdGF0dXMgPSBcImluYWN0aXZlXCI7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHNvcnRlZCA9IFsuLi5lbnRyaWVzUmF3XS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbiAgICBjb25zdCBsYXN0NyA9IHNvcnRlZC5zbGljZSgtNyk7XG4gICAgY29uc3Qga2NhbHMgPSBsYXN0Ny5tYXAoKGUpID0+IGUuY2Fsb3JpZXMpLmZpbHRlcigoYyk6IGMgaXMgbnVtYmVyID0+IHR5cGVvZiBjID09PSBcIm51bWJlclwiICYmIGMgPiAwKTtcbiAgICBjb25zdCByZWNlbnRBdmdEYWlseUNhbG9yaWVzID1cbiAgICAgIGtjYWxzLmxlbmd0aCA+PSAyID8ga2NhbHMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgLyBrY2Fscy5sZW5ndGggOiBudWxsO1xuICAgIGJvZHlPdXQucGVyc29uYWxpemVkQ29hY2hpbmcgPSBidWlsZFBlcnNvbmFsaXplZENvYWNoaW5nUGF5bG9hZCh7XG4gICAgICBlbnRyaWVzUmF3LFxuICAgICAgZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZSxcbiAgICAgIGFzT2ZEYXRlOiB0byxcbiAgICAgIHBsYW4sXG4gICAgICBzdWJzY3JpcHRpb25TdGF0dXMsXG4gICAgICByZWNlbnRBdmdEYWlseUNhbG9yaWVzLFxuICAgIH0pO1xuICB9XG4gIHJldHVybiBqc29uKDIwMCwgYm9keU91dCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUVcIiwgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBpbnNpZ2h0SWQgPSB0eXBlb2YgYm9keS5pbnNpZ2h0SWQgPT09IFwic3RyaW5nXCIgPyBib2R5Lmluc2lnaHRJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCB2b3RlUmF3ID0gYm9keS52b3RlO1xuICBjb25zdCBhbGxvd2VkVm90ZXMgPSBuZXcgU2V0KFtcInVwXCIsIFwiZG93blwiLCBcImhlbHBmdWxcIiwgXCJub3RfaGVscGZ1bFwiLCBcImRpc21pc3NcIl0pO1xuICBjb25zdCB2b3RlID1cbiAgICB0eXBlb2Ygdm90ZVJhdyA9PT0gXCJzdHJpbmdcIiAmJiBhbGxvd2VkVm90ZXMuaGFzKHZvdGVSYXcpXG4gICAgICA/ICh2b3RlUmF3IGFzIFwidXBcIiB8IFwiZG93blwiIHwgXCJoZWxwZnVsXCIgfCBcIm5vdF9oZWxwZnVsXCIgfCBcImRpc21pc3NcIilcbiAgICAgIDogbnVsbDtcbiAgaWYgKCFpbnNpZ2h0SWQgfHwgIXZvdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGluc2lnaHQgZmVlZGJhY2sgcGF5bG9hZFwiIH0pO1xuICBjb25zdCBjb21tZW50UmF3ID0gYm9keS5jb21tZW50O1xuICBjb25zdCBjb21tZW50ID1cbiAgICB0eXBlb2YgY29tbWVudFJhdyA9PT0gXCJzdHJpbmdcIiAmJiBjb21tZW50UmF3LnRyaW0oKS5sZW5ndGggPiAwXG4gICAgICA/IGNvbW1lbnRSYXcudHJpbSgpLnNsaWNlKDAsIDIwMDApXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgY29uc3QgZmVlZGJhY2tUeXBlID0gYm9keS5mZWVkYmFja1R5cGUgPT09IFwibmVnYXRpdmVcIiA/IFwibmVnYXRpdmVcIiA6IHVuZGVmaW5lZDtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBpbnNpZ2h0VHM6IHsgUzogYCR7dHN9IyR7aW5zaWdodElkfWAgfSxcbiAgICAgICAgaW5zaWdodElkOiB7IFM6IGluc2lnaHRJZCB9LFxuICAgICAgICB2b3RlOiB7IFM6IHZvdGUgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgICAgLi4uKGNvbW1lbnQgPyB7IGNvbW1lbnQ6IHsgUzogY29tbWVudCB9IH0gOiB7fSksXG4gICAgICAgIC4uLihmZWVkYmFja1R5cGUgPyB7IGZlZWRiYWNrVHlwZTogeyBTOiBmZWVkYmFja1R5cGUgfSB9IDoge30pLFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRFbnRyaWVzKHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGZyb20gPSBxdWVyeT8uZnJvbTtcbiAgY29uc3QgdG8gPSBxdWVyeT8udG87XG4gIGlmIChmcm9tICYmICFpc0RhdGVTdHJpbmcoZnJvbSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGZyb20gZGF0ZVwiIH0pO1xuICBpZiAodG8gJiYgIWlzRGF0ZVN0cmluZyh0bykpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHRvIGRhdGVcIiB9KTtcblxuICBjb25zdCBleHByZXNzaW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB7IFM6IHN0cmluZyB9PiA9IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfTtcbiAgbGV0IGtleUNvbmRpdGlvbiA9IFwidXNlcklkID0gOnVzZXJJZFwiO1xuICBpZiAoZnJvbSAmJiB0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH0gZWxzZSBpZiAoZnJvbSkge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPj0gOmZyb21EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICB9IGVsc2UgaWYgKHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA8PSA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH1cblxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjoga2V5Q29uZGl0aW9uLFxuICAgICAgLi4uKGtleUNvbmRpdGlvbi5pbmNsdWRlcyhcIiNkYXRlXCIpXG4gICAgICAgID8geyBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9IH1cbiAgICAgICAgOiB7fSksXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uVmFsdWVzLFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXM6IFN0b3JlZEVudHJ5W10gPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgaWQ6IGl0ZW0uaWQ/LlMgPz8gYCR7dXNlcklkfToke2l0ZW0uZGF0ZT8uUyA/PyBcIlwifWAsXG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICBwaG90b1VybDogaXRlbS5waG90b1VybD8uUyA/PyB1bmRlZmluZWQsXG4gICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5VGV4dDogaXRlbS5hY3Rpdml0eVRleHQ/LlMgPz8gdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5U3VtbWFyeTogaXRlbS5hY3Rpdml0eVN1bW1hcnk/LlMgPz8gdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5QnVybktjYWw6IGl0ZW0uYWN0aXZpdHlCdXJuS2NhbD8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5QnVybktjYWwuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlNZXQ6IGl0ZW0uYWN0aXZpdHlNZXQ/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eU1ldC5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eU1pbnV0ZXM6IGl0ZW0uYWN0aXZpdHlNaW51dGVzPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlNaW51dGVzLk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5Q29uZmlkZW5jZTogaXRlbS5hY3Rpdml0eUNvbmZpZGVuY2U/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eUNvbmZpZGVuY2UuTikgOiB1bmRlZmluZWQsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllc1dpdGhTaWduZWRQaG90b1VybHM6IFN0b3JlZEVudHJ5W10gPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICBlbnRyaWVzLm1hcChhc3luYyAoZW50cnkpID0+IHtcbiAgICAgIGNvbnN0IHBob3RvID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZW50cnkucGhvdG9VcmwpO1xuICAgICAgaWYgKCFwaG90bykgcmV0dXJuIGVudHJ5O1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd2l0aG91dFNjaGVtZSA9IHBob3RvLnNsaWNlKFwiczM6Ly9cIi5sZW5ndGgpO1xuICAgICAgICBjb25zdCBmaXJzdFNsYXNoID0gd2l0aG91dFNjaGVtZS5pbmRleE9mKFwiL1wiKTtcbiAgICAgICAgaWYgKGZpcnN0U2xhc2ggPD0gMCkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBidWNrZXQgPSB3aXRob3V0U2NoZW1lLnNsaWNlKDAsIGZpcnN0U2xhc2gpO1xuICAgICAgICBjb25zdCBrZXkgPSB3aXRob3V0U2NoZW1lLnNsaWNlKGZpcnN0U2xhc2ggKyAxKTtcbiAgICAgICAgaWYgKCFrZXkpIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3Qgc2lnbmVkUGhvdG9VcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldCwgS2V5OiBrZXkgfSksXG4gICAgICAgICAgeyBleHBpcmVzSW46IGRvd25sb2FkVXJsVHRsU2Vjb25kcyB9LFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4geyAuLi5lbnRyeSwgcGhvdG9Vcmw6IHNpZ25lZFBob3RvVXJsIH07XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyaWVzOiBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJscyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RW50cnkodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgcGFyc2VkID0gdmFsaWRhdGVFbnRyeShwYXlsb2FkKTtcbiAgaWYgKCFwYXJzZWQub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwYXJzZWQuZXJyb3IgfSk7XG4gIGNvbnN0IGRhdGEgPSBwYXJzZWQuZGF0YTtcbiAgY29uc3QgaWQgPSBgJHt1c2VySWR9OiR7ZGF0YS5kYXRlfWA7XG5cbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGRhdGU6IHsgUzogZGF0YS5kYXRlIH0sXG4gICAgaWQ6IHsgUzogaWQgfSxcbiAgICBtb3JuaW5nV2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLm1vcm5pbmdXZWlnaHQpIH0sXG4gICAgbGF0ZVNuYWNrOiB7IEJPT0w6IGRhdGEubGF0ZVNuYWNrIH0sXG4gICAgaGlnaFNvZGl1bTogeyBCT09MOiBkYXRhLmhpZ2hTb2RpdW0gfSxcbiAgICB3b3Jrb3V0OiB7IEJPT0w6IGRhdGEud29ya291dCB9LFxuICAgIGFsY29ob2w6IHsgQk9PTDogZGF0YS5hbGNvaG9sIH0sXG4gIH07XG5cbiAgaWYgKGRhdGEubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJiBkYXRhLm5pZ2h0V2VpZ2h0ICE9PSBudWxsKSB7XG4gICAgaXRlbS5uaWdodFdlaWdodCA9IHsgTjogU3RyaW5nKGRhdGEubmlnaHRXZWlnaHQpIH07XG4gIH1cbiAgaWYgKGRhdGEuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCkgaXRlbS5jYWxvcmllcyA9IHsgTjogU3RyaW5nKGRhdGEuY2Fsb3JpZXMpIH07XG4gIGlmIChkYXRhLnByb3RlaW4gIT09IHVuZGVmaW5lZCkgaXRlbS5wcm90ZWluID0geyBOOiBTdHJpbmcoZGF0YS5wcm90ZWluKSB9O1xuICBpZiAoZGF0YS5zdGVwcyAhPT0gdW5kZWZpbmVkKSBpdGVtLnN0ZXBzID0geyBOOiBTdHJpbmcoZGF0YS5zdGVwcykgfTtcbiAgaWYgKGRhdGEuc2xlZXAgIT09IHVuZGVmaW5lZCkgaXRlbS5zbGVlcCA9IHsgTjogU3RyaW5nKGRhdGEuc2xlZXApIH07XG4gIGNvbnN0IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGRhdGEucGhvdG9VcmwpO1xuICBpZiAobm9ybWFsaXplZFBob3RvUmVmZXJlbmNlKSBpdGVtLnBob3RvVXJsID0geyBTOiBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLm5vdGVzID09PSBcInN0cmluZ1wiKSBpdGVtLm5vdGVzID0geyBTOiBkYXRhLm5vdGVzIH07XG4gIGlmICh0eXBlb2YgZGF0YS5hY3Rpdml0eVRleHQgPT09IFwic3RyaW5nXCIpIGl0ZW0uYWN0aXZpdHlUZXh0ID0geyBTOiBkYXRhLmFjdGl2aXR5VGV4dCB9O1xuICBpZiAodHlwZW9mIGRhdGEuYWN0aXZpdHlTdW1tYXJ5ID09PSBcInN0cmluZ1wiKSBpdGVtLmFjdGl2aXR5U3VtbWFyeSA9IHsgUzogZGF0YS5hY3Rpdml0eVN1bW1hcnkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlCdXJuS2NhbCAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5QnVybktjYWwgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5QnVybktjYWwpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5TWV0ICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlNZXQgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5TWV0KSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eU1pbnV0ZXMgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eU1pbnV0ZXMgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5TWludXRlcykgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlDb25maWRlbmNlICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlDb25maWRlbmNlID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eUNvbmZpZGVuY2UpIH07XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbTogaXRlbSBhcyBuZXZlcixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cnk6IHsgLi4uZGF0YSwgaWQgfSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlRW50cnkodXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZGF0ZSA9IHF1ZXJ5Py5kYXRlO1xuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXRlKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH0pO1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBEZWxldGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGRhdGU6IHsgUzogZGF0ZSB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIGRhdGUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRTdWJzY3JpcHRpb25TbmFwc2hvdCh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8e1xuICBwbGFuOiBzdHJpbmc7XG4gIHN0YXR1czogc3RyaW5nO1xuICBjdXJyZW50UGVyaW9kRW5kOiBzdHJpbmcgfCBudWxsO1xufT4ge1xuICBjb25zdCBzdWJzVGFibGUgPSBwcm9jZXNzLmVudi5TVUJTQ1JJUFRJT05TX1RBQkxFX05BTUU7XG4gIGlmICghc3Vic1RhYmxlKSB7XG4gICAgcmV0dXJuIHsgcGxhbjogXCJmcmVlXCIsIHN0YXR1czogXCJpbmFjdGl2ZVwiLCBjdXJyZW50UGVyaW9kRW5kOiBudWxsIH07XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBzdWJPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogc3Vic1RhYmxlLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBpZiAoIXN1Yk91dC5JdGVtKSB7XG4gICAgICByZXR1cm4geyBwbGFuOiBcImZyZWVcIiwgc3RhdHVzOiBcImluYWN0aXZlXCIsIGN1cnJlbnRQZXJpb2RFbmQ6IG51bGwgfTtcbiAgICB9XG4gICAgY29uc3QgY3BlID0gc3ViT3V0Lkl0ZW0uY3VycmVudFBlcmlvZEVuZD8uUz8udHJpbSgpO1xuICAgIHJldHVybiB7XG4gICAgICBwbGFuOiBzdWJPdXQuSXRlbS5wbGFuPy5TID8/IFwiZnJlZVwiLFxuICAgICAgc3RhdHVzOiBzdWJPdXQuSXRlbS5zdGF0dXM/LlMgPz8gXCJpbmFjdGl2ZVwiLFxuICAgICAgY3VycmVudFBlcmlvZEVuZDogY3BlICYmIGNwZS5sZW5ndGggPiAwID8gY3BlIDogbnVsbCxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4geyBwbGFuOiBcImZyZWVcIiwgc3RhdHVzOiBcImluYWN0aXZlXCIsIGN1cnJlbnRQZXJpb2RFbmQ6IG51bGwgfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3Qgc3Vic2NyaXB0aW9uID0gYXdhaXQgbG9hZFN1YnNjcmlwdGlvblNuYXBzaG90KHVzZXJJZCk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICAgIHRvbmU6IFwiZnJpZW5kbHlcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgICAgdG9uZTogeyBTOiBzZXR0aW5ncy50b25lID8/IFwiZnJpZW5kbHlcIiB9LFxuICAgICAgICAgIHdlZWtseURpZ2VzdEVtYWlsOiB7IE46IFwiMFwiIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgc2V0dGluZ3M6IHtcbiAgICAgICAgZ29hbFdlaWdodDogc2V0dGluZ3MuZ29hbFdlaWdodCxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHNldHRpbmdzLnN0YXJ0V2VpZ2h0LFxuICAgICAgICB0YXJnZXREYXRlOiBzZXR0aW5ncy50YXJnZXREYXRlLFxuICAgICAgICB1bml0OiBzZXR0aW5ncy51bml0LFxuICAgICAgICB0b25lOiBzZXR0aW5ncy50b25lLFxuICAgICAgICBwbGF0ZWF1OiB1bmRlZmluZWQsXG4gICAgICAgIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I6IHNldHRpbmdzLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3IgPz8gMSxcbiAgICAgICAgd2Vla2x5RGlnZXN0RW1haWw6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIHN1YnNjcmlwdGlvbixcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MiksXG4gICAgICBzdGFydFdlaWdodDogTnVtYmVyKG91dC5JdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSxcbiAgICAgIHRhcmdldERhdGU6IG91dC5JdGVtLnRhcmdldERhdGU/LlMgPz8gZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IG91dC5JdGVtLnVuaXQ/LlMgPT09IFwibGJzXCIgPyBcImxic1wiIDogXCJrZ1wiLFxuICAgICAgdG9uZTpcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwidG91Z2gtbG92ZVwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCJcbiAgICAgICAgICA/IG91dC5JdGVtLnRvbmUuU1xuICAgICAgICAgIDogXCJmcmllbmRseVwiLFxuICAgICAgcGxhdGVhdTogcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0ob3V0Lkl0ZW0pLFxuICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvcjogTnVtYmVyKG91dC5JdGVtLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSksXG4gICAgICBvcHRJbkZvcmVjYXN0OiBOdW1iZXIob3V0Lkl0ZW0ub3B0SW5Gb3JlY2FzdD8uTiA/PyBcIjBcIikgPT09IDEsXG4gICAgICBmb3JlY2FzdEdlbmVyYXRlZEF0OiBvdXQuSXRlbS5mb3JlY2FzdEdlbmVyYXRlZEF0Py5TLFxuICAgICAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ6IE51bWJlcihvdXQuSXRlbS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZD8uTiA/PyBcIjBcIikgPT09IDEsXG4gICAgICB3ZWVrbHlEaWdlc3RFbWFpbDogTnVtYmVyKG91dC5JdGVtLndlZWtseURpZ2VzdEVtYWlsPy5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICB9LFxuICAgIHN1YnNjcmlwdGlvbixcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhdGNoU2V0dGluZ3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgZXhpc3RpbmdPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZVNldHRpbmdzKHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuXG4gIGNvbnN0IGV4aXN0aW5nVG9uZSA9XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJmcmllbmRseVwiXG4gICAgICA/IGV4aXN0aW5nT3V0Lkl0ZW0udG9uZS5TXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgY29uc3QgdG9uZSA9IGRhdGEudG9uZSA/PyBleGlzdGluZ1RvbmUgPz8gXCJmcmllbmRseVwiO1xuICBjb25zdCBleGlzdGluZ0NhbGlicmF0aW9uID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSk7XG4gIGNvbnN0IGV4aXN0aW5nT3B0SW5Gb3JlY2FzdCA9IE51bWJlcihleGlzdGluZ091dC5JdGVtPy5vcHRJbkZvcmVjYXN0Py5OID8/IFwiMFwiKSA9PT0gMTtcbiAgY29uc3QgZXhpc3RpbmdGb3JlY2FzdEdlbmVyYXRlZEF0ID0gZXhpc3RpbmdPdXQuSXRlbT8uZm9yZWNhc3RHZW5lcmF0ZWRBdD8uUztcbiAgY29uc3QgZXhpc3RpbmdGb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA9XG4gICAgTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPy5OID8/IFwiMFwiKSA9PT0gMTtcbiAgY29uc3QgZXhpc3RpbmdXZWVrbHlEaWdlc3RFbWFpbCA9IE51bWJlcihleGlzdGluZ091dC5JdGVtPy53ZWVrbHlEaWdlc3RFbWFpbD8uTiA/PyBcIjBcIikgPT09IDE7XG5cbiAgbGV0IG5leHRQbGF0ZWF1ID0gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oZXhpc3RpbmdPdXQuSXRlbSk7XG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYm9keSwgXCJwbGF0ZWF1XCIpKSB7XG4gICAgY29uc3QgcmF3UGxhdGVhdSA9IGJvZHkucGxhdGVhdTtcbiAgICBpZiAocmF3UGxhdGVhdSA9PT0gbnVsbCkge1xuICAgICAgbmV4dFBsYXRlYXUgPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHAgPSB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChyYXdQbGF0ZWF1KTtcbiAgICAgIGlmICghcC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHAuZXJyb3IgfSk7XG4gICAgICBuZXh0UGxhdGVhdSA9IHsgLi4ubmV4dFBsYXRlYXUsIC4uLnAuZGF0YSB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5nb2FsV2VpZ2h0KSB9LFxuICAgIHN0YXJ0V2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLnN0YXJ0V2VpZ2h0KSB9LFxuICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgdW5pdDogeyBTOiBkYXRhLnVuaXQgfSxcbiAgICB0b25lOiB7IFM6IHRvbmUgfSxcbiAgfTtcbiAgaWYgKG5leHRQbGF0ZWF1Py5yb2xsaW5nV2luZG93RGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Um9sbGluZ1dpbmRvd0RheXMgPSB7IE46IFN0cmluZyhNYXRoLnJvdW5kKG5leHRQbGF0ZWF1LnJvbGxpbmdXaW5kb3dEYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/LmNvbXBhcmlzb25TcGFuRGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5jb21wYXJpc29uU3BhbkRheXMpKSB9O1xuICB9XG4gIGlmIChuZXh0UGxhdGVhdT8ubWF4QXZnTW92ZW1lbnRLZyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1TWF4TW92ZW1lbnRLZyA9IHsgTjogU3RyaW5nKG5leHRQbGF0ZWF1Lm1heEF2Z01vdmVtZW50S2cpIH07XG4gIH1cbiAgaXRlbS5hY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yID0geyBOOiBTdHJpbmcoZXhpc3RpbmdDYWxpYnJhdGlvbikgfTtcbiAgaXRlbS5vcHRJbkZvcmVjYXN0ID0ge1xuICAgIE46IChkYXRhLm9wdEluRm9yZWNhc3QgPz8gZXhpc3RpbmdPcHRJbkZvcmVjYXN0KSA/IFwiMVwiIDogXCIwXCIsXG4gIH07XG4gIGNvbnN0IG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0ID0gZGF0YS5mb3JlY2FzdEdlbmVyYXRlZEF0ID8/IGV4aXN0aW5nRm9yZWNhc3RHZW5lcmF0ZWRBdDtcbiAgaWYgKHR5cGVvZiBuZXh0Rm9yZWNhc3RHZW5lcmF0ZWRBdCA9PT0gXCJzdHJpbmdcIiAmJiBuZXh0Rm9yZWNhc3RHZW5lcmF0ZWRBdC5sZW5ndGggPiAwKSB7XG4gICAgaXRlbS5mb3JlY2FzdEdlbmVyYXRlZEF0ID0geyBTOiBuZXh0Rm9yZWNhc3RHZW5lcmF0ZWRBdCB9O1xuICB9XG4gIGl0ZW0uZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgPSB7XG4gICAgTjogKGRhdGEuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgPz8gZXhpc3RpbmdGb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCkgPyBcIjFcIiA6IFwiMFwiLFxuICB9O1xuICBjb25zdCBuZXh0V2Vla2x5RGlnZXN0RW1haWwgPSBkYXRhLndlZWtseURpZ2VzdEVtYWlsID8/IGV4aXN0aW5nV2Vla2x5RGlnZXN0RW1haWw7XG4gIGl0ZW0ud2Vla2x5RGlnZXN0RW1haWwgPSB7IE46IG5leHRXZWVrbHlEaWdlc3RFbWFpbCA/IFwiMVwiIDogXCIwXCIgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBkYXRhLmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogZGF0YS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGRhdGEudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGRhdGEudW5pdCxcbiAgICAgIHRvbmUsXG4gICAgICBwbGF0ZWF1OiBuZXh0UGxhdGVhdSxcbiAgICAgIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I6IGV4aXN0aW5nQ2FsaWJyYXRpb24sXG4gICAgICBvcHRJbkZvcmVjYXN0OiBkYXRhLm9wdEluRm9yZWNhc3QgPz8gZXhpc3RpbmdPcHRJbkZvcmVjYXN0LFxuICAgICAgZm9yZWNhc3RHZW5lcmF0ZWRBdDogZGF0YS5mb3JlY2FzdEdlbmVyYXRlZEF0ID8/IGV4aXN0aW5nRm9yZWNhc3RHZW5lcmF0ZWRBdCxcbiAgICAgIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkOlxuICAgICAgICBkYXRhLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID8/IGV4aXN0aW5nRm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQsXG4gICAgICB3ZWVrbHlEaWdlc3RFbWFpbDogbmV4dFdlZWtseURpZ2VzdEVtYWlsLFxuICAgIH0sXG4gIH0pO1xufVxuXG50eXBlIFByb2dyZXNzUGhvdG9JdGVtID0ge1xuICBwaG90b0lkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBkYXRlOiBzdHJpbmc7XG4gIGltYWdlVXJsPzogc3RyaW5nO1xuICBzdG9yYWdlS2V5Pzogc3RyaW5nO1xuICB3ZWlnaHRBdFBob3RvPzogbnVtYmVyO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIHBhcnNlUHJvZ3Jlc3NQaG90b0Zyb21JdGVtKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9Pik6IFByb2dyZXNzUGhvdG9JdGVtIHwgbnVsbCB7XG4gIGNvbnN0IHBob3RvSWQgPSBpdGVtLnBob3RvSWQ/LlM7XG4gIGNvbnN0IHVzZXJJZCA9IGl0ZW0udXNlcklkPy5TO1xuICBjb25zdCBkYXRlID0gaXRlbS5kYXRlPy5TO1xuICBjb25zdCBjcmVhdGVkQXQgPSBpdGVtLmNyZWF0ZWRBdD8uUztcbiAgaWYgKCFwaG90b0lkIHx8ICF1c2VySWQgfHwgIWRhdGUgfHwgIWNyZWF0ZWRBdCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGltYWdlVXJsID0gaXRlbS5pbWFnZVVybD8uUztcbiAgY29uc3Qgc3RvcmFnZUtleSA9IGl0ZW0uc3RvcmFnZUtleT8uUztcbiAgY29uc3Qgd2VpZ2h0UmF3ID0gaXRlbS53ZWlnaHRBdFBob3RvPy5OO1xuICBjb25zdCB3ZWlnaHRBdFBob3RvID0gd2VpZ2h0UmF3ICE9IG51bGwgPyBOdW1iZXIod2VpZ2h0UmF3KSA6IHVuZGVmaW5lZDtcbiAgcmV0dXJuIHtcbiAgICBwaG90b0lkLFxuICAgIHVzZXJJZCxcbiAgICBkYXRlLFxuICAgIGltYWdlVXJsOiBpbWFnZVVybCB8fCB1bmRlZmluZWQsXG4gICAgc3RvcmFnZUtleTogc3RvcmFnZUtleSB8fCB1bmRlZmluZWQsXG4gICAgd2VpZ2h0QXRQaG90bzogTnVtYmVyLmlzRmluaXRlKHdlaWdodEF0UGhvdG8gPz8gTmFOKSA/IHdlaWdodEF0UGhvdG8gOiB1bmRlZmluZWQsXG4gICAgY3JlYXRlZEF0LFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0UHJvZ3Jlc3NQaG90b3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgaXRlbXMgPSAob3V0Lkl0ZW1zID8/IFtdKVxuICAgIC5tYXAoKGl0ZW0pID0+IHBhcnNlUHJvZ3Jlc3NQaG90b0Zyb21JdGVtKGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+KSlcbiAgICAuZmlsdGVyKChyb3cpOiByb3cgaXMgUHJvZ3Jlc3NQaG90b0l0ZW0gPT4gcm93ICE9PSBudWxsKVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLmRhdGUubG9jYWxlQ29tcGFyZShhLmRhdGUpKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGl0ZW1zIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVQcm9ncmVzc1Bob3RvKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJQUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRVwiLCBwcm9ncmVzc1Bob3Rvc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogdW5kZWZpbmVkO1xuICBjb25zdCBpbWFnZVVybCA9IHR5cGVvZiBib2R5LmltYWdlVXJsID09PSBcInN0cmluZ1wiID8gYm9keS5pbWFnZVVybC50cmltKCkgOiBcIlwiO1xuICBjb25zdCBzdG9yYWdlS2V5ID0gdHlwZW9mIGJvZHkuc3RvcmFnZUtleSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuc3RvcmFnZUtleS50cmltKCkgOiBcIlwiO1xuICBjb25zdCB3ZWlnaHRBdFBob3RvID0gYm9keS53ZWlnaHRBdFBob3RvID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBOdW1iZXIoYm9keS53ZWlnaHRBdFBob3RvKTtcbiAgaWYgKCFkYXRlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG4gIGlmICghaW1hZ2VVcmwgJiYgIXN0b3JhZ2VLZXkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJNaXNzaW5nIGltYWdlVXJsIG9yIHN0b3JhZ2VLZXlcIiB9KTtcbiAgaWYgKFxuICAgIHdlaWdodEF0UGhvdG8gIT09IHVuZGVmaW5lZCAmJlxuICAgICghTnVtYmVyLmlzRmluaXRlKHdlaWdodEF0UGhvdG8pIHx8IHdlaWdodEF0UGhvdG8gPD0gMCB8fCB3ZWlnaHRBdFBob3RvID4gMTAwMClcbiAgKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgd2VpZ2h0QXRQaG90b1wiIH0pO1xuICB9XG4gIGNvbnN0IHBob3RvSWQgPSByYW5kb21VVUlEKCk7XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBwaG90b0lkOiB7IFM6IHBob3RvSWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICBjcmVhdGVkQXQ6IHsgUzogY3JlYXRlZEF0IH0sXG4gIH07XG4gIGlmIChpbWFnZVVybCkgaXRlbS5pbWFnZVVybCA9IHsgUzogaW1hZ2VVcmwgfTtcbiAgaWYgKHN0b3JhZ2VLZXkpIGl0ZW0uc3RvcmFnZUtleSA9IHsgUzogc3RvcmFnZUtleSB9O1xuICBpZiAod2VpZ2h0QXRQaG90byAhPT0gdW5kZWZpbmVkKSBpdGVtLndlaWdodEF0UGhvdG8gPSB7IE46IFN0cmluZyh3ZWlnaHRBdFBob3RvKSB9O1xuICBhd2FpdCBkZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IHRhYmxlLCBJdGVtOiBpdGVtIGFzIG5ldmVyIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgaXRlbToge1xuICAgICAgcGhvdG9JZCxcbiAgICAgIHVzZXJJZCxcbiAgICAgIGRhdGUsXG4gICAgICBpbWFnZVVybDogaW1hZ2VVcmwgfHwgdW5kZWZpbmVkLFxuICAgICAgc3RvcmFnZUtleTogc3RvcmFnZUtleSB8fCB1bmRlZmluZWQsXG4gICAgICB3ZWlnaHRBdFBob3RvLFxuICAgICAgY3JlYXRlZEF0LFxuICAgIH0sXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVQcm9ncmVzc1Bob3RvKHVzZXJJZDogc3RyaW5nLCBwaG90b0lkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBwaG90b0lkOiB7IFM6IHBob3RvSWQgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxudHlwZSBCb2R5Q29tcGFyZUFzc2Vzc21lbnRSZXN1bHQgPSB7XG4gIHN1bW1hcnk6IHN0cmluZztcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xuICBlc3RpbWF0ZWQ6IGJvb2xlYW47XG4gIGRpc2NsYWltZXI6IHN0cmluZztcbiAgaGlnaGxpZ2h0czogQXJyYXk8e1xuICAgIGFyZWE6IHN0cmluZztcbiAgICBhc3Nlc3NtZW50OiBzdHJpbmc7XG4gICAgZGlyZWN0aW9uOiBcImxlYW5lclwiIHwgXCJ1bmNoYW5nZWRcIiB8IFwidW5jZXJ0YWluXCI7XG4gIH0+O1xufTtcblxuZnVuY3Rpb24gZXh0cmFjdEZpcnN0SnNvbk9iamVjdChyYXc6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCB0ZXh0ID0gcmF3LnRyaW0oKTtcbiAgY29uc3Qgc3RhcnQgPSB0ZXh0LmluZGV4T2YoXCJ7XCIpO1xuICBpZiAoc3RhcnQgPCAwKSByZXR1cm4gbnVsbDtcbiAgbGV0IGRlcHRoID0gMDtcbiAgbGV0IGluU3RyaW5nID0gZmFsc2U7XG4gIGxldCBlc2NhcGUgPSBmYWxzZTtcbiAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgdGV4dC5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGNvbnN0IGMgPSB0ZXh0W2ldITtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICBlc2NhcGUgPSBmYWxzZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA9PT0gXCJcXFxcXCIgJiYgaW5TdHJpbmcpIHtcbiAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGMgPT09IFwiXFxcIlwiKSB7XG4gICAgICBpblN0cmluZyA9ICFpblN0cmluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoIWluU3RyaW5nKSB7XG4gICAgICBpZiAoYyA9PT0gXCJ7XCIpIGRlcHRoICs9IDE7XG4gICAgICBpZiAoYyA9PT0gXCJ9XCIpIHtcbiAgICAgICAgZGVwdGggLT0gMTtcbiAgICAgICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gdGV4dC5zbGljZShzdGFydCwgaSArIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcGFyc2VCb2R5Q29tcGFyZUFzc2Vzc21lbnQocmF3OiBzdHJpbmcpOiBCb2R5Q29tcGFyZUFzc2Vzc21lbnRSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QganNvblRleHQgPSBleHRyYWN0Rmlyc3RKc29uT2JqZWN0KHJhdyk7XG4gIGlmICghanNvblRleHQpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvblRleHQpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHN1bW1hcnkgPSB0eXBlb2YgcGFyc2VkLnN1bW1hcnkgPT09IFwic3RyaW5nXCIgPyBwYXJzZWQuc3VtbWFyeS50cmltKCkgOiBcIlwiO1xuICAgIGNvbnN0IGNvbmZpZGVuY2UgPSBOdW1iZXIocGFyc2VkLmNvbmZpZGVuY2UpO1xuICAgIGNvbnN0IGRpc2NsYWltZXIgPSB0eXBlb2YgcGFyc2VkLmRpc2NsYWltZXIgPT09IFwic3RyaW5nXCIgPyBwYXJzZWQuZGlzY2xhaW1lci50cmltKCkgOiBcIlwiO1xuICAgIGlmICghc3VtbWFyeSB8fCAhTnVtYmVyLmlzRmluaXRlKGNvbmZpZGVuY2UpIHx8ICFkaXNjbGFpbWVyKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBoaWdobGlnaHRzUmF3ID0gQXJyYXkuaXNBcnJheShwYXJzZWQuaGlnaGxpZ2h0cykgPyBwYXJzZWQuaGlnaGxpZ2h0cyA6IFtdO1xuICAgIGNvbnN0IGhpZ2hsaWdodHMgPSBoaWdobGlnaHRzUmF3XG4gICAgICAubWFwKChlbnRyeSkgPT4ge1xuICAgICAgICBjb25zdCBlID0gZW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgIGNvbnN0IGFyZWEgPSB0eXBlb2YgZS5hcmVhID09PSBcInN0cmluZ1wiID8gZS5hcmVhLnRyaW0oKSA6IFwiXCI7XG4gICAgICAgIGNvbnN0IGFzc2Vzc21lbnQgPSB0eXBlb2YgZS5hc3Nlc3NtZW50ID09PSBcInN0cmluZ1wiID8gZS5hc3Nlc3NtZW50LnRyaW0oKSA6IFwiXCI7XG4gICAgICAgIGNvbnN0IGRpcmVjdGlvblJhdyA9IHR5cGVvZiBlLmRpcmVjdGlvbiA9PT0gXCJzdHJpbmdcIiA/IGUuZGlyZWN0aW9uIDogXCJ1bmNlcnRhaW5cIjtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uID1cbiAgICAgICAgICBkaXJlY3Rpb25SYXcgPT09IFwibGVhbmVyXCIgfHwgZGlyZWN0aW9uUmF3ID09PSBcInVuY2hhbmdlZFwiIHx8IGRpcmVjdGlvblJhdyA9PT0gXCJ1bmNlcnRhaW5cIlxuICAgICAgICAgICAgPyBkaXJlY3Rpb25SYXdcbiAgICAgICAgICAgIDogXCJ1bmNlcnRhaW5cIjtcbiAgICAgICAgaWYgKCFhcmVhIHx8ICFhc3Nlc3NtZW50KSByZXR1cm4gbnVsbDtcbiAgICAgICAgcmV0dXJuIHsgYXJlYSwgYXNzZXNzbWVudCwgZGlyZWN0aW9uIH07XG4gICAgICB9KVxuICAgICAgLmZpbHRlcihcbiAgICAgICAgKHYpOiB2IGlzIHsgYXJlYTogc3RyaW5nOyBhc3Nlc3NtZW50OiBzdHJpbmc7IGRpcmVjdGlvbjogXCJsZWFuZXJcIiB8IFwidW5jaGFuZ2VkXCIgfCBcInVuY2VydGFpblwiIH0gPT5cbiAgICAgICAgICB2ICE9PSBudWxsLFxuICAgICAgKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3VtbWFyeSxcbiAgICAgIGNvbmZpZGVuY2U6IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgTWF0aC5yb3VuZChjb25maWRlbmNlKSkpLFxuICAgICAgZXN0aW1hdGVkOiB0cnVlLFxuICAgICAgZGlzY2xhaW1lcixcbiAgICAgIGhpZ2hsaWdodHMsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYXNzZXNzUHJvZ3Jlc3NQaG90b3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc0JvZHlDb21wYXJlQWlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiQUkgcGhvdG8gY29tcGFyZSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBhcGlLZXkgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWT8udHJpbSgpO1xuICBpZiAoIWFwaUtleSkgcmV0dXJuIGpzb24oNTAzLCB7IGVycm9yOiBcIkFJIGNvbXBhcmUgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gIGNvbnN0IHJhdyA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBib2R5XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHBob3Rvc1JhdyA9IEFycmF5LmlzQXJyYXkoYm9keS5waG90b3MpID8gYm9keS5waG90b3MgOiBbXTtcbiAgY29uc3QgcXVlcnkgPSB0eXBlb2YgYm9keS5xdWVyeSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkucXVlcnkudHJpbSgpIDogXCJcIjtcbiAgdHlwZSBQaG90b0l0ZW0gPSB7XG4gICAgZGF0ZTogc3RyaW5nO1xuICAgIHBob3RvVXJsOiBzdHJpbmc7XG4gICAgaW1hZ2VCYXNlNjQ6IHN0cmluZztcbiAgICBtZWRpYVR5cGU6IHN0cmluZztcbiAgfTtcbiAgY29uc3QgcGhvdG9zOiBQaG90b0l0ZW1bXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiBwaG90b3NSYXcpIHtcbiAgICBjb25zdCBwID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IGRhdGUgPSB0eXBlb2YgcC5kYXRlID09PSBcInN0cmluZ1wiID8gcC5kYXRlIDogXCJcIjtcbiAgICBjb25zdCBwaG90b1VybCA9IHR5cGVvZiBwLnBob3RvVXJsID09PSBcInN0cmluZ1wiID8gcC5waG90b1VybC50cmltKCkgOiBcIlwiO1xuICAgIGNvbnN0IGltYWdlQmFzZTY0ID1cbiAgICAgIHR5cGVvZiBwLmltYWdlQmFzZTY0ID09PSBcInN0cmluZ1wiID8gcC5pbWFnZUJhc2U2NC5yZXBsYWNlKC9cXHMvZywgXCJcIikgOiBcIlwiO1xuICAgIGNvbnN0IG1lZGlhVHlwZSA9IHR5cGVvZiBwLm1lZGlhVHlwZSA9PT0gXCJzdHJpbmdcIiA/IHAubWVkaWFUeXBlLnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcbiAgICBpZiAoIWlzRGF0ZVN0cmluZyhkYXRlKSkgY29udGludWU7XG4gICAgaWYgKHBob3RvVXJsKSB7XG4gICAgICBwaG90b3MucHVzaCh7IGRhdGUsIHBob3RvVXJsLCBpbWFnZUJhc2U2NDogXCJcIiwgbWVkaWFUeXBlOiBcIlwiIH0pO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBpbWFnZUJhc2U2NCAmJlxuICAgICAgKG1lZGlhVHlwZSA9PT0gXCJpbWFnZS9qcGVnXCIgfHxcbiAgICAgICAgbWVkaWFUeXBlID09PSBcImltYWdlL3BuZ1wiIHx8XG4gICAgICAgIG1lZGlhVHlwZSA9PT0gXCJpbWFnZS9naWZcIiB8fFxuICAgICAgICBtZWRpYVR5cGUgPT09IFwiaW1hZ2Uvd2VicFwiKVxuICAgICkge1xuICAgICAgcGhvdG9zLnB1c2goeyBkYXRlLCBwaG90b1VybDogXCJcIiwgaW1hZ2VCYXNlNjQsIG1lZGlhVHlwZSB9KTtcbiAgICB9XG4gIH1cbiAgaWYgKHBob3Rvcy5sZW5ndGggPCAyKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkF0IGxlYXN0IHR3byBwaG90b3MgYXJlIHJlcXVpcmVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHNlbGVjdGVkID0gcGhvdG9zLnNsaWNlKDAsIDgpLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xuICB0eXBlIENvbXBhcmVDb250ZW50QmxvY2sgPVxuICAgIHwgeyB0eXBlOiBcInRleHRcIjsgdGV4dDogc3RyaW5nIH1cbiAgICB8IHtcbiAgICAgICAgdHlwZTogXCJpbWFnZVwiO1xuICAgICAgICBzb3VyY2U6IHtcbiAgICAgICAgICB0eXBlOiBcImJhc2U2NFwiO1xuICAgICAgICAgIG1lZGlhX3R5cGU6IFwiaW1hZ2UvanBlZ1wiIHwgXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3dlYnBcIjtcbiAgICAgICAgICBkYXRhOiBzdHJpbmc7XG4gICAgICAgIH07XG4gICAgICB9O1xuICBjb25zdCBjb250ZW50OiBDb21wYXJlQ29udGVudEJsb2NrW10gPSBbXTtcbiAgZm9yIChjb25zdCBwIG9mIHNlbGVjdGVkKSB7XG4gICAgbGV0IGJ1ZjogQnVmZmVyO1xuICAgIGxldCBtZWRpYVR5cGU6IFwiaW1hZ2UvanBlZ1wiIHwgXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3dlYnBcIjtcbiAgICBpZiAocC5waG90b1VybCkge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHAucGhvdG9VcmwpO1xuICAgICAgaWYgKCFub3JtYWxpemVkKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwaG90byByZWZlcmVuY2UuXCIgfSk7XG4gICAgICBjb25zdCByZWYgPSBwYXJzZVMzVXJpKG5vcm1hbGl6ZWQpO1xuICAgICAgaWYgKCFyZWYpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJPbmx5IHMzOi8vIHBob3RvIHJlZmVyZW5jZXMgYXJlIHN1cHBvcnRlZC5cIiB9KTtcbiAgICAgIGlmICghcGhvdG9CdWNrZXROYW1lIHx8IHJlZi5idWNrZXQgIT09IHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwaG90byBidWNrZXQuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIXMzS2V5QWxsb3dlZEZvclVzZXIocmVmLmtleSwgdXNlcklkKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiUGhvdG8gZG9lcyBub3QgYmVsb25nIHRvIHRoaXMgdXNlci5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGxldCBieXRlczogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb250ZW50VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgczMuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogcmVmLmJ1Y2tldCwgS2V5OiByZWYua2V5IH0pKTtcbiAgICAgICAgYnl0ZXMgPSBhd2FpdCBvdXQuQm9keT8udHJhbnNmb3JtVG9CeXRlQXJyYXkoKTtcbiAgICAgICAgY29udGVudFR5cGUgPSBvdXQuQ29udGVudFR5cGU7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkNvdWxkIG5vdCByZWFkIG9uZSBvZiB0aGUgcGhvdG9zLlwiIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCFieXRlcyB8fCBieXRlcy5sZW5ndGggPT09IDApIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJFbXB0eSBwaG90byBmb3VuZC5cIiB9KTtcbiAgICAgIGJ1ZiA9IEJ1ZmZlci5mcm9tKGJ5dGVzKTtcbiAgICAgIGlmIChieXRlcy5sZW5ndGggPiAxMiAqIDEwMjQgKiAxMDI0KSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQSBwaG90byBpcyB0b28gbGFyZ2UuXCIgfSk7XG4gICAgICBpZiAoaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdChyZWYua2V5LCBjb250ZW50VHlwZSkgfHwgYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZihidWYpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJIRUlDL0hFSUYgaW1hZ2VzIGFyZSBub3Qgc3VwcG9ydGVkLiBVc2UgSlBFRy9QTkcvV2ViUC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIG1lZGlhVHlwZSA9IGd1ZXNzRm9vZEltYWdlTWVkaWFUeXBlKHJlZi5rZXksIGNvbnRlbnRUeXBlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IGRlY29kZWQ6IEJ1ZmZlcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRlY29kZWQgPSBCdWZmZXIuZnJvbShwLmltYWdlQmFzZTY0LCBcImJhc2U2NFwiKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbmxpbmUgcGhvdG8gZW5jb2RpbmcuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGVjb2RlZC5sZW5ndGggPT09IDAgfHwgZGVjb2RlZC5sZW5ndGggPiAxMiAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbmxpbmUgcGhvdG8gZW1wdHkgb3IgdG9vIGxhcmdlLlwiIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGJ1ZmZlckxvb2tzTGlrZUhlaWNPckhlaWYoZGVjb2RlZCkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkhFSUMvSEVJRiBpbWFnZXMgYXJlIG5vdCBzdXBwb3J0ZWQuIFVzZSBKUEVHL1BORy9XZWJQLlwiIH0pO1xuICAgICAgfVxuICAgICAgYnVmID0gZGVjb2RlZDtcbiAgICAgIG1lZGlhVHlwZSA9IHAubWVkaWFUeXBlIGFzIHR5cGVvZiBtZWRpYVR5cGU7XG4gICAgfVxuICAgIGNvbnRlbnQucHVzaCh7IHR5cGU6IFwidGV4dFwiLCB0ZXh0OiBgUGhvdG8gZGF0ZTogJHtwLmRhdGV9YCB9KTtcbiAgICBjb250ZW50LnB1c2goe1xuICAgICAgdHlwZTogXCJpbWFnZVwiLFxuICAgICAgc291cmNlOiB7IHR5cGU6IFwiYmFzZTY0XCIsIG1lZGlhX3R5cGU6IG1lZGlhVHlwZSwgZGF0YTogYnVmLnRvU3RyaW5nKFwiYmFzZTY0XCIpIH0sXG4gICAgfSk7XG4gIH1cbiAgY29uc3Qgc3lzdGVtID0gYFlvdSBhcmUgYW4gYXNzaXN0YW50IGZvciBhIGZpdG5lc3MgYXBwLiBDb21wYXJlIHVzZXIgcHJvZ3Jlc3MgcGhvdG9zIGFuZCBwcm92aWRlIGEgY2FyZWZ1bCBFU1RJTUFURSBvbmx5LlxuUnVsZXM6XG4tIERvIE5PVCBwcm92aWRlIGRpYWdub3NpcywgZGlzZWFzZSBjbGFpbXMsIG9yIG1lZGljYWwgYWR2aWNlLlxuLSBJZiBhbmdsZSwgbGlnaHRpbmcsIGNsb3RoaW5nLCBvciBwb3N0dXJlIGRpZmZlciwgZXhwbGljaXRseSBtZW50aW9uIHVuY2VydGFpbnR5LlxuLSBGb2N1cyBvbiB2aXNpYmxlIHRyZW5kIGN1ZXMgb25seSAobWlkc2VjdGlvbiwgd2Fpc3RsaW5lLCBmYWNlIGZ1bGxuZXNzLCBwb3N0dXJlIGNvbnNpc3RlbmN5KS5cbi0gUmV0dXJuIE9OTFkgSlNPTjpcbntcbiAgXCJzdW1tYXJ5XCI6IFwiMi00IHNlbnRlbmNlIHBsYWluLWxhbmd1YWdlIGVzdGltYXRlXCIsXG4gIFwiY29uZmlkZW5jZVwiOiAwLTEwMCxcbiAgXCJkaXNjbGFpbWVyXCI6IFwiT25lIHNlbnRlbmNlOiBlc3RpbWF0ZSBvbmx5LCBub3QgbWVkaWNhbCBhZHZpY2UuXCIsXG4gIFwiaGlnaGxpZ2h0c1wiOiBbXG4gICAgeyBcImFyZWFcIjogXCJzdHJpbmdcIiwgXCJhc3Nlc3NtZW50XCI6IFwic3RyaW5nXCIsIFwiZGlyZWN0aW9uXCI6IFwibGVhbmVyfHVuY2hhbmdlZHx1bmNlcnRhaW5cIiB9XG4gIF1cbn1gO1xuICBjb25zdCBtb2RlbCA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19CT0RZX0NPTVBBUkVfTU9ERUw/LnRyaW0oKSB8fCBcImNsYXVkZS1zb25uZXQtNC0yMDI1MDUxNFwiO1xuICB0cnkge1xuICAgIGNvbnN0IEFudGhyb3BpYyA9IChhd2FpdCBpbXBvcnQoXCJAYW50aHJvcGljLWFpL3Nka1wiKSkuZGVmYXVsdDtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQW50aHJvcGljKHsgYXBpS2V5IH0pO1xuICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBjbGllbnQubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgIG1vZGVsLFxuICAgICAgbWF4X3Rva2VuczogNzAwLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICAgIHN5c3RlbSxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAgICAuLi5jb250ZW50LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB0eXBlOiBcInRleHRcIixcbiAgICAgICAgICAgICAgdGV4dDpcbiAgICAgICAgICAgICAgICBxdWVyeSB8fFxuICAgICAgICAgICAgICAgIFwiQ29tcGFyZSB0aGVzZSBwaG90b3MgZnJvbSBvbGRlc3QgdG8gbmV3ZXN0IGFuZCBzdW1tYXJpemUgdmlzaWJsZSBjaGFuZ2UgdHJlbmRzIGFuZCB1bmNlcnRhaW50eS5cIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgdGV4dCA9IHJlc3AuY29udGVudC5maW5kKChwKSA9PiBwLnR5cGUgPT09IFwidGV4dFwiKT8udGV4dCA/PyBcIlwiO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlQm9keUNvbXBhcmVBc3Nlc3NtZW50KHRleHQpO1xuICAgIGlmICghcGFyc2VkKSByZXR1cm4ganNvbig1MDIsIHsgZXJyb3I6IFwiQ291bGQgbm90IHBhcnNlIEFJIGNvbXBhcmUgcmVzdWx0LlwiIH0pO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgLi4ucGFyc2VkLFxuICAgICAgdGltZWZyYW1lOiB7IGZyb206IHNlbGVjdGVkWzBdPy5kYXRlLCB0bzogc2VsZWN0ZWRbc2VsZWN0ZWQubGVuZ3RoIC0gMV0/LmRhdGUgfSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoSlNPTi5zdHJpbmdpZnkoeyBtc2c6IFwicHJvZ3Jlc3NfcGhvdG9fYXNzZXNzbWVudF9mYWlsZWRcIiwgZXJyOiBTdHJpbmcoZSkgfSkpO1xuICAgIHJldHVybiBqc29uKDUwMiwgeyBlcnJvcjogXCJBSSBjb21wYXJlIGZhaWxlZC4gUGxlYXNlIHRyeSBhZ2Fpbi5cIiB9KTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVVcGxvYWRVcmwodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gIGNvbnN0IGNvbnRlbnRUeXBlID1cbiAgICB0eXBlb2YgYm9keS5jb250ZW50VHlwZSA9PT0gXCJzdHJpbmdcIiAmJiBib2R5LmNvbnRlbnRUeXBlLmxlbmd0aCA+IDBcbiAgICAgID8gYm9keS5jb250ZW50VHlwZVxuICAgICAgOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICBjb25zdCBmaWxlTmFtZSA9IHR5cGVvZiBib2R5LmZpbGVOYW1lID09PSBcInN0cmluZ1wiID8gYm9keS5maWxlTmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBleHRGcm9tRmlsZU5hbWUgPSBmaWxlTmFtZS5tYXRjaCgvXFwuKFthLXpBLVowLTldKykkLyk/LlsxXT8udG9Mb3dlckNhc2UoKSA/PyBcIlwiO1xuICBjb25zdCBleHRGcm9tQm9keSA9XG4gICAgdHlwZW9mIGJvZHkuZXh0ZW5zaW9uID09PSBcInN0cmluZ1wiICYmIC9eW2EtekEtWjAtOV0rJC8udGVzdChib2R5LmV4dGVuc2lvbilcbiAgICAgID8gYm9keS5leHRlbnNpb24udG9Mb3dlckNhc2UoKVxuICAgICAgOiBcIlwiO1xuICBjb25zdCBleHRlbnNpb24gPVxuICAgIGV4dEZyb21GaWxlTmFtZSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUZpbGVOYW1lKVxuICAgICAgPyBleHRGcm9tRmlsZU5hbWVcbiAgICAgIDogZXh0RnJvbUJvZHkgJiYgL15bYS16MC05XSskLy50ZXN0KGV4dEZyb21Cb2R5KVxuICAgICAgICA/IGV4dEZyb21Cb2R5XG4gICAgICAgIDogXCJqcGdcIjtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qga2luZCA9IHR5cGVvZiBib2R5LmtpbmQgPT09IFwic3RyaW5nXCIgPyBib2R5LmtpbmQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICBjb25zdCBrZXkgPVxuICAgIGtpbmQgPT09IFwiZm9vZFwiXG4gICAgICA/IGAke3VzZXJJZH0vZm9vZC8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YFxuICAgICAgOiBgJHt1c2VySWR9LyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuXG4gIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgQnVja2V0OiBidWNrZXQsXG4gICAgS2V5OiBrZXksXG4gICAgQ29udGVudFR5cGU6IGNvbnRlbnRUeXBlLFxuICB9KTtcbiAgY29uc3QgdXBsb2FkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCBjb21tYW5kLCB7IGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyB9KTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1cGxvYWRVcmwsXG4gICAga2V5LFxuICAgIHBob3RvVXJsOiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YCxcbiAgICBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMsXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTdGF0cygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgW3VzZXJzT3V0LCB2aWV3c091dF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgU2NhbkNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgU2VsZWN0OiBcIkNPVU5UXCIsXG4gICAgICAgIEZpbHRlckV4cHJlc3Npb246IFwiI3VpZCA8PiA6bWV0YVVzZXJJZCBBTkQgYXR0cmlidXRlX2V4aXN0cyhnb2FsV2VpZ2h0KVwiLFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjdWlkXCI6IFwidXNlcklkXCIgfSxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjptZXRhVXNlcklkXCI6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICBdKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1c2VyczogTnVtYmVyKHVzZXJzT3V0LkNvdW50ID8/IDApLFxuICAgIHBhZ2VWaWV3czogTnVtYmVyKHZpZXdzT3V0Lkl0ZW0/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgcG9vbElkID0gZ2V0UmVxdWlyZWRFbnYoXCJVU0VSX1BPT0xfSURcIiwgdXNlclBvb2xJZEVudik7XG4gIGNvbnN0IHVzZXJzOiBBcnJheTx7XG4gICAgc3ViOiBzdHJpbmc7XG4gICAgZW1haWw/OiBzdHJpbmc7XG4gICAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICAgIGZ1bGxOYW1lPzogc3RyaW5nO1xuICAgIHN0YXR1cz86IHN0cmluZztcbiAgfT4gPSBbXTtcblxuICBsZXQgcGFnaW5hdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGRvIHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQoXG4gICAgICBuZXcgTGlzdFVzZXJzQ29tbWFuZCh7XG4gICAgICAgIFVzZXJQb29sSWQ6IHBvb2xJZCxcbiAgICAgICAgTGltaXQ6IDYwLFxuICAgICAgICBQYWdpbmF0aW9uVG9rZW46IHBhZ2luYXRpb25Ub2tlbixcbiAgICAgIH0pLFxuICAgICk7XG4gICAgZm9yIChjb25zdCB1IG9mIG91dC5Vc2VycyA/PyBbXSkge1xuICAgICAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3QgYSBvZiB1LkF0dHJpYnV0ZXMgPz8gW10pIHtcbiAgICAgICAgaWYgKGEuTmFtZSAmJiBhLlZhbHVlKSBhdHRyc1thLk5hbWVdID0gYS5WYWx1ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZ1bGxOYW1lID0gYXR0cnMubmFtZTtcbiAgICAgIGNvbnN0IGdpdmVuID0gYXR0cnMuZ2l2ZW5fbmFtZTtcbiAgICAgIGNvbnN0IGZpcnN0TmFtZSA9XG4gICAgICAgIGdpdmVuID8/IChmdWxsTmFtZSA/IGZ1bGxOYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdIDogdW5kZWZpbmVkKTtcbiAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICBzdWI6IGF0dHJzLnN1YiA/PyB1LlVzZXJuYW1lID8/IFwiXCIsXG4gICAgICAgIGVtYWlsOiBhdHRycy5lbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBmdWxsTmFtZSxcbiAgICAgICAgc3RhdHVzOiB1LlVzZXJTdGF0dXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgcGFnaW5hdGlvblRva2VuID0gb3V0LlBhZ2luYXRpb25Ub2tlbjtcbiAgfSB3aGlsZSAocGFnaW5hdGlvblRva2VuKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgY291bnQ6IHVzZXJzLmxlbmd0aCwgdXNlcnMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudFBhZ2VWaWV3KCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJBREQgcGFnZVZpZXdzIDppbmMgU0VUIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6aW5jXCI6IHsgTjogXCIxXCIgfSxcbiAgICAgICAgXCI6dXBkYXRlZEF0XCI6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiBcIlVQREFURURfTkVXXCIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgcGFnZVZpZXdzOiBOdW1iZXIob3V0LkF0dHJpYnV0ZXM/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEZlYXR1cmVGbGFnc0ZvclVzZXIodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZnJvbURiID0gKG91dC5JdGVtcyA/PyBbXSkucmVkdWNlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PigoYWNjLCBpdGVtKSA9PiB7XG4gICAgY29uc3QgZmxhZyA9IGl0ZW0uZmxhZz8uUztcbiAgICBjb25zdCBlbmFibGVkUmF3ID0gaXRlbS5lbmFibGVkPy5CT09MO1xuICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgZW5hYmxlZFJhdyA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgIGFjY1tmbGFnXSA9IGVuYWJsZWRSYXc7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICBjb25zdCBzZXJ2ZXJEZWZhdWx0czogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcbiAgY29uc3QgcGhvdG9Gb29kID0gZW52RmxhZ1RyaVN0YXRlKFwiRkZfUEhPVE9fRk9PRF9MT0dcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX1BIT1RPX0ZPT0RfTE9HID0gcGhvdG9Gb29kICE9PSBmYWxzZTtcbiAgY29uc3QgbWVhbExpYnJhcnkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9NRUFMX0xJQlJBUllcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX01FQUxfTElCUkFSWSA9IG1lYWxMaWJyYXJ5ICE9PSBmYWxzZTtcbiAgY29uc3QgbmxNZWFsUGFyc2UgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9OTF9NRUFMX1BBUlNFXCIpO1xuICBzZXJ2ZXJEZWZhdWx0cy5GRl9OTF9NRUFMX1BBUlNFID0gbmxNZWFsUGFyc2UgIT09IGZhbHNlO1xuICBjb25zdCBib2R5Q29tcGFyZUFpID0gZW52RmxhZ1RyaVN0YXRlKFwiRkZfQk9EWV9DT01QQVJFX0FJXCIpO1xuICBzZXJ2ZXJEZWZhdWx0cy5GRl9CT0RZX0NPTVBBUkVfQUkgPSBib2R5Q29tcGFyZUFpICE9PSBmYWxzZTtcbiAgY29uc3QgcGVyc29uYWxpemVkQ29hY2hpbmcgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkdcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElORyA9IHBlcnNvbmFsaXplZENvYWNoaW5nICE9PSBmYWxzZTtcblxuICBjb25zdCBvdmVycmlkZXMgPSB7IC4uLnNlcnZlckRlZmF1bHRzLCAuLi5mcm9tRGIgfTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IHVzZXJJZCwgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0RmVhdHVyZUZsYWdPdmVycmlkZXMoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRhcmdldFVzZXJJZCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkO1xuICBpZiAoIXRhcmdldFVzZXJJZCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJNaXNzaW5nIHVzZXJJZCBxdWVyeSBwYXJhbWV0ZXJcIiB9KTtcbiAgfVxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHRhcmdldFVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3Qgb3ZlcnJpZGVzID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKChpdGVtKSA9PiAoe1xuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdGFyZ2V0VXNlcklkLFxuICAgIGZsYWc6IGl0ZW0uZmxhZz8uUyA/PyBcIlwiLFxuICAgIGVuYWJsZWQ6IGl0ZW0uZW5hYmxlZD8uQk9PTCA/PyBmYWxzZSxcbiAgICB0czogaXRlbS50cz8uUyA/PyBcIlwiLFxuICB9KSk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEZlYXR1cmVGbGFnT3ZlcnJpZGUoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgdXNlcklkID0gdHlwZW9mIGJvZHkudXNlcklkID09PSBcInN0cmluZ1wiID8gYm9keS51c2VySWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgcmF3RmxhZyA9IHR5cGVvZiBib2R5LmZsYWcgPT09IFwic3RyaW5nXCIgPyBib2R5LmZsYWcudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgZW5hYmxlZCA9IHR5cGVvZiBib2R5LmVuYWJsZWQgPT09IFwiYm9vbGVhblwiID8gYm9keS5lbmFibGVkIDogbnVsbDtcbiAgaWYgKCF1c2VySWQgfHwgIXJhd0ZsYWcgfHwgZW5hYmxlZCA9PT0gbnVsbCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBheWxvYWQuIEV4cGVjdGVkIHVzZXJJZCwgZmxhZywgZW5hYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBub3JtYWxpemVkRmxhZyA9IHJhd0ZsYWcuc3RhcnRzV2l0aChcIkZGX1wiKSA/IHJhd0ZsYWcgOiBgRkZfJHtyYXdGbGFnfWA7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZmxhZzogeyBTOiBub3JtYWxpemVkRmxhZyB9LFxuICAgICAgICBlbmFibGVkOiB7IEJPT0w6IGVuYWJsZWQgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgb3ZlcnJpZGU6IHsgdXNlcklkLCBmbGFnOiBub3JtYWxpemVkRmxhZywgZW5hYmxlZCwgdHMgfSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGF3YWl0IGVuc3VyZUFudGhyb3BpY0FwaUtleUZyb21TZWNyZXRzKCk7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2JpbGxpbmcvY2hlY2tvdXQtc2Vzc2lvblwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVCaWxsaW5nQ2hlY2tvdXRTZXNzaW9uKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9iaWxsaW5nL3BvcnRhbFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVCaWxsaW5nUG9ydGFsU2Vzc2lvbih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi93ZWVrbHktcmVwb3J0L3NlbmQtZW1haWxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaGFuZGxlUG9zdFYyV2Vla2x5UmVwb3J0U2VuZEVtYWlsKGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50KSwgZXZlbnQsIGpzb24pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRJbnNpZ2h0c1YyKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2VzdGltYXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZEVzdGltYXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBzMyxcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUsXG4gICAgICAgIHBob3RvQnVja2V0TmFtZTogYnVja2V0LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTG9nQ29uZmlybSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2VzdGltYXRlLWJ1cm5cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaGFuZGxlVjJBY3Rpdml0eUVzdGltYXRlQnVybihldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3ZvaWNlLWRhaWx5LWxvZy9wYXJzZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGxldCBwYXlsb2FkOiB1bmtub3duO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gICAgICBjb25zdCB0cmFuc2NyaXB0ID0gdHlwZW9mIGJvZHkudHJhbnNjcmlwdCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkudHJhbnNjcmlwdCA6IFwiXCI7XG4gICAgICBpZiAoIXRyYW5zY3JpcHQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJ0cmFuc2NyaXB0IHJlcXVpcmVkXCIgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwYXJzZVZvaWNlRGFpbHlUcmFuc2NyaXB0V2l0aEFudGhyb3BpYyh0cmFuc2NyaXB0KTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9XG4gICAgICAgICAgcmVzdWx0LmVycm9yID09PSBcIm5vX2FwaV9rZXlcIiB8fCByZXN1bHQuZXJyb3IgPT09IFwidm9pY2VfcGFyc2VfdGltZW91dFwiID8gNTAzIDogNDIyO1xuICAgICAgICByZXR1cm4ganNvbihzdGF0dXMsIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBwYXJzZWQ6IHJlc3VsdC5wYXJzZWQgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9sb2dcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlMb2codXNlcklkLCBldmVudCwgeyBkZGIsIGVudHJpZXNUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvY2FsaWJyYXRpb25cIiAmJiBtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBzZXR0aW5nc1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9lbmVyZ3ktd2Vla2x5LXN1bW1hcnlcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGVUID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gICAgICBjb25zdCBkVCA9IGdldFJlcXVpcmVkRW52KFwiREFZX01FQUxfRU5UUklFU19UQUJMRV9OQU1FXCIsIGRheU1lYWxFbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIGNvbnN0IHNUID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnkodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGVudHJpZXNUYWJsZU5hbWU6IGVULFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIHNldHRpbmdzVGFibGVOYW1lOiBzVCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gbGlzdFByb2dyZXNzUGhvdG9zKHVzZXJJZCk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9wcm9ncmVzcy1waG90b3NcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlUHJvZ3Jlc3NQaG90byh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3Byb2dyZXNzLXBob3Rvcy9hc3Nlc3NtZW50XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGFzc2Vzc1Byb2dyZXNzUGhvdG9zKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cbiAgICBjb25zdCBwcm9ncmVzc0RlbE1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvcHJvZ3Jlc3MtcGhvdG9zXFwvKFteL10rKSQvKTtcbiAgICBpZiAocHJvZ3Jlc3NEZWxNYXRjaCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIHJldHVybiBkZWxldGVQcm9ncmVzc1Bob3RvKHVzZXJJZCwgZGVjb2RlVVJJQ29tcG9uZW50KHByb2dyZXNzRGVsTWF0Y2hbMV0gPz8gXCJcIikpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL21lYWwtY29tcGxldGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBmb29kVCA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWZvb2RUIHx8ICFtVCB8fCAhZFQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogZm9vZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0xpc3QodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHNcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0NyZWF0ZSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxIaXN0b3J5TWF0Y2ggPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKylcXC9oaXN0b3J5JC8pO1xuICAgIGlmIChtZWFsSGlzdG9yeU1hdGNoICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0hpc3RvcnkodXNlcklkLCBtZWFsSGlzdG9yeU1hdGNoWzFdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxQYXRjaERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL21lYWxzXFwvKFteL10rKSQvKTtcbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzUGF0Y2godXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0RlbGV0ZSh1c2VySWQsIG1lYWxQYXRjaERlbFsxXSwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXlNZWFsTGlzdE9yQ3JlYXRlID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvZGF5c1xcLyhbXFxkLV0rKVxcL21lYWwtZW50cmllcyQvKTtcbiAgICBpZiAoZGF5TWVhbExpc3RPckNyZWF0ZSAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNMaXN0KHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUIHx8ICFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNDcmVhdGUodXNlcklkLCBkYXlNZWFsTGlzdE9yQ3JlYXRlWzFdLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgICAgbWVhbHNUYWJsZU5hbWU6IG1ULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXNcXC8oW14vXSspJC8pO1xuICAgIGlmIChkYXlNZWFsRGVsICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUodXNlcklkLCBkYXlNZWFsRGVsWzFdLCBkYXlNZWFsRGVsWzJdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2ZlYXR1cmUtZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19