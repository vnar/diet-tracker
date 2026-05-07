"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const plateauDetection_1 = require("../../../lib/insights/plateauDetection");
const insights_llm_refine_1 = require("./insights-llm-refine");
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
async function getInsightsV2(userId, event) {
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
    const entries = (out.Items ?? []).map((item) => ({
        id: item.id?.S ?? `${userId}:${item.date?.S ?? ""}`,
        userId: item.userId?.S ?? userId,
        date: item.date?.S ?? "",
        morningWeight: Number(item.morningWeight?.N ?? 0),
        lateSnack: item.lateSnack?.BOOL ?? false,
        highSodium: item.highSodium?.BOOL ?? false,
        workout: item.workout?.BOOL ?? false,
        alcohol: item.alcohol?.BOOL ?? false,
        notes: item.notes?.S ?? undefined,
    }));
    const settingsTable = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const settingsRow = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: settingsTable,
        Key: { userId: { S: userId } },
        ConsistentRead: true,
    }));
    const plateauPrefs = plateauSettingsFromItem(settingsRow.Item);
    const sortedForPlateau = sortByDateAsc(entries);
    const plateauEval = (0, plateauDetection_1.evaluatePlateau)(sortedForPlateau.map((e) => ({ date: e.date, morningWeight: e.morningWeight })), plateauPrefs);
    const plateauCard = plateauEval ? (0, plateauDetection_1.plateauInsightFromEvaluation)(plateauEval) : null;
    const candidates = [
        sodiumInsight(entries),
        alcoholInsight(entries),
        lateSnackInsight(entries),
        plateauCard,
    ].filter((ins) => ins !== null);
    const top = [...new Map(candidates.map((item) => [item.ruleId, item])).values()]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3);
    const sortedEntries = sortByDateAsc(entries);
    const latestDate = sortedEntries[sortedEntries.length - 1]?.date ?? to;
    const fallback = entries.length === 0
        ? baselineInsightNoLogs(to)
        : baselineInsightWithLogs(entries.length, latestDate);
    const insights = (top.length > 0 ? top : [fallback]).map((i) => ({
        ...i,
        generationSource: "rules",
    }));
    const t = settingsRow.Item?.tone?.S;
    const tone = t === "friendly" || t === "clinical" || t === "tough-love" || t === "ayurvedic" ? t : "friendly";
    const firstName = firstNameFromJwtClaims(getJwtClaims(event)) ?? "there";
    const recentNotes = entries
        .map((e) => (typeof e.notes === "string" ? e.notes : undefined))
        .filter((n) => Boolean(n))
        .slice(-5);
    const refined = await (0, insights_llm_refine_1.maybeRefineInsightCards)(ddb, {
        userId,
        insights,
        tone,
        firstName,
        recentNotes,
    });
    return json(200, { insights: refined });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFpdUNBLDBCQTRLQztBQTc0Q0QsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELDZFQUF1RztBQUN2RywrREFBZ0U7QUFDaEUsaURBQThFO0FBQzlFLDJDQVdxQjtBQUVyQixNQUFNLEdBQUcsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksZ0VBQTZCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFekQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO0FBQ3hELE1BQU0saUJBQWlCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUMxRCxNQUFNLHdCQUF3QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7QUFDekUsTUFBTSw2QkFBNkIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDO0FBQ3BGLE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7QUFDcEQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3hFLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksS0FBSyxD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SSxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLENBQUMsTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDN0UsT0FBTyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxLQUFLLGNBQWMsSUFBSSxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLENBQUMsTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQUUsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDN0UsT0FBTyx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixJQUFJLEtBQUssWUFBWSxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUMvRCxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQsXG4gIEdldFVzZXJDb21tYW5kLFxuICBMaXN0VXNlcnNDb21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWNvZ25pdG8taWRlbnRpdHktcHJvdmlkZXJcIjtcbmltcG9ydCB7XG4gIER5bmFtb0RCQ2xpZW50LFxuICBEZWxldGVJdGVtQ29tbWFuZCxcbiAgR2V0SXRlbUNvbW1hbmQsXG4gIFB1dEl0ZW1Db21tYW5kLFxuICBRdWVyeUNvbW1hbmQsXG4gIFNjYW5Db21tYW5kLFxuICBVcGRhdGVJdGVtQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1keW5hbW9kYlwiO1xuaW1wb3J0IHsgR2V0T2JqZWN0Q29tbWFuZCwgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LXMzXCI7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tIFwiQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXJcIjtcbmltcG9ydCB7IGV2YWx1YXRlUGxhdGVhdSwgcGxhdGVhdUluc2lnaHRGcm9tRXZhbHVhdGlvbiB9IGZyb20gXCIuLi8uLi8uLi9saWIvaW5zaWdodHMvcGxhdGVhdURldGVjdGlvblwiO1xuaW1wb3J0IHsgbWF5YmVSZWZpbmVJbnNpZ2h0Q2FyZHMgfSBmcm9tIFwiLi9pbnNpZ2h0cy1sbG0tcmVmaW5lXCI7XG5pbXBvcnQgeyBoYW5kbGVWMkZvb2RFc3RpbWF0ZSwgaGFuZGxlVjJGb29kTG9nQ29uZmlybSB9IGZyb20gXCIuL2Zvb2QtbG9nLWFwaVwiO1xuaW1wb3J0IHtcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0NyZWF0ZSxcbiAgaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QsXG4gIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlLFxuICBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUsXG4gIGhhbmRsZVYyTWVhbHNDcmVhdGUsXG4gIGhhbmRsZVYyTWVhbHNEZWxldGUsXG4gIGhhbmRsZVYyTWVhbHNIaXN0b3J5LFxuICBoYW5kbGVWMk1lYWxzTGlzdCxcbiAgaGFuZGxlVjJNZWFsc1BhdGNoLFxuICBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoLFxufSBmcm9tIFwiLi9tZWFscy1hcGlcIjtcblxuY29uc3QgZGRiID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHt9KTtcbmNvbnN0IGNvZ25pdG9JZHAgPSBuZXcgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQoe30pO1xuXG5jb25zdCBlbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3Qgc2V0dGluZ3NUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5TRVRUSU5HU19UQUJMRV9OQU1FO1xuY29uc3QgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuSU5TSUdIVF9GRUVEQkFDS19UQUJMRV9OQU1FO1xuY29uc3QgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5GRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUU7XG5jb25zdCBwaG90b0J1Y2tldE5hbWUgPSBwcm9jZXNzLmVudi5QSE9UT19CVUNLRVRfTkFNRTtcbmNvbnN0IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRk9PRF9MT0dfRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3QgbWVhbHNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5NRUFMU19UQUJMRV9OQU1FO1xuY29uc3QgZGF5TWVhbEVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5EQVlfTUVBTF9FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCB1cGxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LlVQTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCI5MDBcIik7XG5jb25zdCBkb3dubG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiMzYwMFwiKTtcbmNvbnN0IGFuYWx5dGljc01ldGFVc2VySWQgPSBcIl9fbWV0YV9fXCI7XG5jb25zdCB1c2VyUG9vbElkRW52ID0gcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEO1xuXG50eXBlIENsYWltcyA9IHtcbiAgc3ViOiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247XG59O1xuXG50eXBlIEh0dHBFdmVudCA9IHtcbiAgcmF3UGF0aDogc3RyaW5nO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcbiAgcmVxdWVzdENvbnRleHQ/OiB7XG4gICAgYXV0aG9yaXplcj86IHtcbiAgICAgIGp3dD86IHtcbiAgICAgICAgY2xhaW1zPzogQ2xhaW1zO1xuICAgICAgfTtcbiAgICB9O1xuICB9O1xuICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbDtcbiAgYm9keT86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIGJvZHk6IHN0cmluZztcbn07XG5cbnR5cGUgRGFpbHlFbnRyeVVwc2VydCA9IHtcbiAgZGF0ZTogc3RyaW5nO1xuICBtb3JuaW5nV2VpZ2h0OiBudW1iZXI7XG4gIG5pZ2h0V2VpZ2h0PzogbnVtYmVyIHwgbnVsbDtcbiAgY2Fsb3JpZXM/OiBudW1iZXI7XG4gIHByb3RlaW4/OiBudW1iZXI7XG4gIHN0ZXBzPzogbnVtYmVyO1xuICBzbGVlcD86IG51bWJlcjtcbiAgbGF0ZVNuYWNrOiBib29sZWFuO1xuICBoaWdoU29kaXVtOiBib29sZWFuO1xuICB3b3Jrb3V0OiBib29sZWFuO1xuICBhbGNvaG9sOiBib29sZWFuO1xuICBwaG90b1VybD86IHN0cmluZyB8IG51bGw7XG4gIG5vdGVzPzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgU2V0dGluZ3NQYXRjaCA9IHtcbiAgZ29hbFdlaWdodDogbnVtYmVyO1xuICBzdGFydFdlaWdodDogbnVtYmVyO1xuICB0YXJnZXREYXRlOiBzdHJpbmc7XG4gIHVuaXQ6IFwia2dcIiB8IFwibGJzXCI7XG4gIHRvbmU/OiBcImZyaWVuZGx5XCIgfCBcImNsaW5pY2FsXCIgfCBcInRvdWdoLWxvdmVcIiB8IFwiYXl1cnZlZGljXCI7XG59O1xuXG50eXBlIFN0b3JlZEVudHJ5ID0gRGFpbHlFbnRyeVVwc2VydCAmIHtcbiAgaWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xufTtcblxudHlwZSBTdG9yZWRTZXR0aW5ncyA9IFNldHRpbmdzUGF0Y2ggJiB7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxudHlwZSBQbGF0ZWF1VXNlclNldHRpbmdzID0ge1xuICByb2xsaW5nV2luZG93RGF5cz86IG51bWJlcjtcbiAgY29tcGFyaXNvblNwYW5EYXlzPzogbnVtYmVyO1xuICBtYXhBdmdNb3ZlbWVudEtnPzogbnVtYmVyO1xufTtcblxudHlwZSBJbnNpZ2h0Q2FyZCA9IHtcbiAgaWQ6IHN0cmluZztcbiAgcnVsZUlkOiBzdHJpbmc7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIGhlYWRsaW5lOiBzdHJpbmc7XG4gIGRldGFpbD86IHN0cmluZztcbiAgd2h5OiBzdHJpbmdbXTtcbiAgYWN0aW9uOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBcInNvZGl1bVwiIHwgXCJhbGNvaG9sXCIgfCBcImxhdGVfc25hY2tcIiB8IFwid29ya291dFwiIHwgXCJwbGF0ZWF1XCIgfCBcInN0cmVha1wiIHwgXCJ0cmFqZWN0b3J5XCI7XG4gIGdlbmVyYXRpb25Tb3VyY2U/OiBcImxsbVwiIHwgXCJydWxlc1wiO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBlbnZGbGFnVHJpU3RhdGUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHYgPSBwcm9jZXNzLmVudltuYW1lXTtcbiAgaWYgKHYgPT09IFwidHJ1ZVwiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHYgPT09IFwiZmFsc2VcIikgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZGF0ZTogYm9keS5kYXRlLFxuICAgICAgbW9ybmluZ1dlaWdodDogYm9keS5tb3JuaW5nV2VpZ2h0LFxuICAgICAgbmlnaHRXZWlnaHQ6IChib2R5Lm5pZ2h0V2VpZ2h0IGFzIG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBib2R5LmNhbG9yaWVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGJvZHkucHJvdGVpbiBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzdGVwczogYm9keS5zdGVwcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogYm9keS5zbGVlcCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGJvZHkubGF0ZVNuYWNrIGFzIGJvb2xlYW4sXG4gICAgICBoaWdoU29kaXVtOiBib2R5LmhpZ2hTb2RpdW0gYXMgYm9vbGVhbixcbiAgICAgIHdvcmtvdXQ6IGJvZHkud29ya291dCBhcyBib29sZWFuLFxuICAgICAgYWxjb2hvbDogYm9keS5hbGNvaG9sIGFzIGJvb2xlYW4sXG4gICAgICBwaG90b1VybDogKGJvZHkucGhvdG9VcmwgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgbm90ZXM6IChib2R5Lm5vdGVzIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVNldHRpbmdzKGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogU2V0dGluZ3NQYXRjaCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LmdvYWxXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZ29hbFdlaWdodFwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LnN0YXJ0V2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXJ0V2VpZ2h0XCIgfTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS50YXJnZXREYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRhcmdldERhdGVcIiB9O1xuICBpZiAoYm9keS51bml0ICE9PSBcImtnXCIgJiYgYm9keS51bml0ICE9PSBcImxic1wiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdW5pdFwiIH07XG4gIGlmIChcbiAgICBib2R5LnRvbmUgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJmcmllbmRseVwiICYmXG4gICAgYm9keS50b25lICE9PSBcImNsaW5pY2FsXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwidG91Z2gtbG92ZVwiICYmXG4gICAgYm9keS50b25lICE9PSBcImF5dXJ2ZWRpY1wiXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0b25lXCIgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGJvZHkuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBib2R5LnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogYm9keS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogYm9keS51bml0LFxuICAgICAgdG9uZTogYm9keS50b25lIGFzIFNldHRpbmdzUGF0Y2hbXCJ0b25lXCJdLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldEp3dENsYWltcyhldmVudDogSHR0cEV2ZW50KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuICBjb25zdCByYXcgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uand0Py5jbGFpbXM7XG4gIGlmIChyYXcgPT0gbnVsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG4gICAgICBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVzZXJJZChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3Qgc3ViID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KT8uc3ViO1xuICByZXR1cm4gdHlwZW9mIHN1YiA9PT0gXCJzdHJpbmdcIiA/IHN1YiA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZmlyc3ROYW1lRnJvbUp3dENsYWltcyhjbGFpbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFjbGFpbXMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IGdpdmVuID0gY2xhaW1zLmdpdmVuX25hbWU7XG4gIGlmICh0eXBlb2YgZ2l2ZW4gPT09IFwic3RyaW5nXCIgJiYgZ2l2ZW4udHJpbSgpKSByZXR1cm4gZ2l2ZW4udHJpbSgpO1xuICBjb25zdCBuYW1lID0gY2xhaW1zLm5hbWU7XG4gIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIiAmJiBuYW1lLnRyaW0oKSkge1xuICAgIGNvbnN0IGZpcnN0ID0gbmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXTtcbiAgICByZXR1cm4gZmlyc3QgfHwgdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKFxuICBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQsXG4pOiBQbGF0ZWF1VXNlclNldHRpbmdzIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFpdGVtKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBvdXQ6IFBsYXRlYXVVc2VyU2V0dGluZ3MgPSB7fTtcbiAgY29uc3QgcncgPSBpdGVtLnBsYXRlYXVSb2xsaW5nV2luZG93RGF5cz8uTjtcbiAgY29uc3Qgc3BhbiA9IGl0ZW0ucGxhdGVhdUNvbXBhcmlzb25TcGFuRGF5cz8uTjtcbiAgY29uc3QgbXYgPSBpdGVtLnBsYXRlYXVNYXhNb3ZlbWVudEtnPy5OO1xuICBpZiAocncgIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIocncpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIG91dC5yb2xsaW5nV2luZG93RGF5cyA9IG47XG4gIH1cbiAgaWYgKHNwYW4gIT0gbnVsbCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoc3Bhbik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShuKSkgb3V0LmNvbXBhcmlzb25TcGFuRGF5cyA9IG47XG4gIH1cbiAgaWYgKG12ICE9IG51bGwpIHtcbiAgICBjb25zdCBuID0gTnVtYmVyKG12KTtcbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSBvdXQubWF4QXZnTW92ZW1lbnRLZyA9IG47XG4gIH1cbiAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQbGF0ZWF1UGF0Y2hPYmplY3QoXG4gIHJhdzogdW5rbm93bixcbik6IHsgb2s6IHRydWU7IGRhdGE6IFBsYXRlYXVVc2VyU2V0dGluZ3MgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiIHx8IEFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwicGxhdGVhdSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgbyA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgZGF0YTogUGxhdGVhdVVzZXJTZXR0aW5ncyA9IHt9O1xuICBpZiAoby5yb2xsaW5nV2luZG93RGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLnJvbGxpbmdXaW5kb3dEYXlzKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUucm9sbGluZ1dpbmRvd0RheXNcIiB9O1xuICAgIGRhdGEucm9sbGluZ1dpbmRvd0RheXMgPSBuO1xuICB9XG4gIGlmIChvLmNvbXBhcmlzb25TcGFuRGF5cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbiA9IE51bWJlcihvLmNvbXBhcmlzb25TcGFuRGF5cyk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwbGF0ZWF1LmNvbXBhcmlzb25TcGFuRGF5c1wiIH07XG4gICAgZGF0YS5jb21wYXJpc29uU3BhbkRheXMgPSBuO1xuICB9XG4gIGlmIChvLm1heEF2Z01vdmVtZW50S2cgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIoby5tYXhBdmdNb3ZlbWVudEtnKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBsYXRlYXUubWF4QXZnTW92ZW1lbnRLZ1wiIH07XG4gICAgZGF0YS5tYXhBdmdNb3ZlbWVudEtnID0gbjtcbiAgfVxuICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YSB9O1xufVxuXG4vKiogR21haWwgdHJlYXRzIGRvdHMgYW5kICtsYWJlbHMgYXMgYWxpYXNlczsgbm9ybWFsaXplIHNvIGFkbWluIGxpc3QgbWF0Y2hlcyByZWFsIHNpZ24taW4gaWRlbnRpdGllcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChlbWFpbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbG93ZXIgPSBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgYXQgPSBsb3dlci5sYXN0SW5kZXhPZihcIkBcIik7XG4gIGlmIChhdCA8PSAwKSByZXR1cm4gbG93ZXI7XG4gIGNvbnN0IGxvY2FsID0gbG93ZXIuc2xpY2UoMCwgYXQpO1xuICBjb25zdCBkb21haW4gPSBsb3dlci5zbGljZShhdCArIDEpO1xuICBpZiAoZG9tYWluID09PSBcImdtYWlsLmNvbVwiIHx8IGRvbWFpbiA9PT0gXCJnb29nbGVtYWlsLmNvbVwiKSB7XG4gICAgY29uc3QgYmFzZUxvY2FsID0gKGxvY2FsLnNwbGl0KFwiK1wiKVswXSA/PyBsb2NhbCkucmVwbGFjZSgvXFwuL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlTG9jYWx9QCR7ZG9tYWlufWA7XG4gIH1cbiAgcmV0dXJuIGxvd2VyO1xufVxuXG5mdW5jdGlvbiBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTogU2V0PHN0cmluZz4ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICBjb25zdCBwYXJ0cyA9IHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2gocy50cmltKCkpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQocGFydHMpO1xuICBpZiAoc2V0LnNpemUgPT09IDApIHtcbiAgICBzZXQuYWRkKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChcInZpaGFybmFyQGdtYWlsLmNvbVwiKSk7XG4gIH1cbiAgcmV0dXJuIHNldDtcbn1cblxuY29uc3QgQURNSU5fQ0xBSU1fS0VZUyA9IFtcInVzZXJuYW1lXCIsIFwiY29nbml0bzp1c2VybmFtZVwiLCBcImVtYWlsXCIsIFwicHJlZmVycmVkX3VzZXJuYW1lXCJdIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZ1tdIHtcbiAgY29uc3QgZm91bmQ6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGVtYWlsaXNoID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gIGZvciAoY29uc3Qga2V5IG9mIEFETUlOX0NMQUlNX0tFWVMpIHtcbiAgICBjb25zdCB2ID0gY2xhaW1zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjbGFpbXMpKSB7XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm5ldyBTZXQoZm91bmQpXTtcbn1cblxuLyoqIFRydWUgaWYgSldUIGNsYWltcyBpbmNsdWRlIGFuIGVtYWlsIGlkZW50aXR5IHRoYXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBhZG1pbiBhbGxvdyBsaXN0LiAqL1xuZnVuY3Rpb24gaXNBZG1pbkNhbGxlcihldmVudDogSHR0cEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsYWltcyA9IGdldEp3dENsYWltcyhldmVudCk7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zKTtcbiAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjKSkpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyVmFsdWUoXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG4gIG5hbWU6IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaGVhZGVycykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgd2FudCA9IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICBpZiAoay50b0xvd2VyQ2FzZSgpID09PSB3YW50ICYmIHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIHYubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSldUIEhUVFAgQVBJIGF1dGhvcml6ZXJzIHZhbGlkYXRlIEF1dGhvcml6YXRpb24gYnV0IHR5cGljYWxseSBkbyBub3QgZm9yd2FyZCB0aGF0IGhlYWRlciB0byBMYW1iZGEuXG4gKiBDbGllbnRzIGFsc28gc2VuZCB4LWNvZ25pdG8tYWNjZXNzLXRva2VuIChzZWUgZnJvbnRlbmQtYXBpLWNsaWVudCkgc28gd2UgY2FuIGNhbGwgY29nbml0by1pZHA6R2V0VXNlci5cbiAqL1xuZnVuY3Rpb24gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGggPSBldmVudC5oZWFkZXJzO1xuICBjb25zdCBjdXN0b20gPSBoZWFkZXJWYWx1ZShoLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIik7XG4gIGlmIChjdXN0b20/LnRyaW0oKSkgcmV0dXJuIGN1c3RvbS50cmltKCk7XG4gIGNvbnN0IHJhdyA9IGhlYWRlclZhbHVlKGgsIFwiYXV0aG9yaXphdGlvblwiKTtcbiAgaWYgKCFyYXcpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG0gPSByYXcubWF0Y2goL15CZWFyZXJcXHMrKC4rKSQvaSk7XG4gIHJldHVybiBtPy5bMV0/LnRyaW0oKTtcbn1cblxuLyoqIFdoZW4gY2xhaW1zIGxhY2sgYSByZXNvbHZhYmxlIGVtYWlsLCB2ZXJpZnkgYWRtaW4gdmlhIEdldFVzZXI7IHRva2VuIHN1YiBtdXN0IG1hdGNoIEpXVCBzdWIuICovXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluVmlhR2V0VXNlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHRva2VuID0gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQpO1xuICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGp3dFN1YiA9IGdldFVzZXJJZChldmVudCk7XG4gIGlmICghand0U3ViKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKG5ldyBHZXRVc2VyQ29tbWFuZCh7IEFjY2Vzc1Rva2VuOiB0b2tlbiB9KSk7XG4gICAgY29uc3QgYXR0cnMgPSBvdXQuVXNlckF0dHJpYnV0ZXMgPz8gW107XG4gICAgY29uc3QgdG9rZW5TdWIgPSBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwic3ViXCIpPy5WYWx1ZTtcbiAgICBpZiAodG9rZW5TdWIgIT09IGp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGVtYWlsID1cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJlbWFpbFwiKT8uVmFsdWUgPz9cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJwcmVmZXJyZWRfdXNlcm5hbWVcIik/LlZhbHVlO1xuICAgIGNvbnN0IGZyb21Vc2VybmFtZSA9IG91dC5Vc2VybmFtZT8uaW5jbHVkZXMoXCJAXCIpID8gb3V0LlVzZXJuYW1lIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IChlbWFpbCA/PyBmcm9tVXNlcm5hbWUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFjYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjYW5kaWRhdGUpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5BbGxvd2VkKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKGlzQWRtaW5DYWxsZXIoZXZlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50KTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldERhdGUoKTogc3RyaW5nIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGQuc2V0RGF0ZShkLmdldERhdGUoKSArIDExOCk7XG4gIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQaG90b1JlZmVyZW5jZShwaG90b1VybDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghcGhvdG9VcmwgfHwgdHlwZW9mIHBob3RvVXJsICE9PSBcInN0cmluZ1wiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAocGhvdG9Vcmwuc3RhcnRzV2l0aChcInMzOi8vXCIpKSByZXR1cm4gcGhvdG9Vcmw7XG4gIGlmICghcGhvdG9VcmwuaW5jbHVkZXMoXCI6Ly9cIikpIHtcbiAgICBjb25zdCBrZXlPbmx5ID0gcGhvdG9VcmwucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBpZiAoIWtleU9ubHkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7cGhvdG9CdWNrZXROYW1lfS8ke2tleU9ubHl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZUFzYzxUIGV4dGVuZHMgeyBkYXRlOiBzdHJpbmcgfT4ocm93czogVFtdKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5yb3dzXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbn1cblxuZnVuY3Rpb24gYXZlcmFnZSh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLCAwKSAvIHZhbHVlcy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHJvdW5kMih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgucm91bmQodmFsdWUgKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBuZXh0TW9ybmluZ0RlbHRhcyhcbiAgbG9nczogU3RvcmVkRW50cnlbXSxcbiAgcHJlZGljYXRlOiAobG9nOiBTdG9yZWRFbnRyeSkgPT4gYm9vbGVhbixcbik6IHsgZmxhZ2dlZDogbnVtYmVyW107IGJhc2VsaW5lOiBudW1iZXJbXSB9IHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgY29uc3QgZmxhZ2dlZDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgYmFzZWxpbmU6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNvcnRlZC5sZW5ndGggLSAxOyBpZHggKz0gMSkge1xuICAgIGNvbnN0IGRlbHRhID0gc29ydGVkW2lkeCArIDFdLm1vcm5pbmdXZWlnaHQgLSBzb3J0ZWRbaWR4XS5tb3JuaW5nV2VpZ2h0O1xuICAgIGlmIChwcmVkaWNhdGUoc29ydGVkW2lkeF0pKSBmbGFnZ2VkLnB1c2goZGVsdGEpO1xuICAgIGVsc2UgYmFzZWxpbmUucHVzaChkZWx0YSk7XG4gIH1cbiAgcmV0dXJuIHsgZmxhZ2dlZCwgYmFzZWxpbmUgfTtcbn1cblxuZnVuY3Rpb24gc29kaXVtSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmhpZ2hTb2RpdW0pO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBzb2RpdW0tYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJzb2RpdW1CdW1wXCIsXG4gICAgcHJpb3JpdHk6IDk1LFxuICAgIGhlYWRsaW5lOiBcIkhpZ2gtc29kaXVtIGRheXMgYXJlIGxpbmtlZCB0byBoZWF2aWVyIG5leHQtbW9ybmluZyB3ZWlnaC1pbnMuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZzIHlvdXIgbm9uLXNvZGl1bSBiYXNlbGluZSB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gaGlnaC1zb2RpdW0gZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugb24gaGlnaC1zb2RpdW0gZGF5czogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlRyeSBvbmUgbG93ZXItc29kaXVtIGRpbm5lciBzd2FwIHRvbmlnaHQuXCIsXG4gICAgY2F0ZWdvcnk6IFwic29kaXVtXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFsY29ob2xJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuYWxjb2hvbCk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGFsY29ob2wtYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJhbGNvaG9sXCIsXG4gICAgcHJpb3JpdHk6IDkwLFxuICAgIGhlYWRsaW5lOiBcIkFsY29ob2wgZGF5cyB0ZW5kIHRvIHNob3cgYSBuZXh0LWRheSB3ZWlnaHQgYnVtcC5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdmVyc3VzIG5vbi1hbGNvaG9sIGRheXMgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGFsY29ob2wtbG9nZ2VkIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIGFmdGVyIGFsY29ob2w6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJQbGFuIGFsY29ob2wtZnJlZSB3ZWVrZGF5cyBmb3Igc3RlYWRpZXIgdHJlbmQgbGluZXMuXCIsXG4gICAgY2F0ZWdvcnk6IFwiYWxjb2hvbFwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBsYXRlU25hY2tJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cubGF0ZVNuYWNrKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgbGF0ZS1zbmFjay1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImxhdGVTbmFja1wiLFxuICAgIHByaW9yaXR5OiA4OCxcbiAgICBoZWFkbGluZTogXCJMYXRlIHNuYWNrcyBhcmUgY29ycmVsYXRlZCB3aXRoIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHNjYWxlIHJlYWRpbmdzLlwiLFxuICAgIGRldGFpbDogYFlvdXIgbmV4dC1kYXkgY2hhbmdlIGlzICske3JvdW5kMihleGNlc3MpfSBrZyBoaWdoZXIgdGhhbiB5b3VyIG5vbi1sYXRlLXNuYWNrIGJhc2VsaW5lLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gbGF0ZS1zbmFjayBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSB3aXRoIGxhdGUgc25hY2s6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJTZXQgYSAyLWhvdXIga2l0Y2hlbiBjbG9zZSB0aW1lIGJlZm9yZSBiZWQuXCIsXG4gICAgY2F0ZWdvcnk6IFwibGF0ZV9zbmFja1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHRXaXRoTG9ncyhlbnRyeUNvdW50OiBudW1iZXIsIGxhdGVzdERhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHtsYXRlc3REYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIkdyZWF0IGNvbnNpc3RlbmN5IHNvIGZhciDigJQga2VlcCBsb2dnaW5nIGRhaWx5IGZvciBzaGFycGVyIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiV2UgbmVlZCBhIGJpdCBtb3JlIHNpZ25hbCB0byBkZXRlY3Qgc3Ryb25nIHBlcnNvbmFsIHBhdHRlcm5zLCBidXQgeW91ciBkYXRhIGZsb3cgaXMgYWN0aXZlLlwiLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZW50cnlDb3VudH0gbG9ncyBhbmFseXplZCBmcm9tIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgXCJObyBydWxlIGNyb3NzZWQgY29uZmlkZW5jZSB0aHJlc2hvbGRzIHlldFwiLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIktlZXAgdHJhY2tpbmcgZGFpbHkgaGFiaXRzIGFuZCB3ZWlnaHQgdG8gdW5sb2NrIHN0cm9uZ2VyIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0Tm9Mb2dzKGFzT2ZEYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7YXNPZkRhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiU3RhcnQgbG9nZ2luZyB3ZWlnaHQgYW5kIGhhYml0cyB0byB1bmxvY2sgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDogXCJPbmNlIHlvdSBoYXZlIGEgZmV3IHdlZWtzIG9mIGVudHJpZXMsIHdlIHdpbGwgaGlnaGxpZ2h0IHBhdHRlcm5zIHRoYXQgbWF0Y2ggeW91ciBkYXRhLlwiLFxuICAgIHdoeTogW1wiTm8gZW50cmllcyBmb3VuZCBpbiB0aGUgbGFzdCA5MCBkYXlzXCJdLFxuICAgIGFjdGlvbjogXCJBZGQgdG9kYXkncyB3ZWlnaHQgb24gdGhlIGxlZnQgdG8gYmVnaW4uXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEluc2lnaHRzVjIodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRvID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZnJvbURhdGUgPSBuZXcgRGF0ZSgpO1xuICBmcm9tRGF0ZS5zZXREYXRlKGZyb21EYXRlLmdldERhdGUoKSAtIDg5KTtcbiAgY29uc3QgZnJvbSA9IGZyb21EYXRlLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOmZyb21EYXRlXCI6IHsgUzogZnJvbSB9LFxuICAgICAgICBcIjp0b0RhdGVcIjogeyBTOiB0byB9LFxuICAgICAgfSxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBzZXR0aW5nc1RhYmxlID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgc2V0dGluZ3NSb3cgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBzZXR0aW5nc1RhYmxlLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHBsYXRlYXVQcmVmcyA9IHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKHNldHRpbmdzUm93Lkl0ZW0pO1xuICBjb25zdCBzb3J0ZWRGb3JQbGF0ZWF1ID0gc29ydEJ5RGF0ZUFzYyhlbnRyaWVzKTtcbiAgY29uc3QgcGxhdGVhdUV2YWwgPSBldmFsdWF0ZVBsYXRlYXUoXG4gICAgc29ydGVkRm9yUGxhdGVhdS5tYXAoKGUpID0+ICh7IGRhdGU6IGUuZGF0ZSwgbW9ybmluZ1dlaWdodDogZS5tb3JuaW5nV2VpZ2h0IH0pKSxcbiAgICBwbGF0ZWF1UHJlZnMsXG4gICk7XG4gIGNvbnN0IHBsYXRlYXVDYXJkOiBJbnNpZ2h0Q2FyZCB8IG51bGwgPSBwbGF0ZWF1RXZhbCA/IHBsYXRlYXVJbnNpZ2h0RnJvbUV2YWx1YXRpb24ocGxhdGVhdUV2YWwpIDogbnVsbDtcblxuICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgIHNvZGl1bUluc2lnaHQoZW50cmllcyksXG4gICAgYWxjb2hvbEluc2lnaHQoZW50cmllcyksXG4gICAgbGF0ZVNuYWNrSW5zaWdodChlbnRyaWVzKSxcbiAgICBwbGF0ZWF1Q2FyZCxcbiAgXS5maWx0ZXIoKGlucyk6IGlucyBpcyBJbnNpZ2h0Q2FyZCA9PiBpbnMgIT09IG51bGwpO1xuICBjb25zdCB0b3AgPSBbLi4ubmV3IE1hcChjYW5kaWRhdGVzLm1hcCgoaXRlbSkgPT4gW2l0ZW0ucnVsZUlkLCBpdGVtXSkpLnZhbHVlcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eSlcbiAgICAuc2xpY2UoMCwgMyk7XG4gIGNvbnN0IHNvcnRlZEVudHJpZXMgPSBzb3J0QnlEYXRlQXNjKGVudHJpZXMpO1xuICBjb25zdCBsYXRlc3REYXRlID0gc29ydGVkRW50cmllc1tzb3J0ZWRFbnRyaWVzLmxlbmd0aCAtIDFdPy5kYXRlID8/IHRvO1xuICBjb25zdCBmYWxsYmFjazogSW5zaWdodENhcmQgPVxuICAgIGVudHJpZXMubGVuZ3RoID09PSAwXG4gICAgICA/IGJhc2VsaW5lSW5zaWdodE5vTG9ncyh0bylcbiAgICAgIDogYmFzZWxpbmVJbnNpZ2h0V2l0aExvZ3MoZW50cmllcy5sZW5ndGgsIGxhdGVzdERhdGUpO1xuICBjb25zdCBpbnNpZ2h0czogSW5zaWdodENhcmRbXSA9ICh0b3AubGVuZ3RoID4gMCA/IHRvcCA6IFtmYWxsYmFja10pLm1hcCgoaSkgPT4gKHtcbiAgICAuLi5pLFxuICAgIGdlbmVyYXRpb25Tb3VyY2U6IFwicnVsZXNcIiBhcyBjb25zdCxcbiAgfSkpO1xuICBjb25zdCB0ID0gc2V0dGluZ3NSb3cuSXRlbT8udG9uZT8uUztcbiAgY29uc3QgdG9uZSA9XG4gICAgdCA9PT0gXCJmcmllbmRseVwiIHx8IHQgPT09IFwiY2xpbmljYWxcIiB8fCB0ID09PSBcInRvdWdoLWxvdmVcIiB8fCB0ID09PSBcImF5dXJ2ZWRpY1wiID8gdCA6IFwiZnJpZW5kbHlcIjtcbiAgY29uc3QgZmlyc3ROYW1lID0gZmlyc3ROYW1lRnJvbUp3dENsYWltcyhnZXRKd3RDbGFpbXMoZXZlbnQpKSA/PyBcInRoZXJlXCI7XG4gIGNvbnN0IHJlY2VudE5vdGVzID0gZW50cmllc1xuICAgIC5tYXAoKGUpID0+ICh0eXBlb2YgZS5ub3RlcyA9PT0gXCJzdHJpbmdcIiA/IGUubm90ZXMgOiB1bmRlZmluZWQpKVxuICAgIC5maWx0ZXIoKG4pOiBuIGlzIHN0cmluZyA9PiBCb29sZWFuKG4pKVxuICAgIC5zbGljZSgtNSk7XG4gIGNvbnN0IHJlZmluZWQgPSBhd2FpdCBtYXliZVJlZmluZUluc2lnaHRDYXJkcyhkZGIsIHtcbiAgICB1c2VySWQsXG4gICAgaW5zaWdodHMsXG4gICAgdG9uZSxcbiAgICBmaXJzdE5hbWUsXG4gICAgcmVjZW50Tm90ZXMsXG4gIH0pO1xuICByZXR1cm4ganNvbigyMDAsIHsgaW5zaWdodHM6IHJlZmluZWQgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUVcIiwgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBpbnNpZ2h0SWQgPSB0eXBlb2YgYm9keS5pbnNpZ2h0SWQgPT09IFwic3RyaW5nXCIgPyBib2R5Lmluc2lnaHRJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCB2b3RlID0gYm9keS52b3RlID09PSBcInVwXCIgfHwgYm9keS52b3RlID09PSBcImRvd25cIiA/IGJvZHkudm90ZSA6IG51bGw7XG4gIGlmICghaW5zaWdodElkIHx8ICF2b3RlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbnNpZ2h0IGZlZWRiYWNrIHBheWxvYWRcIiB9KTtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBpbnNpZ2h0VHM6IHsgUzogYCR7dHN9IyR7aW5zaWdodElkfWAgfSxcbiAgICAgICAgaW5zaWdodElkOiB7IFM6IGluc2lnaHRJZCB9LFxuICAgICAgICB2b3RlOiB7IFM6IHZvdGUgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW50cmllcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBmcm9tID0gcXVlcnk/LmZyb207XG4gIGNvbnN0IHRvID0gcXVlcnk/LnRvO1xuICBpZiAoZnJvbSAmJiAhaXNEYXRlU3RyaW5nKGZyb20pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmcm9tIGRhdGVcIiB9KTtcbiAgaWYgKHRvICYmICFpc0RhdGVTdHJpbmcodG8pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB0byBkYXRlXCIgfSk7XG5cbiAgY29uc3QgZXhwcmVzc2lvblZhbHVlczogUmVjb3JkPHN0cmluZywgeyBTOiBzdHJpbmcgfT4gPSB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH07XG4gIGxldCBrZXlDb25kaXRpb24gPSBcInVzZXJJZCA9IDp1c2VySWRcIjtcbiAgaWYgKGZyb20gJiYgdG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9IGVsc2UgaWYgKGZyb20pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlID49IDpmcm9tRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgfSBlbHNlIGlmICh0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPD0gOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9XG5cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IGtleUNvbmRpdGlvbixcbiAgICAgIC4uLihrZXlDb25kaXRpb24uaW5jbHVkZXMoXCIjZGF0ZVwiKVxuICAgICAgICA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSB9XG4gICAgICAgIDoge30pLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvblZhbHVlcyxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgcGhvdG9Vcmw6IGl0ZW0ucGhvdG9Vcmw/LlMgPz8gdW5kZWZpbmVkLFxuICAgIG5vdGVzOiBpdGVtLm5vdGVzPy5TID8/IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgIH0pLFxuICApO1xuXG4gIGlmICghb3V0Lkl0ZW0pIHtcbiAgICBjb25zdCBzZXR0aW5nczogU3RvcmVkU2V0dGluZ3MgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBnb2FsV2VpZ2h0OiA3MixcbiAgICAgIHN0YXJ0V2VpZ2h0OiA4NSxcbiAgICAgIHRhcmdldERhdGU6IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBcImtnXCIsXG4gICAgICB0b25lOiBcImZyaWVuZGx5XCIsXG4gICAgfTtcbiAgICBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLmdvYWxXZWlnaHQpIH0sXG4gICAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLnN0YXJ0V2VpZ2h0KSB9LFxuICAgICAgICAgIHRhcmdldERhdGU6IHsgUzogc2V0dGluZ3MudGFyZ2V0RGF0ZSB9LFxuICAgICAgICAgIHVuaXQ6IHsgUzogc2V0dGluZ3MudW5pdCB9LFxuICAgICAgICAgIHRvbmU6IHsgUzogc2V0dGluZ3MudG9uZSA/PyBcImZyaWVuZGx5XCIgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgICBzZXR0aW5nczoge1xuICAgICAgICBnb2FsV2VpZ2h0OiBzZXR0aW5ncy5nb2FsV2VpZ2h0LFxuICAgICAgICBzdGFydFdlaWdodDogc2V0dGluZ3Muc3RhcnRXZWlnaHQsXG4gICAgICAgIHRhcmdldERhdGU6IHNldHRpbmdzLnRhcmdldERhdGUsXG4gICAgICAgIHVuaXQ6IHNldHRpbmdzLnVuaXQsXG4gICAgICAgIHRvbmU6IHNldHRpbmdzLnRvbmUsXG4gICAgICAgIHBsYXRlYXU6IHVuZGVmaW5lZCxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogTnVtYmVyKG91dC5JdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpLFxuICAgICAgc3RhcnRXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSksXG4gICAgICB0YXJnZXREYXRlOiBvdXQuSXRlbS50YXJnZXREYXRlPy5TID8/IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBvdXQuSXRlbS51bml0Py5TID09PSBcImxic1wiID8gXCJsYnNcIiA6IFwia2dcIixcbiAgICAgIHRvbmU6XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwiY2xpbmljYWxcIiB8fFxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiXG4gICAgICAgICAgPyBvdXQuSXRlbS50b25lLlNcbiAgICAgICAgICA6IFwiZnJpZW5kbHlcIixcbiAgICAgIHBsYXRlYXU6IHBsYXRlYXVTZXR0aW5nc0Zyb21JdGVtKG91dC5JdGVtKSxcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBleGlzdGluZ091dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG5cbiAgY29uc3QgZXhpc3RpbmdUb25lID1cbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImNsaW5pY2FsXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgIGV4aXN0aW5nT3V0Lkl0ZW0/LnRvbmU/LlMgPT09IFwiYXl1cnZlZGljXCIgfHxcbiAgICBleGlzdGluZ091dC5JdGVtPy50b25lPy5TID09PSBcImZyaWVuZGx5XCJcbiAgICAgID8gZXhpc3RpbmdPdXQuSXRlbS50b25lLlNcbiAgICAgIDogdW5kZWZpbmVkO1xuICBjb25zdCB0b25lID0gZGF0YS50b25lID8/IGV4aXN0aW5nVG9uZSA/PyBcImZyaWVuZGx5XCI7XG5cbiAgbGV0IG5leHRQbGF0ZWF1ID0gcGxhdGVhdVNldHRpbmdzRnJvbUl0ZW0oZXhpc3RpbmdPdXQuSXRlbSk7XG4gIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYm9keSwgXCJwbGF0ZWF1XCIpKSB7XG4gICAgY29uc3QgcmF3UGxhdGVhdSA9IGJvZHkucGxhdGVhdTtcbiAgICBpZiAocmF3UGxhdGVhdSA9PT0gbnVsbCkge1xuICAgICAgbmV4dFBsYXRlYXUgPSB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHAgPSB2YWxpZGF0ZVBsYXRlYXVQYXRjaE9iamVjdChyYXdQbGF0ZWF1KTtcbiAgICAgIGlmICghcC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHAuZXJyb3IgfSk7XG4gICAgICBuZXh0UGxhdGVhdSA9IHsgLi4ubmV4dFBsYXRlYXUsIC4uLnAuZGF0YSB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZyB9PiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5nb2FsV2VpZ2h0KSB9LFxuICAgIHN0YXJ0V2VpZ2h0OiB7IE46IFN0cmluZyhkYXRhLnN0YXJ0V2VpZ2h0KSB9LFxuICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgdW5pdDogeyBTOiBkYXRhLnVuaXQgfSxcbiAgICB0b25lOiB7IFM6IHRvbmUgfSxcbiAgfTtcbiAgaWYgKG5leHRQbGF0ZWF1Py5yb2xsaW5nV2luZG93RGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Um9sbGluZ1dpbmRvd0RheXMgPSB7IE46IFN0cmluZyhNYXRoLnJvdW5kKG5leHRQbGF0ZWF1LnJvbGxpbmdXaW5kb3dEYXlzKSkgfTtcbiAgfVxuICBpZiAobmV4dFBsYXRlYXU/LmNvbXBhcmlzb25TcGFuRGF5cyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1Q29tcGFyaXNvblNwYW5EYXlzID0geyBOOiBTdHJpbmcoTWF0aC5yb3VuZChuZXh0UGxhdGVhdS5jb21wYXJpc29uU3BhbkRheXMpKSB9O1xuICB9XG4gIGlmIChuZXh0UGxhdGVhdT8ubWF4QXZnTW92ZW1lbnRLZyAhPSBudWxsKSB7XG4gICAgaXRlbS5wbGF0ZWF1TWF4TW92ZW1lbnRLZyA9IHsgTjogU3RyaW5nKG5leHRQbGF0ZWF1Lm1heEF2Z01vdmVtZW50S2cpIH07XG4gIH1cblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBkYXRhLmdvYWxXZWlnaHQsXG4gICAgICBzdGFydFdlaWdodDogZGF0YS5zdGFydFdlaWdodCxcbiAgICAgIHRhcmdldERhdGU6IGRhdGEudGFyZ2V0RGF0ZSxcbiAgICAgIHVuaXQ6IGRhdGEudW5pdCxcbiAgICAgIHRvbmUsXG4gICAgICBwbGF0ZWF1OiBuZXh0UGxhdGVhdSxcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBjb250ZW50VHlwZSA9XG4gICAgdHlwZW9mIGJvZHkuY29udGVudFR5cGUgPT09IFwic3RyaW5nXCIgJiYgYm9keS5jb250ZW50VHlwZS5sZW5ndGggPiAwXG4gICAgICA/IGJvZHkuY29udGVudFR5cGVcbiAgICAgIDogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgY29uc3QgZmlsZU5hbWUgPSB0eXBlb2YgYm9keS5maWxlTmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmlsZU5hbWUudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgZXh0RnJvbUZpbGVOYW1lID0gZmlsZU5hbWUubWF0Y2goL1xcLihbYS16QS1aMC05XSspJC8pPy5bMV0/LnRvTG93ZXJDYXNlKCkgPz8gXCJcIjtcbiAgY29uc3QgZXh0RnJvbUJvZHkgPVxuICAgIHR5cGVvZiBib2R5LmV4dGVuc2lvbiA9PT0gXCJzdHJpbmdcIiAmJiAvXlthLXpBLVowLTldKyQvLnRlc3QoYm9keS5leHRlbnNpb24pXG4gICAgICA/IGJvZHkuZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKClcbiAgICAgIDogXCJcIjtcbiAgY29uc3QgZXh0ZW5zaW9uID1cbiAgICBleHRGcm9tRmlsZU5hbWUgJiYgL15bYS16MC05XSskLy50ZXN0KGV4dEZyb21GaWxlTmFtZSlcbiAgICAgID8gZXh0RnJvbUZpbGVOYW1lXG4gICAgICA6IGV4dEZyb21Cb2R5ICYmIC9eW2EtejAtOV0rJC8udGVzdChleHRGcm9tQm9keSlcbiAgICAgICAgPyBleHRGcm9tQm9keVxuICAgICAgICA6IFwianBnXCI7XG4gIGNvbnN0IGRhdGUgPSBpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSA/IGJvZHkuZGF0ZSA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGtpbmQgPSB0eXBlb2YgYm9keS5raW5kID09PSBcInN0cmluZ1wiID8gYm9keS5raW5kLnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcbiAgY29uc3Qga2V5ID1cbiAgICBraW5kID09PSBcImZvb2RcIlxuICAgICAgPyBgJHt1c2VySWR9L2Zvb2QvJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWBcbiAgICAgIDogYCR7dXNlcklkfS8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcblxuICBjb25zdCBjb21tYW5kID0gbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgIEJ1Y2tldDogYnVja2V0LFxuICAgIEtleToga2V5LFxuICAgIENvbnRlbnRUeXBlOiBjb250ZW50VHlwZSxcbiAgfSk7XG4gIGNvbnN0IHVwbG9hZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMgfSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXBsb2FkVXJsLFxuICAgIGtleSxcbiAgICBwaG90b1VybDogYHMzOi8vJHtidWNrZXR9LyR7a2V5fWAsXG4gICAgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U3RhdHMoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IFt1c2Vyc091dCwgdmlld3NPdXRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IFNjYW5Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIFNlbGVjdDogXCJDT1VOVFwiLFxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBcIiN1aWQgPD4gOm1ldGFVc2VySWQgQU5EIGF0dHJpYnV0ZV9leGlzdHMoZ29hbFdlaWdodClcIixcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI3VpZFwiOiBcInVzZXJJZFwiIH0sXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6bWV0YVVzZXJJZFwiOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgXSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXNlcnM6IE51bWJlcih1c2Vyc091dC5Db3VudCA/PyAwKSxcbiAgICBwYWdlVmlld3M6IE51bWJlcih2aWV3c091dC5JdGVtPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHBvb2xJZCA9IGdldFJlcXVpcmVkRW52KFwiVVNFUl9QT09MX0lEXCIsIHVzZXJQb29sSWRFbnYpO1xuICBjb25zdCB1c2VyczogQXJyYXk8e1xuICAgIHN1Yjogc3RyaW5nO1xuICAgIGVtYWlsPzogc3RyaW5nO1xuICAgIGZpcnN0TmFtZT86IHN0cmluZztcbiAgICBmdWxsTmFtZT86IHN0cmluZztcbiAgICBzdGF0dXM/OiBzdHJpbmc7XG4gIH0+ID0gW107XG5cbiAgbGV0IHBhZ2luYXRpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBkbyB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKFxuICAgICAgbmV3IExpc3RVc2Vyc0NvbW1hbmQoe1xuICAgICAgICBVc2VyUG9vbElkOiBwb29sSWQsXG4gICAgICAgIExpbWl0OiA2MCxcbiAgICAgICAgUGFnaW5hdGlvblRva2VuOiBwYWdpbmF0aW9uVG9rZW4sXG4gICAgICB9KSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgdSBvZiBvdXQuVXNlcnMgPz8gW10pIHtcbiAgICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IGEgb2YgdS5BdHRyaWJ1dGVzID8/IFtdKSB7XG4gICAgICAgIGlmIChhLk5hbWUgJiYgYS5WYWx1ZSkgYXR0cnNbYS5OYW1lXSA9IGEuVmFsdWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmdWxsTmFtZSA9IGF0dHJzLm5hbWU7XG4gICAgICBjb25zdCBnaXZlbiA9IGF0dHJzLmdpdmVuX25hbWU7XG4gICAgICBjb25zdCBmaXJzdE5hbWUgPVxuICAgICAgICBnaXZlbiA/PyAoZnVsbE5hbWUgPyBmdWxsTmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXSA6IHVuZGVmaW5lZCk7XG4gICAgICB1c2Vycy5wdXNoKHtcbiAgICAgICAgc3ViOiBhdHRycy5zdWIgPz8gdS5Vc2VybmFtZSA/PyBcIlwiLFxuICAgICAgICBlbWFpbDogYXR0cnMuZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgZnVsbE5hbWUsXG4gICAgICAgIHN0YXR1czogdS5Vc2VyU3RhdHVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHBhZ2luYXRpb25Ub2tlbiA9IG91dC5QYWdpbmF0aW9uVG9rZW47XG4gIH0gd2hpbGUgKHBhZ2luYXRpb25Ub2tlbik7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGNvdW50OiB1c2Vycy5sZW5ndGgsIHVzZXJzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbmNyZW1lbnRQYWdlVmlldygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiQUREIHBhZ2VWaWV3cyA6aW5jIFNFVCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0XCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOmluY1wiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIFwiOnVwZGF0ZWRBdFwiOiB7IFM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogXCJVUERBVEVEX05FV1wiLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHBhZ2VWaWV3czogTnVtYmVyKG91dC5BdHRyaWJ1dGVzPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGZyb21EYiA9IChvdXQuSXRlbXMgPz8gW10pLnJlZHVjZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oKGFjYywgaXRlbSkgPT4ge1xuICAgIGNvbnN0IGZsYWcgPSBpdGVtLmZsYWc/LlM7XG4gICAgY29uc3QgZW5hYmxlZFJhdyA9IGl0ZW0uZW5hYmxlZD8uQk9PTDtcbiAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgdHlwZW9mIGVuYWJsZWRSYXcgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgICBhY2NbZmxhZ10gPSBlbmFibGVkUmF3O1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG5cbiAgY29uc3Qgc2VydmVyRGVmYXVsdHM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG4gIGNvbnN0IHBob3RvRm9vZCA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX1BIT1RPX0ZPT0RfTE9HXCIpO1xuICBpZiAodHlwZW9mIHBob3RvRm9vZCA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBzZXJ2ZXJEZWZhdWx0cy5GRl9QSE9UT19GT09EX0xPRyA9IHBob3RvRm9vZDtcbiAgfVxuICBjb25zdCBtZWFsTGlicmFyeSA9IGVudkZsYWdUcmlTdGF0ZShcIkZGX01FQUxfTElCUkFSWVwiKTtcbiAgaWYgKHR5cGVvZiBtZWFsTGlicmFyeSA9PT0gXCJib29sZWFuXCIpIHtcbiAgICBzZXJ2ZXJEZWZhdWx0cy5GRl9NRUFMX0xJQlJBUlkgPSBtZWFsTGlicmFyeTtcbiAgfVxuXG4gIGNvbnN0IG92ZXJyaWRlcyA9IHsgLi4uc2VydmVyRGVmYXVsdHMsIC4uLmZyb21EYiB9O1xuICByZXR1cm4ganNvbigyMDAsIHsgdXNlcklkLCBvdmVycmlkZXMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgdGFyZ2V0VXNlcklkID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQ7XG4gIGlmICghdGFyZ2V0VXNlcklkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgdXNlcklkIHF1ZXJ5IHBhcmFtZXRlclwiIH0pO1xuICB9XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6dXNlcklkXCI6IHsgUzogdGFyZ2V0VXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBvdmVycmlkZXMgPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoKGl0ZW0pID0+ICh7XG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB0YXJnZXRVc2VySWQsXG4gICAgZmxhZzogaXRlbS5mbGFnPy5TID8/IFwiXCIsXG4gICAgZW5hYmxlZDogaXRlbS5lbmFibGVkPy5CT09MID8/IGZhbHNlLFxuICAgIHRzOiBpdGVtLnRzPy5TID8/IFwiXCIsXG4gIH0pKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCB1c2VySWQgPSB0eXBlb2YgYm9keS51c2VySWQgPT09IFwic3RyaW5nXCIgPyBib2R5LnVzZXJJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCByYXdGbGFnID0gdHlwZW9mIGJvZHkuZmxhZyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuZmxhZy50cmltKCkgOiBcIlwiO1xuICBjb25zdCBlbmFibGVkID0gdHlwZW9mIGJvZHkuZW5hYmxlZCA9PT0gXCJib29sZWFuXCIgPyBib2R5LmVuYWJsZWQgOiBudWxsO1xuICBpZiAoIXVzZXJJZCB8fCAhcmF3RmxhZyB8fCBlbmFibGVkID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgcGF5bG9hZC4gRXhwZWN0ZWQgdXNlcklkLCBmbGFnLCBlbmFibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IG5vcm1hbGl6ZWRGbGFnID0gcmF3RmxhZy5zdGFydHNXaXRoKFwiRkZfXCIpID8gcmF3RmxhZyA6IGBGRl8ke3Jhd0ZsYWd9YDtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBmbGFnOiB7IFM6IG5vcm1hbGl6ZWRGbGFnIH0sXG4gICAgICAgIGVuYWJsZWQ6IHsgQk9PTDogZW5hYmxlZCB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBvdmVycmlkZTogeyB1c2VySWQsIGZsYWc6IG5vcm1hbGl6ZWRGbGFnLCBlbmFibGVkLCB0cyB9IH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3N0YXRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0U3RhdHMoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvbWV0cmljcy9wYWdlLXZpZXdcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaW5jcmVtZW50UGFnZVZpZXcoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvcGhvdG9zL3VwbG9hZC11cmxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldEluc2lnaHRzVjIodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzL2ZlZWRiYWNrXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2Zvb2QvZXN0aW1hdGVcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICBjb25zdCB0YWJsZSA9IGZvb2RMb2dFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICAgICAgaWYgKCF0YWJsZSkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkZvb2QgbG9nIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJGb29kRXN0aW1hdGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIHMzLFxuICAgICAgICBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgICAgcGhvdG9CdWNrZXROYW1lOiBidWNrZXQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9sb2ctY29uZmlybVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIXRhYmxlKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRm9vZCBsb2cgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RMb2dDb25maXJtKHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBmb29kTG9nVGFibGVOYW1lOiB0YWJsZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9tZWFsLWNvbXBsZXRlXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgZm9vZFQgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGNvbnN0IG1UID0gbWVhbHNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFmb29kVCB8fCAhbVQgfHwgIWRUKSB7XG4gICAgICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUodXNlcklkLCBldmVudCwge1xuICAgICAgICBkZGIsXG4gICAgICAgIGZvb2RMb2dUYWJsZU5hbWU6IGZvb2RULFxuICAgICAgICBtZWFsc1RhYmxlTmFtZTogbVQsXG4gICAgICAgIGRheU1lYWxzVGFibGVOYW1lOiBkVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFscy9zdWdnZXN0LW1hdGNoXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1N1Z2dlc3RNYXRjaCh1c2VySWQsIGV2ZW50LCB7IGRkYiwgbWVhbHNUYWJsZU5hbWU6IG1UIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9tZWFsc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNMaXN0KHVzZXJJZCwgZXZlbnQsIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL21lYWxzXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNDcmVhdGUodXNlcklkLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsSGlzdG9yeU1hdGNoID0gZXZlbnQucmF3UGF0aC5tYXRjaCgvXlxcL3YyXFwvbWVhbHNcXC8oW14vXSspXFwvaGlzdG9yeSQvKTtcbiAgICBpZiAobWVhbEhpc3RvcnlNYXRjaCAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNIaXN0b3J5KHVzZXJJZCwgbWVhbEhpc3RvcnlNYXRjaFsxXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBtZWFsUGF0Y2hEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9tZWFsc1xcLyhbXi9dKykkLyk7XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFtVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIk1lYWxzIHN0b3JhZ2UgaXMgbm90IGNvbmZpZ3VyZWQuXCIgfSk7XG4gICAgICByZXR1cm4gaGFuZGxlVjJNZWFsc1BhdGNoKHVzZXJJZCwgbWVhbFBhdGNoRGVsWzFdLCBldmVudCwgeyBkZGIsIG1lYWxzVGFibGVOYW1lOiBtVCB9KTtcbiAgICB9XG4gICAgaWYgKG1lYWxQYXRjaERlbCAmJiBtZWFsUGF0Y2hEZWxbMV0gIT09IFwic3VnZ2VzdC1tYXRjaFwiICYmIG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgY29uc3QgbVQgPSBtZWFsc1RhYmxlTmFtZTtcbiAgICAgIGlmICghbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFscyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyTWVhbHNEZWxldGUodXNlcklkLCBtZWFsUGF0Y2hEZWxbMV0sIHsgZGRiLCBtZWFsc1RhYmxlTmFtZTogbVQgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TWVhbExpc3RPckNyZWF0ZSA9IGV2ZW50LnJhd1BhdGgubWF0Y2goL15cXC92MlxcL2RheXNcXC8oW1xcZC1dKylcXC9tZWFsLWVudHJpZXMkLyk7XG4gICAgaWYgKGRheU1lYWxMaXN0T3JDcmVhdGUgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBjb25zdCBkVCA9IGRheU1lYWxFbnRyaWVzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCkgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkRheSBtZWFsIGVudHJpZXMgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzTGlzdCh1c2VySWQsIGRheU1lYWxMaXN0T3JDcmVhdGVbMV0sIHsgZGRiLCBkYXlNZWFsc1RhYmxlTmFtZTogZFQgfSk7XG4gICAgfVxuICAgIGlmIChkYXlNZWFsTGlzdE9yQ3JlYXRlICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBtVCA9IG1lYWxzVGFibGVOYW1lO1xuICAgICAgaWYgKCFkVCB8fCAhbVQpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlKHVzZXJJZCwgZGF5TWVhbExpc3RPckNyZWF0ZVsxXSwgZXZlbnQsIHtcbiAgICAgICAgZGRiLFxuICAgICAgICBkYXlNZWFsc1RhYmxlTmFtZTogZFQsXG4gICAgICAgIG1lYWxzVGFibGVOYW1lOiBtVCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGRheU1lYWxEZWwgPSBldmVudC5yYXdQYXRoLm1hdGNoKC9eXFwvdjJcXC9kYXlzXFwvKFtcXGQtXSspXFwvbWVhbC1lbnRyaWVzXFwvKFteL10rKSQvKTtcbiAgICBpZiAoZGF5TWVhbERlbCAmJiBtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGNvbnN0IGRUID0gZGF5TWVhbEVudHJpZXNUYWJsZU5hbWU7XG4gICAgICBpZiAoIWRUKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRGF5IG1lYWwgZW50cmllcyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRGF5TWVhbEVudHJ5RGVsZXRlKHVzZXJJZCwgZGF5TWVhbERlbFsxXSwgZGF5TWVhbERlbFsyXSwgeyBkZGIsIGRheU1lYWxzVGFibGVOYW1lOiBkVCB9KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vdXNlcnNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9mZWF0dXJlLWZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0RmVhdHVyZUZsYWdzRm9yVXNlcih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi9mbGFnc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgcmV0dXJuIGxpc3RGZWF0dXJlRmxhZ092ZXJyaWRlcyhldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gdXBzZXJ0RmVhdHVyZUZsYWdPdmVycmlkZShldmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk5vdCBGb3VuZFwiIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UgPT09IFwiSW52YWxpZCBKU09OXCIpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgICB9XG4gICAgY29uc29sZS5lcnJvcihcIkxhbWJkYSBoYW5kbGVyIGVycm9yXCIsIGVycm9yKTtcbiAgICByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiSW50ZXJuYWwgU2VydmVyIEVycm9yXCIgfSk7XG4gIH1cbn1cbiJdfQ==