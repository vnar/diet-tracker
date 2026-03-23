import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});

const entriesTableName = process.env.ENTRIES_TABLE_NAME;
const settingsTableName = process.env.SETTINGS_TABLE_NAME;
const photoBucketName = process.env.PHOTO_BUCKET_NAME;
const uploadUrlTtlSeconds = Number(process.env.UPLOAD_URL_TTL_SECONDS ?? "900");
const downloadUrlTtlSeconds = Number(process.env.DOWNLOAD_URL_TTL_SECONDS ?? "3600");
const analyticsMetaUserId = "__meta__";

type Claims = {
  sub: string;
  [key: string]: unknown;
};

type HttpEvent = {
  rawPath: string;
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: Claims;
      };
    };
  };
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
};

type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

type DailyEntryUpsert = {
  date: string;
  morningWeight: number;
  nightWeight?: number | null;
  calories?: number;
  protein?: number;
  steps?: number;
  sleep?: number;
  lateSnack: boolean;
  highSodium: boolean;
  workout: boolean;
  alcohol: boolean;
  photoUrl?: string | null;
  notes?: string | null;
};

type SettingsPatch = {
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  unit: "kg" | "lbs";
};

type StoredEntry = DailyEntryUpsert & {
  id: string;
  userId: string;
};

type StoredSettings = SettingsPatch & {
  userId: string;
};

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getRequiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error("Invalid JSON");
  }
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIntNonNegative(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeNumber(value);
}

function validateEntry(input: unknown): { ok: true; data: DailyEntryUpsert } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body must be an object" };
  }

  const body = input as Record<string, unknown>;
  if (!isDateString(body.date)) return { ok: false, error: "Invalid date" };
  if (!isPositiveNumber(body.morningWeight)) return { ok: false, error: "Invalid morningWeight" };
  if (typeof body.lateSnack !== "boolean") return { ok: false, error: "Invalid lateSnack" };
  if (typeof body.highSodium !== "boolean") return { ok: false, error: "Invalid highSodium" };
  if (typeof body.workout !== "boolean") return { ok: false, error: "Invalid workout" };
  if (typeof body.alcohol !== "boolean") return { ok: false, error: "Invalid alcohol" };

  if (
    body.nightWeight !== undefined &&
    body.nightWeight !== null &&
    !isPositiveNumber(body.nightWeight)
  ) {
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

  if (
    body.photoUrl !== undefined &&
    body.photoUrl !== null &&
    (typeof body.photoUrl !== "string" || body.photoUrl.length > 600_000)
  ) {
    return { ok: false, error: "Invalid photoUrl" };
  }
  if (
    body.notes !== undefined &&
    body.notes !== null &&
    (typeof body.notes !== "string" || body.notes.length > 2_000)
  ) {
    return { ok: false, error: "Invalid notes" };
  }

  return {
    ok: true,
    data: {
      date: body.date,
      morningWeight: body.morningWeight,
      nightWeight: (body.nightWeight as number | null | undefined) ?? undefined,
      calories: body.calories as number | undefined,
      protein: body.protein as number | undefined,
      steps: body.steps as number | undefined,
      sleep: body.sleep as number | undefined,
      lateSnack: body.lateSnack as boolean,
      highSodium: body.highSodium as boolean,
      workout: body.workout as boolean,
      alcohol: body.alcohol as boolean,
      photoUrl: (body.photoUrl as string | null | undefined) ?? undefined,
      notes: (body.notes as string | null | undefined) ?? undefined,
    },
  };
}

function validateSettings(input: unknown): { ok: true; data: SettingsPatch } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Body must be an object" };
  }
  const body = input as Record<string, unknown>;
  if (!isPositiveNumber(body.goalWeight)) return { ok: false, error: "Invalid goalWeight" };
  if (!isPositiveNumber(body.startWeight)) return { ok: false, error: "Invalid startWeight" };
  if (!isDateString(body.targetDate)) return { ok: false, error: "Invalid targetDate" };
  if (body.unit !== "kg" && body.unit !== "lbs") return { ok: false, error: "Invalid unit" };
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

function getUserId(event: HttpEvent): string | undefined {
  return event.requestContext?.authorizer?.jwt?.claims?.sub;
}

function defaultTargetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 118);
  return d.toISOString().slice(0, 10);
}

async function getEntries(userId: string, query: Record<string, string | undefined> | null | undefined): Promise<HttpResult> {
  const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
  const from = query?.from;
  const to = query?.to;
  if (from && !isDateString(from)) return json(400, { error: "Invalid from date" });
  if (to && !isDateString(to)) return json(400, { error: "Invalid to date" });

  const expressionValues: Record<string, { S: string }> = { ":userId": { S: userId } };
  let keyCondition = "userId = :userId";
  if (from && to) {
    keyCondition += " AND #date BETWEEN :fromDate AND :toDate";
    expressionValues[":fromDate"] = { S: from };
    expressionValues[":toDate"] = { S: to };
  } else if (from) {
    keyCondition += " AND #date >= :fromDate";
    expressionValues[":fromDate"] = { S: from };
  } else if (to) {
    keyCondition += " AND #date <= :toDate";
    expressionValues[":toDate"] = { S: to };
  }

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ...(keyCondition.includes("#date")
        ? { ExpressionAttributeNames: { "#date": "date" } }
        : {}),
      ExpressionAttributeValues: expressionValues,
      ScanIndexForward: true,
      ConsistentRead: true,
    }),
  );

  const entries: StoredEntry[] = (out.Items ?? []).map(
    (item: Record<string, { S?: string; N?: string; BOOL?: boolean }>) => ({
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
    }),
  );

  const entriesWithSignedPhotoUrls: StoredEntry[] = await Promise.all(
    entries.map(async (entry) => {
      const photo = entry.photoUrl;
      if (!photo || !photo.startsWith("s3://")) return entry;
      try {
        const withoutScheme = photo.slice("s3://".length);
        const firstSlash = withoutScheme.indexOf("/");
        if (firstSlash <= 0) return entry;
        const bucket = withoutScheme.slice(0, firstSlash);
        const key = withoutScheme.slice(firstSlash + 1);
        if (!key) return entry;
        const signedPhotoUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: downloadUrlTtlSeconds },
        );
        return { ...entry, photoUrl: signedPhotoUrl };
      } catch {
        return entry;
      }
    }),
  );

  return json(200, { entries: entriesWithSignedPhotoUrls });
}

