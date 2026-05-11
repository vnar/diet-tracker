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
    const raw = process.env.ADMIN_EMAILS?.trim() || "viharnar@gmail.com";
    const parts = raw
        .split(",")
        .map((s) => normalizeEmailForAdminMatch(s.trim()))
        .filter(Boolean);
    const set = new Set(parts);
    if (set.size === 0) {
        set.add(normalizeEmailForAdminMatch("viharnar@gmail.com"));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEyd0RBLDBCQWlQQztBQTUvREQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZDQUF5QztBQUN6QyxtREFNaUM7QUFFakMsdURBQStFO0FBQy9FLHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsaURBS3dCO0FBQ3hCLDJDQVdxQjtBQUNyQixnRkFBb0c7QUFDcEcsK0NBQXlGO0FBQ3pGLHlFQUErRTtBQUUvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksZ0VBQTZCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3hELE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUMxRCxNQUFNLHdCQUF3QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDekUsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDO0FBQ3BGLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7QUFDcEQsTUFBTSx1QkFB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SSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQzdFLE9BQU8sd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsQ0FBQztRQUVELElBQUksS0FBSyxDQUFDLE9BQU8sS0FBSyxjQUFjLElBQUksTUFBTSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3pELElBQUksQ0FBQyxDQUFDLE1BQU0sY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUFFLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQzdFLE9BQU8seUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsSUFBSSxLQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDL0QsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQge1xuICBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmLFxuICBndWVzc0Zvb2RJbWFnZU1lZGlhVHlwZSxcbiAgaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdCxcbiAgcGFyc2VTM1VyaSxcbiAgczNLZXlBbGxvd2VkRm9yVXNlcixcbn0gZnJvbSBcIi4uLy4uLy4uL2xpYi9mb29kL3MzVXJpXCI7XG5pbXBvcnQgdHlwZSB7IEFpSW5zaWdodFN0cnVjdHVyZWQgfSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2FpSW5zaWdodFN0cnVjdHVyZWRcIjtcbmltcG9ydCB7IGJ1aWxkUGVyc29uYWxpemVkQ29hY2hpbmdQYXlsb2FkIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9haU51ZGdlcy9pbmRleFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVBaUluc2lnaHRDYXJkIH0gZnJvbSBcIi4vaW5zaWdodHMtYWktY2FyZFwiO1xuaW1wb3J0IHsgaGFuZGxlVjJGb29kRXN0aW1hdGUsIGhhbmRsZVYyRm9vZExvZ0NvbmZpcm0gfSBmcm9tIFwiLi9mb29kLWxvZy1hcGlcIjtcbmltcG9ydCB7XG4gIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoLFxuICBoYW5kbGVWMkFjdGl2aXR5RXN0aW1hdGVCdXJuLFxuICBoYW5kbGVWMkFjdGl2aXR5TG9nLFxuICBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnksXG59IGZyb20gXCIuL2FjdGl2aXR5LWFwaVwiO1xuaW1wb3J0IHtcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlLFxuICBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUsXG4gIGhhbmRsZVYyTWVhbHNDcmVhdGUsXG4gIGhhbmRsZVYyTWVhbHNEZWxldGUsXG4gIGhhbmRsZVYyTWVhbHNIaXN0b3J5LFxuICBoYW5kbGVWMk1lYWxzTGlzdCxcbiAgaGFuZGxlVjJNZWFsc1BhdGNoLFxuICBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoLFxufSBmcm9tIFwiLi9tZWFscy1hcGlcIjtcbmltcG9ydCB7IHBhcnNlVm9pY2VEYWlseVRyYW5zY3JpcHRXaXRoQW50aHJvcGljIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi92b2ljZURhaWx5TG9nL3BhcnNlVHJhbnNjcmlwdFwiO1xuaW1wb3J0IHsgaGFuZGxlQmlsbGluZ0NoZWNrb3V0U2Vzc2lvbiwgaGFuZGxlQmlsbGluZ1BvcnRhbFNlc3Npb24gfSBmcm9tIFwiLi9iaWxsaW5nLWFwaVwiO1xuaW1wb3J0IHsgaGFuZGxlUG9zdFYyV2Vla2x5UmVwb3J0U2VuZEVtYWlsIH0gZnJvbSBcIi4vd2Vla2x5LXJlcG9ydC1lbWFpbC1zZW5kXCI7XG5cbmNvbnN0IGRkYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7fSk7XG5jb25zdCBjb2duaXRvSWRwID0gbmV3IENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50KHt9KTtcblxuY29uc3QgZW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkVOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHNldHRpbmdzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuU0VUVElOR1NfVEFCTEVfTkFNRTtcbmNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRTtcbmNvbnN0IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FO1xuY29uc3QgcGhvdG9CdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUEhPVE9fQlVDS0VUX05BTUU7XG5jb25zdCBmb29kTG9nRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IG1lYWxzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuTUVBTFNfVEFCTEVfTkFNRTtcbmNvbnN0IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuREFZX01FQUxfRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3QgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5QUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xuICBhY3Rpdml0eVRleHQ/OiBzdHJpbmc7XG4gIGFjdGl2aXR5U3VtbWFyeT86IHN0cmluZztcbiAgYWN0aXZpdHlCdXJuS2NhbD86IG51bWJlcjtcbiAgYWN0aXZpdHlNZXQ/OiBudW1iZXI7XG4gIGFjdGl2aXR5TWludXRlcz86IG51bWJlcjtcbiAgYWN0aXZpdHlDb25maWRlbmNlPzogbnVtYmVyO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbiAgdG9uZT86IFwiZnJpZW5kbHlcIiB8IFwiY2xpbmljYWxcIiB8IFwidG91Z2gtbG92ZVwiIHwgXCJheXVydmVkaWNcIjtcbiAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj86IG51bWJlcjtcbiAgb3B0SW5Gb3JlY2FzdD86IGJvb2xlYW47XG4gIGZvcmVjYXN0R2VuZXJhdGVkQXQ/OiBzdHJpbmc7XG4gIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPzogYm9vbGVhbjtcbiAgd2Vla2x5RGlnZXN0RW1haWw/OiBib29sZWFuO1xufTtcblxudHlwZSBTdG9yZWRFbnRyeSA9IERhaWx5RW50cnlVcHNlcnQgJiB7XG4gIGlkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBub3Rlcz86IHN0cmluZztcbn07XG5cbnR5cGUgU3RvcmVkU2V0dGluZ3MgPSBTZXR0aW5nc1BhdGNoICYge1xuICB1c2VySWQ6IHN0cmluZztcbn07XG5cbnR5cGUgUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHtcbiAgcm9sbGluZ1dpbmRvd0RheXM/OiBudW1iZXI7XG4gIGNvbXBhcmlzb25TcGFuRGF5cz86IG51bWJlcjtcbiAgbWF4QXZnTW92ZW1lbnRLZz86IG51bWJlcjtcbn07XG5cbnR5cGUgSW5zaWdodENhcmQgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIHJ1bGVJZDogc3RyaW5nO1xuICBwcmlvcml0eTogbnVtYmVyO1xuICBoZWFkbGluZTogc3RyaW5nO1xuICBkZXRhaWw/OiBzdHJpbmc7XG4gIHdoeTogc3RyaW5nW107XG4gIGFjdGlvbjogc3RyaW5nO1xuICBjYXRlZ29yeTogXCJzb2RpdW1cIiB8IFwiYWxjb2hvbFwiIHwgXCJsYXRlX3NuYWNrXCIgfCBcIndvcmtvdXRcIiB8IFwicGxhdGVhdVwiIHwgXCJzdHJlYWtcIiB8IFwidHJhamVjdG9yeVwiO1xuICBnZW5lcmF0aW9uU291cmNlPzogXCJsbG1cIiB8IFwicnVsZXNcIjtcbiAgZ2VuZXJhdGVkQXQ/OiBzdHJpbmc7XG4gIHN0cnVjdHVyZWQ/OiBBaUluc2lnaHRTdHJ1Y3R1cmVkO1xuICBkZWdyYWRlZD86IGJvb2xlYW47XG59O1xuXG4vKiogQ09SUyBvbiBldmVyeSBKU09OIHJlc3BvbnNlIHNvIGJyb3dzZXJzIGNhbiByZWFkIGJvZGllcyBvbiBlcnJvcnMgKEFQSS1sZXZlbCBDT1JTIGFsb25lIGNhbiBtaXNzIGVkZ2UgY2FzZXMpLiAqL1xuY29uc3QgSlNPTl9DT1JTX0hFQURFUlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICBcImFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpblwiOiBcIipcIixcbiAgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1oZWFkZXJzXCI6IFwiYXV0aG9yaXphdGlvbixjb250ZW50LXR5cGUseC1jb2duaXRvLWFjY2Vzcy10b2tlblwiLFxuICBcImFjY2Vzcy1jb250cm9sLWFsbG93LW1ldGhvZHNcIjogXCJHRVQsUFVULFBPU1QsUEFUQ0gsREVMRVRFLE9QVElPTlNcIixcbn07XG5cbmZ1bmN0aW9uIGpzb24oc3RhdHVzQ29kZTogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKTogSHR0cFJlc3VsdCB7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZSxcbiAgICBoZWFkZXJzOiBKU09OX0NPUlNfSEVBREVSUyxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnZGbGFnVHJpU3RhdGUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHYgPSBwcm9jZXNzLmVudltuYW1lXTtcbiAgaWYgKHYgPT09IFwidHJ1ZVwiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHYgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc0JvZHlDb21wYXJlQWlFbmFibGVkTGFtYmRhKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuRkZfQk9EWV9DT01QQVJFX0FJICE9PSBcImZhbHNlXCI7XG59XG5cbmZ1bmN0aW9uIGlzUG9zaXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwO1xufVxuXG5mdW5jdGlvbiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5cbmZ1bmN0aW9uIGlzSW50Tm9uTmVnYXRpdmUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50cnkoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBEYWlseUVudHJ5VXBzZXJ0IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG5cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LmRhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5Lm1vcm5pbmdXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbW9ybmluZ1dlaWdodFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5sYXRlU25hY2sgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbGF0ZVNuYWNrXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmhpZ2hTb2RpdW0gIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgaGlnaFNvZGl1bVwiIH07XG4gIGlmICh0eXBlb2YgYm9keS53b3Jrb3V0ICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHdvcmtvdXRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuYWxjb2hvbCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhbGNvaG9sXCIgfTtcblxuICBpZiAoXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gbnVsbCAmJlxuICAgICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubmlnaHRXZWlnaHQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuaWdodFdlaWdodFwiIH07XG4gIH1cblxuICBpZiAoYm9keS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuY2Fsb3JpZXMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGNhbG9yaWVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5wcm90ZWluICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5wcm90ZWluKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwcm90ZWluXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zdGVwcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuc3RlcHMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0ZXBzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zbGVlcCAhPT0gdW5kZWZpbmVkICYmICFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuc2xlZXApKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHNsZWVwXCIgfTtcbiAgfVxuXG4gIGlmIChcbiAgICBib2R5LnBob3RvVXJsICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnBob3RvVXJsICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5LnBob3RvVXJsICE9PSBcInN0cmluZ1wiIHx8IGJvZHkucGhvdG9VcmwubGVuZ3RoID4gNjAwXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBob3RvVXJsXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5ub3RlcyAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5ub3RlcyAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5ub3RlcyAhPT0gXCJzdHJpbmdcIiB8fCBib2R5Lm5vdGVzLmxlbmd0aCA+IDJfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbm90ZXNcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5VGV4dCAhPT0gdW5kZWZpbmVkICYmXG4gICAgKHR5cGVvZiBib2R5LmFjdGl2aXR5VGV4dCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmFjdGl2aXR5VGV4dC5sZW5ndGggPiA1MDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eVRleHRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5U3VtbWFyeSAhPT0gdW5kZWZpbmVkICYmXG4gICAgKHR5cGVvZiBib2R5LmFjdGl2aXR5U3VtbWFyeSAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmFjdGl2aXR5U3VtbWFyeS5sZW5ndGggPiA1MDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eVN1bW1hcnlcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5QnVybktjYWwgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmFjdGl2aXR5QnVybktjYWwpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5QnVybktjYWxcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5TWludXRlcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuYWN0aXZpdHlNaW51dGVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eU1pbnV0ZXNcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5TWV0ICE9PSB1bmRlZmluZWQgJiYgIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5hY3Rpdml0eU1ldCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlNZXRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgKCFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuYWN0aXZpdHlDb25maWRlbmNlKSB8fCBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSA+IDEwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5Q29uZmlkZW5jZVwiIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGRhdGU6IGJvZHkuZGF0ZSxcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IGJvZHkubW9ybmluZ1dlaWdodCxcbiAgICAgIG5pZ2h0V2VpZ2h0OiAoYm9keS5uaWdodFdlaWdodCBhcyBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogYm9keS5jYWxvcmllcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBib2R5LnByb3RlaW4gYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGJvZHkuc3RlcHMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGJvZHkuc2xlZXAgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBib2R5LmxhdGVTbmFjayBhcyBib29sZWFuLFxuICAgICAgaGlnaFNvZGl1bTogYm9keS5oaWdoU29kaXVtIGFzIGJvb2xlYW4sXG4gICAgICB3b3Jrb3V0OiBib2R5LndvcmtvdXQgYXMgYm9vbGVhbixcbiAgICAgIGFsY29ob2w6IGJvZHkuYWxjb2hvbCBhcyBib29sZWFuLFxuICAgICAgcGhvdG9Vcmw6IChib2R5LnBob3RvVXJsIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIG5vdGVzOiAoYm9keS5ub3RlcyBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eVRleHQ6IGJvZHkuYWN0aXZpdHlUZXh0IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5U3VtbWFyeTogYm9keS5hY3Rpdml0eVN1bW1hcnkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlCdXJuS2NhbDogYm9keS5hY3Rpdml0eUJ1cm5LY2FsIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5TWV0OiBib2R5LmFjdGl2aXR5TWV0IGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5TWludXRlczogYm9keS5hY3Rpdml0eU1pbnV0ZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlDb25maWRlbmNlOiBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTZXR0aW5ncyhpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IFNldHRpbmdzUGF0Y2ggfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5nb2FsV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGdvYWxXZWlnaHRcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5zdGFydFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGFydFdlaWdodFwiIH07XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkudGFyZ2V0RGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0YXJnZXREYXRlXCIgfTtcbiAgaWYgKGJvZHkudW5pdCAhPT0gXCJrZ1wiICYmIGJvZHkudW5pdCAhPT0gXCJsYnNcIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHVuaXRcIiB9O1xuICBpZiAoXG4gICAgYm9keS50b25lICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiZnJpZW5kbHlcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJjbGluaWNhbFwiICYmXG4gICAgYm9keS50b25lICE9PSBcInRvdWdoLWxvdmVcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJheXVydmVkaWNcIlxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdG9uZVwiIH07XG4gIH1cbiAgaWYgKGJvZHkub3B0SW5Gb3JlY2FzdCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBib2R5Lm9wdEluRm9yZWNhc3QgIT09IFwiYm9vbGVhblwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG9wdEluRm9yZWNhc3RcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0ICE9PSBcInN0cmluZ1wiIHx8IGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdC5sZW5ndGggPiA2NClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGZvcmVjYXN0R2VuZXJhdGVkQXRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkICE9PSB1bmRlZmluZWQgJiZcbiAgICB0eXBlb2YgYm9keS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCAhPT0gXCJib29sZWFuXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGJvZHksIFwid2Vla2x5RGlnZXN0RW1haWxcIikgJiZcbiAgICB0eXBlb2YgYm9keS53ZWVrbHlEaWdlc3RFbWFpbCAhPT0gXCJib29sZWFuXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHdlZWtseURpZ2VzdEVtYWlsXCIgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGJvZHkuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBib2R5LnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogYm9keS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogYm9keS51bml0LFxuICAgICAgdG9uZTogYm9keS50b25lIGFzIFNldHRpbmdzUGF0Y2hbXCJ0b25lXCJdLFxuICAgICAgb3B0SW5Gb3JlY2FzdDogYm9keS5vcHRJbkZvcmVjYXN0IGFzIGJvb2xlYW4gfCB1bmRlZmluZWQsXG4gICAgICBmb3JlY2FzdEdlbmVyYXRlZEF0OiBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ6IGJvZHkuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcbiAgICAgIHdlZWtseURpZ2VzdEVtYWlsOiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYm9keSwgXCJ3ZWVrbHlEaWdlc3RFbWFpbFwiKVxuICAgICAgICA/IChib2R5LndlZWtseURpZ2VzdEVtYWlsIGFzIGJvb2xlYW4pXG4gICAgICAgIDogdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldEp3dENsYWltcyhldmVudDogSHR0cEV2ZW50KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuICBjb25zdCByYXcgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uand0Py5jbGFpbXM7XG4gIGlmIChyYXcgPT0gbnVsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG4gICAgICBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVzZXJJZChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3Qgc3ViID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KT8uc3ViO1xuICByZXR1cm4gdHlwZW9mIHN1YiA9PT0gXCJzdHJpbmdcIiA/IHN1YiA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZmlyc3ROYW1lRnJvbUp3dENsYWltcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IGdpdmVuID0gY2xhaW1zLmdpdmVuX25hbWU7XG4gIGlmICh0eXBlb2YgZ2l2ZW4gPT09IFwic3RyaW5nXCIgJiYgZ2l2ZW4udHJpbSgpKSByZXR1cm4gZ2l2ZW4udHJpbSgpO1xuICBjb25zdCBuYW1lID0gY2xhaW1zLm5hbWU7XG4gIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIiAmJiBuYW1lLnRyaW0oKSkge1xuICAgIGNvbnN0IGZpcnN0ID0gbmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXTtcbiAgICByZXR1cm4gZmlyc3QgfHwgdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKFxuICBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQsXG4pOiBQbGF0ZWF1VXNlclNldHRpbmdzIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFpdGVtKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBvdXQ6IFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7fTtcbiAgY29uc3QgcncgPSBpdGVtLnBsYXRlYXVSb2xsaW5nV2luZG93RGF5cz8uTjtcbiAgY29uc3Qgc3BhbiA9IGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cz8uTjtcbiAgY29uc3QgbXYgPSBpdGVtLnBsYXRlYXVNYXhNb3ZlbWVudEtnPy5OO1xuICBpZiAocncgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIocncpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKHNwYW4gIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoc3Bhbik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG12ICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG12KTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQubWF4QXZnTW92ZW1lbnRLZyA9IG47XG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QoXG4gIHJhdzogdW5rbm93bixcbik6IHsgb2s6IHRydWU7IGRhdGE6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiIHx8IEFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwicGxhdGVhdSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgbyA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBpZiAoby5yb2xsaW5nV2luZG93RGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLnJvbGxpbmdXaW5kb3dEYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUucm9sbGluZ1dpbmRvd0RheXNcIiB9O1xuICAgIGRhdGEucm9sbGluZ1dpbmRvd0RheXMgPSBuO1xuICB9XG4gIGlmIChvLmNvbXBhcmlzb25TcGFuRGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLmNvbXBhcmlzb25TcGFuRGF5cyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1LmNvbXBhcmlzb25TcGFuRGF5c1wiIH07XG4gICAgZGF0YS5jb21wYXJpc29uU3BhbkRheXMgPSBuO1xuICB9XG4gIGlmIChvLm1heEF2Z01vdmVtZW50S2cgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5tYXhBdmdNb3ZlbWVudEtnKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUubWF4QXZnTW92ZW1lbnRLZ1wiIH07XG4gICAgZGF0YS5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YSB9O1xufVxuXG4vKiogR21haWwgdHJlYXRzIGRvdHMgYW5kICtsYWJlbHMgYXMgYWxpYXNlczsgbm9ybWFsaXplIHNvIGFkbWluIGxpc3QgbWF0Y2hlcyByZWFsIHNpZ24taW4gaWRlbnRpdGllcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChlbWFpbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbG93ZXIgPSBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgYXQgPSBsb3dlci5sYXN0SW5kZXhPZihcIkBcIik7XG4gIGlmIChhdCA8PSAwKSByZXR1cm4gbG93ZXI7XG4gIGNvbnN0IGxvY2FsID0gbG93ZXIuc2xpY2UoMCwgYXQpO1xuICBjb25zdCBkb21haW4gPSBsb3dlci5zbGljZShhdCArIDEpO1xuICBpZiAoZG9tYWluID09PSBcImdtYWlsLmNvbVwiIHx8IGRvbWFpbiA9PT0gXCJnb29nbGVtYWlsLmNvbVwiKSB7XG4gICAgY29uc3QgYmFzZUxvY2FsID0gKGxvY2FsLnNwbGl0KFwiK1wiKVswXSA/PyBsb2NhbCkucmVwbGFjZSgvXFwuL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlTG9jYWx9QCR7ZG9tYWlufWA7XG4gIH1cbiAgcmV0dXJuIGxvd2VyO1xufVxuXG5mdW5jdGlvbiBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTogU2V0PHN0cmluZz4ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICBjb25zdCBwYXJ0cyA9IHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2gocy50cmltKCkpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQocGFydHMpO1xuICBpZiAoc2V0LnNpemUgPT09IDApIHtcbiAgICBzZXQuYWRkKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChcInZpaGFybmFyQGdtYWlsLmNvbVwiKSk7XG4gIH1cbiAgcmV0dXJuIHNldDtcbn1cblxuY29uc3QgQURNSU5fQ0xBSU1fS0VZUyA9IFtcInVzZXJuYW1lXCIsIFwiY29nbml0bzp1c2VybmFtZVwiLCBcImVtYWlsXCIsIFwicHJlZmVycmVkX3VzZXJuYW1lXCJdIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZ1tdIHtcbiAgY29uc3QgZm91bmQ6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGVtYWlsaXNoID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gIGZvciAoY29uc3Qga2V5IG9mIEFETUlOX0NMQUlNX0tFWVMpIHtcbiAgICBjb25zdCB2ID0gY2xhaW1zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjbGFpbXMpKSB7XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm5ldyBTZXQoZm91bmQpXTtcbn1cblxuLyoqIFRydWUgaWYgSldUIGNsYWltcyBpbmNsdWRlIGFuIGVtYWlsIGlkZW50aXR5IHRoYXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBhZG1pbiBhbGxvdyBsaXN0LiAqL1xuZnVuY3Rpb24gaXNBZG1pbkNhbGxlcihldmVudDogSHR0cEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsYWltcyA9IGdldEp3dENsYWltcyhldmVudCk7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zKTtcbiAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjKSkpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyVmFsdWUoXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG4gIG5hbWU6IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaGVhZGVycykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgd2FudCA9IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICBpZiAoay50b0xvd2VyQ2FzZSgpID09PSB3YW50ICYmIHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIHYubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSldUIEhUVFAgQVBJIGF1dGhvcml6ZXJzIHZhbGlkYXRlIEF1dGhvcml6YXRpb24gYnV0IHR5cGljYWxseSBkbyBub3QgZm9yd2FyZCB0aGF0IGhlYWRlciB0byBMYW1iZGEuXG4gKiBDbGllbnRzIGFsc28gc2VuZCB4LWNvZ25pdG8tYWNjZXNzLXRva2VuIChzZWUgZnJvbnRlbmQtYXBpLWNsaWVudCkgc28gd2UgY2FuIGNhbGwgY29nbml0by1pZHA6R2V0VXNlci5cbiAqL1xuZnVuY3Rpb24gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGggPSBldmVudC5oZWFkZXJzO1xuICBjb25zdCBjdXN0b20gPSBoZWFkZXJWYWx1ZShoLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIik7XG4gIGlmIChjdXN0b20/LnRyaW0oKSkgcmV0dXJuIGN1c3RvbS50cmltKCk7XG4gIGNvbnN0IHJhdyA9IGhlYWRlclZhbHVlKGgsIFwiYXV0aG9yaXphdGlvblwiKTtcbiAgaWYgKCFyYXcpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG0gPSByYXcubWF0Y2goL15CZWFyZXJcXHMrKC4rKSQvaSk7XG4gIHJldHVybiBtPy5bMV0/LnRyaW0oKTtcbn1cblxuLyoqIFdoZW4gY2xhaW1zIGxhY2sgYSByZXNvbHZhYmxlIGVtYWlsLCB2ZXJpZnkgYWRtaW4gdmlhIEdldFVzZXI7IHRva2VuIHN1YiBtdXN0IG1hdGNoIEpXVCBzdWIuICovXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluVmlhR2V0VXNlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHRva2VuID0gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQpO1xuICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGp3dFN1YiA9IGdldFVzZXJJZChldmVudCk7XG4gIGlmICghand0U3ViKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKG5ldyBHZXRVc2VyQ29tbWFuZCh7IEFjY2Vzc1Rva2VuOiB0b2tlbiB9KSk7XG4gICAgY29uc3QgYXR0cnMgPSBvdXQuVXNlckF0dHJpYnV0ZXMgPz8gW107XG4gICAgY29uc3QgdG9rZW5TdWIgPSBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwic3ViXCIpPy5WYWx1ZTtcbiAgICBpZiAodG9rZW5TdWIgIT09IGp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGVtYWlsID1cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJlbWFpbFwiKT8uVmFsdWUgPz9cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJwcmVmZXJyZWRfdXNlcm5hbWVcIik/LlZhbHVlO1xuICAgIGNvbnN0IGZyb21Vc2VybmFtZSA9IG91dC5Vc2VybmFtZT8uaW5jbHVkZXMoXCJAXCIpID8gb3V0LlVzZXJuYW1lIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IChlbWFpbCA/PyBmcm9tVXNlcm5hbWUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFjYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjYW5kaWRhdGUpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5BbGxvd2VkKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKGlzQWRtaW5DYWxsZXIoZXZlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50KTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldERhdGUoKTogc3RyaW5nIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGQuc2V0RGF0ZShkLmdldERhdGUoKSArIDExOCk7XG4gIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQaG90b1JlZmVyZW5jZShwaG90b1VybDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghcGhvdG9VcmwgfHwgdHlwZW9mIHBob3RvVXJsICE9PSBcInN0cmluZ1wiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAocGhvdG9Vcmwuc3RhcnRzV2l0aChcInMzOi8vXCIpKSByZXR1cm4gcGhvdG9Vcmw7XG4gIGlmICghcGhvdG9VcmwuaW5jbHVkZXMoXCI6Ly9cIikpIHtcbiAgICBjb25zdCBrZXlPbmx5ID0gcGhvdG9VcmwucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBpZiAoIWtleU9ubHkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7cGhvdG9CdWNrZXROYW1lfS8ke2tleU9ubHl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZUFzYzxUIGV4dGVuZHMgeyBkYXRlOiBzdHJpbmcgfT4ocm93czogVFtdKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5yb3dzXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbn1cblxuZnVuY3Rpb24gYXZlcmFnZSh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLCAwKSAvIHZhbHVlcy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHJvdW5kMih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgucm91bmQodmFsdWUgKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBuZXh0TW9ybmluZ0RlbHRhcyhcbiAgbG9nczogU3RvcmVkRW50cnlbXSxcbiAgcHJlZGljYXRlOiAobG9nOiBTdG9yZWRFbnRyeSkgPT4gYm9vbGVhbixcbik6IHsgZmxhZ2dlZDogbnVtYmVyW107IGJhc2VsaW5lOiBudW1iZXJbXSB9IHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgY29uc3QgZmxhZ2dlZDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgYmFzZWxpbmU6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNvcnRlZC5sZW5ndGggLSAxOyBpZHggKz0gMSkge1xuICAgIGNvbnN0IGRlbHRhID0gc29ydGVkW2lkeCArIDFdLm1vcm5pbmdXZWlnaHQgLSBzb3J0ZWRbaWR4XS5tb3JuaW5nV2VpZ2h0O1xuICAgIGlmIChwcmVkaWNhdGUoc29ydGVkW2lkeF0pKSBmbGFnZ2VkLnB1c2goZGVsdGEpO1xuICAgIGVsc2UgYmFzZWxpbmUucHVzaChkZWx0YSk7XG4gIH1cbiAgcmV0dXJuIHsgZmxhZ2dlZCwgYmFzZWxpbmUgfTtcbn1cblxuZnVuY3Rpb24gc29kaXVtSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmhpZ2hTb2RpdW0pO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBzb2RpdW0tYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJzb2RpdW1CdW1wXCIsXG4gICAgcHJpb3JpdHk6IDk1LFxuICAgIGhlYWRsaW5lOiBcIkhpZ2gtc29kaXVtIGRheXMgYXJlIGxpbmtlZCB0byBoZWF2aWVyIG5leHQtbW9ybmluZyB3ZWlnaC1pbnMuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZzIHlvdXIgbm9uLXNvZGl1bSBiYXNlbGluZSB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gaGlnaC1zb2RpdW0gZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugb24gaGlnaC1zb2RpdW0gZGF5czogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlRyeSBvbmUgbG93ZXItc29kaXVtIGRpbm5lciBzd2FwIHRvbmlnaHQuXCIsXG4gICAgY2F0ZWdvcnk6IFwic29kaXVtXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFsY29ob2xJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuYWxjb2hvbCk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGFsY29ob2wtYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJhbGNvaG9sXCIsXG4gICAgcHJpb3JpdHk6IDkwLFxuICAgIGhlYWRsaW5lOiBcIkFsY29ob2wgZGF5cyB0ZW5kIHRvIHNob3cgYSBuZXh0LWRheSB3ZWlnaHQgYnVtcC5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdmVyc3VzIG5vbi1hbGNvaG9sIGRheXMgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGFsY29ob2wtbG9nZ2VkIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIGFmdGVyIGFsY29ob2w6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJQbGFuIGFsY29ob2wtZnJlZSB3ZWVrZGF5cyBmb3Igc3RlYWRpZXIgdHJlbmQgbGluZXMuXCIsXG4gICAgY2F0ZWdvcnk6IFwiYWxjb2hvbFwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBsYXRlU25hY2tJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cubGF0ZVNuYWNrKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgbGF0ZS1zbmFjay1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImxhdGVTbmFja1wiLFxuICAgIHByaW9yaXR5OiA4OCxcbiAgICBoZWFkbGluZTogXCJMYXRlIHNuYWNrcyBhcmUgY29ycmVsYXRlZCB3aXRoIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHNjYWxlIHJlYWRpbmdzLlwiLFxuICAgIGRldGFpbDogYFlvdXIgbmV4dC1kYXkgY2hhbmdlIGlzICske3JvdW5kMihleGNlc3MpfSBrZyBoaWdoZXIgdGhhbiB5b3VyIG5vbi1sYXRlLXNuYWNrIGJhc2VsaW5lLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gbGF0ZS1zbmFjayBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSB3aXRoIGxhdGUgc25hY2s6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJTZXQgYSAyLWhvdXIga2l0Y2hlbiBjbG9zZSB0aW1lIGJlZm9yZSBiZWQuXCIsXG4gICAgY2F0ZWdvcnk6IFwibGF0ZV9zbmFja1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHRXaXRoTG9ncyhlbnRyeUNvdW50OiBudW1iZXIsIGxhdGVzdERhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHtsYXRlc3REYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIkdyZWF0IGNvbnNpc3RlbmN5IHNvIGZhciDigJQga2VlcCBsb2dnaW5nIGRhaWx5IGZvciBzaGFycGVyIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiV2UgbmVlZCBhIGJpdCBtb3JlIHNpZ25hbCB0byBkZXRlY3Qgc3Ryb25nIHBlcnNvbmFsIHBhdHRlcm5zLCBidXQgeW91ciBkYXRhIGZsb3cgaXMgYWN0aXZlLlwiLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZW50cnlDb3VudH0gbG9ncyBhbmFseXplZCBmcm9tIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgXCJObyBydWxlIGNyb3NzZWQgY29uZmlkZW5jZSB0aHJlc2hvbGRzIHlldFwiLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIktlZXAgdHJhY2tpbmcgZGFpbHkgaGFiaXRzIGFuZCB3ZWlnaHQgdG8gdW5sb2NrIHN0cm9uZ2VyIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0Tm9Mb2dzKGFzT2ZEYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7YXNPZkRhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiU3RhcnQgbG9nZ2luZyB3ZWlnaHQgYW5kIGhhYml0cyB0byB1bmxvY2sgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDogXCJPbmNlIHlvdSBoYXZlIGEgZmV3IHdlZWtzIG9mIGVudHJpZXMsIHdlIHdpbGwgaGlnaGxpZ2h0IHBhdHRlcm5zIHRoYXQgbWF0Y2ggeW91ciBkYXRhLlwiLFxuICAgIHdoeTogW1wiTm8gZW50cmllcyBmb3VuZCBpbiB0aGUgbGFzdCA5MCBkYXlzXCJdLFxuICAgIGFjdGlvbjogXCJBZGQgdG9kYXkncyB3ZWlnaHQgb24gdGhlIGxlZnQgdG8gYmVnaW4uXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEluc2lnaHRzVjIodXNlcklkOiBzdHJpbmcsIF9ldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0byA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGZyb21EYXRlID0gbmV3IERhdGUoKTtcbiAgZnJvbURhdGUuc2V0RGF0ZShmcm9tRGF0ZS5nZXREYXRlKCkgLSA4OSk7XG4gIGNvbnN0IGZyb20gPSBmcm9tRGF0ZS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZCBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0sXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBcIjpmcm9tRGF0ZVwiOiB7IFM6IGZyb20gfSxcbiAgICAgICAgXCI6dG9EYXRlXCI6IHsgUzogdG8gfSxcbiAgICAgIH0sXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGVudHJpZXNSYXcgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgfSksXG4gICkuZmlsdGVyKChlKSA9PiBlLmRhdGUgJiYgZS5tb3JuaW5nV2VpZ2h0ID4gMCk7XG5cbiAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHNldHRpbmdzUm93ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogc2V0dGluZ3NUYWJsZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBnSXRlbSA9IHNldHRpbmdzUm93Lkl0ZW07XG4gIGNvbnN0IGdvYWxXZWlnaHQgPSBnSXRlbSA/IE51bWJlcihnSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSA6IDcyO1xuICBjb25zdCBzdGFydFdlaWdodCA9IGdJdGVtID8gTnVtYmVyKGdJdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSA6IDg1O1xuICBjb25zdCB0YXJnZXREYXRlID0gZ0l0ZW0/LnRhcmdldERhdGU/LlMgPz8gdG87XG5cbiAgY29uc3QgaW5zaWdodHMgPSBhd2FpdCBnZW5lcmF0ZUFpSW5zaWdodENhcmQoZGRiLCB7XG4gICAgdXNlcklkLFxuICAgIGVudHJpZXNSYXcsXG4gICAgZ29hbFdlaWdodCxcbiAgICBzdGFydFdlaWdodCxcbiAgICB0YXJnZXREYXRlLFxuICAgIGRheU1lYWxzVGFibGVOYW1lOiBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSxcbiAgfSk7XG5cbiAgY29uc3QgYm9keU91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGluc2lnaHRzIH07XG4gIGlmIChwcm9jZXNzLmVudi5GRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkcgIT09IFwiZmFsc2VcIikge1xuICAgIGNvbnN0IHN1YnNUYWJsZSA9IHByb2Nlc3MuZW52LlNVQlNDUklQVElPTlNfVEFCTEVfTkFNRTtcbiAgICBsZXQgcGxhbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGxldCBzdWJzY3JpcHRpb25TdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBpZiAoc3Vic1RhYmxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdWJPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICAgICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICAgICAgVGFibGVOYW1lOiBzdWJzVGFibGUsXG4gICAgICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICAgICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgICAgcGxhbiA9IHN1Yk91dC5JdGVtPy5wbGFuPy5TID8/IFwiZnJlZVwiO1xuICAgICAgICBzdWJzY3JpcHRpb25TdGF0dXMgPSBzdWJPdXQuSXRlbT8uc3RhdHVzPy5TID8/IFwiaW5hY3RpdmVcIjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBwbGFuID0gXCJmcmVlXCI7XG4gICAgICAgIHN1YnNjcmlwdGlvblN0YXR1cyA9IFwiaW5hY3RpdmVcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc29ydGVkID0gWy4uLmVudHJpZXNSYXddLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xuICAgIGNvbnN0IGxhc3Q3ID0gc29ydGVkLnNsaWNlKC03KTtcbiAgICBjb25zdCBrY2FscyA9IGxhc3Q3Lm1hcCgoZSkgPT4gZS5jYWxvcmllcykuZmlsdGVyKChjKTogYyBpcyBudW1iZXIgPT4gdHlwZW9mIGMgPT09IFwibnVtYmVyXCIgJiYgYyA+IDApO1xuICAgIGNvbnN0IHJlY2VudEF2Z0RhaWx5Q2Fsb3JpZXMgPVxuICAgICAga2NhbHMubGVuZ3RoID49IDIgPyBrY2Fscy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIGtjYWxzLmxlbmd0aCA6IG51bGw7XG4gICAgYm9keU91dC5wZXJzb25hbGl6ZWRDb2FjaGluZyA9IGJ1aWxkUGVyc29uYWxpemVkQ29hY2hpbmdQYXlsb2FkKHtcbiAgICAgIGVudHJpZXNSYXcsXG4gICAgICBnb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlLFxuICAgICAgYXNPZkRhdGU6IHRvLFxuICAgICAgcGxhbixcbiAgICAgIHN1YnNjcmlwdGlvblN0YXR1cyxcbiAgICAgIHJlY2VudEF2Z0RhaWx5Q2Fsb3JpZXMsXG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGpzb24oMjAwLCBib2R5T3V0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRVwiLCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGluc2lnaHRJZCA9IHR5cGVvZiBib2R5Lmluc2lnaHRJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuaW5zaWdodElkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHZvdGVSYXcgPSBib2R5LnZvdGU7XG4gIGNvbnN0IGFsbG93ZWRWb3RlcyA9IG5ldyBTZXQoW1widXBcIiwgXCJkb3duXCIsIFwiaGVscGZ1bFwiLCBcIm5vdF9oZWxwZnVsXCIsIFwiZGlzbWlzc1wiXSk7XG4gIGNvbnN0IHZvdGUgPVxuICAgIHR5cGVvZiB2b3RlUmF3ID09PSBcInN0cmluZ1wiICYmIGFsbG93ZWRWb3Rlcy5oYXModm90ZVJhdylcbiAgICAgID8gKHZvdGVSYXcgYXMgXCJ1cFwiIHwgXCJkb3duXCIgfCBcImhlbHBmdWxcIiB8IFwibm90X2hlbHBmdWxcIiB8IFwiZGlzbWlzc1wiKVxuICAgICAgOiBudWxsO1xuICBpZiAoIWluc2lnaHRJZCB8fCAhdm90ZSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgaW5zaWdodCBmZWVkYmFjayBwYXlsb2FkXCIgfSk7XG4gIGNvbnN0IGNvbW1lbnRSYXcgPSBib2R5LmNvbW1lbnQ7XG4gIGNvbnN0IGNvbW1lbnQgPVxuICAgIHR5cGVvZiBjb21tZW50UmF3ID09PSBcInN0cmluZ1wiICYmIGNvbW1lbnRSYXcudHJpbSgpLmxlbmd0aCA+IDBcbiAgICAgID8gY29tbWVudFJhdy50cmltKCkuc2xpY2UoMCwgMjAwMClcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCBmZWVkYmFja1R5cGUgPSBib2R5LmZlZWRiYWNrVHlwZSA9PT0gXCJuZWdhdGl2ZVwiID8gXCJuZWdhdGl2ZVwiIDogdW5kZWZpbmVkO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGluc2lnaHRUczogeyBTOiBgJHt0c30jJHtpbnNpZ2h0SWR9YCB9LFxuICAgICAgICBpbnNpZ2h0SWQ6IHsgUzogaW5zaWdodElkIH0sXG4gICAgICAgIHZvdGU6IHsgUzogdm90ZSB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgICAuLi4oY29tbWVudCA/IHsgY29tbWVudDogeyBTOiBjb21tZW50IH0gfSA6IHt9KSxcbiAgICAgICAgLi4uKGZlZWRiYWNrVHlwZSA/IHsgZmVlZGJhY2tUeXBlOiB7IFM6IGZlZWRiYWNrVHlwZSB9IH0gOiB7fSksXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEVudHJpZXModXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZnJvbSA9IHF1ZXJ5Py5mcm9tO1xuICBjb25zdCB0byA9IHF1ZXJ5Py50bztcbiAgaWYgKGZyb20gJiYgIWlzRGF0ZVN0cmluZyhmcm9tKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZnJvbSBkYXRlXCIgfSk7XG4gIGlmICh0byAmJiAhaXNEYXRlU3RyaW5nKHRvKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgdG8gZGF0ZVwiIH0pO1xuXG4gIGNvbnN0IGV4cHJlc3Npb25WYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHsgUzogc3RyaW5nIH0+ID0geyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9O1xuICBsZXQga2V5Q29uZGl0aW9uID0gXCJ1c2VySWQgPSA6dXNlcklkXCI7XG4gIGlmIChmcm9tICYmIHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfSBlbHNlIGlmIChmcm9tKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA+PSA6ZnJvbURhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gIH0gZWxzZSBpZiAodG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIDw9IDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfVxuXG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBrZXlDb25kaXRpb24sXG4gICAgICAuLi4oa2V5Q29uZGl0aW9uLmluY2x1ZGVzKFwiI2RhdGVcIilcbiAgICAgICAgPyB7IEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0gfVxuICAgICAgICA6IHt9KSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25WYWx1ZXMsXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICBpZDogaXRlbS5pZD8uUyA/PyBgJHt1c2VySWR9OiR7aXRlbS5kYXRlPy5TID8/IFwiXCJ9YCxcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHVzZXJJZCxcbiAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIHBob3RvVXJsOiBpdGVtLnBob3RvVXJsPy5TID8/IHVuZGVmaW5lZCxcbiAgICBub3RlczogaXRlbS5ub3Rlcz8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlUZXh0OiBpdGVtLmFjdGl2aXR5VGV4dD8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlTdW1tYXJ5OiBpdGVtLmFjdGl2aXR5U3VtbWFyeT8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlCdXJuS2NhbDogaXRlbS5hY3Rpdml0eUJ1cm5LY2FsPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlCdXJuS2NhbC5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eU1ldDogaXRlbS5hY3Rpdml0eU1ldD8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5TWV0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5TWludXRlczogaXRlbS5hY3Rpdml0eU1pbnV0ZXM/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eU1pbnV0ZXMuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlDb25maWRlbmNlOiBpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZT8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZS5OKSA6IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLmFjdGl2aXR5VGV4dCA9PT0gXCJzdHJpbmdcIikgaXRlbS5hY3Rpdml0eVRleHQgPSB7IFM6IGRhdGEuYWN0aXZpdHlUZXh0IH07XG4gIGlmICh0eXBlb2YgZGF0YS5hY3Rpdml0eVN1bW1hcnkgPT09IFwic3RyaW5nXCIpIGl0ZW0uYWN0aXZpdHlTdW1tYXJ5ID0geyBTOiBkYXRhLmFjdGl2aXR5U3VtbWFyeSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlCdXJuS2NhbCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlCdXJuS2NhbCkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlNZXQgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eU1ldCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNZXQpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5TWludXRlcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5TWludXRlcyA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNaW51dGVzKSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eUNvbmZpZGVuY2UgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5Q29uZmlkZW5jZSkgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZFN1YnNjcmlwdGlvblNuYXBzaG90KHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTx7XG4gIHBsYW46IHN0cmluZztcbiAgc3RhdHVzOiBzdHJpbmc7XG4gIGN1cnJlbnRQZXJpb2RFbmQ6IHN0cmluZyB8IG51bGw7XG59PiB7XG4gIGNvbnN0IHN1YnNUYWJsZSA9IHByb2Nlc3MuZW52LlNVQlNDUklQVElPTlNfVEFCTEVfTkFNRTtcbiAgaWYgKCFzdWJzVGFibGUpIHtcbiAgICByZXR1cm4geyBwbGFuOiBcImZyZWVcIiwgc3RhdHVzOiBcImluYWN0aXZlXCIsIGN1cnJlbnRQZXJpb2RFbmQ6IG51bGwgfTtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHN1Yk91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBzdWJzVGFibGUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgICB9KSxcbiAgICApO1xuICAgIGlmICghc3ViT3V0Lkl0ZW0pIHtcbiAgICAgIHJldHVybiB7IHBsYW46IFwiZnJlZVwiLCBzdGF0dXM6IFwiaW5hY3RpdmVcIiwgY3VycmVudFBlcmlvZEVuZDogbnVsbCB9O1xuICAgIH1cbiAgICBjb25zdCBjcGUgPSBzdWJPdXQuSXRlbS5jdXJyZW50UGVyaW9kRW5kPy5TPy50cmltKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHBsYW46IHN1Yk91dC5JdGVtLnBsYW4/LlMgPz8gXCJmcmVlXCIsXG4gICAgICBzdGF0dXM6IHN1Yk91dC5JdGVtLnN0YXR1cz8uUyA/PyBcImluYWN0aXZlXCIsXG4gICAgICBjdXJyZW50UGVyaW9kRW5kOiBjcGUgJiYgY3BlLmxlbmd0aCA+IDAgPyBjcGUgOiBudWxsLFxuICAgIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB7IHBsYW46IFwiZnJlZVwiLCBzdGF0dXM6IFwiaW5hY3RpdmVcIiwgY3VycmVudFBlcmlvZEVuZDogbnVsbCB9O1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFNldHRpbmdzKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBzdWJzY3JpcHRpb24gPSBhd2FpdCBsb2FkU3Vic2NyaXB0aW9uU25hcHNob3QodXNlcklkKTtcblxuICBpZiAoIW91dC5JdGVtKSB7XG4gICAgY29uc3Qgc2V0dGluZ3M6IFN0b3JlZFNldHRpbmdzID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgZ29hbFdlaWdodDogNzIsXG4gICAgICBzdGFydFdlaWdodDogODUsXG4gICAgICB0YXJnZXREYXRlOiBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogXCJrZ1wiLFxuICAgICAgdG9uZTogXCJmcmllbmRseVwiLFxuICAgIH07XG4gICAgYXdhaXQgZGRiLnNlbmQoXG4gICAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgICBnb2FsV2VpZ2h0OiB7IE46IFN0cmluZyhzZXR0aW5ncy5nb2FsV2VpZ2h0KSB9LFxuICAgICAgICAgIHN0YXJ0V2VpZ2h0OiB7IE46IFN0cmluZyhzZXR0aW5ncy5zdGFydFdlaWdodCkgfSxcbiAgICAgICAgICB0YXJnZXREYXRlOiB7IFM6IHNldHRpbmdzLnRhcmdldERhdGUgfSxcbiAgICAgICAgICB1bml0OiB7IFM6IHNldHRpbmdzLnVuaXQgfSxcbiAgICAgICAgICB0b25lOiB7IFM6IHNldHRpbmdzLnRvbmUgPz8gXCJmcmllbmRseVwiIH0sXG4gICAgICAgICAgd2Vla2x5RGlnZXN0RW1haWw6IHsgTjogXCIwXCIgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICBzZXR0aW5nczoge1xuICAgICAgICBnb2FsV2VpZ2h0OiBzZXR0aW5ncy5nb2FsV2VpZ2h0LFxuICAgICAgICBzdGFydFdlaWdodDogc2V0dGluZ3Muc3RhcnRXZWlnaHQsXG4gICAgICAgIHRhcmdldERhdGU6IHNldHRpbmdzLnRhcmdldERhdGUsXG4gICAgICAgIHVuaXQ6IHNldHRpbmdzLnVuaXQsXG4gICAgICAgIHRvbmU6IHNldHRpbmdzLnRvbmUsXG4gICAgICAgIHBsYXRlYXU6IHVuZGVmaW5lZCxcbiAgICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcjogc2V0dGluZ3MuYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvciA/PyAxLFxuICAgICAgICB3ZWVrbHlEaWdlc3RFbWFpbDogZmFsc2UsXG4gICAgICB9LFxuICAgICAgc3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpLFxuICAgICAgdGFyZ2V0RGF0ZTogb3V0Lkl0ZW0udGFyZ2V0RGF0ZT8uUyA/PyBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogb3V0Lkl0ZW0udW5pdD8uUyA9PT0gXCJsYnNcIiA/IFwibGJzXCIgOiBcImtnXCIsXG4gICAgICB0b25lOlxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJheXVydmVkaWNcIlxuICAgICAgICAgID8gb3V0Lkl0ZW0udG9uZS5TXG4gICAgICAgICAgOiBcImZyaWVuZGx5XCIsXG4gICAgICBwbGF0ZWF1OiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShvdXQuSXRlbSksXG4gICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBOdW1iZXIob3V0Lkl0ZW0uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKSxcbiAgICAgIG9wdEluRm9yZWNhc3Q6IE51bWJlcihvdXQuSXRlbS5vcHRJbkZvcmVjYXN0Py5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICAgIGZvcmVjYXN0R2VuZXJhdGVkQXQ6IG91dC5JdGVtLmZvcmVjYXN0R2VuZXJhdGVkQXQ/LlMsXG4gICAgICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZDogTnVtYmVyKG91dC5JdGVtLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPy5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICAgIHdlZWtseURpZ2VzdEVtYWlsOiBOdW1iZXIob3V0Lkl0ZW0ud2Vla2x5RGlnZXN0RW1haWw/Lk4gPz8gXCIwXCIpID09PSAxLFxuICAgIH0sXG4gICAgc3Vic2NyaXB0aW9uLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBleGlzdGluZ091dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG5cbiAgY29uc3QgZXhpc3RpbmdUb25lID1cbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgIGV4aXN0aW5nT3V0Lkl0ZW0/LnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImZyaWVuZGx5XCJcbiAgICAgID8gZXhpc3RpbmdPdXQuSXRlbS50b25lLlNcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCB0b25lID0gZGF0YS50b25lID8/IGV4aXN0aW5nVG9uZSA/PyBcImZyaWVuZGx5XCI7XG4gIGNvbnN0IGV4aXN0aW5nQ2FsaWJyYXRpb24gPSBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKTtcbiAgY29uc3QgZXhpc3RpbmdPcHRJbkZvcmVjYXN0ID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/Lm9wdEluRm9yZWNhc3Q/Lk4gPz8gXCIwXCIpID09PSAxO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQgPSBleGlzdGluZ091dC5JdGVtPy5mb3JlY2FzdEdlbmVyYXRlZEF0Py5TO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID1cbiAgICBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ/Lk4gPz8gXCIwXCIpID09PSAxO1xuICBjb25zdCBleGlzdGluZ1dlZWtseURpZ2VzdEVtYWlsID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LndlZWtseURpZ2VzdEVtYWlsPy5OID8/IFwiMFwiKSA9PT0gMTtcblxuICBsZXQgbmV4dFBsYXRlYXUgPSBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShleGlzdGluZ091dC5JdGVtKTtcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChib2R5LCBcInBsYXRlYXVcIikpIHtcbiAgICBjb25zdCByYXdQbGF0ZWF1ID0gYm9keS5wbGF0ZWF1O1xuICAgIGlmIChyYXdQbGF0ZWF1ID09PSBudWxsKSB7XG4gICAgICBuZXh0UGxhdGVhdSA9IHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcCA9IHZhbGlkYXRlUGxhdGVhdVBhdGNoT2JqZWN0KHJhd1BsYXRlYXUpO1xuICAgICAgaWYgKCFwLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcC5lcnJvciB9KTtcbiAgICAgIG5leHRQbGF0ZWF1ID0geyAuLi5uZXh0UGxhdGVhdSwgLi4ucC5kYXRhIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBnb2FsV2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLmdvYWxXZWlnaHQpIH0sXG4gICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuc3RhcnRXZWlnaHQpIH0sXG4gICAgdGFyZ2V0RGF0ZTogeyBTOiBkYXRhLnRhcmdldERhdGUgfSxcbiAgICB1bml0OiB7IFM6IGRhdGEudW5pdCB9LFxuICAgIHRvbmU6IHsgUzogdG9uZSB9LFxuICB9O1xuICBpZiAobmV4dFBsYXRlYXU/LnJvbGxpbmdXaW5kb3dEYXlzICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVSb2xsaW5nV2luZG93RGF5cyA9IHsgTjogU3RyaW5nKE1hdGgucm91bmQobmV4dFBsYXRlYXUucm9sbGluZ1dpbmRvd0RheXMpKSB9O1xuICB9XG4gIGlmIChuZXh0UGxhdGVhdT8uY29tcGFyaXNvblNwYW5EYXlzICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVDb21wYXJpc29uU3BhbkRheXMgPSB7IE46IFN0cmluZyhNYXRoLnJvdW5kKG5leHRQbGF0ZWF1LmNvbXBhcmlzb25TcGFuRGF5cykpIH07XG4gIH1cbiAgaWYgKG5leHRQbGF0ZWF1Py5tYXhBdmdNb3ZlbWVudEtnICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVNYXhNb3ZlbWVudEtnID0geyBOOiBTdHJpbmcobmV4dFBsYXRlYXUubWF4QXZnTW92ZW1lbnRLZykgfTtcbiAgfVxuICBpdGVtLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3IgPSB7IE46IFN0cmluZyhleGlzdGluZ0NhbGlicmF0aW9uKSB9O1xuICBpdGVtLm9wdEluRm9yZWNhc3QgPSB7XG4gICAgTjogKGRhdGEub3B0SW5Gb3JlY2FzdCA/PyBleGlzdGluZ09wdEluRm9yZWNhc3QpID8gXCIxXCIgOiBcIjBcIixcbiAgfTtcbiAgY29uc3QgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgPSBkYXRhLmZvcmVjYXN0R2VuZXJhdGVkQXQgPz8gZXhpc3RpbmdGb3JlY2FzdEdlbmVyYXRlZEF0O1xuICBpZiAodHlwZW9mIG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0ID09PSBcInN0cmluZ1wiICYmIG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0Lmxlbmd0aCA+IDApIHtcbiAgICBpdGVtLmZvcmVjYXN0R2VuZXJhdGVkQXQgPSB7IFM6IG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0IH07XG4gIH1cbiAgaXRlbS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA9IHtcbiAgICBOOiAoZGF0YS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA/PyBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkKSA/IFwiMVwiIDogXCIwXCIsXG4gIH07XG4gIGNvbnN0IG5leHRXZWVrbHlEaWdlc3RFbWFpbCA9IGRhdGEud2Vla2x5RGlnZXN0RW1haWwgPz8gZXhpc3RpbmdXZWVrbHlEaWdlc3RFbWFpbDtcbiAgaXRlbS53ZWVrbHlEaWdlc3RFbWFpbCA9IHsgTjogbmV4dFdlZWtseURpZ2VzdEVtYWlsID8gXCIxXCIgOiBcIjBcIiB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGRhdGEuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBkYXRhLnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogZGF0YS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogZGF0YS51bml0LFxuICAgICAgdG9uZSxcbiAgICAgIHBsYXRlYXU6IG5leHRQbGF0ZWF1LFxuICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvcjogZXhpc3RpbmdDYWxpYnJhdGlvbixcbiAgICAgIG9wdEluRm9yZWNhc3Q6IGRhdGEub3B0SW5Gb3JlY2FzdCA/PyBleGlzdGluZ09wdEluRm9yZWNhc3QsXG4gICAgICBmb3JlY2FzdEdlbmVyYXRlZEF0OiBkYXRhLmZvcmVjYXN0R2VuZXJhdGVkQXQgPz8gZXhpc3RpbmdGb3JlY2FzdEdlbmVyYXRlZEF0LFxuICAgICAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ6XG4gICAgICAgIGRhdGEuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgPz8gZXhpc3RpbmdGb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCxcbiAgICAgIHdlZWtseURpZ2VzdEVtYWlsOiBuZXh0V2Vla2x5RGlnZXN0RW1haWwsXG4gICAgfSxcbiAgfSk7XG59XG5cbnR5cGUgUHJvZ3Jlc3NQaG90b0l0ZW0gPSB7XG4gIHBob3RvSWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGRhdGU6IHN0cmluZztcbiAgaW1hZ2VVcmw/OiBzdHJpbmc7XG4gIHN0b3JhZ2VLZXk/OiBzdHJpbmc7XG4gIHdlaWdodEF0UGhvdG8/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+KTogUHJvZ3Jlc3NQaG90b0l0ZW0gfCBudWxsIHtcbiAgY29uc3QgcGhvdG9JZCA9IGl0ZW0ucGhvdG9JZD8uUztcbiAgY29uc3QgdXNlcklkID0gaXRlbS51c2VySWQ/LlM7XG4gIGNvbnN0IGRhdGUgPSBpdGVtLmRhdGU/LlM7XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IGl0ZW0uY3JlYXRlZEF0Py5TO1xuICBpZiAoIXBob3RvSWQgfHwgIXVzZXJJZCB8fCAhZGF0ZSB8fCAhY3JlYXRlZEF0KSByZXR1cm4gbnVsbDtcbiAgY29uc3QgaW1hZ2VVcmwgPSBpdGVtLmltYWdlVXJsPy5TO1xuICBjb25zdCBzdG9yYWdlS2V5ID0gaXRlbS5zdG9yYWdlS2V5Py5TO1xuICBjb25zdCB3ZWlnaHRSYXcgPSBpdGVtLndlaWdodEF0UGhvdG8/Lk47XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSB3ZWlnaHRSYXcgIT0gbnVsbCA/IE51bWJlcih3ZWlnaHRSYXcpIDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHBob3RvSWQsXG4gICAgdXNlcklkLFxuICAgIGRhdGUsXG4gICAgaW1hZ2VVcmw6IGltYWdlVXJsIHx8IHVuZGVmaW5lZCxcbiAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICB3ZWlnaHRBdFBob3RvOiBOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90byA/PyBOYU4pID8gd2VpZ2h0QXRQaG90byA6IHVuZGVmaW5lZCxcbiAgICBjcmVhdGVkQXQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBpdGVtcyA9IChvdXQuSXRlbXMgPz8gW10pXG4gICAgLm1hcCgoaXRlbSkgPT4gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4pKVxuICAgIC5maWx0ZXIoKHJvdyk6IHJvdyBpcyBQcm9ncmVzc1Bob3RvSXRlbSA9PiByb3cgIT09IG51bGwpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuZGF0ZS5sb2NhbGVDb21wYXJlKGEuZGF0ZSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGltYWdlVXJsID0gdHlwZW9mIGJvZHkuaW1hZ2VVcmwgPT09IFwic3RyaW5nXCIgPyBib2R5LmltYWdlVXJsLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSB0eXBlb2YgYm9keS5zdG9yYWdlS2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5zdG9yYWdlS2V5LnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSBib2R5LndlaWdodEF0UGhvdG8gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlcihib2R5LndlaWdodEF0UGhvdG8pO1xuICBpZiAoIWRhdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcbiAgaWYgKCFpbWFnZVVybCAmJiAhc3RvcmFnZUtleSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgaW1hZ2VVcmwgb3Igc3RvcmFnZUtleVwiIH0pO1xuICBpZiAoXG4gICAgd2VpZ2h0QXRQaG90byAhPT0gdW5kZWZpbmVkICYmXG4gICAgKCFOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90bykgfHwgd2VpZ2h0QXRQaG90byA8PSAwIHx8IHdlaWdodEF0UGhvdG8gPiAxMDAwKVxuICApIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB3ZWlnaHRBdFBob3RvXCIgfSk7XG4gIH1cbiAgY29uc3QgcGhvdG9JZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3QgY3JlYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgIGRhdGU6IHsgUzogZGF0ZSB9LFxuICAgIGNyZWF0ZWRBdDogeyBTOiBjcmVhdGVkQXQgfSxcbiAgfTtcbiAgaWYgKGltYWdlVXJsKSBpdGVtLmltYWdlVXJsID0geyBTOiBpbWFnZVVybCB9O1xuICBpZiAoc3RvcmFnZUtleSkgaXRlbS5zdG9yYWdlS2V5ID0geyBTOiBzdG9yYWdlS2V5IH07XG4gIGlmICh3ZWlnaHRBdFBob3RvICE9PSB1bmRlZmluZWQpIGl0ZW0ud2VpZ2h0QXRQaG90byA9IHsgTjogU3RyaW5nKHdlaWdodEF0UGhvdG8pIH07XG4gIGF3YWl0IGRkYi5zZW5kKG5ldyBQdXRJdGVtQ29tbWFuZCh7IFRhYmxlTmFtZTogdGFibGUsIEl0ZW06IGl0ZW0gYXMgbmV2ZXIgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBpdGVtOiB7XG4gICAgICBwaG90b0lkLFxuICAgICAgdXNlcklkLFxuICAgICAgZGF0ZSxcbiAgICAgIGltYWdlVXJsOiBpbWFnZVVybCB8fCB1bmRlZmluZWQsXG4gICAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICAgIHdlaWdodEF0UGhvdG8sXG4gICAgICBjcmVhdGVkQXQsXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIHBob3RvSWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG50eXBlIEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCA9IHtcbiAgc3VtbWFyeTogc3RyaW5nO1xuICBjb25maWRlbmNlOiBudW1iZXI7XG4gIGVzdGltYXRlZDogYm9vbGVhbjtcbiAgZGlzY2xhaW1lcjogc3RyaW5nO1xuICBoaWdobGlnaHRzOiBBcnJheTx7XG4gICAgYXJlYTogc3RyaW5nO1xuICAgIGFzc2Vzc21lbnQ6IHN0cmluZztcbiAgICBkaXJlY3Rpb246IFwibGVhbmVyXCIgfCBcInVuY2hhbmdlZFwiIHwgXCJ1bmNlcnRhaW5cIjtcbiAgfT47XG59O1xuXG5mdW5jdGlvbiBleHRyYWN0Rmlyc3RKc29uT2JqZWN0KHJhdzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHRleHQgPSByYXcudHJpbSgpO1xuICBjb25zdCBzdGFydCA9IHRleHQuaW5kZXhPZihcIntcIik7XG4gIGlmIChzdGFydCA8IDApIHJldHVybiBudWxsO1xuICBsZXQgZGVwdGggPSAwO1xuICBsZXQgaW5TdHJpbmcgPSBmYWxzZTtcbiAgbGV0IGVzY2FwZSA9IGZhbHNlO1xuICBmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCB0ZXh0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgY29uc3QgYyA9IHRleHRbaV0hO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgIGVzY2FwZSA9IGZhbHNlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjID09PSBcIlxcXFxcIiAmJiBpblN0cmluZykge1xuICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA9PT0gXCJcXFwiXCIpIHtcbiAgICAgIGluU3RyaW5nID0gIWluU3RyaW5nO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmICghaW5TdHJpbmcpIHtcbiAgICAgIGlmIChjID09PSBcIntcIikgZGVwdGggKz0gMTtcbiAgICAgIGlmIChjID09PSBcIn1cIikge1xuICAgICAgICBkZXB0aCAtPSAxO1xuICAgICAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiB0ZXh0LnNsaWNlKHN0YXJ0LCBpICsgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZUJvZHlDb21wYXJlQXNzZXNzbWVudChyYXc6IHN0cmluZyk6IEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBqc29uVGV4dCA9IGV4dHJhY3RGaXJzdEpzb25PYmplY3QocmF3KTtcbiAgaWYgKCFqc29uVGV4dCkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uVGV4dCkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3Qgc3VtbWFyeSA9IHR5cGVvZiBwYXJzZWQuc3VtbWFyeSA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5zdW1tYXJ5LnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgY29uZmlkZW5jZSA9IE51bWJlcihwYXJzZWQuY29uZmlkZW5jZSk7XG4gICAgY29uc3QgZGlzY2xhaW1lciA9IHR5cGVvZiBwYXJzZWQuZGlzY2xhaW1lciA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5kaXNjbGFpbWVyLnRyaW0oKSA6IFwiXCI7XG4gICAgaWYgKCFzdW1tYXJ5IHx8ICFOdW1iZXIuaXNGaW5pdGUoY29uZmlkZW5jZSkgfHwgIWRpc2NsYWltZXIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGhpZ2hsaWdodHNSYXcgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5oaWdobGlnaHRzKSA/IHBhcnNlZC5oaWdobGlnaHRzIDogW107XG4gICAgY29uc3QgaGlnaGxpZ2h0cyA9IGhpZ2hsaWdodHNSYXdcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IGUgPSBlbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgY29uc3QgYXJlYSA9IHR5cGVvZiBlLmFyZWEgPT09IFwic3RyaW5nXCIgPyBlLmFyZWEudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgYXNzZXNzbWVudCA9IHR5cGVvZiBlLmFzc2Vzc21lbnQgPT09IFwic3RyaW5nXCIgPyBlLmFzc2Vzc21lbnQudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uUmF3ID0gdHlwZW9mIGUuZGlyZWN0aW9uID09PSBcInN0cmluZ1wiID8gZS5kaXJlY3Rpb24gOiBcInVuY2VydGFpblwiO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPVxuICAgICAgICAgIGRpcmVjdGlvblJhdyA9PT0gXCJsZWFuZXJcIiB8fCBkaXJlY3Rpb25SYXcgPT09IFwidW5jaGFuZ2VkXCIgfHwgZGlyZWN0aW9uUmF3ID09PSBcInVuY2VydGFpblwiXG4gICAgICAgICAgICA/IGRpcmVjdGlvblJhd1xuICAgICAgICAgICAgOiBcInVuY2VydGFpblwiO1xuICAgICAgICBpZiAoIWFyZWEgfHwgIWFzc2Vzc21lbnQpIHJldHVybiBudWxsO1xuICAgICAgICByZXR1cm4geyBhcmVhLCBhc3Nlc3NtZW50LCBkaXJlY3Rpb24gfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAodik6IHYgaXMgeyBhcmVhOiBzdHJpbmc7IGFzc2Vzc21lbnQ6IHN0cmluZzsgZGlyZWN0aW9uOiBcImxlYW5lclwiIHwgXCJ1bmNoYW5nZWRcIiB8IFwidW5jZXJ0YWluXCIgfSA9PlxuICAgICAgICAgIHYgIT09IG51bGwsXG4gICAgICApO1xuICAgIHJldHVybiB7XG4gICAgICBzdW1tYXJ5LFxuICAgICAgY29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBNYXRoLnJvdW5kKGNvbmZpZGVuY2UpKSksXG4gICAgICBlc3RpbWF0ZWQ6IHRydWUsXG4gICAgICBkaXNjbGFpbWVyLFxuICAgICAgaGlnaGxpZ2h0cyxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhc3Nlc3NQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzQm9keUNvbXBhcmVBaUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJBSSBwaG90byBjb21wYXJlIGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4ganNvbig1MDMsIHsgZXJyb3I6IFwiQUkgY29tcGFyZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgY29uc3QgcmF3ID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGJvZHlcIiB9KTtcbiAgY29uc3QgYm9keSA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgcGhvdG9zUmF3ID0gQXJyYXkuaXNBcnJheShib2R5LnBob3RvcykgPyBib2R5LnBob3RvcyA6IFtdO1xuICBjb25zdCBxdWVyeSA9IHR5cGVvZiBib2R5LnF1ZXJ5ID09PSBcInN0cmluZ1wiID8gYm9keS5xdWVyeS50cmltKCkgOiBcIlwiO1xuICB0eXBlIFBob3RvSXRlbSA9IHtcbiAgICBkYXRlOiBzdHJpbmc7XG4gICAgcGhvdG9Vcmw6IHN0cmluZztcbiAgICBpbWFnZUJhc2U2NDogc3RyaW5nO1xuICAgIG1lZGlhVHlwZTogc3RyaW5nO1xuICB9O1xuICBjb25zdCBwaG90b3M6IFBob3RvSXRlbVtdID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHBob3Rvc1Jhdykge1xuICAgIGNvbnN0IHAgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3QgZGF0ZSA9IHR5cGVvZiBwLmRhdGUgPT09IFwic3RyaW5nXCIgPyBwLmRhdGUgOiBcIlwiO1xuICAgIGNvbnN0IHBob3RvVXJsID0gdHlwZW9mIHAucGhvdG9VcmwgPT09IFwic3RyaW5nXCIgPyBwLnBob3RvVXJsLnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgaW1hZ2VCYXNlNjQgPVxuICAgICAgdHlwZW9mIHAuaW1hZ2VCYXNlNjQgPT09IFwic3RyaW5nXCIgPyBwLmltYWdlQmFzZTY0LnJlcGxhY2UoL1xccy9nLCBcIlwiKSA6IFwiXCI7XG4gICAgY29uc3QgbWVkaWFUeXBlID0gdHlwZW9mIHAubWVkaWFUeXBlID09PSBcInN0cmluZ1wiID8gcC5tZWRpYVR5cGUudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICAgIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSBjb250aW51ZTtcbiAgICBpZiAocGhvdG9VcmwpIHtcbiAgICAgIHBob3Rvcy5wdXNoKHsgZGF0ZSwgcGhvdG9VcmwsIGltYWdlQmFzZTY0OiBcIlwiLCBtZWRpYVR5cGU6IFwiXCIgfSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGltYWdlQmFzZTY0ICYmXG4gICAgICAobWVkaWFUeXBlID09PSBcImltYWdlL2pwZWdcIiB8fFxuICAgICAgICBtZWRpYVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIgfHxcbiAgICAgICAgbWVkaWFUeXBlID09PSBcImltYWdlL2dpZlwiIHx8XG4gICAgICAgIG1lZGlhVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpXG4gICAgKSB7XG4gICAgICBwaG90b3MucHVzaCh7IGRhdGUsIHBob3RvVXJsOiBcIlwiLCBpbWFnZUJhc2U2NCwgbWVkaWFUeXBlIH0pO1xuICAgIH1cbiAgfVxuICBpZiAocGhvdG9zLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQXQgbGVhc3QgdHdvIHBob3RvcyBhcmUgcmVxdWlyZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgc2VsZWN0ZWQgPSBwaG90b3Muc2xpY2UoMCwgOCkuc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG4gIHR5cGUgQ29tcGFyZUNvbnRlbnRCbG9jayA9XG4gICAgfCB7IHR5cGU6IFwidGV4dFwiOyB0ZXh0OiBzdHJpbmcgfVxuICAgIHwge1xuICAgICAgICB0eXBlOiBcImltYWdlXCI7XG4gICAgICAgIHNvdXJjZToge1xuICAgICAgICAgIHR5cGU6IFwiYmFzZTY0XCI7XG4gICAgICAgICAgbWVkaWFfdHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgICAgICAgIGRhdGE6IHN0cmluZztcbiAgICAgICAgfTtcbiAgICAgIH07XG4gIGNvbnN0IGNvbnRlbnQ6IENvbXBhcmVDb250ZW50QmxvY2tbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHAgb2Ygc2VsZWN0ZWQpIHtcbiAgICBsZXQgYnVmOiBCdWZmZXI7XG4gICAgbGV0IG1lZGlhVHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgIGlmIChwLnBob3RvVXJsKSB7XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocC5waG90b1VybCk7XG4gICAgICBpZiAoIW5vcm1hbGl6ZWQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIHJlZmVyZW5jZS5cIiB9KTtcbiAgICAgIGNvbnN0IHJlZiA9IHBhcnNlUzNVcmkobm9ybWFsaXplZCk7XG4gICAgICBpZiAoIXJlZikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk9ubHkgczM6Ly8gcGhvdG8gcmVmZXJlbmNlcyBhcmUgc3VwcG9ydGVkLlwiIH0pO1xuICAgICAgaWYgKCFwaG90b0J1Y2tldE5hbWUgfHwgcmVmLmJ1Y2tldCAhPT0gcGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIGJ1Y2tldC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghczNLZXlBbGxvd2VkRm9yVXNlcihyZWYua2V5LCB1c2VySWQpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJQaG90byBkb2VzIG5vdCBiZWxvbmcgdG8gdGhpcyB1c2VyLlwiIH0pO1xuICAgICAgfVxuICAgICAgbGV0IGJ5dGVzOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbnRlbnRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCBzMy5zZW5kKG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiByZWYuYnVja2V0LCBLZXk6IHJlZi5rZXkgfSkpO1xuICAgICAgICBieXRlcyA9IGF3YWl0IG91dC5Cb2R5Py50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpO1xuICAgICAgICBjb250ZW50VHlwZSA9IG91dC5Db250ZW50VHlwZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQ291bGQgbm90IHJlYWQgb25lIG9mIHRoZSBwaG90b3MuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJ5dGVzIHx8IGJ5dGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkVtcHR5IHBob3RvIGZvdW5kLlwiIH0pO1xuICAgICAgYnVmID0gQnVmZmVyLmZyb20oYnl0ZXMpO1xuICAgICAgaWYgKGJ5dGVzLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJBIHBob3RvIGlzIHRvbyBsYXJnZS5cIiB9KTtcbiAgICAgIGlmIChpc1Vuc3VwcG9ydGVkRm9vZEltYWdlRm9ybWF0KHJlZi5rZXksIGNvbnRlbnRUeXBlKSB8fCBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmKGJ1ZikpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkhFSUMvSEVJRiBpbWFnZXMgYXJlIG5vdCBzdXBwb3J0ZWQuIFVzZSBKUEVHL1BORy9XZWJQLlwiIH0pO1xuICAgICAgfVxuICAgICAgbWVkaWFUeXBlID0gZ3Vlc3NGb29kSW1hZ2VNZWRpYVR5cGUocmVmLmtleSwgY29udGVudFR5cGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZGVjb2RlZDogQnVmZmVyO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKHAuaW1hZ2VCYXNlNjQsIFwiYmFzZTY0XCIpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGlubGluZSBwaG90byBlbmNvZGluZy5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkZWNvZGVkLmxlbmd0aCA9PT0gMCB8fCBkZWNvZGVkLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIklubGluZSBwaG90byBlbXB0eSBvciB0b28gbGFyZ2UuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZihkZWNvZGVkKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSEVJQy9IRUlGIGltYWdlcyBhcmUgbm90IHN1cHBvcnRlZC4gVXNlIEpQRUcvUE5HL1dlYlAuXCIgfSk7XG4gICAgICB9XG4gICAgICBidWYgPSBkZWNvZGVkO1xuICAgICAgbWVkaWFUeXBlID0gcC5tZWRpYVR5cGUgYXMgdHlwZW9mIG1lZGlhVHlwZTtcbiAgICB9XG4gICAgY29udGVudC5wdXNoKHsgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBQaG90byBkYXRlOiAke3AuZGF0ZX1gIH0pO1xuICAgIGNvbnRlbnQucHVzaCh7XG4gICAgICB0eXBlOiBcImltYWdlXCIsXG4gICAgICBzb3VyY2U6IHsgdHlwZTogXCJiYXNlNjRcIiwgbWVkaWFfdHlwZTogbWVkaWFUeXBlLCBkYXRhOiBidWYudG9TdHJpbmcoXCJiYXNlNjRcIikgfSxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBzeXN0ZW0gPSBgWW91IGFyZSBhbiBhc3Npc3RhbnQgZm9yIGEgZml0bmVzcyBhcHAuIENvbXBhcmUgdXNlciBwcm9ncmVzcyBwaG90b3MgYW5kIHByb3ZpZGUgYSBjYXJlZnVsIEVTVElNQVRFIG9ubHkuXG5SdWxlczpcbi0gRG8gTk9UIHByb3ZpZGUgZGlhZ25vc2lzLCBkaXNlYXNlIGNsYWltcywgb3IgbWVkaWNhbCBhZHZpY2UuXG4tIElmIGFuZ2xlLCBsaWdodGluZywgY2xvdGhpbmcsIG9yIHBvc3R1cmUgZGlmZmVyLCBleHBsaWNpdGx5IG1lbnRpb24gdW5jZXJ0YWludHkuXG4tIEZvY3VzIG9uIHZpc2libGUgdHJlbmQgY3VlcyBvbmx5IChtaWRzZWN0aW9uLCB3YWlzdGxpbmUsIGZhY2UgZnVsbG5lc3MsIHBvc3R1cmUgY29uc2lzdGVuY3kpLlxuLSBSZXR1cm4gT05MWSBKU09OOlxue1xuICBcInN1bW1hcnlcIjogXCIyLTQgc2VudGVuY2UgcGxhaW4tbGFuZ3VhZ2UgZXN0aW1hdGVcIixcbiAgXCJjb25maWRlbmNlXCI6IDAtMTAwLFxuICBcImRpc2NsYWltZXJcIjogXCJPbmUgc2VudGVuY2U6IGVzdGltYXRlIG9ubHksIG5vdCBtZWRpY2FsIGFkdmljZS5cIixcbiAgXCJoaWdobGlnaHRzXCI6IFtcbiAgICB7IFwiYXJlYVwiOiBcInN0cmluZ1wiLCBcImFzc2Vzc21lbnRcIjogXCJzdHJpbmdcIiwgXCJkaXJlY3Rpb25cIjogXCJsZWFuZXJ8dW5jaGFuZ2VkfHVuY2VydGFpblwiIH1cbiAgXVxufWA7XG4gIGNvbnN0IG1vZGVsID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0JPRFlfQ09NUEFSRV9NT0RFTD8udHJpbSgpIHx8IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCI7XG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgY29uc3QgcmVzcCA9IGF3YWl0IGNsaWVudC5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgbW9kZWwsXG4gICAgICBtYXhfdG9rZW5zOiA3MDAsXG4gICAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgICAgc3lzdGVtLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6IFwidXNlclwiLFxuICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgIC4uLmNvbnRlbnQsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgICB0ZXh0OlxuICAgICAgICAgICAgICAgIHF1ZXJ5IHx8XG4gICAgICAgICAgICAgICAgXCJDb21wYXJlIHRoZXNlIHBob3RvcyBmcm9tIG9sZGVzdCB0byBuZXdlc3QgYW5kIHN1bW1hcml6ZSB2aXNpYmxlIGNoYW5nZSB0cmVuZHMgYW5kIHVuY2VydGFpbnR5LlwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgICBjb25zdCB0ZXh0ID0gcmVzcC5jb250ZW50LmZpbmQoKHApID0+IHAudHlwZSA9PT0gXCJ0ZXh0XCIpPy50ZXh0ID8/IFwiXCI7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VCb2R5Q29tcGFyZUFzc2Vzc21lbnQodGV4dCk7XG4gICAgaWYgKCFwYXJzZWQpIHJldHVybiBqc29uKDUwMiwgeyBlcnJvcjogXCJDb3VsZCBub3QgcGFyc2UgQUkgY29tcGFyZSByZXN1bHQuXCIgfSk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICAuLi5wYXJzZWQsXG4gICAgICB0aW1lZnJhbWU6IHsgZnJvbTogc2VsZWN0ZWRbMF0/LmRhdGUsIHRvOiBzZWxlY3RlZFtzZWxlY3RlZC5sZW5ndGggLSAxXT8uZGF0ZSB9LFxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihKU09OLnN0cmluZ2lmeSh7IG1zZzogXCJwcm9ncmVzc19waG90b19hc3Nlc3NtZW50X2ZhaWxlZFwiLCBlcnI6IFN0cmluZyhlKSB9KSk7XG4gICAgcmV0dXJuIGpzb24oNTAyLCB7IGVycm9yOiBcIkFJIGNvbXBhcmUgZmFpbGVkLiBQbGVhc2UgdHJ5IGFnYWluLlwiIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgY29udGVudFR5cGUgPVxuICAgIHR5cGVvZiBib2R5LmNvbnRlbnRUeXBlID09PSBcInN0cmluZ1wiICYmIGJvZHkuY29udGVudFR5cGUubGVuZ3RoID4gMFxuICAgICAgPyBib2R5LmNvbnRlbnRUeXBlXG4gICAgICA6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIGNvbnN0IGZpbGVOYW1lID0gdHlwZW9mIGJvZHkuZmlsZU5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmZpbGVOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21GaWxlTmFtZSA9IGZpbGVOYW1lLm1hdGNoKC9cXC4oW2EtekEtWjAtOV0rKSQvKT8uWzFdPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21Cb2R5ID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGV4dGVuc2lvbiA9XG4gICAgZXh0RnJvbUZpbGVOYW1lICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tRmlsZU5hbWUpXG4gICAgICA/IGV4dEZyb21GaWxlTmFtZVxuICAgICAgOiBleHRGcm9tQm9keSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUJvZHkpXG4gICAgICAgID8gZXh0RnJvbUJvZHlcbiAgICAgICAgOiBcImpwZ1wiO1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBraW5kID0gdHlwZW9mIGJvZHkua2luZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkua2luZC50cmltKCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIGNvbnN0IGtleSA9XG4gICAga2luZCA9PT0gXCJmb29kXCJcbiAgICAgID8gYCR7dXNlcklkfS9mb29kLyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gXG4gICAgICA6IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBmcm9tRGIgPSAob3V0Lkl0ZW1zID8/IFtdKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KChhY2MsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBmbGFnID0gaXRlbS5mbGFnPy5TO1xuICAgIGNvbnN0IGVuYWJsZWRSYXcgPSBpdGVtLmVuYWJsZWQ/LkJPT0w7XG4gICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBlbmFibGVkUmF3ID09PSBcImJvb2xlYW5cIikge1xuICAgICAgYWNjW2ZsYWddID0gZW5hYmxlZFJhdztcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuXG4gIGNvbnN0IHNlcnZlckRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBjb25zdCBwaG90b0Zvb2QgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QSE9UT19GT09EX0xPR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEhPVE9fRk9PRF9MT0cgPSBwaG90b0Zvb2QgIT09IGZhbHNlO1xuICBjb25zdCBtZWFsTGlicmFyeSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX01FQUxfTElCUkFSWVwiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfTUVBTF9MSUJSQVJZID0gbWVhbExpYnJhcnkgIT09IGZhbHNlO1xuICBjb25zdCBubE1lYWxQYXJzZSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX05MX01FQUxfUEFSU0VcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX05MX01FQUxfUEFSU0UgPSBubE1lYWxQYXJzZSAhPT0gZmFsc2U7XG4gIGNvbnN0IGJvZHlDb21wYXJlQWkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9CT0RZX0NPTVBBUkVfQUlcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX0JPRFlfQ09NUEFSRV9BSSA9IGJvZHlDb21wYXJlQWkgIT09IGZhbHNlO1xuICBjb25zdCBwZXJzb25hbGl6ZWRDb2FjaGluZyA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElOR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEVSU09OQUxJWkVEX0FJX0NPQUNISU5HID0gcGVyc29uYWxpemVkQ29hY2hpbmcgIT09IGZhbHNlO1xuXG4gIGNvbnN0IG92ZXJyaWRlcyA9IHsgLi4uc2VydmVyRGVmYXVsdHMsIC4uLmZyb21EYiB9O1xuICByZXR1cm4ganNvbigyMDAsIHsgdXNlcklkLCBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgdGFyZ2V0VXNlcklkID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQ7XG4gIGlmICghdGFyZ2V0VXNlcklkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgdXNlcklkIHF1ZXJ5IHBhcmFtZXRlclwiIH0pO1xuICB9XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdGFyZ2V0VXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBvdmVycmlkZXMgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoKGl0ZW0pID0+ICh7XG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB0YXJnZXRVc2VySWQsXG4gICAgZmxhZzogaXRlbS5mbGFnPy5TID8/IFwiXCIsXG4gICAgZW5hYmxlZDogaXRlbS5lbmFibGVkPy5CT09MID8/IGZhbHNlLFxuICAgIHRzOiBpdGVtLnRzPy5TID8/IFwiXCIsXG4gIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCB1c2VySWQgPSB0eXBlb2YgYm9keS51c2VySWQgPT09IFwic3RyaW5nXCIgPyBib2R5LnVzZXJJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCByYXdGbGFnID0gdHlwZW9mIGJvZHkuZmxhZyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmxhZy50cmltKCkgOiBcIlwiO1xuICBjb25zdCBlbmFibGVkID0gdHlwZW9mIGJvZHkuZW5hYmxlZCA9PT0gXCJib29sZWFuXCIgPyBib2R5LmVuYWJsZWQgOiBudWxsO1xuICBpZiAoIXVzZXJJZCB8fCAhcmF3RmxhZyB8fCBlbmFibGVkID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgcGF5bG9hZC4gRXhwZWN0ZWQgdXNlcklkLCBmbGFnLCBlbmFibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IG5vcm1hbGl6ZWRGbGFnID0gcmF3RmxhZy5zdGFydHNXaXRoKFwiRkZfXCIpID8gcmF3RmxhZyA6IGBGRl8ke3Jhd0ZsYWd9YDtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBmbGFnOiB7IFM6IG5vcm1hbGl6ZWRGbGFnIH0sXG4gICAgICAgIGVuYWJsZWQ6IHsgQk9PTDogZW5hYmxlZCB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBvdmVycmlkZTogeyB1c2VySWQsIGZsYWc6IG5vcm1hbGl6ZWRGbGFnLCBlbmFibGVkLCB0cyB9IH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2JpbGxpbmcvY2hlY2tvdXQtc2Vzc2lvblwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVCaWxsaW5nQ2hlY2tvdXRTZXNzaW9uKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9iaWxsaW5nL3BvcnRhbFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVCaWxsaW5nUG9ydGFsU2Vzc2lvbih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi93ZWVrbHktcmVwb3J0L3NlbmQtZW1haWxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaGFuZGxlUG9zdFYyV2Vla2x5UmVwb3J0U2VuZEVtYWlsKGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50KSwgZXZlbnQsIGpzb24pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRJbnNpZ2h0c1YyKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2VzdGltYXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZEVzdGltYXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBzMyxcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUsXG4gICAgICAgIHBob3RvQnVja2V0TmFtZTogYnVja2V0LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTG9nQ29uZmlybSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2VzdGltYXRlLWJ1cm5cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaGFuZGxlVjJBY3Rpdml0eUVzdGltYXRlQnVybihldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3ZvaWNlLWRhaWx5LWxvZy9wYXJzZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGxldCBwYXlsb2FkOiB1bmtub3duO1xuICAgICAgdHJ5IHtcbiAgICAgICAgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gICAgICBjb25zdCB0cmFuc2NyaXB0ID0gdHlwZW9mIGJvZHkudHJhbnNjcmlwdCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkudHJhbnNjcmlwdCA6IFwiXCI7XG4gICAgICBpZiAoIXRyYW5zY3JpcHQudHJpbSgpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJ0cmFuc2NyaXB0IHJlcXVpcmVkXCIgfSk7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwYXJzZVZvaWNlRGFpbHlUcmFuc2NyaXB0V2l0aEFudGhyb3BpYyh0cmFuc2NyaXB0KTtcbiAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9XG4gICAgICAgICAgcmVzdWx0LmVycm9yID09PSBcIm5vX2FwaV9rZXlcIiB8fCByZXN1bHQuZXJyb3IgPT09IFwidm9pY2VfcGFyc2VfdGltZW91dFwiID8gNTAzIDogNDIyO1xuICAgICAgICByZXR1cm4ganNvbihzdGF0dXMsIHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBwYXJzZWQ6IHJlc3VsdC5wYXJzZWQgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9sb2dcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlMb2codXNlcklkLCBldmVudCwgeyBkZGIsIGVudHJpZXNUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvY2FsaWJyYXRpb25cIiAmJiBtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBzZXR0aW5nc1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9lbmVyZ3ktd2Vla2x5LXN1bW1hcnlcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGVUID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gICAgICBjb25zdCBkVCA9IGdldFJlcXVpcmVkRW52KFwiREFZX01FQUxfRU5UUklFU19UQUJMRV9OQU1FXCIsIGRheU1lYWxFbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIGNvbnN0IHNUID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnkodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGVudHJpZXNUYWJsZU5hbWU6IGVULFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIHNldHRpbmdzVGFibGVOYW1lOiBzVCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gbGlzdFByb2dyZXNzUGhvdG9zKHVzZXJJZCk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9wcm9ncmVzcy1waG90b3NcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlUHJvZ3Jlc3NQaG90byh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3Byb2dyZXNzLXBob3Rvcy9hc3Nlc3NtZW50XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGFzc2Vzc1Byb2dyZXNzUGhvdG9zKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cbiAgICBjb25zdCBwcm9ncmVzc0RlbE1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvcHJvZ3Jlc3MtcGhvdG9zXFwvKFteL10rKSQvKTtcbiAgICBpZiAocHJvZ3Jlc3NEZWxNYXRjaCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIHJldHVybiBkZWxldGVQcm9ncmVzc1Bob3RvKHVzZXJJZCwgZGVjb2RlVVJJQ29tcG9uZW50KHByb2dyZXNzRGVsTWF0Y2hbMV0gPz8gXCJcIikpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL21lYWwtY29tcGxldGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBmb29kVCA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWZvb2RUIHx8ICFtVCB8fCAhZFQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogZm9vZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0xpc3QodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHNcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0NyZWF0ZSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxIaXN0b3J5TWF0Y2ggPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKylcXC9oaXN0b3J5JC8pO1xuICAgIGlmIChtZWFsSGlzdG9yeU1hdGNoICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0hpc3RvcnkodXNlcklkLCBtZWFsSGlzdG9yeU1hdGNoWzFdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxQYXRjaERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL21lYWxzXFwvKFteL10rKSQvKTtcbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzUGF0Y2godXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0RlbGV0ZSh1c2VySWQsIG1lYWxQYXRjaERlbFsxXSwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXlNZWFsTGlzdE9yQ3JlYXRlID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvZGF5c1xcLyhbXFxkLV0rKVxcL21lYWwtZW50cmllcyQvKTtcbiAgICBpZiAoZGF5TWVhbExpc3RPckNyZWF0ZSAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNMaXN0KHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUIHx8ICFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNDcmVhdGUodXNlcklkLCBkYXlNZWFsTGlzdE9yQ3JlYXRlWzFdLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgICAgbWVhbHNUYWJsZU5hbWU6IG1ULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXNcXC8oW14vXSspJC8pO1xuICAgIGlmIChkYXlNZWFsRGVsICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUodXNlcklkLCBkYXlNZWFsRGVsWzFdLCBkYXlNZWFsRGVsWzJdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2ZlYXR1cmUtZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19