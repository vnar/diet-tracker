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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE0c0RBLDBCQWdOQztBQTU1REQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZDQUF5QztBQUN6QyxtREFNaUM7QUFFakMsdURBQStFO0FBQy9FLHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsaURBS3dCO0FBQ3hCLDJDQVdxQjtBQUVyQixNQUFNLEdBQUcsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksZ0VBQTZCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3hELE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUMxRCxNQUFNLHdCQUF3QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDekUsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDO0FBQ3BGLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7QUFDcEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFD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XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQge1xuICBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmLFxuICBndWVzc0Zvb2RJbWFnZU1lZGlhVHlwZSxcbiAgaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdCxcbiAgcGFyc2VTM1VyaSxcbiAgczNLZXlBbGxvd2VkRm9yVXNlcixcbn0gZnJvbSBcIi4uLy4uLy4uL2xpYi9mb29kL3MzVXJpXCI7XG5pbXBvcnQgdHlwZSB7IEFpSW5zaWdodFN0cnVjdHVyZWQgfSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2FpSW5zaWdodFN0cnVjdHVyZWRcIjtcbmltcG9ydCB7IGJ1aWxkUGVyc29uYWxpemVkQ29hY2hpbmdQYXlsb2FkIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9haU51ZGdlcy9pbmRleFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVBaUluc2lnaHRDYXJkIH0gZnJvbSBcIi4vaW5zaWdodHMtYWktY2FyZFwiO1xuaW1wb3J0IHsgaGFuZGxlVjJGb29kRXN0aW1hdGUsIGhhbmRsZVYyRm9vZExvZ0NvbmZpcm0gfSBmcm9tIFwiLi9mb29kLWxvZy1hcGlcIjtcbmltcG9ydCB7XG4gIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoLFxuICBoYW5kbGVWMkFjdGl2aXR5RXN0aW1hdGVCdXJuLFxuICBoYW5kbGVWMkFjdGl2aXR5TG9nLFxuICBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnksXG59IGZyb20gXCIuL2FjdGl2aXR5LWFwaVwiO1xuaW1wb3J0IHtcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlLFxuICBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUsXG4gIGhhbmRsZVYyTWVhbHNDcmVhdGUsXG4gIGhhbmRsZVYyTWVhbHNEZWxldGUsXG4gIGhhbmRsZVYyTWVhbHNIaXN0b3J5LFxuICBoYW5kbGVWMk1lYWxzTGlzdCxcbiAgaGFuZGxlVjJNZWFsc1BhdGNoLFxuICBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoLFxufSBmcm9tIFwiLi9tZWFscy1hcGlcIjtcblxuY29uc3QgZGRiID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHt9KTtcbmNvbnN0IGNvZ25pdG9JZHAgPSBuZXcgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQoe30pO1xuXG5jb25zdCBlbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3Qgc2V0dGluZ3NUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5TRVRUSU5HU19UQUJMRV9OQU1FO1xuY29uc3QgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FO1xuY29uc3QgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUU7XG5jb25zdCBwaG90b0J1Y2tldE5hbWUgPSBwcm9jZXNzLmVudi5QSE9UT19CVUNLRVRfTkFNRTtcbmNvbnN0IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRk9PRF9MT0dfRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3QgbWVhbHNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5NRUFMU19UQUJMRV9OQU1FO1xuY29uc3QgZGF5TWVhbEVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5EQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBwcm9ncmVzc1Bob3Rvc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FO1xuY29uc3QgdXBsb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5VUExPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiOTAwXCIpO1xuY29uc3QgZG93bmxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LkRPV05MT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjM2MDBcIik7XG5jb25zdCBhbmFseXRpY3NNZXRhVXNlcklkID0gXCJfX21ldGFfX1wiO1xuY29uc3QgdXNlclBvb2xJZEVudiA9IHByb2Nlc3MuZW52LlVTRVJfUE9PTF9JRDtcblxudHlwZSBDbGFpbXMgPSB7XG4gIHN1Yjogc3RyaW5nO1xuICBba2V5OiBzdHJpbmddOiB1bmtub3duO1xufTtcblxudHlwZSBIdHRwRXZlbnQgPSB7XG4gIHJhd1BhdGg6IHN0cmluZztcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD47XG4gIHJlcXVlc3RDb250ZXh0Pzoge1xuICAgIGF1dGhvcml6ZXI/OiB7XG4gICAgICBqd3Q/OiB7XG4gICAgICAgIGNsYWltcz86IENsYWltcztcbiAgICAgIH07XG4gICAgfTtcbiAgfTtcbiAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGw7XG4gIGJvZHk/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBIdHRwUmVzdWx0ID0ge1xuICBzdGF0dXNDb2RlOiBudW1iZXI7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICBib2R5OiBzdHJpbmc7XG59O1xuXG50eXBlIERhaWx5RW50cnlVcHNlcnQgPSB7XG4gIGRhdGU6IHN0cmluZztcbiAgbW9ybmluZ1dlaWdodDogbnVtYmVyO1xuICBuaWdodFdlaWdodD86IG51bWJlciB8IG51bGw7XG4gIGNhbG9yaWVzPzogbnVtYmVyO1xuICBwcm90ZWluPzogbnVtYmVyO1xuICBzdGVwcz86IG51bWJlcjtcbiAgc2xlZXA/OiBudW1iZXI7XG4gIGxhdGVTbmFjazogYm9vbGVhbjtcbiAgaGlnaFNvZGl1bTogYm9vbGVhbjtcbiAgd29ya291dDogYm9vbGVhbjtcbiAgYWxjb2hvbDogYm9vbGVhbjtcbiAgcGhvdG9Vcmw/OiBzdHJpbmcgfCBudWxsO1xuICBub3Rlcz86IHN0cmluZyB8IG51bGw7XG4gIGFjdGl2aXR5VGV4dD86IHN0cmluZztcbiAgYWN0aXZpdHlTdW1tYXJ5Pzogc3RyaW5nO1xuICBhY3Rpdml0eUJ1cm5LY2FsPzogbnVtYmVyO1xuICBhY3Rpdml0eU1ldD86IG51bWJlcjtcbiAgYWN0aXZpdHlNaW51dGVzPzogbnVtYmVyO1xuICBhY3Rpdml0eUNvbmZpZGVuY2U/OiBudW1iZXI7XG59O1xuXG50eXBlIFNldHRpbmdzUGF0Y2ggPSB7XG4gIGdvYWxXZWlnaHQ6IG51bWJlcjtcbiAgc3RhcnRXZWlnaHQ6IG51bWJlcjtcbiAgdGFyZ2V0RGF0ZTogc3RyaW5nO1xuICB1bml0OiBcImtnXCIgfCBcImxic1wiO1xuICB0b25lPzogXCJmcmllbmRseVwiIHwgXCJjbGluaWNhbFwiIHwgXCJ0b3VnaC1sb3ZlXCIgfCBcImF5dXJ2ZWRpY1wiO1xuICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yPzogbnVtYmVyO1xuICBvcHRJbkZvcmVjYXN0PzogYm9vbGVhbjtcbiAgZm9yZWNhc3RHZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ/OiBib29sZWFuO1xufTtcblxudHlwZSBTdG9yZWRFbnRyeSA9IERhaWx5RW50cnlVcHNlcnQgJiB7XG4gIGlkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBub3Rlcz86IHN0cmluZztcbn07XG5cbnR5cGUgU3RvcmVkU2V0dGluZ3MgPSBTZXR0aW5nc1BhdGNoICYge1xuICB1c2VySWQ6IHN0cmluZztcbn07XG5cbnR5cGUgUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHtcbiAgcm9sbGluZ1dpbmRvd0RheXM/OiBudW1iZXI7XG4gIGNvbXBhcmlzb25TcGFuRGF5cz86IG51bWJlcjtcbiAgbWF4QXZnTW92ZW1lbnRLZz86IG51bWJlcjtcbn07XG5cbnR5cGUgSW5zaWdodENhcmQgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIHJ1bGVJZDogc3RyaW5nO1xuICBwcmlvcml0eTogbnVtYmVyO1xuICBoZWFkbGluZTogc3RyaW5nO1xuICBkZXRhaWw/OiBzdHJpbmc7XG4gIHdoeTogc3RyaW5nW107XG4gIGFjdGlvbjogc3RyaW5nO1xuICBjYXRlZ29yeTogXCJzb2RpdW1cIiB8IFwiYWxjb2hvbFwiIHwgXCJsYXRlX3NuYWNrXCIgfCBcIndvcmtvdXRcIiB8IFwicGxhdGVhdVwiIHwgXCJzdHJlYWtcIiB8IFwidHJhamVjdG9yeVwiO1xuICBnZW5lcmF0aW9uU291cmNlPzogXCJsbG1cIiB8IFwicnVsZXNcIjtcbiAgZ2VuZXJhdGVkQXQ/OiBzdHJpbmc7XG4gIHN0cnVjdHVyZWQ/OiBBaUluc2lnaHRTdHJ1Y3R1cmVkO1xuICBkZWdyYWRlZD86IGJvb2xlYW47XG59O1xuXG5mdW5jdGlvbiBqc29uKHN0YXR1c0NvZGU6IG51bWJlciwgcGF5bG9hZDogdW5rbm93bik6IEh0dHBSZXN1bHQge1xuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGUsXG4gICAgaGVhZGVyczogeyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZEVudihuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIHJlcXVpcmVkIGVudiB2YXIgJHtuYW1lfWApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcGFyc2VKc29uQm9keShldmVudDogSHR0cEV2ZW50KTogdW5rbm93biB7XG4gIGlmICghZXZlbnQuYm9keSkgcmV0dXJuIHt9O1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICB9IGNhdGNoIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIEpTT05cIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEYXRlU3RyaW5nKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiAmJiAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVudkZsYWdUcmlTdGF0ZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgdiA9IHByb2Nlc3MuZW52W25hbWVdO1xuICBpZiAodiA9PT0gXCJ0cnVlXCIpIHJldHVybiB0cnVlO1xuICBpZiAodiA9PT0gXCJmYWxzZVwiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzQm9keUNvbXBhcmVBaUVuYWJsZWRMYW1iZGEoKTogYm9vbGVhbiB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5GRl9CT0RZX0NPTVBBUkVfQUkgIT09IFwiZmFsc2VcIjtcbn1cblxuZnVuY3Rpb24gaXNQb3NpdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+IDA7XG59XG5cbmZ1bmN0aW9uIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPj0gMDtcbn1cblxuZnVuY3Rpb24gaXNJbnROb25OZWdhdGl2ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVFbnRyeShpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IERhaWx5RW50cnlVcHNlcnQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cblxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubW9ybmluZ1dlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBtb3JuaW5nV2VpZ2h0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmxhdGVTbmFjayAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBsYXRlU25hY2tcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuaGlnaFNvZGl1bSAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBoaWdoU29kaXVtXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LndvcmtvdXQgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgd29ya291dFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5hbGNvaG9sICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFsY29ob2xcIiB9O1xuXG4gIGlmIChcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSBudWxsICYmXG4gICAgIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5uaWdodFdlaWdodClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5pZ2h0V2VpZ2h0XCIgfTtcbiAgfVxuXG4gIGlmIChib2R5LmNhbG9yaWVzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5jYWxvcmllcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgY2Fsb3JpZXNcIiB9O1xuICB9XG4gIGlmIChib2R5LnByb3RlaW4gIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnByb3RlaW4pKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHByb3RlaW5cIiB9O1xuICB9XG4gIGlmIChib2R5LnN0ZXBzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5zdGVwcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RlcHNcIiB9O1xuICB9XG4gIGlmIChib2R5LnNsZWVwICE9PSB1bmRlZmluZWQgJiYgIWlzTm9uTmVnYXRpdmVOdW1iZXIoYm9keS5zbGVlcCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc2xlZXBcIiB9O1xuICB9XG5cbiAgaWYgKFxuICAgIGJvZHkucGhvdG9VcmwgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkucGhvdG9VcmwgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkucGhvdG9VcmwgIT09IFwic3RyaW5nXCIgfHwgYm9keS5waG90b1VybC5sZW5ndGggPiA2MDBfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGhvdG9VcmxcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5Lm5vdGVzICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5vdGVzICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5Lm5vdGVzICE9PSBcInN0cmluZ1wiIHx8IGJvZHkubm90ZXMubGVuZ3RoID4gMl8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBub3Rlc1wiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkuYWN0aXZpdHlUZXh0ICE9PSB1bmRlZmluZWQgJiZcbiAgICAodHlwZW9mIGJvZHkuYWN0aXZpdHlUZXh0ICE9PSBcInN0cmluZ1wiIHx8IGJvZHkuYWN0aXZpdHlUZXh0Lmxlbmd0aCA+IDUwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5VGV4dFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkuYWN0aXZpdHlTdW1tYXJ5ICE9PSB1bmRlZmluZWQgJiZcbiAgICAodHlwZW9mIGJvZHkuYWN0aXZpdHlTdW1tYXJ5ICE9PSBcInN0cmluZ1wiIHx8IGJvZHkuYWN0aXZpdHlTdW1tYXJ5Lmxlbmd0aCA+IDUwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5U3VtbWFyeVwiIH07XG4gIH1cbiAgaWYgKGJvZHkuYWN0aXZpdHlCdXJuS2NhbCAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuYWN0aXZpdHlCdXJuS2NhbCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlCdXJuS2NhbFwiIH07XG4gIH1cbiAgaWYgKGJvZHkuYWN0aXZpdHlNaW51dGVzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5hY3Rpdml0eU1pbnV0ZXMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5TWludXRlc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuYWN0aXZpdHlNZXQgIT09IHVuZGVmaW5lZCAmJiAhaXNQb3NpdGl2ZU51bWJlcihib2R5LmFjdGl2aXR5TWV0KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eU1ldFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkuYWN0aXZpdHlDb25maWRlbmNlICE9PSB1bmRlZmluZWQgJiZcbiAgICAoIWlzTm9uTmVnYXRpdmVOdW1iZXIoYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UpIHx8IGJvZHkuYWN0aXZpdHlDb25maWRlbmNlID4gMTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlDb25maWRlbmNlXCIgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZGF0ZTogYm9keS5kYXRlLFxuICAgICAgbW9ybmluZ1dlaWdodDogYm9keS5tb3JuaW5nV2VpZ2h0LFxuICAgICAgbmlnaHRXZWlnaHQ6IChib2R5Lm5pZ2h0V2VpZ2h0IGFzIG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBib2R5LmNhbG9yaWVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGJvZHkucHJvdGVpbiBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzdGVwczogYm9keS5zdGVwcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogYm9keS5zbGVlcCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGJvZHkubGF0ZVNuYWNrIGFzIGJvb2xlYW4sXG4gICAgICBoaWdoU29kaXVtOiBib2R5LmhpZ2hTb2RpdW0gYXMgYm9vbGVhbixcbiAgICAgIHdvcmtvdXQ6IGJvZHkud29ya291dCBhcyBib29sZWFuLFxuICAgICAgYWxjb2hvbDogYm9keS5hbGNvaG9sIGFzIGJvb2xlYW4sXG4gICAgICBwaG90b1VybDogKGJvZHkucGhvdG9VcmwgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgbm90ZXM6IChib2R5Lm5vdGVzIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5VGV4dDogYm9keS5hY3Rpdml0eVRleHQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlTdW1tYXJ5OiBib2R5LmFjdGl2aXR5U3VtbWFyeSBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eUJ1cm5LY2FsOiBib2R5LmFjdGl2aXR5QnVybktjYWwgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlNZXQ6IGJvZHkuYWN0aXZpdHlNZXQgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlNaW51dGVzOiBib2R5LmFjdGl2aXR5TWludXRlcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eUNvbmZpZGVuY2U6IGJvZHkuYWN0aXZpdHlDb25maWRlbmNlIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVNldHRpbmdzKGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogU2V0dGluZ3NQYXRjaCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LmdvYWxXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZ29hbFdlaWdodFwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LnN0YXJ0V2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXJ0V2VpZ2h0XCIgfTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS50YXJnZXREYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRhcmdldERhdGVcIiB9O1xuICBpZiAoYm9keS51bml0ICE9PSBcImtnXCIgJiYgYm9keS51bml0ICE9PSBcImxic1wiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdW5pdFwiIH07XG4gIGlmIChcbiAgICBib2R5LnRvbmUgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJmcmllbmRseVwiICYmXG4gICAgYm9keS50b25lICE9PSBcImNsaW5pY2FsXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwidG91Z2gtbG92ZVwiICYmXG4gICAgYm9keS50b25lICE9PSBcImF5dXJ2ZWRpY1wiXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0b25lXCIgfTtcbiAgfVxuICBpZiAoYm9keS5vcHRJbkZvcmVjYXN0ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGJvZHkub3B0SW5Gb3JlY2FzdCAhPT0gXCJib29sZWFuXCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgb3B0SW5Gb3JlY2FzdFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdCAhPT0gdW5kZWZpbmVkICYmXG4gICAgKHR5cGVvZiBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQgIT09IFwic3RyaW5nXCIgfHwgYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0Lmxlbmd0aCA+IDY0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZm9yZWNhc3RHZW5lcmF0ZWRBdFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgIT09IHVuZGVmaW5lZCAmJlxuICAgIHR5cGVvZiBib2R5LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkICE9PSBcImJvb2xlYW5cIlxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWRcIiB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgICB0b25lOiBib2R5LnRvbmUgYXMgU2V0dGluZ3NQYXRjaFtcInRvbmVcIl0sXG4gICAgICBvcHRJbkZvcmVjYXN0OiBib2R5Lm9wdEluRm9yZWNhc3QgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcbiAgICAgIGZvcmVjYXN0R2VuZXJhdGVkQXQ6IGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdCBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZDogYm9keS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCBhcyBib29sZWFuIHwgdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldEp3dENsYWltcyhldmVudDogSHR0cEV2ZW50KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuICBjb25zdCByYXcgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uand0Py5jbGFpbXM7XG4gIGlmIChyYXcgPT0gbnVsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG4gICAgICBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVzZXJJZChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3Qgc3ViID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KT8uc3ViO1xuICByZXR1cm4gdHlwZW9mIHN1YiA9PT0gXCJzdHJpbmdcIiA/IHN1YiA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZmlyc3ROYW1lRnJvbUp3dENsYWltcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IGdpdmVuID0gY2xhaW1zLmdpdmVuX25hbWU7XG4gIGlmICh0eXBlb2YgZ2l2ZW4gPT09IFwic3RyaW5nXCIgJiYgZ2l2ZW4udHJpbSgpKSByZXR1cm4gZ2l2ZW4udHJpbSgpO1xuICBjb25zdCBuYW1lID0gY2xhaW1zLm5hbWU7XG4gIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIiAmJiBuYW1lLnRyaW0oKSkge1xuICAgIGNvbnN0IGZpcnN0ID0gbmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXTtcbiAgICByZXR1cm4gZmlyc3QgfHwgdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKFxuICBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQsXG4pOiBQbGF0ZWF1VXNlclNldHRpbmdzIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFpdGVtKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBvdXQ6IFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7fTtcbiAgY29uc3QgcncgPSBpdGVtLnBsYXRlYXVSb2xsaW5nV2luZG93RGF5cz8uTjtcbiAgY29uc3Qgc3BhbiA9IGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cz8uTjtcbiAgY29uc3QgbXYgPSBpdGVtLnBsYXRlYXVNYXhNb3ZlbWVudEtnPy5OO1xuICBpZiAocncgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIocncpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKHNwYW4gIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoc3Bhbik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG12ICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG12KTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQubWF4QXZnTW92ZW1lbnRLZyA9IG47XG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QoXG4gIHJhdzogdW5rbm93bixcbik6IHsgb2s6IHRydWU7IGRhdGE6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiIHx8IEFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwicGxhdGVhdSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgbyA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBpZiAoby5yb2xsaW5nV2luZG93RGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLnJvbGxpbmdXaW5kb3dEYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUucm9sbGluZ1dpbmRvd0RheXNcIiB9O1xuICAgIGRhdGEucm9sbGluZ1dpbmRvd0RheXMgPSBuO1xuICB9XG4gIGlmIChvLmNvbXBhcmlzb25TcGFuRGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLmNvbXBhcmlzb25TcGFuRGF5cyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1LmNvbXBhcmlzb25TcGFuRGF5c1wiIH07XG4gICAgZGF0YS5jb21wYXJpc29uU3BhbkRheXMgPSBuO1xuICB9XG4gIGlmIChvLm1heEF2Z01vdmVtZW50S2cgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5tYXhBdmdNb3ZlbWVudEtnKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUubWF4QXZnTW92ZW1lbnRLZ1wiIH07XG4gICAgZGF0YS5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YSB9O1xufVxuXG4vKiogR21haWwgdHJlYXRzIGRvdHMgYW5kICtsYWJlbHMgYXMgYWxpYXNlczsgbm9ybWFsaXplIHNvIGFkbWluIGxpc3QgbWF0Y2hlcyByZWFsIHNpZ24taW4gaWRlbnRpdGllcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChlbWFpbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbG93ZXIgPSBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgYXQgPSBsb3dlci5sYXN0SW5kZXhPZihcIkBcIik7XG4gIGlmIChhdCA8PSAwKSByZXR1cm4gbG93ZXI7XG4gIGNvbnN0IGxvY2FsID0gbG93ZXIuc2xpY2UoMCwgYXQpO1xuICBjb25zdCBkb21haW4gPSBsb3dlci5zbGljZShhdCArIDEpO1xuICBpZiAoZG9tYWluID09PSBcImdtYWlsLmNvbVwiIHx8IGRvbWFpbiA9PT0gXCJnb29nbGVtYWlsLmNvbVwiKSB7XG4gICAgY29uc3QgYmFzZUxvY2FsID0gKGxvY2FsLnNwbGl0KFwiK1wiKVswXSA/PyBsb2NhbCkucmVwbGFjZSgvXFwuL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlTG9jYWx9QCR7ZG9tYWlufWA7XG4gIH1cbiAgcmV0dXJuIGxvd2VyO1xufVxuXG5mdW5jdGlvbiBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTogU2V0PHN0cmluZz4ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICBjb25zdCBwYXJ0cyA9IHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2gocy50cmltKCkpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQocGFydHMpO1xuICBpZiAoc2V0LnNpemUgPT09IDApIHtcbiAgICBzZXQuYWRkKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChcInZpaGFybmFyQGdtYWlsLmNvbVwiKSk7XG4gIH1cbiAgcmV0dXJuIHNldDtcbn1cblxuY29uc3QgQURNSU5fQ0xBSU1fS0VZUyA9IFtcInVzZXJuYW1lXCIsIFwiY29nbml0bzp1c2VybmFtZVwiLCBcImVtYWlsXCIsIFwicHJlZmVycmVkX3VzZXJuYW1lXCJdIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZ1tdIHtcbiAgY29uc3QgZm91bmQ6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGVtYWlsaXNoID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gIGZvciAoY29uc3Qga2V5IG9mIEFETUlOX0NMQUlNX0tFWVMpIHtcbiAgICBjb25zdCB2ID0gY2xhaW1zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjbGFpbXMpKSB7XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm5ldyBTZXQoZm91bmQpXTtcbn1cblxuLyoqIFRydWUgaWYgSldUIGNsYWltcyBpbmNsdWRlIGFuIGVtYWlsIGlkZW50aXR5IHRoYXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBhZG1pbiBhbGxvdyBsaXN0LiAqL1xuZnVuY3Rpb24gaXNBZG1pbkNhbGxlcihldmVudDogSHR0cEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsYWltcyA9IGdldEp3dENsYWltcyhldmVudCk7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zKTtcbiAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjKSkpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyVmFsdWUoXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG4gIG5hbWU6IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaGVhZGVycykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgd2FudCA9IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICBpZiAoay50b0xvd2VyQ2FzZSgpID09PSB3YW50ICYmIHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIHYubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSldUIEhUVFAgQVBJIGF1dGhvcml6ZXJzIHZhbGlkYXRlIEF1dGhvcml6YXRpb24gYnV0IHR5cGljYWxseSBkbyBub3QgZm9yd2FyZCB0aGF0IGhlYWRlciB0byBMYW1iZGEuXG4gKiBDbGllbnRzIGFsc28gc2VuZCB4LWNvZ25pdG8tYWNjZXNzLXRva2VuIChzZWUgZnJvbnRlbmQtYXBpLWNsaWVudCkgc28gd2UgY2FuIGNhbGwgY29nbml0by1pZHA6R2V0VXNlci5cbiAqL1xuZnVuY3Rpb24gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGggPSBldmVudC5oZWFkZXJzO1xuICBjb25zdCBjdXN0b20gPSBoZWFkZXJWYWx1ZShoLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIik7XG4gIGlmIChjdXN0b20/LnRyaW0oKSkgcmV0dXJuIGN1c3RvbS50cmltKCk7XG4gIGNvbnN0IHJhdyA9IGhlYWRlclZhbHVlKGgsIFwiYXV0aG9yaXphdGlvblwiKTtcbiAgaWYgKCFyYXcpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG0gPSByYXcubWF0Y2goL15CZWFyZXJcXHMrKC4rKSQvaSk7XG4gIHJldHVybiBtPy5bMV0/LnRyaW0oKTtcbn1cblxuLyoqIFdoZW4gY2xhaW1zIGxhY2sgYSByZXNvbHZhYmxlIGVtYWlsLCB2ZXJpZnkgYWRtaW4gdmlhIEdldFVzZXI7IHRva2VuIHN1YiBtdXN0IG1hdGNoIEpXVCBzdWIuICovXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluVmlhR2V0VXNlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHRva2VuID0gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQpO1xuICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGp3dFN1YiA9IGdldFVzZXJJZChldmVudCk7XG4gIGlmICghand0U3ViKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKG5ldyBHZXRVc2VyQ29tbWFuZCh7IEFjY2Vzc1Rva2VuOiB0b2tlbiB9KSk7XG4gICAgY29uc3QgYXR0cnMgPSBvdXQuVXNlckF0dHJpYnV0ZXMgPz8gW107XG4gICAgY29uc3QgdG9rZW5TdWIgPSBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwic3ViXCIpPy5WYWx1ZTtcbiAgICBpZiAodG9rZW5TdWIgIT09IGp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGVtYWlsID1cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJlbWFpbFwiKT8uVmFsdWUgPz9cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJwcmVmZXJyZWRfdXNlcm5hbWVcIik/LlZhbHVlO1xuICAgIGNvbnN0IGZyb21Vc2VybmFtZSA9IG91dC5Vc2VybmFtZT8uaW5jbHVkZXMoXCJAXCIpID8gb3V0LlVzZXJuYW1lIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IChlbWFpbCA/PyBmcm9tVXNlcm5hbWUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFjYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjYW5kaWRhdGUpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5BbGxvd2VkKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKGlzQWRtaW5DYWxsZXIoZXZlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50KTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldERhdGUoKTogc3RyaW5nIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGQuc2V0RGF0ZShkLmdldERhdGUoKSArIDExOCk7XG4gIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQaG90b1JlZmVyZW5jZShwaG90b1VybDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghcGhvdG9VcmwgfHwgdHlwZW9mIHBob3RvVXJsICE9PSBcInN0cmluZ1wiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAocGhvdG9Vcmwuc3RhcnRzV2l0aChcInMzOi8vXCIpKSByZXR1cm4gcGhvdG9Vcmw7XG4gIGlmICghcGhvdG9VcmwuaW5jbHVkZXMoXCI6Ly9cIikpIHtcbiAgICBjb25zdCBrZXlPbmx5ID0gcGhvdG9VcmwucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBpZiAoIWtleU9ubHkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7cGhvdG9CdWNrZXROYW1lfS8ke2tleU9ubHl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZUFzYzxUIGV4dGVuZHMgeyBkYXRlOiBzdHJpbmcgfT4ocm93czogVFtdKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5yb3dzXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbn1cblxuZnVuY3Rpb24gYXZlcmFnZSh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLCAwKSAvIHZhbHVlcy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHJvdW5kMih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgucm91bmQodmFsdWUgKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBuZXh0TW9ybmluZ0RlbHRhcyhcbiAgbG9nczogU3RvcmVkRW50cnlbXSxcbiAgcHJlZGljYXRlOiAobG9nOiBTdG9yZWRFbnRyeSkgPT4gYm9vbGVhbixcbik6IHsgZmxhZ2dlZDogbnVtYmVyW107IGJhc2VsaW5lOiBudW1iZXJbXSB9IHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgY29uc3QgZmxhZ2dlZDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgYmFzZWxpbmU6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNvcnRlZC5sZW5ndGggLSAxOyBpZHggKz0gMSkge1xuICAgIGNvbnN0IGRlbHRhID0gc29ydGVkW2lkeCArIDFdLm1vcm5pbmdXZWlnaHQgLSBzb3J0ZWRbaWR4XS5tb3JuaW5nV2VpZ2h0O1xuICAgIGlmIChwcmVkaWNhdGUoc29ydGVkW2lkeF0pKSBmbGFnZ2VkLnB1c2goZGVsdGEpO1xuICAgIGVsc2UgYmFzZWxpbmUucHVzaChkZWx0YSk7XG4gIH1cbiAgcmV0dXJuIHsgZmxhZ2dlZCwgYmFzZWxpbmUgfTtcbn1cblxuZnVuY3Rpb24gc29kaXVtSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmhpZ2hTb2RpdW0pO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBzb2RpdW0tYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJzb2RpdW1CdW1wXCIsXG4gICAgcHJpb3JpdHk6IDk1LFxuICAgIGhlYWRsaW5lOiBcIkhpZ2gtc29kaXVtIGRheXMgYXJlIGxpbmtlZCB0byBoZWF2aWVyIG5leHQtbW9ybmluZyB3ZWlnaC1pbnMuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZzIHlvdXIgbm9uLXNvZGl1bSBiYXNlbGluZSB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gaGlnaC1zb2RpdW0gZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugb24gaGlnaC1zb2RpdW0gZGF5czogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlRyeSBvbmUgbG93ZXItc29kaXVtIGRpbm5lciBzd2FwIHRvbmlnaHQuXCIsXG4gICAgY2F0ZWdvcnk6IFwic29kaXVtXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFsY29ob2xJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuYWxjb2hvbCk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGFsY29ob2wtYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJhbGNvaG9sXCIsXG4gICAgcHJpb3JpdHk6IDkwLFxuICAgIGhlYWRsaW5lOiBcIkFsY29ob2wgZGF5cyB0ZW5kIHRvIHNob3cgYSBuZXh0LWRheSB3ZWlnaHQgYnVtcC5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdmVyc3VzIG5vbi1hbGNvaG9sIGRheXMgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGFsY29ob2wtbG9nZ2VkIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIGFmdGVyIGFsY29ob2w6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJQbGFuIGFsY29ob2wtZnJlZSB3ZWVrZGF5cyBmb3Igc3RlYWRpZXIgdHJlbmQgbGluZXMuXCIsXG4gICAgY2F0ZWdvcnk6IFwiYWxjb2hvbFwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBsYXRlU25hY2tJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cubGF0ZVNuYWNrKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgbGF0ZS1zbmFjay1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImxhdGVTbmFja1wiLFxuICAgIHByaW9yaXR5OiA4OCxcbiAgICBoZWFkbGluZTogXCJMYXRlIHNuYWNrcyBhcmUgY29ycmVsYXRlZCB3aXRoIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHNjYWxlIHJlYWRpbmdzLlwiLFxuICAgIGRldGFpbDogYFlvdXIgbmV4dC1kYXkgY2hhbmdlIGlzICske3JvdW5kMihleGNlc3MpfSBrZyBoaWdoZXIgdGhhbiB5b3VyIG5vbi1sYXRlLXNuYWNrIGJhc2VsaW5lLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gbGF0ZS1zbmFjayBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSB3aXRoIGxhdGUgc25hY2s6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJTZXQgYSAyLWhvdXIga2l0Y2hlbiBjbG9zZSB0aW1lIGJlZm9yZSBiZWQuXCIsXG4gICAgY2F0ZWdvcnk6IFwibGF0ZV9zbmFja1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHRXaXRoTG9ncyhlbnRyeUNvdW50OiBudW1iZXIsIGxhdGVzdERhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHtsYXRlc3REYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIkdyZWF0IGNvbnNpc3RlbmN5IHNvIGZhciDigJQga2VlcCBsb2dnaW5nIGRhaWx5IGZvciBzaGFycGVyIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiV2UgbmVlZCBhIGJpdCBtb3JlIHNpZ25hbCB0byBkZXRlY3Qgc3Ryb25nIHBlcnNvbmFsIHBhdHRlcm5zLCBidXQgeW91ciBkYXRhIGZsb3cgaXMgYWN0aXZlLlwiLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZW50cnlDb3VudH0gbG9ncyBhbmFseXplZCBmcm9tIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgXCJObyBydWxlIGNyb3NzZWQgY29uZmlkZW5jZSB0aHJlc2hvbGRzIHlldFwiLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIktlZXAgdHJhY2tpbmcgZGFpbHkgaGFiaXRzIGFuZCB3ZWlnaHQgdG8gdW5sb2NrIHN0cm9uZ2VyIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0Tm9Mb2dzKGFzT2ZEYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7YXNPZkRhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiU3RhcnQgbG9nZ2luZyB3ZWlnaHQgYW5kIGhhYml0cyB0byB1bmxvY2sgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDogXCJPbmNlIHlvdSBoYXZlIGEgZmV3IHdlZWtzIG9mIGVudHJpZXMsIHdlIHdpbGwgaGlnaGxpZ2h0IHBhdHRlcm5zIHRoYXQgbWF0Y2ggeW91ciBkYXRhLlwiLFxuICAgIHdoeTogW1wiTm8gZW50cmllcyBmb3VuZCBpbiB0aGUgbGFzdCA5MCBkYXlzXCJdLFxuICAgIGFjdGlvbjogXCJBZGQgdG9kYXkncyB3ZWlnaHQgb24gdGhlIGxlZnQgdG8gYmVnaW4uXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEluc2lnaHRzVjIodXNlcklkOiBzdHJpbmcsIF9ldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0byA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGZyb21EYXRlID0gbmV3IERhdGUoKTtcbiAgZnJvbURhdGUuc2V0RGF0ZShmcm9tRGF0ZS5nZXREYXRlKCkgLSA4OSk7XG4gIGNvbnN0IGZyb20gPSBmcm9tRGF0ZS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZCBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0sXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBcIjpmcm9tRGF0ZVwiOiB7IFM6IGZyb20gfSxcbiAgICAgICAgXCI6dG9EYXRlXCI6IHsgUzogdG8gfSxcbiAgICAgIH0sXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGVudHJpZXNSYXcgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgfSksXG4gICkuZmlsdGVyKChlKSA9PiBlLmRhdGUgJiYgZS5tb3JuaW5nV2VpZ2h0ID4gMCk7XG5cbiAgY29uc3Qgc2V0dGluZ3NUYWJsZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHNldHRpbmdzUm93ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogc2V0dGluZ3NUYWJsZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBnSXRlbSA9IHNldHRpbmdzUm93Lkl0ZW07XG4gIGNvbnN0IGdvYWxXZWlnaHQgPSBnSXRlbSA/IE51bWJlcihnSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSA6IDcyO1xuICBjb25zdCBzdGFydFdlaWdodCA9IGdJdGVtID8gTnVtYmVyKGdJdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSA6IDg1O1xuICBjb25zdCB0YXJnZXREYXRlID0gZ0l0ZW0/LnRhcmdldERhdGU/LlMgPz8gdG87XG5cbiAgY29uc3QgaW5zaWdodHMgPSBhd2FpdCBnZW5lcmF0ZUFpSW5zaWdodENhcmQoZGRiLCB7XG4gICAgdXNlcklkLFxuICAgIGVudHJpZXNSYXcsXG4gICAgZ29hbFdlaWdodCxcbiAgICBzdGFydFdlaWdodCxcbiAgICB0YXJnZXREYXRlLFxuICAgIGRheU1lYWxzVGFibGVOYW1lOiBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSxcbiAgfSk7XG5cbiAgY29uc3QgYm9keU91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGluc2lnaHRzIH07XG4gIGlmIChwcm9jZXNzLmVudi5GRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkcgIT09IFwiZmFsc2VcIikge1xuICAgIGNvbnN0IHN1YnNUYWJsZSA9IHByb2Nlc3MuZW52LlNVQlNDUklQVElPTlNfVEFCTEVfTkFNRTtcbiAgICBsZXQgcGxhbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIGxldCBzdWJzY3JpcHRpb25TdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBpZiAoc3Vic1RhYmxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzdWJPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICAgICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICAgICAgVGFibGVOYW1lOiBzdWJzVGFibGUsXG4gICAgICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICAgICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgICAgcGxhbiA9IHN1Yk91dC5JdGVtPy5wbGFuPy5TID8/IFwiZnJlZVwiO1xuICAgICAgICBzdWJzY3JpcHRpb25TdGF0dXMgPSBzdWJPdXQuSXRlbT8uc3RhdHVzPy5TID8/IFwiaW5hY3RpdmVcIjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBwbGFuID0gXCJmcmVlXCI7XG4gICAgICAgIHN1YnNjcmlwdGlvblN0YXR1cyA9IFwiaW5hY3RpdmVcIjtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc29ydGVkID0gWy4uLmVudHJpZXNSYXddLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xuICAgIGNvbnN0IGxhc3Q3ID0gc29ydGVkLnNsaWNlKC03KTtcbiAgICBjb25zdCBrY2FscyA9IGxhc3Q3Lm1hcCgoZSkgPT4gZS5jYWxvcmllcykuZmlsdGVyKChjKTogYyBpcyBudW1iZXIgPT4gdHlwZW9mIGMgPT09IFwibnVtYmVyXCIgJiYgYyA+IDApO1xuICAgIGNvbnN0IHJlY2VudEF2Z0RhaWx5Q2Fsb3JpZXMgPVxuICAgICAga2NhbHMubGVuZ3RoID49IDIgPyBrY2Fscy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIGtjYWxzLmxlbmd0aCA6IG51bGw7XG4gICAgYm9keU91dC5wZXJzb25hbGl6ZWRDb2FjaGluZyA9IGJ1aWxkUGVyc29uYWxpemVkQ29hY2hpbmdQYXlsb2FkKHtcbiAgICAgIGVudHJpZXNSYXcsXG4gICAgICBnb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlLFxuICAgICAgYXNPZkRhdGU6IHRvLFxuICAgICAgcGxhbixcbiAgICAgIHN1YnNjcmlwdGlvblN0YXR1cyxcbiAgICAgIHJlY2VudEF2Z0RhaWx5Q2Fsb3JpZXMsXG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGpzb24oMjAwLCBib2R5T3V0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRVwiLCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGluc2lnaHRJZCA9IHR5cGVvZiBib2R5Lmluc2lnaHRJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuaW5zaWdodElkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHZvdGVSYXcgPSBib2R5LnZvdGU7XG4gIGNvbnN0IGFsbG93ZWRWb3RlcyA9IG5ldyBTZXQoW1widXBcIiwgXCJkb3duXCIsIFwiaGVscGZ1bFwiLCBcIm5vdF9oZWxwZnVsXCIsIFwiZGlzbWlzc1wiXSk7XG4gIGNvbnN0IHZvdGUgPVxuICAgIHR5cGVvZiB2b3RlUmF3ID09PSBcInN0cmluZ1wiICYmIGFsbG93ZWRWb3Rlcy5oYXModm90ZVJhdylcbiAgICAgID8gKHZvdGVSYXcgYXMgXCJ1cFwiIHwgXCJkb3duXCIgfCBcImhlbHBmdWxcIiB8IFwibm90X2hlbHBmdWxcIiB8IFwiZGlzbWlzc1wiKVxuICAgICAgOiBudWxsO1xuICBpZiAoIWluc2lnaHRJZCB8fCAhdm90ZSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgaW5zaWdodCBmZWVkYmFjayBwYXlsb2FkXCIgfSk7XG4gIGNvbnN0IGNvbW1lbnRSYXcgPSBib2R5LmNvbW1lbnQ7XG4gIGNvbnN0IGNvbW1lbnQgPVxuICAgIHR5cGVvZiBjb21tZW50UmF3ID09PSBcInN0cmluZ1wiICYmIGNvbW1lbnRSYXcudHJpbSgpLmxlbmd0aCA+IDBcbiAgICAgID8gY29tbWVudFJhdy50cmltKCkuc2xpY2UoMCwgMjAwMClcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCBmZWVkYmFja1R5cGUgPSBib2R5LmZlZWRiYWNrVHlwZSA9PT0gXCJuZWdhdGl2ZVwiID8gXCJuZWdhdGl2ZVwiIDogdW5kZWZpbmVkO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGluc2lnaHRUczogeyBTOiBgJHt0c30jJHtpbnNpZ2h0SWR9YCB9LFxuICAgICAgICBpbnNpZ2h0SWQ6IHsgUzogaW5zaWdodElkIH0sXG4gICAgICAgIHZvdGU6IHsgUzogdm90ZSB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgICAuLi4oY29tbWVudCA/IHsgY29tbWVudDogeyBTOiBjb21tZW50IH0gfSA6IHt9KSxcbiAgICAgICAgLi4uKGZlZWRiYWNrVHlwZSA/IHsgZmVlZGJhY2tUeXBlOiB7IFM6IGZlZWRiYWNrVHlwZSB9IH0gOiB7fSksXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEVudHJpZXModXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZnJvbSA9IHF1ZXJ5Py5mcm9tO1xuICBjb25zdCB0byA9IHF1ZXJ5Py50bztcbiAgaWYgKGZyb20gJiYgIWlzRGF0ZVN0cmluZyhmcm9tKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZnJvbSBkYXRlXCIgfSk7XG4gIGlmICh0byAmJiAhaXNEYXRlU3RyaW5nKHRvKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgdG8gZGF0ZVwiIH0pO1xuXG4gIGNvbnN0IGV4cHJlc3Npb25WYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHsgUzogc3RyaW5nIH0+ID0geyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9O1xuICBsZXQga2V5Q29uZGl0aW9uID0gXCJ1c2VySWQgPSA6dXNlcklkXCI7XG4gIGlmIChmcm9tICYmIHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfSBlbHNlIGlmIChmcm9tKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA+PSA6ZnJvbURhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gIH0gZWxzZSBpZiAodG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIDw9IDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfVxuXG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBrZXlDb25kaXRpb24sXG4gICAgICAuLi4oa2V5Q29uZGl0aW9uLmluY2x1ZGVzKFwiI2RhdGVcIilcbiAgICAgICAgPyB7IEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0gfVxuICAgICAgICA6IHt9KSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25WYWx1ZXMsXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICBpZDogaXRlbS5pZD8uUyA/PyBgJHt1c2VySWR9OiR7aXRlbS5kYXRlPy5TID8/IFwiXCJ9YCxcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHVzZXJJZCxcbiAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIHBob3RvVXJsOiBpdGVtLnBob3RvVXJsPy5TID8/IHVuZGVmaW5lZCxcbiAgICBub3RlczogaXRlbS5ub3Rlcz8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlUZXh0OiBpdGVtLmFjdGl2aXR5VGV4dD8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlTdW1tYXJ5OiBpdGVtLmFjdGl2aXR5U3VtbWFyeT8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlCdXJuS2NhbDogaXRlbS5hY3Rpdml0eUJ1cm5LY2FsPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlCdXJuS2NhbC5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eU1ldDogaXRlbS5hY3Rpdml0eU1ldD8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5TWV0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5TWludXRlczogaXRlbS5hY3Rpdml0eU1pbnV0ZXM/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eU1pbnV0ZXMuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlDb25maWRlbmNlOiBpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZT8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZS5OKSA6IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLmFjdGl2aXR5VGV4dCA9PT0gXCJzdHJpbmdcIikgaXRlbS5hY3Rpdml0eVRleHQgPSB7IFM6IGRhdGEuYWN0aXZpdHlUZXh0IH07XG4gIGlmICh0eXBlb2YgZGF0YS5hY3Rpdml0eVN1bW1hcnkgPT09IFwic3RyaW5nXCIpIGl0ZW0uYWN0aXZpdHlTdW1tYXJ5ID0geyBTOiBkYXRhLmFjdGl2aXR5U3VtbWFyeSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlCdXJuS2NhbCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlCdXJuS2NhbCkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlNZXQgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eU1ldCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNZXQpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5TWludXRlcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5TWludXRlcyA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNaW51dGVzKSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eUNvbmZpZGVuY2UgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5Q29uZmlkZW5jZSkgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgIH0pLFxuICApO1xuXG4gIGlmICghb3V0Lkl0ZW0pIHtcbiAgICBjb25zdCBzZXR0aW5nczogU3RvcmVkU2V0dGluZ3MgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBnb2FsV2VpZ2h0OiA3MixcbiAgICAgIHN0YXJ0V2VpZ2h0OiA4NSxcbiAgICAgIHRhcmdldERhdGU6IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBcImtnXCIsXG4gICAgICB0b25lOiBcImZyaWVuZGx5XCIsXG4gICAgfTtcbiAgICBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLmdvYWxXZWlnaHQpIH0sXG4gICAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLnN0YXJ0V2VpZ2h0KSB9LFxuICAgICAgICAgIHRhcmdldERhdGU6IHsgUzogc2V0dGluZ3MudGFyZ2V0RGF0ZSB9LFxuICAgICAgICAgIHVuaXQ6IHsgUzogc2V0dGluZ3MudW5pdCB9LFxuICAgICAgICAgIHRvbmU6IHsgUzogc2V0dGluZ3MudG9uZSA/PyBcImZyaWVuZGx5XCIgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICBzZXR0aW5nczoge1xuICAgICAgICBnb2FsV2VpZ2h0OiBzZXR0aW5ncy5nb2FsV2VpZ2h0LFxuICAgICAgICBzdGFydFdlaWdodDogc2V0dGluZ3Muc3RhcnRXZWlnaHQsXG4gICAgICAgIHRhcmdldERhdGU6IHNldHRpbmdzLnRhcmdldERhdGUsXG4gICAgICAgIHVuaXQ6IHNldHRpbmdzLnVuaXQsXG4gICAgICAgIHRvbmU6IHNldHRpbmdzLnRvbmUsXG4gICAgICAgIHBsYXRlYXU6IHVuZGVmaW5lZCxcbiAgICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcjogc2V0dGluZ3MuYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvciA/PyAxLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MiksXG4gICAgICBzdGFydFdlaWdodDogTnVtYmVyKG91dC5JdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSxcbiAgICAgIHRhcmdldERhdGU6IG91dC5JdGVtLnRhcmdldERhdGU/LlMgPz8gZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IG91dC5JdGVtLnVuaXQ/LlMgPT09IFwibGJzXCIgPyBcImxic1wiIDogXCJrZ1wiLFxuICAgICAgdG9uZTpcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwidG91Z2gtbG92ZVwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCJcbiAgICAgICAgICA/IG91dC5JdGVtLnRvbmUuU1xuICAgICAgICAgIDogXCJmcmllbmRseVwiLFxuICAgICAgcGxhdGVhdTogcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0ob3V0Lkl0ZW0pLFxuICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvcjogTnVtYmVyKG91dC5JdGVtLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSksXG4gICAgICBvcHRJbkZvcmVjYXN0OiBOdW1iZXIob3V0Lkl0ZW0ub3B0SW5Gb3JlY2FzdD8uTiA/PyBcIjBcIikgPT09IDEsXG4gICAgICBmb3JlY2FzdEdlbmVyYXRlZEF0OiBvdXQuSXRlbS5mb3JlY2FzdEdlbmVyYXRlZEF0Py5TLFxuICAgICAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ6IE51bWJlcihvdXQuSXRlbS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZD8uTiA/PyBcIjBcIikgPT09IDEsXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhdGNoU2V0dGluZ3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgZXhpc3RpbmdPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZVNldHRpbmdzKHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuXG4gIGNvbnN0IGV4aXN0aW5nVG9uZSA9XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJmcmllbmRseVwiXG4gICAgICA/IGV4aXN0aW5nT3V0Lkl0ZW0udG9uZS5TXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgY29uc3QgdG9uZSA9IGRhdGEudG9uZSA/PyBleGlzdGluZ1RvbmUgPz8gXCJmcmllbmRseVwiO1xuICBjb25zdCBleGlzdGluZ0NhbGlicmF0aW9uID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSk7XG4gIGNvbnN0IGV4aXN0aW5nT3B0SW5Gb3JlY2FzdCA9IE51bWJlcihleGlzdGluZ091dC5JdGVtPy5vcHRJbkZvcmVjYXN0Py5OID8/IFwiMFwiKSA9PT0gMTtcbiAgY29uc3QgZXhpc3RpbmdGb3JlY2FzdEdlbmVyYXRlZEF0ID0gZXhpc3RpbmdPdXQuSXRlbT8uZm9yZWNhc3RHZW5lcmF0ZWRBdD8uUztcbiAgY29uc3QgZXhpc3RpbmdGb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA9XG4gICAgTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPy5OID8/IFwiMFwiKSA9PT0gMTtcblxuICBsZXQgbmV4dFBsYXRlYXUgPSBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShleGlzdGluZ091dC5JdGVtKTtcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChib2R5LCBcInBsYXRlYXVcIikpIHtcbiAgICBjb25zdCByYXdQbGF0ZWF1ID0gYm9keS5wbGF0ZWF1O1xuICAgIGlmIChyYXdQbGF0ZWF1ID09PSBudWxsKSB7XG4gICAgICBuZXh0UGxhdGVhdSA9IHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcCA9IHZhbGlkYXRlUGxhdGVhdVBhdGNoT2JqZWN0KHJhd1BsYXRlYXUpO1xuICAgICAgaWYgKCFwLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcC5lcnJvciB9KTtcbiAgICAgIG5leHRQbGF0ZWF1ID0geyAuLi5uZXh0UGxhdGVhdSwgLi4ucC5kYXRhIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBnb2FsV2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLmdvYWxXZWlnaHQpIH0sXG4gICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuc3RhcnRXZWlnaHQpIH0sXG4gICAgdGFyZ2V0RGF0ZTogeyBTOiBkYXRhLnRhcmdldERhdGUgfSxcbiAgICB1bml0OiB7IFM6IGRhdGEudW5pdCB9LFxuICAgIHRvbmU6IHsgUzogdG9uZSB9LFxuICB9O1xuICBpZiAobmV4dFBsYXRlYXU/LnJvbGxpbmdXaW5kb3dEYXlzICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVSb2xsaW5nV2luZG93RGF5cyA9IHsgTjogU3RyaW5nKE1hdGgucm91bmQobmV4dFBsYXRlYXUucm9sbGluZ1dpbmRvd0RheXMpKSB9O1xuICB9XG4gIGlmIChuZXh0UGxhdGVhdT8uY29tcGFyaXNvblNwYW5EYXlzICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVDb21wYXJpc29uU3BhbkRheXMgPSB7IE46IFN0cmluZyhNYXRoLnJvdW5kKG5leHRQbGF0ZWF1LmNvbXBhcmlzb25TcGFuRGF5cykpIH07XG4gIH1cbiAgaWYgKG5leHRQbGF0ZWF1Py5tYXhBdmdNb3ZlbWVudEtnICE9IG51bGwpIHtcbiAgICBpdGVtLnBsYXRlYXVNYXhNb3ZlbWVudEtnID0geyBOOiBTdHJpbmcobmV4dFBsYXRlYXUubWF4QXZnTW92ZW1lbnRLZykgfTtcbiAgfVxuICBpdGVtLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3IgPSB7IE46IFN0cmluZyhleGlzdGluZ0NhbGlicmF0aW9uKSB9O1xuICBpdGVtLm9wdEluRm9yZWNhc3QgPSB7XG4gICAgTjogKGRhdGEub3B0SW5Gb3JlY2FzdCA/PyBleGlzdGluZ09wdEluRm9yZWNhc3QpID8gXCIxXCIgOiBcIjBcIixcbiAgfTtcbiAgY29uc3QgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgPSBkYXRhLmZvcmVjYXN0R2VuZXJhdGVkQXQgPz8gZXhpc3RpbmdGb3JlY2FzdEdlbmVyYXRlZEF0O1xuICBpZiAodHlwZW9mIG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0ID09PSBcInN0cmluZ1wiICYmIG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0Lmxlbmd0aCA+IDApIHtcbiAgICBpdGVtLmZvcmVjYXN0R2VuZXJhdGVkQXQgPSB7IFM6IG5leHRGb3JlY2FzdEdlbmVyYXRlZEF0IH07XG4gIH1cbiAgaXRlbS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA9IHtcbiAgICBOOiAoZGF0YS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA/PyBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkKSA/IFwiMVwiIDogXCIwXCIsXG4gIH07XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbTogaXRlbSBhcyBuZXZlcixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogZGF0YS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGRhdGEuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBkYXRhLnRhcmdldERhdGUsXG4gICAgICB1bml0OiBkYXRhLnVuaXQsXG4gICAgICB0b25lLFxuICAgICAgcGxhdGVhdTogbmV4dFBsYXRlYXUsXG4gICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBleGlzdGluZ0NhbGlicmF0aW9uLFxuICAgICAgb3B0SW5Gb3JlY2FzdDogZGF0YS5vcHRJbkZvcmVjYXN0ID8/IGV4aXN0aW5nT3B0SW5Gb3JlY2FzdCxcbiAgICAgIGZvcmVjYXN0R2VuZXJhdGVkQXQ6IGRhdGEuZm9yZWNhc3RHZW5lcmF0ZWRBdCA/PyBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQsXG4gICAgICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZDpcbiAgICAgICAgZGF0YS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCA/PyBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkLFxuICAgIH0sXG4gIH0pO1xufVxuXG50eXBlIFByb2dyZXNzUGhvdG9JdGVtID0ge1xuICBwaG90b0lkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBkYXRlOiBzdHJpbmc7XG4gIGltYWdlVXJsPzogc3RyaW5nO1xuICBzdG9yYWdlS2V5Pzogc3RyaW5nO1xuICB3ZWlnaHRBdFBob3RvPzogbnVtYmVyO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIHBhcnNlUHJvZ3Jlc3NQaG90b0Zyb21JdGVtKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9Pik6IFByb2dyZXNzUGhvdG9JdGVtIHwgbnVsbCB7XG4gIGNvbnN0IHBob3RvSWQgPSBpdGVtLnBob3RvSWQ/LlM7XG4gIGNvbnN0IHVzZXJJZCA9IGl0ZW0udXNlcklkPy5TO1xuICBjb25zdCBkYXRlID0gaXRlbS5kYXRlPy5TO1xuICBjb25zdCBjcmVhdGVkQXQgPSBpdGVtLmNyZWF0ZWRBdD8uUztcbiAgaWYgKCFwaG90b0lkIHx8ICF1c2VySWQgfHwgIWRhdGUgfHwgIWNyZWF0ZWRBdCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGltYWdlVXJsID0gaXRlbS5pbWFnZVVybD8uUztcbiAgY29uc3Qgc3RvcmFnZUtleSA9IGl0ZW0uc3RvcmFnZUtleT8uUztcbiAgY29uc3Qgd2VpZ2h0UmF3ID0gaXRlbS53ZWlnaHRBdFBob3RvPy5OO1xuICBjb25zdCB3ZWlnaHRBdFBob3RvID0gd2VpZ2h0UmF3ICE9IG51bGwgPyBOdW1iZXIod2VpZ2h0UmF3KSA6IHVuZGVmaW5lZDtcbiAgcmV0dXJuIHtcbiAgICBwaG90b0lkLFxuICAgIHVzZXJJZCxcbiAgICBkYXRlLFxuICAgIGltYWdlVXJsOiBpbWFnZVVybCB8fCB1bmRlZmluZWQsXG4gICAgc3RvcmFnZUtleTogc3RvcmFnZUtleSB8fCB1bmRlZmluZWQsXG4gICAgd2VpZ2h0QXRQaG90bzogTnVtYmVyLmlzRmluaXRlKHdlaWdodEF0UGhvdG8gPz8gTmFOKSA/IHdlaWdodEF0UGhvdG8gOiB1bmRlZmluZWQsXG4gICAgY3JlYXRlZEF0LFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0UHJvZ3Jlc3NQaG90b3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgaXRlbXMgPSAob3V0Lkl0ZW1zID8/IFtdKVxuICAgIC5tYXAoKGl0ZW0pID0+IHBhcnNlUHJvZ3Jlc3NQaG90b0Zyb21JdGVtKGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+KSlcbiAgICAuZmlsdGVyKChyb3cpOiByb3cgaXMgUHJvZ3Jlc3NQaG90b0l0ZW0gPT4gcm93ICE9PSBudWxsKVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLmRhdGUubG9jYWxlQ29tcGFyZShhLmRhdGUpKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGl0ZW1zIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVQcm9ncmVzc1Bob3RvKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJQUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRVwiLCBwcm9ncmVzc1Bob3Rvc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogdW5kZWZpbmVkO1xuICBjb25zdCBpbWFnZVVybCA9IHR5cGVvZiBib2R5LmltYWdlVXJsID09PSBcInN0cmluZ1wiID8gYm9keS5pbWFnZVVybC50cmltKCkgOiBcIlwiO1xuICBjb25zdCBzdG9yYWdlS2V5ID0gdHlwZW9mIGJvZHkuc3RvcmFnZUtleSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuc3RvcmFnZUtleS50cmltKCkgOiBcIlwiO1xuICBjb25zdCB3ZWlnaHRBdFBob3RvID0gYm9keS53ZWlnaHRBdFBob3RvID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBOdW1iZXIoYm9keS53ZWlnaHRBdFBob3RvKTtcbiAgaWYgKCFkYXRlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG4gIGlmICghaW1hZ2VVcmwgJiYgIXN0b3JhZ2VLZXkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJNaXNzaW5nIGltYWdlVXJsIG9yIHN0b3JhZ2VLZXlcIiB9KTtcbiAgaWYgKFxuICAgIHdlaWdodEF0UGhvdG8gIT09IHVuZGVmaW5lZCAmJlxuICAgICghTnVtYmVyLmlzRmluaXRlKHdlaWdodEF0UGhvdG8pIHx8IHdlaWdodEF0UGhvdG8gPD0gMCB8fCB3ZWlnaHRBdFBob3RvID4gMTAwMClcbiAgKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgd2VpZ2h0QXRQaG90b1wiIH0pO1xuICB9XG4gIGNvbnN0IHBob3RvSWQgPSByYW5kb21VVUlEKCk7XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBwaG90b0lkOiB7IFM6IHBob3RvSWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICBjcmVhdGVkQXQ6IHsgUzogY3JlYXRlZEF0IH0sXG4gIH07XG4gIGlmIChpbWFnZVVybCkgaXRlbS5pbWFnZVVybCA9IHsgUzogaW1hZ2VVcmwgfTtcbiAgaWYgKHN0b3JhZ2VLZXkpIGl0ZW0uc3RvcmFnZUtleSA9IHsgUzogc3RvcmFnZUtleSB9O1xuICBpZiAod2VpZ2h0QXRQaG90byAhPT0gdW5kZWZpbmVkKSBpdGVtLndlaWdodEF0UGhvdG8gPSB7IE46IFN0cmluZyh3ZWlnaHRBdFBob3RvKSB9O1xuICBhd2FpdCBkZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IHRhYmxlLCBJdGVtOiBpdGVtIGFzIG5ldmVyIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgaXRlbToge1xuICAgICAgcGhvdG9JZCxcbiAgICAgIHVzZXJJZCxcbiAgICAgIGRhdGUsXG4gICAgICBpbWFnZVVybDogaW1hZ2VVcmwgfHwgdW5kZWZpbmVkLFxuICAgICAgc3RvcmFnZUtleTogc3RvcmFnZUtleSB8fCB1bmRlZmluZWQsXG4gICAgICB3ZWlnaHRBdFBob3RvLFxuICAgICAgY3JlYXRlZEF0LFxuICAgIH0sXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVQcm9ncmVzc1Bob3RvKHVzZXJJZDogc3RyaW5nLCBwaG90b0lkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBwaG90b0lkOiB7IFM6IHBob3RvSWQgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxudHlwZSBCb2R5Q29tcGFyZUFzc2Vzc21lbnRSZXN1bHQgPSB7XG4gIHN1bW1hcnk6IHN0cmluZztcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xuICBlc3RpbWF0ZWQ6IGJvb2xlYW47XG4gIGRpc2NsYWltZXI6IHN0cmluZztcbiAgaGlnaGxpZ2h0czogQXJyYXk8e1xuICAgIGFyZWE6IHN0cmluZztcbiAgICBhc3Nlc3NtZW50OiBzdHJpbmc7XG4gICAgZGlyZWN0aW9uOiBcImxlYW5lclwiIHwgXCJ1bmNoYW5nZWRcIiB8IFwidW5jZXJ0YWluXCI7XG4gIH0+O1xufTtcblxuZnVuY3Rpb24gZXh0cmFjdEZpcnN0SnNvbk9iamVjdChyYXc6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCB0ZXh0ID0gcmF3LnRyaW0oKTtcbiAgY29uc3Qgc3RhcnQgPSB0ZXh0LmluZGV4T2YoXCJ7XCIpO1xuICBpZiAoc3RhcnQgPCAwKSByZXR1cm4gbnVsbDtcbiAgbGV0IGRlcHRoID0gMDtcbiAgbGV0IGluU3RyaW5nID0gZmFsc2U7XG4gIGxldCBlc2NhcGUgPSBmYWxzZTtcbiAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgdGV4dC5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGNvbnN0IGMgPSB0ZXh0W2ldITtcbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICBlc2NhcGUgPSBmYWxzZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA9PT0gXCJcXFxcXCIgJiYgaW5TdHJpbmcpIHtcbiAgICAgIGVzY2FwZSA9IHRydWU7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGMgPT09IFwiXFxcIlwiKSB7XG4gICAgICBpblN0cmluZyA9ICFpblN0cmluZztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoIWluU3RyaW5nKSB7XG4gICAgICBpZiAoYyA9PT0gXCJ7XCIpIGRlcHRoICs9IDE7XG4gICAgICBpZiAoYyA9PT0gXCJ9XCIpIHtcbiAgICAgICAgZGVwdGggLT0gMTtcbiAgICAgICAgaWYgKGRlcHRoID09PSAwKSByZXR1cm4gdGV4dC5zbGljZShzdGFydCwgaSArIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcGFyc2VCb2R5Q29tcGFyZUFzc2Vzc21lbnQocmF3OiBzdHJpbmcpOiBCb2R5Q29tcGFyZUFzc2Vzc21lbnRSZXN1bHQgfCBudWxsIHtcbiAgY29uc3QganNvblRleHQgPSBleHRyYWN0Rmlyc3RKc29uT2JqZWN0KHJhdyk7XG4gIGlmICghanNvblRleHQpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvblRleHQpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHN1bW1hcnkgPSB0eXBlb2YgcGFyc2VkLnN1bW1hcnkgPT09IFwic3RyaW5nXCIgPyBwYXJzZWQuc3VtbWFyeS50cmltKCkgOiBcIlwiO1xuICAgIGNvbnN0IGNvbmZpZGVuY2UgPSBOdW1iZXIocGFyc2VkLmNvbmZpZGVuY2UpO1xuICAgIGNvbnN0IGRpc2NsYWltZXIgPSB0eXBlb2YgcGFyc2VkLmRpc2NsYWltZXIgPT09IFwic3RyaW5nXCIgPyBwYXJzZWQuZGlzY2xhaW1lci50cmltKCkgOiBcIlwiO1xuICAgIGlmICghc3VtbWFyeSB8fCAhTnVtYmVyLmlzRmluaXRlKGNvbmZpZGVuY2UpIHx8ICFkaXNjbGFpbWVyKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBoaWdobGlnaHRzUmF3ID0gQXJyYXkuaXNBcnJheShwYXJzZWQuaGlnaGxpZ2h0cykgPyBwYXJzZWQuaGlnaGxpZ2h0cyA6IFtdO1xuICAgIGNvbnN0IGhpZ2hsaWdodHMgPSBoaWdobGlnaHRzUmF3XG4gICAgICAubWFwKChlbnRyeSkgPT4ge1xuICAgICAgICBjb25zdCBlID0gZW50cnkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICAgIGNvbnN0IGFyZWEgPSB0eXBlb2YgZS5hcmVhID09PSBcInN0cmluZ1wiID8gZS5hcmVhLnRyaW0oKSA6IFwiXCI7XG4gICAgICAgIGNvbnN0IGFzc2Vzc21lbnQgPSB0eXBlb2YgZS5hc3Nlc3NtZW50ID09PSBcInN0cmluZ1wiID8gZS5hc3Nlc3NtZW50LnRyaW0oKSA6IFwiXCI7XG4gICAgICAgIGNvbnN0IGRpcmVjdGlvblJhdyA9IHR5cGVvZiBlLmRpcmVjdGlvbiA9PT0gXCJzdHJpbmdcIiA/IGUuZGlyZWN0aW9uIDogXCJ1bmNlcnRhaW5cIjtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uID1cbiAgICAgICAgICBkaXJlY3Rpb25SYXcgPT09IFwibGVhbmVyXCIgfHwgZGlyZWN0aW9uUmF3ID09PSBcInVuY2hhbmdlZFwiIHx8IGRpcmVjdGlvblJhdyA9PT0gXCJ1bmNlcnRhaW5cIlxuICAgICAgICAgICAgPyBkaXJlY3Rpb25SYXdcbiAgICAgICAgICAgIDogXCJ1bmNlcnRhaW5cIjtcbiAgICAgICAgaWYgKCFhcmVhIHx8ICFhc3Nlc3NtZW50KSByZXR1cm4gbnVsbDtcbiAgICAgICAgcmV0dXJuIHsgYXJlYSwgYXNzZXNzbWVudCwgZGlyZWN0aW9uIH07XG4gICAgICB9KVxuICAgICAgLmZpbHRlcihcbiAgICAgICAgKHYpOiB2IGlzIHsgYXJlYTogc3RyaW5nOyBhc3Nlc3NtZW50OiBzdHJpbmc7IGRpcmVjdGlvbjogXCJsZWFuZXJcIiB8IFwidW5jaGFuZ2VkXCIgfCBcInVuY2VydGFpblwiIH0gPT5cbiAgICAgICAgICB2ICE9PSBudWxsLFxuICAgICAgKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3VtbWFyeSxcbiAgICAgIGNvbmZpZGVuY2U6IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgTWF0aC5yb3VuZChjb25maWRlbmNlKSkpLFxuICAgICAgZXN0aW1hdGVkOiB0cnVlLFxuICAgICAgZGlzY2xhaW1lcixcbiAgICAgIGhpZ2hsaWdodHMsXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYXNzZXNzUHJvZ3Jlc3NQaG90b3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc0JvZHlDb21wYXJlQWlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiQUkgcGhvdG8gY29tcGFyZSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBhcGlLZXkgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWT8udHJpbSgpO1xuICBpZiAoIWFwaUtleSkgcmV0dXJuIGpzb24oNTAzLCB7IGVycm9yOiBcIkFJIGNvbXBhcmUgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gIGNvbnN0IHJhdyA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBib2R5XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHBob3Rvc1JhdyA9IEFycmF5LmlzQXJyYXkoYm9keS5waG90b3MpID8gYm9keS5waG90b3MgOiBbXTtcbiAgY29uc3QgcXVlcnkgPSB0eXBlb2YgYm9keS5xdWVyeSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkucXVlcnkudHJpbSgpIDogXCJcIjtcbiAgdHlwZSBQaG90b0l0ZW0gPSB7XG4gICAgZGF0ZTogc3RyaW5nO1xuICAgIHBob3RvVXJsOiBzdHJpbmc7XG4gICAgaW1hZ2VCYXNlNjQ6IHN0cmluZztcbiAgICBtZWRpYVR5cGU6IHN0cmluZztcbiAgfTtcbiAgY29uc3QgcGhvdG9zOiBQaG90b0l0ZW1bXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJhdyBvZiBwaG90b3NSYXcpIHtcbiAgICBjb25zdCBwID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IGRhdGUgPSB0eXBlb2YgcC5kYXRlID09PSBcInN0cmluZ1wiID8gcC5kYXRlIDogXCJcIjtcbiAgICBjb25zdCBwaG90b1VybCA9IHR5cGVvZiBwLnBob3RvVXJsID09PSBcInN0cmluZ1wiID8gcC5waG90b1VybC50cmltKCkgOiBcIlwiO1xuICAgIGNvbnN0IGltYWdlQmFzZTY0ID1cbiAgICAgIHR5cGVvZiBwLmltYWdlQmFzZTY0ID09PSBcInN0cmluZ1wiID8gcC5pbWFnZUJhc2U2NC5yZXBsYWNlKC9cXHMvZywgXCJcIikgOiBcIlwiO1xuICAgIGNvbnN0IG1lZGlhVHlwZSA9IHR5cGVvZiBwLm1lZGlhVHlwZSA9PT0gXCJzdHJpbmdcIiA/IHAubWVkaWFUeXBlLnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcbiAgICBpZiAoIWlzRGF0ZVN0cmluZyhkYXRlKSkgY29udGludWU7XG4gICAgaWYgKHBob3RvVXJsKSB7XG4gICAgICBwaG90b3MucHVzaCh7IGRhdGUsIHBob3RvVXJsLCBpbWFnZUJhc2U2NDogXCJcIiwgbWVkaWFUeXBlOiBcIlwiIH0pO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBpbWFnZUJhc2U2NCAmJlxuICAgICAgKG1lZGlhVHlwZSA9PT0gXCJpbWFnZS9qcGVnXCIgfHxcbiAgICAgICAgbWVkaWFUeXBlID09PSBcImltYWdlL3BuZ1wiIHx8XG4gICAgICAgIG1lZGlhVHlwZSA9PT0gXCJpbWFnZS9naWZcIiB8fFxuICAgICAgICBtZWRpYVR5cGUgPT09IFwiaW1hZ2Uvd2VicFwiKVxuICAgICkge1xuICAgICAgcGhvdG9zLnB1c2goeyBkYXRlLCBwaG90b1VybDogXCJcIiwgaW1hZ2VCYXNlNjQsIG1lZGlhVHlwZSB9KTtcbiAgICB9XG4gIH1cbiAgaWYgKHBob3Rvcy5sZW5ndGggPCAyKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkF0IGxlYXN0IHR3byBwaG90b3MgYXJlIHJlcXVpcmVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHNlbGVjdGVkID0gcGhvdG9zLnNsaWNlKDAsIDgpLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xuICB0eXBlIENvbXBhcmVDb250ZW50QmxvY2sgPVxuICAgIHwgeyB0eXBlOiBcInRleHRcIjsgdGV4dDogc3RyaW5nIH1cbiAgICB8IHtcbiAgICAgICAgdHlwZTogXCJpbWFnZVwiO1xuICAgICAgICBzb3VyY2U6IHtcbiAgICAgICAgICB0eXBlOiBcImJhc2U2NFwiO1xuICAgICAgICAgIG1lZGlhX3R5cGU6IFwiaW1hZ2UvanBlZ1wiIHwgXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3dlYnBcIjtcbiAgICAgICAgICBkYXRhOiBzdHJpbmc7XG4gICAgICAgIH07XG4gICAgICB9O1xuICBjb25zdCBjb250ZW50OiBDb21wYXJlQ29udGVudEJsb2NrW10gPSBbXTtcbiAgZm9yIChjb25zdCBwIG9mIHNlbGVjdGVkKSB7XG4gICAgbGV0IGJ1ZjogQnVmZmVyO1xuICAgIGxldCBtZWRpYVR5cGU6IFwiaW1hZ2UvanBlZ1wiIHwgXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3dlYnBcIjtcbiAgICBpZiAocC5waG90b1VybCkge1xuICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHAucGhvdG9VcmwpO1xuICAgICAgaWYgKCFub3JtYWxpemVkKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwaG90byByZWZlcmVuY2UuXCIgfSk7XG4gICAgICBjb25zdCByZWYgPSBwYXJzZVMzVXJpKG5vcm1hbGl6ZWQpO1xuICAgICAgaWYgKCFyZWYpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJPbmx5IHMzOi8vIHBob3RvIHJlZmVyZW5jZXMgYXJlIHN1cHBvcnRlZC5cIiB9KTtcbiAgICAgIGlmICghcGhvdG9CdWNrZXROYW1lIHx8IHJlZi5idWNrZXQgIT09IHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwaG90byBidWNrZXQuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIXMzS2V5QWxsb3dlZEZvclVzZXIocmVmLmtleSwgdXNlcklkKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiUGhvdG8gZG9lcyBub3QgYmVsb25nIHRvIHRoaXMgdXNlci5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGxldCBieXRlczogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb250ZW50VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3V0ID0gYXdhaXQgczMuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogcmVmLmJ1Y2tldCwgS2V5OiByZWYua2V5IH0pKTtcbiAgICAgICAgYnl0ZXMgPSBhd2FpdCBvdXQuQm9keT8udHJhbnNmb3JtVG9CeXRlQXJyYXkoKTtcbiAgICAgICAgY29udGVudFR5cGUgPSBvdXQuQ29udGVudFR5cGU7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkNvdWxkIG5vdCByZWFkIG9uZSBvZiB0aGUgcGhvdG9zLlwiIH0pO1xuICAgICAgfVxuICAgICAgaWYgKCFieXRlcyB8fCBieXRlcy5sZW5ndGggPT09IDApIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJFbXB0eSBwaG90byBmb3VuZC5cIiB9KTtcbiAgICAgIGJ1ZiA9IEJ1ZmZlci5mcm9tKGJ5dGVzKTtcbiAgICAgIGlmIChieXRlcy5sZW5ndGggPiAxMiAqIDEwMjQgKiAxMDI0KSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQSBwaG90byBpcyB0b28gbGFyZ2UuXCIgfSk7XG4gICAgICBpZiAoaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdChyZWYua2V5LCBjb250ZW50VHlwZSkgfHwgYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZihidWYpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJIRUlDL0hFSUYgaW1hZ2VzIGFyZSBub3Qgc3VwcG9ydGVkLiBVc2UgSlBFRy9QTkcvV2ViUC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIG1lZGlhVHlwZSA9IGd1ZXNzRm9vZEltYWdlTWVkaWFUeXBlKHJlZi5rZXksIGNvbnRlbnRUeXBlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IGRlY29kZWQ6IEJ1ZmZlcjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRlY29kZWQgPSBCdWZmZXIuZnJvbShwLmltYWdlQmFzZTY0LCBcImJhc2U2NFwiKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbmxpbmUgcGhvdG8gZW5jb2RpbmcuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoZGVjb2RlZC5sZW5ndGggPT09IDAgfHwgZGVjb2RlZC5sZW5ndGggPiAxMiAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbmxpbmUgcGhvdG8gZW1wdHkgb3IgdG9vIGxhcmdlLlwiIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGJ1ZmZlckxvb2tzTGlrZUhlaWNPckhlaWYoZGVjb2RlZCkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkhFSUMvSEVJRiBpbWFnZXMgYXJlIG5vdCBzdXBwb3J0ZWQuIFVzZSBKUEVHL1BORy9XZWJQLlwiIH0pO1xuICAgICAgfVxuICAgICAgYnVmID0gZGVjb2RlZDtcbiAgICAgIG1lZGlhVHlwZSA9IHAubWVkaWFUeXBlIGFzIHR5cGVvZiBtZWRpYVR5cGU7XG4gICAgfVxuICAgIGNvbnRlbnQucHVzaCh7IHR5cGU6IFwidGV4dFwiLCB0ZXh0OiBgUGhvdG8gZGF0ZTogJHtwLmRhdGV9YCB9KTtcbiAgICBjb250ZW50LnB1c2goe1xuICAgICAgdHlwZTogXCJpbWFnZVwiLFxuICAgICAgc291cmNlOiB7IHR5cGU6IFwiYmFzZTY0XCIsIG1lZGlhX3R5cGU6IG1lZGlhVHlwZSwgZGF0YTogYnVmLnRvU3RyaW5nKFwiYmFzZTY0XCIpIH0sXG4gICAgfSk7XG4gIH1cbiAgY29uc3Qgc3lzdGVtID0gYFlvdSBhcmUgYW4gYXNzaXN0YW50IGZvciBhIGZpdG5lc3MgYXBwLiBDb21wYXJlIHVzZXIgcHJvZ3Jlc3MgcGhvdG9zIGFuZCBwcm92aWRlIGEgY2FyZWZ1bCBFU1RJTUFURSBvbmx5LlxuUnVsZXM6XG4tIERvIE5PVCBwcm92aWRlIGRpYWdub3NpcywgZGlzZWFzZSBjbGFpbXMsIG9yIG1lZGljYWwgYWR2aWNlLlxuLSBJZiBhbmdsZSwgbGlnaHRpbmcsIGNsb3RoaW5nLCBvciBwb3N0dXJlIGRpZmZlciwgZXhwbGljaXRseSBtZW50aW9uIHVuY2VydGFpbnR5LlxuLSBGb2N1cyBvbiB2aXNpYmxlIHRyZW5kIGN1ZXMgb25seSAobWlkc2VjdGlvbiwgd2Fpc3RsaW5lLCBmYWNlIGZ1bGxuZXNzLCBwb3N0dXJlIGNvbnNpc3RlbmN5KS5cbi0gUmV0dXJuIE9OTFkgSlNPTjpcbntcbiAgXCJzdW1tYXJ5XCI6IFwiMi00IHNlbnRlbmNlIHBsYWluLWxhbmd1YWdlIGVzdGltYXRlXCIsXG4gIFwiY29uZmlkZW5jZVwiOiAwLTEwMCxcbiAgXCJkaXNjbGFpbWVyXCI6IFwiT25lIHNlbnRlbmNlOiBlc3RpbWF0ZSBvbmx5LCBub3QgbWVkaWNhbCBhZHZpY2UuXCIsXG4gIFwiaGlnaGxpZ2h0c1wiOiBbXG4gICAgeyBcImFyZWFcIjogXCJzdHJpbmdcIiwgXCJhc3Nlc3NtZW50XCI6IFwic3RyaW5nXCIsIFwiZGlyZWN0aW9uXCI6IFwibGVhbmVyfHVuY2hhbmdlZHx1bmNlcnRhaW5cIiB9XG4gIF1cbn1gO1xuICBjb25zdCBtb2RlbCA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19CT0RZX0NPTVBBUkVfTU9ERUw/LnRyaW0oKSB8fCBcImNsYXVkZS1zb25uZXQtNC0yMDI1MDUxNFwiO1xuICB0cnkge1xuICAgIGNvbnN0IEFudGhyb3BpYyA9IChhd2FpdCBpbXBvcnQoXCJAYW50aHJvcGljLWFpL3Nka1wiKSkuZGVmYXVsdDtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQW50aHJvcGljKHsgYXBpS2V5IH0pO1xuICAgIGNvbnN0IHJlc3AgPSBhd2FpdCBjbGllbnQubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgIG1vZGVsLFxuICAgICAgbWF4X3Rva2VuczogNzAwLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICAgIHN5c3RlbSxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAgICAuLi5jb250ZW50LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB0eXBlOiBcInRleHRcIixcbiAgICAgICAgICAgICAgdGV4dDpcbiAgICAgICAgICAgICAgICBxdWVyeSB8fFxuICAgICAgICAgICAgICAgIFwiQ29tcGFyZSB0aGVzZSBwaG90b3MgZnJvbSBvbGRlc3QgdG8gbmV3ZXN0IGFuZCBzdW1tYXJpemUgdmlzaWJsZSBjaGFuZ2UgdHJlbmRzIGFuZCB1bmNlcnRhaW50eS5cIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgdGV4dCA9IHJlc3AuY29udGVudC5maW5kKChwKSA9PiBwLnR5cGUgPT09IFwidGV4dFwiKT8udGV4dCA/PyBcIlwiO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlQm9keUNvbXBhcmVBc3Nlc3NtZW50KHRleHQpO1xuICAgIGlmICghcGFyc2VkKSByZXR1cm4ganNvbig1MDIsIHsgZXJyb3I6IFwiQ291bGQgbm90IHBhcnNlIEFJIGNvbXBhcmUgcmVzdWx0LlwiIH0pO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgLi4ucGFyc2VkLFxuICAgICAgdGltZWZyYW1lOiB7IGZyb206IHNlbGVjdGVkWzBdPy5kYXRlLCB0bzogc2VsZWN0ZWRbc2VsZWN0ZWQubGVuZ3RoIC0gMV0/LmRhdGUgfSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoSlNPTi5zdHJpbmdpZnkoeyBtc2c6IFwicHJvZ3Jlc3NfcGhvdG9fYXNzZXNzbWVudF9mYWlsZWRcIiwgZXJyOiBTdHJpbmcoZSkgfSkpO1xuICAgIHJldHVybiBqc29uKDUwMiwgeyBlcnJvcjogXCJBSSBjb21wYXJlIGZhaWxlZC4gUGxlYXNlIHRyeSBhZ2Fpbi5cIiB9KTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVVcGxvYWRVcmwodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gIGNvbnN0IGNvbnRlbnRUeXBlID1cbiAgICB0eXBlb2YgYm9keS5jb250ZW50VHlwZSA9PT0gXCJzdHJpbmdcIiAmJiBib2R5LmNvbnRlbnRUeXBlLmxlbmd0aCA+IDBcbiAgICAgID8gYm9keS5jb250ZW50VHlwZVxuICAgICAgOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICBjb25zdCBmaWxlTmFtZSA9IHR5cGVvZiBib2R5LmZpbGVOYW1lID09PSBcInN0cmluZ1wiID8gYm9keS5maWxlTmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBleHRGcm9tRmlsZU5hbWUgPSBmaWxlTmFtZS5tYXRjaCgvXFwuKFthLXpBLVowLTldKykkLyk/LlsxXT8udG9Mb3dlckNhc2UoKSA/PyBcIlwiO1xuICBjb25zdCBleHRGcm9tQm9keSA9XG4gICAgdHlwZW9mIGJvZHkuZXh0ZW5zaW9uID09PSBcInN0cmluZ1wiICYmIC9eW2EtekEtWjAtOV0rJC8udGVzdChib2R5LmV4dGVuc2lvbilcbiAgICAgID8gYm9keS5leHRlbnNpb24udG9Mb3dlckNhc2UoKVxuICAgICAgOiBcIlwiO1xuICBjb25zdCBleHRlbnNpb24gPVxuICAgIGV4dEZyb21GaWxlTmFtZSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUZpbGVOYW1lKVxuICAgICAgPyBleHRGcm9tRmlsZU5hbWVcbiAgICAgIDogZXh0RnJvbUJvZHkgJiYgL15bYS16MC05XSskLy50ZXN0KGV4dEZyb21Cb2R5KVxuICAgICAgICA/IGV4dEZyb21Cb2R5XG4gICAgICAgIDogXCJqcGdcIjtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qga2luZCA9IHR5cGVvZiBib2R5LmtpbmQgPT09IFwic3RyaW5nXCIgPyBib2R5LmtpbmQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICBjb25zdCBrZXkgPVxuICAgIGtpbmQgPT09IFwiZm9vZFwiXG4gICAgICA/IGAke3VzZXJJZH0vZm9vZC8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YFxuICAgICAgOiBgJHt1c2VySWR9LyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuXG4gIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgQnVja2V0OiBidWNrZXQsXG4gICAgS2V5OiBrZXksXG4gICAgQ29udGVudFR5cGU6IGNvbnRlbnRUeXBlLFxuICB9KTtcbiAgY29uc3QgdXBsb2FkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCBjb21tYW5kLCB7IGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyB9KTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1cGxvYWRVcmwsXG4gICAga2V5LFxuICAgIHBob3RvVXJsOiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YCxcbiAgICBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMsXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTdGF0cygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgW3VzZXJzT3V0LCB2aWV3c091dF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgU2NhbkNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgU2VsZWN0OiBcIkNPVU5UXCIsXG4gICAgICAgIEZpbHRlckV4cHJlc3Npb246IFwiI3VpZCA8PiA6bWV0YVVzZXJJZCBBTkQgYXR0cmlidXRlX2V4aXN0cyhnb2FsV2VpZ2h0KVwiLFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjdWlkXCI6IFwidXNlcklkXCIgfSxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjptZXRhVXNlcklkXCI6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICBdKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1c2VyczogTnVtYmVyKHVzZXJzT3V0LkNvdW50ID8/IDApLFxuICAgIHBhZ2VWaWV3czogTnVtYmVyKHZpZXdzT3V0Lkl0ZW0/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgcG9vbElkID0gZ2V0UmVxdWlyZWRFbnYoXCJVU0VSX1BPT0xfSURcIiwgdXNlclBvb2xJZEVudik7XG4gIGNvbnN0IHVzZXJzOiBBcnJheTx7XG4gICAgc3ViOiBzdHJpbmc7XG4gICAgZW1haWw/OiBzdHJpbmc7XG4gICAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICAgIGZ1bGxOYW1lPzogc3RyaW5nO1xuICAgIHN0YXR1cz86IHN0cmluZztcbiAgfT4gPSBbXTtcblxuICBsZXQgcGFnaW5hdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGRvIHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQoXG4gICAgICBuZXcgTGlzdFVzZXJzQ29tbWFuZCh7XG4gICAgICAgIFVzZXJQb29sSWQ6IHBvb2xJZCxcbiAgICAgICAgTGltaXQ6IDYwLFxuICAgICAgICBQYWdpbmF0aW9uVG9rZW46IHBhZ2luYXRpb25Ub2tlbixcbiAgICAgIH0pLFxuICAgICk7XG4gICAgZm9yIChjb25zdCB1IG9mIG91dC5Vc2VycyA/PyBbXSkge1xuICAgICAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3QgYSBvZiB1LkF0dHJpYnV0ZXMgPz8gW10pIHtcbiAgICAgICAgaWYgKGEuTmFtZSAmJiBhLlZhbHVlKSBhdHRyc1thLk5hbWVdID0gYS5WYWx1ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZ1bGxOYW1lID0gYXR0cnMubmFtZTtcbiAgICAgIGNvbnN0IGdpdmVuID0gYXR0cnMuZ2l2ZW5fbmFtZTtcbiAgICAgIGNvbnN0IGZpcnN0TmFtZSA9XG4gICAgICAgIGdpdmVuID8/IChmdWxsTmFtZSA/IGZ1bGxOYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdIDogdW5kZWZpbmVkKTtcbiAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICBzdWI6IGF0dHJzLnN1YiA/PyB1LlVzZXJuYW1lID8/IFwiXCIsXG4gICAgICAgIGVtYWlsOiBhdHRycy5lbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBmdWxsTmFtZSxcbiAgICAgICAgc3RhdHVzOiB1LlVzZXJTdGF0dXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgcGFnaW5hdGlvblRva2VuID0gb3V0LlBhZ2luYXRpb25Ub2tlbjtcbiAgfSB3aGlsZSAocGFnaW5hdGlvblRva2VuKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgY291bnQ6IHVzZXJzLmxlbmd0aCwgdXNlcnMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudFBhZ2VWaWV3KCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJBREQgcGFnZVZpZXdzIDppbmMgU0VUIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6aW5jXCI6IHsgTjogXCIxXCIgfSxcbiAgICAgICAgXCI6dXBkYXRlZEF0XCI6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiBcIlVQREFURURfTkVXXCIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgcGFnZVZpZXdzOiBOdW1iZXIob3V0LkF0dHJpYnV0ZXM/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEZlYXR1cmVGbGFnc0ZvclVzZXIodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZnJvbURiID0gKG91dC5JdGVtcyA/PyBbXSkucmVkdWNlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PigoYWNjLCBpdGVtKSA9PiB7XG4gICAgY29uc3QgZmxhZyA9IGl0ZW0uZmxhZz8uUztcbiAgICBjb25zdCBlbmFibGVkUmF3ID0gaXRlbS5lbmFibGVkPy5CT09MO1xuICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgZW5hYmxlZFJhdyA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgIGFjY1tmbGFnXSA9IGVuYWJsZWRSYXc7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICBjb25zdCBzZXJ2ZXJEZWZhdWx0czogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcbiAgY29uc3QgcGhvdG9Gb29kID0gZW52RmxhZ1RyaVN0YXRlKFwiRkZfUEhPVE9fRk9PRF9MT0dcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX1BIT1RPX0ZPT0RfTE9HID0gcGhvdG9Gb29kICE9PSBmYWxzZTtcbiAgY29uc3QgbWVhbExpYnJhcnkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9NRUFMX0xJQlJBUllcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX01FQUxfTElCUkFSWSA9IG1lYWxMaWJyYXJ5ICE9PSBmYWxzZTtcbiAgY29uc3QgbmxNZWFsUGFyc2UgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9OTF9NRUFMX1BBUlNFXCIpO1xuICBzZXJ2ZXJEZWZhdWx0cy5GRl9OTF9NRUFMX1BBUlNFID0gbmxNZWFsUGFyc2UgIT09IGZhbHNlO1xuICBjb25zdCBib2R5Q29tcGFyZUFpID0gZW52RmxhZ1RyaVN0YXRlKFwiRkZfQk9EWV9DT01QQVJFX0FJXCIpO1xuICBzZXJ2ZXJEZWZhdWx0cy5GRl9CT0RZX0NPTVBBUkVfQUkgPSBib2R5Q29tcGFyZUFpICE9PSBmYWxzZTtcbiAgY29uc3QgcGVyc29uYWxpemVkQ29hY2hpbmcgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QRVJTT05BTElaRURfQUlfQ09BQ0hJTkdcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX1BFUlNPTkFMSVpFRF9BSV9DT0FDSElORyA9IHBlcnNvbmFsaXplZENvYWNoaW5nICE9PSBmYWxzZTtcblxuICBjb25zdCBvdmVycmlkZXMgPSB7IC4uLnNlcnZlckRlZmF1bHRzLCAuLi5mcm9tRGIgfTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IHVzZXJJZCwgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0RmVhdHVyZUZsYWdPdmVycmlkZXMoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRhcmdldFVzZXJJZCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkO1xuICBpZiAoIXRhcmdldFVzZXJJZCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJNaXNzaW5nIHVzZXJJZCBxdWVyeSBwYXJhbWV0ZXJcIiB9KTtcbiAgfVxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHRhcmdldFVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3Qgb3ZlcnJpZGVzID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKChpdGVtKSA9PiAoe1xuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdGFyZ2V0VXNlcklkLFxuICAgIGZsYWc6IGl0ZW0uZmxhZz8uUyA/PyBcIlwiLFxuICAgIGVuYWJsZWQ6IGl0ZW0uZW5hYmxlZD8uQk9PTCA/PyBmYWxzZSxcbiAgICB0czogaXRlbS50cz8uUyA/PyBcIlwiLFxuICB9KSk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEZlYXR1cmVGbGFnT3ZlcnJpZGUoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgdXNlcklkID0gdHlwZW9mIGJvZHkudXNlcklkID09PSBcInN0cmluZ1wiID8gYm9keS51c2VySWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgcmF3RmxhZyA9IHR5cGVvZiBib2R5LmZsYWcgPT09IFwic3RyaW5nXCIgPyBib2R5LmZsYWcudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgZW5hYmxlZCA9IHR5cGVvZiBib2R5LmVuYWJsZWQgPT09IFwiYm9vbGVhblwiID8gYm9keS5lbmFibGVkIDogbnVsbDtcbiAgaWYgKCF1c2VySWQgfHwgIXJhd0ZsYWcgfHwgZW5hYmxlZCA9PT0gbnVsbCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBheWxvYWQuIEV4cGVjdGVkIHVzZXJJZCwgZmxhZywgZW5hYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBub3JtYWxpemVkRmxhZyA9IHJhd0ZsYWcuc3RhcnRzV2l0aChcIkZGX1wiKSA/IHJhd0ZsYWcgOiBgRkZfJHtyYXdGbGFnfWA7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZmxhZzogeyBTOiBub3JtYWxpemVkRmxhZyB9LFxuICAgICAgICBlbmFibGVkOiB7IEJPT0w6IGVuYWJsZWQgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgb3ZlcnJpZGU6IHsgdXNlcklkLCBmbGFnOiBub3JtYWxpemVkRmxhZywgZW5hYmxlZCwgdHMgfSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHVzZXJJZCA9IGdldFVzZXJJZChldmVudCk7XG4gICAgaWYgKCF1c2VySWQpIHJldHVybiBqc29uKDQwMSwgeyBlcnJvcjogXCJVbmF1dGhvcml6ZWRcIiB9KTtcbiAgICBjb25zdCBtZXRob2QgPSAoXG4gICAgICBldmVudCBhcyB7IHJlcXVlc3RDb250ZXh0PzogeyBodHRwPzogeyBtZXRob2Q/OiBzdHJpbmcgfSB9IH1cbiAgICApLnJlcXVlc3RDb250ZXh0Py5odHRwPy5tZXRob2Q7XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZW50cmllc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRFbnRyaWVzKHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgICAgcmV0dXJuIHVwc2VydEVudHJ5KHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgICByZXR1cm4gZGVsZXRlRW50cnkodXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zZXR0aW5nc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRTZXR0aW5ncyh1c2VySWQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICAgIHJldHVybiBwYXRjaFNldHRpbmdzKHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRJbnNpZ2h0c1YyKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2VzdGltYXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZEVzdGltYXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBzMyxcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUsXG4gICAgICAgIHBob3RvQnVja2V0TmFtZTogYnVja2V0LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTG9nQ29uZmlybSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2VzdGltYXRlLWJ1cm5cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaGFuZGxlVjJBY3Rpdml0eUVzdGltYXRlQnVybihldmVudCk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9sb2dcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlMb2codXNlcklkLCBldmVudCwgeyBkZGIsIGVudHJpZXNUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvY2FsaWJyYXRpb25cIiAmJiBtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlDYWxpYnJhdGlvblBhdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBzZXR0aW5nc1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9lbmVyZ3ktd2Vla2x5LXN1bW1hcnlcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGVUID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gICAgICBjb25zdCBkVCA9IGdldFJlcXVpcmVkRW52KFwiREFZX01FQUxfRU5UUklFU19UQUJMRV9OQU1FXCIsIGRheU1lYWxFbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIGNvbnN0IHNUID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkVuZXJneVdlZWtseVN1bW1hcnkodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGVudHJpZXNUYWJsZU5hbWU6IGVULFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIHNldHRpbmdzVGFibGVOYW1lOiBzVCxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvcHJvZ3Jlc3MtcGhvdG9zXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gbGlzdFByb2dyZXNzUGhvdG9zKHVzZXJJZCk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9wcm9ncmVzcy1waG90b3NcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlUHJvZ3Jlc3NQaG90byh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3Byb2dyZXNzLXBob3Rvcy9hc3Nlc3NtZW50XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGFzc2Vzc1Byb2dyZXNzUGhvdG9zKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cbiAgICBjb25zdCBwcm9ncmVzc0RlbE1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvcHJvZ3Jlc3MtcGhvdG9zXFwvKFteL10rKSQvKTtcbiAgICBpZiAocHJvZ3Jlc3NEZWxNYXRjaCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIHJldHVybiBkZWxldGVQcm9ncmVzc1Bob3RvKHVzZXJJZCwgZGVjb2RlVVJJQ29tcG9uZW50KHByb2dyZXNzRGVsTWF0Y2hbMV0gPz8gXCJcIikpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL21lYWwtY29tcGxldGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBmb29kVCA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWZvb2RUIHx8ICFtVCB8fCAhZFQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogZm9vZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzL3N1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0xpc3QodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHNcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0NyZWF0ZSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxIaXN0b3J5TWF0Y2ggPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKylcXC9oaXN0b3J5JC8pO1xuICAgIGlmIChtZWFsSGlzdG9yeU1hdGNoICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0hpc3RvcnkodXNlcklkLCBtZWFsSGlzdG9yeU1hdGNoWzFdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1lYWxQYXRjaERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL21lYWxzXFwvKFteL10rKSQvKTtcbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzUGF0Y2godXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cbiAgICBpZiAobWVhbFBhdGNoRGVsICYmIG1lYWxQYXRjaERlbFsxXSAhPT0gXCJzdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc0RlbGV0ZSh1c2VySWQsIG1lYWxQYXRjaERlbFsxXSwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXlNZWFsTGlzdE9yQ3JlYXRlID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvZGF5c1xcLyhbXFxkLV0rKVxcL21lYWwtZW50cmllcyQvKTtcbiAgICBpZiAoZGF5TWVhbExpc3RPckNyZWF0ZSAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNMaXN0KHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUIHx8ICFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNDcmVhdGUodXNlcklkLCBkYXlNZWFsTGlzdE9yQ3JlYXRlWzFdLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgICAgbWVhbHNUYWJsZU5hbWU6IG1ULFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbERlbCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXNcXC8oW14vXSspJC8pO1xuICAgIGlmIChkYXlNZWFsRGVsICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUodXNlcklkLCBkYXlNZWFsRGVsWzFdLCBkYXlNZWFsRGVsWzJdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2ZlYXR1cmUtZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19