"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const ddb = new client_dynamodb_1.DynamoDBClient({});
const s3 = new client_s3_1.S3Client({});
const entriesTableName = process.env.ENTRIES_TABLE_NAME;
const settingsTableName = process.env.SETTINGS_TABLE_NAME;
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
const uploadUrlTtlSeconds = Number(process.env.UPLOAD_URL_TTL_SECONDS ?? "900");
const downloadUrlTtlSeconds = Number(process.env.DOWNLOAD_URL_TTL_SECONDS ?? "3600");
const analyticsMetaUserId = "__meta__";
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
function getUserId(event) {
    return event.requestContext?.authorizer?.jwt?.claims?.sub;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyaEJBLDBCQWlEQztBQTVrQkQsOERBUWtDO0FBQ2xDLGtEQUFrRjtBQUNsRix3RUFBNkQ7QUFFN0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ25DLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUU1QixNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNoRixNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLE1BQU0sQ0FBQyxDQUFDO0FBQ3JGLE1BQU0sbUJBQW1CLEdBQUcsVUFBVSxDQUFDO0FBMER2QyxTQUFTLElBQUksQ0FBQyxVQUFrQixFQUFFLE9BQWdCO0lBQ2hELE9BQU87UUFDTCxVQUFVO1FBQ1YsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO1FBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztLQUM5QixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLElBQVksRUFBRSxLQUF5QjtJQUM3RCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDWCxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixJ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QUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgRHluYW1vREJDbGllbnQsXG4gIERlbGV0ZUl0ZW1Db21tYW5kLFxuICBHZXRJdGVtQ29tbWFuZCxcbiAgUHV0SXRlbUNvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbiAgU2NhbkNvbW1hbmQsXG4gIFVwZGF0ZUl0ZW1Db21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtczNcIjtcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gXCJAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lclwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuXG5jb25zdCBlbnRyaWVzVGFibGVOYW1lID0gcHJvY2Vzcy5lbnYuRU5UUklFU19UQUJMRV9OQU1FO1xuY29uc3Qgc2V0dGluZ3NUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5TRVRUSU5HU19UQUJMRV9OQU1FO1xuY29uc3QgcGhvdG9CdWNrZXROYW1lID0gcHJvY2Vzcy5lbnYuUEhPVE9fQlVDS0VUX05BTUU7XG5jb25zdCB1cGxvYWRVcmxUdGxTZWNvbmRzID0gTnVtYmVyKHByb2Nlc3MuZW52LlVQTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCI5MDBcIik7XG5jb25zdCBkb3dubG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuRE9XTkxPQURfVVJMX1RUTF9TRUNPTkRTID8/IFwiMzYwMFwiKTtcbmNvbnN0IGFuYWx5dGljc01ldGFVc2VySWQgPSBcIl9fbWV0YV9fXCI7XG5cbnR5cGUgQ2xhaW1zID0ge1xuICBzdWI6IHN0cmluZztcbiAgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn07XG5cbnR5cGUgSHR0cEV2ZW50ID0ge1xuICByYXdQYXRoOiBzdHJpbmc7XG4gIHJlcXVlc3RDb250ZXh0Pzoge1xuICAgIGF1dGhvcml6ZXI/OiB7XG4gICAgICBqd3Q/OiB7XG4gICAgICAgIGNsYWltcz86IENsYWltcztcbiAgICAgIH07XG4gICAgfTtcbiAgfTtcbiAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGw7XG4gIGJvZHk/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBIdHRwUmVzdWx0ID0ge1xuICBzdGF0dXNDb2RlOiBudW1iZXI7XG4gIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICBib2R5OiBzdHJpbmc7XG59O1xuXG50eXBlIERhaWx5RW50cnlVcHNlcnQgPSB7XG4gIGRhdGU6IHN0cmluZztcbiAgbW9ybmluZ1dlaWdodDogbnVtYmVyO1xuICBuaWdodFdlaWdodD86IG51bWJlciB8IG51bGw7XG4gIGNhbG9yaWVzPzogbnVtYmVyO1xuICBwcm90ZWluPzogbnVtYmVyO1xuICBzdGVwcz86IG51bWJlcjtcbiAgc2xlZXA/OiBudW1iZXI7XG4gIGxhdGVTbmFjazogYm9vbGVhbjtcbiAgaGlnaFNvZGl1bTogYm9vbGVhbjtcbiAgd29ya291dDogYm9vbGVhbjtcbiAgYWxjb2hvbDogYm9vbGVhbjtcbiAgcGhvdG9Vcmw/OiBzdHJpbmcgfCBudWxsO1xuICBub3Rlcz86IHN0cmluZyB8IG51bGw7XG59O1xuXG50eXBlIFNldHRpbmdzUGF0Y2ggPSB7XG4gIGdvYWxXZWlnaHQ6IG51bWJlcjtcbiAgc3RhcnRXZWlnaHQ6IG51bWJlcjtcbiAgdGFyZ2V0RGF0ZTogc3RyaW5nO1xuICB1bml0OiBcImtnXCIgfCBcImxic1wiO1xufTtcblxudHlwZSBTdG9yZWRFbnRyeSA9IERhaWx5RW50cnlVcHNlcnQgJiB7XG4gIGlkOiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxudHlwZSBTdG9yZWRTZXR0aW5ncyA9IFNldHRpbmdzUGF0Y2ggJiB7XG4gIHVzZXJJZDogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRFbnYobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyByZXF1aXJlZCBlbnYgdmFyICR7bmFtZX1gKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBKU09OXCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc1Bvc2l0aXZlTnVtYmVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMDtcbn1cblxuZnVuY3Rpb24gaXNOb25OZWdhdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwO1xufVxuXG5mdW5jdGlvbiBpc0ludE5vbk5lZ2F0aXZlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWUpO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUVudHJ5KGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogRGFpbHlFbnRyeVVwc2VydCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5tb3JuaW5nV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG1vcm5pbmdXZWlnaHRcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkubGF0ZVNuYWNrICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGxhdGVTbmFja1wiIH07XG4gIGlmICh0eXBlb2YgYm9keS5oaWdoU29kaXVtICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGhpZ2hTb2RpdW1cIiB9O1xuICBpZiAodHlwZW9mIGJvZHkud29ya291dCAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB3b3Jrb3V0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmFsY29ob2wgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgYWxjb2hvbFwiIH07XG5cbiAgaWYgKFxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubmlnaHRXZWlnaHQgIT09IG51bGwgJiZcbiAgICAhaXNQb3NpdGl2ZU51bWJlcihib2R5Lm5pZ2h0V2VpZ2h0KVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmlnaHRXZWlnaHRcIiB9O1xuICB9XG5cbiAgaWYgKGJvZHkuY2Fsb3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LmNhbG9yaWVzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBjYWxvcmllc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkucHJvdGVpbiAhPT0gdW5kZWZpbmVkICYmICFpc0ludE5vbk5lZ2F0aXZlKGJvZHkucHJvdGVpbikpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcHJvdGVpblwiIH07XG4gIH1cbiAgaWYgKGJvZHkuc3RlcHMgIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnN0ZXBzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGVwc1wiIH07XG4gIH1cbiAgaWYgKGJvZHkuc2xlZXAgIT09IHVuZGVmaW5lZCAmJiAhaXNOb25OZWdhdGl2ZU51bWJlcihib2R5LnNsZWVwKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzbGVlcFwiIH07XG4gIH1cblxuICBpZiAoXG4gICAgYm9keS5waG90b1VybCAhPT0gdW5kZWZpbmVkICYmXG4gICAgYm9keS5waG90b1VybCAhPT0gbnVsbCAmJlxuICAgICh0eXBlb2YgYm9keS5waG90b1VybCAhPT0gXCJzdHJpbmdcIiB8fCBib2R5LnBob3RvVXJsLmxlbmd0aCA+IDYwMF8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBwaG90b1VybFwiIH07XG4gIH1cbiAgaWYgKFxuICAgIGJvZHkubm90ZXMgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkubm90ZXMgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkubm90ZXMgIT09IFwic3RyaW5nXCIgfHwgYm9keS5ub3Rlcy5sZW5ndGggPiAyXzAwMClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5vdGVzXCIgfTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZGF0ZTogYm9keS5kYXRlLFxuICAgICAgbW9ybmluZ1dlaWdodDogYm9keS5tb3JuaW5nV2VpZ2h0LFxuICAgICAgbmlnaHRXZWlnaHQ6IChib2R5Lm5pZ2h0V2VpZ2h0IGFzIG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIGNhbG9yaWVzOiBib2R5LmNhbG9yaWVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcbiAgICAgIHByb3RlaW46IGJvZHkucHJvdGVpbiBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzdGVwczogYm9keS5zdGVwcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBzbGVlcDogYm9keS5zbGVlcCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBsYXRlU25hY2s6IGJvZHkubGF0ZVNuYWNrIGFzIGJvb2xlYW4sXG4gICAgICBoaWdoU29kaXVtOiBib2R5LmhpZ2hTb2RpdW0gYXMgYm9vbGVhbixcbiAgICAgIHdvcmtvdXQ6IGJvZHkud29ya291dCBhcyBib29sZWFuLFxuICAgICAgYWxjb2hvbDogYm9keS5hbGNvaG9sIGFzIGJvb2xlYW4sXG4gICAgICBwaG90b1VybDogKGJvZHkucGhvdG9VcmwgYXMgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCkgPz8gdW5kZWZpbmVkLFxuICAgICAgbm90ZXM6IChib2R5Lm5vdGVzIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVNldHRpbmdzKGlucHV0OiB1bmtub3duKTogeyBvazogdHJ1ZTsgZGF0YTogU2V0dGluZ3NQYXRjaCB9IHwgeyBvazogZmFsc2U7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJCb2R5IG11c3QgYmUgYW4gb2JqZWN0XCIgfTtcbiAgfVxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LmdvYWxXZWlnaHQpKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgZ29hbFdlaWdodFwiIH07XG4gIGlmICghaXNQb3NpdGl2ZU51bWJlcihib2R5LnN0YXJ0V2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXJ0V2VpZ2h0XCIgfTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoYm9keS50YXJnZXREYXRlKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHRhcmdldERhdGVcIiB9O1xuICBpZiAoYm9keS51bml0ICE9PSBcImtnXCIgJiYgYm9keS51bml0ICE9PSBcImxic1wiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgdW5pdFwiIH07XG4gIHJldHVybiB7XG4gICAgb2s6IHRydWUsXG4gICAgZGF0YToge1xuICAgICAgZ29hbFdlaWdodDogYm9keS5nb2FsV2VpZ2h0LFxuICAgICAgc3RhcnRXZWlnaHQ6IGJvZHkuc3RhcnRXZWlnaHQsXG4gICAgICB0YXJnZXREYXRlOiBib2R5LnRhcmdldERhdGUsXG4gICAgICB1bml0OiBib2R5LnVuaXQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0VXNlcklkKGV2ZW50OiBIdHRwRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICByZXR1cm4gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/Lmp3dD8uY2xhaW1zPy5zdWI7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRUYXJnZXREYXRlKCk6IHN0cmluZyB7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICBkLnNldERhdGUoZC5nZXREYXRlKCkgKyAxMTgpO1xuICByZXR1cm4gZC50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UocGhvdG9Vcmw6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIXBob3RvVXJsIHx8IHR5cGVvZiBwaG90b1VybCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgaWYgKHBob3RvVXJsLnN0YXJ0c1dpdGgoXCJzMzovL1wiKSkgcmV0dXJuIHBob3RvVXJsO1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocGhvdG9VcmwpO1xuICAgIGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXRoID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpKTtcbiAgICBpZiAoIXBhdGgpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICAvLyBWaXJ0dWFsLWhvc3RlZC1zdHlsZSBVUkw6IGJ1Y2tldC5zMy48cmVnaW9uPi5hbWF6b25hd3MuY29tL2tleVxuICAgIGNvbnN0IHZpcnR1YWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLyk7XG4gICAgaWYgKHZpcnR1YWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7dmlydHVhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gTGVnYWN5IGdsb2JhbCBlbmRwb2ludDogYnVja2V0LnMzLmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgZ2xvYmFsSG9zdGVkID0gaG9zdC5tYXRjaCgvXiguKylcXC5zM1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAoZ2xvYmFsSG9zdGVkPy5bMV0pIHtcbiAgICAgIHJldHVybiBgczM6Ly8ke2dsb2JhbEhvc3RlZFsxXX0vJHtwYXRofWA7XG4gICAgfVxuXG4gICAgLy8gUGF0aC1zdHlsZSBVUkw6IHMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20vYnVja2V0L2tleVxuICAgIGlmICgvXnMzWy4tXVthLXowLTktXStcXC5hbWF6b25hd3NcXC5jb20kLy50ZXN0KGhvc3QpIHx8IGhvc3QgPT09IFwiczMuYW1hem9uYXdzLmNvbVwiKSB7XG4gICAgICBjb25zdCBzbGFzaCA9IHBhdGguaW5kZXhPZihcIi9cIik7XG4gICAgICBpZiAoc2xhc2ggPD0gMCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IHBhdGguc2xpY2UoMCwgc2xhc2gpO1xuICAgICAgY29uc3Qga2V5ID0gcGF0aC5zbGljZShzbGFzaCArIDEpO1xuICAgICAgaWYgKCFidWNrZXQgfHwgIWtleSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIHJldHVybiBgczM6Ly8ke2J1Y2tldH0vJHtrZXl9YDtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW50cmllcyh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBmcm9tID0gcXVlcnk/LmZyb207XG4gIGNvbnN0IHRvID0gcXVlcnk/LnRvO1xuICBpZiAoZnJvbSAmJiAhaXNEYXRlU3RyaW5nKGZyb20pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmcm9tIGRhdGVcIiB9KTtcbiAgaWYgKHRvICYmICFpc0RhdGVTdHJpbmcodG8pKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCB0byBkYXRlXCIgfSk7XG5cbiAgY29uc3QgZXhwcmVzc2lvblZhbHVlczogUmVjb3JkPHN0cmluZywgeyBTOiBzdHJpbmcgfT4gPSB7IFwiOnVzZXJJZFwiOiB7IFM6IHVzZXJJZCB9IH07XG4gIGxldCBrZXlDb25kaXRpb24gPSBcInVzZXJJZCA9IDp1c2VySWRcIjtcbiAgaWYgKGZyb20gJiYgdG8pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlIEJFVFdFRU4gOmZyb21EYXRlIEFORCA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9IGVsc2UgaWYgKGZyb20pIHtcbiAgICBrZXlDb25kaXRpb24gKz0gXCIgQU5EICNkYXRlID49IDpmcm9tRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6ZnJvbURhdGVcIl0gPSB7IFM6IGZyb20gfTtcbiAgfSBlbHNlIGlmICh0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPD0gOnRvRGF0ZVwiO1xuICAgIGV4cHJlc3Npb25WYWx1ZXNbXCI6dG9EYXRlXCJdID0geyBTOiB0byB9O1xuICB9XG5cbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IGtleUNvbmRpdGlvbixcbiAgICAgIC4uLihrZXlDb25kaXRpb24uaW5jbHVkZXMoXCIjZGF0ZVwiKVxuICAgICAgICA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI2RhdGVcIjogXCJkYXRlXCIgfSB9XG4gICAgICAgIDoge30pLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogZXhwcmVzc2lvblZhbHVlcyxcbiAgICAgIFNjYW5JbmRleEZvcndhcmQ6IHRydWUsXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzOiBTdG9yZWRFbnRyeVtdID0gKG91dC5JdGVtcyA/PyBbXSkubWFwKFxuICAgIChpdGVtOiBSZWNvcmQ8c3RyaW5nLCB7IFM/OiBzdHJpbmc7IE4/OiBzdHJpbmc7IEJPT0w/OiBib29sZWFuIH0+KSA9PiAoe1xuICAgIGlkOiBpdGVtLmlkPy5TID8/IGAke3VzZXJJZH06JHtpdGVtLmRhdGU/LlMgPz8gXCJcIn1gLFxuICAgIHVzZXJJZDogaXRlbS51c2VySWQ/LlMgPz8gdXNlcklkLFxuICAgIGRhdGU6IGl0ZW0uZGF0ZT8uUyA/PyBcIlwiLFxuICAgIG1vcm5pbmdXZWlnaHQ6IE51bWJlcihpdGVtLm1vcm5pbmdXZWlnaHQ/Lk4gPz8gMCksXG4gICAgbmlnaHRXZWlnaHQ6IGl0ZW0ubmlnaHRXZWlnaHQ/Lk4gPyBOdW1iZXIoaXRlbS5uaWdodFdlaWdodC5OKSA6IHVuZGVmaW5lZCxcbiAgICBjYWxvcmllczogaXRlbS5jYWxvcmllcz8uTiA/IE51bWJlcihpdGVtLmNhbG9yaWVzLk4pIDogdW5kZWZpbmVkLFxuICAgIHByb3RlaW46IGl0ZW0ucHJvdGVpbj8uTiA/IE51bWJlcihpdGVtLnByb3RlaW4uTikgOiB1bmRlZmluZWQsXG4gICAgc3RlcHM6IGl0ZW0uc3RlcHM/Lk4gPyBOdW1iZXIoaXRlbS5zdGVwcy5OKSA6IHVuZGVmaW5lZCxcbiAgICBzbGVlcDogaXRlbS5zbGVlcD8uTiA/IE51bWJlcihpdGVtLnNsZWVwLk4pIDogdW5kZWZpbmVkLFxuICAgIGxhdGVTbmFjazogaXRlbS5sYXRlU25hY2s/LkJPT0wgPz8gZmFsc2UsXG4gICAgaGlnaFNvZGl1bTogaXRlbS5oaWdoU29kaXVtPy5CT09MID8/IGZhbHNlLFxuICAgIHdvcmtvdXQ6IGl0ZW0ud29ya291dD8uQk9PTCA/PyBmYWxzZSxcbiAgICBhbGNvaG9sOiBpdGVtLmFsY29ob2w/LkJPT0wgPz8gZmFsc2UsXG4gICAgcGhvdG9Vcmw6IGl0ZW0ucGhvdG9Vcmw/LlMgPz8gdW5kZWZpbmVkLFxuICAgIG5vdGVzOiBpdGVtLm5vdGVzPy5TID8/IHVuZGVmaW5lZCxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBlbnRyaWVzV2l0aFNpZ25lZFBob3RvVXJsczogU3RvcmVkRW50cnlbXSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgIGVudHJpZXMubWFwKGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgY29uc3QgcGhvdG8gPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShlbnRyeS5waG90b1VybCk7XG4gICAgICBpZiAoIXBob3RvKSByZXR1cm4gZW50cnk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aXRob3V0U2NoZW1lID0gcGhvdG8uc2xpY2UoXCJzMzovL1wiLmxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGZpcnN0U2xhc2ggPSB3aXRob3V0U2NoZW1lLmluZGV4T2YoXCIvXCIpO1xuICAgICAgICBpZiAoZmlyc3RTbGFzaCA8PSAwKSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoMCwgZmlyc3RTbGFzaCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHdpdGhvdXRTY2hlbWUuc2xpY2UoZmlyc3RTbGFzaCArIDEpO1xuICAgICAgICBpZiAoIWtleSkgcmV0dXJuIGVudHJ5O1xuICAgICAgICBjb25zdCBzaWduZWRQaG90b1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0LCBLZXk6IGtleSB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogZG93bmxvYWRVcmxUdGxTZWNvbmRzIH0sXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB7IC4uLmVudHJ5LCBwaG90b1VybDogc2lnbmVkUGhvdG9VcmwgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZW50cnk7XG4gICAgICB9XG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJpZXM6IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB1cHNlcnRFbnRyeSh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIkVOVFJJRVNfVEFCTEVfTkFNRVwiLCBlbnRyaWVzVGFibGVOYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBwYXJzZWQgPSB2YWxpZGF0ZUVudHJ5KHBheWxvYWQpO1xuICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsIGRldGFpbHM6IHBhcnNlZC5lcnJvciB9KTtcbiAgY29uc3QgZGF0YSA9IHBhcnNlZC5kYXRhO1xuICBjb25zdCBpZCA9IGAke3VzZXJJZH06JHtkYXRhLmRhdGV9YDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF0ZTogeyBTOiBkYXRhLmRhdGUgfSxcbiAgICBpZDogeyBTOiBpZCB9LFxuICAgIG1vcm5pbmdXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEubW9ybmluZ1dlaWdodCkgfSxcbiAgICBsYXRlU25hY2s6IHsgQk9PTDogZGF0YS5sYXRlU25hY2sgfSxcbiAgICBoaWdoU29kaXVtOiB7IEJPT0w6IGRhdGEuaGlnaFNvZGl1bSB9LFxuICAgIHdvcmtvdXQ6IHsgQk9PTDogZGF0YS53b3Jrb3V0IH0sXG4gICAgYWxjb2hvbDogeyBCT09MOiBkYXRhLmFsY29ob2wgfSxcbiAgfTtcblxuICBpZiAoZGF0YS5uaWdodFdlaWdodCAhPT0gdW5kZWZpbmVkICYmIGRhdGEubmlnaHRXZWlnaHQgIT09IG51bGwpIHtcbiAgICBpdGVtLm5pZ2h0V2VpZ2h0ID0geyBOOiBTdHJpbmcoZGF0YS5uaWdodFdlaWdodCkgfTtcbiAgfVxuICBpZiAoZGF0YS5jYWxvcmllcyAhPT0gdW5kZWZpbmVkKSBpdGVtLmNhbG9yaWVzID0geyBOOiBTdHJpbmcoZGF0YS5jYWxvcmllcykgfTtcbiAgaWYgKGRhdGEucHJvdGVpbiAhPT0gdW5kZWZpbmVkKSBpdGVtLnByb3RlaW4gPSB7IE46IFN0cmluZyhkYXRhLnByb3RlaW4pIH07XG4gIGlmIChkYXRhLnN0ZXBzICE9PSB1bmRlZmluZWQpIGl0ZW0uc3RlcHMgPSB7IE46IFN0cmluZyhkYXRhLnN0ZXBzKSB9O1xuICBpZiAoZGF0YS5zbGVlcCAhPT0gdW5kZWZpbmVkKSBpdGVtLnNsZWVwID0geyBOOiBTdHJpbmcoZGF0YS5zbGVlcCkgfTtcbiAgY29uc3Qgbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlID0gbm9ybWFsaXplUGhvdG9SZWZlcmVuY2UoZGF0YS5waG90b1VybCk7XG4gIGlmIChub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UpIGl0ZW0ucGhvdG9VcmwgPSB7IFM6IG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSB9O1xuICBpZiAodHlwZW9mIGRhdGEubm90ZXMgPT09IFwic3RyaW5nXCIpIGl0ZW0ubm90ZXMgPSB7IFM6IGRhdGEubm90ZXMgfTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiBpdGVtIGFzIG5ldmVyLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBlbnRyeTogeyAuLi5kYXRhLCBpZCB9IH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFbnRyeSh1c2VySWQ6IHN0cmluZywgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBkYXRlID0gcXVlcnk/LmRhdGU7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRhdGUpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfSk7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IERlbGV0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZGF0ZTogeyBTOiBkYXRlIH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSwgZGF0ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3ModXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSB9LFxuICAgIH0pLFxuICApO1xuXG4gIGlmICghb3V0Lkl0ZW0pIHtcbiAgICBjb25zdCBzZXR0aW5nczogU3RvcmVkU2V0dGluZ3MgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBnb2FsV2VpZ2h0OiA3MixcbiAgICAgIHN0YXJ0V2VpZ2h0OiA4NSxcbiAgICAgIHRhcmdldERhdGU6IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBcImtnXCIsXG4gICAgfTtcbiAgICBhd2FpdCBkZGIuc2VuZChcbiAgICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLmdvYWxXZWlnaHQpIH0sXG4gICAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKHNldHRpbmdzLnN0YXJ0V2VpZ2h0KSB9LFxuICAgICAgICAgIHRhcmdldERhdGU6IHsgUzogc2V0dGluZ3MudGFyZ2V0RGF0ZSB9LFxuICAgICAgICAgIHVuaXQ6IHsgUzogc2V0dGluZ3MudW5pdCB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICByZXR1cm4ganNvbigyMDAsIHtcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGdvYWxXZWlnaHQ6IHNldHRpbmdzLmdvYWxXZWlnaHQsXG4gICAgICAgIHN0YXJ0V2VpZ2h0OiBzZXR0aW5ncy5zdGFydFdlaWdodCxcbiAgICAgICAgdGFyZ2V0RGF0ZTogc2V0dGluZ3MudGFyZ2V0RGF0ZSxcbiAgICAgICAgdW5pdDogc2V0dGluZ3MudW5pdCxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBzZXR0aW5nczoge1xuICAgICAgZ29hbFdlaWdodDogTnVtYmVyKG91dC5JdGVtLmdvYWxXZWlnaHQ/Lk4gPz8gNzIpLFxuICAgICAgc3RhcnRXZWlnaHQ6IE51bWJlcihvdXQuSXRlbS5zdGFydFdlaWdodD8uTiA/PyA4NSksXG4gICAgICB0YXJnZXREYXRlOiBvdXQuSXRlbS50YXJnZXREYXRlPy5TID8/IGRlZmF1bHRUYXJnZXREYXRlKCksXG4gICAgICB1bml0OiBvdXQuSXRlbS51bml0Py5TID09PSBcImxic1wiID8gXCJsYnNcIiA6IFwia2dcIixcbiAgICB9LFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGF0Y2hTZXR0aW5ncyh1c2VySWQ6IHN0cmluZywgZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlU2V0dGluZ3MocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG5cbiAgYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgSXRlbToge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIGdvYWxXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHsgTjogU3RyaW5nKGRhdGEuc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgIHRhcmdldERhdGU6IHsgUzogZGF0YS50YXJnZXREYXRlIH0sXG4gICAgICAgIHVuaXQ6IHsgUzogZGF0YS51bml0IH0sXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwgeyBzZXR0aW5nczogZGF0YSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IGJ1Y2tldCA9IGdldFJlcXVpcmVkRW52KFwiUEhPVE9fQlVDS0VUX05BTUVcIiwgcGhvdG9CdWNrZXROYW1lKTtcbiAgY29uc3QgcGF5bG9hZCA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBjb25zdCBib2R5ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIiA/IChwYXlsb2FkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA6IHt9O1xuICBjb25zdCBjb250ZW50VHlwZSA9XG4gICAgdHlwZW9mIGJvZHkuY29udGVudFR5cGUgPT09IFwic3RyaW5nXCIgJiYgYm9keS5jb250ZW50VHlwZS5sZW5ndGggPiAwXG4gICAgICA/IGJvZHkuY29udGVudFR5cGVcbiAgICAgIDogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgY29uc3QgZXh0ZW5zaW9uID1cbiAgICB0eXBlb2YgYm9keS5leHRlbnNpb24gPT09IFwic3RyaW5nXCIgJiYgL15bYS16QS1aMC05XSskLy50ZXN0KGJvZHkuZXh0ZW5zaW9uKVxuICAgICAgPyBib2R5LmV4dGVuc2lvbi50b0xvd2VyQ2FzZSgpXG4gICAgICA6IFwianBnXCI7XG4gIGNvbnN0IGRhdGUgPSBpc0RhdGVTdHJpbmcoYm9keS5kYXRlKSA/IGJvZHkuZGF0ZSA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IGtleSA9IGAke3VzZXJJZH0vJHtkYXRlfS8ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWA7XG5cbiAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICBCdWNrZXQ6IGJ1Y2tldCxcbiAgICBLZXk6IGtleSxcbiAgICBDb250ZW50VHlwZTogY29udGVudFR5cGUsXG4gIH0pO1xuICBjb25zdCB1cGxvYWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzIH0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVwbG9hZFVybCxcbiAgICBrZXksXG4gICAgcGhvdG9Vcmw6IGBzMzovLyR7YnVja2V0fS8ke2tleX1gLFxuICAgIGV4cGlyZXNJbjogdXBsb2FkVXJsVHRsU2Vjb25kcyxcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0YXRzKCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBbdXNlcnNPdXQsIHZpZXdzT3V0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBTY2FuQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBTZWxlY3Q6IFwiQ09VTlRcIixcbiAgICAgICAgRmlsdGVyRXhwcmVzc2lvbjogXCIjdWlkIDw+IDptZXRhVXNlcklkIEFORCBhdHRyaWJ1dGVfZXhpc3RzKGdvYWxXZWlnaHQpXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczogeyBcIiN1aWRcIjogXCJ1c2VySWRcIiB9LFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1ldGFVc2VySWRcIjogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gICAgZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIH0pLFxuICAgICksXG4gIF0pO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHVzZXJzOiBOdW1iZXIodXNlcnNPdXQuQ291bnQgPz8gMCksXG4gICAgcGFnZVZpZXdzOiBOdW1iZXIodmlld3NPdXQuSXRlbT8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5jcmVtZW50UGFnZVZpZXcoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogYW5hbHl0aWNzTWV0YVVzZXJJZCB9IH0sXG4gICAgICBVcGRhdGVFeHByZXNzaW9uOiBcIkFERCBwYWdlVmlld3MgOmluYyBTRVQgdXBkYXRlZEF0ID0gOnVwZGF0ZWRBdFwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjppbmNcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICBcIjp1cGRhdGVkQXRcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgICBSZXR1cm5WYWx1ZXM6IFwiVVBEQVRFRF9ORVdcIixcbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHtcbiAgICBwYWdlVmlld3M6IE51bWJlcihvdXQuQXR0cmlidXRlcz8ucGFnZVZpZXdzPy5OID8/IDApLFxuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEh0dHBFdmVudCk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHVzZXJJZCA9IGdldFVzZXJJZChldmVudCk7XG4gICAgaWYgKCF1c2VySWQpIHJldHVybiBqc29uKDQwMSwgeyBlcnJvcjogXCJVbmF1dGhvcml6ZWRcIiB9KTtcbiAgICBjb25zdCBtZXRob2QgPSAoXG4gICAgICBldmVudCBhcyB7IHJlcXVlc3RDb250ZXh0PzogeyBodHRwPzogeyBtZXRob2Q/OiBzdHJpbmcgfSB9IH1cbiAgICApLnJlcXVlc3RDb250ZXh0Py5odHRwPy5tZXRob2Q7XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvZW50cmllc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRFbnRyaWVzKHVzZXJJZCwgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzKTtcbiAgICAgIH1cbiAgICAgIGlmIChtZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgICAgcmV0dXJuIHVwc2VydEVudHJ5KHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJERUxFVEVcIikge1xuICAgICAgICByZXR1cm4gZGVsZXRlRW50cnkodXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zZXR0aW5nc1wiKSB7XG4gICAgICBpZiAobWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICAgIHJldHVybiBnZXRTZXR0aW5ncyh1c2VySWQpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQQVRDSFwiKSB7XG4gICAgICAgIHJldHVybiBwYXRjaFNldHRpbmdzKHVzZXJJZCwgZXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9zdGF0c1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgcmV0dXJuIGdldFN0YXRzKCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL21ldHJpY3MvcGFnZS12aWV3XCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGluY3JlbWVudFBhZ2VWaWV3KCk7XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3Bob3Rvcy91cGxvYWQtdXJsXCIgJiYgbWV0aG9kID09PSBcIlBPU1RcIikge1xuICAgICAgcmV0dXJuIGNyZWF0ZVVwbG9hZFVybCh1c2VySWQsIGV2ZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbig0MDQsIHsgZXJyb3I6IFwiTm90IEZvdW5kXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gXCJJbnZhbGlkIEpTT05cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmVycm9yKFwiTGFtYmRhIGhhbmRsZXIgZXJyb3JcIiwgZXJyb3IpO1xuICAgIHJldHVybiBqc29uKDUwMCwgeyBlcnJvcjogXCJJbnRlcm5hbCBTZXJ2ZXIgRXJyb3JcIiB9KTtcbiAgfVxufVxuIl19