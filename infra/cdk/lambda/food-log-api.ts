import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { guessFoodImageMediaType, parseS3Uri, s3KeyAllowedForUser } from "../../../lib/food/s3Uri";
import { runFoodVisionModel } from "../../../lib/food/visionModel";

export type HttpEvent = {
  body?: string | null;
};

export type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function isDateString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isPhotoFoodLogEnabledLambda(): boolean {
  return process.env.FF_PHOTO_FOOD_LOG === "true";
}

export async function handleV2FoodEstimate(
  userId: string,
  event: HttpEvent,
  deps: {
    ddb: DynamoDBClient;
    s3: S3Client;
    foodLogTableName: string;
    photoBucketName: string;
  },
): Promise<HttpResult> {
  if (!isPhotoFoodLogEnabledLambda()) {
    return json(403, { error: "Food photo logging is disabled." });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return json(503, { error: "Food vision is not configured." });
  }

  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
  const day = typeof body.day === "string" ? body.day.trim() : "";
  if (!photoUrl || !day || !isDateString(day)) {
    return json(400, { error: "Expected photoUrl (s3://...) and day (YYYY-MM-DD)." });
  }

  const ref = parseS3Uri(photoUrl);
  if (!ref) return json(400, { error: "photoUrl must be an s3:// URI." });
  if (ref.bucket !== deps.photoBucketName) {
    return json(400, { error: "Invalid photo bucket." });
  }
  if (!s3KeyAllowedForUser(ref.key, userId)) {
    return json(403, { error: "Photo does not belong to this user." });
  }

  let buf: Buffer;
  let contentType: string | undefined;
  try {
    const out = await deps.s3.send(
      new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes || bytes.length === 0) {
      return json(400, { error: "Empty image." });
    }
    if (bytes.length > 12 * 1024 * 1024) {
      return json(400, { error: "Image too large." });
    }
    buf = Buffer.from(bytes);
    contentType = out.ContentType;
  } catch (e) {
    console.error(JSON.stringify({ msg: "food_vision_s3_get_failed", key: ref.key, err: String(e) }));
    return json(400, { error: "Could not read image from storage." });
  }

  const mediaType = guessFoodImageMediaType(ref.key, contentType);
  const base64 = buf.toString("base64");

  let estimate;
  try {
    estimate = await runFoodVisionModel({ apiKey, base64, mediaType });
  } catch (e) {
    console.error(JSON.stringify({ msg: "food_vision_anthropic_failed", err: String(e) }));
    return json(502, { error: "Vision estimate failed. Try entering calories manually." });
  }

  if (!estimate) {
    return json(502, { error: "Could not parse estimate. Try manual entry." });
  }

  const foodLogId = `food#${day}#${Date.now()}#${Math.random().toString(36).slice(2, 10)}`;
  const ts = new Date().toISOString();

  try {
    await deps.ddb.send(
      new PutItemCommand({
        TableName: deps.foodLogTableName,
        Item: {
          userId: { S: userId },
          foodLogId: { S: foodLogId },
          day: { S: day },
          imageKey: { S: ref.key },
          estKcalLow: { N: String(estimate.kcalLow) },
          estKcalMid: { N: String(estimate.kcalMid) },
          estKcalHigh: { N: String(estimate.kcalHigh) },
          estProtein: { N: String(estimate.proteinG) },
          confidence: { N: String(estimate.confidence) },
          mealLabel: { S: estimate.mealLabel },
          ts: { S: ts },
        },
      }),
    );
  } catch (e) {
    console.error(JSON.stringify({ msg: "food_log_put_failed", err: String(e) }));
    return json(500, { error: "Could not save food log entry." });
  }

  return json(200, {
    estimate,
    foodLogId,
  });
}

export async function handleV2FoodLogConfirm(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; foodLogTableName: string },
): Promise<HttpResult> {
  if (!isPhotoFoodLogEnabledLambda()) {
    return json(403, { error: "Food photo logging is disabled." });
  }
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const foodLogId = typeof body.foodLogId === "string" ? body.foodLogId.trim() : "";
  const confirmedKcal = typeof body.confirmedKcal === "number" ? body.confirmedKcal : Number(body.confirmedKcal);
  const confirmedProtein =
    typeof body.confirmedProtein === "number" ? body.confirmedProtein : Number(body.confirmedProtein);
  if (!foodLogId || !Number.isFinite(confirmedKcal) || !Number.isFinite(confirmedProtein)) {
    return json(400, { error: "Expected foodLogId, confirmedKcal, confirmedProtein." });
  }

  const existing = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.foodLogTableName,
      Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
      ConsistentRead: true,
    }),
  );
  if (!existing.Item) {
    return json(404, { error: "Food log not found." });
  }

  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.foodLogTableName,
      Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
      UpdateExpression: "SET confirmedKcal = :kc, confirmedProtein = :pr, confirmedTs = :cts",
      ExpressionAttributeValues: {
        ":kc": { N: String(Math.round(confirmedKcal)) },
        ":pr": { N: String(Math.round(confirmedProtein)) },
        ":cts": { S: new Date().toISOString() },
      },
    }),
  );

  return json(200, { ok: true });
}
