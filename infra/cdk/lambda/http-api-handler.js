"use strict";
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
function json(statusCode, payload) {
    return {
        statusCode,
        headers: { "content-type": "application/json" },
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
async function getSettings(userId) {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const out = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: userId } },
    }));
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
            },
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
        },
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
        const Anthropic = (await Promise.resolve().then(() => require("@anthropic-ai/sdk"))).default;
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
                const status = result.error === "no_api_key" ? 503 : 422;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE2c0RBLDBCQW9PQztBQWo3REQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZDQUF5QztBQUN6QyxtREFNaUM7QUFFakMsdURBQStFO0FBQy9FLHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsaURBS3dCO0FBQ3hCLDJDQVdxQjtBQUNyQixnRkFBb0c7QUFFcEcsTUFBTSxHQUFHLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLGdFQUE2QixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXpELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUN4RCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7QUFDMUQsTUFBTSx3QkFBd0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3pFLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztBQUNwRixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDO0FBQ3RELE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN4RSxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDO0FBQ3BELE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN4RSxNQUFNLHVCQUF1QixH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RyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQge1xuICBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmLFxuICBndWVzc0Zvb2RJbWFnZU1lZGlhVHlwZSxcbiAgaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdCxcbiAgcGFyc2VTM1VyaSxcbiAgczNLZXlBbGxvd2VkRm9yVXNlcixcbn0gZnJvbSBcIi4uLy4uLy4uL2xpYi9mb29kL3MzVXJpXCI7XG5pbXBvcnQgdHlwZSB7IEFpSW5zaWdodFN0cnVjdHVyZWQgfSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2FpSW5zaWdodFN0cnVjdHVyZWRcIjtcbmltcG9ydCB7IGJ1aWxkUGVyc29uYWxpemVkQ29hY2hpbmdQYXlsb2FkIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9haU51ZGdlcy9pbmRleFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVBaUluc2lnaHRDYXJkIH0gZnJvbSBcIi4vaW5zaWdodHMtYWktY2FyZFwiO1xuaW1wb3J0IHsgaGFuZGxlVjJGb29kRXN0aW1hdGUsIGhhbmRsZVYyRm9vZExvZ0NvbmZpcm0gfSBmcm9tIFwiLi9mb29kLWxvZy1hcGlcIjtcbmltcG9ydCB7XG4gIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoLFxuICBoYW5kbGVWMkFjdGl2aXR5RXN0aW1hdGVCdXJuLFxuICBoYW5kbGVWMkFjdGl2aXR5TG9nLFxuICBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnksXG59IGZyb20gXCIuL2FjdGl2aXR5LWFwaVwiO1xuaW1wb3J0IHtcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlLFxuICBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUsXG4gIGhhbmRsZVYyTWVhbHNDcmVhdGUsXG4gIGhhbmRsZVYyTWVhbHNEZWxldGUsXG4gIGhhbmRsZVYyTWVhbHNIaXN0b3J5LFxuICBoYW5kbGVWMk1lYWxzTGlzdCxcbiAgaGFuZGxlVjJNZWFsc1BhdGNoLFxuICBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoLFxufSBmcm9tIFwiLi9tZWFscy1hcGlcIjtcbmltcG9ydCB7IHBhcnNlVm9pY2VEYWlseVRyYW5zY3JpcHRXaXRoQW50aHJvcGljIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi92b2ljZURhaWx5TG9nL3BhcnNlVHJhbnNjcmlwdFwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgY29nbml0b0lkcCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5cbmNvbnN0IGVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBzZXR0aW5nc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlNFVFRJTkdTX1RBQkxFX05BTUU7XG5jb25zdCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5JTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU7XG5jb25zdCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTtcbmNvbnN0IHBob3RvQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlBIT1RPX0JVQ0tFVF9OQU1FO1xuY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GT09EX0xPR19FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBtZWFsc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52Lk1FQUxTX1RBQkxFX05BTUU7XG5jb25zdCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHByb2dyZXNzUGhvdG9zVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUU7XG5jb25zdCB1cGxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LlVQTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCI5MDBcIik7XG5jb25zdCBkb3dubG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiMzYwMFwiKTtcbmNvbnN0IGFuYWx5dGljc01ldGFVc2VySWQgPSBcIl9fbWV0YV9fXCI7XG5jb25zdCB1c2VyUG9vbElkRW52ID0gcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEO1xuXG50eXBlIENsYWltcyA9IHtcbiAgc3ViOiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247XG59O1xuXG50eXBlIEh0dHBFdmVudCA9IHtcbiAgcmF3UGF0aDogc3RyaW5nO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcbiAgcmVxdWVzdENvbnRleHQ/OiB7XG4gICAgYXV0aG9yaXplcj86IHtcbiAgICAgIGp3dD86IHtcbiAgICAgICAgY2xhaW1zPzogQ2xhaW1zO1xuICAgICAgfTtcbiAgICB9O1xuICB9O1xuICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbDtcbiAgYm9keT86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIGJvZHk6IHN0cmluZztcbn07XG5cbnR5cGUgRGFpbHlFbnRyeVVwc2VydCA9IHtcbiAgZGF0ZTogc3RyaW5nO1xuICBtb3JuaW5nV2VpZ2h0OiBudW1iZXI7XG4gIG5pZ2h0V2VpZ2h0PzogbnVtYmVyIHwgbnVsbDtcbiAgY2Fsb3JpZXM/OiBudW1iZXI7XG4gIHByb3RlaW4/OiBudW1iZXI7XG4gIHN0ZXBzPzogbnVtYmVyO1xuICBzbGVlcD86IG51bWJlcjtcbiAgbGF0ZVNuYWNrOiBib29sZWFuO1xuICBoaWdoU29kaXVtOiBib29sZWFuO1xuICB3b3Jrb3V0OiBib29sZWFuO1xuICBhbGNvaG9sOiBib29sZWFuO1xuICBwaG90b1VybD86IHN0cmluZyB8IG51bGw7XG4gIG5vdGVzPzogc3RyaW5nIHwgbnVsbDtcbiAgYWN0aXZpdHlUZXh0Pzogc3RyaW5nO1xuICBhY3Rpdml0eVN1bW1hcnk/OiBzdHJpbmc7XG4gIGFjdGl2aXR5QnVybktjYWw/OiBudW1iZXI7XG4gIGFjdGl2aXR5TWV0PzogbnVtYmVyO1xuICBhY3Rpdml0eU1pbnV0ZXM/OiBudW1iZXI7XG4gIGFjdGl2aXR5Q29uZmlkZW5jZT86IG51bWJlcjtcbn07XG5cbnR5cGUgU2V0dGluZ3NQYXRjaCA9IHtcbiAgZ29hbFdlaWdodDogbnVtYmVyO1xuICBzdGFydFdlaWdodDogbnVtYmVyO1xuICB0YXJnZXREYXRlOiBzdHJpbmc7XG4gIHVuaXQ6IFwia2dcIiB8IFwibGJzXCI7XG4gIHRvbmU/OiBcImZyaWVuZGx5XCIgfCBcImNsaW5pY2FsXCIgfCBcInRvdWdoLWxvdmVcIiB8IFwiYXl1cnZlZGljXCI7XG4gIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/OiBudW1iZXI7XG4gIG9wdEluRm9yZWNhc3Q/OiBib29sZWFuO1xuICBmb3JlY2FzdEdlbmVyYXRlZEF0Pzogc3RyaW5nO1xuICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZD86IGJvb2xlYW47XG59O1xuXG50eXBlIFN0b3JlZEVudHJ5ID0gRGFpbHlFbnRyeVVwc2VydCAmIHtcbiAgaWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xufTtcblxudHlwZSBTdG9yZWRTZXR0aW5ncyA9IFNldHRpbmdzUGF0Y2ggJiB7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxudHlwZSBQbGF0ZWF1VXNlclNldHRpbmdzID0ge1xuICByb2xsaW5nV2luZG93RGF5cz86IG51bWJlcjtcbiAgY29tcGFyaXNvblNwYW5EYXlzPzogbnVtYmVyO1xuICBtYXhBdmdNb3ZlbWVudEtnPzogbnVtYmVyO1xufTtcblxudHlwZSBJbnNpZ2h0Q2FyZCA9IHtcbiAgaWQ6IHN0cmluZztcbiAgcnVsZUlkOiBzdHJpbmc7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIGhlYWRsaW5lOiBzdHJpbmc7XG4gIGRldGFpbD86IHN0cmluZztcbiAgd2h5OiBzdHJpbmdbXTtcbiAgYWN0aW9uOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBcInNvZGl1bVwiIHwgXCJhbGNvaG9sXCIgfCBcImxhdGVfc25hY2tcIiB8IFwid29ya291dFwiIHwgXCJwbGF0ZWF1XCIgfCBcInN0cmVha1wiIHwgXCJ0cmFqZWN0b3J5XCI7XG4gIGdlbmVyYXRpb25Tb3VyY2U/OiBcImxsbVwiIHwgXCJydWxlc1wiO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgc3RydWN0dXJlZD86IEFpSW5zaWdodFN0cnVjdHVyZWQ7XG4gIGRlZ3JhZGVkPzogYm9vbGVhbjtcbn07XG5cbmZ1bmN0aW9uIGpzb24oc3RhdHVzQ29kZTogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKTogSHR0cFJlc3VsdCB7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZSxcbiAgICBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVpcmVkRW52KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52IHZhciAke25hbWV9YCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUpzb25Cb2R5KGV2ZW50OiBIdHRwRXZlbnQpOiB1bmtub3duIHtcbiAgaWYgKCFldmVudC5ib2R5KSByZXR1cm4ge307XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gIH0gY2F0Y2gge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgSlNPTlwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0RhdGVTdHJpbmcodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiICYmIC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZW52RmxhZ1RyaVN0YXRlKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuICBjb25zdCB2ID0gcHJvY2Vzcy5lbnZbbmFtZV07XG4gIGlmICh2ID09PSBcInRydWVcIikgcmV0dXJuIHRydWU7XG4gIGlmICh2ID09PSBcImZhbHNlXCIpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNCb2R5Q29tcGFyZUFpRW5hYmxlZExhbWJkYSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIHByb2Nlc3MuZW52LkZGX0JPRFlfQ09NUEFSRV9BSSAhPT0gXCJmYWxzZVwiO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVRleHQgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVRleHQgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVRleHQubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlUZXh0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVN1bW1hcnkubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlTdW1tYXJ5XCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5hY3Rpdml0eUJ1cm5LY2FsKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUJ1cm5LY2FsXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1pbnV0ZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmFjdGl2aXR5TWludXRlcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlNaW51dGVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1ldCAhPT0gdW5kZWZpbmVkICYmICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuYWN0aXZpdHlNZXQpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5TWV0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICghaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSkgfHwgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgPiAxMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUNvbmZpZGVuY2VcIiB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBkYXRlOiBib2R5LmRhdGUsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBib2R5Lm1vcm5pbmdXZWlnaHQsXG4gICAgICBuaWdodFdlaWdodDogKGJvZHkubmlnaHRXZWlnaHQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGJvZHkuY2Fsb3JpZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogYm9keS5wcm90ZWluIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBib2R5LnN0ZXBzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBib2R5LnNsZWVwIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogYm9keS5sYXRlU25hY2sgYXMgYm9vbGVhbixcbiAgICAgIGhpZ2hTb2RpdW06IGJvZHkuaGlnaFNvZGl1bSBhcyBib29sZWFuLFxuICAgICAgd29ya291dDogYm9keS53b3Jrb3V0IGFzIGJvb2xlYW4sXG4gICAgICBhbGNvaG9sOiBib2R5LmFsY29ob2wgYXMgYm9vbGVhbixcbiAgICAgIHBob3RvVXJsOiAoYm9keS5waG90b1VybCBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBub3RlczogKGJvZHkubm90ZXMgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlUZXh0OiBib2R5LmFjdGl2aXR5VGV4dCBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eVN1bW1hcnk6IGJvZHkuYWN0aXZpdHlTdW1tYXJ5IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5QnVybktjYWw6IGJvZHkuYWN0aXZpdHlCdXJuS2NhbCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1ldDogYm9keS5hY3Rpdml0eU1ldCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1pbnV0ZXM6IGJvZHkuYWN0aXZpdHlNaW51dGVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5Q29uZmlkZW5jZTogYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU2V0dGluZ3MoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBTZXR0aW5nc1BhdGNoIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuZ29hbFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBnb2FsV2VpZ2h0XCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuc3RhcnRXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhcnRXZWlnaHRcIiB9O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LnRhcmdldERhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdGFyZ2V0RGF0ZVwiIH07XG4gIGlmIChib2R5LnVuaXQgIT09IFwia2dcIiAmJiBib2R5LnVuaXQgIT09IFwibGJzXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB1bml0XCIgfTtcbiAgaWYgKFxuICAgIGJvZHkudG9uZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS50b25lICE9PSBcImZyaWVuZGx5XCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiY2xpbmljYWxcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJ0b3VnaC1sb3ZlXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiYXl1cnZlZGljXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRvbmVcIiB9O1xuICB9XG4gIGlmIChib2R5Lm9wdEluRm9yZWNhc3QgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgYm9keS5vcHRJbkZvcmVjYXN0ICE9PSBcImJvb2xlYW5cIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBvcHRJbkZvcmVjYXN0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0ICE9PSB1bmRlZmluZWQgJiZcbiAgICAodHlwZW9mIGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQubGVuZ3RoID4gNjQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBmb3JlY2FzdEdlbmVyYXRlZEF0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCAhPT0gdW5kZWZpbmVkICYmXG4gICAgdHlwZW9mIGJvZHkuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgIT09IFwiYm9vbGVhblwiXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZFwiIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBib2R5LmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogYm9keS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGJvZHkudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGJvZHkudW5pdCxcbiAgICAgIHRvbmU6IGJvZHkudG9uZSBhcyBTZXR0aW5nc1BhdGNoW1widG9uZVwiXSxcbiAgICAgIG9wdEluRm9yZWNhc3Q6IGJvZHkub3B0SW5Gb3JlY2FzdCBhcyBib29sZWFuIHwgdW5kZWZpbmVkLFxuICAgICAgZm9yZWNhc3RHZW5lcmF0ZWRBdDogYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkOiBib2R5LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkIGFzIGJvb2xlYW4gfCB1bmRlZmluZWQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Snd0Q2xhaW1zKGV2ZW50OiBIdHRwRXZlbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHJhdyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcztcbiAgaWYgKHJhdyA9PSBudWxsKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiByYXcgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBzdWIgPSBnZXRKd3RDbGFpbXMoZXZlbnQpPy5zdWI7XG4gIHJldHVybiB0eXBlb2Ygc3ViID09PSBcInN0cmluZ1wiID8gc3ViIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaXJzdE5hbWVGcm9tSnd0Q2xhaW1zKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWNsYWltcykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgZ2l2ZW4gPSBjbGFpbXMuZ2l2ZW5fbmFtZTtcbiAgaWYgKHR5cGVvZiBnaXZlbiA9PT0gXCJzdHJpbmdcIiAmJiBnaXZlbi50cmltKCkpIHJldHVybiBnaXZlbi50cmltKCk7XG4gIGNvbnN0IG5hbWUgPSBjbGFpbXMubmFtZTtcbiAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiICYmIG5hbWUudHJpbSgpKSB7XG4gICAgY29uc3QgZmlyc3QgPSBuYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdO1xuICAgIHJldHVybiBmaXJzdCB8fCB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oXG4gIGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiB8IHVuZGVmaW5lZCxcbik6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfCB1bmRlZmluZWQge1xuICBpZiAoIWl0ZW0pIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG91dDogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBjb25zdCBydyA9IGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzPy5OO1xuICBjb25zdCBzcGFuID0gaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzPy5OO1xuICBjb25zdCBtdiA9IGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2c/Lk47XG4gIGlmIChydyAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihydyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LnJvbGxpbmdXaW5kb3dEYXlzID0gbjtcbiAgfVxuICBpZiAoc3BhbiAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihzcGFuKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQuY29tcGFyaXNvblNwYW5EYXlzID0gbjtcbiAgfVxuICBpZiAobXYgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIobXYpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4gT2JqZWN0LmtleXMob3V0KS5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChcbiAgcmF3OiB1bmtub3duLFxuKTogeyBvazogdHJ1ZTsgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwbGF0ZWF1IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBvID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBkYXRhOiBQbGF0ZWF1VXNlclNldHRpbmdzID0ge307XG4gIGlmIChvLnJvbGxpbmdXaW5kb3dEYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8ucm9sbGluZ1dpbmRvd0RheXMpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5yb2xsaW5nV2luZG93RGF5c1wiIH07XG4gICAgZGF0YS5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKG8uY29tcGFyaXNvblNwYW5EYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8uY29tcGFyaXNvblNwYW5EYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzXCIgfTtcbiAgICBkYXRhLmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG8ubWF4QXZnTW92ZW1lbnRLZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLm1heEF2Z01vdmVtZW50S2cpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnXCIgfTtcbiAgICBkYXRhLm1heEF2Z01vdmVtZW50S2cgPSBuO1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhIH07XG59XG5cbi8qKiBHbWFpbCB0cmVhdHMgZG90cyBhbmQgK2xhYmVscyBhcyBhbGlhc2VzOyBub3JtYWxpemUgc28gYWRtaW4gbGlzdCBtYXRjaGVzIHJlYWwgc2lnbi1pbiBpZGVudGl0aWVzLiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGVtYWlsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBsb3dlciA9IGVtYWlsLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBhdCA9IGxvd2VyLmxhc3RJbmRleE9mKFwiQFwiKTtcbiAgaWYgKGF0IDw9IDApIHJldHVybiBsb3dlcjtcbiAgY29uc3QgbG9jYWwgPSBsb3dlci5zbGljZSgwLCBhdCk7XG4gIGNvbnN0IGRvbWFpbiA9IGxvd2VyLnNsaWNlKGF0ICsgMSk7XG4gIGlmIChkb21haW4gPT09IFwiZ21haWwuY29tXCIgfHwgZG9tYWluID09PSBcImdvb2dsZW1haWwuY29tXCIpIHtcbiAgICBjb25zdCBiYXNlTG9jYWwgPSAobG9jYWwuc3BsaXQoXCIrXCIpWzBdID8/IGxvY2FsKS5yZXBsYWNlKC9cXC4vZywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2VMb2NhbH1AJHtkb21haW59YDtcbiAgfVxuICByZXR1cm4gbG93ZXI7XG59XG5cbmZ1bmN0aW9uIGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpOiBTZXQ8c3RyaW5nPiB7XG4gIGNvbnN0IHJhdyA9IHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwidmloYXJuYXJAZ21haWwuY29tXCI7XG4gIGNvbnN0IHBhcnRzID0gcmF3XG4gICAgLnNwbGl0KFwiLFwiKVxuICAgIC5tYXAoKHMpID0+IG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChzLnRyaW0oKSkpXG4gICAgLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChwYXJ0cyk7XG4gIGlmIChzZXQuc2l6ZSA9PT0gMCkge1xuICAgIHNldC5hZGQobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKFwidmloYXJuYXJAZ21haWwuY29tXCIpKTtcbiAgfVxuICByZXR1cm4gc2V0O1xufVxuXG5jb25zdCBBRE1JTl9DTEFJTV9LRVlTID0gW1widXNlcm5hbWVcIiwgXCJjb2duaXRvOnVzZXJuYW1lXCIsIFwiZW1haWxcIiwgXCJwcmVmZXJyZWRfdXNlcm5hbWVcIl0gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nW10ge1xuICBjb25zdCBmb3VuZDogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZW1haWxpc2ggPSAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLztcbiAgZm9yIChjb25zdCBrZXkgb2YgQURNSU5fQ0xBSU1fS0VZUykge1xuICAgIGNvbnN0IHYgPSBjbGFpbXNba2V5XTtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGNsYWltcykpIHtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBbLi4ubmV3IFNldChmb3VuZCldO1xufVxuXG4vKiogVHJ1ZSBpZiBKV1QgY2xhaW1zIGluY2x1ZGUgYW4gZW1haWwgaWRlbnRpdHkgdGhhdCBtYXRjaGVzIHRoZSBjb25maWd1cmVkIGFkbWluIGFsbG93IGxpc3QuICovXG5mdW5jdGlvbiBpc0FkbWluQ2FsbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBib29sZWFuIHtcbiAgY29uc3QgY2xhaW1zID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KTtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXMpO1xuICBmb3IgKGNvbnN0IGMgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGMpKSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoZWFkZXJWYWx1ZShcbiAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCxcbiAgbmFtZTogc3RyaW5nLFxuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFoZWFkZXJzKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCB3YW50ID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhoZWFkZXJzKSkge1xuICAgIGlmIChrLnRvTG93ZXJDYXNlKCkgPT09IHdhbnQgJiYgdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgdi5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gdjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBKV1QgSFRUUCBBUEkgYXV0aG9yaXplcnMgdmFsaWRhdGUgQXV0aG9yaXphdGlvbiBidXQgdHlwaWNhbGx5IGRvIG5vdCBmb3J3YXJkIHRoYXQgaGVhZGVyIHRvIExhbWJkYS5cbiAqIENsaWVudHMgYWxzbyBzZW5kIHgtY29nbml0by1hY2Nlc3MtdG9rZW4gKHNlZSBmcm9udGVuZC1hcGktY2xpZW50KSBzbyB3ZSBjYW4gY2FsbCBjb2duaXRvLWlkcDpHZXRVc2VyLlxuICovXG5mdW5jdGlvbiBiZWFyZXJBY2Nlc3NUb2tlbihldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgaCA9IGV2ZW50LmhlYWRlcnM7XG4gIGNvbnN0IGN1c3RvbSA9IGhlYWRlclZhbHVlKGgsIFwieC1jb2duaXRvLWFjY2Vzcy10b2tlblwiKTtcbiAgaWYgKGN1c3RvbT8udHJpbSgpKSByZXR1cm4gY3VzdG9tLnRyaW0oKTtcbiAgY29uc3QgcmF3ID0gaGVhZGVyVmFsdWUoaCwgXCJhdXRob3JpemF0aW9uXCIpO1xuICBpZiAoIXJhdykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgbSA9IHJhdy5tYXRjaCgvXkJlYXJlclxccysoLispJC9pKTtcbiAgcmV0dXJuIG0/LlsxXT8udHJpbSgpO1xufVxuXG4vKiogV2hlbiBjbGFpbXMgbGFjayBhIHJlc29sdmFibGUgZW1haWwsIHZlcmlmeSBhZG1pbiB2aWEgR2V0VXNlcjsgdG9rZW4gc3ViIG11c3QgbWF0Y2ggSldUIHN1Yi4gKi9cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgdG9rZW4gPSBiZWFyZXJBY2Nlc3NUb2tlbihldmVudCk7XG4gIGlmICghdG9rZW4pIHJldHVybiBmYWxzZTtcbiAgY29uc3Qgand0U3ViID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgaWYgKCFqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQobmV3IEdldFVzZXJDb21tYW5kKHsgQWNjZXNzVG9rZW46IHRva2VuIH0pKTtcbiAgICBjb25zdCBhdHRycyA9IG91dC5Vc2VyQXR0cmlidXRlcyA/PyBbXTtcbiAgICBjb25zdCB0b2tlblN1YiA9IGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJzdWJcIik/LlZhbHVlO1xuICAgIGlmICh0b2tlblN1YiAhPT0gand0U3ViKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZW1haWwgPVxuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcImVtYWlsXCIpPy5WYWx1ZSA/P1xuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInByZWZlcnJlZF91c2VybmFtZVwiKT8uVmFsdWU7XG4gICAgY29uc3QgZnJvbVVzZXJuYW1lID0gb3V0LlVzZXJuYW1lPy5pbmNsdWRlcyhcIkBcIikgPyBvdXQuVXNlcm5hbWUgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgY2FuZGlkYXRlID0gKGVtYWlsID8/IGZyb21Vc2VybmFtZSA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIWNhbmRpZGF0ZSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGNhbmRpZGF0ZSkpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaXNBZG1pbkFsbG93ZWQoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAoaXNBZG1pbkNhbGxlcihldmVudCkpIHJldHVybiB0cnVlO1xuICByZXR1cm4gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQpO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0RGF0ZSgpOiBzdHJpbmcge1xuICBjb25zdCBkID0gbmV3IERhdGUoKTtcbiAgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpICsgMTE4KTtcbiAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHBob3RvVXJsOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFwaG90b1VybCB8fCB0eXBlb2YgcGhvdG9VcmwgIT09IFwic3RyaW5nXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmIChwaG90b1VybC5zdGFydHNXaXRoKFwiczM6Ly9cIikpIHJldHVybiBwaG90b1VybDtcbiAgaWYgKCFwaG90b1VybC5pbmNsdWRlcyhcIjovL1wiKSkge1xuICAgIGNvbnN0IGtleU9ubHkgPSBwaG90b1VybC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGlmICgha2V5T25seSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBpZiAocGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtwaG90b0J1Y2tldE5hbWV9LyR7a2V5T25seX1gO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTChwaG90b1VybCk7XG4gICAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQocGFyc2VkLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgXCJcIikpO1xuICAgIGlmICghcGF0aCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIC8vIFZpcnR1YWwtaG9zdGVkLXN0eWxlIFVSTDogYnVja2V0LnMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgdmlydHVhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAodmlydHVhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHt2aXJ0dWFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBMZWdhY3kgZ2xvYmFsIGVuZHBvaW50OiBidWNrZXQuczMuYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCBnbG9iYWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmIChnbG9iYWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7Z2xvYmFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBQYXRoLXN0eWxlIFVSTDogczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9idWNrZXQva2V5XG4gICAgaWYgKC9eczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvLnRlc3QoaG9zdCkgfHwgaG9zdCA9PT0gXCJzMy5hbWF6b25hd3MuY29tXCIpIHtcbiAgICAgIGNvbnN0IHNsYXNoID0gcGF0aC5pbmRleE9mKFwiL1wiKTtcbiAgICAgIGlmIChzbGFzaCA8PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgYnVja2V0ID0gcGF0aC5zbGljZSgwLCBzbGFzaCk7XG4gICAgICBjb25zdCBrZXkgPSBwYXRoLnNsaWNlKHNsYXNoICsgMSk7XG4gICAgICBpZiAoIWJ1Y2tldCB8fCAha2V5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGBzMzovLyR7YnVja2V0fS8ke2tleX1gO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzb3J0QnlEYXRlQXNjPFQgZXh0ZW5kcyB7IGRhdGU6IHN0cmluZyB9Pihyb3dzOiBUW10pOiBUW10ge1xuICByZXR1cm4gWy4uLnJvd3NdLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xufVxuXG5mdW5jdGlvbiBhdmVyYWdlKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gdmFsdWVzLnJlZHVjZSgoYWNjLCB2YWx1ZSkgPT4gYWNjICsgdmFsdWUsIDApIC8gdmFsdWVzLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gcm91bmQyKHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5yb3VuZCh2YWx1ZSAqIDEwMCkgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIG5leHRNb3JuaW5nRGVsdGFzKFxuICBsb2dzOiBTdG9yZWRFbnRyeVtdLFxuICBwcmVkaWNhdGU6IChsb2c6IFN0b3JlZEVudHJ5KSA9PiBib29sZWFuLFxuKTogeyBmbGFnZ2VkOiBudW1iZXJbXTsgYmFzZWxpbmU6IG51bWJlcltdIH0ge1xuICBjb25zdCBzb3J0ZWQgPSBzb3J0QnlEYXRlQXNjKGxvZ3MpO1xuICBjb25zdCBmbGFnZ2VkOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBiYXNlbGluZTogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgc29ydGVkLmxlbmd0aCAtIDE7IGlkeCArPSAxKSB7XG4gICAgY29uc3QgZGVsdGEgPSBzb3J0ZWRbaWR4ICsgMV0ubW9ybmluZ1dlaWdodCAtIHNvcnRlZFtpZHhdLm1vcm5pbmdXZWlnaHQ7XG4gICAgaWYgKHByZWRpY2F0ZShzb3J0ZWRbaWR4XSkpIGZsYWdnZWQucHVzaChkZWx0YSk7XG4gICAgZWxzZSBiYXNlbGluZS5wdXNoKGRlbHRhKTtcbiAgfVxuICByZXR1cm4geyBmbGFnZ2VkLCBiYXNlbGluZSB9O1xufVxuXG5mdW5jdGlvbiBzb2RpdW1JbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuaGlnaFNvZGl1bSk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYHNvZGl1bS1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcInNvZGl1bUJ1bXBcIixcbiAgICBwcmlvcml0eTogOTUsXG4gICAgaGVhZGxpbmU6IFwiSGlnaC1zb2RpdW0gZGF5cyBhcmUgbGlua2VkIHRvIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHdlaWdoLWlucy5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdnMgeW91ciBub24tc29kaXVtIGJhc2VsaW5lIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBoaWdoLXNvZGl1bSBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBvbiBoaWdoLXNvZGl1bSBkYXlzOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiVHJ5IG9uZSBsb3dlci1zb2RpdW0gZGlubmVyIHN3YXAgdG9uaWdodC5cIixcbiAgICBjYXRlZ29yeTogXCJzb2RpdW1cIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYWxjb2hvbEluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5hbGNvaG9sKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgYWxjb2hvbC1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImFsY29ob2xcIixcbiAgICBwcmlvcml0eTogOTAsXG4gICAgaGVhZGxpbmU6IFwiQWxjb2hvbCBkYXlzIHRlbmQgdG8gc2hvdyBhIG5leHQtZGF5IHdlaWdodCBidW1wLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2ZXJzdXMgbm9uLWFsY29ob2wgZGF5cyB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gYWxjb2hvbC1sb2dnZWQgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2UgYWZ0ZXIgYWxjb2hvbDogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlBsYW4gYWxjb2hvbC1mcmVlIHdlZWtkYXlzIGZvciBzdGVhZGllciB0cmVuZCBsaW5lcy5cIixcbiAgICBjYXRlZ29yeTogXCJhbGNvaG9sXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGxhdGVTbmFja0luc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5sYXRlU25hY2spO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBsYXRlLXNuYWNrLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwibGF0ZVNuYWNrXCIsXG4gICAgcHJpb3JpdHk6IDg4LFxuICAgIGhlYWRsaW5lOiBcIkxhdGUgc25hY2tzIGFyZSBjb3JyZWxhdGVkIHdpdGggaGVhdmllciBuZXh0LW1vcm5pbmcgc2NhbGUgcmVhZGluZ3MuXCIsXG4gICAgZGV0YWlsOiBgWW91ciBuZXh0LWRheSBjaGFuZ2UgaXMgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIGhpZ2hlciB0aGFuIHlvdXIgbm9uLWxhdGUtc25hY2sgYmFzZWxpbmUuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBsYXRlLXNuYWNrIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIHdpdGggbGF0ZSBzbmFjazogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlNldCBhIDItaG91ciBraXRjaGVuIGNsb3NlIHRpbWUgYmVmb3JlIGJlZC5cIixcbiAgICBjYXRlZ29yeTogXCJsYXRlX3NuYWNrXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGJhc2VsaW5lSW5zaWdodFdpdGhMb2dzKGVudHJ5Q291bnQ6IG51bWJlciwgbGF0ZXN0RGF0ZTogc3RyaW5nKTogSW5zaWdodENhcmQge1xuICByZXR1cm4ge1xuICAgIGlkOiBgYmFzZWxpbmUtaW5zaWdodC0ke2xhdGVzdERhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiR3JlYXQgY29uc2lzdGVuY3kgc28gZmFyIOKAlCBrZWVwIGxvZ2dpbmcgZGFpbHkgZm9yIHNoYXJwZXIgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJXZSBuZWVkIGEgYml0IG1vcmUgc2lnbmFsIHRvIGRldGVjdCBzdHJvbmcgcGVyc29uYWwgcGF0dGVybnMsIGJ1dCB5b3VyIGRhdGEgZmxvdyBpcyBhY3RpdmUuXCIsXG4gICAgd2h5OiBbXG4gICAgICBgJHtlbnRyeUNvdW50fSBsb2dzIGFuYWx5emVkIGZyb20gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBcIk5vIHJ1bGUgY3Jvc3NlZCBjb25maWRlbmNlIHRocmVzaG9sZHMgeWV0XCIsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiS2VlcCB0cmFja2luZyBkYWlseSBoYWJpdHMgYW5kIHdlaWdodCB0byB1bmxvY2sgc3Ryb25nZXIgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGNhdGVnb3J5OiBcInN0cmVha1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHROb0xvZ3MoYXNPZkRhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHthc09mRGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJiYXNlbGluZVwiLFxuICAgIHByaW9yaXR5OiAxMCxcbiAgICBoZWFkbGluZTogXCJTdGFydCBsb2dnaW5nIHdlaWdodCBhbmQgaGFiaXRzIHRvIHVubG9jayBwZXJzb25hbGl6ZWQgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOiBcIk9uY2UgeW91IGhhdmUgYSBmZXcgd2Vla3Mgb2YgZW50cmllcywgd2Ugd2lsbCBoaWdobGlnaHQgcGF0dGVybnMgdGhhdCBtYXRjaCB5b3VyIGRhdGEuXCIsXG4gICAgd2h5OiBbXCJObyBlbnRyaWVzIGZvdW5kIGluIHRoZSBsYXN0IDkwIGRheXNcIl0sXG4gICAgYWN0aW9uOiBcIkFkZCB0b2RheSdzIHdlaWdodCBvbiB0aGUgbGVmdCB0byBiZWdpbi5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5zaWdodHNWMih1c2VySWQ6IHN0cmluZywgX2V2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRvID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZnJvbURhdGUgPSBuZXcgRGF0ZSgpO1xuICBmcm9tRGF0ZS5zZXREYXRlKGZyb21EYXRlLmdldERhdGUoKSAtIDg5KTtcbiAgY29uc3QgZnJvbSA9IGZyb21EYXRlLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOmZyb21EYXRlXCI6IHsgUzogZnJvbSB9LFxuICAgICAgICBcIjp0b0RhdGVcIjogeyBTOiB0byB9LFxuICAgICAgfSxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZW50cmllc1JhdyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICB9KSxcbiAgKS5maWx0ZXIoKGUpID0+IGUuZGF0ZSAmJiBlLm1vcm5pbmdXZWlnaHQgPiAwKTtcblxuICBjb25zdCBzZXR0aW5nc1RhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgc2V0dGluZ3NSb3cgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBzZXR0aW5nc1RhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGdJdGVtID0gc2V0dGluZ3NSb3cuSXRlbTtcbiAgY29uc3QgZ29hbFdlaWdodCA9IGdJdGVtID8gTnVtYmVyKGdJdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpIDogNzI7XG4gIGNvbnN0IHN0YXJ0V2VpZ2h0ID0gZ0l0ZW0gPyBOdW1iZXIoZ0l0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpIDogODU7XG4gIGNvbnN0IHRhcmdldERhdGUgPSBnSXRlbT8udGFyZ2V0RGF0ZT8uUyA/PyB0bztcblxuICBjb25zdCBpbnNpZ2h0cyA9IGF3YWl0IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZChkZGIsIHtcbiAgICB1c2VySWQsXG4gICAgZW50cmllc1JhdyxcbiAgICBnb2FsV2VpZ2h0LFxuICAgIHN0YXJ0V2VpZ2h0LFxuICAgIHRhcmdldERhdGUsXG4gICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lLFxuICB9KTtcblxuICBjb25zdCBib2R5T3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgaW5zaWdodHMgfTtcbiAgaWYgKHByb2Nlc3MuZW52LkZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElORyAhPT0gXCJmYWxzZVwiKSB7XG4gICAgY29uc3Qgc3Vic1RhYmxlID0gcHJvY2Vzcy5lbnYuU1VCU0NSSVBUSU9OU19UQUJMRV9OQU1FO1xuICAgIGxldCBwbGFuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgbGV0IHN1YnNjcmlwdGlvblN0YXR1czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGlmIChzdWJzVGFibGUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN1Yk91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgICAgICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICAgICAgICBUYWJsZU5hbWU6IHN1YnNUYWJsZSxcbiAgICAgICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgICAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuICAgICAgICBwbGFuID0gc3ViT3V0Lkl0ZW0/LnBsYW4/LlMgPz8gXCJmcmVlXCI7XG4gICAgICAgIHN1YnNjcmlwdGlvblN0YXR1cyA9IHN1Yk91dC5JdGVtPy5zdGF0dXM/LlMgPz8gXCJpbmFjdGl2ZVwiO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHBsYW4gPSBcImZyZWVcIjtcbiAgICAgICAgc3Vic2NyaXB0aW9uU3RhdHVzID0gXCJpbmFjdGl2ZVwiO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzb3J0ZWQgPSBbLi4uZW50cmllc1Jhd10uc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG4gICAgY29uc3QgbGFzdDcgPSBzb3J0ZWQuc2xpY2UoLTcpO1xuICAgIGNvbnN0IGtjYWxzID0gbGFzdDcubWFwKChlKSA9PiBlLmNhbG9yaWVzKS5maWx0ZXIoKGMpOiBjIGlzIG51bWJlciA9PiB0eXBlb2YgYyA9PT0gXCJudW1iZXJcIiAmJiBjID4gMCk7XG4gICAgY29uc3QgcmVjZW50QXZnRGFpbHlDYWxvcmllcyA9XG4gICAgICBrY2Fscy5sZW5ndGggPj0gMiA/IGtjYWxzLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIC8ga2NhbHMubGVuZ3RoIDogbnVsbDtcbiAgICBib2R5T3V0LnBlcnNvbmFsaXplZENvYWNoaW5nID0gYnVpbGRQZXJzb25hbGl6ZWRDb2FjaGluZ1BheWxvYWQoe1xuICAgICAgZW50cmllc1JhdyxcbiAgICAgIGdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGUsXG4gICAgICBhc09mRGF0ZTogdG8sXG4gICAgICBwbGFuLFxuICAgICAgc3Vic2NyaXB0aW9uU3RhdHVzLFxuICAgICAgcmVjZW50QXZnRGFpbHlDYWxvcmllcyxcbiAgICB9KTtcbiAgfVxuICByZXR1cm4ganNvbigyMDAsIGJvZHlPdXQpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FXCIsIGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgaW5zaWdodElkID0gdHlwZW9mIGJvZHkuaW5zaWdodElkID09PSBcInN0cmluZ1wiID8gYm9keS5pbnNpZ2h0SWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qgdm90ZVJhdyA9IGJvZHkudm90ZTtcbiAgY29uc3QgYWxsb3dlZFZvdGVzID0gbmV3IFNldChbXCJ1cFwiLCBcImRvd25cIiwgXCJoZWxwZnVsXCIsIFwibm90X2hlbHBmdWxcIiwgXCJkaXNtaXNzXCJdKTtcbiAgY29uc3Qgdm90ZSA9XG4gICAgdHlwZW9mIHZvdGVSYXcgPT09IFwic3RyaW5nXCIgJiYgYWxsb3dlZFZvdGVzLmhhcyh2b3RlUmF3KVxuICAgICAgPyAodm90ZVJhdyBhcyBcInVwXCIgfCBcImRvd25cIiB8IFwiaGVscGZ1bFwiIHwgXCJub3RfaGVscGZ1bFwiIHwgXCJkaXNtaXNzXCIpXG4gICAgICA6IG51bGw7XG4gIGlmICghaW5zaWdodElkIHx8ICF2b3RlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbnNpZ2h0IGZlZWRiYWNrIHBheWxvYWRcIiB9KTtcbiAgY29uc3QgY29tbWVudFJhdyA9IGJvZHkuY29tbWVudDtcbiAgY29uc3QgY29tbWVudCA9XG4gICAgdHlwZW9mIGNvbW1lbnRSYXcgPT09IFwic3RyaW5nXCIgJiYgY29tbWVudFJhdy50cmltKCkubGVuZ3RoID4gMFxuICAgICAgPyBjb21tZW50UmF3LnRyaW0oKS5zbGljZSgwLCAyMDAwKVxuICAgICAgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGZlZWRiYWNrVHlwZSA9IGJvZHkuZmVlZGJhY2tUeXBlID09PSBcIm5lZ2F0aXZlXCIgPyBcIm5lZ2F0aXZlXCIgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgaW5zaWdodFRzOiB7IFM6IGAke3RzfSMke2luc2lnaHRJZH1gIH0sXG4gICAgICAgIGluc2lnaHRJZDogeyBTOiBpbnNpZ2h0SWQgfSxcbiAgICAgICAgdm90ZTogeyBTOiB2b3RlIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICAgIC4uLihjb21tZW50ID8geyBjb21tZW50OiB7IFM6IGNvbW1lbnQgfSB9IDoge30pLFxuICAgICAgICAuLi4oZmVlZGJhY2tUeXBlID8geyBmZWVkYmFja1R5cGU6IHsgUzogZmVlZGJhY2tUeXBlIH0gfSA6IHt9KSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW50cmllcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBmcm9tID0gcXVlcnk/LmZyb207XG4gIGNvbnN0IHRvID0gcXVlcnk/LnRvO1xuICBpZiAoZnJvbSAmJiAhaXNEYXRlU3RyaW5nKGZyb20pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmcm9tIGRhdGVcIiB9KTtcbiAgaWYgKHRvICYmICFpc0RhdGVTdHJpbmcodG8pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB0byBkYXRlXCIgfSk7XG5cbiAgY29uc3QgZXhwcmVzc2lvblZhbHVlczogUmVjb3JkPHN0cmluZywgeyBTOiBzdHJpbmcgfT4gPSB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH07XG4gIGxldCBrZXlDb25kaXRpb24gPSBcInVzZXJJZCA9IDp1c2VySWRcIjtcbiAgaWYgKGZyb20gJiYgdG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9IGVsc2UgaWYgKGZyb20pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlID49IDpmcm9tRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgfSBlbHNlIGlmICh0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPD0gOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9XG5cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IGtleUNvbmRpdGlvbixcbiAgICAgIC4uLihrZXlDb25kaXRpb24uaW5jbHVkZXMoXCIjZGF0ZVwiKVxuICAgICAgICA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSB9XG4gICAgICAgIDoge30pLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvblZhbHVlcyxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgcGhvdG9Vcmw6IGl0ZW0ucGhvdG9Vcmw/LlMgPz8gdW5kZWZpbmVkLFxuICAgIG5vdGVzOiBpdGVtLm5vdGVzPy5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eVRleHQ6IGl0ZW0uYWN0aXZpdHlUZXh0Py5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eVN1bW1hcnk6IGl0ZW0uYWN0aXZpdHlTdW1tYXJ5Py5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eUJ1cm5LY2FsOiBpdGVtLmFjdGl2aXR5QnVybktjYWw/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eUJ1cm5LY2FsLk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5TWV0OiBpdGVtLmFjdGl2aXR5TWV0Py5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlNZXQuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlNaW51dGVzOiBpdGVtLmFjdGl2aXR5TWludXRlcz8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5TWludXRlcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eUNvbmZpZGVuY2U6IGl0ZW0uYWN0aXZpdHlDb25maWRlbmNlPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlDb25maWRlbmNlLk4pIDogdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzOiBTdG9yZWRFbnRyeVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBwaG90byA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGVudHJ5LnBob3RvVXJsKTtcbiAgICAgIGlmICghcGhvdG8pIHJldHVybiBlbnRyeTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpdGhvdXRTY2hlbWUgPSBwaG90by5zbGljZShcInMzOi8vXCIubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgZmlyc3RTbGFzaCA9IHdpdGhvdXRTY2hlbWUuaW5kZXhPZihcIi9cIik7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoIDw9IDApIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3QgYnVja2V0ID0gd2l0aG91dFNjaGVtZS5zbGljZSgwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgY29uc3Qga2V5ID0gd2l0aG91dFNjaGVtZS5zbGljZShmaXJzdFNsYXNoICsgMSk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IHNpZ25lZFBob3RvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiBidWNrZXQsIEtleToga2V5IH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiBkb3dubG9hZFVybFR0bFNlY29uZHMgfSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgLi4uZW50cnksIHBob3RvVXJsOiBzaWduZWRQaG90b1VybCB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cmllczogZW50cmllc1dpdGhTaWduZWRQaG90b1VybHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEVudHJ5KHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlRW50cnkocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGlkID0gYCR7dXNlcklkfToke2RhdGEuZGF0ZX1gO1xuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGEuZGF0ZSB9LFxuICAgIGlkOiB7IFM6IGlkIH0sXG4gICAgbW9ybmluZ1dlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5tb3JuaW5nV2VpZ2h0KSB9LFxuICAgIGxhdGVTbmFjazogeyBCT09MOiBkYXRhLmxhdGVTbmFjayB9LFxuICAgIGhpZ2hTb2RpdW06IHsgQk9PTDogZGF0YS5oaWdoU29kaXVtIH0sXG4gICAgd29ya291dDogeyBCT09MOiBkYXRhLndvcmtvdXQgfSxcbiAgICBhbGNvaG9sOiB7IEJPT0w6IGRhdGEuYWxjb2hvbCB9LFxuICB9O1xuXG4gIGlmIChkYXRhLm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5uaWdodFdlaWdodCAhPT0gbnVsbCkge1xuICAgIGl0ZW0ubmlnaHRXZWlnaHQgPSB7IE46IFN0cmluZyhkYXRhLm5pZ2h0V2VpZ2h0KSB9O1xuICB9XG4gIGlmIChkYXRhLmNhbG9yaWVzICE9PSB1bmRlZmluZWQpIGl0ZW0uY2Fsb3JpZXMgPSB7IE46IFN0cmluZyhkYXRhLmNhbG9yaWVzKSB9O1xuICBpZiAoZGF0YS5wcm90ZWluICE9PSB1bmRlZmluZWQpIGl0ZW0ucHJvdGVpbiA9IHsgTjogU3RyaW5nKGRhdGEucHJvdGVpbikgfTtcbiAgaWYgKGRhdGEuc3RlcHMgIT09IHVuZGVmaW5lZCkgaXRlbS5zdGVwcyA9IHsgTjogU3RyaW5nKGRhdGEuc3RlcHMpIH07XG4gIGlmIChkYXRhLnNsZWVwICE9PSB1bmRlZmluZWQpIGl0ZW0uc2xlZXAgPSB7IE46IFN0cmluZyhkYXRhLnNsZWVwKSB9O1xuICBjb25zdCBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShkYXRhLnBob3RvVXJsKTtcbiAgaWYgKG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSkgaXRlbS5waG90b1VybCA9IHsgUzogbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlIH07XG4gIGlmICh0eXBlb2YgZGF0YS5ub3RlcyA9PT0gXCJzdHJpbmdcIikgaXRlbS5ub3RlcyA9IHsgUzogZGF0YS5ub3RlcyB9O1xuICBpZiAodHlwZW9mIGRhdGEuYWN0aXZpdHlUZXh0ID09PSBcInN0cmluZ1wiKSBpdGVtLmFjdGl2aXR5VGV4dCA9IHsgUzogZGF0YS5hY3Rpdml0eVRleHQgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLmFjdGl2aXR5U3VtbWFyeSA9PT0gXCJzdHJpbmdcIikgaXRlbS5hY3Rpdml0eVN1bW1hcnkgPSB7IFM6IGRhdGEuYWN0aXZpdHlTdW1tYXJ5IH07XG4gIGlmIChkYXRhLmFjdGl2aXR5QnVybktjYWwgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eUJ1cm5LY2FsID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eUJ1cm5LY2FsKSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eU1ldCAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5TWV0ID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eU1ldCkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlNaW51dGVzICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlNaW51dGVzID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eU1pbnV0ZXMpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5Q29uZmlkZW5jZSAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZSA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlDb25maWRlbmNlKSB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJ5OiB7IC4uLmRhdGEsIGlkIH0gfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGRhdGUgPSBxdWVyeT8uZGF0ZTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF0ZSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBkYXRlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICAgIHRvbmU6IFwiZnJpZW5kbHlcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgICAgdG9uZTogeyBTOiBzZXR0aW5ncy50b25lID8/IFwiZnJpZW5kbHlcIiB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4ganNvbigyMDAsIHtcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGdvYWxXZWlnaHQ6IHNldHRpbmdzLmdvYWxXZWlnaHQsXG4gICAgICAgIHN0YXJ0V2VpZ2h0OiBzZXR0aW5ncy5zdGFydFdlaWdodCxcbiAgICAgICAgdGFyZ2V0RGF0ZTogc2V0dGluZ3MudGFyZ2V0RGF0ZSxcbiAgICAgICAgdW5pdDogc2V0dGluZ3MudW5pdCxcbiAgICAgICAgdG9uZTogc2V0dGluZ3MudG9uZSxcbiAgICAgICAgcGxhdGVhdTogdW5kZWZpbmVkLFxuICAgICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBzZXR0aW5ncy5hY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yID8/IDEsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpLFxuICAgICAgdGFyZ2V0RGF0ZTogb3V0Lkl0ZW0udGFyZ2V0RGF0ZT8uUyA/PyBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogb3V0Lkl0ZW0udW5pdD8uUyA9PT0gXCJsYnNcIiA/IFwibGJzXCIgOiBcImtnXCIsXG4gICAgICB0b25lOlxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJheXVydmVkaWNcIlxuICAgICAgICAgID8gb3V0Lkl0ZW0udG9uZS5TXG4gICAgICAgICAgOiBcImZyaWVuZGx5XCIsXG4gICAgICBwbGF0ZWF1OiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShvdXQuSXRlbSksXG4gICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBOdW1iZXIob3V0Lkl0ZW0uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKSxcbiAgICAgIG9wdEluRm9yZWNhc3Q6IE51bWJlcihvdXQuSXRlbS5vcHRJbkZvcmVjYXN0Py5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICAgIGZvcmVjYXN0R2VuZXJhdGVkQXQ6IG91dC5JdGVtLmZvcmVjYXN0R2VuZXJhdGVkQXQ/LlMsXG4gICAgICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZDogTnVtYmVyKG91dC5JdGVtLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPy5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBleGlzdGluZ091dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG5cbiAgY29uc3QgZXhpc3RpbmdUb25lID1cbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgIGV4aXN0aW5nT3V0Lkl0ZW0/LnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImZyaWVuZGx5XCJcbiAgICAgID8gZXhpc3RpbmdPdXQuSXRlbS50b25lLlNcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCB0b25lID0gZGF0YS50b25lID8/IGV4aXN0aW5nVG9uZSA/PyBcImZyaWVuZGx5XCI7XG4gIGNvbnN0IGV4aXN0aW5nQ2FsaWJyYXRpb24gPSBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKTtcbiAgY29uc3QgZXhpc3RpbmdPcHRJbkZvcmVjYXN0ID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/Lm9wdEluRm9yZWNhc3Q/Lk4gPz8gXCIwXCIpID09PSAxO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQgPSBleGlzdGluZ091dC5JdGVtPy5mb3JlY2FzdEdlbmVyYXRlZEF0Py5TO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID1cbiAgICBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ/Lk4gPz8gXCIwXCIpID09PSAxO1xuXG4gIGxldCBuZXh0UGxhdGVhdSA9IHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKGV4aXN0aW5nT3V0Lkl0ZW0pO1xuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGJvZHksIFwicGxhdGVhdVwiKSkge1xuICAgIGNvbnN0IHJhd1BsYXRlYXUgPSBib2R5LnBsYXRlYXU7XG4gICAgaWYgKHJhd1BsYXRlYXUgPT09IG51bGwpIHtcbiAgICAgIG5leHRQbGF0ZWF1ID0gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwID0gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QocmF3UGxhdGVhdSk7XG4gICAgICBpZiAoIXAub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwLmVycm9yIH0pO1xuICAgICAgbmV4dFBsYXRlYXUgPSB7IC4uLm5leHRQbGF0ZWF1LCAuLi5wLmRhdGEgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5zdGFydFdlaWdodCkgfSxcbiAgICB0YXJnZXREYXRlOiB7IFM6IGRhdGEudGFyZ2V0RGF0ZSB9LFxuICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgdG9uZTogeyBTOiB0b25lIH0sXG4gIH07XG4gIGlmIChuZXh0UGxhdGVhdT8ucm9sbGluZ1dpbmRvd0RheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5yb2xsaW5nV2luZG93RGF5cykpIH07XG4gIH1cbiAgaWYgKG5leHRQbGF0ZWF1Py5jb21wYXJpc29uU3BhbkRheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cyA9IHsgTjogU3RyaW5nKE1hdGgucm91bmQobmV4dFBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/Lm1heEF2Z01vdmVtZW50S2cgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2cgPSB7IE46IFN0cmluZyhuZXh0UGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnKSB9O1xuICB9XG4gIGl0ZW0uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvciA9IHsgTjogU3RyaW5nKGV4aXN0aW5nQ2FsaWJyYXRpb24pIH07XG4gIGl0ZW0ub3B0SW5Gb3JlY2FzdCA9IHtcbiAgICBOOiAoZGF0YS5vcHRJbkZvcmVjYXN0ID8/IGV4aXN0aW5nT3B0SW5Gb3JlY2FzdCkgPyBcIjFcIiA6IFwiMFwiLFxuICB9O1xuICBjb25zdCBuZXh0Rm9yZWNhc3RHZW5lcmF0ZWRBdCA9IGRhdGEuZm9yZWNhc3RHZW5lcmF0ZWRBdCA/PyBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQ7XG4gIGlmICh0eXBlb2YgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgPT09IFwic3RyaW5nXCIgJiYgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQubGVuZ3RoID4gMCkge1xuICAgIGl0ZW0uZm9yZWNhc3RHZW5lcmF0ZWRBdCA9IHsgUzogbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgfTtcbiAgfVxuICBpdGVtLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID0ge1xuICAgIE46IChkYXRhLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID8/IGV4aXN0aW5nRm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQpID8gXCIxXCIgOiBcIjBcIixcbiAgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBkYXRhLmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogZGF0YS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGRhdGEudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGRhdGEudW5pdCxcbiAgICAgIHRvbmUsXG4gICAgICBwbGF0ZWF1OiBuZXh0UGxhdGVhdSxcbiAgICAgIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I6IGV4aXN0aW5nQ2FsaWJyYXRpb24sXG4gICAgICBvcHRJbkZvcmVjYXN0OiBkYXRhLm9wdEluRm9yZWNhc3QgPz8gZXhpc3RpbmdPcHRJbkZvcmVjYXN0LFxuICAgICAgZm9yZWNhc3RHZW5lcmF0ZWRBdDogZGF0YS5mb3JlY2FzdEdlbmVyYXRlZEF0ID8/IGV4aXN0aW5nRm9yZWNhc3RHZW5lcmF0ZWRBdCxcbiAgICAgIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkOlxuICAgICAgICBkYXRhLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID8/IGV4aXN0aW5nRm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQsXG4gICAgfSxcbiAgfSk7XG59XG5cbnR5cGUgUHJvZ3Jlc3NQaG90b0l0ZW0gPSB7XG4gIHBob3RvSWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGRhdGU6IHN0cmluZztcbiAgaW1hZ2VVcmw/OiBzdHJpbmc7XG4gIHN0b3JhZ2VLZXk/OiBzdHJpbmc7XG4gIHdlaWdodEF0UGhvdG8/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+KTogUHJvZ3Jlc3NQaG90b0l0ZW0gfCBudWxsIHtcbiAgY29uc3QgcGhvdG9JZCA9IGl0ZW0ucGhvdG9JZD8uUztcbiAgY29uc3QgdXNlcklkID0gaXRlbS51c2VySWQ/LlM7XG4gIGNvbnN0IGRhdGUgPSBpdGVtLmRhdGU/LlM7XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IGl0ZW0uY3JlYXRlZEF0Py5TO1xuICBpZiAoIXBob3RvSWQgfHwgIXVzZXJJZCB8fCAhZGF0ZSB8fCAhY3JlYXRlZEF0KSByZXR1cm4gbnVsbDtcbiAgY29uc3QgaW1hZ2VVcmwgPSBpdGVtLmltYWdlVXJsPy5TO1xuICBjb25zdCBzdG9yYWdlS2V5ID0gaXRlbS5zdG9yYWdlS2V5Py5TO1xuICBjb25zdCB3ZWlnaHRSYXcgPSBpdGVtLndlaWdodEF0UGhvdG8/Lk47XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSB3ZWlnaHRSYXcgIT0gbnVsbCA/IE51bWJlcih3ZWlnaHRSYXcpIDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHBob3RvSWQsXG4gICAgdXNlcklkLFxuICAgIGRhdGUsXG4gICAgaW1hZ2VVcmw6IGltYWdlVXJsIHx8IHVuZGVmaW5lZCxcbiAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICB3ZWlnaHRBdFBob3RvOiBOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90byA/PyBOYU4pID8gd2VpZ2h0QXRQaG90byA6IHVuZGVmaW5lZCxcbiAgICBjcmVhdGVkQXQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBpdGVtcyA9IChvdXQuSXRlbXMgPz8gW10pXG4gICAgLm1hcCgoaXRlbSkgPT4gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4pKVxuICAgIC5maWx0ZXIoKHJvdyk6IHJvdyBpcyBQcm9ncmVzc1Bob3RvSXRlbSA9PiByb3cgIT09IG51bGwpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuZGF0ZS5sb2NhbGVDb21wYXJlKGEuZGF0ZSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGltYWdlVXJsID0gdHlwZW9mIGJvZHkuaW1hZ2VVcmwgPT09IFwic3RyaW5nXCIgPyBib2R5LmltYWdlVXJsLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSB0eXBlb2YgYm9keS5zdG9yYWdlS2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5zdG9yYWdlS2V5LnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSBib2R5LndlaWdodEF0UGhvdG8gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlcihib2R5LndlaWdodEF0UGhvdG8pO1xuICBpZiAoIWRhdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcbiAgaWYgKCFpbWFnZVVybCAmJiAhc3RvcmFnZUtleSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgaW1hZ2VVcmwgb3Igc3RvcmFnZUtleVwiIH0pO1xuICBpZiAoXG4gICAgd2VpZ2h0QXRQaG90byAhPT0gdW5kZWZpbmVkICYmXG4gICAgKCFOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90bykgfHwgd2VpZ2h0QXRQaG90byA8PSAwIHx8IHdlaWdodEF0UGhvdG8gPiAxMDAwKVxuICApIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB3ZWlnaHRBdFBob3RvXCIgfSk7XG4gIH1cbiAgY29uc3QgcGhvdG9JZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3QgY3JlYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgIGRhdGU6IHsgUzogZGF0ZSB9LFxuICAgIGNyZWF0ZWRBdDogeyBTOiBjcmVhdGVkQXQgfSxcbiAgfTtcbiAgaWYgKGltYWdlVXJsKSBpdGVtLmltYWdlVXJsID0geyBTOiBpbWFnZVVybCB9O1xuICBpZiAoc3RvcmFnZUtleSkgaXRlbS5zdG9yYWdlS2V5ID0geyBTOiBzdG9yYWdlS2V5IH07XG4gIGlmICh3ZWlnaHRBdFBob3RvICE9PSB1bmRlZmluZWQpIGl0ZW0ud2VpZ2h0QXRQaG90byA9IHsgTjogU3RyaW5nKHdlaWdodEF0UGhvdG8pIH07XG4gIGF3YWl0IGRkYi5zZW5kKG5ldyBQdXRJdGVtQ29tbWFuZCh7IFRhYmxlTmFtZTogdGFibGUsIEl0ZW06IGl0ZW0gYXMgbmV2ZXIgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBpdGVtOiB7XG4gICAgICBwaG90b0lkLFxuICAgICAgdXNlcklkLFxuICAgICAgZGF0ZSxcbiAgICAgIGltYWdlVXJsOiBpbWFnZVVybCB8fCB1bmRlZmluZWQsXG4gICAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICAgIHdlaWdodEF0UGhvdG8sXG4gICAgICBjcmVhdGVkQXQsXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIHBob3RvSWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG50eXBlIEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCA9IHtcbiAgc3VtbWFyeTogc3RyaW5nO1xuICBjb25maWRlbmNlOiBudW1iZXI7XG4gIGVzdGltYXRlZDogYm9vbGVhbjtcbiAgZGlzY2xhaW1lcjogc3RyaW5nO1xuICBoaWdobGlnaHRzOiBBcnJheTx7XG4gICAgYXJlYTogc3RyaW5nO1xuICAgIGFzc2Vzc21lbnQ6IHN0cmluZztcbiAgICBkaXJlY3Rpb246IFwibGVhbmVyXCIgfCBcInVuY2hhbmdlZFwiIHwgXCJ1bmNlcnRhaW5cIjtcbiAgfT47XG59O1xuXG5mdW5jdGlvbiBleHRyYWN0Rmlyc3RKc29uT2JqZWN0KHJhdzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHRleHQgPSByYXcudHJpbSgpO1xuICBjb25zdCBzdGFydCA9IHRleHQuaW5kZXhPZihcIntcIik7XG4gIGlmIChzdGFydCA8IDApIHJldHVybiBudWxsO1xuICBsZXQgZGVwdGggPSAwO1xuICBsZXQgaW5TdHJpbmcgPSBmYWxzZTtcbiAgbGV0IGVzY2FwZSA9IGZhbHNlO1xuICBmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCB0ZXh0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgY29uc3QgYyA9IHRleHRbaV0hO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgIGVzY2FwZSA9IGZhbHNlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjID09PSBcIlxcXFxcIiAmJiBpblN0cmluZykge1xuICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA9PT0gXCJcXFwiXCIpIHtcbiAgICAgIGluU3RyaW5nID0gIWluU3RyaW5nO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmICghaW5TdHJpbmcpIHtcbiAgICAgIGlmIChjID09PSBcIntcIikgZGVwdGggKz0gMTtcbiAgICAgIGlmIChjID09PSBcIn1cIikge1xuICAgICAgICBkZXB0aCAtPSAxO1xuICAgICAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiB0ZXh0LnNsaWNlKHN0YXJ0LCBpICsgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZUJvZHlDb21wYXJlQXNzZXNzbWVudChyYXc6IHN0cmluZyk6IEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBqc29uVGV4dCA9IGV4dHJhY3RGaXJzdEpzb25PYmplY3QocmF3KTtcbiAgaWYgKCFqc29uVGV4dCkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uVGV4dCkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3Qgc3VtbWFyeSA9IHR5cGVvZiBwYXJzZWQuc3VtbWFyeSA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5zdW1tYXJ5LnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgY29uZmlkZW5jZSA9IE51bWJlcihwYXJzZWQuY29uZmlkZW5jZSk7XG4gICAgY29uc3QgZGlzY2xhaW1lciA9IHR5cGVvZiBwYXJzZWQuZGlzY2xhaW1lciA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5kaXNjbGFpbWVyLnRyaW0oKSA6IFwiXCI7XG4gICAgaWYgKCFzdW1tYXJ5IHx8ICFOdW1iZXIuaXNGaW5pdGUoY29uZmlkZW5jZSkgfHwgIWRpc2NsYWltZXIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGhpZ2hsaWdodHNSYXcgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5oaWdobGlnaHRzKSA/IHBhcnNlZC5oaWdobGlnaHRzIDogW107XG4gICAgY29uc3QgaGlnaGxpZ2h0cyA9IGhpZ2hsaWdodHNSYXdcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IGUgPSBlbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgY29uc3QgYXJlYSA9IHR5cGVvZiBlLmFyZWEgPT09IFwic3RyaW5nXCIgPyBlLmFyZWEudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgYXNzZXNzbWVudCA9IHR5cGVvZiBlLmFzc2Vzc21lbnQgPT09IFwic3RyaW5nXCIgPyBlLmFzc2Vzc21lbnQudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uUmF3ID0gdHlwZW9mIGUuZGlyZWN0aW9uID09PSBcInN0cmluZ1wiID8gZS5kaXJlY3Rpb24gOiBcInVuY2VydGFpblwiO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPVxuICAgICAgICAgIGRpcmVjdGlvblJhdyA9PT0gXCJsZWFuZXJcIiB8fCBkaXJlY3Rpb25SYXcgPT09IFwidW5jaGFuZ2VkXCIgfHwgZGlyZWN0aW9uUmF3ID09PSBcInVuY2VydGFpblwiXG4gICAgICAgICAgICA/IGRpcmVjdGlvblJhd1xuICAgICAgICAgICAgOiBcInVuY2VydGFpblwiO1xuICAgICAgICBpZiAoIWFyZWEgfHwgIWFzc2Vzc21lbnQpIHJldHVybiBudWxsO1xuICAgICAgICByZXR1cm4geyBhcmVhLCBhc3Nlc3NtZW50LCBkaXJlY3Rpb24gfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAodik6IHYgaXMgeyBhcmVhOiBzdHJpbmc7IGFzc2Vzc21lbnQ6IHN0cmluZzsgZGlyZWN0aW9uOiBcImxlYW5lclwiIHwgXCJ1bmNoYW5nZWRcIiB8IFwidW5jZXJ0YWluXCIgfSA9PlxuICAgICAgICAgIHYgIT09IG51bGwsXG4gICAgICApO1xuICAgIHJldHVybiB7XG4gICAgICBzdW1tYXJ5LFxuICAgICAgY29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBNYXRoLnJvdW5kKGNvbmZpZGVuY2UpKSksXG4gICAgICBlc3RpbWF0ZWQ6IHRydWUsXG4gICAgICBkaXNjbGFpbWVyLFxuICAgICAgaGlnaGxpZ2h0cyxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhc3Nlc3NQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzQm9keUNvbXBhcmVBaUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJBSSBwaG90byBjb21wYXJlIGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4ganNvbig1MDMsIHsgZXJyb3I6IFwiQUkgY29tcGFyZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgY29uc3QgcmF3ID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGJvZHlcIiB9KTtcbiAgY29uc3QgYm9keSA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgcGhvdG9zUmF3ID0gQXJyYXkuaXNBcnJheShib2R5LnBob3RvcykgPyBib2R5LnBob3RvcyA6IFtdO1xuICBjb25zdCBxdWVyeSA9IHR5cGVvZiBib2R5LnF1ZXJ5ID09PSBcInN0cmluZ1wiID8gYm9keS5xdWVyeS50cmltKCkgOiBcIlwiO1xuICB0eXBlIFBob3RvSXRlbSA9IHtcbiAgICBkYXRlOiBzdHJpbmc7XG4gICAgcGhvdG9Vcmw6IHN0cmluZztcbiAgICBpbWFnZUJhc2U2NDogc3RyaW5nO1xuICAgIG1lZGlhVHlwZTogc3RyaW5nO1xuICB9O1xuICBjb25zdCBwaG90b3M6IFBob3RvSXRlbVtdID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHBob3Rvc1Jhdykge1xuICAgIGNvbnN0IHAgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3QgZGF0ZSA9IHR5cGVvZiBwLmRhdGUgPT09IFwic3RyaW5nXCIgPyBwLmRhdGUgOiBcIlwiO1xuICAgIGNvbnN0IHBob3RvVXJsID0gdHlwZW9mIHAucGhvdG9VcmwgPT09IFwic3RyaW5nXCIgPyBwLnBob3RvVXJsLnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgaW1hZ2VCYXNlNjQgPVxuICAgICAgdHlwZW9mIHAuaW1hZ2VCYXNlNjQgPT09IFwic3RyaW5nXCIgPyBwLmltYWdlQmFzZTY0LnJlcGxhY2UoL1xccy9nLCBcIlwiKSA6IFwiXCI7XG4gICAgY29uc3QgbWVkaWFUeXBlID0gdHlwZW9mIHAubWVkaWFUeXBlID09PSBcInN0cmluZ1wiID8gcC5tZWRpYVR5cGUudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICAgIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSBjb250aW51ZTtcbiAgICBpZiAocGhvdG9VcmwpIHtcbiAgICAgIHBob3Rvcy5wdXNoKHsgZGF0ZSwgcGhvdG9VcmwsIGltYWdlQmFzZTY0OiBcIlwiLCBtZWRpYVR5cGU6IFwiXCIgfSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGltYWdlQmFzZTY0ICYmXG4gICAgICAobWVkaWFUeXBlID09PSBcImltYWdlL2pwZWdcIiB8fFxuICAgICAgICBtZWRpYVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIgfHxcbiAgICAgICAgbWVkaWFUeXBlID09PSBcImltYWdlL2dpZlwiIHx8XG4gICAgICAgIG1lZGlhVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpXG4gICAgKSB7XG4gICAgICBwaG90b3MucHVzaCh7IGRhdGUsIHBob3RvVXJsOiBcIlwiLCBpbWFnZUJhc2U2NCwgbWVkaWFUeXBlIH0pO1xuICAgIH1cbiAgfVxuICBpZiAocGhvdG9zLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQXQgbGVhc3QgdHdvIHBob3RvcyBhcmUgcmVxdWlyZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgc2VsZWN0ZWQgPSBwaG90b3Muc2xpY2UoMCwgOCkuc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG4gIHR5cGUgQ29tcGFyZUNvbnRlbnRCbG9jayA9XG4gICAgfCB7IHR5cGU6IFwidGV4dFwiOyB0ZXh0OiBzdHJpbmcgfVxuICAgIHwge1xuICAgICAgICB0eXBlOiBcImltYWdlXCI7XG4gICAgICAgIHNvdXJjZToge1xuICAgICAgICAgIHR5cGU6IFwiYmFzZTY0XCI7XG4gICAgICAgICAgbWVkaWFfdHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgICAgICAgIGRhdGE6IHN0cmluZztcbiAgICAgICAgfTtcbiAgICAgIH07XG4gIGNvbnN0IGNvbnRlbnQ6IENvbXBhcmVDb250ZW50QmxvY2tbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHAgb2Ygc2VsZWN0ZWQpIHtcbiAgICBsZXQgYnVmOiBCdWZmZXI7XG4gICAgbGV0IG1lZGlhVHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgIGlmIChwLnBob3RvVXJsKSB7XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocC5waG90b1VybCk7XG4gICAgICBpZiAoIW5vcm1hbGl6ZWQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIHJlZmVyZW5jZS5cIiB9KTtcbiAgICAgIGNvbnN0IHJlZiA9IHBhcnNlUzNVcmkobm9ybWFsaXplZCk7XG4gICAgICBpZiAoIXJlZikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk9ubHkgczM6Ly8gcGhvdG8gcmVmZXJlbmNlcyBhcmUgc3VwcG9ydGVkLlwiIH0pO1xuICAgICAgaWYgKCFwaG90b0J1Y2tldE5hbWUgfHwgcmVmLmJ1Y2tldCAhPT0gcGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIGJ1Y2tldC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghczNLZXlBbGxvd2VkRm9yVXNlcihyZWYua2V5LCB1c2VySWQpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJQaG90byBkb2VzIG5vdCBiZWxvbmcgdG8gdGhpcyB1c2VyLlwiIH0pO1xuICAgICAgfVxuICAgICAgbGV0IGJ5dGVzOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbnRlbnRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCBzMy5zZW5kKG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiByZWYuYnVja2V0LCBLZXk6IHJlZi5rZXkgfSkpO1xuICAgICAgICBieXRlcyA9IGF3YWl0IG91dC5Cb2R5Py50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpO1xuICAgICAgICBjb250ZW50VHlwZSA9IG91dC5Db250ZW50VHlwZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQ291bGQgbm90IHJlYWQgb25lIG9mIHRoZSBwaG90b3MuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJ5dGVzIHx8IGJ5dGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkVtcHR5IHBob3RvIGZvdW5kLlwiIH0pO1xuICAgICAgYnVmID0gQnVmZmVyLmZyb20oYnl0ZXMpO1xuICAgICAgaWYgKGJ5dGVzLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJBIHBob3RvIGlzIHRvbyBsYXJnZS5cIiB9KTtcbiAgICAgIGlmIChpc1Vuc3VwcG9ydGVkRm9vZEltYWdlRm9ybWF0KHJlZi5rZXksIGNvbnRlbnRUeXBlKSB8fCBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmKGJ1ZikpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkhFSUMvSEVJRiBpbWFnZXMgYXJlIG5vdCBzdXBwb3J0ZWQuIFVzZSBKUEVHL1BORy9XZWJQLlwiIH0pO1xuICAgICAgfVxuICAgICAgbWVkaWFUeXBlID0gZ3Vlc3NGb29kSW1hZ2VNZWRpYVR5cGUocmVmLmtleSwgY29udGVudFR5cGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZGVjb2RlZDogQnVmZmVyO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKHAuaW1hZ2VCYXNlNjQsIFwiYmFzZTY0XCIpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGlubGluZSBwaG90byBlbmNvZGluZy5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkZWNvZGVkLmxlbmd0aCA9PT0gMCB8fCBkZWNvZGVkLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIklubGluZSBwaG90byBlbXB0eSBvciB0b28gbGFyZ2UuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZihkZWNvZGVkKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSEVJQy9IRUlGIGltYWdlcyBhcmUgbm90IHN1cHBvcnRlZC4gVXNlIEpQRUcvUE5HL1dlYlAuXCIgfSk7XG4gICAgICB9XG4gICAgICBidWYgPSBkZWNvZGVkO1xuICAgICAgbWVkaWFUeXBlID0gcC5tZWRpYVR5cGUgYXMgdHlwZW9mIG1lZGlhVHlwZTtcbiAgICB9XG4gICAgY29udGVudC5wdXNoKHsgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBQaG90byBkYXRlOiAke3AuZGF0ZX1gIH0pO1xuICAgIGNvbnRlbnQucHVzaCh7XG4gICAgICB0eXBlOiBcImltYWdlXCIsXG4gICAgICBzb3VyY2U6IHsgdHlwZTogXCJiYXNlNjRcIiwgbWVkaWFfdHlwZTogbWVkaWFUeXBlLCBkYXRhOiBidWYudG9TdHJpbmcoXCJiYXNlNjRcIikgfSxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBzeXN0ZW0gPSBgWW91IGFyZSBhbiBhc3Npc3RhbnQgZm9yIGEgZml0bmVzcyBhcHAuIENvbXBhcmUgdXNlciBwcm9ncmVzcyBwaG90b3MgYW5kIHByb3ZpZGUgYSBjYXJlZnVsIEVTVElNQVRFIG9ubHkuXG5SdWxlczpcbi0gRG8gTk9UIHByb3ZpZGUgZGlhZ25vc2lzLCBkaXNlYXNlIGNsYWltcywgb3IgbWVkaWNhbCBhZHZpY2UuXG4tIElmIGFuZ2xlLCBsaWdodGluZywgY2xvdGhpbmcsIG9yIHBvc3R1cmUgZGlmZmVyLCBleHBsaWNpdGx5IG1lbnRpb24gdW5jZXJ0YWludHkuXG4tIEZvY3VzIG9uIHZpc2libGUgdHJlbmQgY3VlcyBvbmx5IChtaWRzZWN0aW9uLCB3YWlzdGxpbmUsIGZhY2UgZnVsbG5lc3MsIHBvc3R1cmUgY29uc2lzdGVuY3kpLlxuLSBSZXR1cm4gT05MWSBKU09OOlxue1xuICBcInN1bW1hcnlcIjogXCIyLTQgc2VudGVuY2UgcGxhaW4tbGFuZ3VhZ2UgZXN0aW1hdGVcIixcbiAgXCJjb25maWRlbmNlXCI6IDAtMTAwLFxuICBcImRpc2NsYWltZXJcIjogXCJPbmUgc2VudGVuY2U6IGVzdGltYXRlIG9ubHksIG5vdCBtZWRpY2FsIGFkdmljZS5cIixcbiAgXCJoaWdobGlnaHRzXCI6IFtcbiAgICB7IFwiYXJlYVwiOiBcInN0cmluZ1wiLCBcImFzc2Vzc21lbnRcIjogXCJzdHJpbmdcIiwgXCJkaXJlY3Rpb25cIjogXCJsZWFuZXJ8dW5jaGFuZ2VkfHVuY2VydGFpblwiIH1cbiAgXVxufWA7XG4gIGNvbnN0IG1vZGVsID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0JPRFlfQ09NUEFSRV9NT0RFTD8udHJpbSgpIHx8IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCI7XG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgY29uc3QgcmVzcCA9IGF3YWl0IGNsaWVudC5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgbW9kZWwsXG4gICAgICBtYXhfdG9rZW5zOiA3MDAsXG4gICAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgICAgc3lzdGVtLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6IFwidXNlclwiLFxuICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgIC4uLmNvbnRlbnQsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgICB0ZXh0OlxuICAgICAgICAgICAgICAgIHF1ZXJ5IHx8XG4gICAgICAgICAgICAgICAgXCJDb21wYXJlIHRoZXNlIHBob3RvcyBmcm9tIG9sZGVzdCB0byBuZXdlc3QgYW5kIHN1bW1hcml6ZSB2aXNpYmxlIGNoYW5nZSB0cmVuZHMgYW5kIHVuY2VydGFpbnR5LlwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgICBjb25zdCB0ZXh0ID0gcmVzcC5jb250ZW50LmZpbmQoKHApID0+IHAudHlwZSA9PT0gXCJ0ZXh0XCIpPy50ZXh0ID8/IFwiXCI7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VCb2R5Q29tcGFyZUFzc2Vzc21lbnQodGV4dCk7XG4gICAgaWYgKCFwYXJzZWQpIHJldHVybiBqc29uKDUwMiwgeyBlcnJvcjogXCJDb3VsZCBub3QgcGFyc2UgQUkgY29tcGFyZSByZXN1bHQuXCIgfSk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICAuLi5wYXJzZWQsXG4gICAgICB0aW1lZnJhbWU6IHsgZnJvbTogc2VsZWN0ZWRbMF0/LmRhdGUsIHRvOiBzZWxlY3RlZFtzZWxlY3RlZC5sZW5ndGggLSAxXT8uZGF0ZSB9LFxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihKU09OLnN0cmluZ2lmeSh7IG1zZzogXCJwcm9ncmVzc19waG90b19hc3Nlc3NtZW50X2ZhaWxlZFwiLCBlcnI6IFN0cmluZyhlKSB9KSk7XG4gICAgcmV0dXJuIGpzb24oNTAyLCB7IGVycm9yOiBcIkFJIGNvbXBhcmUgZmFpbGVkLiBQbGVhc2UgdHJ5IGFnYWluLlwiIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgY29udGVudFR5cGUgPVxuICAgIHR5cGVvZiBib2R5LmNvbnRlbnRUeXBlID09PSBcInN0cmluZ1wiICYmIGJvZHkuY29udGVudFR5cGUubGVuZ3RoID4gMFxuICAgICAgPyBib2R5LmNvbnRlbnRUeXBlXG4gICAgICA6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIGNvbnN0IGZpbGVOYW1lID0gdHlwZW9mIGJvZHkuZmlsZU5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmZpbGVOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21GaWxlTmFtZSA9IGZpbGVOYW1lLm1hdGNoKC9cXC4oW2EtekEtWjAtOV0rKSQvKT8uWzFdPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21Cb2R5ID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGV4dGVuc2lvbiA9XG4gICAgZXh0RnJvbUZpbGVOYW1lICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tRmlsZU5hbWUpXG4gICAgICA/IGV4dEZyb21GaWxlTmFtZVxuICAgICAgOiBleHRGcm9tQm9keSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUJvZHkpXG4gICAgICAgID8gZXh0RnJvbUJvZHlcbiAgICAgICAgOiBcImpwZ1wiO1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBraW5kID0gdHlwZW9mIGJvZHkua2luZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkua2luZC50cmltKCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIGNvbnN0IGtleSA9XG4gICAga2luZCA9PT0gXCJmb29kXCJcbiAgICAgID8gYCR7dXNlcklkfS9mb29kLyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gXG4gICAgICA6IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBmcm9tRGIgPSAob3V0Lkl0ZW1zID8/IFtdKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KChhY2MsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBmbGFnID0gaXRlbS5mbGFnPy5TO1xuICAgIGNvbnN0IGVuYWJsZWRSYXcgPSBpdGVtLmVuYWJsZWQ/LkJPT0w7XG4gICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBlbmFibGVkUmF3ID09PSBcImJvb2xlYW5cIikge1xuICAgICAgYWNjW2ZsYWddID0gZW5hYmxlZFJhdztcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuXG4gIGNvbnN0IHNlcnZlckRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBjb25zdCBwaG90b0Zvb2QgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QSE9UT19GT09EX0xPR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEhPVE9fRk9PRF9MT0cgPSBwaG90b0Zvb2QgIT09IGZhbHNlO1xuICBjb25zdCBtZWFsTGlicmFyeSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX01FQUxfTElCUkFSWVwiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfTUVBTF9MSUJSQVJZID0gbWVhbExpYnJhcnkgIT09IGZhbHNlO1xuICBjb25zdCBubE1lYWxQYXJzZSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX05MX01FQUxfUEFSU0VcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX05MX01FQUxfUEFSU0UgPSBubE1lYWxQYXJzZSAhPT0gZmFsc2U7XG4gIGNvbnN0IGJvZHlDb21wYXJlQWkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9CT0RZX0NPTVBBUkVfQUlcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX0JPRFlfQ09NUEFSRV9BSSA9IGJvZHlDb21wYXJlQWkgIT09IGZhbHNlO1xuICBjb25zdCBwZXJzb25hbGl6ZWRDb2FjaGluZyA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElOR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEVSU09OQUxJWkVEX0FJX0NPQUNISU5HID0gcGVyc29uYWxpemVkQ29hY2hpbmcgIT09IGZhbHNlO1xuXG4gIGNvbnN0IG92ZXJyaWRlcyA9IHsgLi4uc2VydmVyRGVmYXVsdHMsIC4uLmZyb21EYiB9O1xuICByZXR1cm4ganNvbigyMDAsIHsgdXNlcklkLCBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgdGFyZ2V0VXNlcklkID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQ7XG4gIGlmICghdGFyZ2V0VXNlcklkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgdXNlcklkIHF1ZXJ5IHBhcmFtZXRlclwiIH0pO1xuICB9XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdGFyZ2V0VXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBvdmVycmlkZXMgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoKGl0ZW0pID0+ICh7XG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB0YXJnZXRVc2VySWQsXG4gICAgZmxhZzogaXRlbS5mbGFnPy5TID8/IFwiXCIsXG4gICAgZW5hYmxlZDogaXRlbS5lbmFibGVkPy5CT09MID8/IGZhbHNlLFxuICAgIHRzOiBpdGVtLnRzPy5TID8/IFwiXCIsXG4gIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCB1c2VySWQgPSB0eXBlb2YgYm9keS51c2VySWQgPT09IFwic3RyaW5nXCIgPyBib2R5LnVzZXJJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCByYXdGbGFnID0gdHlwZW9mIGJvZHkuZmxhZyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmxhZy50cmltKCkgOiBcIlwiO1xuICBjb25zdCBlbmFibGVkID0gdHlwZW9mIGJvZHkuZW5hYmxlZCA9PT0gXCJib29sZWFuXCIgPyBib2R5LmVuYWJsZWQgOiBudWxsO1xuICBpZiAoIXVzZXJJZCB8fCAhcmF3RmxhZyB8fCBlbmFibGVkID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgcGF5bG9hZC4gRXhwZWN0ZWQgdXNlcklkLCBmbGFnLCBlbmFibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IG5vcm1hbGl6ZWRGbGFnID0gcmF3RmxhZy5zdGFydHNXaXRoKFwiRkZfXCIpID8gcmF3RmxhZyA6IGBGRl8ke3Jhd0ZsYWd9YDtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBmbGFnOiB7IFM6IG5vcm1hbGl6ZWRGbGFnIH0sXG4gICAgICAgIGVuYWJsZWQ6IHsgQk9PTDogZW5hYmxlZCB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBvdmVycmlkZTogeyB1c2VySWQsIGZsYWc6IG5vcm1hbGl6ZWRGbGFnLCBlbmFibGVkLCB0cyB9IH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3N0YXRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0U3RhdHMoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvbWV0cmljcy9wYWdlLXZpZXdcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaW5jcmVtZW50UGFnZVZpZXcoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvcGhvdG9zL3VwbG9hZC11cmxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldEluc2lnaHRzVjIodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzL2ZlZWRiYWNrXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvZXN0aW1hdGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kRXN0aW1hdGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIHMzLFxuICAgICAgICBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgICAgcGhvdG9CdWNrZXROYW1lOiBidWNrZXQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9sb2ctY29uZmlybVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIXRhYmxlKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRm9vZCBsb2cgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RMb2dDb25maXJtKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvZXN0aW1hdGUtYnVyblwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5RXN0aW1hdGVCdXJuKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvdm9pY2UtZGFpbHktbG9nL3BhcnNlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgbGV0IHBheWxvYWQ6IHVua25vd247XG4gICAgICB0cnkge1xuICAgICAgICBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgICAgfVxuICAgICAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgICAgIGNvbnN0IHRyYW5zY3JpcHQgPSB0eXBlb2YgYm9keS50cmFuc2NyaXB0ID09PSBcInN0cmluZ1wiID8gYm9keS50cmFuc2NyaXB0IDogXCJcIjtcbiAgICAgIGlmICghdHJhbnNjcmlwdC50cmltKCkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcInRyYW5zY3JpcHQgcmVxdWlyZWRcIiB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBhcnNlVm9pY2VEYWlseVRyYW5zY3JpcHRXaXRoQW50aHJvcGljKHRyYW5zY3JpcHQpO1xuICAgICAgaWYgKCFyZXN1bHQub2spIHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gcmVzdWx0LmVycm9yID09PSBcIm5vX2FwaV9rZXlcIiA/IDUwMyA6IDQyMjtcbiAgICAgICAgcmV0dXJuIGpzb24oc3RhdHVzLCB7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgcGFyc2VkOiByZXN1bHQucGFyc2VkIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvbG9nXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5TG9nKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBlbnRyaWVzVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2NhbGlicmF0aW9uXCIgJiYgbWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5Q2FsaWJyYXRpb25QYXRjaCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgc2V0dGluZ3NUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvZW5lcmd5LXdlZWtseS1zdW1tYXJ5XCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBlVCA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgY29uc3QgZFQgPSBnZXRSZXF1aXJlZEVudihcIkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRVwiLCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSk7XG4gICAgICBjb25zdCBzVCA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJFbmVyZ3lXZWVrbHlTdW1tYXJ5KHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBlbnRyaWVzVGFibGVOYW1lOiBlVCxcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgICBzZXR0aW5nc1RhYmxlTmFtZTogc1QsXG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3Byb2dyZXNzLXBob3Rvc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGxpc3RQcm9ncmVzc1Bob3Rvcyh1c2VySWQpO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVByb2dyZXNzUGhvdG8odXNlcklkLCBldmVudCk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9wcm9ncmVzcy1waG90b3MvYXNzZXNzbWVudFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBhc3Nlc3NQcm9ncmVzc1Bob3Rvcyh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG4gICAgY29uc3QgcHJvZ3Jlc3NEZWxNYXRjaCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL3Byb2dyZXNzLXBob3Rvc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKHByb2dyZXNzRGVsTWF0Y2ggJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICByZXR1cm4gZGVsZXRlUHJvZ3Jlc3NQaG90byh1c2VySWQsIGRlY29kZVVSSUNvbXBvbmVudChwcm9ncmVzc0RlbE1hdGNoWzFdID8/IFwiXCIpKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZm9vZFQgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFmb29kVCB8fCAhbVQgfHwgIWRUKSB7XG4gICAgICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGZvb2RMb2dUYWJsZU5hbWU6IGZvb2RULFxuICAgICAgICBtZWFsc1RhYmxlTmFtZTogbVQsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFscy9zdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1N1Z2dlc3RNYXRjaCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFsc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNMaXN0KHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNDcmVhdGUodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsSGlzdG9yeU1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvbWVhbHNcXC8oW14vXSspXFwvaGlzdG9yeSQvKTtcbiAgICBpZiAobWVhbEhpc3RvcnlNYXRjaCAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNIaXN0b3J5KHVzZXJJZCwgbWVhbEhpc3RvcnlNYXRjaFsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsUGF0Y2hEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1BhdGNoKHVzZXJJZCwgbWVhbFBhdGNoRGVsWzFdLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNEZWxldGUodXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbExpc3RPckNyZWF0ZSA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXMkLyk7XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzTGlzdCh1c2VySWQsIGRheU1lYWxMaXN0T3JDcmVhdGVbMV0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuICAgIGlmIChkYXlNZWFsTGlzdE9yQ3JlYXRlICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCB8fCAhbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlKHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGRheU1lYWxEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9kYXlzXFwvKFtcXGQtXSspXFwvbWVhbC1lbnRyaWVzXFwvKFteL10rKSQvKTtcbiAgICBpZiAoZGF5TWVhbERlbCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlKHVzZXJJZCwgZGF5TWVhbERlbFsxXSwgZGF5TWVhbERlbFsyXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vdXNlcnNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9mZWF0dXJlLWZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi9mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgcmV0dXJuIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk5vdCBGb3VuZFwiIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UgPT09IFwiSW52YWxpZCBKU09OXCIpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgICB9XG4gICAgY29uc29sZS5lcnJvcihcIkxhbWJkYSBoYW5kbGVyIGVycm9yXCIsIGVycm9yKTtcbiAgICByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiSW50ZXJuYWwgU2VydmVyIEVycm9yXCIgfSk7XG4gIH1cbn1cbiJdfQ==