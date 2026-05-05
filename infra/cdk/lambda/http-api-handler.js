"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const ddb = new client_dynamodb_1.DynamoDBClient({});
const s3 = new client_s3_1.S3Client({});
const cognitoIdp = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const entriesTableName = process.env.ENTRIES_TABLE_NAME;
const settingsTableName = process.env.SETTINGS_TABLE_NAME;
const insightFeedbackTableName = process.env.INSIGHT_FEEDBACK_TABLE_NAME;
const featureFlagOverridesTableName = process.env.FEATURE_FLAG_OVERRIDES_TABLE_NAME;
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
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
    return {
        ok: true,
        data: {
            goalWeight: body.goalWeight,
            startWeight: body.startWeight,
            targetDate: body.targetDate,
            unit: body.unit,
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
    };
}
async function getInsightsV2(userId) {
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
    return json(200, { insights: top });
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
        };
        await ddb.send(new client_dynamodb_1.PutItemCommand({
            TableName: tableName,
            Item: {
                userId: { S: userId },
                goalWeight: { N: String(settings.goalWeight) },
                startWeight: { N: String(settings.startWeight) },
                targetDate: { S: settings.targetDate },
                unit: { S: settings.unit },
            },
        }));
        return json(200, {
            settings: {
                goalWeight: settings.goalWeight,
                startWeight: settings.startWeight,
                targetDate: settings.targetDate,
                unit: settings.unit,
            },
        });
    }
    return json(200, {
        settings: {
            goalWeight: Number(out.Item.goalWeight?.N ?? 72),
            startWeight: Number(out.Item.startWeight?.N ?? 85),
            targetDate: out.Item.targetDate?.S ?? defaultTargetDate(),
            unit: out.Item.unit?.S === "lbs" ? "lbs" : "kg",
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
    const key = `${userId}/${date}/${Date.now()}.${extension}`;
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
    const overrides = (out.Items ?? []).reduce((acc, item) => {
        const flag = item.flag?.S;
        const enabledRaw = item.enabled?.BOOL;
        if (typeof flag === "string" && typeof enabledRaw === "boolean") {
            acc[flag] = enabledRaw;
        }
        return acc;
    }, {});
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
            return getInsightsV2(userId);
        }
        if (event.rawPath === "/v2/insights/feedback" && method === "POST") {
            return saveInsightFeedback(userId, event);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFpL0JBLDBCQThFQztBQS9qQ0QsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBRTdELE1BQU0sR0FBRyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxnRUFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUV6RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sd0JBQXdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN6RSxNQUFNLDZCQUE2QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUM7QUFDcEYsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztBQUN0RCxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixJQUFJLEtBQUssQ0FBQyxDQUFDO0FBQ2hGLE1BQU0scUJBQXFCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLElBQUksTUFBTSxDQUFDLENBQUM7QUFDckYsTUFBTSxtQkFBbUIsR0FBRyxVQUFVLENBQUM7QUFDdkMsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7QUFvRS9DLFNBQVMsSUFBSSxDQUFDLFVBQWtCLEVBQUUsT0FBZ0I7SUFD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QUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakQsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN6RSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ2hFLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDN0QsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUN2RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3hDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksSUFBSSxLQUFLO1FBQzFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxLQUFLO1FBQ3BDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxTQUFTO1FBQ3ZDLEtBQUss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RSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFO0tBQ2hDLENBQUM7SUFFRixJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDaEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7SUFDckQsQ0FBQztJQUNELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTO1FBQUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7SUFDOUUsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVM7UUFBRSxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztJQUMzRSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssU0FBUztRQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO0lBQ3JFLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTO1FBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDckUsTUFBTSx3QkFBd0IsR0FBRyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEUsSUFBSSx3QkFBd0I7UUFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLHdCQUF3QixFQUFFLENBQUM7SUFDOUUsSUFBSSxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUTtRQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEVBQUUsSUFBSSxD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QUFXLEVBQUUsQ0FBQyxDQUFDO1lBQzdFLE9BQU8seUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsSUFBSSxLQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDL0QsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5cbmNvbnN0IGRkYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7fSk7XG5jb25zdCBjb2duaXRvSWRwID0gbmV3IENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50KHt9KTtcblxuY29uc3QgZW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkVOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHNldHRpbmdzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuU0VUVElOR1NfVEFCTEVfTkFNRTtcbmNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRTtcbmNvbnN0IGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FO1xuY29uc3QgcGhvdG9CdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUEhPVE9fQlVDS0VUX05BTUU7XG5jb25zdCB1cGxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LlVQTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCI5MDBcIik7XG5jb25zdCBkb3dubG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiMzYwMFwiKTtcbmNvbnN0IGFuYWx5dGljc01ldGFVc2VySWQgPSBcIl9fbWV0YV9fXCI7XG5jb25zdCB1c2VyUG9vbElkRW52ID0gcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEO1xuXG50eXBlIENsYWltcyA9IHtcbiAgc3ViOiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247XG59O1xuXG50eXBlIEh0dHBFdmVudCA9IHtcbiAgcmF3UGF0aDogc3RyaW5nO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcbiAgcmVxdWVzdENvbnRleHQ/OiB7XG4gICAgYXV0aG9yaXplcj86IHtcbiAgICAgIGp3dD86IHtcbiAgICAgICAgY2xhaW1zPzogQ2xhaW1zO1xuICAgICAgfTtcbiAgICB9O1xuICB9O1xuICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbDtcbiAgYm9keT86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIGJvZHk6IHN0cmluZztcbn07XG5cbnR5cGUgRGFpbHlFbnRyeVVwc2VydCA9IHtcbiAgZGF0ZTogc3RyaW5nO1xuICBtb3JuaW5nV2VpZ2h0OiBudW1iZXI7XG4gIG5pZ2h0V2VpZ2h0PzogbnVtYmVyIHwgbnVsbDtcbiAgY2Fsb3JpZXM/OiBudW1iZXI7XG4gIHByb3RlaW4/OiBudW1iZXI7XG4gIHN0ZXBzPzogbnVtYmVyO1xuICBzbGVlcD86IG51bWJlcjtcbiAgbGF0ZVNuYWNrOiBib29sZWFuO1xuICBoaWdoU29kaXVtOiBib29sZWFuO1xuICB3b3Jrb3V0OiBib29sZWFuO1xuICBhbGNvaG9sOiBib29sZWFuO1xuICBwaG90b1VybD86IHN0cmluZyB8IG51bGw7XG4gIG5vdGVzPzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgU2V0dGluZ3NQYXRjaCA9IHtcbiAgZ29hbFdlaWdodDogbnVtYmVyO1xuICBzdGFydFdlaWdodDogbnVtYmVyO1xuICB0YXJnZXREYXRlOiBzdHJpbmc7XG4gIHVuaXQ6IFwia2dcIiB8IFwibGJzXCI7XG59O1xuXG50eXBlIFN0b3JlZEVudHJ5ID0gRGFpbHlFbnRyeVVwc2VydCAmIHtcbiAgaWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIFN0b3JlZFNldHRpbmdzID0gU2V0dGluZ3NQYXRjaCAmIHtcbiAgdXNlcklkOiBzdHJpbmc7XG59O1xuXG50eXBlIEluc2lnaHRDYXJkID0ge1xuICBpZDogc3RyaW5nO1xuICBydWxlSWQ6IHN0cmluZztcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgaGVhZGxpbmU6IHN0cmluZztcbiAgZGV0YWlsPzogc3RyaW5nO1xuICB3aHk6IHN0cmluZ1tdO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZGF0ZTogYm9keS5kYXRlLFxuICAgICAgbW9ybmluZ1dlaWdodDogYm9keS5tb3JuaW5nV2VpZ2h0LFxuICAgICAgbmlnaHRXZWlnaHQ6IChib2R5Lm5pZ2h0V2VpZ2h0IGFzIG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBib2R5LmNhbG9yaWVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGJvZHkucHJvdGVpbiBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzdGVwczogYm9keS5zdGVwcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogYm9keS5zbGVlcCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGJvZHkubGF0ZVNuYWNrIGFzIGJvb2xlYW4sXG4gICAgICBoaWdoU29kaXVtOiBib2R5LmhpZ2hTb2RpdW0gYXMgYm9vbGVhbixcbiAgICAgIHdvcmtvdXQ6IGJvZHkud29ya291dCBhcyBib29sZWFuLFxuICAgICAgYWxjb2hvbDogYm9keS5hbGNvaG9sIGFzIGJvb2xlYW4sXG4gICAgICBwaG90b1VybDogKGJvZHkucGhvdG9VcmwgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgbm90ZXM6IChib2R5Lm5vdGVzIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVNldHRpbmdzKGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogU2V0dGluZ3NQYXRjaCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LmdvYWxXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZ29hbFdlaWdodFwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LnN0YXJ0V2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXJ0V2VpZ2h0XCIgfTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS50YXJnZXREYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRhcmdldERhdGVcIiB9O1xuICBpZiAoYm9keS51bml0ICE9PSBcImtnXCIgJiYgYm9keS51bml0ICE9PSBcImxic1wiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdW5pdFwiIH07XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Snd0Q2xhaW1zKGV2ZW50OiBIdHRwRXZlbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHJhdyA9IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcztcbiAgaWYgKHJhdyA9PSBudWxsKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAodHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiByYXcgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgIHJldHVybiByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBzdWIgPSBnZXRKd3RDbGFpbXMoZXZlbnQpPy5zdWI7XG4gIHJldHVybiB0eXBlb2Ygc3ViID09PSBcInN0cmluZ1wiID8gc3ViIDogdW5kZWZpbmVkO1xufVxuXG4vKiogR21haWwgdHJlYXRzIGRvdHMgYW5kICtsYWJlbHMgYXMgYWxpYXNlczsgbm9ybWFsaXplIHNvIGFkbWluIGxpc3QgbWF0Y2hlcyByZWFsIHNpZ24taW4gaWRlbnRpdGllcy4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChlbWFpbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbG93ZXIgPSBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgYXQgPSBsb3dlci5sYXN0SW5kZXhPZihcIkBcIik7XG4gIGlmIChhdCA8PSAwKSByZXR1cm4gbG93ZXI7XG4gIGNvbnN0IGxvY2FsID0gbG93ZXIuc2xpY2UoMCwgYXQpO1xuICBjb25zdCBkb21haW4gPSBsb3dlci5zbGljZShhdCArIDEpO1xuICBpZiAoZG9tYWluID09PSBcImdtYWlsLmNvbVwiIHx8IGRvbWFpbiA9PT0gXCJnb29nbGVtYWlsLmNvbVwiKSB7XG4gICAgY29uc3QgYmFzZUxvY2FsID0gKGxvY2FsLnNwbGl0KFwiK1wiKVswXSA/PyBsb2NhbCkucmVwbGFjZSgvXFwuL2csIFwiXCIpO1xuICAgIHJldHVybiBgJHtiYXNlTG9jYWx9QCR7ZG9tYWlufWA7XG4gIH1cbiAgcmV0dXJuIGxvd2VyO1xufVxuXG5mdW5jdGlvbiBnZXRBZG1pbkFsbG93TGlzdE5vcm1hbGl6ZWQoKTogU2V0PHN0cmluZz4ge1xuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BRE1JTl9FTUFJTFM/LnRyaW0oKSB8fCBcInZpaGFybmFyQGdtYWlsLmNvbVwiO1xuICBjb25zdCBwYXJ0cyA9IHJhd1xuICAgIC5zcGxpdChcIixcIilcbiAgICAubWFwKChzKSA9PiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2gocy50cmltKCkpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IHNldCA9IG5ldyBTZXQocGFydHMpO1xuICBpZiAoc2V0LnNpemUgPT09IDApIHtcbiAgICBzZXQuYWRkKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChcInZpaGFybmFyQGdtYWlsLmNvbVwiKSk7XG4gIH1cbiAgcmV0dXJuIHNldDtcbn1cblxuY29uc3QgQURNSU5fQ0xBSU1fS0VZUyA9IFtcInVzZXJuYW1lXCIsIFwiY29nbml0bzp1c2VybmFtZVwiLCBcImVtYWlsXCIsIFwicHJlZmVycmVkX3VzZXJuYW1lXCJdIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZ1tdIHtcbiAgY29uc3QgZm91bmQ6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGVtYWlsaXNoID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gIGZvciAoY29uc3Qga2V5IG9mIEFETUlOX0NMQUlNX0tFWVMpIHtcbiAgICBjb25zdCB2ID0gY2xhaW1zW2tleV07XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IHYgb2YgT2JqZWN0LnZhbHVlcyhjbGFpbXMpKSB7XG4gICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIGVtYWlsaXNoLnRlc3Qodi50cmltKCkpKSB7XG4gICAgICBmb3VuZC5wdXNoKHYudHJpbSgpLnRvTG93ZXJDYXNlKCkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLm5ldyBTZXQoZm91bmQpXTtcbn1cblxuLyoqIFRydWUgaWYgSldUIGNsYWltcyBpbmNsdWRlIGFuIGVtYWlsIGlkZW50aXR5IHRoYXQgbWF0Y2hlcyB0aGUgY29uZmlndXJlZCBhZG1pbiBhbGxvdyBsaXN0LiAqL1xuZnVuY3Rpb24gaXNBZG1pbkNhbGxlcihldmVudDogSHR0cEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGNsYWltcyA9IGdldEp3dENsYWltcyhldmVudCk7XG4gIGlmICghY2xhaW1zKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0QWRtaW5JZGVudGl0eUNhbmRpZGF0ZXMoY2xhaW1zKTtcbiAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjKSkpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGVhZGVyVmFsdWUoXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQsXG4gIG5hbWU6IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghaGVhZGVycykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3Qgd2FudCA9IG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICBpZiAoay50b0xvd2VyQ2FzZSgpID09PSB3YW50ICYmIHR5cGVvZiB2ID09PSBcInN0cmluZ1wiICYmIHYubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHY7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSldUIEhUVFAgQVBJIGF1dGhvcml6ZXJzIHZhbGlkYXRlIEF1dGhvcml6YXRpb24gYnV0IHR5cGljYWxseSBkbyBub3QgZm9yd2FyZCB0aGF0IGhlYWRlciB0byBMYW1iZGEuXG4gKiBDbGllbnRzIGFsc28gc2VuZCB4LWNvZ25pdG8tYWNjZXNzLXRva2VuIChzZWUgZnJvbnRlbmQtYXBpLWNsaWVudCkgc28gd2UgY2FuIGNhbGwgY29nbml0by1pZHA6R2V0VXNlci5cbiAqL1xuZnVuY3Rpb24gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQ6IEh0dHBFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGggPSBldmVudC5oZWFkZXJzO1xuICBjb25zdCBjdXN0b20gPSBoZWFkZXJWYWx1ZShoLCBcIngtY29nbml0by1hY2Nlc3MtdG9rZW5cIik7XG4gIGlmIChjdXN0b20/LnRyaW0oKSkgcmV0dXJuIGN1c3RvbS50cmltKCk7XG4gIGNvbnN0IHJhdyA9IGhlYWRlclZhbHVlKGgsIFwiYXV0aG9yaXphdGlvblwiKTtcbiAgaWYgKCFyYXcpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IG0gPSByYXcubWF0Y2goL15CZWFyZXJcXHMrKC4rKSQvaSk7XG4gIHJldHVybiBtPy5bMV0/LnRyaW0oKTtcbn1cblxuLyoqIFdoZW4gY2xhaW1zIGxhY2sgYSByZXNvbHZhYmxlIGVtYWlsLCB2ZXJpZnkgYWRtaW4gdmlhIEdldFVzZXI7IHRva2VuIHN1YiBtdXN0IG1hdGNoIEpXVCBzdWIuICovXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluVmlhR2V0VXNlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHRva2VuID0gYmVhcmVyQWNjZXNzVG9rZW4oZXZlbnQpO1xuICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGp3dFN1YiA9IGdldFVzZXJJZChldmVudCk7XG4gIGlmICghand0U3ViKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IGFsbG93ID0gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk7XG4gIGlmIChhbGxvdy5zaXplID09PSAwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKG5ldyBHZXRVc2VyQ29tbWFuZCh7IEFjY2Vzc1Rva2VuOiB0b2tlbiB9KSk7XG4gICAgY29uc3QgYXR0cnMgPSBvdXQuVXNlckF0dHJpYnV0ZXMgPz8gW107XG4gICAgY29uc3QgdG9rZW5TdWIgPSBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwic3ViXCIpPy5WYWx1ZTtcbiAgICBpZiAodG9rZW5TdWIgIT09IGp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGVtYWlsID1cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJlbWFpbFwiKT8uVmFsdWUgPz9cbiAgICAgIGF0dHJzLmZpbmQoKGEpID0+IGEuTmFtZSA9PT0gXCJwcmVmZXJyZWRfdXNlcm5hbWVcIik/LlZhbHVlO1xuICAgIGNvbnN0IGZyb21Vc2VybmFtZSA9IG91dC5Vc2VybmFtZT8uaW5jbHVkZXMoXCJAXCIpID8gb3V0LlVzZXJuYW1lIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IChlbWFpbCA/PyBmcm9tVXNlcm5hbWUgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKCFjYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYWxsb3cuaGFzKG5vcm1hbGl6ZUVtYWlsRm9yQWRtaW5NYXRjaChjYW5kaWRhdGUpKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzQWRtaW5BbGxvd2VkKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKGlzQWRtaW5DYWxsZXIoZXZlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGlzQWRtaW5WaWFHZXRVc2VyKGV2ZW50KTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFRhcmdldERhdGUoKTogc3RyaW5nIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGQuc2V0RGF0ZShkLmdldERhdGUoKSArIDExOCk7XG4gIHJldHVybiBkLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQaG90b1JlZmVyZW5jZShwaG90b1VybDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICghcGhvdG9VcmwgfHwgdHlwZW9mIHBob3RvVXJsICE9PSBcInN0cmluZ1wiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAocGhvdG9Vcmwuc3RhcnRzV2l0aChcInMzOi8vXCIpKSByZXR1cm4gcGhvdG9Vcmw7XG4gIGlmICghcGhvdG9VcmwuaW5jbHVkZXMoXCI6Ly9cIikpIHtcbiAgICBjb25zdCBrZXlPbmx5ID0gcGhvdG9VcmwucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBpZiAoIWtleU9ubHkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHBob3RvQnVja2V0TmFtZSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7cGhvdG9CdWNrZXROYW1lfS8ke2tleU9ubHl9YDtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc29ydEJ5RGF0ZUFzYzxUIGV4dGVuZHMgeyBkYXRlOiBzdHJpbmcgfT4ocm93czogVFtdKTogVFtdIHtcbiAgcmV0dXJuIFsuLi5yb3dzXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbn1cblxuZnVuY3Rpb24gYXZlcmFnZSh2YWx1ZXM6IG51bWJlcltdKTogbnVtYmVyIHwgbnVsbCB7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHZhbHVlcy5yZWR1Y2UoKGFjYywgdmFsdWUpID0+IGFjYyArIHZhbHVlLCAwKSAvIHZhbHVlcy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHJvdW5kMih2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgucm91bmQodmFsdWUgKiAxMDApIC8gMTAwO1xufVxuXG5mdW5jdGlvbiBuZXh0TW9ybmluZ0RlbHRhcyhcbiAgbG9nczogU3RvcmVkRW50cnlbXSxcbiAgcHJlZGljYXRlOiAobG9nOiBTdG9yZWRFbnRyeSkgPT4gYm9vbGVhbixcbik6IHsgZmxhZ2dlZDogbnVtYmVyW107IGJhc2VsaW5lOiBudW1iZXJbXSB9IHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgY29uc3QgZmxhZ2dlZDogbnVtYmVyW10gPSBbXTtcbiAgY29uc3QgYmFzZWxpbmU6IG51bWJlcltdID0gW107XG4gIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNvcnRlZC5sZW5ndGggLSAxOyBpZHggKz0gMSkge1xuICAgIGNvbnN0IGRlbHRhID0gc29ydGVkW2lkeCArIDFdLm1vcm5pbmdXZWlnaHQgLSBzb3J0ZWRbaWR4XS5tb3JuaW5nV2VpZ2h0O1xuICAgIGlmIChwcmVkaWNhdGUoc29ydGVkW2lkeF0pKSBmbGFnZ2VkLnB1c2goZGVsdGEpO1xuICAgIGVsc2UgYmFzZWxpbmUucHVzaChkZWx0YSk7XG4gIH1cbiAgcmV0dXJuIHsgZmxhZ2dlZCwgYmFzZWxpbmUgfTtcbn1cblxuZnVuY3Rpb24gc29kaXVtSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmhpZ2hTb2RpdW0pO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBzb2RpdW0tYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJzb2RpdW1CdW1wXCIsXG4gICAgcHJpb3JpdHk6IDk1LFxuICAgIGhlYWRsaW5lOiBcIkhpZ2gtc29kaXVtIGRheXMgYXJlIGxpbmtlZCB0byBoZWF2aWVyIG5leHQtbW9ybmluZyB3ZWlnaC1pbnMuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZzIHlvdXIgbm9uLXNvZGl1bSBiYXNlbGluZSB0aGUgbmV4dCBtb3JuaW5nLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gaGlnaC1zb2RpdW0gZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugb24gaGlnaC1zb2RpdW0gZGF5czogKyR7cm91bmQyKGZsYWdnZWRBdmcpfSBrZ2AsXG4gICAgICBgQmFzZWxpbmUgbmV4dC1tb3JuaW5nIGNoYW5nZTogKyR7cm91bmQyKGJhc2VsaW5lQXZnKX0ga2dgLFxuICAgIF0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGFsY29ob2xJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cuYWxjb2hvbCk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGFsY29ob2wtYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJhbGNvaG9sXCIsXG4gICAgcHJpb3JpdHk6IDkwLFxuICAgIGhlYWRsaW5lOiBcIkFsY29ob2wgZGF5cyB0ZW5kIHRvIHNob3cgYSBuZXh0LWRheSB3ZWlnaHQgYnVtcC5cIixcbiAgICBkZXRhaWw6IGBZb3UgYXZlcmFnZSArJHtyb3VuZDIoZXhjZXNzKX0ga2cgdmVyc3VzIG5vbi1hbGNvaG9sIGRheXMgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGFsY29ob2wtbG9nZ2VkIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIGFmdGVyIGFsY29ob2w6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiBsYXRlU25hY2tJbnNpZ2h0KGxvZ3M6IFN0b3JlZEVudHJ5W10pOiBJbnNpZ2h0Q2FyZCB8IG51bGwge1xuICBjb25zdCB7IGZsYWdnZWQsIGJhc2VsaW5lIH0gPSBuZXh0TW9ybmluZ0RlbHRhcyhsb2dzLCAobG9nKSA9PiBsb2cubGF0ZVNuYWNrKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgbGF0ZS1zbmFjay1idW1wLSR7bG9nc1tsb2dzLmxlbmd0aCAtIDFdPy5kYXRlID8/IFwidW5rbm93blwifWAsXG4gICAgcnVsZUlkOiBcImxhdGVTbmFja1wiLFxuICAgIHByaW9yaXR5OiA4OCxcbiAgICBoZWFkbGluZTogXCJMYXRlIHNuYWNrcyBhcmUgY29ycmVsYXRlZCB3aXRoIGhlYXZpZXIgbmV4dC1tb3JuaW5nIHNjYWxlIHJlYWRpbmdzLlwiLFxuICAgIGRldGFpbDogYFlvdXIgbmV4dC1kYXkgY2hhbmdlIGlzICske3JvdW5kMihleGNlc3MpfSBrZyBoaWdoZXIgdGhhbiB5b3VyIG5vbi1sYXRlLXNuYWNrIGJhc2VsaW5lLmAsXG4gICAgd2h5OiBbXG4gICAgICBgJHtmbGFnZ2VkLmxlbmd0aH0gbGF0ZS1zbmFjayBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSB3aXRoIGxhdGUgc25hY2s6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiBwbGF0ZWF1SW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3Qgc29ydGVkID0gc29ydEJ5RGF0ZUFzYyhsb2dzKTtcbiAgaWYgKHNvcnRlZC5sZW5ndGggPCAxNCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvbGxpbmdBdmcgPSAoaWR4OiBudW1iZXIpID0+IHtcbiAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KDAsIGlkeCAtIDYpO1xuICAgIGNvbnN0IGNodW5rID0gc29ydGVkLnNsaWNlKHN0YXJ0LCBpZHggKyAxKTtcbiAgICByZXR1cm4gY2h1bmsucmVkdWNlKChhY2MsIGxvZykgPT4gYWNjICsgbG9nLm1vcm5pbmdXZWlnaHQsIDApIC8gY2h1bmsubGVuZ3RoO1xuICB9O1xuICBjb25zdCBsYXRlc3RJZHggPSBzb3J0ZWQubGVuZ3RoIC0gMTtcbiAgY29uc3QgcHJpb3JJZHggPSBsYXRlc3RJZHggLSAxMztcbiAgaWYgKHByaW9ySWR4IDwgMCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGN1cnJlbnQgPSByb2xsaW5nQXZnKGxhdGVzdElkeCk7XG4gIGNvbnN0IHByaW9yID0gcm9sbGluZ0F2ZyhwcmlvcklkeCk7XG4gIGNvbnN0IG1vdmVtZW50ID0gTWF0aC5hYnMoY3VycmVudCAtIHByaW9yKTtcbiAgaWYgKG1vdmVtZW50ID49IDAuMikgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBwbGF0ZWF1LSR7c29ydGVkW2xhdGVzdElkeF0uZGF0ZX1gLFxuICAgIHJ1bGVJZDogXCJwbGF0ZWF1XCIsXG4gICAgcHJpb3JpdHk6IDkzLFxuICAgIGhlYWRsaW5lOiBcIllvdSBtYXkgYmUgaW4gYSB3ZWlnaHQgcGxhdGVhdSByaWdodCBub3cuXCIsXG4gICAgZGV0YWlsOlxuICAgICAgXCJZb3VyIDctZGF5IGF2ZXJhZ2UgaGFzIGJhcmVseSBtb3ZlZCBvdmVyIHRoZSBsYXN0IHR3byB3ZWVrcy4gVHJ5IGEgdGlnaHRlciBjYWxvcmllIHRhcmdldCBvciBhZGQgb25lIGV4dHJhIHdhbGsvd29ya291dCBibG9jayB0aGlzIHdlZWsuXCIsXG4gICAgd2h5OiBbXG4gICAgICBgQ3VycmVudCA3LWRheSBhdmVyYWdlOiAke3JvdW5kMihjdXJyZW50KX0ga2dgLFxuICAgICAgYDctZGF5IGF2ZXJhZ2UgZnJvbSAxNCBkYXlzIGFnbzogJHtyb3VuZDIocHJpb3IpfSBrZ2AsXG4gICAgICBgVG90YWwgbW92ZW1lbnQgb3ZlciAxNCBkYXlzOiAke3JvdW5kMihtb3ZlbWVudCl9IGtnICg8IDAuMiBrZyB0aHJlc2hvbGQpYCxcbiAgICBdLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbnNpZ2h0c1YyKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0byA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGZyb21EYXRlID0gbmV3IERhdGUoKTtcbiAgZnJvbURhdGUuc2V0RGF0ZShmcm9tRGF0ZS5nZXREYXRlKCkgLSA4OSk7XG4gIGNvbnN0IGZyb20gPSBmcm9tRGF0ZS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZCBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiNkYXRlXCI6IFwiZGF0ZVwiIH0sXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBcIjpmcm9tRGF0ZVwiOiB7IFM6IGZyb20gfSxcbiAgICAgICAgXCI6dG9EYXRlXCI6IHsgUzogdG8gfSxcbiAgICAgIH0sXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGVudHJpZXM6IFN0b3JlZEVudHJ5W10gPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgICBpZDogaXRlbS5pZD8uUyA/PyBgJHt1c2VySWR9OiR7aXRlbS5kYXRlPy5TID8/IFwiXCJ9YCxcbiAgICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgICBtb3JuaW5nV2VpZ2h0OiBOdW1iZXIoaXRlbS5tb3JuaW5nV2VpZ2h0Py5OID8/IDApLFxuICAgICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGhpZ2hTb2RpdW06IGl0ZW0uaGlnaFNvZGl1bT8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBzb2RpdW1JbnNpZ2h0KGVudHJpZXMpLFxuICAgIGFsY29ob2xJbnNpZ2h0KGVudHJpZXMpLFxuICAgIGxhdGVTbmFja0luc2lnaHQoZW50cmllcyksXG4gICAgcGxhdGVhdUluc2lnaHQoZW50cmllcyksXG4gIF0uZmlsdGVyKChpbnMpOiBpbnMgaXMgSW5zaWdodENhcmQgPT4gaW5zICE9PSBudWxsKTtcbiAgY29uc3QgdG9wID0gWy4uLm5ldyBNYXAoY2FuZGlkYXRlcy5tYXAoKGl0ZW0pID0+IFtpdGVtLnJ1bGVJZCwgaXRlbV0pKS52YWx1ZXMoKV1cbiAgICAuc29ydCgoYSwgYikgPT4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHkpXG4gICAgLnNsaWNlKDAsIDMpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaW5zaWdodHM6IHRvcCB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUluc2lnaHRGZWVkYmFjayh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRVwiLCBpbnNpZ2h0RmVlZGJhY2tUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGluc2lnaHRJZCA9IHR5cGVvZiBib2R5Lmluc2lnaHRJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuaW5zaWdodElkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHZvdGUgPSBib2R5LnZvdGUgPT09IFwidXBcIiB8fCBib2R5LnZvdGUgPT09IFwiZG93blwiID8gYm9keS52b3RlIDogbnVsbDtcbiAgaWYgKCFpbnNpZ2h0SWQgfHwgIXZvdGUpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGluc2lnaHQgZmVlZGJhY2sgcGF5bG9hZFwiIH0pO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGluc2lnaHRUczogeyBTOiBgJHt0c30jJHtpbnNpZ2h0SWR9YCB9LFxuICAgICAgICBpbnNpZ2h0SWQ6IHsgUzogaW5zaWdodElkIH0sXG4gICAgICAgIHZvdGU6IHsgUzogdm90ZSB9LFxuICAgICAgICB0czogeyBTOiB0cyB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRFbnRyaWVzKHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGZyb20gPSBxdWVyeT8uZnJvbTtcbiAgY29uc3QgdG8gPSBxdWVyeT8udG87XG4gIGlmIChmcm9tICYmICFpc0RhdGVTdHJpbmcoZnJvbSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGZyb20gZGF0ZVwiIH0pO1xuICBpZiAodG8gJiYgIWlzRGF0ZVN0cmluZyh0bykpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHRvIGRhdGVcIiB9KTtcblxuICBjb25zdCBleHByZXNzaW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB7IFM6IHN0cmluZyB9PiA9IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfTtcbiAgbGV0IGtleUNvbmRpdGlvbiA9IFwidXNlcklkID0gOnVzZXJJZFwiO1xuICBpZiAoZnJvbSAmJiB0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH0gZWxzZSBpZiAoZnJvbSkge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPj0gOmZyb21EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICB9IGVsc2UgaWYgKHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA8PSA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH1cblxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjoga2V5Q29uZGl0aW9uLFxuICAgICAgLi4uKGtleUNvbmRpdGlvbi5pbmNsdWRlcyhcIiNkYXRlXCIpXG4gICAgICAgID8geyBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9IH1cbiAgICAgICAgOiB7fSksXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uVmFsdWVzLFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXM6IFN0b3JlZEVudHJ5W10gPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgaWQ6IGl0ZW0uaWQ/LlMgPz8gYCR7dXNlcklkfToke2l0ZW0uZGF0ZT8uUyA/PyBcIlwifWAsXG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICBwaG90b1VybDogaXRlbS5waG90b1VybD8uUyA/PyB1bmRlZmluZWQsXG4gICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzOiBTdG9yZWRFbnRyeVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBwaG90byA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGVudHJ5LnBob3RvVXJsKTtcbiAgICAgIGlmICghcGhvdG8pIHJldHVybiBlbnRyeTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpdGhvdXRTY2hlbWUgPSBwaG90by5zbGljZShcInMzOi8vXCIubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgZmlyc3RTbGFzaCA9IHdpdGhvdXRTY2hlbWUuaW5kZXhPZihcIi9cIik7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoIDw9IDApIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3QgYnVja2V0ID0gd2l0aG91dFNjaGVtZS5zbGljZSgwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgY29uc3Qga2V5ID0gd2l0aG91dFNjaGVtZS5zbGljZShmaXJzdFNsYXNoICsgMSk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IHNpZ25lZFBob3RvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiBidWNrZXQsIEtleToga2V5IH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiBkb3dubG9hZFVybFR0bFNlY29uZHMgfSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgLi4uZW50cnksIHBob3RvVXJsOiBzaWduZWRQaG90b1VybCB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cmllczogZW50cmllc1dpdGhTaWduZWRQaG90b1VybHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEVudHJ5KHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlRW50cnkocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGlkID0gYCR7dXNlcklkfToke2RhdGEuZGF0ZX1gO1xuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGEuZGF0ZSB9LFxuICAgIGlkOiB7IFM6IGlkIH0sXG4gICAgbW9ybmluZ1dlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5tb3JuaW5nV2VpZ2h0KSB9LFxuICAgIGxhdGVTbmFjazogeyBCT09MOiBkYXRhLmxhdGVTbmFjayB9LFxuICAgIGhpZ2hTb2RpdW06IHsgQk9PTDogZGF0YS5oaWdoU29kaXVtIH0sXG4gICAgd29ya291dDogeyBCT09MOiBkYXRhLndvcmtvdXQgfSxcbiAgICBhbGNvaG9sOiB7IEJPT0w6IGRhdGEuYWxjb2hvbCB9LFxuICB9O1xuXG4gIGlmIChkYXRhLm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5uaWdodFdlaWdodCAhPT0gbnVsbCkge1xuICAgIGl0ZW0ubmlnaHRXZWlnaHQgPSB7IE46IFN0cmluZyhkYXRhLm5pZ2h0V2VpZ2h0KSB9O1xuICB9XG4gIGlmIChkYXRhLmNhbG9yaWVzICE9PSB1bmRlZmluZWQpIGl0ZW0uY2Fsb3JpZXMgPSB7IE46IFN0cmluZyhkYXRhLmNhbG9yaWVzKSB9O1xuICBpZiAoZGF0YS5wcm90ZWluICE9PSB1bmRlZmluZWQpIGl0ZW0ucHJvdGVpbiA9IHsgTjogU3RyaW5nKGRhdGEucHJvdGVpbikgfTtcbiAgaWYgKGRhdGEuc3RlcHMgIT09IHVuZGVmaW5lZCkgaXRlbS5zdGVwcyA9IHsgTjogU3RyaW5nKGRhdGEuc3RlcHMpIH07XG4gIGlmIChkYXRhLnNsZWVwICE9PSB1bmRlZmluZWQpIGl0ZW0uc2xlZXAgPSB7IE46IFN0cmluZyhkYXRhLnNsZWVwKSB9O1xuICBjb25zdCBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShkYXRhLnBob3RvVXJsKTtcbiAgaWYgKG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSkgaXRlbS5waG90b1VybCA9IHsgUzogbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlIH07XG4gIGlmICh0eXBlb2YgZGF0YS5ub3RlcyA9PT0gXCJzdHJpbmdcIikgaXRlbS5ub3RlcyA9IHsgUzogZGF0YS5ub3RlcyB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJ5OiB7IC4uLmRhdGEsIGlkIH0gfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGRhdGUgPSBxdWVyeT8uZGF0ZTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF0ZSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBkYXRlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgc2V0dGluZ3M6IHtcbiAgICAgICAgZ29hbFdlaWdodDogc2V0dGluZ3MuZ29hbFdlaWdodCxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHNldHRpbmdzLnN0YXJ0V2VpZ2h0LFxuICAgICAgICB0YXJnZXREYXRlOiBzZXR0aW5ncy50YXJnZXREYXRlLFxuICAgICAgICB1bml0OiBzZXR0aW5ncy51bml0LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MiksXG4gICAgICBzdGFydFdlaWdodDogTnVtYmVyKG91dC5JdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSxcbiAgICAgIHRhcmdldERhdGU6IG91dC5JdGVtLnRhcmdldERhdGU/LlMgPz8gZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IG91dC5JdGVtLnVuaXQ/LlMgPT09IFwibGJzXCIgPyBcImxic1wiIDogXCJrZ1wiLFxuICAgIH0sXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXRjaFNldHRpbmdzKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgcGFyc2VkID0gdmFsaWRhdGVTZXR0aW5ncyhwYXlsb2FkKTtcbiAgaWYgKCFwYXJzZWQub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwYXJzZWQuZXJyb3IgfSk7XG4gIGNvbnN0IGRhdGEgPSBwYXJzZWQuZGF0YTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5nb2FsV2VpZ2h0KSB9LFxuICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5zdGFydFdlaWdodCkgfSxcbiAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBkYXRhLnRhcmdldERhdGUgfSxcbiAgICAgICAgdW5pdDogeyBTOiBkYXRhLnVuaXQgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IHNldHRpbmdzOiBkYXRhIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVVcGxvYWRVcmwodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gIGNvbnN0IGNvbnRlbnRUeXBlID1cbiAgICB0eXBlb2YgYm9keS5jb250ZW50VHlwZSA9PT0gXCJzdHJpbmdcIiAmJiBib2R5LmNvbnRlbnRUeXBlLmxlbmd0aCA+IDBcbiAgICAgID8gYm9keS5jb250ZW50VHlwZVxuICAgICAgOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICBjb25zdCBleHRlbnNpb24gPVxuICAgIHR5cGVvZiBib2R5LmV4dGVuc2lvbiA9PT0gXCJzdHJpbmdcIiAmJiAvXlthLXpBLVowLTldKyQvLnRlc3QoYm9keS5leHRlbnNpb24pXG4gICAgICA/IGJvZHkuZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKClcbiAgICAgIDogXCJqcGdcIjtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qga2V5ID0gYCR7dXNlcklkfS8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcblxuICBjb25zdCBjb21tYW5kID0gbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgIEJ1Y2tldDogYnVja2V0LFxuICAgIEtleToga2V5LFxuICAgIENvbnRlbnRUeXBlOiBjb250ZW50VHlwZSxcbiAgfSk7XG4gIGNvbnN0IHVwbG9hZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMgfSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXBsb2FkVXJsLFxuICAgIGtleSxcbiAgICBwaG90b1VybDogYHMzOi8vJHtidWNrZXR9LyR7a2V5fWAsXG4gICAgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U3RhdHMoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IFt1c2Vyc091dCwgdmlld3NPdXRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IFNjYW5Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIFNlbGVjdDogXCJDT1VOVFwiLFxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBcIiN1aWQgPD4gOm1ldGFVc2VySWQgQU5EIGF0dHJpYnV0ZV9leGlzdHMoZ29hbFdlaWdodClcIixcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI3VpZFwiOiBcInVzZXJJZFwiIH0sXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6bWV0YVVzZXJJZFwiOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgXSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXNlcnM6IE51bWJlcih1c2Vyc091dC5Db3VudCA/PyAwKSxcbiAgICBwYWdlVmlld3M6IE51bWJlcih2aWV3c091dC5JdGVtPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHBvb2xJZCA9IGdldFJlcXVpcmVkRW52KFwiVVNFUl9QT09MX0lEXCIsIHVzZXJQb29sSWRFbnYpO1xuICBjb25zdCB1c2VyczogQXJyYXk8e1xuICAgIHN1Yjogc3RyaW5nO1xuICAgIGVtYWlsPzogc3RyaW5nO1xuICAgIGZpcnN0TmFtZT86IHN0cmluZztcbiAgICBmdWxsTmFtZT86IHN0cmluZztcbiAgICBzdGF0dXM/OiBzdHJpbmc7XG4gIH0+ID0gW107XG5cbiAgbGV0IHBhZ2luYXRpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBkbyB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKFxuICAgICAgbmV3IExpc3RVc2Vyc0NvbW1hbmQoe1xuICAgICAgICBVc2VyUG9vbElkOiBwb29sSWQsXG4gICAgICAgIExpbWl0OiA2MCxcbiAgICAgICAgUGFnaW5hdGlvblRva2VuOiBwYWdpbmF0aW9uVG9rZW4sXG4gICAgICB9KSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgdSBvZiBvdXQuVXNlcnMgPz8gW10pIHtcbiAgICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IGEgb2YgdS5BdHRyaWJ1dGVzID8/IFtdKSB7XG4gICAgICAgIGlmIChhLk5hbWUgJiYgYS5WYWx1ZSkgYXR0cnNbYS5OYW1lXSA9IGEuVmFsdWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmdWxsTmFtZSA9IGF0dHJzLm5hbWU7XG4gICAgICBjb25zdCBnaXZlbiA9IGF0dHJzLmdpdmVuX25hbWU7XG4gICAgICBjb25zdCBmaXJzdE5hbWUgPVxuICAgICAgICBnaXZlbiA/PyAoZnVsbE5hbWUgPyBmdWxsTmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXSA6IHVuZGVmaW5lZCk7XG4gICAgICB1c2Vycy5wdXNoKHtcbiAgICAgICAgc3ViOiBhdHRycy5zdWIgPz8gdS5Vc2VybmFtZSA/PyBcIlwiLFxuICAgICAgICBlbWFpbDogYXR0cnMuZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgZnVsbE5hbWUsXG4gICAgICAgIHN0YXR1czogdS5Vc2VyU3RhdHVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHBhZ2luYXRpb25Ub2tlbiA9IG91dC5QYWdpbmF0aW9uVG9rZW47XG4gIH0gd2hpbGUgKHBhZ2luYXRpb25Ub2tlbik7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGNvdW50OiB1c2Vycy5sZW5ndGgsIHVzZXJzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbmNyZW1lbnRQYWdlVmlldygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiQUREIHBhZ2VWaWV3cyA6aW5jIFNFVCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0XCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOmluY1wiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIFwiOnVwZGF0ZWRBdFwiOiB7IFM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogXCJVUERBVEVEX05FV1wiLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHBhZ2VWaWV3czogTnVtYmVyKG91dC5BdHRyaWJ1dGVzPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRkVBVFVSRV9GTEFHX09WRVJSSURFU19UQUJMRV9OQU1FXCIsIGZlYXR1cmVGbGFnT3ZlcnJpZGVzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG92ZXJyaWRlcyA9IChvdXQuSXRlbXMgPz8gW10pLnJlZHVjZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oKGFjYywgaXRlbSkgPT4ge1xuICAgIGNvbnN0IGZsYWcgPSBpdGVtLmZsYWc/LlM7XG4gICAgY29uc3QgZW5hYmxlZFJhdyA9IGl0ZW0uZW5hYmxlZD8uQk9PTDtcbiAgICBpZiAodHlwZW9mIGZsYWcgPT09IFwic3RyaW5nXCIgJiYgdHlwZW9mIGVuYWJsZWRSYXcgPT09IFwiYm9vbGVhblwiKSB7XG4gICAgICBhY2NbZmxhZ10gPSBlbmFibGVkUmF3O1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG4gIHJldHVybiBqc29uKDIwMCwgeyB1c2VySWQsIG92ZXJyaWRlcyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCB0YXJnZXRVc2VySWQgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnVzZXJJZDtcbiAgaWYgKCF0YXJnZXRVc2VySWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTWlzc2luZyB1c2VySWQgcXVlcnkgcGFyYW1ldGVyXCIgfSk7XG4gIH1cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnVzZXJJZFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjp1c2VySWRcIjogeyBTOiB0YXJnZXRVc2VySWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG92ZXJyaWRlcyA9IChvdXQuSXRlbXMgPz8gW10pLm1hcCgoaXRlbSkgPT4gKHtcbiAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHRhcmdldFVzZXJJZCxcbiAgICBmbGFnOiBpdGVtLmZsYWc/LlMgPz8gXCJcIixcbiAgICBlbmFibGVkOiBpdGVtLmVuYWJsZWQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgdHM6IGl0ZW0udHM/LlMgPz8gXCJcIixcbiAgfSkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgb3ZlcnJpZGVzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJGRUFUVVJFX0ZMQUdfT1ZFUlJJREVTX1RBQkxFX05BTUVcIiwgZmVhdHVyZUZsYWdPdmVycmlkZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmICghcGF5bG9hZCB8fCB0eXBlb2YgcGF5bG9hZCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkJvZHkgbXVzdCBiZSBhbiBvYmplY3RcIiB9KTtcbiAgY29uc3QgYm9keSA9IHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHVzZXJJZCA9IHR5cGVvZiBib2R5LnVzZXJJZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkudXNlcklkLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHJhd0ZsYWcgPSB0eXBlb2YgYm9keS5mbGFnID09PSBcInN0cmluZ1wiID8gYm9keS5mbGFnLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGVuYWJsZWQgPSB0eXBlb2YgYm9keS5lbmFibGVkID09PSBcImJvb2xlYW5cIiA/IGJvZHkuZW5hYmxlZCA6IG51bGw7XG4gIGlmICghdXNlcklkIHx8ICFyYXdGbGFnIHx8IGVuYWJsZWQgPT09IG51bGwpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBwYXlsb2FkLiBFeHBlY3RlZCB1c2VySWQsIGZsYWcsIGVuYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3Qgbm9ybWFsaXplZEZsYWcgPSByYXdGbGFnLnN0YXJ0c1dpdGgoXCJGRl9cIikgPyByYXdGbGFnIDogYEZGXyR7cmF3RmxhZ31gO1xuICBjb25zdCB0cyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGZsYWc6IHsgUzogbm9ybWFsaXplZEZsYWcgfSxcbiAgICAgICAgZW5hYmxlZDogeyBCT09MOiBlbmFibGVkIH0sXG4gICAgICAgIHRzOiB7IFM6IHRzIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIG92ZXJyaWRlOiB7IHVzZXJJZCwgZmxhZzogbm9ybWFsaXplZEZsYWcsIGVuYWJsZWQsIHRzIH0gfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1c2VySWQgPSBnZXRVc2VySWQoZXZlbnQpO1xuICAgIGlmICghdXNlcklkKSByZXR1cm4ganNvbig0MDEsIHsgZXJyb3I6IFwiVW5hdXRob3JpemVkXCIgfSk7XG4gICAgY29uc3QgbWV0aG9kID0gKFxuICAgICAgZXZlbnQgYXMgeyByZXF1ZXN0Q29udGV4dD86IHsgaHR0cD86IHsgbWV0aG9kPzogc3RyaW5nIH0gfSB9XG4gICAgKS5yZXF1ZXN0Q29udGV4dD8uaHR0cD8ubWV0aG9kO1xuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2VudHJpZXNcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0RW50cmllcyh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBVVFwiKSB7XG4gICAgICAgIHJldHVybiB1cHNlcnRFbnRyeSh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgICAgcmV0dXJuIGRlbGV0ZUVudHJ5KHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc2V0dGluZ3NcIikge1xuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgICByZXR1cm4gZ2V0U2V0dGluZ3ModXNlcklkKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUEFUQ0hcIikge1xuICAgICAgICByZXR1cm4gcGF0Y2hTZXR0aW5ncyh1c2VySWQsIGV2ZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvc3RhdHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRTdGF0cygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9tZXRyaWNzL3BhZ2Utdmlld1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBpbmNyZW1lbnRQYWdlVmlldygpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9waG90b3MvdXBsb2FkLXVybFwiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBjcmVhdGVVcGxvYWRVcmwodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0SW5zaWdodHNWMih1c2VySWQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi92Mi9pbnNpZ2h0cy9mZWVkYmFja1wiICYmIG1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICAgIHJldHVybiBzYXZlSW5zaWdodEZlZWRiYWNrKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKCEoYXdhaXQgaXNBZG1pbkFsbG93ZWQoZXZlbnQpKSkge1xuICAgICAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2ZlYXR1cmUtZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRGZWF0dXJlRmxhZ3NGb3JVc2VyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL2ZsYWdzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiRm9yYmlkZGVuXCIgfSk7XG4gICAgICByZXR1cm4gbGlzdEZlYXR1cmVGbGFnT3ZlcnJpZGVzKGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvYWRtaW4vZmxhZ3NcIiAmJiBtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIGlmICghKGF3YWl0IGlzQWRtaW5BbGxvd2VkKGV2ZW50KSkpIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIHJldHVybiB1cHNlcnRGZWF0dXJlRmxhZ092ZXJyaWRlKGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19