async function upsertEntry(userId: string, event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
  const payload = parseJsonBody(event);
  const parsed = validateEntry(payload);
  if (!parsed.ok) return json(400, { error: "Validation failed", details: parsed.error });
  const data = parsed.data;
  const id = `${userId}:${data.date}`;

  const item: Record<string, unknown> = {
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
  if (data.calories !== undefined) item.calories = { N: String(data.calories) };
  if (data.protein !== undefined) item.protein = { N: String(data.protein) };
  if (data.steps !== undefined) item.steps = { N: String(data.steps) };
  if (data.sleep !== undefined) item.sleep = { N: String(data.sleep) };
  if (typeof data.photoUrl === "string") item.photoUrl = { S: data.photoUrl };
  if (typeof data.notes === "string") item.notes = { S: data.notes };

  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: item as never,
    }),
  );

  return json(200, { entry: { ...data, id } });
}

async function deleteEntry(userId: string, query: Record<string, string | undefined> | null | undefined): Promise<HttpResult> {
  const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
  const date = query?.date;
  if (!isDateString(date)) return json(400, { error: "Invalid date" });

  await ddb.send(
    new DeleteItemCommand({
      TableName: tableName,
      Key: {
        userId: { S: userId },
        date: { S: date },
      },
    }),
  );

  return json(200, { ok: true, date });
}

async function getSettings(userId: string): Promise<HttpResult> {
  const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const out = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { userId: { S: userId } },
    }),
  );

  if (!out.Item) {
    const settings: StoredSettings = {
      userId,
      goalWeight: 72,
      startWeight: 85,
      targetDate: defaultTargetDate(),
      unit: "kg",
    };
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          userId: { S: userId },
          goalWeight: { N: String(settings.goalWeight) },
          startWeight: { N: String(settings.startWeight) },
          targetDate: { S: settings.targetDate },
          unit: { S: settings.unit },
        },
      }),
    );
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

async function patchSettings(userId: string, event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const payload = parseJsonBody(event);
  const parsed = validateSettings(payload);
  if (!parsed.ok) return json(400, { error: "Validation failed", details: parsed.error });
  const data = parsed.data;

  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        userId: { S: userId },
        goalWeight: { N: String(data.goalWeight) },
        startWeight: { N: String(data.startWeight) },
        targetDate: { S: data.targetDate },
        unit: { S: data.unit },
      },
    }),
  );

  return json(200, { settings: data });
}

async function createUploadUrl(userId: string, event: HttpEvent): Promise<HttpResult> {
  const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
  const payload = parseJsonBody(event);
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const contentType =
    typeof body.contentType === "string" && body.contentType.length > 0
      ? body.contentType
      : "application/octet-stream";
  const extension =
    typeof body.extension === "string" && /^[a-zA-Z0-9]+$/.test(body.extension)
      ? body.extension.toLowerCase()
      : "jpg";
  const date = isDateString(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const key = `${userId}/${date}/${Date.now()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: uploadUrlTtlSeconds });

  return json(200, {
    uploadUrl,
    key,
    photoUrl: `s3://${bucket}/${key}`,
    expiresIn: uploadUrlTtlSeconds,
  });
}

async function getStats(): Promise<HttpResult> {
  const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const [usersOut, viewsOut] = await Promise.all([
    ddb.send(
      new ScanCommand({
        TableName: tableName,
        Select: "COUNT",
        FilterExpression: "#uid <> :metaUserId AND attribute_exists(goalWeight)",
        ExpressionAttributeNames: { "#uid": "userId" },
        ExpressionAttributeValues: { ":metaUserId": { S: analyticsMetaUserId } },
      }),
    ),
    ddb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { userId: { S: analyticsMetaUserId } },
      }),
    ),
  ]);

  return json(200, {
    users: Number(usersOut.Count ?? 0),
    pageViews: Number(viewsOut.Item?.pageViews?.N ?? 0),
  });
}

async function incrementPageView(): Promise<HttpResult> {
  const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const out = await ddb.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { userId: { S: analyticsMetaUserId } },
      UpdateExpression: "ADD pageViews :inc SET updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":inc": { N: "1" },
        ":updatedAt": { S: new Date().toISOString() },
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  return json(200, {
    pageViews: Number(out.Attributes?.pageViews?.N ?? 0),
  });
}

export async function handler(event: HttpEvent): Promise<HttpResult> {
  try {
    const userId = getUserId(event);
    if (!userId) return json(401, { error: "Unauthorized" });
    const method = (
      event as { requestContext?: { http?: { method?: string } } }
    ).requestContext?.http?.method;

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
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON") {
      return json(400, { error: "Invalid JSON" });
    }
    console.error("Lambda handler error", error);
    return json(500, { error: "Internal Server Error" });
  }
}
