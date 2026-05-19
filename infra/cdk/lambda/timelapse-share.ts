import { randomUUID } from "crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";

export type TimelapseShareDeps = {
  ddb: DynamoDBClient;
  s3: S3Client;
  shareLinksTableName: string;
  progressPhotosTableName: string;
  entriesTableName: string;
  photoBucketName: string;
  downloadUrlTtlSeconds: number;
  appBaseUrl: string;
  shareEnabled: boolean;
  normalizePhotoReference: (photoUrl: string | null | undefined) => string | undefined;
  json: (statusCode: number, body: unknown) => { statusCode: number; body: string };
  parseJsonBody: (event: unknown) => unknown;
};

type ShareHttpEvent = { body?: string | null };

type SharePhotoSnapshot = {
  photoId: string;
  date: string;
  photoRef: string;
  weightAtPhoto?: number;
};

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function signPhotoRef(
  deps: TimelapseShareDeps,
  photoRef: string,
): Promise<string | null> {
  const normalized = deps.normalizePhotoReference(photoRef);
  if (!normalized?.startsWith("s3://")) return null;
  try {
    const withoutScheme = normalized.slice("s3://".length);
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash <= 0) return null;
    const bucket = withoutScheme.slice(0, firstSlash);
    const key = withoutScheme.slice(firstSlash + 1);
    if (!bucket || !key) return null;
    return await getSignedUrl(
      deps.s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: deps.downloadUrlTtlSeconds },
    );
  } catch {
    return null;
  }
}

