"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const insights_ai_card_1 = require("./insights-ai-card");
const food_log_api_1 = require("./food-log-api");
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
    const ts = new Date().toISOString();
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: {
            userId: { S: userId },
            insightTs: { S: `${ts}#${insightId}` },
            insightId: { S: insightId },
            vote: { S: vote },
            ts: { S: ts },
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
    if (typeof photoFood === "boolean") {
        serverDefaults.FF_PHOTO_FOOD_LOG = photoFood;
    }
    const mealLibrary = envFlagTriState("FF_MEAL_LIBRARY");
    if (typeof mealLibrary === "boolean") {
        serverDefaults.FF_MEAL_LIBRARY = mealLibrary;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFzc0NBLDBCQTRLQztBQWwzQ0QsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELHlEQUEyRDtBQUMzRCxpREFBOEU7QUFDOUUsMkNBV3FCO0FBRXJCLE1BQU0sR0FBRyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxnRUFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUV6RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sd0JBQXdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN6RSxNQUFNLDZCQUE2QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUM7QUFDcEYsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztBQUN0RCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDeEUsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQztBQUNwRCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDeEUsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNo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Q0FBQyxDQUFDLENBQUMsU0FBUztRQUN6RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ2hFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDN0QsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN2RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3hDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksSUFBSSxLQUFLO1FBQzFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxTQUFTO0tBQ2hDLENBQUMsQ0FDSCxDQUFDO0lBRUYsTUFBTSwwQkFBMEIsR0FBa0IsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUs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QUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7SUFDckQsQ0FBQztJQUNELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTO1FBQUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7SUFDOUUsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVM7UUFBRSxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztJQUMzRSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssU0FBUztRQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO0lBQ3JFLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTO1FBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDckUsTUFBTSx3QkFBd0IsR0FBRyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEUsSUFBSSx3QkFBd0I7UUFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLHdCQUF3QixFQUFFLENBQUM7SUFDOUUsSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUTtRQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBRW5FLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FDWixJQUFJLGdDQUFjLENBQUM7UUFDakIsU0FBUyxFQUFFLFNBQVM7UUFDcEIsSUFBSSxFQUFFLElBQWE7S0FDcEIsQ0FBQyxDQUNILENBQUM7SUFFRixPQUFPLElBQUksQ0FBQyxH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QztRQUN6QyxDQUFDO1FBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLGNBQWMsSUFBSSxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLENBQUMsTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDN0UsT0FBTyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixJQUFJLEtBQUssWUFBWSxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUMvRCxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQsXG4gIEdldFVzZXJDb21tYW5kLFxuICBMaXN0VXNlcnNDb21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWNvZ25pdG8taWRlbnRpdHktcHJvdmlkZXJcIjtcbmltcG9ydCB7XG4gIER5bmFtb0RCQ2xpZW50LFxuICBEZWxldGVJdGVtQ29tbWFuZCxcbiAgR2V0SXRlbUNvbW1hbmQsXG4gIFB1dEl0ZW1Db21tYW5kLFxuICBRdWVyeUNvbW1hbmQsXG4gIFNjYW5Db21tYW5kLFxuICBVcGRhdGVJdGVtQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1keW5hbW9kYlwiO1xuaW1wb3J0IHsgR2V0T2JqZWN0Q29tbWFuZCwgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LXMzXCI7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tIFwiQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXJcIjtcbmltcG9ydCB7IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZCB9IGZyb20gXCIuL2luc2lnaHRzLWFpLWNhcmRcIjtcbmltcG9ydCB7IGhhbmRsZVYyRm9vZEVzdGltYXRlLCBoYW5kbGVWMkZvb2RMb2dDb25maXJtIH0gZnJvbSBcIi4vZm9vZC1sb2ctYXBpXCI7XG5pbXBvcnQge1xuICBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlLFxuICBoYW5kbGVWMkRheU1lYWxFbnRyaWVzTGlzdCxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUsXG4gIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZSxcbiAgaGFuZGxlVjJNZWFsc0NyZWF0ZSxcbiAgaGFuZGxlVjJNZWFsc0RlbGV0ZSxcbiAgaGFuZGxlVjJNZWFsc0hpc3RvcnksXG4gIGhhbmRsZVYyTWVhbHNMaXN0LFxuICBoYW5kbGVWMk1lYWxzUGF0Y2gsXG4gIGhhbmRsZVYyTWVhbHNTdWdnZXN0TWF0Y2gsXG59IGZyb20gXCIuL21lYWxzLWFwaVwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgY29nbml0b0lkcCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5cbmNvbnN0IGVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBzZXR0aW5nc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlNFVFRJTkdTX1RBQkxFX05BTUU7XG5jb25zdCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5JTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUU7XG5jb25zdCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRTtcbmNvbnN0IHBob3RvQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlBIT1RPX0JVQ0tFVF9OQU1FO1xuY29uc3QgZm9vZExvZ0VudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GT09EX0xPR19FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBtZWFsc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52Lk1FQUxTX1RBQkxFX05BTUU7XG5jb25zdCBkYXlNZWFsRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkRBWV9NRUFMX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbiAgdG9uZT86IFwiZnJpZW5kbHlcIiB8IFwiY2xpbmljYWxcIiB8IFwidG91Z2gtbG92ZVwiIHwgXCJheXVydmVkaWNcIjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7XG4gIHJvbGxpbmdXaW5kb3dEYXlzPzogbnVtYmVyO1xuICBjb21wYXJpc29uU3BhbkRheXM/OiBudW1iZXI7XG4gIG1heEF2Z01vdmVtZW50S2c/OiBudW1iZXI7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xuICBhY3Rpb246IHN0cmluZztcbiAgY2F0ZWdvcnk6IFwic29kaXVtXCIgfCBcImFsY29ob2xcIiB8IFwibGF0ZV9zbmFja1wiIHwgXCJ3b3Jrb3V0XCIgfCBcInBsYXRlYXVcIiB8IFwic3RyZWFrXCIgfCBcInRyYWplY3RvcnlcIjtcbiAgZ2VuZXJhdGlvblNvdXJjZT86IFwibGxtXCIgfCBcInJ1bGVzXCI7XG59O1xuXG5mdW5jdGlvbiBqc29uKHN0YXR1c0NvZGU6IG51bWJlciwgcGF5bG9hZDogdW5rbm93bik6IEh0dHBSZXN1bHQge1xuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGUsXG4gICAgaGVhZGVyczogeyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZEVudihuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIHJlcXVpcmVkIGVudiB2YXIgJHtuYW1lfWApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcGFyc2VKc29uQm9keShldmVudDogSHR0cEV2ZW50KTogdW5rbm93biB7XG4gIGlmICghZXZlbnQuYm9keSkgcmV0dXJuIHt9O1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICB9IGNhdGNoIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIEpTT05cIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEYXRlU3RyaW5nKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiAmJiAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVudkZsYWdUcmlTdGF0ZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgdiA9IHByb2Nlc3MuZW52W25hbWVdO1xuICBpZiAodiA9PT0gXCJ0cnVlXCIpIHJldHVybiB0cnVlO1xuICBpZiAodiA9PT0gXCJmYWxzZVwiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzUG9zaXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwO1xufVxuXG5mdW5jdGlvbiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5cbmZ1bmN0aW9uIGlzSW50Tm9uTmVnYXRpdmUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50cnkoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBEYWlseUVudHJ5VXBzZXJ0IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG5cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LmRhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5Lm1vcm5pbmdXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbW9ybmluZ1dlaWdodFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5sYXRlU25hY2sgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbGF0ZVNuYWNrXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmhpZ2hTb2RpdW0gIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgaGlnaFNvZGl1bVwiIH07XG4gIGlmICh0eXBlb2YgYm9keS53b3Jrb3V0ICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHdvcmtvdXRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuYWxjb2hvbCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhbGNvaG9sXCIgfTtcblxuICBpZiAoXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gbnVsbCAmJlxuICAgICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubmlnaHRXZWlnaHQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuaWdodFdlaWdodFwiIH07XG4gIH1cblxuICBpZiAoYm9keS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuY2Fsb3JpZXMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGNhbG9yaWVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5wcm90ZWluICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5wcm90ZWluKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwcm90ZWluXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zdGVwcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuc3RlcHMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0ZXBzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zbGVlcCAhPT0gdW5kZWZpbmVkICYmICFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuc2xlZXApKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHNsZWVwXCIgfTtcbiAgfVxuXG4gIGlmIChcbiAgICBib2R5LnBob3RvVXJsICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnBob3RvVXJsICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5LnBob3RvVXJsICE9PSBcInN0cmluZ1wiIHx8IGJvZHkucGhvdG9VcmwubGVuZ3RoID4gNjAwXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBob3RvVXJsXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5ub3RlcyAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5ub3RlcyAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5ub3RlcyAhPT0gXCJzdHJpbmdcIiB8fCBib2R5Lm5vdGVzLmxlbmd0aCA+IDJfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbm90ZXNcIiB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBkYXRlOiBib2R5LmRhdGUsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBib2R5Lm1vcm5pbmdXZWlnaHQsXG4gICAgICBuaWdodFdlaWdodDogKGJvZHkubmlnaHRXZWlnaHQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGJvZHkuY2Fsb3JpZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogYm9keS5wcm90ZWluIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBib2R5LnN0ZXBzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBib2R5LnNsZWVwIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogYm9keS5sYXRlU25hY2sgYXMgYm9vbGVhbixcbiAgICAgIGhpZ2hTb2RpdW06IGJvZHkuaGlnaFNvZGl1bSBhcyBib29sZWFuLFxuICAgICAgd29ya291dDogYm9keS53b3Jrb3V0IGFzIGJvb2xlYW4sXG4gICAgICBhbGNvaG9sOiBib2R5LmFsY29ob2wgYXMgYm9vbGVhbixcbiAgICAgIHBob3RvVXJsOiAoYm9keS5waG90b1VybCBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBub3RlczogKGJvZHkubm90ZXMgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU2V0dGluZ3MoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBTZXR0aW5nc1BhdGNoIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuZ29hbFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBnb2FsV2VpZ2h0XCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuc3RhcnRXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhcnRXZWlnaHRcIiB9O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LnRhcmdldERhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdGFyZ2V0RGF0ZVwiIH07XG4gIGlmIChib2R5LnVuaXQgIT09IFwia2dcIiAmJiBib2R5LnVuaXQgIT09IFwibGJzXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB1bml0XCIgfTtcbiAgaWYgKFxuICAgIGJvZHkudG9uZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS50b25lICE9PSBcImZyaWVuZGx5XCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiY2xpbmljYWxcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJ0b3VnaC1sb3ZlXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiYXl1cnZlZGljXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRvbmVcIiB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgICB0b25lOiBib2R5LnRvbmUgYXMgU2V0dGluZ3NQYXRjaFtcInRvbmVcIl0sXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Snd0Q2xhaW1zKGV2ZW50OiBIdHRwRXZlbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHJhdyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcztcbiAgaWYgKHJhdyA9PSBudWxsKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiByYXcgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBzdWIgPSBnZXRKd3RDbGFpbXMoZXZlbnQpPy5zdWI7XG4gIHJldHVybiB0eXBlb2Ygc3ViID09PSBcInN0cmluZ1wiID8gc3ViIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaXJzdE5hbWVGcm9tSnd0Q2xhaW1zKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWNsYWltcykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgZ2l2ZW4gPSBjbGFpbXMuZ2l2ZW5fbmFtZTtcbiAgaWYgKHR5cGVvZiBnaXZlbiA9PT0gXCJzdHJpbmdcIiAmJiBnaXZlbi50cmltKCkpIHJldHVybiBnaXZlbi50cmltKCk7XG4gIGNvbnN0IG5hbWUgPSBjbGFpbXMubmFtZTtcbiAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiICYmIG5hbWUudHJpbSgpKSB7XG4gICAgY29uc3QgZmlyc3QgPSBuYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdO1xuICAgIHJldHVybiBmaXJzdCB8fCB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oXG4gIGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiB8IHVuZGVmaW5lZCxcbik6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfCB1bmRlZmluZWQge1xuICBpZiAoIWl0ZW0pIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG91dDogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBjb25zdCBydyA9IGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzPy5OO1xuICBjb25zdCBzcGFuID0gaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzPy5OO1xuICBjb25zdCBtdiA9IGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2c/Lk47XG4gIGlmIChydyAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihydyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LnJvbGxpbmdXaW5kb3dEYXlzID0gbjtcbiAgfVxuICBpZiAoc3BhbiAhPSBudWxsKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihzcGFuKTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQuY29tcGFyaXNvblNwYW5EYXlzID0gbjtcbiAgfVxuICBpZiAobXYgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIobXYpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4gT2JqZWN0LmtleXMob3V0KS5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChcbiAgcmF3OiB1bmtub3duLFxuKTogeyBvazogdHJ1ZTsgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwbGF0ZWF1IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBvID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBkYXRhOiBQbGF0ZWF1VXNlclNldHRpbmdzID0ge307XG4gIGlmIChvLnJvbGxpbmdXaW5kb3dEYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8ucm9sbGluZ1dpbmRvd0RheXMpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5yb2xsaW5nV2luZG93RGF5c1wiIH07XG4gICAgZGF0YS5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKG8uY29tcGFyaXNvblNwYW5EYXlzICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG8uY29tcGFyaXNvblNwYW5EYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzXCIgfTtcbiAgICBkYXRhLmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG8ubWF4QXZnTW92ZW1lbnRLZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLm1heEF2Z01vdmVtZW50S2cpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnXCIgfTtcbiAgICBkYXRhLm1heEF2Z01vdmVtZW50S2cgPSBuO1xuICB9XG4gIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhIH07XG59XG5cbi8qKiBHbWFpbCB0cmVhdHMgZG90cyBhbmQgK2xhYmVscyBhcyBhbGlhc2VzOyBub3JtYWxpemUgc28gYWRtaW4gbGlzdCBtYXRjaGVzIHJlYWwgc2lnbi1pbiBpZGVudGl0aWVzLiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGVtYWlsOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBsb3dlciA9IGVtYWlsLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBhdCA9IGxvd2VyLmxhc3RJbmRleE9mKFwiQFwiKTtcbiAgaWYgKGF0IDw9IDApIHJldHVybiBsb3dlcjtcbiAgY29uc3QgbG9jYWwgPSBsb3dlci5zbGljZSgwLCBhdCk7XG4gIGNvbnN0IGRvbWFpbiA9IGxvd2VyLnNsaWNlKGF0ICsgMSk7XG4gIGlmIChkb21haW4gPT09IFwiZ21haWwuY29tXCIgfHwgZG9tYWluID09PSBcImdvb2dsZW1haWwuY29tXCIpIHtcbiAgICBjb25zdCBiYXNlTG9jYWwgPSAobG9jYWwuc3BsaXQoXCIrXCIpWzBdID8/IGxvY2FsKS5yZXBsYWNlKC9cXC4vZywgXCJcIik7XG4gICAgcmV0dXJuIGAke2Jhc2VMb2NhbH1AJHtkb21haW59YDtcbiAgfVxuICByZXR1cm4gbG93ZXI7XG59XG5cbmZ1bmN0aW9uIGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpOiBTZXQ8c3RyaW5nPiB7XG4gIGNvbnN0IHJhdyA9IHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUz8udHJpbSgpIHx8IFwidmloYXJuYXJAZ21haWwuY29tXCI7XG4gIGNvbnN0IHBhcnRzID0gcmF3XG4gICAgLnNwbGl0KFwiLFwiKVxuICAgIC5tYXAoKHMpID0+IG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChzLnRyaW0oKSkpXG4gICAgLmZpbHRlcihCb29sZWFuKTtcbiAgY29uc3Qgc2V0ID0gbmV3IFNldChwYXJ0cyk7XG4gIGlmIChzZXQuc2l6ZSA9PT0gMCkge1xuICAgIHNldC5hZGQobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKFwidmloYXJuYXJAZ21haWwuY29tXCIpKTtcbiAgfVxuICByZXR1cm4gc2V0O1xufVxuXG5jb25zdCBBRE1JTl9DTEFJTV9LRVlTID0gW1widXNlcm5hbWVcIiwgXCJjb2duaXRvOnVzZXJuYW1lXCIsIFwiZW1haWxcIiwgXCJwcmVmZXJyZWRfdXNlcm5hbWVcIl0gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nW10ge1xuICBjb25zdCBmb3VuZDogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZW1haWxpc2ggPSAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLztcbiAgZm9yIChjb25zdCBrZXkgb2YgQURNSU5fQ0xBSU1fS0VZUykge1xuICAgIGNvbnN0IHYgPSBjbGFpbXNba2V5XTtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgdiBvZiBPYmplY3QudmFsdWVzKGNsYWltcykpIHtcbiAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgZW1haWxpc2gudGVzdCh2LnRyaW0oKSkpIHtcbiAgICAgIGZvdW5kLnB1c2godi50cmltKCkudG9Mb3dlckNhc2UoKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBbLi4ubmV3IFNldChmb3VuZCldO1xufVxuXG4vKiogVHJ1ZSBpZiBKV1QgY2xhaW1zIGluY2x1ZGUgYW4gZW1haWwgaWRlbnRpdHkgdGhhdCBtYXRjaGVzIHRoZSBjb25maWd1cmVkIGFkbWluIGFsbG93IGxpc3QuICovXG5mdW5jdGlvbiBpc0FkbWluQ2FsbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBib29sZWFuIHtcbiAgY29uc3QgY2xhaW1zID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KTtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IGNvbGxlY3RBZG1pbklkZW50aXR5Q2FuZGlkYXRlcyhjbGFpbXMpO1xuICBmb3IgKGNvbnN0IGMgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGMpKSkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoZWFkZXJWYWx1ZShcbiAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCxcbiAgbmFtZTogc3RyaW5nLFxuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFoZWFkZXJzKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCB3YW50ID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhoZWFkZXJzKSkge1xuICAgIGlmIChrLnRvTG93ZXJDYXNlKCkgPT09IHdhbnQgJiYgdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgdi5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gdjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBKV1QgSFRUUCBBUEkgYXV0aG9yaXplcnMgdmFsaWRhdGUgQXV0aG9yaXphdGlvbiBidXQgdHlwaWNhbGx5IGRvIG5vdCBmb3J3YXJkIHRoYXQgaGVhZGVyIHRvIExhbWJkYS5cbiAqIENsaWVudHMgYWxzbyBzZW5kIHgtY29nbml0by1hY2Nlc3MtdG9rZW4gKHNlZSBmcm9udGVuZC1hcGktY2xpZW50KSBzbyB3ZSBjYW4gY2FsbCBjb2duaXRvLWlkcDpHZXRVc2VyLlxuICovXG5mdW5jdGlvbiBiZWFyZXJBY2Nlc3NUb2tlbihldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgaCA9IGV2ZW50LmhlYWRlcnM7XG4gIGNvbnN0IGN1c3RvbSA9IGhlYWRlclZhbHVlKGgsIFwieC1jb2duaXRvLWFjY2Vzcy10b2tlblwiKTtcbiAgaWYgKGN1c3RvbT8udHJpbSgpKSByZXR1cm4gY3VzdG9tLnRyaW0oKTtcbiAgY29uc3QgcmF3ID0gaGVhZGVyVmFsdWUoaCwgXCJhdXRob3JpemF0aW9uXCIpO1xuICBpZiAoIXJhdykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgbSA9IHJhdy5tYXRjaCgvXkJlYXJlclxccysoLispJC9pKTtcbiAgcmV0dXJuIG0/LlsxXT8udHJpbSgpO1xufVxuXG4vKiogV2hlbiBjbGFpbXMgbGFjayBhIHJlc29sdmFibGUgZW1haWwsIHZlcmlmeSBhZG1pbiB2aWEgR2V0VXNlcjsgdG9rZW4gc3ViIG11c3QgbWF0Y2ggSldUIHN1Yi4gKi9cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgdG9rZW4gPSBiZWFyZXJBY2Nlc3NUb2tlbihldmVudCk7XG4gIGlmICghdG9rZW4pIHJldHVybiBmYWxzZTtcbiAgY29uc3Qgand0U3ViID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgaWYgKCFqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgYWxsb3cgPSBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTtcbiAgaWYgKGFsbG93LnNpemUgPT09IDApIHJldHVybiBmYWxzZTtcbiAgdHJ5IHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQobmV3IEdldFVzZXJDb21tYW5kKHsgQWNjZXNzVG9rZW46IHRva2VuIH0pKTtcbiAgICBjb25zdCBhdHRycyA9IG91dC5Vc2VyQXR0cmlidXRlcyA/PyBbXTtcbiAgICBjb25zdCB0b2tlblN1YiA9IGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJzdWJcIik/LlZhbHVlO1xuICAgIGlmICh0b2tlblN1YiAhPT0gand0U3ViKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgZW1haWwgPVxuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcImVtYWlsXCIpPy5WYWx1ZSA/P1xuICAgICAgYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInByZWZlcnJlZF91c2VybmFtZVwiKT8uVmFsdWU7XG4gICAgY29uc3QgZnJvbVVzZXJuYW1lID0gb3V0LlVzZXJuYW1lPy5pbmNsdWRlcyhcIkBcIikgPyBvdXQuVXNlcm5hbWUgOiB1bmRlZmluZWQ7XG4gICAgY29uc3QgY2FuZGlkYXRlID0gKGVtYWlsID8/IGZyb21Vc2VybmFtZSA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIWNhbmRpZGF0ZSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBhbGxvdy5oYXMobm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKGNhbmRpZGF0ZSkpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaXNBZG1pbkFsbG93ZWQoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBpZiAoaXNBZG1pbkNhbGxlcihldmVudCkpIHJldHVybiB0cnVlO1xuICByZXR1cm4gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQpO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0RGF0ZSgpOiBzdHJpbmcge1xuICBjb25zdCBkID0gbmV3IERhdGUoKTtcbiAgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpICsgMTE4KTtcbiAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHBob3RvVXJsOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFwaG90b1VybCB8fCB0eXBlb2YgcGhvdG9VcmwgIT09IFwic3RyaW5nXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmIChwaG90b1VybC5zdGFydHNXaXRoKFwiczM6Ly9cIikpIHJldHVybiBwaG90b1VybDtcbiAgaWYgKCFwaG90b1VybC5pbmNsdWRlcyhcIjovL1wiKSkge1xuICAgIGNvbnN0IGtleU9ubHkgPSBwaG90b1VybC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGlmICgha2V5T25seSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBpZiAocGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtwaG90b0J1Y2tldE5hbWV9LyR7a2V5T25seX1gO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTChwaG90b1VybCk7XG4gICAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQocGFyc2VkLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgXCJcIikpO1xuICAgIGlmICghcGF0aCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIC8vIFZpcnR1YWwtaG9zdGVkLXN0eWxlIFVSTDogYnVja2V0LnMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgdmlydHVhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAodmlydHVhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHt2aXJ0dWFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBMZWdhY3kgZ2xvYmFsIGVuZHBvaW50OiBidWNrZXQuczMuYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCBnbG9iYWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmIChnbG9iYWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7Z2xvYmFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBQYXRoLXN0eWxlIFVSTDogczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9idWNrZXQva2V5XG4gICAgaWYgKC9eczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvLnRlc3QoaG9zdCkgfHwgaG9zdCA9PT0gXCJzMy5hbWF6b25hd3MuY29tXCIpIHtcbiAgICAgIGNvbnN0IHNsYXNoID0gcGF0aC5pbmRleE9mKFwiL1wiKTtcbiAgICAgIGlmIChzbGFzaCA8PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgYnVja2V0ID0gcGF0aC5zbGljZSgwLCBzbGFzaCk7XG4gICAgICBjb25zdCBrZXkgPSBwYXRoLnNsaWNlKHNsYXNoICsgMSk7XG4gICAgICBpZiAoIWJ1Y2tldCB8fCAha2V5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGBzMzovLyR7YnVja2V0fS8ke2tleX1gO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzb3J0QnlEYXRlQXNjPFQgZXh0ZW5kcyB7IGRhdGU6IHN0cmluZyB9Pihyb3dzOiBUW10pOiBUW10ge1xuICByZXR1cm4gWy4uLnJvd3NdLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xufVxuXG5mdW5jdGlvbiBhdmVyYWdlKHZhbHVlczogbnVtYmVyW10pOiBudW1iZXIgfCBudWxsIHtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICByZXR1cm4gdmFsdWVzLnJlZHVjZSgoYWNjLCB2YWx1ZSkgPT4gYWNjICsgdmFsdWUsIDApIC8gdmFsdWVzLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gcm91bmQyKHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5yb3VuZCh2YWx1ZSAqIDEwMCkgLyAxMDA7XG59XG5cbmZ1bmN0aW9uIG5leHRNb3JuaW5nRGVsdGFzKFxuICBsb2dzOiBTdG9yZWRFbnRyeVtdLFxuICBwcmVkaWNhdGU6IChsb2c6IFN0b3JlZEVudHJ5KSA9PiBib29sZWFuLFxuKTogeyBmbGFnZ2VkOiBudW1iZXJbXTsgYmFzZWxpbmU6IG51bWJlcltdIH0ge1xuICBjb25zdCBzb3J0ZWQgPSBzb3J0QnlEYXRlQXNjKGxvZ3MpO1xuICBjb25zdCBmbGFnZ2VkOiBudW1iZXJbXSA9IFtdO1xuICBjb25zdCBiYXNlbGluZTogbnVtYmVyW10gPSBbXTtcbiAgZm9yIChsZXQgaWR4ID0gMDsgaWR4IDwgc29ydGVkLmxlbmd0aCAtIDE7IGlkeCArPSAxKSB7XG4gICAgY29uc3QgZGVsdGEgPSBzb3J0ZWRbaWR4ICsgMV0ubW9ybmluZ1dlaWdodCAtIHNvcnRlZFtpZHhdLm1vcm5pbmdXZWlnaHQ7XG4gICAgaWYgKHByZWRpY2F0ZShzb3J0ZWRbaWR4XSkpIGZsYWdnZWQucHVzaChkZWx0YSk7XG4gICAgZWxzZSBiYXNlbGluZS5wdXNoKGRlbHRhKTtcbiAgfVxuICByZXR1cm4geyBmbGFnZ2VkLCBiYXNlbGluZSB9O1xufVxuXG5mdW5jdGlvbiBzb2RpdW1JbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuaGlnaFNvZGl1bSk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYHNvZGl1bS1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcInNvZGl1bUJ1bXBcIixcbiAgICBwcmlvcml0eTogOTUsXG4gICAgaGVhZGxpbmU6IFwiSGlnaC1zb2RpdW0gZGF5cyBhcmUgbGlua2VkIHRvIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHdlaWdoLWlucy5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdnMgeW91ciBub24tc29kaXVtIGJhc2VsaW5lIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBoaWdoLXNvZGl1bSBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBvbiBoaWdoLXNvZGl1bSBkYXlzOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiVHJ5IG9uZSBsb3dlci1zb2RpdW0gZGlubmVyIHN3YXAgdG9uaWdodC5cIixcbiAgICBjYXRlZ29yeTogXCJzb2RpdW1cIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYWxjb2hvbEluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5hbGNvaG9sKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgYWxjb2hvbC1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImFsY29ob2xcIixcbiAgICBwcmlvcml0eTogOTAsXG4gICAgaGVhZGxpbmU6IFwiQWxjb2hvbCBkYXlzIHRlbmQgdG8gc2hvdyBhIG5leHQtZGF5IHdlaWdodCBidW1wLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2ZXJzdXMgbm9uLWFsY29ob2wgZGF5cyB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gYWxjb2hvbC1sb2dnZWQgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2UgYWZ0ZXIgYWxjb2hvbDogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlBsYW4gYWxjb2hvbC1mcmVlIHdlZWtkYXlzIGZvciBzdGVhZGllciB0cmVuZCBsaW5lcy5cIixcbiAgICBjYXRlZ29yeTogXCJhbGNvaG9sXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGxhdGVTbmFja0luc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5sYXRlU25hY2spO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBsYXRlLXNuYWNrLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwibGF0ZVNuYWNrXCIsXG4gICAgcHJpb3JpdHk6IDg4LFxuICAgIGhlYWRsaW5lOiBcIkxhdGUgc25hY2tzIGFyZSBjb3JyZWxhdGVkIHdpdGggaGVhdmllciBuZXh0LW1vcm5pbmcgc2NhbGUgcmVhZGluZ3MuXCIsXG4gICAgZGV0YWlsOiBgWW91ciBuZXh0LWRheSBjaGFuZ2UgaXMgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIGhpZ2hlciB0aGFuIHlvdXIgbm9uLWxhdGUtc25hY2sgYmFzZWxpbmUuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBsYXRlLXNuYWNrIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIHdpdGggbGF0ZSBzbmFjazogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlNldCBhIDItaG91ciBraXRjaGVuIGNsb3NlIHRpbWUgYmVmb3JlIGJlZC5cIixcbiAgICBjYXRlZ29yeTogXCJsYXRlX3NuYWNrXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGJhc2VsaW5lSW5zaWdodFdpdGhMb2dzKGVudHJ5Q291bnQ6IG51bWJlciwgbGF0ZXN0RGF0ZTogc3RyaW5nKTogSW5zaWdodENhcmQge1xuICByZXR1cm4ge1xuICAgIGlkOiBgYmFzZWxpbmUtaW5zaWdodC0ke2xhdGVzdERhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiR3JlYXQgY29uc2lzdGVuY3kgc28gZmFyIOKAlCBrZWVwIGxvZ2dpbmcgZGFpbHkgZm9yIHNoYXJwZXIgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJXZSBuZWVkIGEgYml0IG1vcmUgc2lnbmFsIHRvIGRldGVjdCBzdHJvbmcgcGVyc29uYWwgcGF0dGVybnMsIGJ1dCB5b3VyIGRhdGEgZmxvdyBpcyBhY3RpdmUuXCIsXG4gICAgd2h5OiBbXG4gICAgICBgJHtlbnRyeUNvdW50fSBsb2dzIGFuYWx5emVkIGZyb20gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBcIk5vIHJ1bGUgY3Jvc3NlZCBjb25maWRlbmNlIHRocmVzaG9sZHMgeWV0XCIsXG4gICAgXSxcbiAgICBhY3Rpb246IFwiS2VlcCB0cmFja2luZyBkYWlseSBoYWJpdHMgYW5kIHdlaWdodCB0byB1bmxvY2sgc3Ryb25nZXIgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGNhdGVnb3J5OiBcInN0cmVha1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHROb0xvZ3MoYXNPZkRhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHthc09mRGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJiYXNlbGluZVwiLFxuICAgIHByaW9yaXR5OiAxMCxcbiAgICBoZWFkbGluZTogXCJTdGFydCBsb2dnaW5nIHdlaWdodCBhbmQgaGFiaXRzIHRvIHVubG9jayBwZXJzb25hbGl6ZWQgaW5zaWdodHMuXCIsXG4gICAgZGV0YWlsOiBcIk9uY2UgeW91IGhhdmUgYSBmZXcgd2Vla3Mgb2YgZW50cmllcywgd2Ugd2lsbCBoaWdobGlnaHQgcGF0dGVybnMgdGhhdCBtYXRjaCB5b3VyIGRhdGEuXCIsXG4gICAgd2h5OiBbXCJObyBlbnRyaWVzIGZvdW5kIGluIHRoZSBsYXN0IDkwIGRheXNcIl0sXG4gICAgYWN0aW9uOiBcIkFkZCB0b2RheSdzIHdlaWdodCBvbiB0aGUgbGVmdCB0byBiZWdpbi5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5zaWdodHNWMih1c2VySWQ6IHN0cmluZywgX2V2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRvID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZnJvbURhdGUgPSBuZXcgRGF0ZSgpO1xuICBmcm9tRGF0ZS5zZXREYXRlKGZyb21EYXRlLmdldERhdGUoKSAtIDg5KTtcbiAgY29uc3QgZnJvbSA9IGZyb21EYXRlLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOmZyb21EYXRlXCI6IHsgUzogZnJvbSB9LFxuICAgICAgICBcIjp0b0RhdGVcIjogeyBTOiB0byB9LFxuICAgICAgfSxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZW50cmllc1JhdyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICB9KSxcbiAgKS5maWx0ZXIoKGUpID0+IGUuZGF0ZSAmJiBlLm1vcm5pbmdXZWlnaHQgPiAwKTtcblxuICBjb25zdCBzZXR0aW5nc1RhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgc2V0dGluZ3NSb3cgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBzZXR0aW5nc1RhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGdJdGVtID0gc2V0dGluZ3NSb3cuSXRlbTtcbiAgY29uc3QgZ29hbFdlaWdodCA9IGdJdGVtID8gTnVtYmVyKGdJdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpIDogNzI7XG4gIGNvbnN0IHN0YXJ0V2VpZ2h0ID0gZ0l0ZW0gPyBOdW1iZXIoZ0l0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpIDogODU7XG4gIGNvbnN0IHRhcmdldERhdGUgPSBnSXRlbT8udGFyZ2V0RGF0ZT8uUyA/PyB0bztcblxuICBjb25zdCBpbnNpZ2h0cyA9IGF3YWl0IGdlbmVyYXRlQWlJbnNpZ2h0Q2FyZChkZGIsIHtcbiAgICB1c2VySWQsXG4gICAgZW50cmllc1JhdyxcbiAgICBnb2FsV2VpZ2h0LFxuICAgIHN0YXJ0V2VpZ2h0LFxuICAgIHRhcmdldERhdGUsXG4gICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lLFxuICB9KTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGluc2lnaHRzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FXCIsIGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgaW5zaWdodElkID0gdHlwZW9mIGJvZHkuaW5zaWdodElkID09PSBcInN0cmluZ1wiID8gYm9keS5pbnNpZ2h0SWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qgdm90ZSA9IGJvZHkudm90ZSA9PT0gXCJ1cFwiIHx8IGJvZHkudm90ZSA9PT0gXCJkb3duXCIgPyBib2R5LnZvdGUgOiBudWxsO1xuICBpZiAoIWluc2lnaHRJZCB8fCAhdm90ZSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgaW5zaWdodCBmZWVkYmFjayBwYXlsb2FkXCIgfSk7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgaW5zaWdodFRzOiB7IFM6IGAke3RzfSMke2luc2lnaHRJZH1gIH0sXG4gICAgICAgIGluc2lnaHRJZDogeyBTOiBpbnNpZ2h0SWQgfSxcbiAgICAgICAgdm90ZTogeyBTOiB2b3RlIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEVudHJpZXModXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZnJvbSA9IHF1ZXJ5Py5mcm9tO1xuICBjb25zdCB0byA9IHF1ZXJ5Py50bztcbiAgaWYgKGZyb20gJiYgIWlzRGF0ZVN0cmluZyhmcm9tKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZnJvbSBkYXRlXCIgfSk7XG4gIGlmICh0byAmJiAhaXNEYXRlU3RyaW5nKHRvKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgdG8gZGF0ZVwiIH0pO1xuXG4gIGNvbnN0IGV4cHJlc3Npb25WYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHsgUzogc3RyaW5nIH0+ID0geyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9O1xuICBsZXQga2V5Q29uZGl0aW9uID0gXCJ1c2VySWQgPSA6dXNlcklkXCI7XG4gIGlmIChmcm9tICYmIHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfSBlbHNlIGlmIChmcm9tKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA+PSA6ZnJvbURhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gIH0gZWxzZSBpZiAodG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIDw9IDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOnRvRGF0ZVwiXSA9IHsgUzogdG8gfTtcbiAgfVxuXG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBrZXlDb25kaXRpb24sXG4gICAgICAuLi4oa2V5Q29uZGl0aW9uLmluY2x1ZGVzKFwiI2RhdGVcIilcbiAgICAgICAgPyB7IEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0gfVxuICAgICAgICA6IHt9KSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IGV4cHJlc3Npb25WYWx1ZXMsXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICBpZDogaXRlbS5pZD8uUyA/PyBgJHt1c2VySWR9OiR7aXRlbS5kYXRlPy5TID8/IFwiXCJ9YCxcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHVzZXJJZCxcbiAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgIG5pZ2h0V2VpZ2h0OiBpdGVtLm5pZ2h0V2VpZ2h0Py5OID8gTnVtYmVyKGl0ZW0ubmlnaHRXZWlnaHQuTikgOiB1bmRlZmluZWQsXG4gICAgY2Fsb3JpZXM6IGl0ZW0uY2Fsb3JpZXM/Lk4gPyBOdW1iZXIoaXRlbS5jYWxvcmllcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBwcm90ZWluOiBpdGVtLnByb3RlaW4/Lk4gPyBOdW1iZXIoaXRlbS5wcm90ZWluLk4pIDogdW5kZWZpbmVkLFxuICAgIHN0ZXBzOiBpdGVtLnN0ZXBzPy5OID8gTnVtYmVyKGl0ZW0uc3RlcHMuTikgOiB1bmRlZmluZWQsXG4gICAgc2xlZXA6IGl0ZW0uc2xlZXA/Lk4gPyBOdW1iZXIoaXRlbS5zbGVlcC5OKSA6IHVuZGVmaW5lZCxcbiAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgIHBob3RvVXJsOiBpdGVtLnBob3RvVXJsPy5TID8/IHVuZGVmaW5lZCxcbiAgICBub3RlczogaXRlbS5ub3Rlcz8uUyA/PyB1bmRlZmluZWQsXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZW50cmllc1dpdGhTaWduZWRQaG90b1VybHM6IFN0b3JlZEVudHJ5W10gPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICBlbnRyaWVzLm1hcChhc3luYyAoZW50cnkpID0+IHtcbiAgICAgIGNvbnN0IHBob3RvID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZW50cnkucGhvdG9VcmwpO1xuICAgICAgaWYgKCFwaG90bykgcmV0dXJuIGVudHJ5O1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd2l0aG91dFNjaGVtZSA9IHBob3RvLnNsaWNlKFwiczM6Ly9cIi5sZW5ndGgpO1xuICAgICAgICBjb25zdCBmaXJzdFNsYXNoID0gd2l0aG91dFNjaGVtZS5pbmRleE9mKFwiL1wiKTtcbiAgICAgICAgaWYgKGZpcnN0U2xhc2ggPD0gMCkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBidWNrZXQgPSB3aXRob3V0U2NoZW1lLnNsaWNlKDAsIGZpcnN0U2xhc2gpO1xuICAgICAgICBjb25zdCBrZXkgPSB3aXRob3V0U2NoZW1lLnNsaWNlKGZpcnN0U2xhc2ggKyAxKTtcbiAgICAgICAgaWYgKCFrZXkpIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3Qgc2lnbmVkUGhvdG9VcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldCwgS2V5OiBrZXkgfSksXG4gICAgICAgICAgeyBleHBpcmVzSW46IGRvd25sb2FkVXJsVHRsU2Vjb25kcyB9LFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4geyAuLi5lbnRyeSwgcGhvdG9Vcmw6IHNpZ25lZFBob3RvVXJsIH07XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyaWVzOiBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJscyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RW50cnkodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgcGFyc2VkID0gdmFsaWRhdGVFbnRyeShwYXlsb2FkKTtcbiAgaWYgKCFwYXJzZWQub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwYXJzZWQuZXJyb3IgfSk7XG4gIGNvbnN0IGRhdGEgPSBwYXJzZWQuZGF0YTtcbiAgY29uc3QgaWQgPSBgJHt1c2VySWR9OiR7ZGF0YS5kYXRlfWA7XG5cbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGRhdGU6IHsgUzogZGF0YS5kYXRlIH0sXG4gICAgaWQ6IHsgUzogaWQgfSxcbiAgICBtb3JuaW5nV2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLm1vcm5pbmdXZWlnaHQpIH0sXG4gICAgbGF0ZVNuYWNrOiB7IEJPT0w6IGRhdGEubGF0ZVNuYWNrIH0sXG4gICAgaGlnaFNvZGl1bTogeyBCT09MOiBkYXRhLmhpZ2hTb2RpdW0gfSxcbiAgICB3b3Jrb3V0OiB7IEJPT0w6IGRhdGEud29ya291dCB9LFxuICAgIGFsY29ob2w6IHsgQk9PTDogZGF0YS5hbGNvaG9sIH0sXG4gIH07XG5cbiAgaWYgKGRhdGEubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJiBkYXRhLm5pZ2h0V2VpZ2h0ICE9PSBudWxsKSB7XG4gICAgaXRlbS5uaWdodFdlaWdodCA9IHsgTjogU3RyaW5nKGRhdGEubmlnaHRXZWlnaHQpIH07XG4gIH1cbiAgaWYgKGRhdGEuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCkgaXRlbS5jYWxvcmllcyA9IHsgTjogU3RyaW5nKGRhdGEuY2Fsb3JpZXMpIH07XG4gIGlmIChkYXRhLnByb3RlaW4gIT09IHVuZGVmaW5lZCkgaXRlbS5wcm90ZWluID0geyBOOiBTdHJpbmcoZGF0YS5wcm90ZWluKSB9O1xuICBpZiAoZGF0YS5zdGVwcyAhPT0gdW5kZWZpbmVkKSBpdGVtLnN0ZXBzID0geyBOOiBTdHJpbmcoZGF0YS5zdGVwcykgfTtcbiAgaWYgKGRhdGEuc2xlZXAgIT09IHVuZGVmaW5lZCkgaXRlbS5zbGVlcCA9IHsgTjogU3RyaW5nKGRhdGEuc2xlZXApIH07XG4gIGNvbnN0IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGRhdGEucGhvdG9VcmwpO1xuICBpZiAobm9ybWFsaXplZFBob3RvUmVmZXJlbmNlKSBpdGVtLnBob3RvVXJsID0geyBTOiBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgfTtcbiAgaWYgKHR5cGVvZiBkYXRhLm5vdGVzID09PSBcInN0cmluZ1wiKSBpdGVtLm5vdGVzID0geyBTOiBkYXRhLm5vdGVzIH07XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbTogaXRlbSBhcyBuZXZlcixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cnk6IHsgLi4uZGF0YSwgaWQgfSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlRW50cnkodXNlcklkOiBzdHJpbmcsIHF1ZXJ5OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgZGF0ZSA9IHF1ZXJ5Py5kYXRlO1xuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXRlKSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH0pO1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBEZWxldGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGRhdGU6IHsgUzogZGF0ZSB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIGRhdGUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFNldHRpbmdzKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICB9KSxcbiAgKTtcblxuICBpZiAoIW91dC5JdGVtKSB7XG4gICAgY29uc3Qgc2V0dGluZ3M6IFN0b3JlZFNldHRpbmdzID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgZ29hbFdlaWdodDogNzIsXG4gICAgICBzdGFydFdlaWdodDogODUsXG4gICAgICB0YXJnZXREYXRlOiBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogXCJrZ1wiLFxuICAgICAgdG9uZTogXCJmcmllbmRseVwiLFxuICAgIH07XG4gICAgYXdhaXQgZGRiLnNlbmQoXG4gICAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgICBnb2FsV2VpZ2h0OiB7IE46IFN0cmluZyhzZXR0aW5ncy5nb2FsV2VpZ2h0KSB9LFxuICAgICAgICAgIHN0YXJ0V2VpZ2h0OiB7IE46IFN0cmluZyhzZXR0aW5ncy5zdGFydFdlaWdodCkgfSxcbiAgICAgICAgICB0YXJnZXREYXRlOiB7IFM6IHNldHRpbmdzLnRhcmdldERhdGUgfSxcbiAgICAgICAgICB1bml0OiB7IFM6IHNldHRpbmdzLnVuaXQgfSxcbiAgICAgICAgICB0b25lOiB7IFM6IHNldHRpbmdzLnRvbmUgPz8gXCJmcmllbmRseVwiIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgc2V0dGluZ3M6IHtcbiAgICAgICAgZ29hbFdlaWdodDogc2V0dGluZ3MuZ29hbFdlaWdodCxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHNldHRpbmdzLnN0YXJ0V2VpZ2h0LFxuICAgICAgICB0YXJnZXREYXRlOiBzZXR0aW5ncy50YXJnZXREYXRlLFxuICAgICAgICB1bml0OiBzZXR0aW5ncy51bml0LFxuICAgICAgICB0b25lOiBzZXR0aW5ncy50b25lLFxuICAgICAgICBwbGF0ZWF1OiB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5nb2FsV2VpZ2h0Py5OID8/IDcyKSxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uc3RhcnRXZWlnaHQ/Lk4gPz8gODUpLFxuICAgICAgdGFyZ2V0RGF0ZTogb3V0Lkl0ZW0udGFyZ2V0RGF0ZT8uUyA/PyBkZWZhdWx0VGFyZ2V0RGF0ZSgpLFxuICAgICAgdW5pdDogb3V0Lkl0ZW0udW5pdD8uUyA9PT0gXCJsYnNcIiA/IFwibGJzXCIgOiBcImtnXCIsXG4gICAgICB0b25lOlxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICAgICAgb3V0Lkl0ZW0udG9uZT8uUyA9PT0gXCJheXVydmVkaWNcIlxuICAgICAgICAgID8gb3V0Lkl0ZW0udG9uZS5TXG4gICAgICAgICAgOiBcImZyaWVuZGx5XCIsXG4gICAgICBwbGF0ZWF1OiBwbGF0ZWF1U2V0dGluZ3NGcm9tSXRlbShvdXQuSXRlbSksXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhdGNoU2V0dGluZ3ModXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgZXhpc3RpbmdPdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZVNldHRpbmdzKHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuXG4gIGNvbnN0IGV4aXN0aW5nVG9uZSA9XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJjbGluaWNhbFwiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJ0b3VnaC1sb3ZlXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiIHx8XG4gICAgZXhpc3RpbmdPdXQuSXRlbT8udG9uZT8uUyA9PT0gXCJmcmllbmRseVwiXG4gICAgICA/IGV4aXN0aW5nT3V0Lkl0ZW0udG9uZS5TXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgY29uc3QgdG9uZSA9IGRhdGEudG9uZSA/PyBleGlzdGluZ1RvbmUgPz8gXCJmcmllbmRseVwiO1xuXG4gIGxldCBuZXh0UGxhdGVhdSA9IHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKGV4aXN0aW5nT3V0Lkl0ZW0pO1xuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGJvZHksIFwicGxhdGVhdVwiKSkge1xuICAgIGNvbnN0IHJhd1BsYXRlYXUgPSBib2R5LnBsYXRlYXU7XG4gICAgaWYgKHJhd1BsYXRlYXUgPT09IG51bGwpIHtcbiAgICAgIG5leHRQbGF0ZWF1ID0gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwID0gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QocmF3UGxhdGVhdSk7XG4gICAgICBpZiAoIXAub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwLmVycm9yIH0pO1xuICAgICAgbmV4dFBsYXRlYXUgPSB7IC4uLm5leHRQbGF0ZWF1LCAuLi5wLmRhdGEgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5zdGFydFdlaWdodCkgfSxcbiAgICB0YXJnZXREYXRlOiB7IFM6IGRhdGEudGFyZ2V0RGF0ZSB9LFxuICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgdG9uZTogeyBTOiB0b25lIH0sXG4gIH07XG4gIGlmIChuZXh0UGxhdGVhdT8ucm9sbGluZ1dpbmRvd0RheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdVJvbGxpbmdXaW5kb3dEYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5yb2xsaW5nV2luZG93RGF5cykpIH07XG4gIH1cbiAgaWYgKG5leHRQbGF0ZWF1Py5jb21wYXJpc29uU3BhbkRheXMgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cyA9IHsgTjogU3RyaW5nKE1hdGgucm91bmQobmV4dFBsYXRlYXUuY29tcGFyaXNvblNwYW5EYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/Lm1heEF2Z01vdmVtZW50S2cgIT0gbnVsbCkge1xuICAgIGl0ZW0ucGxhdGVhdU1heE1vdmVtZW50S2cgPSB7IE46IFN0cmluZyhuZXh0UGxhdGVhdS5tYXhBdmdNb3ZlbWVudEtnKSB9O1xuICB9XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbTogaXRlbSBhcyBuZXZlcixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogZGF0YS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGRhdGEuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBkYXRhLnRhcmdldERhdGUsXG4gICAgICB1bml0OiBkYXRhLnVuaXQsXG4gICAgICB0b25lLFxuICAgICAgcGxhdGVhdTogbmV4dFBsYXRlYXUsXG4gICAgfSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgJiYgdHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgPyAocGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgOiB7fTtcbiAgY29uc3QgY29udGVudFR5cGUgPVxuICAgIHR5cGVvZiBib2R5LmNvbnRlbnRUeXBlID09PSBcInN0cmluZ1wiICYmIGJvZHkuY29udGVudFR5cGUubGVuZ3RoID4gMFxuICAgICAgPyBib2R5LmNvbnRlbnRUeXBlXG4gICAgICA6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCI7XG4gIGNvbnN0IGZpbGVOYW1lID0gdHlwZW9mIGJvZHkuZmlsZU5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmZpbGVOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21GaWxlTmFtZSA9IGZpbGVOYW1lLm1hdGNoKC9cXC4oW2EtekEtWjAtOV0rKSQvKT8uWzFdPy50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IGV4dEZyb21Cb2R5ID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwiXCI7XG4gIGNvbnN0IGV4dGVuc2lvbiA9XG4gICAgZXh0RnJvbUZpbGVOYW1lICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tRmlsZU5hbWUpXG4gICAgICA/IGV4dEZyb21GaWxlTmFtZVxuICAgICAgOiBleHRGcm9tQm9keSAmJiAvXlthLXowLTldKyQvLnRlc3QoZXh0RnJvbUJvZHkpXG4gICAgICAgID8gZXh0RnJvbUJvZHlcbiAgICAgICAgOiBcImpwZ1wiO1xuICBjb25zdCBkYXRlID0gaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkgPyBib2R5LmRhdGUgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBraW5kID0gdHlwZW9mIGJvZHkua2luZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkua2luZC50cmltKCkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gIGNvbnN0IGtleSA9XG4gICAga2luZCA9PT0gXCJmb29kXCJcbiAgICAgID8gYCR7dXNlcklkfS9mb29kLyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gXG4gICAgICA6IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBmcm9tRGIgPSAob3V0Lkl0ZW1zID8/IFtdKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KChhY2MsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBmbGFnID0gaXRlbS5mbGFnPy5TO1xuICAgIGNvbnN0IGVuYWJsZWRSYXcgPSBpdGVtLmVuYWJsZWQ/LkJPT0w7XG4gICAgaWYgKHR5cGVvZiBmbGFnID09PSBcInN0cmluZ1wiICYmIHR5cGVvZiBlbmFibGVkUmF3ID09PSBcImJvb2xlYW5cIikge1xuICAgICAgYWNjW2ZsYWddID0gZW5hYmxlZFJhdztcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwge30pO1xuXG4gIGNvbnN0IHNlcnZlckRlZmF1bHRzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuICBjb25zdCBwaG90b0Zvb2QgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9QSE9UT19GT09EX0xPR1wiKTtcbiAgaWYgKHR5cGVvZiBwaG90b0Zvb2QgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgc2VydmVyRGVmYXVsdHMuRkZfUEhPVE9fRk9PRF9MT0cgPSBwaG90b0Zvb2Q7XG4gIH1cbiAgY29uc3QgbWVhbExpYnJhcnkgPSBlbnZGbGFnVHJpU3RhdGUoXCJGRl9NRUFMX0xJQlJBUllcIik7XG4gIGlmICh0eXBlb2YgbWVhbExpYnJhcnkgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgc2VydmVyRGVmYXVsdHMuRkZfTUVBTF9MSUJSQVJZID0gbWVhbExpYnJhcnk7XG4gIH1cblxuICBjb25zdCBvdmVycmlkZXMgPSB7IC4uLnNlcnZlckRlZmF1bHRzLCAuLi5mcm9tRGIgfTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IHVzZXJJZCwgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0RmVhdHVyZUZsYWdPdmVycmlkZXMoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRhcmdldFVzZXJJZCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkO1xuICBpZiAoIXRhcmdldFVzZXJJZCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJNaXNzaW5nIHVzZXJJZCBxdWVyeSBwYXJhbWV0ZXJcIiB9KTtcbiAgfVxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHRhcmdldFVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3Qgb3ZlcnJpZGVzID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKChpdGVtKSA9PiAoe1xuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdGFyZ2V0VXNlcklkLFxuICAgIGZsYWc6IGl0ZW0uZmxhZz8uUyA/PyBcIlwiLFxuICAgIGVuYWJsZWQ6IGl0ZW0uZW5hYmxlZD8uQk9PTCA/PyBmYWxzZSxcbiAgICB0czogaXRlbS50cz8uUyA/PyBcIlwiLFxuICB9KSk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEZlYXR1cmVGbGFnT3ZlcnJpZGUoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkZFQVRVUkVfRkxBR19PVkVSUklERVNfVEFCTEVfTkFNRVwiLCBmZWF0dXJlRmxhZ092ZXJyaWRlc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH0pO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgdXNlcklkID0gdHlwZW9mIGJvZHkudXNlcklkID09PSBcInN0cmluZ1wiID8gYm9keS51c2VySWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgcmF3RmxhZyA9IHR5cGVvZiBib2R5LmZsYWcgPT09IFwic3RyaW5nXCIgPyBib2R5LmZsYWcudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgZW5hYmxlZCA9IHR5cGVvZiBib2R5LmVuYWJsZWQgPT09IFwiYm9vbGVhblwiID8gYm9keS5lbmFibGVkIDogbnVsbDtcbiAgaWYgKCF1c2VySWQgfHwgIXJhd0ZsYWcgfHwgZW5hYmxlZCA9PT0gbnVsbCkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHBheWxvYWQuIEV4cGVjdGVkIHVzZXJJZCwgZmxhZywgZW5hYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBub3JtYWxpemVkRmxhZyA9IHJhd0ZsYWcuc3RhcnRzV2l0aChcIkZGX1wiKSA/IHJhd0ZsYWcgOiBgRkZfJHtyYXdGbGFnfWA7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZmxhZzogeyBTOiBub3JtYWxpemVkRmxhZyB9LFxuICAgICAgICBlbmFibGVkOiB7IEJPT0w6IGVuYWJsZWQgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgb3ZlcnJpZGU6IHsgdXNlcklkLCBmbGFnOiBub3JtYWxpemVkRmxhZywgZW5hYmxlZCwgdHMgfSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHVzZXJJZCA9IGdldFVzZXJJZChldmVudCk7XG4gICAgaWYgKCF1c2VySWQpIHJldHVybiBqc29uKDQwMSwgeyBlcnJvcjogXCJVbmF1dGhvcml6ZWRcIiB9KTtcbiAgICBjb25zdCBtZXRob2QgPSAoXG4gICAgICBldmVudCBhcyB7IHJlcXVlc3RDb250ZXh0PzogeyBodHRwPzogeyBtZXRob2Q/OiBzdHJpbmcgfSB9IH1cbiAgICApLnJlcXVlc3RDb250ZXh0Py5odHRwPy5tZXRob2Q7XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZW50cmllc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRFbnRyaWVzKHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgICAgcmV0dXJuIHVwc2VydEVudHJ5KHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgICByZXR1cm4gZGVsZXRlRW50cnkodXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zZXR0aW5nc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRTZXR0aW5ncyh1c2VySWQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICAgIHJldHVybiBwYXRjaFNldHRpbmdzKHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRJbnNpZ2h0c1YyKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2VzdGltYXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZEVzdGltYXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBzMyxcbiAgICAgICAgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUsXG4gICAgICAgIHBob3RvQnVja2V0TmFtZTogYnVja2V0LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbG9nLWNvbmZpcm1cIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTG9nQ29uZmlybSh1c2VySWQsIGV2ZW50LCB7IGRkYiwgZm9vZExvZ1RhYmxlTmFtZTogdGFibGUgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvbWVhbC1jb21wbGV0ZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IGZvb2RUID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZm9vZFQgfHwgIW1UIHx8ICFkVCkge1xuICAgICAgICByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kTWVhbENvbXBsZXRlKHVzZXJJZCwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBmb29kTG9nVGFibGVOYW1lOiBmb29kVCxcbiAgICAgICAgbWVhbHNUYWJsZU5hbWU6IG1ULFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHMvc3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNTdWdnZXN0TWF0Y2godXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvbWVhbHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzTGlzdCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFsc1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzQ3JlYXRlKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVhbEhpc3RvcnlNYXRjaCA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL21lYWxzXFwvKFteL10rKVxcL2hpc3RvcnkkLyk7XG4gICAgaWYgKG1lYWxIaXN0b3J5TWF0Y2ggJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzSGlzdG9yeSh1c2VySWQsIG1lYWxIaXN0b3J5TWF0Y2hbMV0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbWVhbFBhdGNoRGVsID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvbWVhbHNcXC8oW14vXSspJC8pO1xuICAgIGlmIChtZWFsUGF0Y2hEZWwgJiYgbWVhbFBhdGNoRGVsWzFdICE9PSBcInN1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNQYXRjaCh1c2VySWQsIG1lYWxQYXRjaERlbFsxXSwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuICAgIGlmIChtZWFsUGF0Y2hEZWwgJiYgbWVhbFBhdGNoRGVsWzFdICE9PSBcInN1Z2dlc3QtbWF0Y2hcIiAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBpZiAoIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbHMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMk1lYWxzRGVsZXRlKHVzZXJJZCwgbWVhbFBhdGNoRGVsWzFdLCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGRheU1lYWxMaXN0T3JDcmVhdGUgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9kYXlzXFwvKFtcXGQtXSspXFwvbWVhbC1lbnRyaWVzJC8pO1xuICAgIGlmIChkYXlNZWFsTGlzdE9yQ3JlYXRlICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgZFQgPSBkYXlNZWFsRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJEYXkgbWVhbCBlbnRyaWVzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QodXNlcklkLCBkYXlNZWFsTGlzdE9yQ3JlYXRlWzFdLCB7IGRkYiwgZGF5TWVhbHNUYWJsZU5hbWU6IGRUIH0pO1xuICAgIH1cbiAgICBpZiAoZGF5TWVhbExpc3RPckNyZWF0ZSAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghZFQgfHwgIW1UKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSh1c2VySWQsIGRheU1lYWxMaXN0T3JDcmVhdGVbMV0sIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgZGF5TWVhbHNUYWJsZU5hbWU6IGRULFxuICAgICAgICBtZWFsc1RhYmxlTmFtZTogbVQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXlNZWFsRGVsID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvZGF5c1xcLyhbXFxkLV0rKVxcL21lYWwtZW50cmllc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKGRheU1lYWxEZWwgJiYgbWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyeURlbGV0ZSh1c2VySWQsIGRheU1lYWxEZWxbMV0sIGRheU1lYWxEZWxbMl0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL3VzZXJzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZmVhdHVyZS1mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldEZlYXR1cmVGbGFnc0ZvclVzZXIodXNlcklkKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiBsaXN0RmVhdHVyZUZsYWdPdmVycmlkZXMoZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi9mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgcmV0dXJuIHVwc2VydEZlYXR1cmVGbGFnT3ZlcnJpZGUoZXZlbnQpO1xuICAgIH1cblxuICAgIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJOb3QgRm91bmRcIiB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlID09PSBcIkludmFsaWQgSlNPTlwiKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBKU09OXCIgfSk7XG4gICAgfVxuICAgIGNvbnNvbGUuZXJyb3IoXCJMYW1iZGEgaGFuZGxlciBlcnJvclwiLCBlcnJvcik7XG4gICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkludGVybmFsIFNlcnZlciBFcnJvclwiIH0pO1xuICB9XG59XG4iXX0=