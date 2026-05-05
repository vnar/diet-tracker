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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUF5NkJBLDBCQWdFQztBQXorQkQsZ0dBSW1EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBRTdELE1BQU0sR0FBRyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxnRUFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUV6RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sd0JBQXdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztBQUN6RSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDO0FBQ3RELE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksS0FBSyxDQUFDLENBQUM7QUFDaEYsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsSUFBSSxNQUFNLENBQUMsQ0FBQztBQUNyRixNQUFNLG1CQUFtQixHQUFHLFVBQVUsQ0FBQztBQUN2QyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztBQW9FL0MsU0FBUyxJQUFJLENBQUMsVUFBa0IsRUFBRSxPQUFnQjtJQUNoRCxPQUFPO1FBQ0wsVUFBVTtRQUNWLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxrQkFBa0Is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QUNqRCxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3pFLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDaEUsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUM3RCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDdkQsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDeEMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDMUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDcEMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLEtBQUs7UUFDcEMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLFNBQVM7UUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxJQUFJLFNBQVM7S0FDaEMsQ0FBQyxDQUNI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QUFXLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLENBQUM7WUFDRCxPQUFPLHdCQUF3QixFQUFFLENBQUM7UUFDcEMsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsSUFBSSxLQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDL0QsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUNELE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBHZXRVc2VyQ29tbWFuZCxcbiAgTGlzdFVzZXJzQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyXCI7XG5pbXBvcnQge1xuICBEeW5hbW9EQkNsaWVudCxcbiAgRGVsZXRlSXRlbUNvbW1hbmQsXG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBTY2FuQ29tbWFuZCxcbiAgVXBkYXRlSXRlbUNvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1zM1wiO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSBcIkBhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyXCI7XG5cbmNvbnN0IGRkYiA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7fSk7XG5jb25zdCBjb2duaXRvSWRwID0gbmV3IENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50KHt9KTtcblxuY29uc3QgZW50cmllc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LkVOVFJJRVNfVEFCTEVfTkFNRTtcbmNvbnN0IHNldHRpbmdzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuU0VUVElOR1NfVEFCTEVfTkFNRTtcbmNvbnN0IGluc2lnaHRGZWVkYmFja1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LklOU0lHSFRfRkVFREJBQ0tfVEFCTEVfTkFNRTtcbmNvbnN0IHBob3RvQnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LlBIT1RPX0JVQ0tFVF9OQU1FO1xuY29uc3QgdXBsb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5VUExPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiOTAwXCIpO1xuY29uc3QgZG93bmxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LkRPV05MT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjM2MDBcIik7XG5jb25zdCBhbmFseXRpY3NNZXRhVXNlcklkID0gXCJfX21ldGFfX1wiO1xuY29uc3QgdXNlclBvb2xJZEVudiA9IHByb2Nlc3MuZW52LlVTRVJfUE9PTF9JRDtcblxudHlwZSBDbGFpbXMgPSB7XG4gIHN1Yjogc3RyaW5nO1xuICBba2V5OiBzdHJpbmddOiB1bmtub3duO1xufTtcblxudHlwZSBIdHRwRXZlbnQgPSB7XG4gIHJhd1BhdGg6IHN0cmluZztcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD47XG4gIHJlcXVlc3RDb250ZXh0Pzoge1xuICAgIGF1dGhvcml6ZXI/OiB7XG4gICAgICBqd3Q/OiB7XG4gICAgICAgIGNsYWltcz86IENsYWltcztcbiAgICAgIH07XG4gICAgfTtcbiAgfTtcbiAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGw7XG4gIGJvZHk/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBIdHRwUmVzdWx0ID0ge1xuICBzdGF0dXNDb2RlOiBudW1iZXI7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICBib2R5OiBzdHJpbmc7XG59O1xuXG50eXBlIERhaWx5RW50cnlVcHNlcnQgPSB7XG4gIGRhdGU6IHN0cmluZztcbiAgbW9ybmluZ1dlaWdodDogbnVtYmVyO1xuICBuaWdodFdlaWdodD86IG51bWJlciB8IG51bGw7XG4gIGNhbG9yaWVzPzogbnVtYmVyO1xuICBwcm90ZWluPzogbnVtYmVyO1xuICBzdGVwcz86IG51bWJlcjtcbiAgc2xlZXA/OiBudW1iZXI7XG4gIGxhdGVTbmFjazogYm9vbGVhbjtcbiAgaGlnaFNvZGl1bTogYm9vbGVhbjtcbiAgd29ya291dDogYm9vbGVhbjtcbiAgYWxjb2hvbDogYm9vbGVhbjtcbiAgcGhvdG9Vcmw/OiBzdHJpbmcgfCBudWxsO1xuICBub3Rlcz86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIFNldHRpbmdzUGF0Y2ggPSB7XG4gIGdvYWxXZWlnaHQ6IG51bWJlcjtcbiAgc3RhcnRXZWlnaHQ6IG51bWJlcjtcbiAgdGFyZ2V0RGF0ZTogc3RyaW5nO1xuICB1bml0OiBcImtnXCIgfCBcImxic1wiO1xufTtcblxudHlwZSBTdG9yZWRFbnRyeSA9IERhaWx5RW50cnlVcHNlcnQgJiB7XG4gIGlkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxudHlwZSBTdG9yZWRTZXR0aW5ncyA9IFNldHRpbmdzUGF0Y2ggJiB7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxudHlwZSBJbnNpZ2h0Q2FyZCA9IHtcbiAgaWQ6IHN0cmluZztcbiAgcnVsZUlkOiBzdHJpbmc7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIGhlYWRsaW5lOiBzdHJpbmc7XG4gIGRldGFpbD86IHN0cmluZztcbiAgd2h5OiBzdHJpbmdbXTtcbn07XG5cbmZ1bmN0aW9uIGpzb24oc3RhdHVzQ29kZTogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKTogSHR0cFJlc3VsdCB7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZSxcbiAgICBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVpcmVkRW52KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52IHZhciAke25hbWV9YCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUpzb25Cb2R5KGV2ZW50OiBIdHRwRXZlbnQpOiB1bmtub3duIHtcbiAgaWYgKCFldmVudC5ib2R5KSByZXR1cm4ge307XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gIH0gY2F0Y2gge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgSlNPTlwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0RhdGVTdHJpbmcodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiICYmIC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gaXNQb3NpdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+IDA7XG59XG5cbmZ1bmN0aW9uIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPj0gMDtcbn1cblxuZnVuY3Rpb24gaXNJbnROb25OZWdhdGl2ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVFbnRyeShpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IERhaWx5RW50cnlVcHNlcnQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cblxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubW9ybmluZ1dlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBtb3JuaW5nV2VpZ2h0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmxhdGVTbmFjayAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBsYXRlU25hY2tcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuaGlnaFNvZGl1bSAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBoaWdoU29kaXVtXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LndvcmtvdXQgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgd29ya291dFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5hbGNvaG9sICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFsY29ob2xcIiB9O1xuXG4gIGlmIChcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSBudWxsICYmXG4gICAgIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5uaWdodFdlaWdodClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5pZ2h0V2VpZ2h0XCIgfTtcbiAgfVxuXG4gIGlmIChib2R5LmNhbG9yaWVzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5jYWxvcmllcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgY2Fsb3JpZXNcIiB9O1xuICB9XG4gIGlmIChib2R5LnByb3RlaW4gIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnByb3RlaW4pKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHByb3RlaW5cIiB9O1xuICB9XG4gIGlmIChib2R5LnN0ZXBzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5zdGVwcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RlcHNcIiB9O1xuICB9XG4gIGlmIChib2R5LnNsZWVwICE9PSB1bmRlZmluZWQgJiYgIWlzTm9uTmVnYXRpdmVOdW1iZXIoYm9keS5zbGVlcCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc2xlZXBcIiB9O1xuICB9XG5cbiAgaWYgKFxuICAgIGJvZHkucGhvdG9VcmwgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkucGhvdG9VcmwgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkucGhvdG9VcmwgIT09IFwic3RyaW5nXCIgfHwgYm9keS5waG90b1VybC5sZW5ndGggPiA2MDBfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGhvdG9VcmxcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5Lm5vdGVzICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5vdGVzICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5Lm5vdGVzICE9PSBcInN0cmluZ1wiIHx8IGJvZHkubm90ZXMubGVuZ3RoID4gMl8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBub3Rlc1wiIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGRhdGU6IGJvZHkuZGF0ZSxcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IGJvZHkubW9ybmluZ1dlaWdodCxcbiAgICAgIG5pZ2h0V2VpZ2h0OiAoYm9keS5uaWdodFdlaWdodCBhcyBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogYm9keS5jYWxvcmllcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBib2R5LnByb3RlaW4gYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGJvZHkuc3RlcHMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGJvZHkuc2xlZXAgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBib2R5LmxhdGVTbmFjayBhcyBib29sZWFuLFxuICAgICAgaGlnaFNvZGl1bTogYm9keS5oaWdoU29kaXVtIGFzIGJvb2xlYW4sXG4gICAgICB3b3Jrb3V0OiBib2R5LndvcmtvdXQgYXMgYm9vbGVhbixcbiAgICAgIGFsY29ob2w6IGJvZHkuYWxjb2hvbCBhcyBib29sZWFuLFxuICAgICAgcGhvdG9Vcmw6IChib2R5LnBob3RvVXJsIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIG5vdGVzOiAoYm9keS5ub3RlcyBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTZXR0aW5ncyhpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IFNldHRpbmdzUGF0Y2ggfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5nb2FsV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGdvYWxXZWlnaHRcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5zdGFydFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGFydFdlaWdodFwiIH07XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkudGFyZ2V0RGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0YXJnZXREYXRlXCIgfTtcbiAgaWYgKGJvZHkudW5pdCAhPT0gXCJrZ1wiICYmIGJvZHkudW5pdCAhPT0gXCJsYnNcIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHVuaXRcIiB9O1xuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGJvZHkuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBib2R5LnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogYm9keS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogYm9keS51bml0LFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldEp3dENsYWltcyhldmVudDogSHR0cEV2ZW50KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuICBjb25zdCByYXcgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uand0Py5jbGFpbXM7XG4gIGlmIChyYXcgPT0gbnVsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG4gICAgICBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgcmF3ID09PSBcIm9iamVjdFwiICYmICFBcnJheS5pc0FycmF5KHJhdykpIHtcbiAgICByZXR1cm4gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVzZXJJZChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3Qgc3ViID0gZ2V0Snd0Q2xhaW1zKGV2ZW50KT8uc3ViO1xuICByZXR1cm4gdHlwZW9mIHN1YiA9PT0gXCJzdHJpbmdcIiA/IHN1YiA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEdtYWlsIHRyZWF0cyBkb3RzIGFuZCArbGFiZWxzIGFzIGFsaWFzZXM7IG5vcm1hbGl6ZSBzbyBhZG1pbiBsaXN0IG1hdGNoZXMgcmVhbCBzaWduLWluIGlkZW50aXRpZXMuICovXG5mdW5jdGlvbiBub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goZW1haWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGxvd2VyID0gZW1haWwudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IGF0ID0gbG93ZXIubGFzdEluZGV4T2YoXCJAXCIpO1xuICBpZiAoYXQgPD0gMCkgcmV0dXJuIGxvd2VyO1xuICBjb25zdCBsb2NhbCA9IGxvd2VyLnNsaWNlKDAsIGF0KTtcbiAgY29uc3QgZG9tYWluID0gbG93ZXIuc2xpY2UoYXQgKyAxKTtcbiAgaWYgKGRvbWFpbiA9PT0gXCJnbWFpbC5jb21cIiB8fCBkb21haW4gPT09IFwiZ29vZ2xlbWFpbC5jb21cIikge1xuICAgIGNvbnN0IGJhc2VMb2NhbCA9IChsb2NhbC5zcGxpdChcIitcIilbMF0gPz8gbG9jYWwpLnJlcGxhY2UoL1xcLi9nLCBcIlwiKTtcbiAgICByZXR1cm4gYCR7YmFzZUxvY2FsfUAke2RvbWFpbn1gO1xuICB9XG4gIHJldHVybiBsb3dlcjtcbn1cblxuZnVuY3Rpb24gZ2V0QWRtaW5BbGxvd0xpc3ROb3JtYWxpemVkKCk6IFNldDxzdHJpbmc+IHtcbiAgY29uc3QgcmF3ID0gcHJvY2Vzcy5lbnYuQURNSU5fRU1BSUxTPy50cmltKCkgfHwgXCJ2aWhhcm5hckBnbWFpbC5jb21cIjtcbiAgY29uc3QgcGFydHMgPSByYXdcbiAgICAuc3BsaXQoXCIsXCIpXG4gICAgLm1hcCgocykgPT4gbm9ybWFsaXplRW1haWxGb3JBZG1pbk1hdGNoKHMudHJpbSgpKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBzZXQgPSBuZXcgU2V0KHBhcnRzKTtcbiAgaWYgKHNldC5zaXplID09PSAwKSB7XG4gICAgc2V0LmFkZChub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goXCJ2aWhhcm5hckBnbWFpbC5jb21cIikpO1xuICB9XG4gIHJldHVybiBzZXQ7XG59XG5cbmNvbnN0IEFETUlOX0NMQUlNX0tFWVMgPSBbXCJ1c2VybmFtZVwiLCBcImNvZ25pdG86dXNlcm5hbWVcIiwgXCJlbWFpbFwiLCBcInByZWZlcnJlZF91c2VybmFtZVwiXSBhcyBjb25zdDtcblxuZnVuY3Rpb24gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGZvdW5kOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBlbWFpbGlzaCA9IC9eW15cXHNAXStAW15cXHNAXStcXC5bXlxcc0BdKyQvO1xuICBmb3IgKGNvbnN0IGtleSBvZiBBRE1JTl9DTEFJTV9LRVlTKSB7XG4gICAgY29uc3QgdiA9IGNsYWltc1trZXldO1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCB2IG9mIE9iamVjdC52YWx1ZXMoY2xhaW1zKSkge1xuICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiBlbWFpbGlzaC50ZXN0KHYudHJpbSgpKSkge1xuICAgICAgZm91bmQucHVzaCh2LnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFsuLi5uZXcgU2V0KGZvdW5kKV07XG59XG5cbi8qKiBUcnVlIGlmIEpXVCBjbGFpbXMgaW5jbHVkZSBhbiBlbWFpbCBpZGVudGl0eSB0aGF0IG1hdGNoZXMgdGhlIGNvbmZpZ3VyZWQgYWRtaW4gYWxsb3cgbGlzdC4gKi9cbmZ1bmN0aW9uIGlzQWRtaW5DYWxsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IGJvb2xlYW4ge1xuICBjb25zdCBjbGFpbXMgPSBnZXRKd3RDbGFpbXMoZXZlbnQpO1xuICBpZiAoIWNsYWltcykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEFkbWluSWRlbnRpdHlDYW5kaWRhdGVzKGNsYWltcyk7XG4gIGZvciAoY29uc3QgYyBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goYykpKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhlYWRlclZhbHVlKFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkLFxuICBuYW1lOiBzdHJpbmcsXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIWhlYWRlcnMpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IHdhbnQgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpKSB7XG4gICAgaWYgKGsudG9Mb3dlckNhc2UoKSA9PT0gd2FudCAmJiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2Lmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB2O1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEpXVCBIVFRQIEFQSSBhdXRob3JpemVycyB2YWxpZGF0ZSBBdXRob3JpemF0aW9uIGJ1dCB0eXBpY2FsbHkgZG8gbm90IGZvcndhcmQgdGhhdCBoZWFkZXIgdG8gTGFtYmRhLlxuICogQ2xpZW50cyBhbHNvIHNlbmQgeC1jb2duaXRvLWFjY2Vzcy10b2tlbiAoc2VlIGZyb250ZW5kLWFwaS1jbGllbnQpIHNvIHdlIGNhbiBjYWxsIGNvZ25pdG8taWRwOkdldFVzZXIuXG4gKi9cbmZ1bmN0aW9uIGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBoID0gZXZlbnQuaGVhZGVycztcbiAgY29uc3QgY3VzdG9tID0gaGVhZGVyVmFsdWUoaCwgXCJ4LWNvZ25pdG8tYWNjZXNzLXRva2VuXCIpO1xuICBpZiAoY3VzdG9tPy50cmltKCkpIHJldHVybiBjdXN0b20udHJpbSgpO1xuICBjb25zdCByYXcgPSBoZWFkZXJWYWx1ZShoLCBcImF1dGhvcml6YXRpb25cIik7XG4gIGlmICghcmF3KSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBtID0gcmF3Lm1hdGNoKC9eQmVhcmVyXFxzKyguKykkL2kpO1xuICByZXR1cm4gbT8uWzFdPy50cmltKCk7XG59XG5cbi8qKiBXaGVuIGNsYWltcyBsYWNrIGEgcmVzb2x2YWJsZSBlbWFpbCwgdmVyaWZ5IGFkbWluIHZpYSBHZXRVc2VyOyB0b2tlbiBzdWIgbXVzdCBtYXRjaCBKV1Qgc3ViLiAqL1xuYXN5bmMgZnVuY3Rpb24gaXNBZG1pblZpYUdldFVzZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICBjb25zdCB0b2tlbiA9IGJlYXJlckFjY2Vzc1Rva2VuKGV2ZW50KTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBqd3RTdWIgPSBnZXRVc2VySWQoZXZlbnQpO1xuICBpZiAoIWp3dFN1YikgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGdldEFkbWluQWxsb3dMaXN0Tm9ybWFsaXplZCgpO1xuICBpZiAoYWxsb3cuc2l6ZSA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuICB0cnkge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChuZXcgR2V0VXNlckNvbW1hbmQoeyBBY2Nlc3NUb2tlbjogdG9rZW4gfSkpO1xuICAgIGNvbnN0IGF0dHJzID0gb3V0LlVzZXJBdHRyaWJ1dGVzID8/IFtdO1xuICAgIGNvbnN0IHRva2VuU3ViID0gYXR0cnMuZmluZCgoYSkgPT4gYS5OYW1lID09PSBcInN1YlwiKT8uVmFsdWU7XG4gICAgaWYgKHRva2VuU3ViICE9PSBqd3RTdWIpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBlbWFpbCA9XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwiZW1haWxcIik/LlZhbHVlID8/XG4gICAgICBhdHRycy5maW5kKChhKSA9PiBhLk5hbWUgPT09IFwicHJlZmVycmVkX3VzZXJuYW1lXCIpPy5WYWx1ZTtcbiAgICBjb25zdCBmcm9tVXNlcm5hbWUgPSBvdXQuVXNlcm5hbWU/LmluY2x1ZGVzKFwiQFwiKSA/IG91dC5Vc2VybmFtZSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBjYW5kaWRhdGUgPSAoZW1haWwgPz8gZnJvbVVzZXJuYW1lID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghY2FuZGlkYXRlKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGFsbG93Lmhhcyhub3JtYWxpemVFbWFpbEZvckFkbWluTWF0Y2goY2FuZGlkYXRlKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBpc0FkbWluQWxsb3dlZChldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGlmIChpc0FkbWluQ2FsbGVyKGV2ZW50KSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBpc0FkbWluVmlhR2V0VXNlcihldmVudCk7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXREYXRlKCk6IHN0cmluZyB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICBkLnNldERhdGUoZC5nZXREYXRlKCkgKyAxMTgpO1xuICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocGhvdG9Vcmw6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIXBob3RvVXJsIHx8IHR5cGVvZiBwaG90b1VybCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHBob3RvVXJsLnN0YXJ0c1dpdGgoXCJzMzovL1wiKSkgcmV0dXJuIHBob3RvVXJsO1xuICBpZiAoIXBob3RvVXJsLmluY2x1ZGVzKFwiOi8vXCIpKSB7XG4gICAgY29uc3Qga2V5T25seSA9IHBob3RvVXJsLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gICAgaWYgKCFrZXlPbmx5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGlmIChwaG90b0J1Y2tldE5hbWUpIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3Bob3RvQnVja2V0TmFtZX0vJHtrZXlPbmx5fWA7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHBob3RvVXJsKTtcbiAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJzZWQucGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCBcIlwiKSk7XG4gICAgaWYgKCFwYXRoKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgLy8gVmlydHVhbC1ob3N0ZWQtc3R5bGUgVVJMOiBidWNrZXQuczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCB2aXJ0dWFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmICh2aXJ0dWFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke3ZpcnR1YWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIExlZ2FjeSBnbG9iYWwgZW5kcG9pbnQ6IGJ1Y2tldC5zMy5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IGdsb2JhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKGdsb2JhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtnbG9iYWxIb3N0ZWRbMV19LyR7cGF0aH1gO1xuICAgIH1cblxuICAgIC8vIFBhdGgtc3R5bGUgVVJMOiBzMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2J1Y2tldC9rZXlcbiAgICBpZiAoL15zM1suLV1bYS16MC05LV0rXFwuYW1hem9uYXdzXFwuY29tJC8udGVzdChob3N0KSB8fCBob3N0ID09PSBcInMzLmFtYXpvbmF3cy5jb21cIikge1xuICAgICAgY29uc3Qgc2xhc2ggPSBwYXRoLmluZGV4T2YoXCIvXCIpO1xuICAgICAgaWYgKHNsYXNoIDw9IDApIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBidWNrZXQgPSBwYXRoLnNsaWNlKDAsIHNsYXNoKTtcbiAgICAgIGNvbnN0IGtleSA9IHBhdGguc2xpY2Uoc2xhc2ggKyAxKTtcbiAgICAgIGlmICghYnVja2V0IHx8ICFrZXkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICByZXR1cm4gYHMzOi8vJHtidWNrZXR9LyR7a2V5fWA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNvcnRCeURhdGVBc2M8VCBleHRlbmRzIHsgZGF0ZTogc3RyaW5nIH0+KHJvd3M6IFRbXSk6IFRbXSB7XG4gIHJldHVybiBbLi4ucm93c10uc29ydCgoYSwgYikgPT4gYS5kYXRlLmxvY2FsZUNvbXBhcmUoYi5kYXRlKSk7XG59XG5cbmZ1bmN0aW9uIGF2ZXJhZ2UodmFsdWVzOiBudW1iZXJbXSk6IG51bWJlciB8IG51bGwge1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB2YWx1ZXMucmVkdWNlKChhY2MsIHZhbHVlKSA9PiBhY2MgKyB2YWx1ZSwgMCkgLyB2YWx1ZXMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiByb3VuZDIodmFsdWU6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBNYXRoLnJvdW5kKHZhbHVlICogMTAwKSAvIDEwMDtcbn1cblxuZnVuY3Rpb24gbmV4dE1vcm5pbmdEZWx0YXMoXG4gIGxvZ3M6IFN0b3JlZEVudHJ5W10sXG4gIHByZWRpY2F0ZTogKGxvZzogU3RvcmVkRW50cnkpID0+IGJvb2xlYW4sXG4pOiB7IGZsYWdnZWQ6IG51bWJlcltdOyBiYXNlbGluZTogbnVtYmVyW10gfSB7XG4gIGNvbnN0IHNvcnRlZCA9IHNvcnRCeURhdGVBc2MobG9ncyk7XG4gIGNvbnN0IGZsYWdnZWQ6IG51bWJlcltdID0gW107XG4gIGNvbnN0IGJhc2VsaW5lOiBudW1iZXJbXSA9IFtdO1xuICBmb3IgKGxldCBpZHggPSAwOyBpZHggPCBzb3J0ZWQubGVuZ3RoIC0gMTsgaWR4ICs9IDEpIHtcbiAgICBjb25zdCBkZWx0YSA9IHNvcnRlZFtpZHggKyAxXS5tb3JuaW5nV2VpZ2h0IC0gc29ydGVkW2lkeF0ubW9ybmluZ1dlaWdodDtcbiAgICBpZiAocHJlZGljYXRlKHNvcnRlZFtpZHhdKSkgZmxhZ2dlZC5wdXNoKGRlbHRhKTtcbiAgICBlbHNlIGJhc2VsaW5lLnB1c2goZGVsdGEpO1xuICB9XG4gIHJldHVybiB7IGZsYWdnZWQsIGJhc2VsaW5lIH07XG59XG5cbmZ1bmN0aW9uIHNvZGl1bUluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHsgZmxhZ2dlZCwgYmFzZWxpbmUgfSA9IG5leHRNb3JuaW5nRGVsdGFzKGxvZ3MsIChsb2cpID0+IGxvZy5oaWdoU29kaXVtKTtcbiAgaWYgKGZsYWdnZWQubGVuZ3RoIDwgNCB8fCBiYXNlbGluZS5sZW5ndGggPCAxKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZmxhZ2dlZEF2ZyA9IGF2ZXJhZ2UoZmxhZ2dlZCk7XG4gIGNvbnN0IGJhc2VsaW5lQXZnID0gYXZlcmFnZShiYXNlbGluZSk7XG4gIGlmIChmbGFnZ2VkQXZnID09IG51bGwgfHwgYmFzZWxpbmVBdmcgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4Y2VzcyA9IGZsYWdnZWRBdmcgLSBiYXNlbGluZUF2ZztcbiAgaWYgKGV4Y2VzcyA8PSAwLjMpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgc29kaXVtLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwic29kaXVtQnVtcFwiLFxuICAgIHByaW9yaXR5OiA5NSxcbiAgICBoZWFkbGluZTogXCJIaWdoLXNvZGl1bSBkYXlzIGFyZSBsaW5rZWQgdG8gaGVhdmllciBuZXh0LW1vcm5pbmcgd2VpZ2gtaW5zLlwiLFxuICAgIGRldGFpbDogYFlvdSBhdmVyYWdlICske3JvdW5kMihleGNlc3MpfSBrZyB2cyB5b3VyIG5vbi1zb2RpdW0gYmFzZWxpbmUgdGhlIG5leHQgbW9ybmluZy5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGhpZ2gtc29kaXVtIGRheXMgaW4gdGhlIGxhc3QgOTAgZGF5c2AsXG4gICAgICBgQXZlcmFnZSBuZXh0LW1vcm5pbmcgY2hhbmdlIG9uIGhpZ2gtc29kaXVtIGRheXM6ICske3JvdW5kMihmbGFnZ2VkQXZnKX0ga2dgLFxuICAgICAgYEJhc2VsaW5lIG5leHQtbW9ybmluZyBjaGFuZ2U6ICske3JvdW5kMihiYXNlbGluZUF2Zyl9IGtnYCxcbiAgICBdLFxuICB9O1xufVxuXG5mdW5jdGlvbiBhbGNvaG9sSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmFsY29ob2wpO1xuICBpZiAoZmxhZ2dlZC5sZW5ndGggPCA0IHx8IGJhc2VsaW5lLmxlbmd0aCA8IDEpIHJldHVybiBudWxsO1xuICBjb25zdCBmbGFnZ2VkQXZnID0gYXZlcmFnZShmbGFnZ2VkKTtcbiAgY29uc3QgYmFzZWxpbmVBdmcgPSBhdmVyYWdlKGJhc2VsaW5lKTtcbiAgaWYgKGZsYWdnZWRBdmcgPT0gbnVsbCB8fCBiYXNlbGluZUF2ZyA9PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgZXhjZXNzID0gZmxhZ2dlZEF2ZyAtIGJhc2VsaW5lQXZnO1xuICBpZiAoZXhjZXNzIDw9IDAuMykgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBhbGNvaG9sLWJ1bXAtJHtsb2dzW2xvZ3MubGVuZ3RoIC0gMV0/LmRhdGUgPz8gXCJ1bmtub3duXCJ9YCxcbiAgICBydWxlSWQ6IFwiYWxjb2hvbFwiLFxuICAgIHByaW9yaXR5OiA5MCxcbiAgICBoZWFkbGluZTogXCJBbGNvaG9sIGRheXMgdGVuZCB0byBzaG93IGEgbmV4dC1kYXkgd2VpZ2h0IGJ1bXAuXCIsXG4gICAgZGV0YWlsOiBgWW91IGF2ZXJhZ2UgKyR7cm91bmQyKGV4Y2Vzcyl9IGtnIHZlcnN1cyBub24tYWxjb2hvbCBkYXlzIHRoZSBuZXh0IG1vcm5pbmcuYCxcbiAgICB3aHk6IFtcbiAgICAgIGAke2ZsYWdnZWQubGVuZ3RofSBhbGNvaG9sLWxvZ2dlZCBkYXlzIGluIHRoZSBsYXN0IDkwIGRheXNgLFxuICAgICAgYEF2ZXJhZ2UgbmV4dC1tb3JuaW5nIGNoYW5nZSBhZnRlciBhbGNvaG9sOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGF0ZVNuYWNrSW5zaWdodChsb2dzOiBTdG9yZWRFbnRyeVtdKTogSW5zaWdodENhcmQgfCBudWxsIHtcbiAgY29uc3QgeyBmbGFnZ2VkLCBiYXNlbGluZSB9ID0gbmV4dE1vcm5pbmdEZWx0YXMobG9ncywgKGxvZykgPT4gbG9nLmxhdGVTbmFjayk7XG4gIGlmIChmbGFnZ2VkLmxlbmd0aCA8IDQgfHwgYmFzZWxpbmUubGVuZ3RoIDwgMSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGZsYWdnZWRBdmcgPSBhdmVyYWdlKGZsYWdnZWQpO1xuICBjb25zdCBiYXNlbGluZUF2ZyA9IGF2ZXJhZ2UoYmFzZWxpbmUpO1xuICBpZiAoZmxhZ2dlZEF2ZyA9PSBudWxsIHx8IGJhc2VsaW5lQXZnID09IG51bGwpIHJldHVybiBudWxsO1xuICBjb25zdCBleGNlc3MgPSBmbGFnZ2VkQXZnIC0gYmFzZWxpbmVBdmc7XG4gIGlmIChleGNlc3MgPD0gMC4zKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogYGxhdGUtc25hY2stYnVtcC0ke2xvZ3NbbG9ncy5sZW5ndGggLSAxXT8uZGF0ZSA/PyBcInVua25vd25cIn1gLFxuICAgIHJ1bGVJZDogXCJsYXRlU25hY2tcIixcbiAgICBwcmlvcml0eTogODgsXG4gICAgaGVhZGxpbmU6IFwiTGF0ZSBzbmFja3MgYXJlIGNvcnJlbGF0ZWQgd2l0aCBoZWF2aWVyIG5leHQtbW9ybmluZyBzY2FsZSByZWFkaW5ncy5cIixcbiAgICBkZXRhaWw6IGBZb3VyIG5leHQtZGF5IGNoYW5nZSBpcyArJHtyb3VuZDIoZXhjZXNzKX0ga2cgaGlnaGVyIHRoYW4geW91ciBub24tbGF0ZS1zbmFjayBiYXNlbGluZS5gLFxuICAgIHdoeTogW1xuICAgICAgYCR7ZmxhZ2dlZC5sZW5ndGh9IGxhdGUtc25hY2sgZGF5cyBpbiB0aGUgbGFzdCA5MCBkYXlzYCxcbiAgICAgIGBBdmVyYWdlIG5leHQtbW9ybmluZyBjaGFuZ2Ugd2l0aCBsYXRlIHNuYWNrOiArJHtyb3VuZDIoZmxhZ2dlZEF2Zyl9IGtnYCxcbiAgICAgIGBCYXNlbGluZSBuZXh0LW1vcm5pbmcgY2hhbmdlOiArJHtyb3VuZDIoYmFzZWxpbmVBdmcpfSBrZ2AsXG4gICAgXSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcGxhdGVhdUluc2lnaHQobG9nczogU3RvcmVkRW50cnlbXSk6IEluc2lnaHRDYXJkIHwgbnVsbCB7XG4gIGNvbnN0IHNvcnRlZCA9IHNvcnRCeURhdGVBc2MobG9ncyk7XG4gIGlmIChzb3J0ZWQubGVuZ3RoIDwgMTQpIHJldHVybiBudWxsO1xuICBjb25zdCByb2xsaW5nQXZnID0gKGlkeDogbnVtYmVyKSA9PiB7XG4gICAgY29uc3Qgc3RhcnQgPSBNYXRoLm1heCgwLCBpZHggLSA2KTtcbiAgICBjb25zdCBjaHVuayA9IHNvcnRlZC5zbGljZShzdGFydCwgaWR4ICsgMSk7XG4gICAgcmV0dXJuIGNodW5rLnJlZHVjZSgoYWNjLCBsb2cpID0+IGFjYyArIGxvZy5tb3JuaW5nV2VpZ2h0LCAwKSAvIGNodW5rLmxlbmd0aDtcbiAgfTtcbiAgY29uc3QgbGF0ZXN0SWR4ID0gc29ydGVkLmxlbmd0aCAtIDE7XG4gIGNvbnN0IHByaW9ySWR4ID0gbGF0ZXN0SWR4IC0gMTM7XG4gIGlmIChwcmlvcklkeCA8IDApIHJldHVybiBudWxsO1xuICBjb25zdCBjdXJyZW50ID0gcm9sbGluZ0F2ZyhsYXRlc3RJZHgpO1xuICBjb25zdCBwcmlvciA9IHJvbGxpbmdBdmcocHJpb3JJZHgpO1xuICBjb25zdCBtb3ZlbWVudCA9IE1hdGguYWJzKGN1cnJlbnQgLSBwcmlvcik7XG4gIGlmIChtb3ZlbWVudCA+PSAwLjIpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiBgcGxhdGVhdS0ke3NvcnRlZFtsYXRlc3RJZHhdLmRhdGV9YCxcbiAgICBydWxlSWQ6IFwicGxhdGVhdVwiLFxuICAgIHByaW9yaXR5OiA5MyxcbiAgICBoZWFkbGluZTogXCJZb3UgbWF5IGJlIGluIGEgd2VpZ2h0IHBsYXRlYXUgcmlnaHQgbm93LlwiLFxuICAgIGRldGFpbDpcbiAgICAgIFwiWW91ciA3LWRheSBhdmVyYWdlIGhhcyBiYXJlbHkgbW92ZWQgb3ZlciB0aGUgbGFzdCB0d28gd2Vla3MuIFRyeSBhIHRpZ2h0ZXIgY2Fsb3JpZSB0YXJnZXQgb3IgYWRkIG9uZSBleHRyYSB3YWxrL3dvcmtvdXQgYmxvY2sgdGhpcyB3ZWVrLlwiLFxuICAgIHdoeTogW1xuICAgICAgYEN1cnJlbnQgNy1kYXkgYXZlcmFnZTogJHtyb3VuZDIoY3VycmVudCl9IGtnYCxcbiAgICAgIGA3LWRheSBhdmVyYWdlIGZyb20gMTQgZGF5cyBhZ286ICR7cm91bmQyKHByaW9yKX0ga2dgLFxuICAgICAgYFRvdGFsIG1vdmVtZW50IG92ZXIgMTQgZGF5czogJHtyb3VuZDIobW92ZW1lbnQpfSBrZyAoPCAwLjIga2cgdGhyZXNob2xkKWAsXG4gICAgXSxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5zaWdodHNWMih1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgdG8gPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCBmcm9tRGF0ZSA9IG5ldyBEYXRlKCk7XG4gIGZyb21EYXRlLnNldERhdGUoZnJvbURhdGUuZ2V0RGF0ZSgpIC0gODkpO1xuICBjb25zdCBmcm9tID0gZnJvbURhdGUudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1c2VySWQgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9LFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjp1c2VySWRcIjogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgXCI6ZnJvbURhdGVcIjogeyBTOiBmcm9tIH0sXG4gICAgICAgIFwiOnRvRGF0ZVwiOiB7IFM6IHRvIH0sXG4gICAgICB9LFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgICAgaWQ6IGl0ZW0uaWQ/LlMgPz8gYCR7dXNlcklkfToke2l0ZW0uZGF0ZT8uUyA/PyBcIlwifWAsXG4gICAgICB1c2VySWQ6IGl0ZW0udXNlcklkPy5TID8/IHVzZXJJZCxcbiAgICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgICB3b3Jrb3V0OiBpdGVtLndvcmtvdXQ/LkJPT0wgPz8gZmFsc2UsXG4gICAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgc29kaXVtSW5zaWdodChlbnRyaWVzKSxcbiAgICBhbGNvaG9sSW5zaWdodChlbnRyaWVzKSxcbiAgICBsYXRlU25hY2tJbnNpZ2h0KGVudHJpZXMpLFxuICAgIHBsYXRlYXVJbnNpZ2h0KGVudHJpZXMpLFxuICBdLmZpbHRlcigoaW5zKTogaW5zIGlzIEluc2lnaHRDYXJkID0+IGlucyAhPT0gbnVsbCk7XG4gIGNvbnN0IHRvcCA9IFsuLi5uZXcgTWFwKGNhbmRpZGF0ZXMubWFwKChpdGVtKSA9PiBbaXRlbS5ydWxlSWQsIGl0ZW1dKSkudmFsdWVzKCldXG4gICAgLnNvcnQoKGEsIGIpID0+IGIucHJpb3JpdHkgLSBhLnByaW9yaXR5KVxuICAgIC5zbGljZSgwLCAzKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGluc2lnaHRzOiB0b3AgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJJTlNJR0hUX0ZFRURCQUNLX1RBQkxFX05BTUVcIiwgaW5zaWdodEZlZWRiYWNrVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfSk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBpbnNpZ2h0SWQgPSB0eXBlb2YgYm9keS5pbnNpZ2h0SWQgPT09IFwic3RyaW5nXCIgPyBib2R5Lmluc2lnaHRJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCB2b3RlID0gYm9keS52b3RlID09PSBcInVwXCIgfHwgYm9keS52b3RlID09PSBcImRvd25cIiA/IGJvZHkudm90ZSA6IG51bGw7XG4gIGlmICghaW5zaWdodElkIHx8ICF2b3RlKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBpbnNpZ2h0IGZlZWRiYWNrIHBheWxvYWRcIiB9KTtcbiAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBpbnNpZ2h0VHM6IHsgUzogYCR7dHN9IyR7aW5zaWdodElkfWAgfSxcbiAgICAgICAgaW5zaWdodElkOiB7IFM6IGluc2lnaHRJZCB9LFxuICAgICAgICB2b3RlOiB7IFM6IHZvdGUgfSxcbiAgICAgICAgdHM6IHsgUzogdHMgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW50cmllcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBmcm9tID0gcXVlcnk/LmZyb207XG4gIGNvbnN0IHRvID0gcXVlcnk/LnRvO1xuICBpZiAoZnJvbSAmJiAhaXNEYXRlU3RyaW5nKGZyb20pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmcm9tIGRhdGVcIiB9KTtcbiAgaWYgKHRvICYmICFpc0RhdGVTdHJpbmcodG8pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB0byBkYXRlXCIgfSk7XG5cbiAgY29uc3QgZXhwcmVzc2lvblZhbHVlczogUmVjb3JkPHN0cmluZywgeyBTOiBzdHJpbmcgfT4gPSB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH07XG4gIGxldCBrZXlDb25kaXRpb24gPSBcInVzZXJJZCA9IDp1c2VySWRcIjtcbiAgaWYgKGZyb20gJiYgdG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9IGVsc2UgaWYgKGZyb20pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlID49IDpmcm9tRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgfSBlbHNlIGlmICh0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPD0gOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9XG5cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IGtleUNvbmRpdGlvbixcbiAgICAgIC4uLihrZXlDb25kaXRpb24uaW5jbHVkZXMoXCIjZGF0ZVwiKVxuICAgICAgICA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSB9XG4gICAgICAgIDoge30pLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvblZhbHVlcyxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgcGhvdG9Vcmw6IGl0ZW0ucGhvdG9Vcmw/LlMgPz8gdW5kZWZpbmVkLFxuICAgIG5vdGVzOiBpdGVtLm5vdGVzPy5TID8/IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgIH0pLFxuICApO1xuXG4gIGlmICghb3V0Lkl0ZW0pIHtcbiAgICBjb25zdCBzZXR0aW5nczogU3RvcmVkU2V0dGluZ3MgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBnb2FsV2VpZ2h0OiA3MixcbiAgICAgIHN0YXJ0V2VpZ2h0OiA4NSxcbiAgICAgIHRhcmdldERhdGU6IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBcImtnXCIsXG4gICAgfTtcbiAgICBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLmdvYWxXZWlnaHQpIH0sXG4gICAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLnN0YXJ0V2VpZ2h0KSB9LFxuICAgICAgICAgIHRhcmdldERhdGU6IHsgUzogc2V0dGluZ3MudGFyZ2V0RGF0ZSB9LFxuICAgICAgICAgIHVuaXQ6IHsgUzogc2V0dGluZ3MudW5pdCB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4ganNvbigyMDAsIHtcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGdvYWxXZWlnaHQ6IHNldHRpbmdzLmdvYWxXZWlnaHQsXG4gICAgICAgIHN0YXJ0V2VpZ2h0OiBzZXR0aW5ncy5zdGFydFdlaWdodCxcbiAgICAgICAgdGFyZ2V0RGF0ZTogc2V0dGluZ3MudGFyZ2V0RGF0ZSxcbiAgICAgICAgdW5pdDogc2V0dGluZ3MudW5pdCxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogTnVtYmVyKG91dC5JdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpLFxuICAgICAgc3RhcnRXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSksXG4gICAgICB0YXJnZXREYXRlOiBvdXQuSXRlbS50YXJnZXREYXRlPy5TID8/IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBvdXQuSXRlbS51bml0Py5TID09PSBcImxic1wiID8gXCJsYnNcIiA6IFwia2dcIixcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBzZXR0aW5nczogZGF0YSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBjb250ZW50VHlwZSA9XG4gICAgdHlwZW9mIGJvZHkuY29udGVudFR5cGUgPT09IFwic3RyaW5nXCIgJiYgYm9keS5jb250ZW50VHlwZS5sZW5ndGggPiAwXG4gICAgICA/IGJvZHkuY29udGVudFR5cGVcbiAgICAgIDogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgY29uc3QgZXh0ZW5zaW9uID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwianBnXCI7XG4gIGNvbnN0IGRhdGUgPSBpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSA/IGJvZHkuZGF0ZSA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGtleSA9IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbGlzdENvZ25pdG9Vc2Vyc0ZvckFkbWluKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCBwb29sSWQgPSBnZXRSZXF1aXJlZEVudihcIlVTRVJfUE9PTF9JRFwiLCB1c2VyUG9vbElkRW52KTtcbiAgY29uc3QgdXNlcnM6IEFycmF5PHtcbiAgICBzdWI6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgZnVsbE5hbWU/OiBzdHJpbmc7XG4gICAgc3RhdHVzPzogc3RyaW5nO1xuICB9PiA9IFtdO1xuXG4gIGxldCBwYWdpbmF0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgZG8ge1xuICAgIGNvbnN0IG91dCA9IGF3YWl0IGNvZ25pdG9JZHAuc2VuZChcbiAgICAgIG5ldyBMaXN0VXNlcnNDb21tYW5kKHtcbiAgICAgICAgVXNlclBvb2xJZDogcG9vbElkLFxuICAgICAgICBMaW1pdDogNjAsXG4gICAgICAgIFBhZ2luYXRpb25Ub2tlbjogcGFnaW5hdGlvblRva2VuLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IHUgb2Ygb3V0LlVzZXJzID8/IFtdKSB7XG4gICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBhIG9mIHUuQXR0cmlidXRlcyA/PyBbXSkge1xuICAgICAgICBpZiAoYS5OYW1lICYmIGEuVmFsdWUpIGF0dHJzW2EuTmFtZV0gPSBhLlZhbHVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZnVsbE5hbWUgPSBhdHRycy5uYW1lO1xuICAgICAgY29uc3QgZ2l2ZW4gPSBhdHRycy5naXZlbl9uYW1lO1xuICAgICAgY29uc3QgZmlyc3ROYW1lID1cbiAgICAgICAgZ2l2ZW4gPz8gKGZ1bGxOYW1lID8gZnVsbE5hbWUudHJpbSgpLnNwbGl0KC9cXHMrLylbMF0gOiB1bmRlZmluZWQpO1xuICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgIHN1YjogYXR0cnMuc3ViID8/IHUuVXNlcm5hbWUgPz8gXCJcIixcbiAgICAgICAgZW1haWw6IGF0dHJzLmVtYWlsLFxuICAgICAgICBmaXJzdE5hbWUsXG4gICAgICAgIGZ1bGxOYW1lLFxuICAgICAgICBzdGF0dXM6IHUuVXNlclN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBwYWdpbmF0aW9uVG9rZW4gPSBvdXQuUGFnaW5hdGlvblRva2VuO1xuICB9IHdoaWxlIChwYWdpbmF0aW9uVG9rZW4pO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBjb3VudDogdXNlcnMubGVuZ3RoLCB1c2VycyB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHVzZXJJZCA9IGdldFVzZXJJZChldmVudCk7XG4gICAgaWYgKCF1c2VySWQpIHJldHVybiBqc29uKDQwMSwgeyBlcnJvcjogXCJVbmF1dGhvcml6ZWRcIiB9KTtcbiAgICBjb25zdCBtZXRob2QgPSAoXG4gICAgICBldmVudCBhcyB7IHJlcXVlc3RDb250ZXh0PzogeyBodHRwPzogeyBtZXRob2Q/OiBzdHJpbmcgfSB9IH1cbiAgICApLnJlcXVlc3RDb250ZXh0Py5odHRwPy5tZXRob2Q7XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZW50cmllc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRFbnRyaWVzKHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgICAgcmV0dXJuIHVwc2VydEVudHJ5KHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgICByZXR1cm4gZGVsZXRlRW50cnkodXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zZXR0aW5nc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRTZXR0aW5ncyh1c2VySWQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICAgIHJldHVybiBwYXRjaFNldHRpbmdzKHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvdjIvaW5zaWdodHNcIiAmJiBtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBnZXRJbnNpZ2h0c1YyKHVzZXJJZCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3YyL2luc2lnaHRzL2ZlZWRiYWNrXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIHNhdmVJbnNpZ2h0RmVlZGJhY2sodXNlcklkLCBldmVudCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL2FkbWluL3VzZXJzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICBpZiAoIShhd2FpdCBpc0FkbWluQWxsb3dlZChldmVudCkpKSB7XG4gICAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb3JiaWRkZW5cIiB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19