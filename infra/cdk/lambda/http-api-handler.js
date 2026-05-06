"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const insights_llm_refine_1 = require("./insights-llm-refine");
const food_log_api_1 = require("./food-log-api");
const ddb = new client_dynamodb_1.DynamoDBClient({});
const s3 = new client_s3_1.S3Client({});
const cognitoIdp = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const entriesTableName = process.env.ENTRIES_TABLE_NAME;
const settingsTableName = process.env.SETTINGS_TABLE_NAME;
const insightFeedbackTableName = process.env.INSIGHT_FEEDBACK_TABLE_NAME;
const featureFlagOverridesTableName = process.env.FEATURE_FLAG_OVERRIDES_TABLE_NAME;
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
const foodLogEntriesTableName = process.env.FOOD_LOG_ENTRIES_TABLE_NAME;
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
async function fetchToneForUser(userId) {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const out = await ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: userId } },
        ConsistentRead: true,
    }));
    const t = out.Item?.tone?.S;
    if (t === "friendly" || t === "clinical" || t === "tough-love" || t === "ayurvedic")
        return t;
    return "friendly";
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
function plateauInsight(logs) {
    const sorted = sortByDateAsc(logs);
    if (sorted.length < 14)
        return null;
    const rollingAvg = (idx) => {
        const start = Math.max(0, idx - 6);
        const chunk = sorted.slice(start, idx + 1);
        return chunk.reduce((acc, log) => acc + log.morningWeight, 0) / chunk.length;
    };
    const latestIdx = sorted.length - 1;
    const priorIdx = latestIdx - 13;
    if (priorIdx < 0)
        return null;
    const current = rollingAvg(latestIdx);
    const prior = rollingAvg(priorIdx);
    const movement = Math.abs(current - prior);
    if (movement >= 0.2)
        return null;
    return {
        id: `plateau-${sorted[latestIdx].date}`,
        ruleId: "plateau",
        priority: 93,
        headline: "You may be in a weight plateau right now.",
        detail: "Your 7-day average has barely moved over the last two weeks. Try a tighter calorie target or add one extra walk/workout block this week.",
        why: [
            `Current 7-day average: ${round2(current)} kg`,
            `7-day average from 14 days ago: ${round2(prior)} kg`,
            `Total movement over 14 days: ${round2(movement)} kg (< 0.2 kg threshold)`,
        ],
        action: "Adjust one habit this week: calories or activity.",
        category: "plateau",
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
    const candidates = [
        sodiumInsight(entries),
        alcoholInsight(entries),
        lateSnackInsight(entries),
        plateauInsight(entries),
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
    const tone = await fetchToneForUser(userId);
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
        },
    });
}
async function patchSettings(userId, event) {
    const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
    const payload = parseJsonBody(event);
    const parsed = validateSettings(payload);
    if (!parsed.ok)
        return json(400, { error: "Validation failed", details: parsed.error });
    const data = parsed.data;
    await ddb.send(new client_dynamodb_1.PutItemCommand({
        TableName: tableName,
        Item: {
            userId: { S: userId },
            goalWeight: { N: String(data.goalWeight) },
            startWeight: { N: String(data.startWeight) },
            targetDate: { S: data.targetDate },
            unit: { S: data.unit },
            ...(data.tone ? { tone: { S: data.tone } } : {}),
        },
    }));
    return json(200, { settings: data });
}
async function createUploadUrl(userId, event) {
    const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
    const payload = parseJsonBody(event);
    const body = payload && typeof payload === "object" ? payload : {};
    const contentType = typeof body.contentType === "string" && body.contentType.length > 0
        ? body.contentType
        : "application/octet-stream";
    const extension = typeof body.extension === "string" && /^[a-zA-Z0-9]+$/.test(body.extension)
        ? body.extension.toLowerCase()
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUF3bkNBLDBCQWdHQztBQXh0Q0QsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBQzdELCtEQUFnRTtBQUNoRSxpREFBOEU7QUFFOUUsTUFBTSxHQUFHLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLGdFQUE2QixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXpELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUN4RCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7QUFDMUQsTUFBTSx3QkFBd0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDO0FBQ3pFLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztBQUNwRixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDO0FBQ3RELE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN4RSxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixJQUFJLEtBQUssQ0FBQyxDQUFDO0FBQ2hGLE1BQU0scUJBQXFCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLElBQUksTUFBTSxDQUFDLENBQUM7QUFDckYsTUFBTSxtQkFBbUIsR0FBRyxVQUFVLENBQUM7QUFDdkMsTUFBTSxh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ImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5pbXBvcnQgeyBtYXliZVJlZmluZUluc2lnaHRDYXJkcyB9IGZyb20gXCIuL2luc2lnaHRzLWxsbS1yZWZpbmVcIjtcbmltcG9ydCB7IGhhbmRsZVYyRm9vZEVzdGltYXRlLCBoYW5kbGVWMkZvb2RMb2dDb25maXJtIH0gZnJvbSBcIi4vZm9vZC1sb2ctYXBpXCI7XG5cbmNvbnN0IGRkYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7fSk7XG5jb25zdCBjb2duaXRvSWRwID0gbmV3IENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50KHt9KTtcblxuY29uc3QgZW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkVOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHNldHRpbmdzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuU0VUVElOR1NfVEFCTEVfTkFNRTtcbmNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRTtcbmNvbnN0IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FO1xuY29uc3QgcGhvdG9CdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUEhPVE9fQlVDS0VUX05BTUU7XG5jb25zdCBmb29kTG9nRW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkZPT0RfTE9HX0VOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbiAgdG9uZT86IFwiZnJpZW5kbHlcIiB8IFwiY2xpbmljYWxcIiB8IFwidG91Z2gtbG92ZVwiIHwgXCJheXVydmVkaWNcIjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xuICBhY3Rpb246IHN0cmluZztcbiAgY2F0ZWdvcnk6IFwic29kaXVtXCIgfCBcImFsY29ob2xcIiB8IFwibGF0ZV9zbmFja1wiIHwgXCJ3b3Jrb3V0XCIgfCBcInBsYXRlYXVcIiB8IFwic3RyZWFrXCIgfCBcInRyYWplY3RvcnlcIjtcbiAgZ2VuZXJhdGlvblNvdXJjZT86IFwibGxtXCIgfCBcInJ1bGVzXCI7XG59O1xuXG5mdW5jdGlvbiBqc29uKHN0YXR1c0NvZGU6IG51bWJlciwgcGF5bG9hZDogdW5rbm93bik6IEh0dHBSZXN1bHQge1xuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGUsXG4gICAgaGVhZGVyczogeyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRSZXF1aXJlZEVudihuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIHJlcXVpcmVkIGVudiB2YXIgJHtuYW1lfWApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcGFyc2VKc29uQm9keShldmVudDogSHR0cEV2ZW50KTogdW5rbm93biB7XG4gIGlmICghZXZlbnQuYm9keSkgcmV0dXJuIHt9O1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICB9IGNhdGNoIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIEpTT05cIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNEYXRlU3RyaW5nKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiAmJiAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGVudkZsYWdUcmlTdGF0ZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgdiA9IHByb2Nlc3MuZW52W25hbWVdO1xuICBpZiAodiA9PT0gXCJ0cnVlXCIpIHJldHVybiB0cnVlO1xuICBpZiAodiA9PT0gXCJmYWxzZVwiKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzUG9zaXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPiAwO1xufVxuXG5mdW5jdGlvbiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5cbmZ1bmN0aW9uIGlzSW50Tm9uTmVnYXRpdmUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRW50cnkoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBEYWlseUVudHJ5VXBzZXJ0IH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG5cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LmRhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZGF0ZVwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5Lm1vcm5pbmdXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbW9ybmluZ1dlaWdodFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5sYXRlU25hY2sgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbGF0ZVNuYWNrXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmhpZ2hTb2RpdW0gIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgaGlnaFNvZGl1bVwiIH07XG4gIGlmICh0eXBlb2YgYm9keS53b3Jrb3V0ICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHdvcmtvdXRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuYWxjb2hvbCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBhbGNvaG9sXCIgfTtcblxuICBpZiAoXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5uaWdodFdlaWdodCAhPT0gbnVsbCAmJlxuICAgICFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubmlnaHRXZWlnaHQpXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuaWdodFdlaWdodFwiIH07XG4gIH1cblxuICBpZiAoYm9keS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuY2Fsb3JpZXMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGNhbG9yaWVzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5wcm90ZWluICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5wcm90ZWluKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwcm90ZWluXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zdGVwcyAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkuc3RlcHMpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0ZXBzXCIgfTtcbiAgfVxuICBpZiAoYm9keS5zbGVlcCAhPT0gdW5kZWZpbmVkICYmICFpc05vbk5lZ2F0aXZlTnVtYmVyKGJvZHkuc2xlZXApKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHNsZWVwXCIgfTtcbiAgfVxuXG4gIGlmIChcbiAgICBib2R5LnBob3RvVXJsICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5LnBob3RvVXJsICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5LnBob3RvVXJsICE9PSBcInN0cmluZ1wiIHx8IGJvZHkucGhvdG9VcmwubGVuZ3RoID4gNjAwXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHBob3RvVXJsXCIgfTtcbiAgfVxuICBpZiAoXG4gICAgYm9keS5ub3RlcyAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5ub3RlcyAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5ub3RlcyAhPT0gXCJzdHJpbmdcIiB8fCBib2R5Lm5vdGVzLmxlbmd0aCA+IDJfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbm90ZXNcIiB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBkYXRhOiB7XG4gICAgICBkYXRlOiBib2R5LmRhdGUsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBib2R5Lm1vcm5pbmdXZWlnaHQsXG4gICAgICBuaWdodFdlaWdodDogKGJvZHkubmlnaHRXZWlnaHQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgY2Fsb3JpZXM6IGJvZHkuY2Fsb3JpZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgcHJvdGVpbjogYm9keS5wcm90ZWluIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHN0ZXBzOiBib2R5LnN0ZXBzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHNsZWVwOiBib2R5LnNsZWVwIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIGxhdGVTbmFjazogYm9keS5sYXRlU25hY2sgYXMgYm9vbGVhbixcbiAgICAgIGhpZ2hTb2RpdW06IGJvZHkuaGlnaFNvZGl1bSBhcyBib29sZWFuLFxuICAgICAgd29ya291dDogYm9keS53b3Jrb3V0IGFzIGJvb2xlYW4sXG4gICAgICBhbGNvaG9sOiBib2R5LmFsY29ob2wgYXMgYm9vbGVhbixcbiAgICAgIHBob3RvVXJsOiAoYm9keS5waG90b1VybCBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBub3RlczogKGJvZHkubm90ZXMgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU2V0dGluZ3MoaW5wdXQ6IHVua25vd24pOiB7IG9rOiB0cnVlOyBkYXRhOiBTZXR0aW5nc1BhdGNoIH0gfCB7IG9rOiBmYWxzZTsgZXJyb3I6IHN0cmluZyB9IHtcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9O1xuICB9XG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuZ29hbFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBnb2FsV2VpZ2h0XCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkuc3RhcnRXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhcnRXZWlnaHRcIiB9O1xuICBpZiAoIWlzRGF0ZVN0cmluZyhib2R5LnRhcmdldERhdGUpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdGFyZ2V0RGF0ZVwiIH07XG4gIGlmIChib2R5LnVuaXQgIT09IFwia2dcIiAmJiBib2R5LnVuaXQgIT09IFwibGJzXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB1bml0XCIgfTtcbiAgaWYgKFxuICAgIGJvZHkudG9uZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS50b25lICE9PSBcImZyaWVuZGx5XCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiY2xpbmljYWxcIiAmJlxuICAgIGJvZHkudG9uZSAhPT0gXCJ0b3VnaC1sb3ZlXCIgJiZcbiAgICBib2R5LnRvbmUgIT09IFwiYXl1cnZlZGljXCJcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRvbmVcIiB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgICB0b25lOiBib2R5LnRvbmUgYXMgU2V0dGluZ3NQYXRjaFtcInRvbmVcIl0sXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Snd0Q2xhaW1zKGV2ZW50OiBIdHRwRXZlbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHJhdyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcztcbiAgaWYgKHJhdyA9PSBudWxsKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiByYXcgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBzdWIgPSBnZXRKd3RDbGFpbXMoZXZlbnQpPy5zdWI7XG4gIHJldHVybiB0eXBlb2Ygc3ViID09PSBcInN0cmluZ1wiID8gc3ViIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaXJzdE5hbWVGcm9tSnd0Q2xhaW1zKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWNsYWltcykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgZ2l2ZW4gPSBjbGFpbXMuZ2l2ZW5fbmFtZTtcbiAgaWYgKHR5cGVvZiBnaXZlbiA9PT0gXCJzdHJpbmdcIiAmJiBnaXZlbi50cmltKCkpIHJldHVybiBnaXZlbi50cmltKCk7XG4gIGNvbnN0IG5hbWUgPSBjbGFpbXMubmFtZTtcbiAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiICYmIG5hbWUudHJpbSgpKSB7XG4gICAgY29uc3QgZmlyc3QgPSBuYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdO1xuICAgIHJldHVybiBmaXJzdCB8fCB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hUb25lRm9yVXNlcih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCB0ID0gb3V0Lkl0ZW0/LnRvbmU/LlM7XG4gIGlmICh0ID09PSBcImZyaWVuZGx5XCIgfHwgdCA9PT0gXCJjbGluaWNhbFwiIHx8IHQgPT09IFwidG91Z2gtbG92ZVwiIHx8IHQgPT09IFwiYXl1cnZlZGljXCIpIHJldHVybiB0O1xuICByZXR1cm4gXCJmcmllbmRseVwiO1xufVxuXG4vKiogR21haWwgdHJlYXRzIGRvdHMgYW5kICtsYWJlbHMgYXMgYWxpYXNlczsgbm9ybWFsaXplIHNvIGFkbWluIGxpc3QgbWF0Y2hlcyByZWFsIHNpZ24taW4gaWRlbnRpdGllcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChlbWFpbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbG93ZXIgPSBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgYXQgPSBsb3dlci5sYXN0SW5kZXhPZihcIkBcIik7XG4gIGlmIChhdCA8PSAwKSByZXR1cm4gbG93ZXI7XG4gIGNvbnN0IGxvY2FsID0gbG93ZXIuc2xpY2UoMCwgYXQpO1xuICBjb25zdCBkb21haW4gPSBsb3dlci5zbGljZShhdCArIDEpO1xuICBpZiAoZG9tYWluID09PSBcImdtYWlsLmNvbVwiIHx8IGRvbWFpbiA9PT0gXCJnb29nbGVtYWlsLmNvbVwiKSB7XG4gICAgY29uc3QgYmFzZUxvY2FsID0gKGxvY2FsLnNwbGl0KFwiK1wiKVswXSA/PyBsb2NhbCkucmVwbGFjZSgvXFwuL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlTG9jYWx9QCR7ZG9tYWlufWA7XG4gIH1cbiAgcmV0dXJuIGxvd2VyO1xufVxuXG5mdW5jdGlvbiBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTogU2V0PHN0cmluZz4ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICBjb25zdCBwYXJ0cyA9IHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2gocy50cmltKCkpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQocGFydHMpO1xuICBpZiAoc2V0LnNpemUgPT09IDApIHtcbiAgICBzZXQuYWRkKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChcInZpaGFybmFyQGdtYWlsLmNvbVwiKSk7XG4gIH1cbiAgcmV0dXJuIHNldDtcbn1cblxuY29uc3QgQURNSU5fQ0xBSU1fS0VZUyA9IFtcInVzZXJuYW1lXCIsIFwiY29nbml0bzp1c2VybmFtZVwiLCBcImVtYWlsXCIsIFwicHJlZmVycmVkX3VzZXJuYW1lXCJdIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZ1tdIHtcbiAgY29uc3QgZm91bmQ6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGVtYWlsaXNoID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gIGZvciAoY29uc3Qga2V5IG9mIEFETUlOX0NMQUlNX0tFWVMpIHtcbiAgICBjb25zdCB2ID0gY2xhaW1zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjbGFpbXMpKSB7XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm5ldyBTZXQoZm91bmQpXTtcbn1cblxuLyoqIFRydWUgaWYgSldUIGNsYWltcyBpbmNsdWRlIGFuIGVtYWlsIGlkZW50aXR5IHRoYXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBhZG1pbiBhbGxvdyBsaXN0LiAqL1xuZnVuY3Rpb24gaXNBZG1pbkNhbGxlcihldmVudDogSHR0cEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsYWltcyA9IGdldEp3dENsYWltcyhldmVudCk7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zKTtcbiAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjKSkpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyVmFsdWUoXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG4gIG5hbWU6IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaGVhZGVycykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgd2FudCA9IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICBpZiAoay50b0xvd2VyQ2FzZSgpID09PSB3YW50ICYmIHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIHYubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSldUIEhUVFAgQVBJIGF1dGhvcml6ZXJzIHZhbGlkYXRlIEF1dGhvcml6YXRpb24gYnV0IHR5cGljYWxseSBkbyBub3QgZm9yd2FyZCB0aGF0IGhlYWRlciB0byBMYW1iZGEuXG4gKiBDbGllbnRzIGFsc28gc2VuZCB4LWNvZ25pdG8tYWNjZXNzLXRva2VuIChzZWUgZnJvbnRlbmQtYXBpLWNsaWVudCkgc28gd2UgY2FuIGNhbGwgY29nbml0by1pZHA6R2V0VXNlci5cbiAqL1xuZnVuY3Rpb24gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGggPSBldmVudC5oZWFkZXJzO1xuICBjb25zdCBjdXN0b20gPSBoZWFkZXJWYWx1ZShoLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIik7XG4gIGlmIChjdXN0b20/LnRyaW0oKSkgcmV0dXJuIGN1c3RvbS50cmltKCk7XG4gIGNvbnN0IHJhdyA9IGhlYWRlclZhbHVlKGgsIFwiYXV0aG9yaXphdGlvblwiKTtcbiAgaWYgKCFyYXcpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG0gPSByYXcubWF0Y2goL15CZWFyZXJcXHMrKC4rKSQvaSk7XG4gIHJldHVybiBtPy5bMV0/LnRyaW0oKTtcbn1cblxuLyoqIFdoZW4gY2xhaW1zIGxhY2sgYSByZXNvbHZhYmxlIGVtYWlsLCB2ZXJpZnkgYWRtaW4gdmlhIEdldFVzZXI7IHRva2VuIHN1YiBtdXN0IG1hdGNoIEpXVCBzdWIuICovXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluVmlhR2V0VXNlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHRva2VuID0gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQpO1xuICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGp3dFN1YiA9IGdldFVzZXJJZChldmVudCk7XG4gIGlmICghand0U3ViKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKG5ldyBHZXRVc2VyQ29tbWFuZCh7IEFjY2Vzc1Rva2VuOiB0b2tlbiB9KSk7XG4gICAgY29uc3QgYXR0cnMgPSBvdXQuVXNlckF0dHJpYnV0ZXMgPz8gW107XG4gICAgY29uc3QgdG9rZW5TdWIgPSBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwic3ViXCIpPy5WYWx1ZTtcbiAgICBpZiAodG9rZW5TdWIgIT09IGp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGVtYWlsID1cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJlbWFpbFwiKT8uVmFsdWUgPz9cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJwcmVmZXJyZWRfdXNlcm5hbWVcIik/LlZhbHVlO1xuICAgIGNvbnN0IGZyb21Vc2VybmFtZSA9IG91dC5Vc2VybmFtZT8uaW5jbHVkZXMoXCJAXCIpID8gb3V0LlVzZXJuYW1lIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IChlbWFpbCA/PyBmcm9tVXNlcm5hbWUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFjYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjYW5kaWRhdGUpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5BbGxvd2VkKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKGlzQWRtaW5DYWxsZXIoZXZlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50KTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldERhdGUoKTogc3RyaW5nIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGQuc2V0RGF0ZShkLmdldERhdGUoKSArIDExOCk7XG4gIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQaG90b1JlZmVyZW5jZShwaG90b1VybDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghcGhvdG9VcmwgfHwgdHlwZW9mIHBob3RvVXJsICE9PSBcInN0cmluZ1wiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAocGhvdG9Vcmwuc3RhcnRzV2l0aChcInMzOi8vXCIpKSByZXR1cm4gcGhvdG9Vcmw7XG4gIGlmICghcGhvdG9VcmwuaW5jbHVkZXMoXCI6Ly9cIikpIHtcbiAgICBjb25zdCBrZXlPbmx5ID0gcGhvdG9VcmwucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBpZiAoIWtleU9ubHkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7cGhvdG9CdWNrZXROYW1lfS8ke2tleU9ubHl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZUFzYzxUIGV4dGVuZHMgeyBkYXRlOiBzdHJpbmcgfT4ocm93czogVFtdKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5yb3dzXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbn1cblxuZnVuY3Rpb24gYXZlcmFnZSh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLCAwKSAvIHZhbHVlcy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHJvdW5kMih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgucm91bmQodmFsdWUgKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBuZXh0TW9ybmluZ0RlbHRhcyhcbiAgbG9nczogU3RvcmVkRW50cnlbXSxcbiAgcHJlZGljYXRlOiAobG9nOiBTdG9yZWRFbnRyeSkgPT4gYm9vbGVhbixcbik6IHsgZmxhZ2dlZDogbnVtYmVyW107IGJhc2VsaW5lOiBudW1iZXJbXSB9IHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgY29uc3QgZmxhZ2dlZDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgYmFzZWxpbmU6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNvcnRlZC5sZW5ndGggLSAxOyBpZHggKz0gMSkge1xuICAgIGNvbnN0IGRlbHRhID0gc29ydGVkW2lkeCArIDFdLm1vcm5pbmdXZWlnaHQgLSBzb3J0ZWRbaWR4XS5tb3JuaW5nV2VpZ2h0O1xuICAgIGlmIChwcmVkaWNhdGUoc29ydGVkW2lkeF0pKSBmbGFnZ2VkLnB1c2goZGVsdGEpO1xuICAgIGVsc2UgYmFzZWxpbmUucHVzaChkZWx0YSk7XG4gIH1cbiAgcmV0dXJuIHsgZmxhZ2dlZCwgYmFzZWxpbmUgfTtcbn1cblxuZnVuY3Rpb24gc29kaXVtSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmhpZ2hTb2RpdW0pO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBzb2RpdW0tYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJzb2RpdW1CdW1wXCIsXG4gICAgcHJpb3JpdHk6IDk1LFxuICAgIGhlYWRsaW5lOiBcIkhpZ2gtc29kaXVtIGRheXMgYXJlIGxpbmtlZCB0byBoZWF2aWVyIG5leHQtbW9ybmluZyB3ZWlnaC1pbnMuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZzIHlvdXIgbm9uLXNvZGl1bSBiYXNlbGluZSB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gaGlnaC1zb2RpdW0gZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugb24gaGlnaC1zb2RpdW0gZGF5czogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIlRyeSBvbmUgbG93ZXItc29kaXVtIGRpbm5lciBzd2FwIHRvbmlnaHQuXCIsXG4gICAgY2F0ZWdvcnk6IFwic29kaXVtXCIsXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFsY29ob2xJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuYWxjb2hvbCk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGFsY29ob2wtYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJhbGNvaG9sXCIsXG4gICAgcHJpb3JpdHk6IDkwLFxuICAgIGhlYWRsaW5lOiBcIkFsY29ob2wgZGF5cyB0ZW5kIHRvIHNob3cgYSBuZXh0LWRheSB3ZWlnaHQgYnVtcC5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdmVyc3VzIG5vbi1hbGNvaG9sIGRheXMgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGFsY29ob2wtbG9nZ2VkIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIGFmdGVyIGFsY29ob2w6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJQbGFuIGFsY29ob2wtZnJlZSB3ZWVrZGF5cyBmb3Igc3RlYWRpZXIgdHJlbmQgbGluZXMuXCIsXG4gICAgY2F0ZWdvcnk6IFwiYWxjb2hvbFwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBsYXRlU25hY2tJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cubGF0ZVNuYWNrKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgbGF0ZS1zbmFjay1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImxhdGVTbmFja1wiLFxuICAgIHByaW9yaXR5OiA4OCxcbiAgICBoZWFkbGluZTogXCJMYXRlIHNuYWNrcyBhcmUgY29ycmVsYXRlZCB3aXRoIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHNjYWxlIHJlYWRpbmdzLlwiLFxuICAgIGRldGFpbDogYFlvdXIgbmV4dC1kYXkgY2hhbmdlIGlzICske3JvdW5kMihleGNlc3MpfSBrZyBoaWdoZXIgdGhhbiB5b3VyIG5vbi1sYXRlLXNuYWNrIGJhc2VsaW5lLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gbGF0ZS1zbmFjayBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSB3aXRoIGxhdGUgc25hY2s6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJTZXQgYSAyLWhvdXIga2l0Y2hlbiBjbG9zZSB0aW1lIGJlZm9yZSBiZWQuXCIsXG4gICAgY2F0ZWdvcnk6IFwibGF0ZV9zbmFja1wiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBwbGF0ZWF1SW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgaWYgKHNvcnRlZC5sZW5ndGggPCAxNCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvbGxpbmdBdmcgPSAoaWR4OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDAsIGlkeCAtIDYpO1xuICAgIGNvbnN0IGNodW5rID0gc29ydGVkLnNsaWNlKHN0YXJ0LCBpZHggKyAxKTtcbiAgICByZXR1cm4gY2h1bmsucmVkdWNlKChhY2MsIGxvZykgPT4gYWNjICsgbG9nLm1vcm5pbmdXZWlnaHQsIDApIC8gY2h1bmsubGVuZ3RoO1xuICB9O1xuICBjb25zdCBsYXRlc3RJZHggPSBzb3J0ZWQubGVuZ3RoIC0gMTtcbiAgY29uc3QgcHJpb3JJZHggPSBsYXRlc3RJZHggLSAxMztcbiAgaWYgKHByaW9ySWR4IDwgMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGN1cnJlbnQgPSByb2xsaW5nQXZnKGxhdGVzdElkeCk7XG4gIGNvbnN0IHByaW9yID0gcm9sbGluZ0F2ZyhwcmlvcklkeCk7XG4gIGNvbnN0IG1vdmVtZW50ID0gTWF0aC5hYnMoY3VycmVudCAtIHByaW9yKTtcbiAgaWYgKG1vdmVtZW50ID49IDAuMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBwbGF0ZWF1LSR7c29ydGVkW2xhdGVzdElkeF0uZGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJwbGF0ZWF1XCIsXG4gICAgcHJpb3JpdHk6IDkzLFxuICAgIGhlYWRsaW5lOiBcIllvdSBtYXkgYmUgaW4gYSB3ZWlnaHQgcGxhdGVhdSByaWdodCBub3cuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJZb3VyIDctZGF5IGF2ZXJhZ2UgaGFzIGJhcmVseSBtb3ZlZCBvdmVyIHRoZSBsYXN0IHR3byB3ZWVrcy4gVHJ5IGEgdGlnaHRlciBjYWxvcmllIHRhcmdldCBvciBhZGQgb25lIGV4dHJhIHdhbGsvd29ya291dCBibG9jayB0aGlzIHdlZWsuXCIsXG4gICAgd2h5OiBbXG4gICAgICBgQ3VycmVudCA3LWRheSBhdmVyYWdlOiAke3JvdW5kMihjdXJyZW50KX0ga2dgLFxuICAgICAgYDctZGF5IGF2ZXJhZ2UgZnJvbSAxNCBkYXlzIGFnbzogJHtyb3VuZDIocHJpb3IpfSBrZ2AsXG4gICAgICBgVG90YWwgbW92ZW1lbnQgb3ZlciAxNCBkYXlzOiAke3JvdW5kMihtb3ZlbWVudCl9IGtnICg8IDAuMiBrZyB0aHJlc2hvbGQpYCxcbiAgICBdLFxuICAgIGFjdGlvbjogXCJBZGp1c3Qgb25lIGhhYml0IHRoaXMgd2VlazogY2Fsb3JpZXMgb3IgYWN0aXZpdHkuXCIsXG4gICAgY2F0ZWdvcnk6IFwicGxhdGVhdVwiLFxuICB9O1xufVxuXG5mdW5jdGlvbiBiYXNlbGluZUluc2lnaHRXaXRoTG9ncyhlbnRyeUNvdW50OiBudW1iZXIsIGxhdGVzdERhdGU6IHN0cmluZyk6IEluc2lnaHRDYXJkIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGJhc2VsaW5lLWluc2lnaHQtJHtsYXRlc3REYXRlfWAsXG4gICAgcnVsZUlkOiBcImJhc2VsaW5lXCIsXG4gICAgcHJpb3JpdHk6IDEwLFxuICAgIGhlYWRsaW5lOiBcIkdyZWF0IGNvbnNpc3RlbmN5IHNvIGZhciDigJQga2VlcCBsb2dnaW5nIGRhaWx5IGZvciBzaGFycGVyIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiV2UgbmVlZCBhIGJpdCBtb3JlIHNpZ25hbCB0byBkZXRlY3Qgc3Ryb25nIHBlcnNvbmFsIHBhdHRlcm5zLCBidXQgeW91ciBkYXRhIGZsb3cgaXMgYWN0aXZlLlwiLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZW50cnlDb3VudH0gbG9ncyBhbmFseXplZCBmcm9tIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgXCJObyBydWxlIGNyb3NzZWQgY29uZmlkZW5jZSB0aHJlc2hvbGRzIHlldFwiLFxuICAgIF0sXG4gICAgYWN0aW9uOiBcIktlZXAgdHJhY2tpbmcgZGFpbHkgaGFiaXRzIGFuZCB3ZWlnaHQgdG8gdW5sb2NrIHN0cm9uZ2VyIHBlcnNvbmFsaXplZCBpbnNpZ2h0cy5cIixcbiAgICBjYXRlZ29yeTogXCJzdHJlYWtcIixcbiAgfTtcbn1cblxuZnVuY3Rpb24gYmFzZWxpbmVJbnNpZ2h0Tm9Mb2dzKGFzT2ZEYXRlOiBzdHJpbmcpOiBJbnNpZ2h0Q2FyZCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBiYXNlbGluZS1pbnNpZ2h0LSR7YXNPZkRhdGV9YCxcbiAgICBydWxlSWQ6IFwiYmFzZWxpbmVcIixcbiAgICBwcmlvcml0eTogMTAsXG4gICAgaGVhZGxpbmU6IFwiU3RhcnQgbG9nZ2luZyB3ZWlnaHQgYW5kIGhhYml0cyB0byB1bmxvY2sgcGVyc29uYWxpemVkIGluc2lnaHRzLlwiLFxuICAgIGRldGFpbDogXCJPbmNlIHlvdSBoYXZlIGEgZmV3IHdlZWtzIG9mIGVudHJpZXMsIHdlIHdpbGwgaGlnaGxpZ2h0IHBhdHRlcm5zIHRoYXQgbWF0Y2ggeW91ciBkYXRhLlwiLFxuICAgIHdoeTogW1wiTm8gZW50cmllcyBmb3VuZCBpbiB0aGUgbGFzdCA5MCBkYXlzXCJdLFxuICAgIGFjdGlvbjogXCJBZGQgdG9kYXkncyB3ZWlnaHQgb24gdGhlIGxlZnQgdG8gYmVnaW4uXCIsXG4gICAgY2F0ZWdvcnk6IFwic3RyZWFrXCIsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEluc2lnaHRzVjIodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHRvID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgZnJvbURhdGUgPSBuZXcgRGF0ZSgpO1xuICBmcm9tRGF0ZS5zZXREYXRlKGZyb21EYXRlLmdldERhdGUoKSAtIDg5KTtcbiAgY29uc3QgZnJvbSA9IGZyb21EYXRlLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkIEFORCAjZGF0ZSBCRVRXRUVOIDpmcm9tRGF0ZSBBTkQgOnRvRGF0ZVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOmZyb21EYXRlXCI6IHsgUzogZnJvbSB9LFxuICAgICAgICBcIjp0b0RhdGVcIjogeyBTOiB0byB9LFxuICAgICAgfSxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZW50cmllczogU3RvcmVkRW50cnlbXSA9IChvdXQuSXRlbXMgPz8gW10pLm1hcChcbiAgICAoaXRlbTogUmVjb3JkPHN0cmluZywgeyBTPzogc3RyaW5nOyBOPzogc3RyaW5nOyBCT09MPzogYm9vbGVhbiB9PikgPT4gKHtcbiAgICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgICBkYXRlOiBpdGVtLmRhdGU/LlMgPz8gXCJcIixcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgICBsYXRlU25hY2s6IGl0ZW0ubGF0ZVNuYWNrPy5CT09MID8/IGZhbHNlLFxuICAgICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgICAgYWxjb2hvbDogaXRlbS5hbGNvaG9sPy5CT09MID8/IGZhbHNlLFxuICAgICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgIHNvZGl1bUluc2lnaHQoZW50cmllcyksXG4gICAgYWxjb2hvbEluc2lnaHQoZW50cmllcyksXG4gICAgbGF0ZVNuYWNrSW5zaWdodChlbnRyaWVzKSxcbiAgICBwbGF0ZWF1SW5zaWdodChlbnRyaWVzKSxcbiAgXS5maWx0ZXIoKGlucyk6IGlucyBpcyBJbnNpZ2h0Q2FyZCA9PiBpbnMgIT09IG51bGwpO1xuICBjb25zdCB0b3AgPSBbLi4ubmV3IE1hcChjYW5kaWRhdGVzLm1hcCgoaXRlbSkgPT4gW2l0ZW0ucnVsZUlkLCBpdGVtXSkpLnZhbHVlcygpXVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eSlcbiAgICAuc2xpY2UoMCwgMyk7XG4gIGNvbnN0IHNvcnRlZEVudHJpZXMgPSBzb3J0QnlEYXRlQXNjKGVudHJpZXMpO1xuICBjb25zdCBsYXRlc3REYXRlID0gc29ydGVkRW50cmllc1tzb3J0ZWRFbnRyaWVzLmxlbmd0aCAtIDFdPy5kYXRlID8/IHRvO1xuICBjb25zdCBmYWxsYmFjazogSW5zaWdodENhcmQgPVxuICAgIGVudHJpZXMubGVuZ3RoID09PSAwXG4gICAgICA/IGJhc2VsaW5lSW5zaWdodE5vTG9ncyh0bylcbiAgICAgIDogYmFzZWxpbmVJbnNpZ2h0V2l0aExvZ3MoZW50cmllcy5sZW5ndGgsIGxhdGVzdERhdGUpO1xuICBjb25zdCBpbnNpZ2h0czogSW5zaWdodENhcmRbXSA9ICh0b3AubGVuZ3RoID4gMCA/IHRvcCA6IFtmYWxsYmFja10pLm1hcCgoaSkgPT4gKHtcbiAgICAuLi5pLFxuICAgIGdlbmVyYXRpb25Tb3VyY2U6IFwicnVsZXNcIiBhcyBjb25zdCxcbiAgfSkpO1xuICBjb25zdCB0b25lID0gYXdhaXQgZmV0Y2hUb25lRm9yVXNlcih1c2VySWQpO1xuICBjb25zdCBmaXJzdE5hbWUgPSBmaXJzdE5hbWVGcm9tSnd0Q2xhaW1zKGdldEp3dENsYWltcyhldmVudCkpID8/IFwidGhlcmVcIjtcbiAgY29uc3QgcmVjZW50Tm90ZXMgPSBlbnRyaWVzXG4gICAgLm1hcCgoZSkgPT4gKHR5cGVvZiBlLm5vdGVzID09PSBcInN0cmluZ1wiID8gZS5ub3RlcyA6IHVuZGVmaW5lZCkpXG4gICAgLmZpbHRlcigobik6IG4gaXMgc3RyaW5nID0+IEJvb2xlYW4obikpXG4gICAgLnNsaWNlKC01KTtcbiAgY29uc3QgcmVmaW5lZCA9IGF3YWl0IG1heWJlUmVmaW5lSW5zaWdodENhcmRzKGRkYiwge1xuICAgIHVzZXJJZCxcbiAgICBpbnNpZ2h0cyxcbiAgICB0b25lLFxuICAgIGZpcnN0TmFtZSxcbiAgICByZWNlbnROb3RlcyxcbiAgfSk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBpbnNpZ2h0czogcmVmaW5lZCB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRVwiLCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGluc2lnaHRJZCA9IHR5cGVvZiBib2R5Lmluc2lnaHRJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuaW5zaWdodElkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHZvdGUgPSBib2R5LnZvdGUgPT09IFwidXBcIiB8fCBib2R5LnZvdGUgPT09IFwiZG93blwiID8gYm9keS52b3RlIDogbnVsbDtcbiAgaWYgKCFpbnNpZ2h0SWQgfHwgIXZvdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGluc2lnaHQgZmVlZGJhY2sgcGF5bG9hZFwiIH0pO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGluc2lnaHRUczogeyBTOiBgJHt0c30jJHtpbnNpZ2h0SWR9YCB9LFxuICAgICAgICBpbnNpZ2h0SWQ6IHsgUzogaW5zaWdodElkIH0sXG4gICAgICAgIHZvdGU6IHsgUzogdm90ZSB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRFbnRyaWVzKHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGZyb20gPSBxdWVyeT8uZnJvbTtcbiAgY29uc3QgdG8gPSBxdWVyeT8udG87XG4gIGlmIChmcm9tICYmICFpc0RhdGVTdHJpbmcoZnJvbSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGZyb20gZGF0ZVwiIH0pO1xuICBpZiAodG8gJiYgIWlzRGF0ZVN0cmluZyh0bykpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHRvIGRhdGVcIiB9KTtcblxuICBjb25zdCBleHByZXNzaW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB7IFM6IHN0cmluZyB9PiA9IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfTtcbiAgbGV0IGtleUNvbmRpdGlvbiA9IFwidXNlcklkID0gOnVzZXJJZFwiO1xuICBpZiAoZnJvbSAmJiB0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH0gZWxzZSBpZiAoZnJvbSkge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPj0gOmZyb21EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICB9IGVsc2UgaWYgKHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA8PSA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH1cblxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjoga2V5Q29uZGl0aW9uLFxuICAgICAgLi4uKGtleUNvbmRpdGlvbi5pbmNsdWRlcyhcIiNkYXRlXCIpXG4gICAgICAgID8geyBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9IH1cbiAgICAgICAgOiB7fSksXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uVmFsdWVzLFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXM6IFN0b3JlZEVudHJ5W10gPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgaWQ6IGl0ZW0uaWQ/LlMgPz8gYCR7dXNlcklkfToke2l0ZW0uZGF0ZT8uUyA/PyBcIlwifWAsXG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICBwaG90b1VybDogaXRlbS5waG90b1VybD8uUyA/PyB1bmRlZmluZWQsXG4gICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzOiBTdG9yZWRFbnRyeVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBwaG90byA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGVudHJ5LnBob3RvVXJsKTtcbiAgICAgIGlmICghcGhvdG8pIHJldHVybiBlbnRyeTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpdGhvdXRTY2hlbWUgPSBwaG90by5zbGljZShcInMzOi8vXCIubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgZmlyc3RTbGFzaCA9IHdpdGhvdXRTY2hlbWUuaW5kZXhPZihcIi9cIik7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoIDw9IDApIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3QgYnVja2V0ID0gd2l0aG91dFNjaGVtZS5zbGljZSgwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgY29uc3Qga2V5ID0gd2l0aG91dFNjaGVtZS5zbGljZShmaXJzdFNsYXNoICsgMSk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IHNpZ25lZFBob3RvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiBidWNrZXQsIEtleToga2V5IH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiBkb3dubG9hZFVybFR0bFNlY29uZHMgfSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgLi4uZW50cnksIHBob3RvVXJsOiBzaWduZWRQaG90b1VybCB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cmllczogZW50cmllc1dpdGhTaWduZWRQaG90b1VybHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEVudHJ5KHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlRW50cnkocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGlkID0gYCR7dXNlcklkfToke2RhdGEuZGF0ZX1gO1xuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGEuZGF0ZSB9LFxuICAgIGlkOiB7IFM6IGlkIH0sXG4gICAgbW9ybmluZ1dlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5tb3JuaW5nV2VpZ2h0KSB9LFxuICAgIGxhdGVTbmFjazogeyBCT09MOiBkYXRhLmxhdGVTbmFjayB9LFxuICAgIGhpZ2hTb2RpdW06IHsgQk9PTDogZGF0YS5oaWdoU29kaXVtIH0sXG4gICAgd29ya291dDogeyBCT09MOiBkYXRhLndvcmtvdXQgfSxcbiAgICBhbGNvaG9sOiB7IEJPT0w6IGRhdGEuYWxjb2hvbCB9LFxuICB9O1xuXG4gIGlmIChkYXRhLm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5uaWdodFdlaWdodCAhPT0gbnVsbCkge1xuICAgIGl0ZW0ubmlnaHRXZWlnaHQgPSB7IE46IFN0cmluZyhkYXRhLm5pZ2h0V2VpZ2h0KSB9O1xuICB9XG4gIGlmIChkYXRhLmNhbG9yaWVzICE9PSB1bmRlZmluZWQpIGl0ZW0uY2Fsb3JpZXMgPSB7IE46IFN0cmluZyhkYXRhLmNhbG9yaWVzKSB9O1xuICBpZiAoZGF0YS5wcm90ZWluICE9PSB1bmRlZmluZWQpIGl0ZW0ucHJvdGVpbiA9IHsgTjogU3RyaW5nKGRhdGEucHJvdGVpbikgfTtcbiAgaWYgKGRhdGEuc3RlcHMgIT09IHVuZGVmaW5lZCkgaXRlbS5zdGVwcyA9IHsgTjogU3RyaW5nKGRhdGEuc3RlcHMpIH07XG4gIGlmIChkYXRhLnNsZWVwICE9PSB1bmRlZmluZWQpIGl0ZW0uc2xlZXAgPSB7IE46IFN0cmluZyhkYXRhLnNsZWVwKSB9O1xuICBjb25zdCBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShkYXRhLnBob3RvVXJsKTtcbiAgaWYgKG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSkgaXRlbS5waG90b1VybCA9IHsgUzogbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlIH07XG4gIGlmICh0eXBlb2YgZGF0YS5ub3RlcyA9PT0gXCJzdHJpbmdcIikgaXRlbS5ub3RlcyA9IHsgUzogZGF0YS5ub3RlcyB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJ5OiB7IC4uLmRhdGEsIGlkIH0gfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGRhdGUgPSBxdWVyeT8uZGF0ZTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF0ZSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBkYXRlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICAgIHRvbmU6IFwiZnJpZW5kbHlcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgICAgdG9uZTogeyBTOiBzZXR0aW5ncy50b25lID8/IFwiZnJpZW5kbHlcIiB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4ganNvbigyMDAsIHtcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGdvYWxXZWlnaHQ6IHNldHRpbmdzLmdvYWxXZWlnaHQsXG4gICAgICAgIHN0YXJ0V2VpZ2h0OiBzZXR0aW5ncy5zdGFydFdlaWdodCxcbiAgICAgICAgdGFyZ2V0RGF0ZTogc2V0dGluZ3MudGFyZ2V0RGF0ZSxcbiAgICAgICAgdW5pdDogc2V0dGluZ3MudW5pdCxcbiAgICAgICAgdG9uZTogc2V0dGluZ3MudG9uZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogTnVtYmVyKG91dC5JdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpLFxuICAgICAgc3RhcnRXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSksXG4gICAgICB0YXJnZXREYXRlOiBvdXQuSXRlbS50YXJnZXREYXRlPy5TID8/IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBvdXQuSXRlbS51bml0Py5TID09PSBcImxic1wiID8gXCJsYnNcIiA6IFwia2dcIixcbiAgICAgIHRvbmU6XG4gICAgICAgIG91dC5JdGVtLnRvbmU/LlMgPT09IFwiY2xpbmljYWxcIiB8fFxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcInRvdWdoLWxvdmVcIiB8fFxuICAgICAgICBvdXQuSXRlbS50b25lPy5TID09PSBcImF5dXJ2ZWRpY1wiXG4gICAgICAgICAgPyBvdXQuSXRlbS50b25lLlNcbiAgICAgICAgICA6IFwiZnJpZW5kbHlcIixcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgICAgIC4uLihkYXRhLnRvbmUgPyB7IHRvbmU6IHsgUzogZGF0YS50b25lIH0gfSA6IHt9KSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IHNldHRpbmdzOiBkYXRhIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVVcGxvYWRVcmwodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gIGNvbnN0IGNvbnRlbnRUeXBlID1cbiAgICB0eXBlb2YgYm9keS5jb250ZW50VHlwZSA9PT0gXCJzdHJpbmdcIiAmJiBib2R5LmNvbnRlbnRUeXBlLmxlbmd0aCA+IDBcbiAgICAgID8gYm9keS5jb250ZW50VHlwZVxuICAgICAgOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICBjb25zdCBleHRlbnNpb24gPVxuICAgIHR5cGVvZiBib2R5LmV4dGVuc2lvbiA9PT0gXCJzdHJpbmdcIiAmJiAvXlthLXpBLVowLTldKyQvLnRlc3QoYm9keS5leHRlbnNpb24pXG4gICAgICA/IGJvZHkuZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKClcbiAgICAgIDogXCJqcGdcIjtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qga2luZCA9IHR5cGVvZiBib2R5LmtpbmQgPT09IFwic3RyaW5nXCIgPyBib2R5LmtpbmQudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICBjb25zdCBrZXkgPVxuICAgIGtpbmQgPT09IFwiZm9vZFwiXG4gICAgICA/IGAke3VzZXJJZH0vZm9vZC8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YFxuICAgICAgOiBgJHt1c2VySWR9LyR7ZGF0ZX0vJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gO1xuXG4gIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgQnVja2V0OiBidWNrZXQsXG4gICAgS2V5OiBrZXksXG4gICAgQ29udGVudFR5cGU6IGNvbnRlbnRUeXBlLFxuICB9KTtcbiAgY29uc3QgdXBsb2FkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCBjb21tYW5kLCB7IGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyB9KTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1cGxvYWRVcmwsXG4gICAga2V5LFxuICAgIHBob3RvVXJsOiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YCxcbiAgICBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMsXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTdGF0cygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3QgW3VzZXJzT3V0LCB2aWV3c091dF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgU2NhbkNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgU2VsZWN0OiBcIkNPVU5UXCIsXG4gICAgICAgIEZpbHRlckV4cHJlc3Npb246IFwiI3VpZCA8PiA6bWV0YVVzZXJJZCBBTkQgYXR0cmlidXRlX2V4aXN0cyhnb2FsV2VpZ2h0KVwiLFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjdWlkXCI6IFwidXNlcklkXCIgfSxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjptZXRhVXNlcklkXCI6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICB9KSxcbiAgICApLFxuICBdKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICB1c2VyczogTnVtYmVyKHVzZXJzT3V0LkNvdW50ID8/IDApLFxuICAgIHBhZ2VWaWV3czogTnVtYmVyKHZpZXdzT3V0Lkl0ZW0/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgcG9vbElkID0gZ2V0UmVxdWlyZWRFbnYoXCJVU0VSX1BPT0xfSURcIiwgdXNlclBvb2xJZEVudik7XG4gIGNvbnN0IHVzZXJzOiBBcnJheTx7XG4gICAgc3ViOiBzdHJpbmc7XG4gICAgZW1haWw/OiBzdHJpbmc7XG4gICAgZmlyc3ROYW1lPzogc3RyaW5nO1xuICAgIGZ1bGxOYW1lPzogc3RyaW5nO1xuICAgIHN0YXR1cz86IHN0cmluZztcbiAgfT4gPSBbXTtcblxuICBsZXQgcGFnaW5hdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGRvIHtcbiAgICBjb25zdCBvdXQgPSBhd2FpdCBjb2duaXRvSWRwLnNlbmQoXG4gICAgICBuZXcgTGlzdFVzZXJzQ29tbWFuZCh7XG4gICAgICAgIFVzZXJQb29sSWQ6IHBvb2xJZCxcbiAgICAgICAgTGltaXQ6IDYwLFxuICAgICAgICBQYWdpbmF0aW9uVG9rZW46IHBhZ2luYXRpb25Ub2tlbixcbiAgICAgIH0pLFxuICAgICk7XG4gICAgZm9yIChjb25zdCB1IG9mIG91dC5Vc2VycyA/PyBbXSkge1xuICAgICAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3QgYSBvZiB1LkF0dHJpYnV0ZXMgPz8gW10pIHtcbiAgICAgICAgaWYgKGEuTmFtZSAmJiBhLlZhbHVlKSBhdHRyc1thLk5hbWVdID0gYS5WYWx1ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZ1bGxOYW1lID0gYXR0cnMubmFtZTtcbiAgICAgIGNvbnN0IGdpdmVuID0gYXR0cnMuZ2l2ZW5fbmFtZTtcbiAgICAgIGNvbnN0IGZpcnN0TmFtZSA9XG4gICAgICAgIGdpdmVuID8/IChmdWxsTmFtZSA/IGZ1bGxOYW1lLnRyaW0oKS5zcGxpdCgvXFxzKy8pWzBdIDogdW5kZWZpbmVkKTtcbiAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICBzdWI6IGF0dHJzLnN1YiA/PyB1LlVzZXJuYW1lID8/IFwiXCIsXG4gICAgICAgIGVtYWlsOiBhdHRycy5lbWFpbCxcbiAgICAgICAgZmlyc3ROYW1lLFxuICAgICAgICBmdWxsTmFtZSxcbiAgICAgICAgc3RhdHVzOiB1LlVzZXJTdGF0dXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgcGFnaW5hdGlvblRva2VuID0gb3V0LlBhZ2luYXRpb25Ub2tlbjtcbiAgfSB3aGlsZSAocGFnaW5hdGlvblRva2VuKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgY291bnQ6IHVzZXJzLmxlbmd0aCwgdXNlcnMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluY3JlbWVudFBhZ2VWaWV3KCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJBREQgcGFnZVZpZXdzIDppbmMgU0VUIHVwZGF0ZWRBdCA9IDp1cGRhdGVkQXRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgXCI6aW5jXCI6IHsgTjogXCIxXCIgfSxcbiAgICAgICAgXCI6dXBkYXRlZEF0XCI6IHsgUzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgICAgUmV0dXJuVmFsdWVzOiBcIlVQREFURURfTkVXXCIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgcGFnZVZpZXdzOiBOdW1iZXIob3V0LkF0dHJpYnV0ZXM/LnBhZ2VWaWV3cz8uTiA/PyAwKSxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEZlYXR1cmVGbGFnc0ZvclVzZXIodXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJ1c2VySWQgPSA6dXNlcklkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgZnJvbURiID0gKG91dC5JdGVtcyA/PyBbXSkucmVkdWNlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PigoYWNjLCBpdGVtKSA9PiB7XG4gICAgY29uc3QgZmxhZyA9IGl0ZW0uZmxhZz8uUztcbiAgICBjb25zdCBlbmFibGVkUmF3ID0gaXRlbS5lbmFibGVkPy5CT09MO1xuICAgIGlmICh0eXBlb2YgZmxhZyA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgZW5hYmxlZFJhdyA9PT0gXCJib29sZWFuXCIpIHtcbiAgICAgIGFjY1tmbGFnXSA9IGVuYWJsZWRSYXc7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIHt9KTtcblxuICBjb25zdCBzZXJ2ZXJEZWZhdWx0czogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcbiAgY29uc3QgcGhvdG9Gb29kID0gZW52RmxhZ1RyaVN0YXRlKFwiRkZfUEhPVE9fRk9PRF9MT0dcIik7XG4gIGlmICh0eXBlb2YgcGhvdG9Gb29kID09PSBcImJvb2xlYW5cIikge1xuICAgIHNlcnZlckRlZmF1bHRzLkZGX1BIT1RPX0ZPT0RfTE9HID0gcGhvdG9Gb29kO1xuICB9XG5cbiAgY29uc3Qgb3ZlcnJpZGVzID0geyAuLi5zZXJ2ZXJEZWZhdWx0cywgLi4uZnJvbURiIH07XG4gIHJldHVybiBqc29uKDIwMCwgeyB1c2VySWQsIG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0YXJnZXRVc2VySWQgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnVzZXJJZDtcbiAgaWYgKCF0YXJnZXRVc2VySWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTWlzc2luZyB1c2VySWQgcXVlcnkgcGFyYW1ldGVyXCIgfSk7XG4gIH1cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjp1c2VySWRcIjogeyBTOiB0YXJnZXRVc2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG92ZXJyaWRlcyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcCgoaXRlbSkgPT4gKHtcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHRhcmdldFVzZXJJZCxcbiAgICBmbGFnOiBpdGVtLmZsYWc/LlMgPz8gXCJcIixcbiAgICBlbmFibGVkOiBpdGVtLmVuYWJsZWQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgdHM6IGl0ZW0udHM/LlMgPz8gXCJcIixcbiAgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHVzZXJJZCA9IHR5cGVvZiBib2R5LnVzZXJJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkudXNlcklkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHJhd0ZsYWcgPSB0eXBlb2YgYm9keS5mbGFnID09PSBcInN0cmluZ1wiID8gYm9keS5mbGFnLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGVuYWJsZWQgPSB0eXBlb2YgYm9keS5lbmFibGVkID09PSBcImJvb2xlYW5cIiA/IGJvZHkuZW5hYmxlZCA6IG51bGw7XG4gIGlmICghdXNlcklkIHx8ICFyYXdGbGFnIHx8IGVuYWJsZWQgPT09IG51bGwpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwYXlsb2FkLiBFeHBlY3RlZCB1c2VySWQsIGZsYWcsIGVuYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgbm9ybWFsaXplZEZsYWcgPSByYXdGbGFnLnN0YXJ0c1dpdGgoXCJGRl9cIikgPyByYXdGbGFnIDogYEZGXyR7cmF3RmxhZ31gO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGZsYWc6IHsgUzogbm9ybWFsaXplZEZsYWcgfSxcbiAgICAgICAgZW5hYmxlZDogeyBCT09MOiBlbmFibGVkIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIG92ZXJyaWRlOiB7IHVzZXJJZCwgZmxhZzogbm9ybWFsaXplZEZsYWcsIGVuYWJsZWQsIHRzIH0gfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1c2VySWQgPSBnZXRVc2VySWQoZXZlbnQpO1xuICAgIGlmICghdXNlcklkKSByZXR1cm4ganNvbig0MDEsIHsgZXJyb3I6IFwiVW5hdXRob3JpemVkXCIgfSk7XG4gICAgY29uc3QgbWV0aG9kID0gKFxuICAgICAgZXZlbnQgYXMgeyByZXF1ZXN0Q29udGV4dD86IHsgaHR0cD86IHsgbWV0aG9kPzogc3RyaW5nIH0gfSB9XG4gICAgKS5yZXF1ZXN0Q29udGV4dD8uaHR0cD8ubWV0aG9kO1xuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2VudHJpZXNcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0RW50cmllcyh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICAgIHJldHVybiB1cHNlcnRFbnRyeSh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgcmV0dXJuIGRlbGV0ZUVudHJ5KHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc2V0dGluZ3NcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0U2V0dGluZ3ModXNlcklkKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgICByZXR1cm4gcGF0Y2hTZXR0aW5ncyh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc3RhdHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRTdGF0cygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9tZXRyaWNzL3BhZ2Utdmlld1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBpbmNyZW1lbnRQYWdlVmlldygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9waG90b3MvdXBsb2FkLXVybFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBjcmVhdGVVcGxvYWRVcmwodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0SW5zaWdodHNWMih1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHMvZmVlZGJhY2tcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvZm9vZC9lc3RpbWF0ZVwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIGNvbnN0IHRhYmxlID0gZm9vZExvZ0VudHJpZXNUYWJsZU5hbWU7XG4gICAgICBjb25zdCBidWNrZXQgPSBnZXRSZXF1aXJlZEVudihcIlBIT1RPX0JVQ0tFVF9OQU1FXCIsIHBob3RvQnVja2V0TmFtZSk7XG4gICAgICBpZiAoIXRhYmxlKSByZXR1cm4ganNvbig1MDAsIHsgZXJyb3I6IFwiRm9vZCBsb2cgc3RvcmFnZSBpcyBub3QgY29uZmlndXJlZC5cIiB9KTtcbiAgICAgIHJldHVybiBoYW5kbGVWMkZvb2RFc3RpbWF0ZSh1c2VySWQsIGV2ZW50LCB7XG4gICAgICAgIGRkYixcbiAgICAgICAgczMsXG4gICAgICAgIGZvb2RMb2dUYWJsZU5hbWU6IHRhYmxlLFxuICAgICAgICBwaG90b0J1Y2tldE5hbWU6IGJ1Y2tldCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9mb29kL2xvZy1jb25maXJtXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgY29uc3QgdGFibGUgPSBmb29kTG9nRW50cmllc1RhYmxlTmFtZTtcbiAgICAgIGlmICghdGFibGUpIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJGb29kIGxvZyBzdG9yYWdlIGlzIG5vdCBjb25maWd1cmVkLlwiIH0pO1xuICAgICAgcmV0dXJuIGhhbmRsZVYyRm9vZExvZ0NvbmZpcm0odXNlcklkLCBldmVudCwgeyBkZGIsIGZvb2RMb2dUYWJsZU5hbWU6IHRhYmxlIH0pO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2ZlYXR1cmUtZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19