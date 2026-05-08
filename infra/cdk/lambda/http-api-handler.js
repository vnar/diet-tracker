"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
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
    return {
        ok: true,
        data: {
            goalWeight: body.goalWeight,
            startWeight: body.startWeight,
            targetDate: body.targetDate,
            unit: body.unit,
            tone: body.tone,
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
        },
    });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUErd0NBLDBCQW1NQztBQWw5Q0QsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBRTdELHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsaURBS3dCO0FBQ3hCLDJDQVdxQjtBQUVyQixNQUFNLEdBQUcsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksZ0VBQTZCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3hELE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUMxRCxNQUFNLHdCQUF3QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDekUsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDO0FBQ3BGLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7QUFDcEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksS0FBSyxD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QUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDekUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUNoRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQzdELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDdkQsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN2RCxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLElBQUksS0FBSztRQUN4QyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLElBQUksS0FBSztRQUMxQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLElBQUksS0FBSztRQUNwQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLElBQUksS0FBSztRQUNwQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksU0FBUztRQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLElBQUksU0FBUztRQUNqQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLElBQUksU0FBUztRQUMvQyxlQUFlLEVBQUUs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QUUsQ0FBQztZQUN6RCxJQUFJLENBQUMsQ0FBQyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUM3RSxPQUFPLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLElBQUksS0FBSyxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQy9ELE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdDLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCxcbiAgR2V0VXNlckNvbW1hbmQsXG4gIExpc3RVc2Vyc0NvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtY29nbml0by1pZGVudGl0eS1wcm92aWRlclwiO1xuaW1wb3J0IHtcbiAgRHluYW1vREJDbGllbnQsXG4gIERlbGV0ZUl0ZW1Db21tYW5kLFxuICBHZXRJdGVtQ29tbWFuZCxcbiAgUHV0SXRlbUNvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbiAgU2NhbkNvbW1hbmQsXG4gIFVwZGF0ZUl0ZW1Db21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtczNcIjtcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gXCJAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lclwiO1xuaW1wb3J0IHR5cGUgeyBBaUluc2lnaHRTdHJ1Y3R1cmVkIH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9pbnNpZ2h0cy9haUluc2lnaHRTdHJ1Y3R1cmVkXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZUFpSW5zaWdodENhcmQgfSBmcm9tIFwiLi9pbnNpZ2h0cy1haS1jYXJkXCI7XG5pbXBvcnQgeyBoYW5kbGVWMkZvb2RFc3RpbWF0ZSwgaGFuZGxlVjJGb29kTG9nQ29uZmlybSB9IGZyb20gXCIuL2Zvb2QtbG9nLWFwaVwiO1xuaW1wb3J0IHtcbiAgaGFuZGxlVjJBY3Rpdml0eUNhbGlicmF0aW9uUGF0Y2gsXG4gIGhhbmRsZVYyQWN0aXZpdHlFc3RpbWF0ZUJ1cm4sXG4gIGhhbmRsZVYyQWN0aXZpdHlMb2csXG4gIGhhbmRsZVYyRW5lcmd5V2Vla2x5U3VtbWFyeSxcbn0gZnJvbSBcIi4vYWN0aXZpdHktYXBpXCI7XG5pbXBvcnQge1xuICBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlLFxuICBoYW5kbGVWMkRheU1lYWxFbnRyaWVzTGlzdCxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUsXG4gIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZSxcbiAgaGFuZGxlVjJNZWFsc0NyZWF0ZSxcbiAgaGFuZGxlVjJNZWFsc0RlbGV0ZSxcbiAgaGFuZGxlVjJNZWFsc0hpc3RvcnksXG4gIGhhbmRsZVYyTWVhbHNMaXN0LFxuICBoYW5kbGVWMk1lYWxzUGF0Y2gsXG4gIGhhbmRsZVYyTWVhbHNTdWdnZXN0TWF0Y2gsXG59IGZyb20gXCIuL21lYWxzLWFwaVwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgY29nbml0b0lkcCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5cbmNvbnN0IGVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBzZXR0aW5nc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlNFVFRJTkdTX1RBQkxFX05BTUU7XG5jb25zdCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5JTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU7XG5jb25zdCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTtcbmNvbnN0IHBob3RvQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlBIT1RPX0JVQ0tFVF9OQU1FO1xuY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GT09EX0xPR19FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBtZWFsc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52Lk1FQUxTX1RBQkxFX05BTUU7XG5jb25zdCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xuICBhY3Rpdml0eVRleHQ/OiBzdHJpbmc7XG4gIGFjdGl2aXR5U3VtbWFyeT86IHN0cmluZztcbiAgYWN0aXZpdHlCdXJuS2NhbD86IG51bWJlcjtcbiAgYWN0aXZpdHlNZXQ/OiBudW1iZXI7XG4gIGFjdGl2aXR5TWludXRlcz86IG51bWJlcjtcbiAgYWN0aXZpdHlDb25maWRlbmNlPzogbnVtYmVyO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbiAgdG9uZT86IFwiZnJpZW5kbHlcIiB8IFwiY2xpbmljYWxcIiB8IFwidG91Z2gtbG92ZVwiIHwgXCJheXVydmVkaWNcIjtcbiAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcj86IG51bWJlcjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7XG4gIHJvbGxpbmdXaW5kb3dEYXlzPzogbnVtYmVyO1xuICBjb21wYXJpc29uU3BhbkRheXM/OiBudW1iZXI7XG4gIG1heEF2Z01vdmVtZW50S2c/OiBudW1iZXI7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xuICBhY3Rpb246IHN0cmluZztcbiAgY2F0ZWdvcnk6IFwic29kaXVtXCIgfCBcImFsY29ob2xcIiB8IFwibGF0ZV9zbmFja1wiIHwgXCJ3b3Jrb3V0XCIgfCBcInBsYXRlYXVcIiB8IFwic3RyZWFrXCIgfCBcInRyYWplY3RvcnlcIjtcbiAgZ2VuZXJhdGlvblNvdXJjZT86IFwibGxtXCIgfCBcInJ1bGVzXCI7XG4gIGdlbmVyYXRlZEF0Pzogc3RyaW5nO1xuICBzdHJ1Y3R1cmVkPzogQWlJbnNpZ2h0U3RydWN0dXJlZDtcbiAgZGVncmFkZWQ/OiBib29sZWFuO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnZGbGFnVHJpU3RhdGUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHYgPSBwcm9jZXNzLmVudltuYW1lXTtcbiAgaWYgKHYgPT09IFwidHJ1ZVwiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHYgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVRleHQgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVRleHQgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVRleHQubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlUZXh0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IHVuZGVmaW5lZCAmJlxuICAgICh0eXBlb2YgYm9keS5hY3Rpdml0eVN1bW1hcnkgIT09IFwic3RyaW5nXCIgfHwgYm9keS5hY3Rpdml0eVN1bW1hcnkubGVuZ3RoID4gNTAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlTdW1tYXJ5XCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5hY3Rpdml0eUJ1cm5LY2FsKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUJ1cm5LY2FsXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1pbnV0ZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmFjdGl2aXR5TWludXRlcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWN0aXZpdHlNaW51dGVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5hY3Rpdml0eU1ldCAhPT0gdW5kZWZpbmVkICYmICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuYWN0aXZpdHlNZXQpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFjdGl2aXR5TWV0XCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICghaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LmFjdGl2aXR5Q29uZmlkZW5jZSkgfHwgYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgPiAxMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhY3Rpdml0eUNvbmZpZGVuY2VcIiB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBkYXRlOiBib2R5LmRhdGUsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBib2R5Lm1vcm5pbmdXZWlnaHQsXG4gICAgICBuaWdodFdlaWdodDogKGJvZHkubmlnaHRXZWlnaHQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGJvZHkuY2Fsb3JpZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogYm9keS5wcm90ZWluIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBib2R5LnN0ZXBzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBib2R5LnNsZWVwIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogYm9keS5sYXRlU25hY2sgYXMgYm9vbGVhbixcbiAgICAgIGhpZ2hTb2RpdW06IGJvZHkuaGlnaFNvZGl1bSBhcyBib29sZWFuLFxuICAgICAgd29ya291dDogYm9keS53b3Jrb3V0IGFzIGJvb2xlYW4sXG4gICAgICBhbGNvaG9sOiBib2R5LmFsY29ob2wgYXMgYm9vbGVhbixcbiAgICAgIHBob3RvVXJsOiAoYm9keS5waG90b1VybCBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBub3RlczogKGJvZHkubm90ZXMgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgYWN0aXZpdHlUZXh0OiBib2R5LmFjdGl2aXR5VGV4dCBhcyBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eVN1bW1hcnk6IGJvZHkuYWN0aXZpdHlTdW1tYXJ5IGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5QnVybktjYWw6IGJvZHkuYWN0aXZpdHlCdXJuS2NhbCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1ldDogYm9keS5hY3Rpdml0eU1ldCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBhY3Rpdml0eU1pbnV0ZXM6IGJvZHkuYWN0aXZpdHlNaW51dGVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGFjdGl2aXR5Q29uZmlkZW5jZTogYm9keS5hY3Rpdml0eUNvbmZpZGVuY2UgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU2V0dGluZ3MoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBTZXR0aW5nc1BhdGNoIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuZ29hbFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBnb2FsV2VpZ2h0XCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuc3RhcnRXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhcnRXZWlnaHRcIiB9O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LnRhcmdldERhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdGFyZ2V0RGF0ZVwiIH07XG4gIGlmIChib2R5LnVuaXQgIT09IFwia2dcIiAmJiBib2R5LnVuaXQgIT09IFwibGJzXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB1bml0XCIgfTtcbiAgaWYgKFxuICAgIGJvZHkudG9uZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS50b25lICE9PSBcImZyaWVuZGx5XCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiY2xpbmljYWxcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJ0b3VnaC1sb3ZlXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiYXl1cnZlZGljXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRvbmVcIiB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgICB0b25lOiBib2R5LnRvbmUgYXMgU2V0dGluZ3NQYXRjaFtcInRvbmVcIl0sXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Snd0Q2xhaW1zKGV2ZW50OiBIdHRwRXZlbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHJhdyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcztcbiAgaWYgKHJhdyA9PSBudWxsKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiByYXcgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBzdWIgPSBnZXRKd3RDbGFpbXMoZXZlbnQpPy5zdWI7XG4gIHJldHVybiB0eXBlb2Ygc3ViID09PSBcInN0cmluZ1wiID8gc3ViIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaXJzdE5hbWVGcm9tSnd0Q2xhaW1zKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWNsYWltcykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgZ2l2ZW4gPSBjbGFpbXMuZ2l2ZW5fbmFtZTtcbiAgaWYgKHR5cGVvZiBnaXZlbiA9PT0gXCJzdHJpbmdcIiAmJiBnaXZlbi50cmltKCkpIHJldHVybiBnaXZlbi50cmltKCk7XG4gIGNvbnN0IG5hbWUgPSBjbGFpbXMubmFtZTtcbiAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiICYmIG5hbWUudHJpbSgpKSB7XG4gICAgY29uc3QgZmlyc3QgPSBuYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdO1xuICAgIHJldHVybiBmaXJzdCB8fCB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oXG4gIGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiB8IHVuZGVmaW5lZCxcbik6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfCB1bmRlZmluZWQge1xuICBpZiAoIWl0ZW0pIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG91dDogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBjb25zdCBydyA9IGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzPy5OO1xuICBjb25zdCBzcGFuID0gaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzPy5OO1xuICBjb25zdCBtdiA9IGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2c/Lk47XG4gIGlmIChydyAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihydyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LnJvbGxpbmdXaW5kb3dEYXlzID0gbjtcbiAgfVxuICBpZiAoc3BhbiAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihzcGFuKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQuY29tcGFyaXNvblNwYW5EYXlzID0gbjtcbiAgfVxuICBpZiAobXYgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIobXYpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4gT2JqZWN0LmtleXMob3V0KS5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChcbiAgcmF3OiB1bmtub3duLFxuKTogeyBvazogdHJ1ZTsgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwbGF0ZWF1IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBvID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBkYXRhOiBQbGF0ZWF1VXNlclNldHRpbmdzID0ge307XG4gIGlmIChvLnJvbGxpbmdXaW5kb3dEYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8ucm9sbGluZ1dpbmRvd0RheXMpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5yb2xsaW5nV2luZG93RGF5c1wiIH07XG4gICAgZGF0YS5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKG8uY29tcGFyaXNvblNwYW5EYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8uY29tcGFyaXNvblNwYW5EYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzXCIgfTtcbiAgICBkYXRhLmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG8ubWF4QXZnTW92ZW1lbnRLZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLm1heEF2Z01vdmVtZW50S2cpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnXCIgfTtcbiAgICBkYXRhLm1heEF2Z01vdmVtZW50S2cgPSBuO1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhIH07XG59XG5cbi8qKiBHbWFpbCB0cmVhdHMgZG90cyBhbmQgK2xhYmVscyBhcyBhbGlhc2VzOyBub3JtYWxpemUgc28gYWRtaW4gbGlzdCBtYXRjaGVzIHJlYWwgc2lnbi1pbiBpZGVudGl0aWVzLiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGVtYWlsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBsb3dlciA9IGVtYWlsLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBhdCA9IGxvd2VyLmxhc3RJbmRleE9mKFwiQFwiKTtcbiAgaWYgKGF0IDw9IDApIHJldHVybiBsb3dlcjtcbiAgY29uc3QgbG9jYWwgPSBsb3dlci5zbGljZSgwLCBhdCk7XG4gIGNvbnN0IGRvbWFpbiA9IGxvd2VyLnNsaWNlKGF0ICsgMSk7XG4gIGlmIChkb21haW4gPT09IFwiZ21haWwuY29tXCIgfHwgZG9tYWluID09PSBcImdvb2dsZW1haWwuY29tXCIpIHtcbiAgICBjb25zdCBiYXNlTG9jYWwgPSAobG9jYWwuc3BsaXQoXCIrXCIpWzBdID8/IGxvY2FsKS5yZXBsYWNlKC9cXC4vZywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2VMb2NhbH1AJHtkb21haW59YDtcbiAgfVxuICByZXR1cm4gbG93ZXI7XG59XG5cbmZ1bmN0aW9uIGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpOiBTZXQ8c3RyaW5nPiB7XG4gIGNvbnN0IHJhdyA9IHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwidmloYXJuYXJAZ21haWwuY29tXCI7XG4gIGNvbnN0IHBhcnRzID0gcmF3XG4gICAgLnNwbGl0KFwiLFwiKVxuICAgIC5tYXAoKHMpID0+IG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChzLnRyaW0oKSkpXG4gICAgLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChwYXJ0cyk7XG4gIGlmIChzZXQuc2l6ZSA9PT0gMCkge1xuICAgIHNldC5hZGQobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKFwidmloYXJuYXJAZ21haWwuY29tXCIpKTtcbiAgfVxuICByZXR1cm4gc2V0O1xufVxuXG5jb25zdCBBRE1JTl9DTEFJTV9LRVlTID0gW1widXNlcm5hbWVcIiwgXCJjb2duaXRvOnVzZXJuYW1lXCIsIFwiZW1haWxcIiwgXCJwcmVmZXJyZWRfdXNlcm5hbWVcIl0gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nW10ge1xuICBjb25zdCBmb3VuZDogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZW1haWxpc2ggPSAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLztcbiAgZm9yIChjb25zdCBrZXkgb2YgQURNSU5fQ0xBSU1fS0VZUykge1xuICAgIGNvbnN0IHYgPSBjbGFpbXNba2V5XTtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGNsYWltcykpIHtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBbLi4ubmV3IFNldChmb3VuZCldO1xufVxuXG4vKiogVHJ1ZSBpZiBKV1QgY2xhaW1zIGluY2x1ZGUgYW4gZW1haWwgaWRlbnRpdHkgdGhhdCBtYXRjaGVzIHRoZSBjb25maWd1cmVkIGFkbWluIGFsbG93IGxpc3QuICovXG5mdW5jdGlvbiBpc0FkbWluQ2FsbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBib29sZWFuIHtcbiAgY29uc3QgY2xhaW1zID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KTtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXMpO1xuICBmb3IgKGNvbnN0IGMgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGMpKSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoZWFkZXJWYWx1ZShcbiAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCxcbiAgbmFtZTogc3RyaW5nLFxuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFoZWFkZXJzKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCB3YW50ID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhoZWFkZXJzKSkge1xuICAgIGlmIChrLnRvTG93ZXJDYXNlKCkgPT09IHdhbnQgJiYgdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgdi5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gdjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBKV1QgSFRUUCBBUEkgYXV0aG9yaXplcnMgdmFsaWRhdGUgQXV0aG9yaXphdGlvbiBidXQgdHlwaWNhbGx5IGRvIG5vdCBmb3J3YXJkIHRoYXQgaGVhZGVyIHRvIExhbWJkYS5cbiAqIENsaWVudHMgYWxzbyBzZW5kIHgtY29nbml0by1hY2Nlc3MtdG9rZW4gKHNlZSBmcm9udGVuZC1hcGktY2xpZW50KSBzbyB3ZSBjYW4gY2FsbCBjb2duaXRvLWlkcDpHZXRVc2VyLlxuICovXG5mdW5jdGlvbiBiZWFyZXJBY2Nlc3NUb2tlbihldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgaCA9IGV2ZW50LmhlYWRlcnM7XG4gIGNvbnN0IGN1c3RvbSA9IGhlYWRlclZhbHVlKGgsIFwieC1jb2duaXRvLWFjY2Vzcy10b2tlblwiKTtcbiAgaWYgKGN1c3RvbT8udHJpbSgpKSByZXR1cm4gY3VzdG9tLnRyaW0oKTtcbiAgY29uc3QgcmF3ID0gaGVhZGVyVmFsdWUoaCwgXCJhdXRob3JpemF0aW9uXCIpO1xuICBpZiAoIXJhdykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgbSA9IHJhdy5tYXRjaCgvXkJlYXJlclxccysoLispJC9pKTtcbiAgcmV0dXJuIG0/LlsxXT8udHJpbSgpO1xufVxuXG4vKiogV2hlbiBjbGFpbXMgbGFjayBhIHJlc29sdmFibGUgZW1haWwsIHZlcmlmeSBhZG1pbiB2aWEgR2V0VXNlcjsgdG9rZW4gc3ViIG11c3QgbWF0Y2ggSldUIHN1Yi4gKi9cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgdG9rZW4gPSBiZWFyZXJBY2Nlc3NUb2tlbihldmVudCk7XG4gIGlmICghdG9rZW4pIHJldHVybiBmYWxzZTtcbiAgY29uc3Qgand0U3ViID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgaWYgKCFqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQobmV3IEdldFVzZXJDb21tYW5kKHsgQWNjZXNzVG9rZW46IHRva2VuIH0pKTtcbiAgICBjb25zdCBhdHRycyA9IG91dC5Vc2VyQXR0cmlidXRlcyA/PyBbXTtcbiAgICBjb25zdCB0b2tlblN1YiA9IGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJzdWJcIik/LlZhbHVlO1xuICAgIGlmICh0b2tlblN1YiAhPT0gand0U3ViKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZW1haWwgPVxuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcImVtYWlsXCIpPy5WYWx1ZSA/P1xuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInByZWZlcnJlZF91c2VybmFtZVwiKT8uVmFsdWU7XG4gICAgY29uc3QgZnJvbVVzZXJuYW1lID0gb3V0LlVzZXJuYW1lPy5pbmNsdWRlcyhcIkBcIikgPyBvdXQuVXNlcm5hbWUgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgY2FuZGlkYXRlID0gKGVtYWlsID8/IGZyb21Vc2VybmFtZSA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIWNhbmRpZGF0ZSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGNhbmRpZGF0ZSkpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaXNBZG1pbkFsbG93ZWQoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAoaXNBZG1pbkNhbGxlcihldmVudCkpIHJldHVybiB0cnVlO1xuICByZXR1cm4gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQpO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0RGF0ZSgpOiBzdHJpbmcge1xuICBjb25zdCBkID0gbmV3IERhdGUoKTtcbiAgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpICsgMTE4KTtcbiAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHBob3RvVXJsOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFwaG90b1VybCB8fCB0eXBlb2YgcGhvdG9VcmwgIT09IFwic3RyaW5nXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmIChwaG90b1VybC5zdGFydHNXaXRoKFwiczM6Ly9cIikpIHJldHVybiBwaG90b1VybDtcbiAgaWYgKCFwaG90b1VybC5pbmNsdWRlcyhcIjovL1wiKSkge1xuICAgIGNvbnN0IGtleU9ubHkgPSBwaG90b1VybC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGlmICgha2V5T25seSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBpZiAocGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtwaG90b0J1Y2tldE5hbWV9LyR7a2V5T25seX1gO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTChwaG90b1VybCk7XG4gICAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQocGFyc2VkLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgXCJcIikpO1xuICAgIGlmICghcGF0aCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIC8vIFZpcnR1YWwtaG9zdGVkLXN0eWxlIFVSTDogYnVja2V0LnMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgdmlydHVhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAodmlydHVhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHt2aXJ0dWFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBMZWdhY3kgZ2xvYmFsIGVuZHBvaW50OiBidWNrZXQuczMuYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCBnbG9iYWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmIChnbG9iYWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7Z2xvYmFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBQYXRoLXN0eWxlIFVSTDogczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9idWNrZXQva2V5XG4gICAgaWYgKC9eczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvLnRlc3QoaG9zdCkgfHwgaG9zdCA9PT0gXCJzMy5hbWF6b25hd3MuY29tXCIpIHtcbiAgICAgIGNvbnN0IHNsYXNoID0gcGF0aC5pbmRleE9mKFwiL1wiKTtcbiAgICAgIGlmIChzbGFzaCA8PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgYnVja2V0ID0gcGF0aC5zbGljZSgwLCBzbGFzaCk7XG4gICAgICBjb25zdCBrZXkgPSBwYXRoLnNsaWNlKHNsYXNoICsgMSk7XG4gICAgICBpZiAoIWJ1Y2tldCB8fCAha2V5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGBzMzovLyR7YnVja2V0fS8ke2tleX1gO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzb3J0QnlEYXRlQXNjPFQgZXh0ZW5kcyB7IGRhdGU6IHN0cmluZyB9Pihyb3dzOiBUW10pOiBUW10ge1xuICByZXR1cm4gWy4uLnJvd3NdLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xufVxuXG5mdW5jdGlvbiBhdmVyYWdlKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gdmFsdWVzLnJlZHVjZSgoYWNjLCB2YWx1ZSkgPT4gYWNjICsgdmFsdWUsIDApIC8gdmFsdWVzLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gcm91bmQyKHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5yb3VuZCh2YWx1ZSAqIDEwMCkgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIG5leHRNb3JuaW5nRGVsdGFzKFxuICBsb2dzOiBTdG9yZWRFbnRyeVtdLFxuICBwcmVkaWNhdGU6IChsb2c6IFN0b3JlZEVudHJ5KSA9PiBib29sZWFuLFxuKTogeyBmbGFnZ2VkOiBudW1iZXJbXTsgYmFzZWxpbmU6IG51bWJlcltdIH0ge1xuICBjb25zdCBzb3J0ZWQgPSBzb3J0QnlEYXRlQXNjKGxvZ3MpO1xuICBjb25zdCBmbGFnZ2VkOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBiYXNlbGluZTogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgc29ydGVkLmxlbmd0aCAtIDE7IGlkeCArPSAxKSB7XG4gICAgY29uc3QgZGVsdGEgPSBzb3J0ZWRbaWR4ICsgMV0ubW9ybmluZ1dlaWdodCAtIHNvcnRlZFtpZHhdLm1vcm5pbmdXZWlnaHQ7XG4gICAgaWYgKHByZWRpY2F0ZShzb3J0ZWRbaWR4XSkpIGZsYWdnZWQucHVzaChkZWx0YSk7XG4gICAgZWxzZSBiYXNlbGluZS5wdXNoKGRlbHRhKTtcbiAgfVxuICByZXR1cm4geyBmbGFnZ2VkLCBiYXNlbGluZSB9O1xufVxuXG5mdW5jdGlvbiBzb2RpdW1JbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuaGlnaFNvZGl1bSk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYHNvZGl1bS1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcInNvZGl1bUJ1bXBcIixcbiAgICBwcmlvcml0eTogOTUsXG4gICAgaGVhZGxpbmU6IFwiSGlnaC1zb2RpdW0gZGF5cyBhcmUgbGlua2VkIHRvIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHdlaWdoLWlucy5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdnMgeW91ciBub24tc29kaXVtIGJhc2VsaW5lIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBoaWdoLXNvZGl1bSBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBvbiBoaWdoLXNvZGl1bSBkYXlzOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiVHJ5IG9uZSBsb3dlci1zb2RpdW0gZGlubmVyIHN3YXAgdG9uaWdodC5cIixcbiAgICBjYXRlZ29yeTogXCJzb2RpdW1cIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYWxjb2hvbEluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5hbGNvaG9sKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgYWxjb2hvbC1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImFsY29ob2xcIixcbiAgICBwcmlvcml0eTogOTAsXG4gICAgaGVhZGxpbmU6IFwiQWxjb2hvbCBkYXlzIHRlbmQgdG8gc2hvdyBhIG5leHQtZGF5IHdlaWdodCBidW1wLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2ZXJzdXMgbm9uLWFsY29ob2wgZGF5cyB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gYWxjb2hvbC1sb2dnZWQgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2UgYWZ0ZXIgYWxjb2hvbDogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlBsYW4gYWxjb2hvbC1mcmVlIHdlZWtkYXlzIGZvciBzdGVhZGllciB0cmVuZCBsaW5lcy5cIixcbiAgICBjYXRlZ29yeTogXCJhbGNvaG9sXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGxhdGVTbmFja0luc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5sYXRlU25hY2spO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBsYXRlLXNuYWNrLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwibGF0ZVNuYWNrXCIsXG4gICAgcHJpb3JpdHk6IDg4LFxuICAgIGhlYWRsaW5lOiBcIkxhdGUgc25hY2tzIGFyZSBjb3JyZWxhdGVkIHdpdGggaGVhdmllciBuZXh0LW1vcm5pbmcgc2NhbGUgcmVhZGluZ3MuXCIsXG4gICAgZGV0YWlsOiBgWW91ciBuZXh0LWRheSBjaGFuZ2UgaXMgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIGhpZ2hlciB0aGFuIHlvdXIgbm9uLWxhdGUtc25hY2sgYmFzZWxpbmUuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBsYXRlLXNuYWNrIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIHdpdGggbGF0ZSBzbmFjazogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlNldCBhIDItaG91ciBraXRjaGVuIGNsb3NlIHRpbWUgYmVmb3JlIGJlZC5cIixcbiAgICBjYXRlZ29yeTogXCJsYXRlX3NuYWNrXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGJhc2VsaW5lSW5zaWdodFdpdGhMb2dzKGVudHJ5Q291bnQ6IG51bWJlciwgbGF0ZXN0RGF0ZTogc3RyaW5nKTogSW5zaWdodENhcmQge1xuICByZXR1cm4ge1xuICAgIGlkOiBgYmFzZWxpbmUtaW5zaWdodC0ke2xhdGVzdERhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiR3JlYXQgY29uc2lzdGVuY3kgc28gZmFyIOKAlCBrZWVwIGxvZ2dpbmcgZGFpbHkgZm9yIHNoYXJwZXIgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJXZSBuZWVkIGEgYml0IG1vcmUgc2lnbmFsIHRvIGRldGVjdCBzdHJvbmcgcGVyc29uYWwgcGF0dGVybnMsIGJ1dCB5b3VyIGRhdGEgZmxvdyBpcyBhY3RpdmUuXCIsXG4gICAgd2h5OiBbXG4gICAgICBgJHtlbnRyeUNvdW50fSBsb2dzIGFuYWx5emVkIGZyb20gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBcIk5vIHJ1bGUgY3Jvc3NlZCBjb25maWRlbmNlIHRocmVzaG9sZHMgeWV0XCIsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiS2VlcCB0cmFja2luZyBkYWlseSBoYWJpdHMgYW5kIHdlaWdodCB0byB1bmxvY2sgc3Ryb25nZXIgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGNhdGVnb3J5OiBcInN0cmVha1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHROb0xvZ3MoYXNPZkRhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHthc09mRGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJiYXNlbGluZVwiLFxuICAgIHByaW9yaXR5OiAxMCxcbiAgICBoZWFkbGluZTogXCJTdGFydCBsb2dnaW5nIHdlaWdodCBhbmQgaGFiaXRzIHRvIHVubG9jayBwZXJzb25hbGl6ZWQgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOiBcIk9uY2UgeW91IGhhdmUgYSBmZXcgd2Vla3Mgb2YgZW50cmllcywgd2Ugd2lsbCBoaWdobGlnaHQgcGF0dGVybnMgdGhhdCBtYXRjaCB5b3VyIGRhdGEuXCIsXG4gICAgd2h5OiBbXCJObyBlbnRyaWVzIGZvdW5kIGluIHRoZSBsYXN0IDkwIGRheXNcIl0sXG4gICAgYWN0aW9uOiBcIkFkZCB0b2RheSdzIHdlaWdodCBvbiB0aGUgbGVmdCB0byBiZWdpbi5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5zaWdodHNWMih1c2VySWQ6IHN0cmluZywgX2V2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRvID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZnJvbURhdGUgPSBuZXcgRGF0ZSgpO1xuICBmcm9tRGF0ZS5zZXREYXRlKGZyb21EYXRlLmdldERhdGUoKSAtIDg5KTtcbiAgY29uc3QgZnJvbSA9IGZyb21EYXRlLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOmZyb21EYXRlXCI6IHsgUzogZnJvbSB9LFxuICAgICAgICBcIjp0b0RhdGVcIjogeyBTOiB0byB9LFxuICAgICAgfSxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZW50cmllc1JhdyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICB9KSxcbiAgKS5maWx0ZXIoKGUpID0+IGUuZGF0ZSAmJiBlLm1vcm5pbmdXZWlnaHQgPiAwKTtcblxuICBjb25zdCBzZXR0aW5nc1RhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgc2V0dGluZ3NSb3cgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBzZXR0aW5nc1RhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGdJdGVtID0gc2V0dGluZ3NSb3cuSXRlbTtcbiAgY29uc3QgZ29hbFdlaWdodCA9IGdJdGVtID8gTnVtYmVyKGdJdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpIDogNzI7XG4gIGNvbnN0IHN0YXJ0V2VpZ2h0ID0gZ0l0ZW0gPyBOdW1iZXIoZ0l0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpIDogODU7XG4gIGNvbnN0IHRhcmdldERhdGUgPSBnSXRlbT8udGFyZ2V0RGF0ZT8uUyA/PyB0bztcblxuICBjb25zdCBpbnNpZ2h0cyA9IGF3YWl0IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZChkZGIsIHtcbiAgICB1c2VySWQsXG4gICAgZW50cmllc1JhdyxcbiAgICBnb2FsV2VpZ2h0LFxuICAgIHN0YXJ0V2VpZ2h0LFxuICAgIHRhcmdldERhdGUsXG4gICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lLFxuICB9KTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGluc2lnaHRzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FXCIsIGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgaW5zaWdodElkID0gdHlwZW9mIGJvZHkuaW5zaWdodElkID09PSBcInN0cmluZ1wiID8gYm9keS5pbnNpZ2h0SWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qgdm90ZSA9IGJvZHkudm90ZSA9PT0gXCJ1cFwiIHx8IGJvZHkudm90ZSA9PT0gXCJkb3duXCIgPyBib2R5LnZvdGUgOiBudWxsO1xuICBpZiAoIWluc2lnaHRJZCB8fCAhdm90ZSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgaW5zaWdodCBmZWVkYmFjayBwYXlsb2FkXCIgfSk7XG4gIGNvbnN0IGNvbW1lbnRSYXcgPSBib2R5LmNvbW1lbnQ7XG4gIGNvbnN0IGNvbW1lbnQgPVxuICAgIHR5cGVvZiBjb21tZW50UmF3ID09PSBcInN0cmluZ1wiICYmIGNvbW1lbnRSYXcudHJpbSgpLmxlbmd0aCA+IDBcbiAgICAgID8gY29tbWVudFJhdy50cmltKCkuc2xpY2UoMCwgMjAwMClcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCBmZWVkYmFja1R5cGUgPSBib2R5LmZlZWRiYWNrVHlwZSA9PT0gXCJuZWdhdGl2ZVwiID8gXCJuZWdhdGl2ZVwiIDogdW5kZWZpbmVkO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGluc2lnaHRUczogeyBTOiBgJHt0c30jJHtpbnNpZ2h0SWR9YCB9LFxuICAgICAgICBpbnNpZ2h0SWQ6IHsgUzogaW5zaWdodElkIH0sXG4gICAgICAgIHZvdGU6IHsgUzogdm90ZSB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgICAuLi4oY29tbWVudCA/IHsgY29tbWVudDogeyBTOiBjb21tZW50IH0gfSA6IHt9KSxcbiAgICAgICAgLi4uKGZlZWRiYWNrVHlwZSA/IHsgZmVlZGJhY2tUeXBlOiB7IFM6IGZlZWRiYWNrVHlwZSB9IH0gOiB7fSksXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEVudHJpZXModXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZnJvbSA9IHF1ZXJ5Py5mcm9tO1xuICBjb25zdCB0byA9IHF1ZXJ5Py50bztcbiAgaWYgKGZyb20gJiYgIWlzRGF0ZVN0cmluZyhmcm9tKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZnJvbSBkYXRlXCIgfSk7XG4gIGlmICh0byAmJiAhaXNEYXRlU3RyaW5nKHRvKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgdG8gZGF0ZVwiIH0pO1xuXG4gIGNvbnN0IGV4cHJlc3Npb25WYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHsgUzogc3RyaW5nIH0+ID0geyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9O1xuICBsZXQga2V5Q29uZGl0aW9uID0gXCJ1c2VySWQgPSA6dXNlcklkXCI7XG4gIGlmIChmcm9tICYmIHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfSBlbHNlIGlmIChmcm9tKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA+PSA6ZnJvbURhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gIH0gZWxzZSBpZiAodG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIDw9IDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfVxuXG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBrZXlDb25kaXRpb24sXG4gICAgICAuLi4oa2V5Q29uZGl0aW9uLmluY2x1ZGVzKFwiI2RhdGVcIilcbiAgICAgICAgPyB7IEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0gfVxuICAgICAgICA6IHt9KSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25WYWx1ZXMsXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICBpZDogaXRlbS5pZD8uUyA/PyBgJHt1c2VySWR9OiR7aXRlbS5kYXRlPy5TID8/IFwiXCJ9YCxcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHVzZXJJZCxcbiAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIHBob3RvVXJsOiBpdGVtLnBob3RvVXJsPy5TID8/IHVuZGVmaW5lZCxcbiAgICBub3RlczogaXRlbS5ub3Rlcz8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlUZXh0OiBpdGVtLmFjdGl2aXR5VGV4dD8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlTdW1tYXJ5OiBpdGVtLmFjdGl2aXR5U3VtbWFyeT8uUyA/PyB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlCdXJuS2NhbDogaXRlbS5hY3Rpdml0eUJ1cm5LY2FsPy5OID8gTnVtYmVyKGl0ZW0uYWN0aXZpdHlCdXJuS2NhbC5OKSA6IHVuZGVmaW5lZCxcbiAgICBhY3Rpdml0eU1ldDogaXRlbS5hY3Rpdml0eU1ldD8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5TWV0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGFjdGl2aXR5TWludXRlczogaXRlbS5hY3Rpdml0eU1pbnV0ZXM/Lk4gPyBOdW1iZXIoaXRlbS5hY3Rpdml0eU1pbnV0ZXMuTikgOiB1bmRlZmluZWQsXG4gICAgYWN0aXZpdHlDb25maWRlbmNlOiBpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZT8uTiA/IE51bWJlcihpdGVtLmFjdGl2aXR5Q29uZmlkZW5jZS5OKSA6IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLmFjdGl2aXR5VGV4dCA9PT0gXCJzdHJpbmdcIikgaXRlbS5hY3Rpdml0eVRleHQgPSB7IFM6IGRhdGEuYWN0aXZpdHlUZXh0IH07XG4gIGlmICh0eXBlb2YgZGF0YS5hY3Rpdml0eVN1bW1hcnkgPT09IFwic3RyaW5nXCIpIGl0ZW0uYWN0aXZpdHlTdW1tYXJ5ID0geyBTOiBkYXRhLmFjdGl2aXR5U3VtbWFyeSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUJ1cm5LY2FsICE9PSB1bmRlZmluZWQpIGl0ZW0uYWN0aXZpdHlCdXJuS2NhbCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlCdXJuS2NhbCkgfTtcbiAgaWYgKGRhdGEuYWN0aXZpdHlNZXQgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eU1ldCA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNZXQpIH07XG4gIGlmIChkYXRhLmFjdGl2aXR5TWludXRlcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmFjdGl2aXR5TWludXRlcyA9IHsgTjogU3RyaW5nKGRhdGEuYWN0aXZpdHlNaW51dGVzKSB9O1xuICBpZiAoZGF0YS5hY3Rpdml0eUNvbmZpZGVuY2UgIT09IHVuZGVmaW5lZCkgaXRlbS5hY3Rpdml0eUNvbmZpZGVuY2UgPSB7IE46IFN0cmluZyhkYXRhLmFjdGl2aXR5Q29uZmlkZW5jZSkgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgIH0pLFxuICApO1xuXG4gIGlmICghb3V0Lkl0ZW0pIHtcbiAgICBjb25zdCBzZXR0aW5nczogU3RvcmVkU2V0dGluZ3MgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBnb2FsV2VpZ2h0OiA3MixcbiAgICAgIHN0YXJ0V2VpZ2h0OiA4NSxcbiAgICAgIHRhcmdldERhdGU6IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBcImtnXCIsXG4gICAgICB0b25lOiBcImZyaWVuZGx5XCIsXG4gICAgfTtcbiAgICBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLmdvYWxXZWlnaHQpIH0sXG4gICAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLnN0YXJ0V2VpZ2h0KSB9LFxuICAgICAgICAgIHRhcmdldERhdGU6IHsgUzogc2V0dGluZ3MudGFyZ2V0RGF0ZSB9LFxuICAgICAgICAgIHVuaXQ6IHsgUzogc2V0dGluZ3MudW5pdCB9LFxuICAgICAgICAgIHRvbmU6IHsgUzogc2V0dGluZ3MudG9uZSA/PyBcImZyaWVuZGx5XCIgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICBzZXR0aW5nczoge1xuICAgICAgICBnb2FsV2VpZ2h0OiBzZXR0aW5ncy5nb2FsV2VpZ2h0LFxuICAgICAgICBzdGFydFdlaWdodDogc2V0dGluZ3Muc3RhcnRXZWlnaHQsXG4gICAgICAgIHRhcmdldERhdGU6IHNldHRpbmdzLnRhcmdldERhdGUsXG4gICAgICAgIHVuaXQ6IHNldHRpbmdzLnVuaXQsXG4gICAgICAgIHRvbmU6IHNldHRpbmdzLnRvbmUsXG4gICAgICAgIHBsYXRlYXU6IHVuZGVmaW5lZCxcbiAgICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3Rvcjogc2V0dGluZ3MuYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvciA/PyAxLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MiksXG4gICAgICBzdGFydFdlaWdodDogTnVtYmVyKG91dC5JdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSxcbiAgICAgIHRhcmdldERhdGU6IG91dC5JdGVtLnRhcmdldERhdGU/LlMgPz8gZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IG91dC5JdGVtLnVuaXQ/LlMgPT09IFwibGJzXCIgPyBcImxic1wiIDogXCJrZ1wiLFxuICAgICAgdG9uZTpcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwidG91Z2gtbG92ZVwiIHx8XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCJcbiAgICAgICAgICA/IG91dC5JdGVtLnRvbmUuU1xuICAgICAgICAgIDogXCJmcmllbmRseVwiLFxuICAgICAgcGxhdGVhdTogcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0ob3V0Lkl0ZW0pLFxuICAgICAgYWN0aXZpdHlDYWxpYnJhdGlvbkZhY3RvcjogTnVtYmVyKG91dC5JdGVtLmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSksXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhdGNoU2V0dGluZ3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgZXhpc3RpbmdPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZVNldHRpbmdzKHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuXG4gIGNvbnN0IGV4aXN0aW5nVG9uZSA9XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJmcmllbmRseVwiXG4gICAgICA/IGV4aXN0aW5nT3V0Lkl0ZW0udG9uZS5TXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgY29uc3QgdG9uZSA9IGRhdGEudG9uZSA/PyBleGlzdGluZ1RvbmUgPz8gXCJmcmllbmRseVwiO1xuICBjb25zdCBleGlzdGluZ0NhbGlicmF0aW9uID0gTnVtYmVyKGV4aXN0aW5nT3V0Lkl0ZW0/LmFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I/Lk4gPz8gMSk7XG5cbiAgbGV0IG5leHRQbGF0ZWF1ID0gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oZXhpc3RpbmdPdXQuSXRlbSk7XG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYm9keSwgXCJwbGF0ZWF1XCIpKSB7XG4gICAgY29uc3QgcmF3UGxhdGVhdSA9IGJvZHkucGxhdGVhdTtcbiAgICBpZiAocmF3UGxhdGVhdSA9PT0gbnVsbCkge1xuICAgICAgbmV4dFBsYXRlYXUgPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHAgPSB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChyYXdQbGF0ZWF1KTtcbiAgICAgIGlmICghcC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHAuZXJyb3IgfSk7XG4gICAgICBuZXh0UGxhdGVhdSA9IHsgLi4ubmV4dFBsYXRlYXUsIC4uLnAuZGF0YSB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5nb2FsV2VpZ2h0KSB9LFxuICAgIHN0YXJ0V2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLnN0YXJ0V2VpZ2h0KSB9LFxuICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgdW5pdDogeyBTOiBkYXRhLnVuaXQgfSxcbiAgICB0b25lOiB7IFM6IHRvbmUgfSxcbiAgfTtcbiAgaWYgKG5leHRQbGF0ZWF1Py5yb2xsaW5nV2luZG93RGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Um9sbGluZ1dpbmRvd0RheXMgPSB7IE46IFN0cmluZyhNYXRoLnJvdW5kKG5leHRQbGF0ZWF1LnJvbGxpbmdXaW5kb3dEYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/LmNvbXBhcmlzb25TcGFuRGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5jb21wYXJpc29uU3BhbkRheXMpKSB9O1xuICB9XG4gIGlmIChuZXh0UGxhdGVhdT8ubWF4QXZnTW92ZW1lbnRLZyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1TWF4TW92ZW1lbnRLZyA9IHsgTjogU3RyaW5nKG5leHRQbGF0ZWF1Lm1heEF2Z01vdmVtZW50S2cpIH07XG4gIH1cbiAgaXRlbS5hY3Rpdml0eUNhbGlicmF0aW9uRmFjdG9yID0geyBOOiBTdHJpbmcoZXhpc3RpbmdDYWxpYnJhdGlvbikgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBkYXRhLmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogZGF0YS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGRhdGEudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGRhdGEudW5pdCxcbiAgICAgIHRvbmUsXG4gICAgICBwbGF0ZWF1OiBuZXh0UGxhdGVhdSxcbiAgICAgIGFjdGl2aXR5Q2FsaWJyYXRpb25GYWN0b3I6IGV4aXN0aW5nQ2FsaWJyYXRpb24sXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgY29udGVudFR5cGUgPVxuICAgIHR5cGVvZiBib2R5LmNvbnRlbnRUeXBlID09PSBcInN0cmluZ1wiICYmIGJvZHkuY29udGVudFR5cGUubGVuZ3RoID4gMFxuICAgICAgPyBib2R5LmNvbnRlbnRUeXBlXG4gICAgICA6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIGNvbnN0IGZpbGVOYW1lID0gdHlwZW9mIGJvZHkuZmlsZU5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmZpbGVOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21GaWxlTmFtZSA9IGZpbGVOYW1lLm1hdGNoKC9cXC4oW2EtekEtWjAtOV0rKSQvKT8uWzFdPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21Cb2R5ID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGV4dGVuc2lvbiA9XG4gICAgZXh0RnJvbUZpbGVOYW1lICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tRmlsZU5hbWUpXG4gICAgICA/IGV4dEZyb21GaWxlTmFtZVxuICAgICAgOiBleHRGcm9tQm9keSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUJvZHkpXG4gICAgICAgID8gZXh0RnJvbUJvZHlcbiAgICAgICAgOiBcImpwZ1wiO1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBraW5kID0gdHlwZW9mIGJvZHkua2luZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkua2luZC50cmltKCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIGNvbnN0IGtleSA9XG4gICAga2luZCA9PT0gXCJmb29kXCJcbiAgICAgID8gYCR7dXNlcklkfS9mb29kLyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gXG4gICAgICA6IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBmcm9tRGIgPSAob3V0Lkl0ZW1zID8/IFtdKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KChhY2MsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBmbGFnID0gaXRlbS5mbGFnPy5TO1xuICAgIGNvbnN0IGVuYWJsZWRSYXcgPSBpdGVtLmVuYWJsZWQ/LkJPT0w7XG4gICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBlbmFibGVkUmF3ID09PSBcImJvb2xlYW5cIikge1xuICAgICAgYWNjW2ZsYWddID0gZW5hYmxlZFJhdztcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuXG4gIGNvbnN0IHNlcnZlckRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBjb25zdCBwaG90b0Zvb2QgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QSE9UT19GT09EX0xPR1wiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfUEhPVE9fRk9PRF9MT0cgPSBwaG90b0Zvb2QgIT09IGZhbHNlO1xuICBjb25zdCBtZWFsTGlicmFyeSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX01FQUxfTElCUkFSWVwiKTtcbiAgc2VydmVyRGVmYXVsdHMuRkZfTUVBTF9MSUJSQVJZID0gbWVhbExpYnJhcnkgIT09IGZhbHNlO1xuICBjb25zdCBubE1lYWxQYXJzZSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX05MX01FQUxfUEFSU0VcIik7XG4gIHNlcnZlckRlZmF1bHRzLkZGX05MX01FQUxfUEFSU0UgPSBubE1lYWxQYXJzZSAhPT0gZmFsc2U7XG5cbiAgY29uc3Qgb3ZlcnJpZGVzID0geyAuLi5zZXJ2ZXJEZWZhdWx0cywgLi4uZnJvbURiIH07XG4gIHJldHVybiBqc29uKDIwMCwgeyB1c2VySWQsIG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0YXJnZXRVc2VySWQgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnVzZXJJZDtcbiAgaWYgKCF0YXJnZXRVc2VySWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTWlzc2luZyB1c2VySWQgcXVlcnkgcGFyYW1ldGVyXCIgfSk7XG4gIH1cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjp1c2VySWRcIjogeyBTOiB0YXJnZXRVc2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG92ZXJyaWRlcyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcCgoaXRlbSkgPT4gKHtcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHRhcmdldFVzZXJJZCxcbiAgICBmbGFnOiBpdGVtLmZsYWc/LlMgPz8gXCJcIixcbiAgICBlbmFibGVkOiBpdGVtLmVuYWJsZWQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgdHM6IGl0ZW0udHM/LlMgPz8gXCJcIixcbiAgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHVzZXJJZCA9IHR5cGVvZiBib2R5LnVzZXJJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkudXNlcklkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHJhd0ZsYWcgPSB0eXBlb2YgYm9keS5mbGFnID09PSBcInN0cmluZ1wiID8gYm9keS5mbGFnLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGVuYWJsZWQgPSB0eXBlb2YgYm9keS5lbmFibGVkID09PSBcImJvb2xlYW5cIiA/IGJvZHkuZW5hYmxlZCA6IG51bGw7XG4gIGlmICghdXNlcklkIHx8ICFyYXdGbGFnIHx8IGVuYWJsZWQgPT09IG51bGwpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwYXlsb2FkLiBFeHBlY3RlZCB1c2VySWQsIGZsYWcsIGVuYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgbm9ybWFsaXplZEZsYWcgPSByYXdGbGFnLnN0YXJ0c1dpdGgoXCJGRl9cIikgPyByYXdGbGFnIDogYEZGXyR7cmF3RmxhZ31gO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGZsYWc6IHsgUzogbm9ybWFsaXplZEZsYWcgfSxcbiAgICAgICAgZW5hYmxlZDogeyBCT09MOiBlbmFibGVkIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIG92ZXJyaWRlOiB7IHVzZXJJZCwgZmxhZzogbm9ybWFsaXplZEZsYWcsIGVuYWJsZWQsIHRzIH0gfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1c2VySWQgPSBnZXRVc2VySWQoZXZlbnQpO1xuICAgIGlmICghdXNlcklkKSByZXR1cm4ganNvbig0MDEsIHsgZXJyb3I6IFwiVW5hdXRob3JpemVkXCIgfSk7XG4gICAgY29uc3QgbWV0aG9kID0gKFxuICAgICAgZXZlbnQgYXMgeyByZXF1ZXN0Q29udGV4dD86IHsgaHR0cD86IHsgbWV0aG9kPzogc3RyaW5nIH0gfSB9XG4gICAgKS5yZXF1ZXN0Q29udGV4dD8uaHR0cD8ubWV0aG9kO1xuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2VudHJpZXNcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0RW50cmllcyh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICAgIHJldHVybiB1cHNlcnRFbnRyeSh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgcmV0dXJuIGRlbGV0ZUVudHJ5KHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc2V0dGluZ3NcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0U2V0dGluZ3ModXNlcklkKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgICByZXR1cm4gcGF0Y2hTZXR0aW5ncyh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc3RhdHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRTdGF0cygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9tZXRyaWNzL3BhZ2Utdmlld1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBpbmNyZW1lbnRQYWdlVmlldygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9waG90b3MvdXBsb2FkLXVybFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBjcmVhdGVVcGxvYWRVcmwodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0SW5zaWdodHNWMih1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHMvZmVlZGJhY2tcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9lc3RpbWF0ZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gICAgICBpZiAoIXRhYmxlKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRm9vZCBsb2cgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RFc3RpbWF0ZSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgczMsXG4gICAgICAgIGZvb2RMb2dUYWJsZU5hbWU6IHRhYmxlLFxuICAgICAgICBwaG90b0J1Y2tldE5hbWU6IGJ1Y2tldCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2xvZy1jb25maXJtXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZExvZ0NvbmZpcm0odXNlcklkLCBldmVudCwgeyBkZGIsIGZvb2RMb2dUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9hY3Rpdml0eS9lc3RpbWF0ZS1idXJuXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGhhbmRsZVYyQWN0aXZpdHlFc3RpbWF0ZUJ1cm4oZXZlbnQpO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvbG9nXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5TG9nKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBlbnRyaWVzVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2FjdGl2aXR5L2NhbGlicmF0aW9uXCIgJiYgbWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkFjdGl2aXR5Q2FsaWJyYXRpb25QYXRjaCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgc2V0dGluZ3NUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvYWN0aXZpdHkvZW5lcmd5LXdlZWtseS1zdW1tYXJ5XCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBlVCA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICAgICAgY29uc3QgZFQgPSBnZXRSZXF1aXJlZEVudihcIkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRVwiLCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSk7XG4gICAgICBjb25zdCBzVCA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJFbmVyZ3lXZWVrbHlTdW1tYXJ5KHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBlbnRyaWVzVGFibGVOYW1lOiBlVCxcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgICBzZXR0aW5nc1RhYmxlTmFtZTogc1QsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZm9vZFQgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFmb29kVCB8fCAhbVQgfHwgIWRUKSB7XG4gICAgICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGZvb2RMb2dUYWJsZU5hbWU6IGZvb2RULFxuICAgICAgICBtZWFsc1RhYmxlTmFtZTogbVQsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFscy9zdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1N1Z2dlc3RNYXRjaCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFsc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNMaXN0KHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNDcmVhdGUodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsSGlzdG9yeU1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvbWVhbHNcXC8oW14vXSspXFwvaGlzdG9yeSQvKTtcbiAgICBpZiAobWVhbEhpc3RvcnlNYXRjaCAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNIaXN0b3J5KHVzZXJJZCwgbWVhbEhpc3RvcnlNYXRjaFsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsUGF0Y2hEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1BhdGNoKHVzZXJJZCwgbWVhbFBhdGNoRGVsWzFdLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNEZWxldGUodXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbExpc3RPckNyZWF0ZSA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXMkLyk7XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzTGlzdCh1c2VySWQsIGRheU1lYWxMaXN0T3JDcmVhdGVbMV0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuICAgIGlmIChkYXlNZWFsTGlzdE9yQ3JlYXRlICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCB8fCAhbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlKHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGRheU1lYWxEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9kYXlzXFwvKFtcXGQtXSspXFwvbWVhbC1lbnRyaWVzXFwvKFteL10rKSQvKTtcbiAgICBpZiAoZGF5TWVhbERlbCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlKHVzZXJJZCwgZGF5TWVhbERlbFsxXSwgZGF5TWVhbERlbFsyXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vdXNlcnNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9mZWF0dXJlLWZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi9mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgcmV0dXJuIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk5vdCBGb3VuZFwiIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UgPT09IFwiSW52YWxpZCBKU09OXCIpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgICB9XG4gICAgY29uc29sZS5lcnJvcihcIkxhbWJkYSBoYW5kbGVyIGVycm9yXCIsIGVycm9yKTtcbiAgICByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiSW50ZXJuYWwgU2VydmVyIEVycm9yXCIgfSk7XG4gIH1cbn1cbiJdfQ==