async function buildPhotoSnapshot(userId: string, deps: TimelapseShareDeps): Promise<SharePhotoSnapshot[]> {
  const [progressOut, entriesOut] = await Promise.all([
    deps.ddb.send(
      new QueryCommand({
        TableName: deps.progressPhotosTableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": { S: userId } },
        ConsistentRead: true,
      }),
    ),
    deps.ddb.send(
      new QueryCommand({
        TableName: deps.entriesTableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": { S: userId } },
        ConsistentRead: true,
      }),
    ),
  ]);

  const snapshots: SharePhotoSnapshot[] = [];
  const seen = new Set<string>();

  for (const item of progressOut.Items ?? []) {
    const photoId = item.photoId?.S;
    const date = item.date?.S;
    const imageUrl = item.imageUrl?.S;
    const storageKey = item.storageKey?.S;
    const weightRaw = item.weightAtPhoto?.N;
    if (!photoId || !date) continue;
    const photoRef =
      deps.normalizePhotoReference(imageUrl) ??
      (storageKey ? `s3://${deps.photoBucketName}/${storageKey.replace(/^\/+/, "")}` : undefined);
    if (!photoRef) continue;
    const key = `${date}|${photoRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const weightAtPhoto = weightRaw != null ? Number(weightRaw) : undefined;
    snapshots.push({
      photoId,
      date,
      photoRef,
      weightAtPhoto: Number.isFinite(weightAtPhoto ?? NaN) ? weightAtPhoto : undefined,
    });
  }

  for (const item of entriesOut.Items ?? []) {
    const date = item.date?.S;
    const entryId = item.id?.S;
    const photoUrl = item.photoUrl?.S;
    const morningWeight = item.morningWeight?.N ? Number(item.morningWeight.N) : undefined;
    if (!date || !entryId || !photoUrl) continue;
    const photoRef = deps.normalizePhotoReference(photoUrl);
    if (!photoRef) continue;
    const key = `${date}|${photoRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    snapshots.push({
      photoId: `legacy-${entryId}`,
      date,
      photoRef,
      weightAtPhoto:
        typeof morningWeight === "number" && Number.isFinite(morningWeight) ? morningWeight : undefined,
    });
  }

  return snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createTimelapseShare(
  userId: string,
  event: ShareHttpEvent,
  deps: TimelapseShareDeps,
): Promise<{ statusCode: number; body: string }> {
  if (!deps.shareEnabled) {
    return deps.json(403, { error: "Timelapse share is disabled" });
  }
  if (!deps.shareLinksTableName) {
    return deps.json(500, { error: "Share links storage is not configured" });
  }

  const payload = deps.parseJsonBody(event);
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const includeWeight = body.includeWeight !== false;
  const unit = body.unit === "lbs" ? "lbs" : "kg";
  const expiryDaysRaw = body.expiryDays === undefined ? 30 : Number(body.expiryDays);
  const expiryDays = Number.isFinite(expiryDaysRaw)
    ? Math.min(90, Math.max(1, Math.floor(expiryDaysRaw)))
    : 30;

  const photos = await buildPhotoSnapshot(userId, deps);
  const withRefs = photos.filter((p) => p.photoRef.startsWith("s3://"));
  if (withRefs.length < 2) {
    return deps.json(400, {
      error: "Need at least two progress photos with cloud storage to create a share link.",
    });
  }

  const shareId = randomUUID().replace(/-/g, "");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  await deps.ddb.send(
    new PutItemCommand({
      TableName: deps.shareLinksTableName,
      Item: {
        shareId: { S: shareId },
        userId: { S: userId },
        createdAt: { S: createdAt },
        expiresAt: { S: expiresAt },
        includeWeight: { BOOL: includeWeight },
        unit: { S: unit },
        photosJson: { S: JSON.stringify(withRefs) },
      },
    }),
  );

  const url = `${deps.appBaseUrl.replace(/\/+$/, "")}/share?t=${encodeURIComponent(shareId)}`;
  return deps.json(200, { shareId, url, expiresAt });
}

export async function getPublicTimelapseShare(
  token: string,
  deps: TimelapseShareDeps,
): Promise<{ statusCode: number; body: string }> {
  if (!deps.shareLinksTableName) {
    return deps.json(500, { error: "Share links storage is not configured" });
  }
  const shareId = token.trim();
  if (!shareId || shareId.length > 64) {
    return deps.json(404, { error: "Share not found" });
  }

  const out = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.shareLinksTableName,
      Key: { shareId: { S: shareId } },
      ConsistentRead: true,
    }),
  );
  const item = out.Item;
  if (!item) return deps.json(404, { error: "Share not found" });

  const revokedAt = item.revokedAt?.S;
  if (revokedAt) return deps.json(410, { error: "This share link was revoked" });

  const expiresAt = item.expiresAt?.S;
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
    return deps.json(500, { error: "Invalid share record" });
  }
  if (Date.parse(expiresAt) < Date.now()) {
    return deps.json(410, { error: "This share link has expired" });
  }

  const includeWeight = item.includeWeight?.BOOL !== false;
  const unit = item.unit?.S === "lbs" ? "lbs" : "kg";
  let snapshots: SharePhotoSnapshot[] = [];
  try {
    snapshots = JSON.parse(item.photosJson?.S ?? "[]") as SharePhotoSnapshot[];
  } catch {
    return deps.json(500, { error: "Invalid share record" });
  }

  const signed: Array<{
    photoId: string;
    date: string;
    imageUrl: string;
    weightAtPhoto?: number;
  }> = [];

  for (const snap of snapshots) {
    if (!snap.photoId || !isDateString(snap.date) || !snap.photoRef) continue;
    const imageUrl = await signPhotoRef(deps, snap.photoRef);
    if (!imageUrl) continue;
    signed.push({
      photoId: snap.photoId,
      date: snap.date,
      imageUrl,
      ...(includeWeight && typeof snap.weightAtPhoto === "number"
        ? { weightAtPhoto: snap.weightAtPhoto }
        : {}),
    });
  }

  if (signed.length < 2) {
    return deps.json(410, { error: "Photos for this share are no longer available" });
  }

  return deps.json(200, {
    shareId,
    unit,
    includeWeight,
    expiresAt,
    photos: signed,
  });
}

export async function revokeTimelapseShare(
  userId: string,
  shareId: string,
  deps: TimelapseShareDeps,
): Promise<{ statusCode: number; body: string }> {
  if (!deps.shareLinksTableName) {
    return deps.json(500, { error: "Share links storage is not configured" });
  }
  const out = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.shareLinksTableName,
      Key: { shareId: { S: shareId } },
      ConsistentRead: true,
    }),
  );
  if (!out.Item || out.Item.userId?.S !== userId) {
    return deps.json(404, { error: "Share not found" });
  }
  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.shareLinksTableName,
      Key: { shareId: { S: shareId } },
      UpdateExpression: "SET revokedAt = :revokedAt",
      ExpressionAttributeValues: { ":revokedAt": { S: new Date().toISOString() } },
    }),
  );
  return deps.json(200, { ok: true });
}
