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
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
const uploadUrlTtlSeconds = Number(process.env.UPLOAD_URL_TTL_SECONDS ?? "900");
const downloadUrlTtlSeconds = Number(process.env.DOWNLOAD_URL_TTL_SECONDS ?? "3600");
const analyticsMetaUserId = "__meta__";
const userPoolIdEnv = process.env.USER_POOL_ID;
const adminEmailsEnv = process.env.ADMIN_EMAILS ?? "";
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
function getCallerEmail(event) {
    const raw = event.requestContext?.authorizer?.jwt?.claims;
    if (!raw || typeof raw !== "object")
        return undefined;
    const claims = raw;
    const str = (k) => typeof claims[k] === "string" ? claims[k].trim().toLowerCase() : undefined;
    // Access token: usually `username` (email when email is the Cognito username). ID token: often `email`.
    const email = str("email");
    const username = str("username");
    const cognitoUsername = str("cognito:username");
    const preferred = str("preferred_username");
    return email ?? username ?? cognitoUsername ?? preferred;
}
function isAdminEmail(email) {
    if (!email)
        return false;
    const allow = adminEmailsEnv
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return allow.length > 0 && allow.includes(email);
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
        if (event.rawPath === "/admin/users" && method === "GET") {
            const callerEmail = getCallerEmail(event);
            if (!isAdminEmail(callerEmail)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC1hcGktaGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAtYXBpLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEybUJBLDBCQXlEQztBQXBxQkQsZ0dBR21EO0FBQ25ELDhEQVFrQztBQUNsQyxrREFBa0Y7QUFDbEYsd0VBQTZEO0FBRTdELE1BQU0sR0FBRyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNuQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxnRUFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUV6RCxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUM7QUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQzFELE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7QUFDdEQsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNoRixNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLE1BQU0sQ0FBQyxDQUFDO0FBQ3JGLE1BQU0sbUJBQW1CLEdBQUcsVUFBVSxDQUFDO0FBQ3ZDLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO0FBQy9DLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztBQTBEdEQsU0FBUyxJQUFJLENBQUMsVUFBa0IsRUFBRSxPQUFnQjtJQUNoRCxPQUFPO1FBQ0wsVUFBVTtRQUNWLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxr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LENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQsXG4gIExpc3RVc2Vyc0NvbW1hbmQsXG59IGZyb20gXCJAYXdzLXNkay9jbGllbnQtY29nbml0by1pZGVudGl0eS1wcm92aWRlclwiO1xuaW1wb3J0IHtcbiAgRHluYW1vREJDbGllbnQsXG4gIERlbGV0ZUl0ZW1Db21tYW5kLFxuICBHZXRJdGVtQ29tbWFuZCxcbiAgUHV0SXRlbUNvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbiAgU2NhbkNvbW1hbmQsXG4gIFVwZGF0ZUl0ZW1Db21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtczNcIjtcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gXCJAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lclwiO1xuXG5jb25zdCBkZGIgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgY29nbml0b0lkcCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5cbmNvbnN0IGVudHJpZXNUYWJsZU5hbWUgPSBwcm9jZXNzLmVudi5FTlRSSUVTX1RBQkxFX05BTUU7XG5jb25zdCBzZXR0aW5nc1RhYmxlTmFtZSA9IHByb2Nlc3MuZW52LlNFVFRJTkdTX1RBQkxFX05BTUU7XG5jb25zdCBwaG90b0J1Y2tldE5hbWUgPSBwcm9jZXNzLmVudi5QSE9UT19CVUNLRVRfTkFNRTtcbmNvbnN0IHVwbG9hZFVybFR0bFNlY29uZHMgPSBOdW1iZXIocHJvY2Vzcy5lbnYuVVBMT0FEX1VSTF9UVExfU0VDT05EUyA/PyBcIjkwMFwiKTtcbmNvbnN0IGRvd25sb2FkVXJsVHRsU2Vjb25kcyA9IE51bWJlcihwcm9jZXNzLmVudi5ET1dOTE9BRF9VUkxfVFRMX1NFQ09ORFMgPz8gXCIzNjAwXCIpO1xuY29uc3QgYW5hbHl0aWNzTWV0YVVzZXJJZCA9IFwiX19tZXRhX19cIjtcbmNvbnN0IHVzZXJQb29sSWRFbnYgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG5jb25zdCBhZG1pbkVtYWlsc0VudiA9IHByb2Nlc3MuZW52LkFETUlOX0VNQUlMUyA/PyBcIlwiO1xuXG50eXBlIENsYWltcyA9IHtcbiAgc3ViOiBzdHJpbmc7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd247XG59O1xuXG50eXBlIEh0dHBFdmVudCA9IHtcbiAgcmF3UGF0aDogc3RyaW5nO1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgand0Pzoge1xuICAgICAgICBjbGFpbXM/OiBDbGFpbXM7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xuICBib2R5Pzogc3RyaW5nIHwgbnVsbDtcbn07XG5cbnR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxudHlwZSBEYWlseUVudHJ5VXBzZXJ0ID0ge1xuICBkYXRlOiBzdHJpbmc7XG4gIG1vcm5pbmdXZWlnaHQ6IG51bWJlcjtcbiAgbmlnaHRXZWlnaHQ/OiBudW1iZXIgfCBudWxsO1xuICBjYWxvcmllcz86IG51bWJlcjtcbiAgcHJvdGVpbj86IG51bWJlcjtcbiAgc3RlcHM/OiBudW1iZXI7XG4gIHNsZWVwPzogbnVtYmVyO1xuICBsYXRlU25hY2s6IGJvb2xlYW47XG4gIGhpZ2hTb2RpdW06IGJvb2xlYW47XG4gIHdvcmtvdXQ6IGJvb2xlYW47XG4gIGFsY29ob2w6IGJvb2xlYW47XG4gIHBob3RvVXJsPzogc3RyaW5nIHwgbnVsbDtcbiAgbm90ZXM/OiBzdHJpbmcgfCBudWxsO1xufTtcblxudHlwZSBTZXR0aW5nc1BhdGNoID0ge1xuICBnb2FsV2VpZ2h0OiBudW1iZXI7XG4gIHN0YXJ0V2VpZ2h0OiBudW1iZXI7XG4gIHRhcmdldERhdGU6IHN0cmluZztcbiAgdW5pdDogXCJrZ1wiIHwgXCJsYnNcIjtcbn07XG5cbnR5cGUgU3RvcmVkRW50cnkgPSBEYWlseUVudHJ5VXBzZXJ0ICYge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbn07XG5cbnR5cGUgU3RvcmVkU2V0dGluZ3MgPSBTZXR0aW5nc1BhdGNoICYge1xuICB1c2VySWQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGpzb24oc3RhdHVzQ29kZTogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKTogSHR0cFJlc3VsdCB7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZSxcbiAgICBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFJlcXVpcmVkRW52KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcmVxdWlyZWQgZW52IHZhciAke25hbWV9YCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBwYXJzZUpzb25Cb2R5KGV2ZW50OiBIdHRwRXZlbnQpOiB1bmtub3duIHtcbiAgaWYgKCFldmVudC5ib2R5KSByZXR1cm4ge307XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gIH0gY2F0Y2gge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgSlNPTlwiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0RhdGVTdHJpbmcodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiICYmIC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gaXNQb3NpdGl2ZU51bWJlcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+IDA7XG59XG5cbmZ1bmN0aW9uIGlzTm9uTmVnYXRpdmVOdW1iZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPj0gMDtcbn1cblxuZnVuY3Rpb24gaXNJbnROb25OZWdhdGl2ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIG51bWJlciB7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiBpc05vbk5lZ2F0aXZlTnVtYmVyKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVFbnRyeShpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IERhaWx5RW50cnlVcHNlcnQgfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cblxuICBjb25zdCBib2R5ID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkuZGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBkYXRlXCIgfTtcbiAgaWYgKCFpc1Bvc2l0aXZlTnVtYmVyKGJvZHkubW9ybmluZ1dlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBtb3JuaW5nV2VpZ2h0XCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LmxhdGVTbmFjayAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBsYXRlU25hY2tcIiB9O1xuICBpZiAodHlwZW9mIGJvZHkuaGlnaFNvZGl1bSAhPT0gXCJib29sZWFuXCIpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBoaWdoU29kaXVtXCIgfTtcbiAgaWYgKHR5cGVvZiBib2R5LndvcmtvdXQgIT09IFwiYm9vbGVhblwiKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgd29ya291dFwiIH07XG4gIGlmICh0eXBlb2YgYm9keS5hbGNvaG9sICE9PSBcImJvb2xlYW5cIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGFsY29ob2xcIiB9O1xuXG4gIGlmIChcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5pZ2h0V2VpZ2h0ICE9PSBudWxsICYmXG4gICAgIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5uaWdodFdlaWdodClcbiAgKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5pZ2h0V2VpZ2h0XCIgfTtcbiAgfVxuXG4gIGlmIChib2R5LmNhbG9yaWVzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5jYWxvcmllcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgY2Fsb3JpZXNcIiB9O1xuICB9XG4gIGlmIChib2R5LnByb3RlaW4gIT09IHVuZGVmaW5lZCAmJiAhaXNJbnROb25OZWdhdGl2ZShib2R5LnByb3RlaW4pKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHByb3RlaW5cIiB9O1xuICB9XG4gIGlmIChib2R5LnN0ZXBzICE9PSB1bmRlZmluZWQgJiYgIWlzSW50Tm9uTmVnYXRpdmUoYm9keS5zdGVwcykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RlcHNcIiB9O1xuICB9XG4gIGlmIChib2R5LnNsZWVwICE9PSB1bmRlZmluZWQgJiYgIWlzTm9uTmVnYXRpdmVOdW1iZXIoYm9keS5zbGVlcCkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc2xlZXBcIiB9O1xuICB9XG5cbiAgaWYgKFxuICAgIGJvZHkucGhvdG9VcmwgIT09IHVuZGVmaW5lZCAmJlxuICAgIGJvZHkucGhvdG9VcmwgIT09IG51bGwgJiZcbiAgICAodHlwZW9mIGJvZHkucGhvdG9VcmwgIT09IFwic3RyaW5nXCIgfHwgYm9keS5waG90b1VybC5sZW5ndGggPiA2MDBfMDAwKVxuICApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgcGhvdG9VcmxcIiB9O1xuICB9XG4gIGlmIChcbiAgICBib2R5Lm5vdGVzICE9PSB1bmRlZmluZWQgJiZcbiAgICBib2R5Lm5vdGVzICE9PSBudWxsICYmXG4gICAgKHR5cGVvZiBib2R5Lm5vdGVzICE9PSBcInN0cmluZ1wiIHx8IGJvZHkubm90ZXMubGVuZ3RoID4gMl8wMDApXG4gICkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBub3Rlc1wiIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGRhdGU6IGJvZHkuZGF0ZSxcbiAgICAgIG1vcm5pbmdXZWlnaHQ6IGJvZHkubW9ybmluZ1dlaWdodCxcbiAgICAgIG5pZ2h0V2VpZ2h0OiAoYm9keS5uaWdodFdlaWdodCBhcyBudW1iZXIgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgICBjYWxvcmllczogYm9keS5jYWxvcmllcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG4gICAgICBwcm90ZWluOiBib2R5LnByb3RlaW4gYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc3RlcHM6IGJvZHkuc3RlcHMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgc2xlZXA6IGJvZHkuc2xlZXAgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuICAgICAgbGF0ZVNuYWNrOiBib2R5LmxhdGVTbmFjayBhcyBib29sZWFuLFxuICAgICAgaGlnaFNvZGl1bTogYm9keS5oaWdoU29kaXVtIGFzIGJvb2xlYW4sXG4gICAgICB3b3Jrb3V0OiBib2R5LndvcmtvdXQgYXMgYm9vbGVhbixcbiAgICAgIGFsY29ob2w6IGJvZHkuYWxjb2hvbCBhcyBib29sZWFuLFxuICAgICAgcGhvdG9Vcmw6IChib2R5LnBob3RvVXJsIGFzIHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpID8/IHVuZGVmaW5lZCxcbiAgICAgIG5vdGVzOiAoYm9keS5ub3RlcyBhcyBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKSA/PyB1bmRlZmluZWQsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTZXR0aW5ncyhpbnB1dDogdW5rbm93bik6IHsgb2s6IHRydWU7IGRhdGE6IFNldHRpbmdzUGF0Y2ggfSB8IHsgb2s6IGZhbHNlOyBlcnJvcjogc3RyaW5nIH0ge1xuICBpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gXCJvYmplY3RcIikge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiQm9keSBtdXN0IGJlIGFuIG9iamVjdFwiIH07XG4gIH1cbiAgY29uc3QgYm9keSA9IGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5nb2FsV2VpZ2h0KSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIGdvYWxXZWlnaHRcIiB9O1xuICBpZiAoIWlzUG9zaXRpdmVOdW1iZXIoYm9keS5zdGFydFdlaWdodCkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGFydFdlaWdodFwiIH07XG4gIGlmICghaXNEYXRlU3RyaW5nKGJvZHkudGFyZ2V0RGF0ZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCB0YXJnZXREYXRlXCIgfTtcbiAgaWYgKGJvZHkudW5pdCAhPT0gXCJrZ1wiICYmIGJvZHkudW5pdCAhPT0gXCJsYnNcIikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHVuaXRcIiB9O1xuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGRhdGE6IHtcbiAgICAgIGdvYWxXZWlnaHQ6IGJvZHkuZ29hbFdlaWdodCxcbiAgICAgIHN0YXJ0V2VpZ2h0OiBib2R5LnN0YXJ0V2VpZ2h0LFxuICAgICAgdGFyZ2V0RGF0ZTogYm9keS50YXJnZXREYXRlLFxuICAgICAgdW5pdDogYm9keS51bml0LFxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGdldFVzZXJJZChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgcmV0dXJuIGV2ZW50LnJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5qd3Q/LmNsYWltcz8uc3ViO1xufVxuXG5mdW5jdGlvbiBnZXRDYWxsZXJFbWFpbChldmVudDogSHR0cEV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgcmF3ID0gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/Lmp3dD8uY2xhaW1zO1xuICBpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSBcIm9iamVjdFwiKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBjbGFpbXMgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IHN0ciA9IChrOiBzdHJpbmcpID0+XG4gICAgdHlwZW9mIGNsYWltc1trXSA9PT0gXCJzdHJpbmdcIiA/IChjbGFpbXNba10gYXMgc3RyaW5nKS50cmltKCkudG9Mb3dlckNhc2UoKSA6IHVuZGVmaW5lZDtcbiAgLy8gQWNjZXNzIHRva2VuOiB1c3VhbGx5IGB1c2VybmFtZWAgKGVtYWlsIHdoZW4gZW1haWwgaXMgdGhlIENvZ25pdG8gdXNlcm5hbWUpLiBJRCB0b2tlbjogb2Z0ZW4gYGVtYWlsYC5cbiAgY29uc3QgZW1haWwgPSBzdHIoXCJlbWFpbFwiKTtcbiAgY29uc3QgdXNlcm5hbWUgPSBzdHIoXCJ1c2VybmFtZVwiKTtcbiAgY29uc3QgY29nbml0b1VzZXJuYW1lID0gc3RyKFwiY29nbml0bzp1c2VybmFtZVwiKTtcbiAgY29uc3QgcHJlZmVycmVkID0gc3RyKFwicHJlZmVycmVkX3VzZXJuYW1lXCIpO1xuICByZXR1cm4gZW1haWwgPz8gdXNlcm5hbWUgPz8gY29nbml0b1VzZXJuYW1lID8/IHByZWZlcnJlZDtcbn1cblxuZnVuY3Rpb24gaXNBZG1pbkVtYWlsKGVtYWlsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcbiAgaWYgKCFlbWFpbCkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBhbGxvdyA9IGFkbWluRW1haWxzRW52XG4gICAgLnNwbGl0KFwiLFwiKVxuICAgIC5tYXAoKHMpID0+IHMudHJpbSgpLnRvTG93ZXJDYXNlKCkpXG4gICAgLmZpbHRlcihCb29sZWFuKTtcbiAgcmV0dXJuIGFsbG93Lmxlbmd0aCA+IDAgJiYgYWxsb3cuaW5jbHVkZXMoZW1haWwpO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0VGFyZ2V0RGF0ZSgpOiBzdHJpbmcge1xuICBjb25zdCBkID0gbmV3IERhdGUoKTtcbiAgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpICsgMTE4KTtcbiAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKHBob3RvVXJsOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFwaG90b1VybCB8fCB0eXBlb2YgcGhvdG9VcmwgIT09IFwic3RyaW5nXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmIChwaG90b1VybC5zdGFydHNXaXRoKFwiczM6Ly9cIikpIHJldHVybiBwaG90b1VybDtcbiAgaWYgKCFwaG90b1VybC5pbmNsdWRlcyhcIjovL1wiKSkge1xuICAgIGNvbnN0IGtleU9ubHkgPSBwaG90b1VybC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGlmICgha2V5T25seSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBpZiAocGhvdG9CdWNrZXROYW1lKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHtwaG90b0J1Y2tldE5hbWV9LyR7a2V5T25seX1gO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTChwaG90b1VybCk7XG4gICAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQocGFyc2VkLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgXCJcIikpO1xuICAgIGlmICghcGF0aCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIC8vIFZpcnR1YWwtaG9zdGVkLXN0eWxlIFVSTDogYnVja2V0LnMzLjxyZWdpb24+LmFtYXpvbmF3cy5jb20va2V5XG4gICAgY29uc3QgdmlydHVhbEhvc3RlZCA9IGhvc3QubWF0Y2goL14oLispXFwuczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvKTtcbiAgICBpZiAodmlydHVhbEhvc3RlZD8uWzFdKSB7XG4gICAgICByZXR1cm4gYHMzOi8vJHt2aXJ0dWFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBMZWdhY3kgZ2xvYmFsIGVuZHBvaW50OiBidWNrZXQuczMuYW1hem9uYXdzLmNvbS9rZXlcbiAgICBjb25zdCBnbG9iYWxIb3N0ZWQgPSBob3N0Lm1hdGNoKC9eKC4rKVxcLnMzXFwuYW1hem9uYXdzXFwuY29tJC8pO1xuICAgIGlmIChnbG9iYWxIb3N0ZWQ/LlsxXSkge1xuICAgICAgcmV0dXJuIGBzMzovLyR7Z2xvYmFsSG9zdGVkWzFdfS8ke3BhdGh9YDtcbiAgICB9XG5cbiAgICAvLyBQYXRoLXN0eWxlIFVSTDogczMuPHJlZ2lvbj4uYW1hem9uYXdzLmNvbS9idWNrZXQva2V5XG4gICAgaWYgKC9eczNbLi1dW2EtejAtOS1dK1xcLmFtYXpvbmF3c1xcLmNvbSQvLnRlc3QoaG9zdCkgfHwgaG9zdCA9PT0gXCJzMy5hbWF6b25hd3MuY29tXCIpIHtcbiAgICAgIGNvbnN0IHNsYXNoID0gcGF0aC5pbmRleE9mKFwiL1wiKTtcbiAgICAgIGlmIChzbGFzaCA8PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgY29uc3QgYnVja2V0ID0gcGF0aC5zbGljZSgwLCBzbGFzaCk7XG4gICAgICBjb25zdCBrZXkgPSBwYXRoLnNsaWNlKHNsYXNoICsgMSk7XG4gICAgICBpZiAoIWJ1Y2tldCB8fCAha2V5KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgcmV0dXJuIGBzMzovLyR7YnVja2V0fS8ke2tleX1gO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRFbnRyaWVzKHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGZyb20gPSBxdWVyeT8uZnJvbTtcbiAgY29uc3QgdG8gPSBxdWVyeT8udG87XG4gIGlmIChmcm9tICYmICFpc0RhdGVTdHJpbmcoZnJvbSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGZyb20gZGF0ZVwiIH0pO1xuICBpZiAodG8gJiYgIWlzRGF0ZVN0cmluZyh0bykpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIHRvIGRhdGVcIiB9KTtcblxuICBjb25zdCBleHByZXNzaW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB7IFM6IHN0cmluZyB9PiA9IHsgXCI6dXNlcklkXCI6IHsgUzogdXNlcklkIH0gfTtcbiAgbGV0IGtleUNvbmRpdGlvbiA9IFwidXNlcklkID0gOnVzZXJJZFwiO1xuICBpZiAoZnJvbSAmJiB0bykge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgQkVUV0VFTiA6ZnJvbURhdGUgQU5EIDp0b0RhdGVcIjtcbiAgICBleHByZXNzaW9uVmFsdWVzW1wiOmZyb21EYXRlXCJdID0geyBTOiBmcm9tIH07XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH0gZWxzZSBpZiAoZnJvbSkge1xuICAgIGtleUNvbmRpdGlvbiArPSBcIiBBTkQgI2RhdGUgPj0gOmZyb21EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjpmcm9tRGF0ZVwiXSA9IHsgUzogZnJvbSB9O1xuICB9IGVsc2UgaWYgKHRvKSB7XG4gICAga2V5Q29uZGl0aW9uICs9IFwiIEFORCAjZGF0ZSA8PSA6dG9EYXRlXCI7XG4gICAgZXhwcmVzc2lvblZhbHVlc1tcIjp0b0RhdGVcIl0gPSB7IFM6IHRvIH07XG4gIH1cblxuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjoga2V5Q29uZGl0aW9uLFxuICAgICAgLi4uKGtleUNvbmRpdGlvbi5pbmNsdWRlcyhcIiNkYXRlXCIpXG4gICAgICAgID8geyBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHsgXCIjZGF0ZVwiOiBcImRhdGVcIiB9IH1cbiAgICAgICAgOiB7fSksXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiBleHByZXNzaW9uVmFsdWVzLFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogdHJ1ZSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXM6IFN0b3JlZEVudHJ5W10gPSAob3V0Lkl0ZW1zID8/IFtdKS5tYXAoXG4gICAgKGl0ZW06IFJlY29yZDxzdHJpbmcsIHsgUz86IHN0cmluZzsgTj86IHN0cmluZzsgQk9PTD86IGJvb2xlYW4gfT4pID0+ICh7XG4gICAgaWQ6IGl0ZW0uaWQ/LlMgPz8gYCR7dXNlcklkfToke2l0ZW0uZGF0ZT8uUyA/PyBcIlwifWAsXG4gICAgdXNlcklkOiBpdGVtLnVzZXJJZD8uUyA/PyB1c2VySWQsXG4gICAgZGF0ZTogaXRlbS5kYXRlPy5TID8/IFwiXCIsXG4gICAgbW9ybmluZ1dlaWdodDogTnVtYmVyKGl0ZW0ubW9ybmluZ1dlaWdodD8uTiA/PyAwKSxcbiAgICBuaWdodFdlaWdodDogaXRlbS5uaWdodFdlaWdodD8uTiA/IE51bWJlcihpdGVtLm5pZ2h0V2VpZ2h0Lk4pIDogdW5kZWZpbmVkLFxuICAgIGNhbG9yaWVzOiBpdGVtLmNhbG9yaWVzPy5OID8gTnVtYmVyKGl0ZW0uY2Fsb3JpZXMuTikgOiB1bmRlZmluZWQsXG4gICAgcHJvdGVpbjogaXRlbS5wcm90ZWluPy5OID8gTnVtYmVyKGl0ZW0ucHJvdGVpbi5OKSA6IHVuZGVmaW5lZCxcbiAgICBzdGVwczogaXRlbS5zdGVwcz8uTiA/IE51bWJlcihpdGVtLnN0ZXBzLk4pIDogdW5kZWZpbmVkLFxuICAgIHNsZWVwOiBpdGVtLnNsZWVwPy5OID8gTnVtYmVyKGl0ZW0uc2xlZXAuTikgOiB1bmRlZmluZWQsXG4gICAgbGF0ZVNuYWNrOiBpdGVtLmxhdGVTbmFjaz8uQk9PTCA/PyBmYWxzZSxcbiAgICBoaWdoU29kaXVtOiBpdGVtLmhpZ2hTb2RpdW0/LkJPT0wgPz8gZmFsc2UsXG4gICAgd29ya291dDogaXRlbS53b3Jrb3V0Py5CT09MID8/IGZhbHNlLFxuICAgIGFsY29ob2w6IGl0ZW0uYWxjb2hvbD8uQk9PTCA/PyBmYWxzZSxcbiAgICBwaG90b1VybDogaXRlbS5waG90b1VybD8uUyA/PyB1bmRlZmluZWQsXG4gICAgbm90ZXM6IGl0ZW0ubm90ZXM/LlMgPz8gdW5kZWZpbmVkLFxuICAgIH0pLFxuICApO1xuXG4gIGNvbnN0IGVudHJpZXNXaXRoU2lnbmVkUGhvdG9VcmxzOiBTdG9yZWRFbnRyeVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBwaG90byA9IG5vcm1hbGl6ZVBob3RvUmVmZXJlbmNlKGVudHJ5LnBob3RvVXJsKTtcbiAgICAgIGlmICghcGhvdG8pIHJldHVybiBlbnRyeTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdpdGhvdXRTY2hlbWUgPSBwaG90by5zbGljZShcInMzOi8vXCIubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgZmlyc3RTbGFzaCA9IHdpdGhvdXRTY2hlbWUuaW5kZXhPZihcIi9cIik7XG4gICAgICAgIGlmIChmaXJzdFNsYXNoIDw9IDApIHJldHVybiBlbnRyeTtcbiAgICAgICAgY29uc3QgYnVja2V0ID0gd2l0aG91dFNjaGVtZS5zbGljZSgwLCBmaXJzdFNsYXNoKTtcbiAgICAgICAgY29uc3Qga2V5ID0gd2l0aG91dFNjaGVtZS5zbGljZShmaXJzdFNsYXNoICsgMSk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4gZW50cnk7XG4gICAgICAgIGNvbnN0IHNpZ25lZFBob3RvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHsgQnVja2V0OiBidWNrZXQsIEtleToga2V5IH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiBkb3dubG9hZFVybFR0bFNlY29uZHMgfSxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHsgLi4uZW50cnksIHBob3RvVXJsOiBzaWduZWRQaG90b1VybCB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcblxuICByZXR1cm4ganNvbigyMDAsIHsgZW50cmllczogZW50cmllc1dpdGhTaWduZWRQaG90b1VybHMgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwc2VydEVudHJ5KHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiRU5UUklFU19UQUJMRV9OQU1FXCIsIGVudHJpZXNUYWJsZU5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IHBhcnNlZCA9IHZhbGlkYXRlRW50cnkocGF5bG9hZCk7XG4gIGlmICghcGFyc2VkLm9rKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIiwgZGV0YWlsczogcGFyc2VkLmVycm9yIH0pO1xuICBjb25zdCBkYXRhID0gcGFyc2VkLmRhdGE7XG4gIGNvbnN0IGlkID0gYCR7dXNlcklkfToke2RhdGEuZGF0ZX1gO1xuXG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXRlOiB7IFM6IGRhdGEuZGF0ZSB9LFxuICAgIGlkOiB7IFM6IGlkIH0sXG4gICAgbW9ybmluZ1dlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5tb3JuaW5nV2VpZ2h0KSB9LFxuICAgIGxhdGVTbmFjazogeyBCT09MOiBkYXRhLmxhdGVTbmFjayB9LFxuICAgIGhpZ2hTb2RpdW06IHsgQk9PTDogZGF0YS5oaWdoU29kaXVtIH0sXG4gICAgd29ya291dDogeyBCT09MOiBkYXRhLndvcmtvdXQgfSxcbiAgICBhbGNvaG9sOiB7IEJPT0w6IGRhdGEuYWxjb2hvbCB9LFxuICB9O1xuXG4gIGlmIChkYXRhLm5pZ2h0V2VpZ2h0ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5uaWdodFdlaWdodCAhPT0gbnVsbCkge1xuICAgIGl0ZW0ubmlnaHRXZWlnaHQgPSB7IE46IFN0cmluZyhkYXRhLm5pZ2h0V2VpZ2h0KSB9O1xuICB9XG4gIGlmIChkYXRhLmNhbG9yaWVzICE9PSB1bmRlZmluZWQpIGl0ZW0uY2Fsb3JpZXMgPSB7IE46IFN0cmluZyhkYXRhLmNhbG9yaWVzKSB9O1xuICBpZiAoZGF0YS5wcm90ZWluICE9PSB1bmRlZmluZWQpIGl0ZW0ucHJvdGVpbiA9IHsgTjogU3RyaW5nKGRhdGEucHJvdGVpbikgfTtcbiAgaWYgKGRhdGEuc3RlcHMgIT09IHVuZGVmaW5lZCkgaXRlbS5zdGVwcyA9IHsgTjogU3RyaW5nKGRhdGEuc3RlcHMpIH07XG4gIGlmIChkYXRhLnNsZWVwICE9PSB1bmRlZmluZWQpIGl0ZW0uc2xlZXAgPSB7IE46IFN0cmluZyhkYXRhLnNsZWVwKSB9O1xuICBjb25zdCBub3JtYWxpemVkUGhvdG9SZWZlcmVuY2UgPSBub3JtYWxpemVQaG90b1JlZmVyZW5jZShkYXRhLnBob3RvVXJsKTtcbiAgaWYgKG5vcm1hbGl6ZWRQaG90b1JlZmVyZW5jZSkgaXRlbS5waG90b1VybCA9IHsgUzogbm9ybWFsaXplZFBob3RvUmVmZXJlbmNlIH07XG4gIGlmICh0eXBlb2YgZGF0YS5ub3RlcyA9PT0gXCJzdHJpbmdcIikgaXRlbS5ub3RlcyA9IHsgUzogZGF0YS5ub3RlcyB9O1xuXG4gIGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBQdXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgIEl0ZW06IGl0ZW0gYXMgbmV2ZXIsXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGVudHJ5OiB7IC4uLmRhdGEsIGlkIH0gfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUVudHJ5KHVzZXJJZDogc3RyaW5nLCBxdWVyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJFTlRSSUVTX1RBQkxFX05BTUVcIiwgZW50cmllc1RhYmxlTmFtZSk7XG4gIGNvbnN0IGRhdGUgPSBxdWVyeT8uZGF0ZTtcbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF0ZSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGRhdGVcIiB9KTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgRGVsZXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgICAgICBkYXRlOiB7IFM6IGRhdGUgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBkYXRlIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXR0aW5ncyh1c2VySWQ6IHN0cmluZyk6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBjb25zdCB0YWJsZU5hbWUgPSBnZXRSZXF1aXJlZEVudihcIlNFVFRJTkdTX1RBQkxFX05BTUVcIiwgc2V0dGluZ3NUYWJsZU5hbWUpO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9IH0sXG4gICAgfSksXG4gICk7XG5cbiAgaWYgKCFvdXQuSXRlbSkge1xuICAgIGNvbnN0IHNldHRpbmdzOiBTdG9yZWRTZXR0aW5ncyA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGdvYWxXZWlnaHQ6IDcyLFxuICAgICAgc3RhcnRXZWlnaHQ6IDg1LFxuICAgICAgdGFyZ2V0RGF0ZTogZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IFwia2dcIixcbiAgICB9O1xuICAgIGF3YWl0IGRkYi5zZW5kKFxuICAgICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3MuZ29hbFdlaWdodCkgfSxcbiAgICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoc2V0dGluZ3Muc3RhcnRXZWlnaHQpIH0sXG4gICAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBzZXR0aW5ncy50YXJnZXREYXRlIH0sXG4gICAgICAgICAgdW5pdDogeyBTOiBzZXR0aW5ncy51bml0IH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgc2V0dGluZ3M6IHtcbiAgICAgICAgZ29hbFdlaWdodDogc2V0dGluZ3MuZ29hbFdlaWdodCxcbiAgICAgICAgc3RhcnRXZWlnaHQ6IHNldHRpbmdzLnN0YXJ0V2VpZ2h0LFxuICAgICAgICB0YXJnZXREYXRlOiBzZXR0aW5ncy50YXJnZXREYXRlLFxuICAgICAgICB1bml0OiBzZXR0aW5ncy51bml0LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHNldHRpbmdzOiB7XG4gICAgICBnb2FsV2VpZ2h0OiBOdW1iZXIob3V0Lkl0ZW0uZ29hbFdlaWdodD8uTiA/PyA3MiksXG4gICAgICBzdGFydFdlaWdodDogTnVtYmVyKG91dC5JdGVtLnN0YXJ0V2VpZ2h0Py5OID8/IDg1KSxcbiAgICAgIHRhcmdldERhdGU6IG91dC5JdGVtLnRhcmdldERhdGU/LlMgPz8gZGVmYXVsdFRhcmdldERhdGUoKSxcbiAgICAgIHVuaXQ6IG91dC5JdGVtLnVuaXQ/LlMgPT09IFwibGJzXCIgPyBcImxic1wiIDogXCJrZ1wiLFxuICAgIH0sXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXRjaFNldHRpbmdzKHVzZXJJZDogc3RyaW5nLCBldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IHBheWxvYWQgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgY29uc3QgcGFyc2VkID0gdmFsaWRhdGVTZXR0aW5ncyhwYXlsb2FkKTtcbiAgaWYgKCFwYXJzZWQub2spIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLCBkZXRhaWxzOiBwYXJzZWQuZXJyb3IgfSk7XG4gIGNvbnN0IGRhdGEgPSBwYXJzZWQuZGF0YTtcblxuICBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgZ29hbFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5nb2FsV2VpZ2h0KSB9LFxuICAgICAgICBzdGFydFdlaWdodDogeyBOOiBTdHJpbmcoZGF0YS5zdGFydFdlaWdodCkgfSxcbiAgICAgICAgdGFyZ2V0RGF0ZTogeyBTOiBkYXRhLnRhcmdldERhdGUgfSxcbiAgICAgICAgdW5pdDogeyBTOiBkYXRhLnVuaXQgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IHNldHRpbmdzOiBkYXRhIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVVcGxvYWRVcmwodXNlcklkOiBzdHJpbmcsIGV2ZW50OiBIdHRwRXZlbnQpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgYnVja2V0ID0gZ2V0UmVxdWlyZWRFbnYoXCJQSE9UT19CVUNLRVRfTkFNRVwiLCBwaG90b0J1Y2tldE5hbWUpO1xuICBjb25zdCBwYXlsb2FkID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGNvbnN0IGJvZHkgPSBwYXlsb2FkICYmIHR5cGVvZiBwYXlsb2FkID09PSBcIm9iamVjdFwiID8gKHBheWxvYWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIDoge307XG4gIGNvbnN0IGNvbnRlbnRUeXBlID1cbiAgICB0eXBlb2YgYm9keS5jb250ZW50VHlwZSA9PT0gXCJzdHJpbmdcIiAmJiBib2R5LmNvbnRlbnRUeXBlLmxlbmd0aCA+IDBcbiAgICAgID8gYm9keS5jb250ZW50VHlwZVxuICAgICAgOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xuICBjb25zdCBleHRlbnNpb24gPVxuICAgIHR5cGVvZiBib2R5LmV4dGVuc2lvbiA9PT0gXCJzdHJpbmdcIiAmJiAvXlthLXpBLVowLTldKyQvLnRlc3QoYm9keS5leHRlbnNpb24pXG4gICAgICA/IGJvZHkuZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKClcbiAgICAgIDogXCJqcGdcIjtcbiAgY29uc3QgZGF0ZSA9IGlzRGF0ZVN0cmluZyhib2R5LmRhdGUpID8gYm9keS5kYXRlIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3Qga2V5ID0gYCR7dXNlcklkfS8ke2RhdGV9LyR7RGF0ZS5ub3coKX0uJHtleHRlbnNpb259YDtcblxuICBjb25zdCBjb21tYW5kID0gbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgIEJ1Y2tldDogYnVja2V0LFxuICAgIEtleToga2V5LFxuICAgIENvbnRlbnRUeXBlOiBjb250ZW50VHlwZSxcbiAgfSk7XG4gIGNvbnN0IHVwbG9hZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IHVwbG9hZFVybFR0bFNlY29uZHMgfSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXBsb2FkVXJsLFxuICAgIGtleSxcbiAgICBwaG90b1VybDogYHMzOi8vJHtidWNrZXR9LyR7a2V5fWAsXG4gICAgZXhwaXJlc0luOiB1cGxvYWRVcmxUdGxTZWNvbmRzLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U3RhdHMoKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHRhYmxlTmFtZSA9IGdldFJlcXVpcmVkRW52KFwiU0VUVElOR1NfVEFCTEVfTkFNRVwiLCBzZXR0aW5nc1RhYmxlTmFtZSk7XG4gIGNvbnN0IFt1c2Vyc091dCwgdmlld3NPdXRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGRkYi5zZW5kKFxuICAgICAgbmV3IFNjYW5Db21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXG4gICAgICAgIFNlbGVjdDogXCJDT1VOVFwiLFxuICAgICAgICBGaWx0ZXJFeHByZXNzaW9uOiBcIiN1aWQgPD4gOm1ldGFVc2VySWQgQU5EIGF0dHJpYnV0ZV9leGlzdHMoZ29hbFdlaWdodClcIixcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7IFwiI3VpZFwiOiBcInVzZXJJZFwiIH0sXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6bWV0YVVzZXJJZFwiOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgICBkZGIuc2VuZChcbiAgICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IGFuYWx5dGljc01ldGFVc2VySWQgfSB9LFxuICAgICAgfSksXG4gICAgKSxcbiAgXSk7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7XG4gICAgdXNlcnM6IE51bWJlcih1c2Vyc091dC5Db3VudCA/PyAwKSxcbiAgICBwYWdlVmlld3M6IE51bWJlcih2aWV3c091dC5JdGVtPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsaXN0Q29nbml0b1VzZXJzRm9yQWRtaW4oKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGNvbnN0IHBvb2xJZCA9IGdldFJlcXVpcmVkRW52KFwiVVNFUl9QT09MX0lEXCIsIHVzZXJQb29sSWRFbnYpO1xuICBjb25zdCB1c2VyczogQXJyYXk8e1xuICAgIHN1Yjogc3RyaW5nO1xuICAgIGVtYWlsPzogc3RyaW5nO1xuICAgIGZpcnN0TmFtZT86IHN0cmluZztcbiAgICBmdWxsTmFtZT86IHN0cmluZztcbiAgICBzdGF0dXM/OiBzdHJpbmc7XG4gIH0+ID0gW107XG5cbiAgbGV0IHBhZ2luYXRpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBkbyB7XG4gICAgY29uc3Qgb3V0ID0gYXdhaXQgY29nbml0b0lkcC5zZW5kKFxuICAgICAgbmV3IExpc3RVc2Vyc0NvbW1hbmQoe1xuICAgICAgICBVc2VyUG9vbElkOiBwb29sSWQsXG4gICAgICAgIExpbWl0OiA2MCxcbiAgICAgICAgUGFnaW5hdGlvblRva2VuOiBwYWdpbmF0aW9uVG9rZW4sXG4gICAgICB9KSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgdSBvZiBvdXQuVXNlcnMgPz8gW10pIHtcbiAgICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IGEgb2YgdS5BdHRyaWJ1dGVzID8/IFtdKSB7XG4gICAgICAgIGlmIChhLk5hbWUgJiYgYS5WYWx1ZSkgYXR0cnNbYS5OYW1lXSA9IGEuVmFsdWU7XG4gICAgICB9XG4gICAgICBjb25zdCBmdWxsTmFtZSA9IGF0dHJzLm5hbWU7XG4gICAgICBjb25zdCBnaXZlbiA9IGF0dHJzLmdpdmVuX25hbWU7XG4gICAgICBjb25zdCBmaXJzdE5hbWUgPVxuICAgICAgICBnaXZlbiA/PyAoZnVsbE5hbWUgPyBmdWxsTmFtZS50cmltKCkuc3BsaXQoL1xccysvKVswXSA6IHVuZGVmaW5lZCk7XG4gICAgICB1c2Vycy5wdXNoKHtcbiAgICAgICAgc3ViOiBhdHRycy5zdWIgPz8gdS5Vc2VybmFtZSA/PyBcIlwiLFxuICAgICAgICBlbWFpbDogYXR0cnMuZW1haWwsXG4gICAgICAgIGZpcnN0TmFtZSxcbiAgICAgICAgZnVsbE5hbWUsXG4gICAgICAgIHN0YXR1czogdS5Vc2VyU3RhdHVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHBhZ2luYXRpb25Ub2tlbiA9IG91dC5QYWdpbmF0aW9uVG9rZW47XG4gIH0gd2hpbGUgKHBhZ2luYXRpb25Ub2tlbik7XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGNvdW50OiB1c2Vycy5sZW5ndGgsIHVzZXJzIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbmNyZW1lbnRQYWdlVmlldygpOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgY29uc3QgdGFibGVOYW1lID0gZ2V0UmVxdWlyZWRFbnYoXCJTRVRUSU5HU19UQUJMRV9OQU1FXCIsIHNldHRpbmdzVGFibGVOYW1lKTtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGRiLnNlbmQoXG4gICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiBhbmFseXRpY3NNZXRhVXNlcklkIH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiQUREIHBhZ2VWaWV3cyA6aW5jIFNFVCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0XCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOmluY1wiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIFwiOnVwZGF0ZWRBdFwiOiB7IFM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxuICAgICAgfSxcbiAgICAgIFJldHVyblZhbHVlczogXCJVUERBVEVEX05FV1wiLFxuICAgIH0pLFxuICApO1xuXG4gIHJldHVybiBqc29uKDIwMCwge1xuICAgIHBhZ2VWaWV3czogTnVtYmVyKG91dC5BdHRyaWJ1dGVzPy5wYWdlVmlld3M/Lk4gPz8gMCksXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogSHR0cEV2ZW50KTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXNlcklkID0gZ2V0VXNlcklkKGV2ZW50KTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIGpzb24oNDAxLCB7IGVycm9yOiBcIlVuYXV0aG9yaXplZFwiIH0pO1xuICAgIGNvbnN0IG1ldGhvZCA9IChcbiAgICAgIGV2ZW50IGFzIHsgcmVxdWVzdENvbnRleHQ/OiB7IGh0dHA/OiB7IG1ldGhvZD86IHN0cmluZyB9IH0gfVxuICAgICkucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZDtcblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9lbnRyaWVzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldEVudHJpZXModXNlcklkLCBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMpO1xuICAgICAgfVxuICAgICAgaWYgKG1ldGhvZCA9PT0gXCJQVVRcIikge1xuICAgICAgICByZXR1cm4gdXBzZXJ0RW50cnkodXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICAgIHJldHVybiBkZWxldGVFbnRyeSh1c2VySWQsIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3NldHRpbmdzXCIpIHtcbiAgICAgIGlmIChtZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgICAgcmV0dXJuIGdldFNldHRpbmdzKHVzZXJJZCk7XG4gICAgICB9XG4gICAgICBpZiAobWV0aG9kID09PSBcIlBBVENIXCIpIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoU2V0dGluZ3ModXNlcklkLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50LnJhd1BhdGggPT09IFwiL3N0YXRzXCIgJiYgbWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgICByZXR1cm4gZ2V0U3RhdHMoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvbWV0cmljcy9wYWdlLXZpZXdcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gaW5jcmVtZW50UGFnZVZpZXcoKTtcbiAgICB9XG5cbiAgICBpZiAoZXZlbnQucmF3UGF0aCA9PT0gXCIvcGhvdG9zL3VwbG9hZC11cmxcIiAmJiBtZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgICByZXR1cm4gY3JlYXRlVXBsb2FkVXJsKHVzZXJJZCwgZXZlbnQpO1xuICAgIH1cblxuICAgIGlmIChldmVudC5yYXdQYXRoID09PSBcIi9hZG1pbi91c2Vyc1wiICYmIG1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgY29uc3QgY2FsbGVyRW1haWwgPSBnZXRDYWxsZXJFbWFpbChldmVudCk7XG4gICAgICBpZiAoIWlzQWRtaW5FbWFpbChjYWxsZXJFbWFpbCkpIHtcbiAgICAgICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvcmJpZGRlblwiIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxpc3RDb2duaXRvVXNlcnNGb3JBZG1pbigpO1xuICAgIH1cblxuICAgIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJOb3QgRm91bmRcIiB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlID09PSBcIkludmFsaWQgSlNPTlwiKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBKU09OXCIgfSk7XG4gICAgfVxuICAgIGNvbnNvbGUuZXJyb3IoXCJMYW1iZGEgaGFuZGxlciBlcnJvclwiLCBlcnJvcik7XG4gICAgcmV0dXJuIGpzb24oNTAwLCB7IGVycm9yOiBcIkludGVybmFsIFNlcnZlciBFcnJvclwiIH0pO1xuICB9XG59XG4iXX0=