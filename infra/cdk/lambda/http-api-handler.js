"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const node_crypto_1 = require("node:crypto");
const s3Uri_1 = require("../../../lib/food/s3Uri");
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
    return json(200, { insights });
}
async function saveInsightFeedback(userId, event) {
    const tableName = getRequiredEnv("INSIGHT_FEEDBACK_TABLE_NAME", insightFeedbackTableName);
    const payload = parseJsonBody(event);
    if (!payload || typeof payload !== "object")
        return json(400, { error: "Body must be an object" });
    const body = payload;
    const insightId = typeof body.insightId === "string" ? body.insightId.trim() : "";
    const vote = body.vote === "up" || body.vote === "down" ? body.vote : null;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE4cERBLDBCQWdOQztBQTkyREQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZDQUF5QztBQUN6QyxtREFNaUM7QUFFakMseURBQTJEO0FBQzNELGlEQUE4RTtBQUM5RSxpREFLd0I7QUFDeEIsMkNBV3FCO0FBRXJCLE1BQU0sR0FBRyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxnRUFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUV6RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sd0JBQXdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN6RSxNQUFNLDZCQUE2QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUM7QUFDcEYsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztBQUN0RCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDeEUsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQztBQUNwRCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDeEUsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDO0FBQ3ZFLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksS0FBSyxDQUFDLENBQUM7QUFDaEYsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsSUFBSSxNQUFNLENBQUMsQ0FBQztBQUNyRixNQUFNLG1CQUFtQixHQUFHLFVBQVUsQ0FBQztBQUN2QyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztBQTRGL0MsU0FBUyxJQUFJLENBQUMsVUFBa0IsRUFBRSxPQUFnQjtJQUNoRCxPQUFPO1FBQ0wsVUFBVTtRQUNWLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRTtRQUMvQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7S0FDOUIsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxJQUFZLEVBQUUsS0FBeUI7SUFDN0QsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBZ0I7SUFDckMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFDM0IsSUFBSSxDQUFDO1FBQ0gsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUNsQyxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLEtBQWM7SUFDbEMsT0FBTyxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUkscUJBQXFCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3hFLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxJQUFZO0lBQ25DLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsSUFBSSxDQUFDLEtBQUssTUFBTTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzlCLElBQUksQ0FBQyxLQUFLLE9BQU87UUFBRSxPQUFPLEtBQUssQ0FBQztJQUNoQyxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBUyw0QkFBNEI7SUFDbkMsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixLQUFLLE9BQU8sQ0FBQztBQUNwRCxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFjO0lBQ3RDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxLQUFjO0lBQ3pDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQztBQUMzRSxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxLQUFjO0lBQ3RDLE9BQU8sTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUMvRCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBYztJQUNuQyxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3hDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO0lBQ3hELENBQUM7SUFFRCxNQUFNLElBQUksR0FBRyxLQUFnQyxDQUFDO0lBQzlDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUMxRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO0lBQ2hHLElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFNBQVM7UUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztJQUMxRixJQUFJLE9BQU8sSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTO1FBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDNUYsSUFBSSxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUztRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO0lBQ3RGLElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVM7UUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztJQUV0RixJQUNFLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUztRQUM5QixJQUFJLENBQUMsV0FBVyxLQUFLLElBQUk7UUFDekIsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQ25DLENBQUM7UUFDRCxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0lBRUQsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFNBQVMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQ3BFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0lBQ2xELENBQUM7SUFDRCxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDbEUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUM7SUFDakQsQ0FBQztJQUNELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUM5RCxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUNELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNqRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUVELElBQ0UsSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTO1FBQzNCLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSTtRQUN0QixDQUFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsTUFBTyxDQUFDLEVBQ3JFLENBQUM7UUFDRCxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0lBQ0QsSUFDRSxJQUFJLENBQUMsS0FBSyxLQUFLLFNBQVM7UUFDeEIsSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJO1FBQ25CLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxJQUFLLENBQUMsRUFDN0QsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsQ0FBQztJQUMvQyxDQUFDO0lBQ0QsSUFDRSxJQUFJLENBQUMsWUFBWSxLQUFLLFNBQVM7UUFDL0IsQ0FBQyxPQUFPLElBQUksQ0FBQyxZQUFZLEtBQUssUUFBUSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxFQUN6RSxDQUFDO1FBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLENBQUM7SUFDdEQsQ0FBQztJQUNELElBQ0UsSUFBSSxDQUFDLGVBQWUsS0FBSyxTQUFTO1FBQ2xDLENBQUMsT0FBTyxJQUFJLENBQUMsZUFBZSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsRUFDL0UsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFDRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO1FBQ3BGLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO0lBQzFELENBQUM7SUFDRCxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssU0FBUyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDbEYsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLENBQUM7SUFDekQsQ0FBQztJQUNELElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztRQUMxRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0lBQ0QsSUFDRSxJQUFJLENBQUMsa0JBQWtCLEtBQUssU0FBUztRQUNyQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksSUFBSSxDQUFDLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxFQUNoRixDQUFDO1FBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLENBQUM7SUFDNUQsQ0FBQztJQUVELE9BQU87UUFDTCxFQUFFLEVBQUUsSUFBSTtRQUNSLElBQUksRUFBRTtZQUNKLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtZQUNqQyxXQUFXLEVBQUcsSUFBSSxDQUFDLFdBQXlDLElBQUksU0FBUztZQUN6RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQThCO1lBQzdDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBNkI7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUEyQjtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQTJCO1lBQ3ZDLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBb0I7WUFDcEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFxQjtZQUN0QyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQWtCO1lBQ2hDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBa0I7WUFDaEMsUUFBUSxFQUFHLElBQUksQ0FBQyxRQUFzQyxJQUFJLFNBQVM7WUFDbkUsS0FBSyxFQUFHLElBQUksQ0FBQyxLQUFtQyxJQUFJLFNBQVM7WUFDN0QsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFrQztZQUNyRCxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQXFDO1lBQzNELGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBc0M7WUFDN0QsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFpQztZQUNuRCxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQXFDO1lBQzNELGtCQUFrQixFQUFFLElBQUksQ0FBQyxrQkFBd0M7U0FDbEU7S0FDRixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsS0FBYztJQUN0QyxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3hDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO0lBQ3hELENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxLQUFnQyxDQUFDO0lBQzlDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDMUYsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7UUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztJQUM1RixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7UUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztJQUN0RixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSztRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUMzRixJQUNFLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUztRQUN2QixJQUFJLENBQUMsSUFBSSxLQUFLLFVBQVU7UUFDeEIsSUFBSSxDQUFDLElBQUksS0FBSyxVQUFVO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEtBQUssWUFBWTtRQUMxQixJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFDekIsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUM5QyxDQUFDO0lBQ0QsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFNBQVMsSUFBSSxPQUFPLElBQUksQ0FBQyxhQUFhLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDaEYsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7SUFDdkQsQ0FBQztJQUNELElBQ0UsSUFBSSxDQUFDLG1CQUFtQixLQUFLLFNBQVM7UUFDdEMsQ0FBQyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFDdEYsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw2QkFBNkIsRUFBRSxDQUFDO0lBQzdELENBQUM7SUFDRCxJQUNFLElBQUksQ0FBQywwQkFBMEIsS0FBSyxTQUFTO1FBQzdDLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixLQUFLLFNBQVMsRUFDcEQsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxvQ0FBb0MsRUFBRSxDQUFDO0lBQ3BFLENBQUM7SUFDRCxPQUFPO1FBQ0wsRUFBRSxFQUFFLElBQUk7UUFDUixJQUFJLEVBQUU7WUFDSixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDM0IsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQzdCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUMzQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQTZCO1lBQ3hDLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBb0M7WUFDeEQsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLG1CQUF5QztZQUNuRSwwQkFBMEIsRUFBRSxJQUFJLENBQUMsMEJBQWlEO1NBQ25GO0tBQ0YsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxLQUFnQjtJQUNwQyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDO0lBQzFELElBQUksR0FBRyxJQUFJLElBQUk7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUNsQyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFZLENBQUM7WUFDMUMsSUFBSSxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxPQUFPLE1BQWlDLENBQUM7WUFDM0MsQ0FBQztZQUNELE9BQU8sU0FBUyxDQUFDO1FBQ25CLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCxPQUFPLFNBQVMsQ0FBQztRQUNuQixDQUFDO0lBQ0gsQ0FBQztJQUNELElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ25ELE9BQU8sR0FBOEIsQ0FBQztJQUN4QyxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELFNBQVMsU0FBUyxDQUFDLEtBQWdCO0lBQ2pDLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDckMsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQ25ELENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLE1BQTJDO0lBQ3pFLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztJQUNoQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFO1FBQUUsT0FBTyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbkUsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQztJQUN6QixJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUM1QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFDLE9BQU8sS0FBSyxJQUFJLFNBQVMsQ0FBQztJQUM1QixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQzlCLElBQTREO0lBRTVELElBQUksQ0FBQyxJQUFJO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDNUIsTUFBTSxHQUFHLEdBQXdCLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUM7SUFDL0MsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQztJQUN4QyxJQUFJLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQixJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQUUsR0FBRyxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBQ0QsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7UUFDakIsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFBRSxHQUFHLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFDRCxJQUFJLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQixJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQUUsR0FBRyxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQ3ZELENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUNqQyxHQUFZO0lBRVosSUFBSSxDQUFDLEdBQUcsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzFELE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxDQUFDO0lBQzNELENBQUM7SUFDRCxNQUFNLENBQUMsR0FBRyxHQUE4QixDQUFDO0lBQ3pDLE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7SUFDckMsSUFBSSxDQUFDLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDdEMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsRUFBRSxDQUFDO1FBQzFGLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUNELElBQUksQ0FBQyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsb0NBQW9DLEVBQUUsQ0FBQztRQUMzRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUNyQyxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLENBQUM7UUFDekYsSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQ0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFDNUIsQ0FBQztBQUVELHlHQUF5RztBQUN6RyxTQUFTLDJCQUEyQixDQUFDLEtBQWE7SUFDaEQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3pDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbEMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2pDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ25DLElBQUksTUFBTSxLQUFLLFdBQVcsSUFBSSxNQUFNLEtBQUssZ0JBQWdCLEVBQUUsQ0FBQztRQUMxRCxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRSxPQUFPLEdBQUcsU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLDJCQUEyQjtJQUNsQyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQztJQUNyRSxNQUFNLEtBQUssR0FBRyxHQUFHO1NBQ2QsS0FBSyxDQUFDLEdBQUcsQ0FBQztTQUNWLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7U0FDakQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25CLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNCLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNuQixHQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUM7QUFDYixDQUFDO0FBRUQsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLENBQVUsQ0FBQztBQUVsRyxTQUFTLDhCQUE4QixDQUFDLE1BQStCO0lBQ3JFLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUMzQixNQUFNLFFBQVEsR0FBRyw0QkFBNEIsQ0FBQztJQUM5QyxLQUFLLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDbkMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNyRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7SUFDSCxDQUFDO0lBQ0QsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDdEMsSUFBSSxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQ3JELEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDckMsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFFRCxpR0FBaUc7QUFDakcsU0FBUyxhQUFhLENBQUMsS0FBZ0I7SUFDckMsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25DLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxLQUFLLENBQUM7SUFDMUIsTUFBTSxLQUFLLEdBQUcsMkJBQTJCLEVBQUUsQ0FBQztJQUM1QyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ25DLE1BQU0sVUFBVSxHQUFHLDhCQUE4QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzFELEtBQUssTUFBTSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUM7UUFDM0IsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7SUFDN0QsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUNsQixPQUF1RCxFQUN2RCxJQUFZO0lBRVosSUFBSSxDQUFDLE9BQU87UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUMvQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDaEMsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxJQUFJLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEUsT0FBTyxDQUFDLENBQUM7UUFDWCxDQUFDO0lBQ0gsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLGlCQUFpQixDQUFDLEtBQWdCO0lBQ3pDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7SUFDeEIsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3hELElBQUksTUFBTSxFQUFFLElBQUksRUFBRTtRQUFFLE9BQU8sTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3pDLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDNUMsSUFBSSxDQUFDLEdBQUc7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUMzQixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDeEMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQztBQUN4QixDQUFDO0FBRUQsbUdBQW1HO0FBQ25HLEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxLQUFnQjtJQUMvQyxNQUFNLEtBQUssR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxJQUFJLENBQUMsS0FBSztRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQ3pCLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoQyxJQUFJLENBQUMsTUFBTTtRQUFFLE9BQU8sS0FBSyxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLDJCQUEyQixFQUFFLENBQUM7SUFDNUMsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUNuQyxJQUFJLENBQUM7UUFDSCxNQUFNLEdBQUcsR0FBRyxNQUFNLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxpREFBYyxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RSxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUN2QyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQztRQUM1RCxJQUFJLFFBQVEsS0FBSyxNQUFNO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDdEMsTUFBTSxLQUFLLEdBQ1QsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsRUFBRSxLQUFLO1lBQzVDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssb0JBQW9CLENBQUMsRUFBRSxLQUFLLENBQUM7UUFDNUQsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUM1RSxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQUssSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckUsSUFBSSxDQUFDLFNBQVM7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUM3QixPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssVUFBVSxjQUFjLENBQUMsS0FBZ0I7SUFDNUMsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDdEMsT0FBTyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNsQyxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUM3QixPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ3RDLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLFFBQW1DO0lBQ2xFLElBQUksQ0FBQyxRQUFRLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUTtRQUFFLE9BQU8sU0FBUyxDQUFDO0lBQ2hFLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUNsRCxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzlCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxPQUFPO1lBQUUsT0FBTyxTQUFTLENBQUM7UUFDL0IsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNwQixPQUFPLFFBQVEsZUFBZSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0lBQ0QsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUMzQyxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sU0FBUyxDQUFDO1FBRTVCLGlFQUFpRTtRQUNqRSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFDN0UsSUFBSSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sUUFBUSxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7UUFDNUMsQ0FBQztRQUVELHNEQUFzRDtRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDOUQsSUFBSSxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sUUFBUSxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7UUFDM0MsQ0FBQztRQUVELHVEQUF1RDtRQUN2RCxJQUFJLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztZQUNuRixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hDLElBQUksS0FBSyxJQUFJLENBQUM7Z0JBQUUsT0FBTyxTQUFTLENBQUM7WUFDakMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEdBQUc7Z0JBQUUsT0FBTyxTQUFTLENBQUM7WUFDdEMsT0FBTyxRQUFRLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNqQyxDQUFDO0lBQ0gsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNQLE9BQU8sU0FBUyxDQUFDO0lBQ25CLENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQTZCLElBQVM7SUFDMUQsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDaEUsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLE1BQWdCO0lBQy9CLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO0FBQ3ZFLENBQUM7QUFFRCxTQUFTLE1BQU0sQ0FBQyxLQUFhO0lBQzNCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQ3ZDLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUN4QixJQUFtQixFQUNuQixTQUF3QztJQUV4QyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkMsTUFBTSxPQUFPLEdBQWEsRUFBRSxDQUFDO0lBQzdCLE1BQU0sUUFBUSxHQUFhLEVBQUUsQ0FBQztJQUM5QixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3BELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUM7UUFDeEUsSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzs7WUFDM0MsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQ0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUMvQixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsSUFBbUI7SUFDeEMsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMvRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzNELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNwQyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEMsSUFBSSxVQUFVLElBQUksSUFBSSxJQUFJLFdBQVcsSUFBSSxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0QsTUFBTSxNQUFNLEdBQUcsVUFBVSxHQUFHLFdBQVcsQ0FBQztJQUN4QyxJQUFJLE1BQU0sSUFBSSxHQUFHO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDL0IsT0FBTztRQUNMLEVBQUUsRUFBRSxlQUFlLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksSUFBSSxTQUFTLEVBQUU7UUFDN0QsTUFBTSxFQUFFLFlBQVk7UUFDcEIsUUFBUSxFQUFFLEVBQUU7UUFDWixRQUFRLEVBQUUsZ0VBQWdFO1FBQzFFLE1BQU0sRUFBRSxnQkFBZ0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtREFBbUQ7UUFDekYsR0FBRyxFQUFFO1lBQ0gsR0FBRyxPQUFPLENBQUMsTUFBTSx1Q0FBdUM7WUFDeEQscURBQXFELE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSztZQUM1RSxrQ0FBa0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLO1NBQzNEO1FBQ0QsTUFBTSxFQUFFLDJDQUEyQztRQUNuRCxRQUFRLEVBQUUsUUFBUTtLQUNuQixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLElBQW1CO0lBQ3pDLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDNUUsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUMzRCxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RDLElBQUksVUFBVSxJQUFJLElBQUksSUFBSSxXQUFXLElBQUksSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzNELE1BQU0sTUFBTSxHQUFHLFVBQVUsR0FBRyxXQUFXLENBQUM7SUFDeEMsSUFBSSxNQUFNLElBQUksR0FBRztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQy9CLE9BQU87UUFDTCxFQUFFLEVBQUUsZ0JBQWdCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksSUFBSSxTQUFTLEVBQUU7UUFDOUQsTUFBTSxFQUFFLFNBQVM7UUFDakIsUUFBUSxFQUFFLEVBQUU7UUFDWixRQUFRLEVBQUUsbURBQW1EO1FBQzdELE1BQU0sRUFBRSxnQkFBZ0IsTUFBTSxDQUFDLE1BQU0sQ0FBQywrQ0FBK0M7UUFDckYsR0FBRyxFQUFFO1lBQ0gsR0FBRyxPQUFPLENBQUMsTUFBTSwwQ0FBMEM7WUFDM0QsK0NBQStDLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSztZQUN0RSxrQ0FBa0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLO1NBQzNEO1FBQ0QsTUFBTSxFQUFFLHNEQUFzRDtRQUM5RCxRQUFRLEVBQUUsU0FBUztLQUNwQixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsSUFBbUI7SUFDM0MsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5RSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzNELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNwQyxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEMsSUFBSSxVQUFVLElBQUksSUFBSSxJQUFJLFdBQVcsSUFBSSxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0QsTUFBTSxNQUFNLEdBQUcsVUFBVSxHQUFHLFdBQVcsQ0FBQztJQUN4QyxJQUFJLE1BQU0sSUFBSSxHQUFHO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDL0IsT0FBTztRQUNMLEVBQUUsRUFBRSxtQkFBbUIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxJQUFJLFNBQVMsRUFBRTtRQUNqRSxNQUFNLEVBQUUsV0FBVztRQUNuQixRQUFRLEVBQUUsRUFBRTtRQUNaLFFBQVEsRUFBRSxzRUFBc0U7UUFDaEYsTUFBTSxFQUFFLDRCQUE0QixNQUFNLENBQUMsTUFBTSxDQUFDLCtDQUErQztRQUNqRyxHQUFHLEVBQUU7WUFDSCxHQUFHLE9BQU8sQ0FBQyxNQUFNLHNDQUFzQztZQUN2RCxpREFBaUQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLO1lBQ3hFLGtDQUFrQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUs7U0FDM0Q7UUFDRCxNQUFNLEVBQUUsNkNBQTZDO1FBQ3JELFFBQVEsRUFBRSxZQUFZO0tBQ3ZCLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxVQUFrQixFQUFFLFVBQWtCO0lBQ3JFLE9BQU87UUFDTCxFQUFFLEVBQUUsb0JBQW9CLFVBQVUsRUFBRTtRQUNwQyxNQUFNLEVBQUUsVUFBVTtRQUNsQixRQUFRLEVBQUUsRUFBRTtRQUNaLFFBQVEsRUFBRSxxRUFBcUU7UUFDL0UsTUFBTSxFQUNKLDZGQUE2RjtRQUMvRixHQUFHLEVBQUU7WUFDSCxHQUFHLFVBQVUsc0NBQXNDO1lBQ25ELDJDQUEyQztTQUM1QztRQUNELE1BQU0sRUFBRSxpRkFBaUY7UUFDekYsUUFBUSxFQUFFLFFBQVE7S0FDbkIsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLFFBQWdCO0lBQzdDLE9BQU87UUFDTCxFQUFFLEVBQUUsb0JBQW9CLFFBQVEsRUFBRTtRQUNsQyxNQUFNLEVBQUUsVUFBVTtRQUNsQixRQUFRLEVBQUUsRUFBRTtRQUNaLFFBQVEsRUFBRSxrRUFBa0U7UUFDNUUsTUFBTSxFQUFFLHdGQUF3RjtRQUNoRyxHQUFHLEVBQUUsQ0FBQyxzQ0FBc0MsQ0FBQztRQUM3QyxNQUFNLEVBQUUsMENBQTBDO1FBQ2xELFFBQVEsRUFBRSxRQUFRO0tBQ25CLENBQUM7QUFDSixDQUFDO0FBRUQsS0FBSyxVQUFVLGFBQWEsQ0FBQyxNQUFjLEVBQUUsTUFBaUI7SUFDNUQsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDekUsTUFBTSxFQUFFLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sUUFBUSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7SUFDNUIsUUFBUSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDMUMsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDakQsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUN4QixJQUFJLDhCQUFZLENBQUM7UUFDZixTQUFTLEVBQUUsU0FBUztRQUNwQixzQkFBc0IsRUFBRSwwREFBMEQ7UUFDbEYsd0JBQXdCLEVBQUUsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFO1FBQzdDLHlCQUF5QixFQUFFO1lBQ3pCLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUU7WUFDeEIsV0FBVyxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRTtZQUN4QixTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1NBQ3JCO1FBQ0QsZ0JBQWdCLEVBQUUsSUFBSTtRQUN0QixjQUFjLEVBQUUsSUFBSTtLQUNyQixDQUFDLENBQ0gsQ0FBQztJQUNGLE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQ3RDLENBQUMsSUFBZ0UsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRTtRQUN4QixhQUFhLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3pFLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDaEUsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUM3RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDdkQsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDeEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDMUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDcEMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLEtBQUs7S0FDckMsQ0FBQyxDQUNILENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFL0MsTUFBTSxhQUFhLEdBQUcsY0FBYyxDQUFDLHFCQUFxQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDL0UsTUFBTSxXQUFXLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUNoQyxJQUFJLGdDQUFjLENBQUM7UUFDakIsU0FBUyxFQUFFLGFBQWE7UUFDeEIsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQzlCLGNBQWMsRUFBRSxJQUFJO0tBQ3JCLENBQUMsQ0FDSCxDQUFDO0lBQ0YsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQztJQUMvQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2xFLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDcEUsTUFBTSxVQUFVLEdBQUcsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO0lBRTlDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx3Q0FBcUIsRUFBQyxHQUFHLEVBQUU7UUFDaEQsTUFBTTtRQUNOLFVBQVU7UUFDVixVQUFVO1FBQ1YsV0FBVztRQUNYLFVBQVU7UUFDVixpQkFBaUIsRUFBRSx1QkFBdUI7S0FDM0MsQ0FBQyxDQUFDO0lBQ0gsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsS0FBSyxVQUFVLG1CQUFtQixDQUFDLE1BQWMsRUFBRSxLQUFnQjtJQUNqRSxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsNkJBQTZCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztJQUMxRixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDckMsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRO1FBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztJQUNuRyxNQUFNLElBQUksR0FBRyxPQUFrQyxDQUFDO0lBQ2hELE1BQU0sU0FBUyxHQUFHLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNsRixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzNFLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLENBQUMsQ0FBQztJQUN6RixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ2hDLE1BQU0sT0FBTyxHQUNYLE9BQU8sVUFBVSxLQUFLLFFBQVEsSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUM7UUFDNUQsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQztRQUNsQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ2hCLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUMvRSxNQUFNLEVBQUUsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FDWixJQUFJLGdDQUFjLENBQUM7UUFDakIsU0FBUyxFQUFFLFNBQVM7UUFDcEIsSUFBSSxFQUFFO1lBQ0osTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRTtZQUNyQixTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksU0FBUyxFQUFFLEVBQUU7WUFDdEMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRTtZQUMzQixJQUFJLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFO1lBQ2pCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDYixHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDL0MsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxZQUFZLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1NBQy9EO0tBQ0YsQ0FBQyxDQUNILENBQUM7SUFDRixPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsS0FBSyxVQUFVLFVBQVUsQ0FBQyxNQUFjLEVBQUUsS0FBNEQ7SUFDcEcsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDekUsTUFBTSxJQUFJLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQztJQUN6QixNQUFNLEVBQUUsR0FBRyxLQUFLLEVBQUUsRUFBRSxDQUFDO0lBQ3JCLElBQUksSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7SUFDbEYsSUFBSSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQztJQUU1RSxNQUFNLGdCQUFnQixHQUFrQyxFQUFFLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDO0lBQ3JGLElBQUksWUFBWSxHQUFHLGtCQUFrQixDQUFDO0lBQ3RDLElBQUksSUFBSSxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ2YsWUFBWSxJQUFJLDBDQUEwQyxDQUFDO1FBQzNELGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDO1FBQzVDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzFDLENBQUM7U0FBTSxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ2hCLFlBQVksSUFBSSx5QkFBeUIsQ0FBQztRQUMxQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUM5QyxDQUFDO1NBQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUNkLFlBQVksSUFBSSx1QkFBdUIsQ0FBQztRQUN4QyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUN4QixJQUFJLDhCQUFZLENBQUM7UUFDZixTQUFTLEVBQUUsU0FBUztRQUNwQixzQkFBc0IsRUFBRSxZQUFZO1FBQ3BDLEdBQUcsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUNoQyxDQUFDLENBQUMsRUFBRSx3QkFBd0IsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNuRCxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ1AseUJBQXlCLEVBQUUsZ0JBQWdCO1FBQzNDLGdCQUFnQixFQUFFLElBQUk7UUFDdEIsY0FBYyxFQUFFLElBQUk7S0FDckIsQ0FBQyxDQUNILENBQUM7SUFFRixNQUFNLE9BQU8sR0FBa0IsQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FDbEQsQ0FBQyxJQUFnRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxHQUFHLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkQsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLE1BQU07UUFDaEMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUU7UUFDeEIsYUFBYSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakQsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN6RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ2hFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDN0QsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN2RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3hDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksSUFBSSxLQUFLO1FBQzFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQ2pDLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQy9DLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQ3JELGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDeEYsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN6RSxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3JGLGtCQUFrQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7S0FDN0YsQ0FBQyxDQUNILENBQUM7SUFFRixNQUFNLDBCQUEwQixHQUFrQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ2pFLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQzFCLE1BQU0sS0FBSyxHQUFHLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQztZQUNILE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xELE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUMsSUFBSSxVQUFVLElBQUksQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUNsQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUNsRCxNQUFNLEdBQUcsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNoRCxJQUFJLENBQUMsR0FBRztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUN2QixNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUEsbUNBQVksRUFDdkMsRUFBRSxFQUNGLElBQUksNEJBQWdCLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUNsRCxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxDQUNyQyxDQUFDO1lBQ0YsT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsQ0FBQztRQUNoRCxDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1AsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQ0gsQ0FBQztJQUVGLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQUVELEtBQUssVUFBVSxXQUFXLENBQUMsTUFBYyxFQUFFLEtBQWdCO0lBQ3pELE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3pFLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN4RixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ3pCLE1BQU0sRUFBRSxHQUFHLEdBQUcsTUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUVwQyxNQUFNLElBQUksR0FBNEI7UUFDcEMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRTtRQUNyQixJQUFJLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRTtRQUN0QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFO1FBQ2IsYUFBYSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUU7UUFDaEQsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUU7UUFDbkMsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUU7UUFDckMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDL0IsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUU7S0FDaEMsQ0FBQztJQUVGLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxTQUFTLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNoRSxJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0lBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFNBQVM7UUFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztJQUM5RSxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUztRQUFFLElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO0lBQzNFLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTO1FBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFD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LENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQge1xuICBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmLFxuICBndWVzc0Zvb2RJbWFnZU1lZGlhVHlwZSxcbiAgaXNVbnN1cHBvcnRlZEZvb2RJbWFnZUZvcm1hdCxcbiAgcGFyc2VTM1VyaSxcbiAgczNLZXlBbGxvd2VkRm9yVXNlcixcbn0gZnJvbSBcIi4uLy4uLy4uL2xpYi9mb29kL3MzVXJpXCI7XG5pbXBvcnQgdHlwZSB7IEFpSW5zaWdodFN0cnVjdHVyZWQgfSBmcm9tIFwiLi4vLi4vLi4vbGliL2luc2lnaHRzL2FpSW5zaWdodFN0cnVjdHVyZWRcIjtcbmltcG9ydCB7IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZCB9IGZyb20gXCIuL2luc2lnaHRzLWFpLWNhcmRcIjtcbmltcG9ydCB7IGhhbmRsZVYyRm9vZEVzdGltYXRlLCBoYW5kbGVWMkZvb2RMb2dDb25maXJtIH0gZnJvbSBcIi4vZm9vZC1sb2ctYXBpXCI7XG5pbXBvcnQge1xuICBoYW5kbGVWMkFjdGl2aXR5Q2FsaWJyYXRpb25QYXRjaCxcbiAgaGFuZGxlVjJBY3Rpdml0eUVzdGltYXRlQnVybixcbiAgaGFuZGxlVjJBY3Rpdml0eUxvZyxcbiAgaGFuZGxlVjJFbmVyZ3lXZWVrbHlTdW1tYXJ5LFxufSBmcm9tIFwiLi9hY3Rpdml0eS1hcGlcIjtcbmltcG9ydCB7XG4gIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNDcmVhdGUsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJpZXNMaXN0LFxuICBoYW5kbGVWMkRheU1lYWxFbnRyeURlbGV0ZSxcbiAgaGFuZGxlVjJGb29kTWVhbENvbXBsZXRlLFxuICBoYW5kbGVWMk1lYWxzQ3JlYXRlLFxuICBoYW5kbGVWMk1lYWxzRGVsZXRlLFxuICBoYW5kbGVWMk1lYWxzSGlzdG9yeSxcbiAgaGFuZGxlVjJNZWFsc0xpc3QsXG4gIGhhbmRsZVYyTWVhbHNQYXRjaCxcbiAgaGFuZGxlVjJNZWFsc1N1Z2dlc3RNYXRjaCxcbn0gZnJvbSBcIi4vbWVhbHMtYXBpXCI7XG5cbmNvbnN0IGRkYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7fSk7XG5jb25zdCBjb2duaXRvSWRwID0gbmV3IENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50KHt9KTtcblxuY29uc3QgZW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkVOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHNldHRpbmdzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuU0VUVElOR1NfVEFCTEVfTkFNRTtcbmNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRTtcbmNvbnN0IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FO1xuY29uc3QgcGhvdG9CdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUEhPVE9fQlVDS0VUX05BTUU7XG5jb25zdCBmb29kTG9nRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IG1lYWxzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuTUVBTFNfVEFCTEVfTkFNRTtcbmNvbnN0IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuREFZX01FQUxfRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3QgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5QUk9HUkVTU19QSE9UT1NfVEFCTEVfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xuICBhY3Rpdml0eVRleHQ/OiBzdHJpbmc7XG4gIGFjdGl2aXR5U3VtbWFyeT86IHN0cmluZztcbiAgYWN0aXZpdHlCdXJuS2NhbD86IG51bWJlcjtcbiAgYWN0aXZpdHlNZXQ/OiBudW1iZXI7XG4gIGFjdGl2aXR5TWludXRlcz86IG51bWJlcjtcbiAgYWN0aXZpdHlDb25maWRlbmNlPzogbnVtYmVyO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbiAgdG9uZT86IFwiZnJpZW5kbHlcIiB8IFwiY2xpbmljYWxcIiB8IFwidG91Z2gtbG92ZVwiIHwgXCJheXVydmVkaWNcIjtcbiAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj86IG51bWJlcjtcbiAgb3B0SW5Gb3JlY2FzdD86IGJvb2xlYW47XG4gIGZvcmVjYXN0R2VuZXJhdGVkQXQ/OiBzdHJpbmc7XG4gIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7XG4gIHJvbGxpbmdXaW5kb3dEYXlzPzogbnVtYmVyO1xuICBjb21wYXJpc29uU3BhbkRheXM/OiBudW1iZXI7XG4gIG1heEF2Z01vdmVtZW50S2c/OiBudW1iZXI7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xuICBhY3Rpb246IHN0cmluZztcbiAgY2F0ZWdvcnk6IFwic29kaXVtXCIgfCBcImFsY29ob2xcIiB8IFwibGF0ZV9zbmFja1wiIHwgXCJ3b3Jrb3V0XCIgfCBcInBsYXRlYXVcIiB8IFwic3RyZWFrXCIgfCBcInRyYWplY3RvcnlcIjtcbiAgZ2VuZXJhdGlvblNvdXJjZT86IFwibGxtXCIgfCBcInJ1bGVzXCI7XG4gIGdlbmVyYXRlZEF0Pzogc3RyaW5nO1xuICBzdHJ1Y3R1cmVkPzogQWlJbnNpZ2h0U3RydWN0dXJlZDtcbiAgZGVncmFkZWQ/OiBib29sZWFuO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnZGbGFnVHJpU3RhdGUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHYgPSBwcm9jZXNzLmVudltuYW1lXTtcbiAgaWYgKHYgPT09IFwidHJ1ZVwiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHYgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc0JvZHlDb21wYXJlQWlFbmFibGVkTGFtYmRhKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gcHJvY2Vzcy5lbnYuRkZfQk9EWV9DT01QQVJFX0FJICE9PSBcImZhbHNlXCI7XG59XG5cbmZ1bmN0aW9uIGlzUG9zaXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwO1xufVxuXG5mdW5jdGlvbiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5cbmZ1bmN0aW9uIGlzSW50Tm9uTmVnYXRpdmUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50cnkoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBEYWlseUVudHJ5VXBzZXJ0IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG5cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LmRhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5Lm1vcm5pbmdXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbW9ybmluZ1dlaWdodFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5sYXRlU25hY2sgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbGF0ZVNuYWNrXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmhpZ2hTb2RpdW0gIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgaGlnaFNvZGl1bVwiIH07XG4gIGlmICh0eXBlb2YgYm9keS53b3Jrb3V0ICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHdvcmtvdXRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuYWxjb2hvbCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhbGNvaG9sXCIgfTtcblxuICBpZiAoXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gbnVsbCAmJlxuICAgICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubmlnaHRXZWlnaHQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuaWdodFdlaWdodFwiIH07XG4gIH1cblxuICBpZiAoYm9keS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuY2Fsb3JpZXMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGNhbG9yaWVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5wcm90ZWluICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5wcm90ZWluKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwcm90ZWluXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zdGVwcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuc3RlcHMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0ZXBzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zbGVlcCAhPT0gdW5kZWZpbmVkICYmICFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuc2xlZXApKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHNsZWVwXCIgfTtcbiAgfVxuXG4gIGlmIChcbiAgICBib2R5LnBob3RvVXJsICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnBob3RvVXJsICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5LnBob3RvVXJsICE9PSBcInN0cmluZ1wiIHx8IGJvZHkucGhvdG9VcmwubGVuZ3RoID4gNjAwXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBob3RvVXJsXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5ub3RlcyAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5ub3RlcyAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5ub3RlcyAhPT0gXCJzdHJpbmdcIiB8fCBib2R5Lm5vdGVzLmxlbmd0aCA+IDJfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbm90ZXNcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5VGV4dCAhPT0gdW5kZWZpbmVkICYmXG4gICAgKHR5cGVvZiBib2R5LmFjdGl2aXR5VGV4dCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmFjdGl2aXR5VGV4dC5sZW5ndGggPiA1MDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eVRleHRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5U3VtbWFyeSAhPT0gdW5kZWZpbmVkICYmXG4gICAgKHR5cGVvZiBib2R5LmFjdGl2aXR5U3VtbWFyeSAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LmFjdGl2aXR5U3VtbWFyeS5sZW5ndGggPiA1MDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eVN1bW1hcnlcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5QnVybktjYWwgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmFjdGl2aXR5QnVybktjYWwpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5QnVybktjYWxcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5TWludXRlcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuYWN0aXZpdHlNaW51dGVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eU1pbnV0ZXNcIiB9O1xuICB9XG4gIGlmIChib2R5LmFjdGl2aXR5TWV0ICE9PSB1bmRlZmluZWQgJiYgIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5hY3Rpdml0eU1ldCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlNZXRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgKCFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuYWN0aXZpdHlDb25maWRlbmNlKSB8fCBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSA+IDEwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5Q29uZmlkZW5jZVwiIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGRhdGU6IGJvZHkuZGF0ZSxcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IGJvZHkubW9ybmluZ1dlaWdodCxcbiAgICAgIG5pZ2h0V2VpZ2h0OiAoYm9keS5uaWdodFdlaWdodCBhcyBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogYm9keS5jYWxvcmllcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBib2R5LnByb3RlaW4gYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGJvZHkuc3RlcHMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGJvZHkuc2xlZXAgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBib2R5LmxhdGVTbmFjayBhcyBib29sZWFuLFxuICAgICAgaGlnaFNvZGl1bTogYm9keS5oaWdoU29kaXVtIGFzIGJvb2xlYW4sXG4gICAgICB3b3Jrb3V0OiBib2R5LndvcmtvdXQgYXMgYm9vbGVhbixcbiAgICAgIGFsY29ob2w6IGJvZHkuYWxjb2hvbCBhcyBib29sZWFuLFxuICAgICAgcGhvdG9Vcmw6IChib2R5LnBob3RvVXJsIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIG5vdGVzOiAoYm9keS5ub3RlcyBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eVRleHQ6IGJvZHkuYWN0aXZpdHlUZXh0IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5U3VtbWFyeTogYm9keS5hY3Rpdml0eVN1bW1hcnkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlCdXJuS2NhbDogYm9keS5hY3Rpdml0eUJ1cm5LY2FsIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5TWV0OiBib2R5LmFjdGl2aXR5TWV0IGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5TWludXRlczogYm9keS5hY3Rpdml0eU1pbnV0ZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlDb25maWRlbmNlOiBib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTZXR0aW5ncyhpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IFNldHRpbmdzUGF0Y2ggfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5nb2FsV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGdvYWxXZWlnaHRcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5zdGFydFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGFydFdlaWdodFwiIH07XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkudGFyZ2V0RGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0YXJnZXREYXRlXCIgfTtcbiAgaWYgKGJvZHkudW5pdCAhPT0gXCJrZ1wiICYmIGJvZHkudW5pdCAhPT0gXCJsYnNcIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHVuaXRcIiB9O1xuICBpZiAoXG4gICAgYm9keS50b25lICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiZnJpZW5kbHlcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJjbGluaWNhbFwiICYmXG4gICAgYm9keS50b25lICE9PSBcInRvdWdoLWxvdmVcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJheXVydmVkaWNcIlxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdG9uZVwiIH07XG4gIH1cbiAgaWYgKGJvZHkub3B0SW5Gb3JlY2FzdCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBib2R5Lm9wdEluRm9yZWNhc3QgIT09IFwiYm9vbGVhblwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG9wdEluRm9yZWNhc3RcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5mb3JlY2FzdEdlbmVyYXRlZEF0ICE9PSBcInN0cmluZ1wiIHx8IGJvZHkuZm9yZWNhc3RHZW5lcmF0ZWRBdC5sZW5ndGggPiA2NClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGZvcmVjYXN0R2VuZXJhdGVkQXRcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5LmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkICE9PSB1bmRlZmluZWQgJiZcbiAgICB0eXBlb2YgYm9keS5mb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZCAhPT0gXCJib29sZWFuXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkXCIgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGJvZHkuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBib2R5LnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogYm9keS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogYm9keS51bml0LFxuICAgICAgdG9uZTogYm9keS50b25lIGFzIFNldHRpbmdzUGF0Y2hbXCJ0b25lXCJdLFxuICAgICAgb3B0SW5Gb3JlY2FzdDogYm9keS5vcHRJbkZvcmVjYXN0IGFzIGJvb2xlYW4gfCB1bmRlZmluZWQsXG4gICAgICBmb3JlY2FzdEdlbmVyYXRlZEF0OiBib2R5LmZvcmVjYXN0R2VuZXJhdGVkQXQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgICAgZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ6IGJvZHkuZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRKd3RDbGFpbXMoZXZlbnQ6IEh0dHBFdmVudCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgcmF3ID0gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/Lmp3dD8uY2xhaW1zO1xuICBpZiAocmF3ID09IG51bGwpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyB1bmtub3duO1xuICAgICAgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShyYXcpKSB7XG4gICAgcmV0dXJuIHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRVc2VySWQoZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHN1YiA9IGdldEp3dENsYWltcyhldmVudCk/LnN1YjtcbiAgcmV0dXJuIHR5cGVvZiBzdWIgPT09IFwic3RyaW5nXCIgPyBzdWIgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGZpcnN0TmFtZUZyb21Kd3RDbGFpbXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBnaXZlbiA9IGNsYWltcy5naXZlbl9uYW1lO1xuICBpZiAodHlwZW9mIGdpdmVuID09PSBcInN0cmluZ1wiICYmIGdpdmVuLnRyaW0oKSkgcmV0dXJuIGdpdmVuLnRyaW0oKTtcbiAgY29uc3QgbmFtZSA9IGNsYWltcy5uYW1lO1xuICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIgJiYgbmFtZS50cmltKCkpIHtcbiAgICBjb25zdCBmaXJzdCA9IG5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF07XG4gICAgcmV0dXJuIGZpcnN0IHx8IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShcbiAgaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+IHwgdW5kZWZpbmVkLFxuKTogUGxhdGVhdVVzZXJTZXR0aW5ncyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaXRlbSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgb3V0OiBQbGF0ZWF1VXNlclNldHRpbmdzID0ge307XG4gIGNvbnN0IHJ3ID0gaXRlbS5wbGF0ZWF1Um9sbGluZ1dpbmRvd0RheXM/Lk47XG4gIGNvbnN0IHNwYW4gPSBpdGVtLnBsYXRlYXVDb21wYXJpc29uU3BhbkRheXM/Lk47XG4gIGNvbnN0IG12ID0gaXRlbS5wbGF0ZWF1TWF4TW92ZW1lbnRLZz8uTjtcbiAgaWYgKHJ3ICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKHJ3KTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQucm9sbGluZ1dpbmRvd0RheXMgPSBuO1xuICB9XG4gIGlmIChzcGFuICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKHNwYW4pO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5jb21wYXJpc29uU3BhbkRheXMgPSBuO1xuICB9XG4gIGlmIChtdiAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihtdik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0Lm1heEF2Z01vdmVtZW50S2cgPSBuO1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhvdXQpLmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUGxhdGVhdVBhdGNoT2JqZWN0KFxuICByYXc6IHVua25vd24sXG4pOiB7IG9rOiB0cnVlOyBkYXRhOiBQbGF0ZWF1VXNlclNldHRpbmdzIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcInBsYXRlYXUgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IG8gPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGRhdGE6IFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7fTtcbiAgaWYgKG8ucm9sbGluZ1dpbmRvd0RheXMgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5yb2xsaW5nV2luZG93RGF5cyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1LnJvbGxpbmdXaW5kb3dEYXlzXCIgfTtcbiAgICBkYXRhLnJvbGxpbmdXaW5kb3dEYXlzID0gbjtcbiAgfVxuICBpZiAoby5jb21wYXJpc29uU3BhbkRheXMgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5jb21wYXJpc29uU3BhbkRheXMpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5jb21wYXJpc29uU3BhbkRheXNcIiB9O1xuICAgIGRhdGEuY29tcGFyaXNvblNwYW5EYXlzID0gbjtcbiAgfVxuICBpZiAoby5tYXhBdmdNb3ZlbWVudEtnICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8ubWF4QXZnTW92ZW1lbnRLZyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1Lm1heEF2Z01vdmVtZW50S2dcIiB9O1xuICAgIGRhdGEubWF4QXZnTW92ZW1lbnRLZyA9IG47XG4gIH1cbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGEgfTtcbn1cblxuLyoqIEdtYWlsIHRyZWF0cyBkb3RzIGFuZCArbGFiZWxzIGFzIGFsaWFzZXM7IG5vcm1hbGl6ZSBzbyBhZG1pbiBsaXN0IG1hdGNoZXMgcmVhbCBzaWduLWluIGlkZW50aXRpZXMuICovXG5mdW5jdGlvbiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goZW1haWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGxvd2VyID0gZW1haWwudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IGF0ID0gbG93ZXIubGFzdEluZGV4T2YoXCJAXCIpO1xuICBpZiAoYXQgPD0gMCkgcmV0dXJuIGxvd2VyO1xuICBjb25zdCBsb2NhbCA9IGxvd2VyLnNsaWNlKDAsIGF0KTtcbiAgY29uc3QgZG9tYWluID0gbG93ZXIuc2xpY2UoYXQgKyAxKTtcbiAgaWYgKGRvbWFpbiA9PT0gXCJnbWFpbC5jb21cIiB8fCBkb21haW4gPT09IFwiZ29vZ2xlbWFpbC5jb21cIikge1xuICAgIGNvbnN0IGJhc2VMb2NhbCA9IChsb2NhbC5zcGxpdChcIitcIilbMF0gPz8gbG9jYWwpLnJlcGxhY2UoL1xcLi9nLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7YmFzZUxvY2FsfUAke2RvbWFpbn1gO1xuICB9XG4gIHJldHVybiBsb3dlcjtcbn1cblxuZnVuY3Rpb24gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk6IFNldDxzdHJpbmc+IHtcbiAgY29uc3QgcmF3ID0gcHJvY2Vzcy5lbnYuQURNSU5fRU1BSUxTPy50cmltKCkgfHwgXCJ2aWhhcm5hckBnbWFpbC5jb21cIjtcbiAgY29uc3QgcGFydHMgPSByYXdcbiAgICAuc3BsaXQoXCIsXCIpXG4gICAgLm1hcCgocykgPT4gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKHMudHJpbSgpKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0KHBhcnRzKTtcbiAgaWYgKHNldC5zaXplID09PSAwKSB7XG4gICAgc2V0LmFkZChub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goXCJ2aWhhcm5hckBnbWFpbC5jb21cIikpO1xuICB9XG4gIHJldHVybiBzZXQ7XG59XG5cbmNvbnN0IEFETUlOX0NMQUlNX0tFWVMgPSBbXCJ1c2VybmFtZVwiLCBcImNvZ25pdG86dXNlcm5hbWVcIiwgXCJlbWFpbFwiLCBcInByZWZlcnJlZF91c2VybmFtZVwiXSBhcyBjb25zdDtcblxuZnVuY3Rpb24gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGZvdW5kOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBlbWFpbGlzaCA9IC9eW15cXHNAXStAW15cXHNAXStcXC5bXlxcc0BdKyQvO1xuICBmb3IgKGNvbnN0IGtleSBvZiBBRE1JTl9DTEFJTV9LRVlTKSB7XG4gICAgY29uc3QgdiA9IGNsYWltc1trZXldO1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCB2IG9mIE9iamVjdC52YWx1ZXMoY2xhaW1zKSkge1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFsuLi5uZXcgU2V0KGZvdW5kKV07XG59XG5cbi8qKiBUcnVlIGlmIEpXVCBjbGFpbXMgaW5jbHVkZSBhbiBlbWFpbCBpZGVudGl0eSB0aGF0IG1hdGNoZXMgdGhlIGNvbmZpZ3VyZWQgYWRtaW4gYWxsb3cgbGlzdC4gKi9cbmZ1bmN0aW9uIGlzQWRtaW5DYWxsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IGJvb2xlYW4ge1xuICBjb25zdCBjbGFpbXMgPSBnZXRKd3RDbGFpbXMoZXZlbnQpO1xuICBpZiAoIWNsYWltcykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltcyk7XG4gIGZvciAoY29uc3QgYyBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goYykpKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhlYWRlclZhbHVlKFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkLFxuICBuYW1lOiBzdHJpbmcsXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWhlYWRlcnMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IHdhbnQgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpKSB7XG4gICAgaWYgKGsudG9Mb3dlckNhc2UoKSA9PT0gd2FudCAmJiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2Lmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB2O1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEpXVCBIVFRQIEFQSSBhdXRob3JpemVycyB2YWxpZGF0ZSBBdXRob3JpemF0aW9uIGJ1dCB0eXBpY2FsbHkgZG8gbm90IGZvcndhcmQgdGhhdCBoZWFkZXIgdG8gTGFtYmRhLlxuICogQ2xpZW50cyBhbHNvIHNlbmQgeC1jb2duaXRvLWFjY2Vzcy10b2tlbiAoc2VlIGZyb250ZW5kLWFwaS1jbGllbnQpIHNvIHdlIGNhbiBjYWxsIGNvZ25pdG8taWRwOkdldFVzZXIuXG4gKi9cbmZ1bmN0aW9uIGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBoID0gZXZlbnQuaGVhZGVycztcbiAgY29uc3QgY3VzdG9tID0gaGVhZGVyVmFsdWUoaCwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCIpO1xuICBpZiAoY3VzdG9tPy50cmltKCkpIHJldHVybiBjdXN0b20udHJpbSgpO1xuICBjb25zdCByYXcgPSBoZWFkZXJWYWx1ZShoLCBcImF1dGhvcml6YXRpb25cIik7XG4gIGlmICghcmF3KSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBtID0gcmF3Lm1hdGNoKC9eQmVhcmVyXFxzKyguKykkL2kpO1xuICByZXR1cm4gbT8uWzFdPy50cmltKCk7XG59XG5cbi8qKiBXaGVuIGNsYWltcyBsYWNrIGEgcmVzb2x2YWJsZSBlbWFpbCwgdmVyaWZ5IGFkbWluIHZpYSBHZXRVc2VyOyB0b2tlbiBzdWIgbXVzdCBtYXRjaCBKV1Qgc3ViLiAqL1xuYXN5bmMgZnVuY3Rpb24gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBjb25zdCB0b2tlbiA9IGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50KTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBqd3RTdWIgPSBnZXRVc2VySWQoZXZlbnQpO1xuICBpZiAoIWp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICB0cnkge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChuZXcgR2V0VXNlckNvbW1hbmQoeyBBY2Nlc3NUb2tlbjogdG9rZW4gfSkpO1xuICAgIGNvbnN0IGF0dHJzID0gb3V0LlVzZXJBdHRyaWJ1dGVzID8/IFtdO1xuICAgIGNvbnN0IHRva2VuU3ViID0gYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInN1YlwiKT8uVmFsdWU7XG4gICAgaWYgKHRva2VuU3ViICE9PSBqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBlbWFpbCA9XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwiZW1haWxcIik/LlZhbHVlID8/XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwicHJlZmVycmVkX3VzZXJuYW1lXCIpPy5WYWx1ZTtcbiAgICBjb25zdCBmcm9tVXNlcm5hbWUgPSBvdXQuVXNlcm5hbWU/LmluY2x1ZGVzKFwiQFwiKSA/IG91dC5Vc2VybmFtZSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBjYW5kaWRhdGUgPSAoZW1haWwgPz8gZnJvbVVzZXJuYW1lID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghY2FuZGlkYXRlKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goY2FuZGlkYXRlKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluQWxsb3dlZChldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGlmIChpc0FkbWluQ2FsbGVyKGV2ZW50KSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBpc0FkbWluVmlhR2V0VXNlcihldmVudCk7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXREYXRlKCk6IHN0cmluZyB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICBkLnNldERhdGUoZC5nZXREYXRlKCkgKyAxMTgpO1xuICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocGhvdG9Vcmw6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIXBob3RvVXJsIHx8IHR5cGVvZiBwaG90b1VybCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHBob3RvVXJsLnN0YXJ0c1dpdGgoXCJzMzovL1wiKSkgcmV0dXJuIHBob3RvVXJsO1xuICBpZiAoIXBob3RvVXJsLmluY2x1ZGVzKFwiOi8vXCIpKSB7XG4gICAgY29uc3Qga2V5T25seSA9IHBob3RvVXJsLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gICAgaWYgKCFrZXlPbmx5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGlmIChwaG90b0J1Y2tldE5hbWUpIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3Bob3RvQnVja2V0TmFtZX0vJHtrZXlPbmx5fWA7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHBob3RvVXJsKTtcbiAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJzZWQucGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCBcIlwiKSk7XG4gICAgaWYgKCFwYXRoKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgLy8gVmlydHVhbC1ob3N0ZWQtc3R5bGUgVVJMOiBidWNrZXQuczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCB2aXJ0dWFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmICh2aXJ0dWFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3ZpcnR1YWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIExlZ2FjeSBnbG9iYWwgZW5kcG9pbnQ6IGJ1Y2tldC5zMy5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IGdsb2JhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKGdsb2JhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtnbG9iYWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIFBhdGgtc3R5bGUgVVJMOiBzMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2J1Y2tldC9rZXlcbiAgICBpZiAoL15zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8udGVzdChob3N0KSB8fCBob3N0ID09PSBcInMzLmFtYXpvbmF3cy5jb21cIikge1xuICAgICAgY29uc3Qgc2xhc2ggPSBwYXRoLmluZGV4T2YoXCIvXCIpO1xuICAgICAgaWYgKHNsYXNoIDw9IDApIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBidWNrZXQgPSBwYXRoLnNsaWNlKDAsIHNsYXNoKTtcbiAgICAgIGNvbnN0IGtleSA9IHBhdGguc2xpY2Uoc2xhc2ggKyAxKTtcbiAgICAgIGlmICghYnVja2V0IHx8ICFrZXkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICByZXR1cm4gYHMzOi8vJHtidWNrZXR9LyR7a2V5fWA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRCeURhdGVBc2M8VCBleHRlbmRzIHsgZGF0ZTogc3RyaW5nIH0+KHJvd3M6IFRbXSk6IFRbXSB7XG4gIHJldHVybiBbLi4ucm93c10uc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG59XG5cbmZ1bmN0aW9uIGF2ZXJhZ2UodmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB8IG51bGwge1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB2YWx1ZXMucmVkdWNlKChhY2MsIHZhbHVlKSA9PiBhY2MgKyB2YWx1ZSwgMCkgLyB2YWx1ZXMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiByb3VuZDIodmFsdWU6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnJvdW5kKHZhbHVlICogMTAwKSAvIDEwMDtcbn1cblxuZnVuY3Rpb24gbmV4dE1vcm5pbmdEZWx0YXMoXG4gIGxvZ3M6IFN0b3JlZEVudHJ5W10sXG4gIHByZWRpY2F0ZTogKGxvZzogU3RvcmVkRW50cnkpID0+IGJvb2xlYW4sXG4pOiB7IGZsYWdnZWQ6IG51bWJlcltdOyBiYXNlbGluZTogbnVtYmVyW10gfSB7XG4gIGNvbnN0IHNvcnRlZCA9IHNvcnRCeURhdGVBc2MobG9ncyk7XG4gIGNvbnN0IGZsYWdnZWQ6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGJhc2VsaW5lOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBzb3J0ZWQubGVuZ3RoIC0gMTsgaWR4ICs9IDEpIHtcbiAgICBjb25zdCBkZWx0YSA9IHNvcnRlZFtpZHggKyAxXS5tb3JuaW5nV2VpZ2h0IC0gc29ydGVkW2lkeF0ubW9ybmluZ1dlaWdodDtcbiAgICBpZiAocHJlZGljYXRlKHNvcnRlZFtpZHhdKSkgZmxhZ2dlZC5wdXNoKGRlbHRhKTtcbiAgICBlbHNlIGJhc2VsaW5lLnB1c2goZGVsdGEpO1xuICB9XG4gIHJldHVybiB7IGZsYWdnZWQsIGJhc2VsaW5lIH07XG59XG5cbmZ1bmN0aW9uIHNvZGl1bUluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5oaWdoU29kaXVtKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgc29kaXVtLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwic29kaXVtQnVtcFwiLFxuICAgIHByaW9yaXR5OiA5NSxcbiAgICBoZWFkbGluZTogXCJIaWdoLXNvZGl1bSBkYXlzIGFyZSBsaW5rZWQgdG8gaGVhdmllciBuZXh0LW1vcm5pbmcgd2VpZ2gtaW5zLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2cyB5b3VyIG5vbi1zb2RpdW0gYmFzZWxpbmUgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGhpZ2gtc29kaXVtIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIG9uIGhpZ2gtc29kaXVtIGRheXM6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJUcnkgb25lIGxvd2VyLXNvZGl1bSBkaW5uZXIgc3dhcCB0b25pZ2h0LlwiLFxuICAgIGNhdGVnb3J5OiBcInNvZGl1bVwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBhbGNvaG9sSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmFsY29ob2wpO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBhbGNvaG9sLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwiYWxjb2hvbFwiLFxuICAgIHByaW9yaXR5OiA5MCxcbiAgICBoZWFkbGluZTogXCJBbGNvaG9sIGRheXMgdGVuZCB0byBzaG93IGEgbmV4dC1kYXkgd2VpZ2h0IGJ1bXAuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZlcnN1cyBub24tYWxjb2hvbCBkYXlzIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBhbGNvaG9sLWxvZ2dlZCBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBhZnRlciBhbGNvaG9sOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiUGxhbiBhbGNvaG9sLWZyZWUgd2Vla2RheXMgZm9yIHN0ZWFkaWVyIHRyZW5kIGxpbmVzLlwiLFxuICAgIGNhdGVnb3J5OiBcImFsY29ob2xcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGF0ZVNuYWNrSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmxhdGVTbmFjayk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGxhdGUtc25hY2stYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJsYXRlU25hY2tcIixcbiAgICBwcmlvcml0eTogODgsXG4gICAgaGVhZGxpbmU6IFwiTGF0ZSBzbmFja3MgYXJlIGNvcnJlbGF0ZWQgd2l0aCBoZWF2aWVyIG5leHQtbW9ybmluZyBzY2FsZSByZWFkaW5ncy5cIixcbiAgICBkZXRhaWw6IGBZb3VyIG5leHQtZGF5IGNoYW5nZSBpcyArJHtyb3VuZDIoZXhjZXNzKX0ga2cgaGlnaGVyIHRoYW4geW91ciBub24tbGF0ZS1zbmFjayBiYXNlbGluZS5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGxhdGUtc25hY2sgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugd2l0aCBsYXRlIHNuYWNrOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiU2V0IGEgMi1ob3VyIGtpdGNoZW4gY2xvc2UgdGltZSBiZWZvcmUgYmVkLlwiLFxuICAgIGNhdGVnb3J5OiBcImxhdGVfc25hY2tcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0V2l0aExvZ3MoZW50cnlDb3VudDogbnVtYmVyLCBsYXRlc3REYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7bGF0ZXN0RGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJiYXNlbGluZVwiLFxuICAgIHByaW9yaXR5OiAxMCxcbiAgICBoZWFkbGluZTogXCJHcmVhdCBjb25zaXN0ZW5jeSBzbyBmYXIg4oCUIGtlZXAgbG9nZ2luZyBkYWlseSBmb3Igc2hhcnBlciBpbnNpZ2h0cy5cIixcbiAgICBkZXRhaWw6XG4gICAgICBcIldlIG5lZWQgYSBiaXQgbW9yZSBzaWduYWwgdG8gZGV0ZWN0IHN0cm9uZyBwZXJzb25hbCBwYXR0ZXJucywgYnV0IHlvdXIgZGF0YSBmbG93IGlzIGFjdGl2ZS5cIixcbiAgICB3aHk6IFtcbiAgICAgIGAke2VudHJ5Q291bnR9IGxvZ3MgYW5hbHl6ZWQgZnJvbSB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIFwiTm8gcnVsZSBjcm9zc2VkIGNvbmZpZGVuY2UgdGhyZXNob2xkcyB5ZXRcIixcbiAgICBdLFxuICAgIGFjdGlvbjogXCJLZWVwIHRyYWNraW5nIGRhaWx5IGhhYml0cyBhbmQgd2VpZ2h0IHRvIHVubG9jayBzdHJvbmdlciBwZXJzb25hbGl6ZWQgaW5zaWdodHMuXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGJhc2VsaW5lSW5zaWdodE5vTG9ncyhhc09mRGF0ZTogc3RyaW5nKTogSW5zaWdodENhcmQge1xuICByZXR1cm4ge1xuICAgIGlkOiBgYmFzZWxpbmUtaW5zaWdodC0ke2FzT2ZEYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIlN0YXJ0IGxvZ2dpbmcgd2VpZ2h0IGFuZCBoYWJpdHMgdG8gdW5sb2NrIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBkZXRhaWw6IFwiT25jZSB5b3UgaGF2ZSBhIGZldyB3ZWVrcyBvZiBlbnRyaWVzLCB3ZSB3aWxsIGhpZ2hsaWdodCBwYXR0ZXJucyB0aGF0IG1hdGNoIHlvdXIgZGF0YS5cIixcbiAgICB3aHk6IFtcIk5vIGVudHJpZXMgZm91bmQgaW4gdGhlIGxhc3QgOTAgZGF5c1wiXSxcbiAgICBhY3Rpb246IFwiQWRkIHRvZGF5J3Mgd2VpZ2h0IG9uIHRoZSBsZWZ0IHRvIGJlZ2luLlwiLFxuICAgIGNhdGVnb3J5OiBcInN0cmVha1wiLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbnNpZ2h0c1YyKHVzZXJJZDogc3RyaW5nLCBfZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgdG8gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBmcm9tRGF0ZSA9IG5ldyBEYXRlKCk7XG4gIGZyb21EYXRlLnNldERhdGUoZnJvbURhdGUuZ2V0RGF0ZSgpIC0gODkpO1xuICBjb25zdCBmcm9tID0gZnJvbURhdGUudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWQgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9LFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgXCI6ZnJvbURhdGVcIjogeyBTOiBmcm9tIH0sXG4gICAgICAgIFwiOnRvRGF0ZVwiOiB7IFM6IHRvIH0sXG4gICAgICB9LFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBlbnRyaWVzUmF3ID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIH0pLFxuICApLmZpbHRlcigoZSkgPT4gZS5kYXRlICYmIGUubW9ybmluZ1dlaWdodCA+IDApO1xuXG4gIGNvbnN0IHNldHRpbmdzVGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBzZXR0aW5nc1JvdyA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHNldHRpbmdzVGFibGUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZ0l0ZW0gPSBzZXR0aW5nc1Jvdy5JdGVtO1xuICBjb25zdCBnb2FsV2VpZ2h0ID0gZ0l0ZW0gPyBOdW1iZXIoZ0l0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MikgOiA3MjtcbiAgY29uc3Qgc3RhcnRXZWlnaHQgPSBnSXRlbSA/IE51bWJlcihnSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSkgOiA4NTtcbiAgY29uc3QgdGFyZ2V0RGF0ZSA9IGdJdGVtPy50YXJnZXREYXRlPy5TID8/IHRvO1xuXG4gIGNvbnN0IGluc2lnaHRzID0gYXdhaXQgZ2VuZXJhdGVBaUluc2lnaHRDYXJkKGRkYiwge1xuICAgIHVzZXJJZCxcbiAgICBlbnRyaWVzUmF3LFxuICAgIGdvYWxXZWlnaHQsXG4gICAgc3RhcnRXZWlnaHQsXG4gICAgdGFyZ2V0RGF0ZSxcbiAgICBkYXlNZWFsc1RhYmxlTmFtZTogZGF5TWVhbEVudHJpZXNUYWJsZU5hbWUsXG4gIH0pO1xuICByZXR1cm4ganNvbigyMDAsIHsgaW5zaWdodHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUVcIiwgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBpbnNpZ2h0SWQgPSB0eXBlb2YgYm9keS5pbnNpZ2h0SWQgPT09IFwic3RyaW5nXCIgPyBib2R5Lmluc2lnaHRJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCB2b3RlID0gYm9keS52b3RlID09PSBcInVwXCIgfHwgYm9keS52b3RlID09PSBcImRvd25cIiA/IGJvZHkudm90ZSA6IG51bGw7XG4gIGlmICghaW5zaWdodElkIHx8ICF2b3RlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbnNpZ2h0IGZlZWRiYWNrIHBheWxvYWRcIiB9KTtcbiAgY29uc3QgY29tbWVudFJhdyA9IGJvZHkuY29tbWVudDtcbiAgY29uc3QgY29tbWVudCA9XG4gICAgdHlwZW9mIGNvbW1lbnRSYXcgPT09IFwic3RyaW5nXCIgJiYgY29tbWVudFJhdy50cmltKCkubGVuZ3RoID4gMFxuICAgICAgPyBjb21tZW50UmF3LnRyaW0oKS5zbGljZSgwLCAyMDAwKVxuICAgICAgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGZlZWRiYWNrVHlwZSA9IGJvZHkuZmVlZGJhY2tUeXBlID09PSBcIm5lZ2F0aXZlXCIgPyBcIm5lZ2F0aXZlXCIgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgaW5zaWdodFRzOiB7IFM6IGAke3RzfSMke2luc2lnaHRJZH1gIH0sXG4gICAgICAgIGluc2lnaHRJZDogeyBTOiBpbnNpZ2h0SWQgfSxcbiAgICAgICAgdm90ZTogeyBTOiB2b3RlIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICAgIC4uLihjb21tZW50ID8geyBjb21tZW50OiB7IFM6IGNvbW1lbnQgfSB9IDoge30pLFxuICAgICAgICAuLi4oZmVlZGJhY2tUeXBlID8geyBmZWVkYmFja1R5cGU6IHsgUzogZmVlZGJhY2tUeXBlIH0gfSA6IHt9KSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW50cmllcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBmcm9tID0gcXVlcnk/LmZyb207XG4gIGNvbnN0IHRvID0gcXVlcnk/LnRvO1xuICBpZiAoZnJvbSAmJiAhaXNEYXRlU3RyaW5nKGZyb20pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmcm9tIGRhdGVcIiB9KTtcbiAgaWYgKHRvICYmICFpc0RhdGVTdHJpbmcodG8pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB0byBkYXRlXCIgfSk7XG5cbiAgY29uc3QgZXhwcmVzc2lvblZhbHVlczogUmVjb3JkPHN0cmluZywgeyBTOiBzdHJpbmcgfT4gPSB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH07XG4gIGxldCBrZXlDb25kaXRpb24gPSBcInVzZXJJZCA9IDp1c2VySWRcIjtcbiAgaWYgKGZyb20gJiYgdG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9IGVsc2UgaWYgKGZyb20pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlID49IDpmcm9tRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgfSBlbHNlIGlmICh0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPD0gOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9XG5cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IGtleUNvbmRpdGlvbixcbiAgICAgIC4uLihrZXlDb25kaXRpb24uaW5jbHVkZXMoXCIjZGF0ZVwiKVxuICAgICAgICA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSB9XG4gICAgICAgIDoge30pLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvblZhbHVlcyxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgcGhvdG9Vcmw6IGl0ZW0ucGhvdG9Vcmw/LlMgPz8gdW5kZWZpbmVkLFxuICAgIG5vdGVzOiBpdGVtLm5vdGVzPy5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eVRleHQ6IGl0ZW0uYWN0aXZpdHlUZXh0Py5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eVN1bW1hcnk6IGl0ZW0uYWN0aXZpdHlTdW1tYXJ5Py5TID8/IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eUJ1cm5LY2FsOiBpdGVtLmFjdGl2aXR5QnVybktjYWw/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eUJ1cm5LY2FsLk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5TWV0OiBpdGVtLmFjdGl2aXR5TWV0Py5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlNZXQuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlNaW51dGVzOiBpdGVtLmFjdGl2aXR5TWludXRlcz8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5TWludXRlcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eUNvbmZpZGVuY2U6IGl0ZW0uYWN0aXZpdHlDb25maWRlbmNlPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlDb25maWRlbmNlLk4pIDogdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzOiBTdG9yZWRFbnRyeVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBwaG90byA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGVudHJ5LnBob3RvVXJsKTtcbiAgICAgIGlmICghcGhvdG8pIHJldHVybiBlbnRyeTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpdGhvdXRTY2hlbWUgPSBwaG90by5zbGljZShcInMzOi8vXCIubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgZmlyc3RTbGFzaCA9IHdpdGhvdXRTY2hlbWUuaW5kZXhPZihcIi9cIik7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoIDw9IDApIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3QgYnVja2V0ID0gd2l0aG91dFNjaGVtZS5zbGljZSgwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgY29uc3Qga2V5ID0gd2l0aG91dFNjaGVtZS5zbGljZShmaXJzdFNsYXNoICsgMSk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IHNpZ25lZFBob3RvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiBidWNrZXQsIEtleToga2V5IH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiBkb3dubG9hZFVybFR0bFNlY29uZHMgfSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgLi4uZW50cnksIHBob3RvVXJsOiBzaWduZWRQaG90b1VybCB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cmllczogZW50cmllc1dpdGhTaWduZWRQaG90b1VybHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEVudHJ5KHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlRW50cnkocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGlkID0gYCR7dXNlcklkfToke2RhdGEuZGF0ZX1gO1xuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGEuZGF0ZSB9LFxuICAgIGlkOiB7IFM6IGlkIH0sXG4gICAgbW9ybmluZ1dlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5tb3JuaW5nV2VpZ2h0KSB9LFxuICAgIGxhdGVTbmFjazogeyBCT09MOiBkYXRhLmxhdGVTbmFjayB9LFxuICAgIGhpZ2hTb2RpdW06IHsgQk9PTDogZGF0YS5oaWdoU29kaXVtIH0sXG4gICAgd29ya291dDogeyBCT09MOiBkYXRhLndvcmtvdXQgfSxcbiAgICBhbGNvaG9sOiB7IEJPT0w6IGRhdGEuYWxjb2hvbCB9LFxuICB9O1xuXG4gIGlmIChkYXRhLm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5uaWdodFdlaWdodCAhPT0gbnVsbCkge1xuICAgIGl0ZW0ubmlnaHRXZWlnaHQgPSB7IE46IFN0cmluZyhkYXRhLm5pZ2h0V2VpZ2h0KSB9O1xuICB9XG4gIGlmIChkYXRhLmNhbG9yaWVzICE9PSB1bmRlZmluZWQpIGl0ZW0uY2Fsb3JpZXMgPSB7IE46IFN0cmluZyhkYXRhLmNhbG9yaWVzKSB9O1xuICBpZiAoZGF0YS5wcm90ZWluICE9PSB1bmRlZmluZWQpIGl0ZW0ucHJvdGVpbiA9IHsgTjogU3RyaW5nKGRhdGEucHJvdGVpbikgfTtcbiAgaWYgKGRhdGEuc3RlcHMgIT09IHVuZGVmaW5lZCkgaXRlbS5zdGVwcyA9IHsgTjogU3RyaW5nKGRhdGEuc3RlcHMpIH07XG4gIGlmIChkYXRhLnNsZWVwICE9PSB1bmRlZmluZWQpIGl0ZW0uc2xlZXAgPSB7IE46IFN0cmluZyhkYXRhLnNsZWVwKSB9O1xuICBjb25zdCBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShkYXRhLnBob3RvVXJsKTtcbiAgaWYgKG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSkgaXRlbS5waG90b1VybCA9IHsgUzogbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlIH07XG4gIGlmICh0eXBlb2YgZGF0YS5ub3RlcyA9PT0gXCJzdHJpbmdcIikgaXRlbS5ub3RlcyA9IHsgUzogZGF0YS5ub3RlcyB9O1xuICBpZiAodHlwZW9mIGRhdGEuYWN0aXZpdHlUZXh0ID09PSBcInN0cmluZ1wiKSBpdGVtLmFjdGl2aXR5VGV4dCA9IHsgUzogZGF0YS5hY3Rpdml0eVRleHQgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLmFjdGl2aXR5U3VtbWFyeSA9PT0gXCJzdHJpbmdcIikgaXRlbS5hY3Rpdml0eVN1bW1hcnkgPSB7IFM6IGRhdGEuYWN0aXZpdHlTdW1tYXJ5IH07XG4gIGlmIChkYXRhLmFjdGl2aXR5QnVybktjYWwgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eUJ1cm5LY2FsID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eUJ1cm5LY2FsKSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eU1ldCAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5TWV0ID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eU1ldCkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlNaW51dGVzICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlNaW51dGVzID0geyBOOiBTdHJpbmcoZGF0YS5hY3Rpdml0eU1pbnV0ZXMpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5Q29uZmlkZW5jZSAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZSA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlDb25maWRlbmNlKSB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJ5OiB7IC4uLmRhdGEsIGlkIH0gfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGRhdGUgPSBxdWVyeT8uZGF0ZTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF0ZSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBkYXRlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICAgIHRvbmU6IFwiZnJpZW5kbHlcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgICAgdG9uZTogeyBTOiBzZXR0aW5ncy50b25lID8/IFwiZnJpZW5kbHlcIiB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4ganNvbigyMDAsIHtcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGdvYWxXZWlnaHQ6IHNldHRpbmdzLmdvYWxXZWlnaHQsXG4gICAgICAgIHN0YXJ0V2VpZ2h0OiBzZXR0aW5ncy5zdGFydFdlaWdodCxcbiAgICAgICAgdGFyZ2V0RGF0ZTogc2V0dGluZ3MudGFyZ2V0RGF0ZSxcbiAgICAgICAgdW5pdDogc2V0dGluZ3MudW5pdCxcbiAgICAgICAgdG9uZTogc2V0dGluZ3MudG9uZSxcbiAgICAgICAgcGxhdGVhdTogdW5kZWZpbmVkLFxuICAgICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBzZXR0aW5ncy5hY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yID8/IDEsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpLFxuICAgICAgdGFyZ2V0RGF0ZTogb3V0Lkl0ZW0udGFyZ2V0RGF0ZT8uUyA/PyBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogb3V0Lkl0ZW0udW5pdD8uUyA9PT0gXCJsYnNcIiA/IFwibGJzXCIgOiBcImtnXCIsXG4gICAgICB0b25lOlxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJheXVydmVkaWNcIlxuICAgICAgICAgID8gb3V0Lkl0ZW0udG9uZS5TXG4gICAgICAgICAgOiBcImZyaWVuZGx5XCIsXG4gICAgICBwbGF0ZWF1OiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShvdXQuSXRlbSksXG4gICAgICBhY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yOiBOdW1iZXIob3V0Lkl0ZW0uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKSxcbiAgICAgIG9wdEluRm9yZWNhc3Q6IE51bWJlcihvdXQuSXRlbS5vcHRJbkZvcmVjYXN0Py5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICAgIGZvcmVjYXN0R2VuZXJhdGVkQXQ6IG91dC5JdGVtLmZvcmVjYXN0R2VuZXJhdGVkQXQ/LlMsXG4gICAgICBmb3JlY2FzdERpc2NsYWltZXJBY2NlcHRlZDogTnVtYmVyKG91dC5JdGVtLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkPy5OID8/IFwiMFwiKSA9PT0gMSxcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBleGlzdGluZ091dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG5cbiAgY29uc3QgZXhpc3RpbmdUb25lID1cbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgIGV4aXN0aW5nT3V0Lkl0ZW0/LnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImZyaWVuZGx5XCJcbiAgICAgID8gZXhpc3RpbmdPdXQuSXRlbS50b25lLlNcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCB0b25lID0gZGF0YS50b25lID8/IGV4aXN0aW5nVG9uZSA/PyBcImZyaWVuZGx5XCI7XG4gIGNvbnN0IGV4aXN0aW5nQ2FsaWJyYXRpb24gPSBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj8uTiA/PyAxKTtcbiAgY29uc3QgZXhpc3RpbmdPcHRJbkZvcmVjYXN0ID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/Lm9wdEluRm9yZWNhc3Q/Lk4gPz8gXCIwXCIpID09PSAxO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQgPSBleGlzdGluZ091dC5JdGVtPy5mb3JlY2FzdEdlbmVyYXRlZEF0Py5TO1xuICBjb25zdCBleGlzdGluZ0ZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID1cbiAgICBOdW1iZXIoZXhpc3RpbmdPdXQuSXRlbT8uZm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQ/Lk4gPz8gXCIwXCIpID09PSAxO1xuXG4gIGxldCBuZXh0UGxhdGVhdSA9IHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKGV4aXN0aW5nT3V0Lkl0ZW0pO1xuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGJvZHksIFwicGxhdGVhdVwiKSkge1xuICAgIGNvbnN0IHJhd1BsYXRlYXUgPSBib2R5LnBsYXRlYXU7XG4gICAgaWYgKHJhd1BsYXRlYXUgPT09IG51bGwpIHtcbiAgICAgIG5leHRQbGF0ZWF1ID0gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwID0gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QocmF3UGxhdGVhdSk7XG4gICAgICBpZiAoIXAub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwLmVycm9yIH0pO1xuICAgICAgbmV4dFBsYXRlYXUgPSB7IC4uLm5leHRQbGF0ZWF1LCAuLi5wLmRhdGEgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5zdGFydFdlaWdodCkgfSxcbiAgICB0YXJnZXREYXRlOiB7IFM6IGRhdGEudGFyZ2V0RGF0ZSB9LFxuICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgdG9uZTogeyBTOiB0b25lIH0sXG4gIH07XG4gIGlmIChuZXh0UGxhdGVhdT8ucm9sbGluZ1dpbmRvd0RheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5yb2xsaW5nV2luZG93RGF5cykpIH07XG4gIH1cbiAgaWYgKG5leHRQbGF0ZWF1Py5jb21wYXJpc29uU3BhbkRheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cyA9IHsgTjogU3RyaW5nKE1hdGgucm91bmQobmV4dFBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/Lm1heEF2Z01vdmVtZW50S2cgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2cgPSB7IE46IFN0cmluZyhuZXh0UGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnKSB9O1xuICB9XG4gIGl0ZW0uYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvciA9IHsgTjogU3RyaW5nKGV4aXN0aW5nQ2FsaWJyYXRpb24pIH07XG4gIGl0ZW0ub3B0SW5Gb3JlY2FzdCA9IHtcbiAgICBOOiAoZGF0YS5vcHRJbkZvcmVjYXN0ID8/IGV4aXN0aW5nT3B0SW5Gb3JlY2FzdCkgPyBcIjFcIiA6IFwiMFwiLFxuICB9O1xuICBjb25zdCBuZXh0Rm9yZWNhc3RHZW5lcmF0ZWRBdCA9IGRhdGEuZm9yZWNhc3RHZW5lcmF0ZWRBdCA/PyBleGlzdGluZ0ZvcmVjYXN0R2VuZXJhdGVkQXQ7XG4gIGlmICh0eXBlb2YgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgPT09IFwic3RyaW5nXCIgJiYgbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQubGVuZ3RoID4gMCkge1xuICAgIGl0ZW0uZm9yZWNhc3RHZW5lcmF0ZWRBdCA9IHsgUzogbmV4dEZvcmVjYXN0R2VuZXJhdGVkQXQgfTtcbiAgfVxuICBpdGVtLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID0ge1xuICAgIE46IChkYXRhLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID8/IGV4aXN0aW5nRm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQpID8gXCIxXCIgOiBcIjBcIixcbiAgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBkYXRhLmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogZGF0YS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGRhdGEudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGRhdGEudW5pdCxcbiAgICAgIHRvbmUsXG4gICAgICBwbGF0ZWF1OiBuZXh0UGxhdGVhdSxcbiAgICAgIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I6IGV4aXN0aW5nQ2FsaWJyYXRpb24sXG4gICAgICBvcHRJbkZvcmVjYXN0OiBkYXRhLm9wdEluRm9yZWNhc3QgPz8gZXhpc3RpbmdPcHRJbkZvcmVjYXN0LFxuICAgICAgZm9yZWNhc3RHZW5lcmF0ZWRBdDogZGF0YS5mb3JlY2FzdEdlbmVyYXRlZEF0ID8/IGV4aXN0aW5nRm9yZWNhc3RHZW5lcmF0ZWRBdCxcbiAgICAgIGZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkOlxuICAgICAgICBkYXRhLmZvcmVjYXN0RGlzY2xhaW1lckFjY2VwdGVkID8/IGV4aXN0aW5nRm9yZWNhc3REaXNjbGFpbWVyQWNjZXB0ZWQsXG4gICAgfSxcbiAgfSk7XG59XG5cbnR5cGUgUHJvZ3Jlc3NQaG90b0l0ZW0gPSB7XG4gIHBob3RvSWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGRhdGU6IHN0cmluZztcbiAgaW1hZ2VVcmw/OiBzdHJpbmc7XG4gIHN0b3JhZ2VLZXk/OiBzdHJpbmc7XG4gIHdlaWdodEF0UGhvdG8/OiBudW1iZXI7XG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nIH0+KTogUHJvZ3Jlc3NQaG90b0l0ZW0gfCBudWxsIHtcbiAgY29uc3QgcGhvdG9JZCA9IGl0ZW0ucGhvdG9JZD8uUztcbiAgY29uc3QgdXNlcklkID0gaXRlbS51c2VySWQ/LlM7XG4gIGNvbnN0IGRhdGUgPSBpdGVtLmRhdGU/LlM7XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IGl0ZW0uY3JlYXRlZEF0Py5TO1xuICBpZiAoIXBob3RvSWQgfHwgIXVzZXJJZCB8fCAhZGF0ZSB8fCAhY3JlYXRlZEF0KSByZXR1cm4gbnVsbDtcbiAgY29uc3QgaW1hZ2VVcmwgPSBpdGVtLmltYWdlVXJsPy5TO1xuICBjb25zdCBzdG9yYWdlS2V5ID0gaXRlbS5zdG9yYWdlS2V5Py5TO1xuICBjb25zdCB3ZWlnaHRSYXcgPSBpdGVtLndlaWdodEF0UGhvdG8/Lk47XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSB3ZWlnaHRSYXcgIT0gbnVsbCA/IE51bWJlcih3ZWlnaHRSYXcpIDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHBob3RvSWQsXG4gICAgdXNlcklkLFxuICAgIGRhdGUsXG4gICAgaW1hZ2VVcmw6IGltYWdlVXJsIHx8IHVuZGVmaW5lZCxcbiAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICB3ZWlnaHRBdFBob3RvOiBOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90byA/PyBOYU4pID8gd2VpZ2h0QXRQaG90byA6IHVuZGVmaW5lZCxcbiAgICBjcmVhdGVkQXQsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBpdGVtcyA9IChvdXQuSXRlbXMgPz8gW10pXG4gICAgLm1hcCgoaXRlbSkgPT4gcGFyc2VQcm9ncmVzc1Bob3RvRnJvbUl0ZW0oaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4pKVxuICAgIC5maWx0ZXIoKHJvdyk6IHJvdyBpcyBQcm9ncmVzc1Bob3RvSXRlbSA9PiByb3cgIT09IG51bGwpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuZGF0ZS5sb2NhbGVDb21wYXJlKGEuZGF0ZSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIlBST0dSRVNTX1BIT1RPU19UQUJMRV9OQU1FXCIsIHByb2dyZXNzUGhvdG9zVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGltYWdlVXJsID0gdHlwZW9mIGJvZHkuaW1hZ2VVcmwgPT09IFwic3RyaW5nXCIgPyBib2R5LmltYWdlVXJsLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSB0eXBlb2YgYm9keS5zdG9yYWdlS2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5zdG9yYWdlS2V5LnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHdlaWdodEF0UGhvdG8gPSBib2R5LndlaWdodEF0UGhvdG8gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlcihib2R5LndlaWdodEF0UGhvdG8pO1xuICBpZiAoIWRhdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcbiAgaWYgKCFpbWFnZVVybCAmJiAhc3RvcmFnZUtleSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgaW1hZ2VVcmwgb3Igc3RvcmFnZUtleVwiIH0pO1xuICBpZiAoXG4gICAgd2VpZ2h0QXRQaG90byAhPT0gdW5kZWZpbmVkICYmXG4gICAgKCFOdW1iZXIuaXNGaW5pdGUod2VpZ2h0QXRQaG90bykgfHwgd2VpZ2h0QXRQaG90byA8PSAwIHx8IHdlaWdodEF0UGhvdG8gPiAxMDAwKVxuICApIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB3ZWlnaHRBdFBob3RvXCIgfSk7XG4gIH1cbiAgY29uc3QgcGhvdG9JZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3QgY3JlYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgIGRhdGU6IHsgUzogZGF0ZSB9LFxuICAgIGNyZWF0ZWRBdDogeyBTOiBjcmVhdGVkQXQgfSxcbiAgfTtcbiAgaWYgKGltYWdlVXJsKSBpdGVtLmltYWdlVXJsID0geyBTOiBpbWFnZVVybCB9O1xuICBpZiAoc3RvcmFnZUtleSkgaXRlbS5zdG9yYWdlS2V5ID0geyBTOiBzdG9yYWdlS2V5IH07XG4gIGlmICh3ZWlnaHRBdFBob3RvICE9PSB1bmRlZmluZWQpIGl0ZW0ud2VpZ2h0QXRQaG90byA9IHsgTjogU3RyaW5nKHdlaWdodEF0UGhvdG8pIH07XG4gIGF3YWl0IGRkYi5zZW5kKG5ldyBQdXRJdGVtQ29tbWFuZCh7IFRhYmxlTmFtZTogdGFibGUsIEl0ZW06IGl0ZW0gYXMgbmV2ZXIgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBpdGVtOiB7XG4gICAgICBwaG90b0lkLFxuICAgICAgdXNlcklkLFxuICAgICAgZGF0ZSxcbiAgICAgIGltYWdlVXJsOiBpbWFnZVVybCB8fCB1bmRlZmluZWQsXG4gICAgICBzdG9yYWdlS2V5OiBzdG9yYWdlS2V5IHx8IHVuZGVmaW5lZCxcbiAgICAgIHdlaWdodEF0UGhvdG8sXG4gICAgICBjcmVhdGVkQXQsXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZVByb2dyZXNzUGhvdG8odXNlcklkOiBzdHJpbmcsIHBob3RvSWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiUFJPR1JFU1NfUEhPVE9TX1RBQkxFX05BTUVcIiwgcHJvZ3Jlc3NQaG90b3NUYWJsZU5hbWUpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIHBob3RvSWQ6IHsgUzogcGhvdG9JZCB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG50eXBlIEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCA9IHtcbiAgc3VtbWFyeTogc3RyaW5nO1xuICBjb25maWRlbmNlOiBudW1iZXI7XG4gIGVzdGltYXRlZDogYm9vbGVhbjtcbiAgZGlzY2xhaW1lcjogc3RyaW5nO1xuICBoaWdobGlnaHRzOiBBcnJheTx7XG4gICAgYXJlYTogc3RyaW5nO1xuICAgIGFzc2Vzc21lbnQ6IHN0cmluZztcbiAgICBkaXJlY3Rpb246IFwibGVhbmVyXCIgfCBcInVuY2hhbmdlZFwiIHwgXCJ1bmNlcnRhaW5cIjtcbiAgfT47XG59O1xuXG5mdW5jdGlvbiBleHRyYWN0Rmlyc3RKc29uT2JqZWN0KHJhdzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IHRleHQgPSByYXcudHJpbSgpO1xuICBjb25zdCBzdGFydCA9IHRleHQuaW5kZXhPZihcIntcIik7XG4gIGlmIChzdGFydCA8IDApIHJldHVybiBudWxsO1xuICBsZXQgZGVwdGggPSAwO1xuICBsZXQgaW5TdHJpbmcgPSBmYWxzZTtcbiAgbGV0IGVzY2FwZSA9IGZhbHNlO1xuICBmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCB0ZXh0Lmxlbmd0aDsgaSArPSAxKSB7XG4gICAgY29uc3QgYyA9IHRleHRbaV0hO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgIGVzY2FwZSA9IGZhbHNlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjID09PSBcIlxcXFxcIiAmJiBpblN0cmluZykge1xuICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoYyA9PT0gXCJcXFwiXCIpIHtcbiAgICAgIGluU3RyaW5nID0gIWluU3RyaW5nO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmICghaW5TdHJpbmcpIHtcbiAgICAgIGlmIChjID09PSBcIntcIikgZGVwdGggKz0gMTtcbiAgICAgIGlmIChjID09PSBcIn1cIikge1xuICAgICAgICBkZXB0aCAtPSAxO1xuICAgICAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiB0ZXh0LnNsaWNlKHN0YXJ0LCBpICsgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZUJvZHlDb21wYXJlQXNzZXNzbWVudChyYXc6IHN0cmluZyk6IEJvZHlDb21wYXJlQXNzZXNzbWVudFJlc3VsdCB8IG51bGwge1xuICBjb25zdCBqc29uVGV4dCA9IGV4dHJhY3RGaXJzdEpzb25PYmplY3QocmF3KTtcbiAgaWYgKCFqc29uVGV4dCkgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uVGV4dCkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3Qgc3VtbWFyeSA9IHR5cGVvZiBwYXJzZWQuc3VtbWFyeSA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5zdW1tYXJ5LnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgY29uZmlkZW5jZSA9IE51bWJlcihwYXJzZWQuY29uZmlkZW5jZSk7XG4gICAgY29uc3QgZGlzY2xhaW1lciA9IHR5cGVvZiBwYXJzZWQuZGlzY2xhaW1lciA9PT0gXCJzdHJpbmdcIiA/IHBhcnNlZC5kaXNjbGFpbWVyLnRyaW0oKSA6IFwiXCI7XG4gICAgaWYgKCFzdW1tYXJ5IHx8ICFOdW1iZXIuaXNGaW5pdGUoY29uZmlkZW5jZSkgfHwgIWRpc2NsYWltZXIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGhpZ2hsaWdodHNSYXcgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5oaWdobGlnaHRzKSA/IHBhcnNlZC5oaWdobGlnaHRzIDogW107XG4gICAgY29uc3QgaGlnaGxpZ2h0cyA9IGhpZ2hsaWdodHNSYXdcbiAgICAgIC5tYXAoKGVudHJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IGUgPSBlbnRyeSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgICAgY29uc3QgYXJlYSA9IHR5cGVvZiBlLmFyZWEgPT09IFwic3RyaW5nXCIgPyBlLmFyZWEudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgYXNzZXNzbWVudCA9IHR5cGVvZiBlLmFzc2Vzc21lbnQgPT09IFwic3RyaW5nXCIgPyBlLmFzc2Vzc21lbnQudHJpbSgpIDogXCJcIjtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uUmF3ID0gdHlwZW9mIGUuZGlyZWN0aW9uID09PSBcInN0cmluZ1wiID8gZS5kaXJlY3Rpb24gOiBcInVuY2VydGFpblwiO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPVxuICAgICAgICAgIGRpcmVjdGlvblJhdyA9PT0gXCJsZWFuZXJcIiB8fCBkaXJlY3Rpb25SYXcgPT09IFwidW5jaGFuZ2VkXCIgfHwgZGlyZWN0aW9uUmF3ID09PSBcInVuY2VydGFpblwiXG4gICAgICAgICAgICA/IGRpcmVjdGlvblJhd1xuICAgICAgICAgICAgOiBcInVuY2VydGFpblwiO1xuICAgICAgICBpZiAoIWFyZWEgfHwgIWFzc2Vzc21lbnQpIHJldHVybiBudWxsO1xuICAgICAgICByZXR1cm4geyBhcmVhLCBhc3Nlc3NtZW50LCBkaXJlY3Rpb24gfTtcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAodik6IHYgaXMgeyBhcmVhOiBzdHJpbmc7IGFzc2Vzc21lbnQ6IHN0cmluZzsgZGlyZWN0aW9uOiBcImxlYW5lclwiIHwgXCJ1bmNoYW5nZWRcIiB8IFwidW5jZXJ0YWluXCIgfSA9PlxuICAgICAgICAgIHYgIT09IG51bGwsXG4gICAgICApO1xuICAgIHJldHVybiB7XG4gICAgICBzdW1tYXJ5LFxuICAgICAgY29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBNYXRoLnJvdW5kKGNvbmZpZGVuY2UpKSksXG4gICAgICBlc3RpbWF0ZWQ6IHRydWUsXG4gICAgICBkaXNjbGFpbWVyLFxuICAgICAgaGlnaGxpZ2h0cyxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhc3Nlc3NQcm9ncmVzc1Bob3Rvcyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzQm9keUNvbXBhcmVBaUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJBSSBwaG90byBjb21wYXJlIGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IGFwaUtleSA9IHByb2Nlc3MuZW52LkFOVEhST1BJQ19BUElfS0VZPy50cmltKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4ganNvbig1MDMsIHsgZXJyb3I6IFwiQUkgY29tcGFyZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgY29uc3QgcmF3ID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGJvZHlcIiB9KTtcbiAgY29uc3QgYm9keSA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgcGhvdG9zUmF3ID0gQXJyYXkuaXNBcnJheShib2R5LnBob3RvcykgPyBib2R5LnBob3RvcyA6IFtdO1xuICBjb25zdCBxdWVyeSA9IHR5cGVvZiBib2R5LnF1ZXJ5ID09PSBcInN0cmluZ1wiID8gYm9keS5xdWVyeS50cmltKCkgOiBcIlwiO1xuICB0eXBlIFBob3RvSXRlbSA9IHtcbiAgICBkYXRlOiBzdHJpbmc7XG4gICAgcGhvdG9Vcmw6IHN0cmluZztcbiAgICBpbWFnZUJhc2U2NDogc3RyaW5nO1xuICAgIG1lZGlhVHlwZTogc3RyaW5nO1xuICB9O1xuICBjb25zdCBwaG90b3M6IFBob3RvSXRlbVtdID0gW107XG4gIGZvciAoY29uc3QgcmF3IG9mIHBob3Rvc1Jhdykge1xuICAgIGNvbnN0IHAgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgY29uc3QgZGF0ZSA9IHR5cGVvZiBwLmRhdGUgPT09IFwic3RyaW5nXCIgPyBwLmRhdGUgOiBcIlwiO1xuICAgIGNvbnN0IHBob3RvVXJsID0gdHlwZW9mIHAucGhvdG9VcmwgPT09IFwic3RyaW5nXCIgPyBwLnBob3RvVXJsLnRyaW0oKSA6IFwiXCI7XG4gICAgY29uc3QgaW1hZ2VCYXNlNjQgPVxuICAgICAgdHlwZW9mIHAuaW1hZ2VCYXNlNjQgPT09IFwic3RyaW5nXCIgPyBwLmltYWdlQmFzZTY0LnJlcGxhY2UoL1xccy9nLCBcIlwiKSA6IFwiXCI7XG4gICAgY29uc3QgbWVkaWFUeXBlID0gdHlwZW9mIHAubWVkaWFUeXBlID09PSBcInN0cmluZ1wiID8gcC5tZWRpYVR5cGUudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICAgIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSBjb250aW51ZTtcbiAgICBpZiAocGhvdG9VcmwpIHtcbiAgICAgIHBob3Rvcy5wdXNoKHsgZGF0ZSwgcGhvdG9VcmwsIGltYWdlQmFzZTY0OiBcIlwiLCBtZWRpYVR5cGU6IFwiXCIgfSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIGltYWdlQmFzZTY0ICYmXG4gICAgICAobWVkaWFUeXBlID09PSBcImltYWdlL2pwZWdcIiB8fFxuICAgICAgICBtZWRpYVR5cGUgPT09IFwiaW1hZ2UvcG5nXCIgfHxcbiAgICAgICAgbWVkaWFUeXBlID09PSBcImltYWdlL2dpZlwiIHx8XG4gICAgICAgIG1lZGlhVHlwZSA9PT0gXCJpbWFnZS93ZWJwXCIpXG4gICAgKSB7XG4gICAgICBwaG90b3MucHVzaCh7IGRhdGUsIHBob3RvVXJsOiBcIlwiLCBpbWFnZUJhc2U2NCwgbWVkaWFUeXBlIH0pO1xuICAgIH1cbiAgfVxuICBpZiAocGhvdG9zLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQXQgbGVhc3QgdHdvIHBob3RvcyBhcmUgcmVxdWlyZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgc2VsZWN0ZWQgPSBwaG90b3Muc2xpY2UoMCwgOCkuc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG4gIHR5cGUgQ29tcGFyZUNvbnRlbnRCbG9jayA9XG4gICAgfCB7IHR5cGU6IFwidGV4dFwiOyB0ZXh0OiBzdHJpbmcgfVxuICAgIHwge1xuICAgICAgICB0eXBlOiBcImltYWdlXCI7XG4gICAgICAgIHNvdXJjZToge1xuICAgICAgICAgIHR5cGU6IFwiYmFzZTY0XCI7XG4gICAgICAgICAgbWVkaWFfdHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgICAgICAgIGRhdGE6IHN0cmluZztcbiAgICAgICAgfTtcbiAgICAgIH07XG4gIGNvbnN0IGNvbnRlbnQ6IENvbXBhcmVDb250ZW50QmxvY2tbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHAgb2Ygc2VsZWN0ZWQpIHtcbiAgICBsZXQgYnVmOiBCdWZmZXI7XG4gICAgbGV0IG1lZGlhVHlwZTogXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuICAgIGlmIChwLnBob3RvVXJsKSB7XG4gICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocC5waG90b1VybCk7XG4gICAgICBpZiAoIW5vcm1hbGl6ZWQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIHJlZmVyZW5jZS5cIiB9KTtcbiAgICAgIGNvbnN0IHJlZiA9IHBhcnNlUzNVcmkobm9ybWFsaXplZCk7XG4gICAgICBpZiAoIXJlZikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk9ubHkgczM6Ly8gcGhvdG8gcmVmZXJlbmNlcyBhcmUgc3VwcG9ydGVkLlwiIH0pO1xuICAgICAgaWYgKCFwaG90b0J1Y2tldE5hbWUgfHwgcmVmLmJ1Y2tldCAhPT0gcGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBob3RvIGJ1Y2tldC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmICghczNLZXlBbGxvd2VkRm9yVXNlcihyZWYua2V5LCB1c2VySWQpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJQaG90byBkb2VzIG5vdCBiZWxvbmcgdG8gdGhpcyB1c2VyLlwiIH0pO1xuICAgICAgfVxuICAgICAgbGV0IGJ5dGVzOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbnRlbnRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBvdXQgPSBhd2FpdCBzMy5zZW5kKG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiByZWYuYnVja2V0LCBLZXk6IHJlZi5rZXkgfSkpO1xuICAgICAgICBieXRlcyA9IGF3YWl0IG91dC5Cb2R5Py50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpO1xuICAgICAgICBjb250ZW50VHlwZSA9IG91dC5Db250ZW50VHlwZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQ291bGQgbm90IHJlYWQgb25lIG9mIHRoZSBwaG90b3MuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJ5dGVzIHx8IGJ5dGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkVtcHR5IHBob3RvIGZvdW5kLlwiIH0pO1xuICAgICAgYnVmID0gQnVmZmVyLmZyb20oYnl0ZXMpO1xuICAgICAgaWYgKGJ5dGVzLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJBIHBob3RvIGlzIHRvbyBsYXJnZS5cIiB9KTtcbiAgICAgIGlmIChpc1Vuc3VwcG9ydGVkRm9vZEltYWdlRm9ybWF0KHJlZi5rZXksIGNvbnRlbnRUeXBlKSB8fCBidWZmZXJMb29rc0xpa2VIZWljT3JIZWlmKGJ1ZikpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkhFSUMvSEVJRiBpbWFnZXMgYXJlIG5vdCBzdXBwb3J0ZWQuIFVzZSBKUEVHL1BORy9XZWJQLlwiIH0pO1xuICAgICAgfVxuICAgICAgbWVkaWFUeXBlID0gZ3Vlc3NGb29kSW1hZ2VNZWRpYVR5cGUocmVmLmtleSwgY29udGVudFR5cGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgZGVjb2RlZDogQnVmZmVyO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKHAuaW1hZ2VCYXNlNjQsIFwiYmFzZTY0XCIpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGlubGluZSBwaG90byBlbmNvZGluZy5cIiB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkZWNvZGVkLmxlbmd0aCA9PT0gMCB8fCBkZWNvZGVkLmxlbmd0aCA+IDEyICogMTAyNCAqIDEwMjQpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIklubGluZSBwaG90byBlbXB0eSBvciB0b28gbGFyZ2UuXCIgfSk7XG4gICAgICB9XG4gICAgICBpZiAoYnVmZmVyTG9va3NMaWtlSGVpY09ySGVpZihkZWNvZGVkKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSEVJQy9IRUlGIGltYWdlcyBhcmUgbm90IHN1cHBvcnRlZC4gVXNlIEpQRUcvUE5HL1dlYlAuXCIgfSk7XG4gICAgICB9XG4gICAgICBidWYgPSBkZWNvZGVkO1xuICAgICAgbWVkaWFUeXBlID0gcC5tZWRpYVR5cGUgYXMgdHlwZW9mIG1lZGlhVHlwZTtcbiAgICB9XG4gICAgY29udGVudC5wdXNoKHsgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IGBQaG90byBkYXRlOiAke3AuZGF0ZX1gIH0pO1xuICAgIGNvbnRlbnQucHVzaCh7XG4gICAgICB0eXBlOiBcImltYWdlXCIsXG4gICAgICBzb3VyY2U6IHsgdHlwZTogXCJiYXNlNjRcIiwgbWVkaWFfdHlwZTogbWVkaWFUeXBlLCBkYXRhOiBidWYudG9TdHJpbmcoXCJiYXNlNjRcIikgfSxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBzeXN0ZW0gPSBgWW91IGFyZSBhbiBhc3Npc3RhbnQgZm9yIGEgZml0bmVzcyBhcHAuIENvbXBhcmUgdXNlciBwcm9ncmVzcyBwaG90b3MgYW5kIHByb3ZpZGUgYSBjYXJlZnVsIEVTVElNQVRFIG9ubHkuXG5SdWxlczpcbi0gRG8gTk9UIHByb3ZpZGUgZGlhZ25vc2lzLCBkaXNlYXNlIGNsYWltcywgb3IgbWVkaWNhbCBhZHZpY2UuXG4tIElmIGFuZ2xlLCBsaWdodGluZywgY2xvdGhpbmcsIG9yIHBvc3R1cmUgZGlmZmVyLCBleHBsaWNpdGx5IG1lbnRpb24gdW5jZXJ0YWludHkuXG4tIEZvY3VzIG9uIHZpc2libGUgdHJlbmQgY3VlcyBvbmx5IChtaWRzZWN0aW9uLCB3YWlzdGxpbmUsIGZhY2UgZnVsbG5lc3MsIHBvc3R1cmUgY29uc2lzdGVuY3kpLlxuLSBSZXR1cm4gT05MWSBKU09OOlxue1xuICBcInN1bW1hcnlcIjogXCIyLTQgc2VudGVuY2UgcGxhaW4tbGFuZ3VhZ2UgZXN0aW1hdGVcIixcbiAgXCJjb25maWRlbmNlXCI6IDAtMTAwLFxuICBcImRpc2NsYWltZXJcIjogXCJPbmUgc2VudGVuY2U6IGVzdGltYXRlIG9ubHksIG5vdCBtZWRpY2FsIGFkdmljZS5cIixcbiAgXCJoaWdobGlnaHRzXCI6IFtcbiAgICB7IFwiYXJlYVwiOiBcInN0cmluZ1wiLCBcImFzc2Vzc21lbnRcIjogXCJzdHJpbmdcIiwgXCJkaXJlY3Rpb25cIjogXCJsZWFuZXJ8dW5jaGFuZ2VkfHVuY2VydGFpblwiIH1cbiAgXVxufWA7XG4gIGNvbnN0IG1vZGVsID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0JPRFlfQ09NUEFSRV9NT0RFTD8udHJpbSgpIHx8IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCI7XG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgY29uc3QgcmVzcCA9IGF3YWl0IGNsaWVudC5tZXNzYWdlcy5jcmVhdGUoe1xuICAgICAgbW9kZWwsXG4gICAgICBtYXhfdG9rZW5zOiA3MDAsXG4gICAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgICAgc3lzdGVtLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6IFwidXNlclwiLFxuICAgICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICAgIC4uLmNvbnRlbnQsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgICB0ZXh0OlxuICAgICAgICAgICAgICAgIHF1ZXJ5IHx8XG4gICAgICAgICAgICAgICAgXCJDb21wYXJlIHRoZXNlIHBob3RvcyBmcm9tIG9sZGVzdCB0byBuZXdlc3QgYW5kIHN1bW1hcml6ZSB2aXNpYmxlIGNoYW5nZSB0cmVuZHMgYW5kIHVuY2VydGFpbnR5LlwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgICBjb25zdCB0ZXh0ID0gcmVzcC5jb250ZW50LmZpbmQoKHApID0+IHAudHlwZSA9PT0gXCJ0ZXh0XCIpPy50ZXh0ID8/IFwiXCI7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VCb2R5Q29tcGFyZUFzc2Vzc21lbnQodGV4dCk7XG4gICAgaWYgKCFwYXJzZWQpIHJldHVybiBqc29uKDUwMiwgeyBlcnJvcjogXCJDb3VsZCBub3QgcGFyc2UgQUkgY29tcGFyZSByZXN1bHQuXCIgfSk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICAuLi5wYXJzZWQsXG4gICAgICB0aW1lZnJhbWU6IHsgZnJvbTogc2VsZWN0ZWRbMF0/LmRhdGUsIHRvOiBzZWxlY3RlZFtzZWxlY3RlZC5sZW5ndGggLSAxXT8uZGF0ZSB9LFxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihKU09OLnN0cmluZ2lmeSh7IG1zZzogXCJwcm9ncmVzc19waG90b19hc3Nlc3NtZW50X2ZhaWxlZFwiLCBlcnI6IFN0cmluZyhlKSB9KSk7XG4gICAgcmV0dXJuIGpzb24oNTAyLCB7IGVycm9yOiBcIkFJIGNvbXBhcmUgZmFpbGVkLiBQbGVhc2UgdHJ5IGFnYWluLlwiIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgY29udGVudFR5cGUgPVxuICAgIHR5cGVvZiBib2R5LmNvbnRlbnRUeXBlID09PSBcInN0cmluZ1wiICYmIGJvZHkuY29udGVudFR5cGUubGVuZ3RoID4gMFxuICAgICAgPyBib2R5LmNvbnRlbnRUeXBlXG4gICAgICA6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIGNvbnN0IGZpbGVOYW1lID0gdHlwZW9mIGJvZHkuZmlsZU5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmZpbGVOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21GaWxlTmFtZSA9IGZpbGVOYW1lLm1hdGNoKC9cXC4oW2EtekEtWjAtOV0rKSQvKT8uWzFdPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21Cb2R5ID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGV4dGVuc2lvbiA9XG4gICAgZXh0RnJvbUZpbGVOYW1lICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tRmlsZU5hbWUpXG4gICAgICA/IGV4dEZyb21GaWxlTmFtZVxuICAgICAgOiBleHRGcm9tQm9keSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUJvZHkpXG4gICAgICAgID8gZXh0RnJvbUJvZHlcbiAgICAgICAgOiBcImpwZ1wiO1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBraW5kID0gdHlwZW9mIGJvZHkua2luZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkua2luZC50cmltKCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIGNvbnN0IGtleSA9XG4gICAga2luZCA9PT0gXCJmb29kXCJcbiAgICAgID8gYCR7dXNlcklkfS9mb29kLyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gXG4gICAgICA6IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBmcm9tRGIgPSAob3V0Lkl0ZW1zID8/IFtdKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KChhY2MsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBmbGFnID0gaXRlbS5mbGFnPy5TO1xuICAgIGNvbnN0IGVuYWJsZWRSYXcgPSBpdGVtLmVuYWJsZWQ/LkJPT0w7XG4gICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBlbmFibGVkUmF3ID09PSBcImJvb2xlYW5cIikge1xuICAgICAgYWNjW2ZsYWddID0gZW5hYmxlZFJhdztcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuXG4gIGNvbnN0IHNlcnZlckRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBjb25zdCBwaG90b0Zvb2QgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QSE9UT19GT09EX0xPR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEhPVE9fRk9PRF9MT0cgPSBwaG90b0Zvb2QgIT09IGZhbHNlO1xuICBjb25zdCBtZWFsTGlicmFyeSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX01FQUxfTElCUkFSWVwiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfTUVBTF9MSUJSQVJZID0gbWVhbExpYnJhcnkgIT09IGZhbHNlO1xuICBjb25zdCBubE1lYWxQYXJzZSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX05MX01FQUxfUEFSU0VcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX05MX01FQUxfUEFSU0UgPSBubE1lYWxQYXJzZSAhPT0gZmFsc2U7XG4gIGNvbnN0IGJvZHlDb21wYXJlQWkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9CT0RZX0NPTVBBUkVfQUlcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX0JPRFlfQ09NUEFSRV9BSSA9IGJvZHlDb21wYXJlQWkgIT09IGZhbHNlO1xuXG4gIGNvbnN0IG92ZXJyaWRlcyA9IHsgLi4uc2VydmVyRGVmYXVsdHMsIC4uLmZyb21EYiB9O1xuICByZXR1cm4ganNvbigyMDAsIHsgdXNlcklkLCBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgdGFyZ2V0VXNlcklkID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQ7XG4gIGlmICghdGFyZ2V0VXNlcklkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgdXNlcklkIHF1ZXJ5IHBhcmFtZXRlclwiIH0pO1xuICB9XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdGFyZ2V0VXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBvdmVycmlkZXMgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoKGl0ZW0pID0+ICh7XG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB0YXJnZXRVc2VySWQsXG4gICAgZmxhZzogaXRlbS5mbGFnPy5TID8/IFwiXCIsXG4gICAgZW5hYmxlZDogaXRlbS5lbmFibGVkPy5CT09MID8/IGZhbHNlLFxuICAgIHRzOiBpdGVtLnRzPy5TID8/IFwiXCIsXG4gIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCB1c2VySWQgPSB0eXBlb2YgYm9keS51c2VySWQgPT09IFwic3RyaW5nXCIgPyBib2R5LnVzZXJJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCByYXdGbGFnID0gdHlwZW9mIGJvZHkuZmxhZyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmxhZy50cmltKCkgOiBcIlwiO1xuICBjb25zdCBlbmFibGVkID0gdHlwZW9mIGJvZHkuZW5hYmxlZCA9PT0gXCJib29sZWFuXCIgPyBib2R5LmVuYWJsZWQgOiBudWxsO1xuICBpZiAoIXVzZXJJZCB8fCAhcmF3RmxhZyB8fCBlbmFibGVkID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgcGF5bG9hZC4gRXhwZWN0ZWQgdXNlcklkLCBmbGFnLCBlbmFibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IG5vcm1hbGl6ZWRGbGFnID0gcmF3RmxhZy5zdGFydHNXaXRoKFwiRkZfXCIpID8gcmF3RmxhZyA6IGBGRl8ke3Jhd0ZsYWd9YDtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBmbGFnOiB7IFM6IG5vcm1hbGl6ZWRGbGFnIH0sXG4gICAgICAgIGVuYWJsZWQ6IHsgQk9PTDogZW5hYmxlZCB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBvdmVycmlkZTogeyB1c2VySWQsIGZsYWc6IG5vcm1hbGl6ZWRGbGFnLCBlbmFibGVkLCB0cyB9IH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3N0YXRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0U3RhdHMoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvbWV0cmljcy9wYWdlLXZpZXdcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaW5jcmVtZW50UGFnZVZpZXcoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvcGhvdG9zL3VwbG9hZC11cmxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldEluc2lnaHRzVjIodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzL2ZlZWRiYWNrXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvZXN0aW1hdGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kRXN0aW1hdGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIHMzLFxuICAgICAgICBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgICAgcGhvdG9CdWNrZXROYW1lOiBidWNrZXQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9sb2ctY29uZmlybVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIXRhYmxlKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRm9vZCBsb2cgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RMb2dDb25maXJtKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvZXN0aW1hdGUtYnVyblwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5RXN0aW1hdGVCdXJuKGV2ZW50KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2xvZ1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJBY3Rpdml0eUxvZyh1c2VySWQsIGV2ZW50LCB7IGRkYiwgZW50cmllc1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9jYWxpYnJhdGlvblwiICYmIG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJBY3Rpdml0eUNhbGlicmF0aW9uUGF0Y2godXNlcklkLCBldmVudCwgeyBkZGIsIHNldHRpbmdzVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2VuZXJneS13ZWVrbHktc3VtbWFyeVwiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZVQgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIGNvbnN0IGRUID0gZ2V0UmVxdWlyZWRFbnYoXCJEQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUVcIiwgZGF5TWVhbEVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgY29uc3Qgc1QgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRW5lcmd5V2Vla2x5U3VtbWFyeSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZW50cmllc1RhYmxlTmFtZTogZVQsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgICAgc2V0dGluZ3NUYWJsZU5hbWU6IHNULFxuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9wcm9ncmVzcy1waG90b3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBsaXN0UHJvZ3Jlc3NQaG90b3ModXNlcklkKTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL3Byb2dyZXNzLXBob3Rvc1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBjcmVhdGVQcm9ncmVzc1Bob3RvKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvcHJvZ3Jlc3MtcGhvdG9zL2Fzc2Vzc21lbnRcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gYXNzZXNzUHJvZ3Jlc3NQaG90b3ModXNlcklkLCBldmVudCk7XG4gICAgfVxuICAgIGNvbnN0IHByb2dyZXNzRGVsTWF0Y2ggPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9wcm9ncmVzcy1waG90b3NcXC8oW14vXSspJC8pO1xuICAgIGlmIChwcm9ncmVzc0RlbE1hdGNoICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgcmV0dXJuIGRlbGV0ZVByb2dyZXNzUGhvdG8odXNlcklkLCBkZWNvZGVVUklDb21wb25lbnQocHJvZ3Jlc3NEZWxNYXRjaFsxXSA/PyBcIlwiKSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbWVhbC1jb21wbGV0ZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IGZvb2RUID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZm9vZFQgfHwgIW1UIHx8ICFkVCkge1xuICAgICAgICByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTWVhbENvbXBsZXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBmb29kTG9nVGFibGVOYW1lOiBmb29kVCxcbiAgICAgICAgbWVhbHNUYWJsZU5hbWU6IG1ULFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHMvc3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNTdWdnZXN0TWF0Y2godXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzTGlzdCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFsc1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzQ3JlYXRlKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVhbEhpc3RvcnlNYXRjaCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL21lYWxzXFwvKFteL10rKVxcL2hpc3RvcnkkLyk7XG4gICAgaWYgKG1lYWxIaXN0b3J5TWF0Y2ggJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzSGlzdG9yeSh1c2VySWQsIG1lYWxIaXN0b3J5TWF0Y2hbMV0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVhbFBhdGNoRGVsID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvbWVhbHNcXC8oW14vXSspJC8pO1xuICAgIGlmIChtZWFsUGF0Y2hEZWwgJiYgbWVhbFBhdGNoRGVsWzFdICE9PSBcInN1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNQYXRjaCh1c2VySWQsIG1lYWxQYXRjaERlbFsxXSwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuICAgIGlmIChtZWFsUGF0Y2hEZWwgJiYgbWVhbFBhdGNoRGVsWzFdICE9PSBcInN1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzRGVsZXRlKHVzZXJJZCwgbWVhbFBhdGNoRGVsWzFdLCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGRheU1lYWxMaXN0T3JDcmVhdGUgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9kYXlzXFwvKFtcXGQtXSspXFwvbWVhbC1lbnRyaWVzJC8pO1xuICAgIGlmIChkYXlNZWFsTGlzdE9yQ3JlYXRlICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QodXNlcklkLCBkYXlNZWFsTGlzdE9yQ3JlYXRlWzFdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cbiAgICBpZiAoZGF5TWVhbExpc3RPckNyZWF0ZSAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQgfHwgIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSh1c2VySWQsIGRheU1lYWxMaXN0T3JDcmVhdGVbMV0sIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgICBtZWFsc1RhYmxlTmFtZTogbVQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXlNZWFsRGVsID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvZGF5c1xcLyhbXFxkLV0rKVxcL21lYWwtZW50cmllc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKGRheU1lYWxEZWwgJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyeURlbGV0ZSh1c2VySWQsIGRheU1lYWxEZWxbMV0sIGRheU1lYWxEZWxbMl0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL3VzZXJzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZmVhdHVyZS1mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldEZlYXR1cmVGbGFnc0ZvclVzZXIodXNlcklkKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiBsaXN0RmVhdHVyZUZsYWdPdmVycmlkZXMoZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi9mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgcmV0dXJuIHVwc2VydEZlYXR1cmVGbGFnT3ZlcnJpZGUoZXZlbnQpO1xuICAgIH1cblxuICAgIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJOb3QgRm91bmRcIiB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlID09PSBcIkludmFsaWQgSlNPTlwiKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBKU09OXCIgfSk7XG4gICAgfVxuICAgIGNvbnNvbGUuZXJyb3IoXCJMYW1iZGEgaGFuZGxlciBlcnJvclwiLCBlcnJvcik7XG4gICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkludGVybmFsIFNlcnZlciBFcnJvclwiIH0pO1xuICB9XG59XG4iXX0=