/**
 * EventBridge scheduled handler: emails the prior week’s rule-based weekly report to users who
 * opted in (`weeklyDigestEmail` on Settings) and have a verified Cognito email.
 * Gated by FF_WEEKLY_DIGEST_SCHEDULER and FF_WEEKLY_REPORT_EMAIL on this function.
 */
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, paginateListUsers } from "@aws-sdk/client-cognito-identity-provider";
import type { DailyEntry, ProgressPhoto, UserSettings } from "../../../lib/types";
import { buildWeeklyAggregate } from "../../../lib/weeklyReport/aggregate";
import { weeklyDigestSchedulerWeekEndKey, weekWindowInclusive } from "../../../lib/weeklyReport/dateRange";
import { buildWeeklyReportEmailHtml, buildWeeklyReportEmailPlainText } from "../../../lib/weeklyReport/emailFormat";
import { buildWeeklyReportFromRules } from "../../../lib/weeklyReport/ruleEngine";
import { sendTransactionalWeeklyReportMime } from "./lib/transactionalWeeklySesSend";

const ddb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function optionalEnvInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function mapEntryItem(
  userId: string,
  item: Record<string, { S?: string; N?: string; BOOL?: boolean } | undefined>,
): DailyEntry {
  return {
    id: item.id?.S ?? `${userId}:${item.date?.S ?? ""}`,
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
    activityText: item.activityText?.S ?? undefined,
    activitySummary: item.activitySummary?.S ?? undefined,
    activityBurnKcal: item.activityBurnKcal?.N ? Number(item.activityBurnKcal.N) : undefined,
    activityMet: item.activityMet?.N ? Number(item.activityMet.N) : undefined,
    activityMinutes: item.activityMinutes?.N ? Number(item.activityMinutes.N) : undefined,
    activityConfidence: item.activityConfidence?.N ? Number(item.activityConfidence.N) : undefined,
  };
}

async function loadEntriesRange(
  tableName: string,
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<DailyEntry[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId AND #date BETWEEN :from AND :to",
      ExpressionAttributeNames: { "#date": "date" },
      ExpressionAttributeValues: {
        ":userId": { S: userId },
        ":from": { S: weekStart },
        ":to": { S: weekEnd },
      },
      ConsistentRead: false,
    }),
  );
  return (out.Items ?? []).map((it) => mapEntryItem(userId, it as Record<string, { S?: string; N?: string; BOOL?: boolean }>));
}

async function loadSettings(tableName: string, userId: string): Promise<UserSettings | null> {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { userId: { S: userId } },
    }),
  );
  if (!out.Item) return null;
  const toneRaw = out.Item.tone?.S;
  const tone: UserSettings["tone"] =
    toneRaw === "clinical" || toneRaw === "tough-love" || toneRaw === "ayurvedic" ? toneRaw : "friendly";
  return {
    goalWeight: Number(out.Item.goalWeight?.N ?? 72),
    startWeight: Number(out.Item.startWeight?.N ?? 85),
    targetDate: out.Item.targetDate?.S ?? "2099-01-01",
    unit: out.Item.unit?.S === "lbs" ? "lbs" : "kg",
    tone,
    activityCalibrationFactor: Number(out.Item.activityCalibrationFactor?.N ?? 1),
    optInForecast: Number(out.Item.optInForecast?.N ?? "0") === 1,
    forecastGeneratedAt: out.Item.forecastGeneratedAt?.S,
    forecastDisclaimerAccepted: Number(out.Item.forecastDisclaimerAccepted?.N ?? "0") === 1,
    weeklyDigestEmail: Number(out.Item.weeklyDigestEmail?.N ?? "0") === 1,
  };
}

async function loadProgressPhotosForWeek(
  tableName: string,
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<ProgressPhoto[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": { S: userId } },
    }),
  );
  const rows: ProgressPhoto[] = [];
  for (const item of out.Items ?? []) {
    const rec = item as Record<string, { S?: string; N?: string }>;
    const date = rec.date?.S;
    const photoId = rec.photoId?.S;
    const createdAt = rec.createdAt?.S;
    if (!date || !photoId || !createdAt) continue;
    if (date < weekStart || date > weekEnd) continue;
    rows.push({
      photoId,
      userId,
      date,
      imageUrl: rec.imageUrl?.S,
      storageKey: rec.storageKey?.S,
      weightAtPhoto: rec.weightAtPhoto?.N ? Number(rec.weightAtPhoto.N) : undefined,
      createdAt,
    });
  }
  return rows;
}

async function alreadySentDigest(
  logTable: string,
  userId: string,
  weekStart: string,
): Promise<boolean> {
  const out = await ddb.send(
    new GetItemCommand({
      TableName: logTable,
      Key: {
        userId: { S: userId },
        weekStart: { S: weekStart },
      },
    }),
  );
  return Boolean(out.Item?.sentAt?.S);
}

async function markDigestSent(logTable: string, userId: string, weekStart: string, email: string): Promise<void> {
  await ddb.send(
    new PutItemCommand({
      TableName: logTable,
      Item: {
        userId: { S: userId },
        weekStart: { S: weekStart },
        sentAt: { S: new Date().toISOString() },
        channel: { S: "scheduler" },
        emailDomain: { S: email.includes("@") ? (email.split("@")[1] ?? "") : "" },
      },
    }),
  );
}

function subFromUserAttrs(attrs: { Name?: string; Value?: string }[] | undefined): string | undefined {
  return attrs?.find((a) => a.Name === "sub")?.Value?.trim();
}

function emailFromUserAttrs(attrs: { Name?: string; Value?: string }[] | undefined): {
  email?: string;
  verified: boolean;
} {
  const email = attrs?.find((a) => a.Name === "email")?.Value?.trim();
  const verified = attrs?.find((a) => a.Name === "email_verified")?.Value === "true";
  return { email, verified };
}

export async function handler(): Promise<{
  ok: boolean;
  weekStart?: string;
  weekEnd?: string;
  processed?: number;
  sent?: number;
  errors?: number;
}> {
  if (process.env.FF_WEEKLY_DIGEST_SCHEDULER !== "true") {
    console.log(JSON.stringify({ msg: "weekly_digest_skipped", reason: "FF_WEEKLY_DIGEST_SCHEDULER" }));
    return { ok: true };
  }
  if (process.env.FF_WEEKLY_REPORT_EMAIL !== "true") {
    console.log(JSON.stringify({ msg: "weekly_digest_skipped", reason: "FF_WEEKLY_REPORT_EMAIL" }));
    return { ok: true };
  }

  const entriesTable = env("ENTRIES_TABLE_NAME");
  const settingsTable = env("SETTINGS_TABLE_NAME");
  const photosTable = env("PROGRESS_PHOTOS_TABLE_NAME");
  const digestLogTable = env("WEEKLY_DIGEST_LOG_TABLE_NAME");
  const userPoolId = env("USER_POOL_ID");

  const weekEndKey = weeklyDigestSchedulerWeekEndKey();
  const { weekStart, weekEnd } = weekWindowInclusive(weekEndKey);
  const maxUsers = optionalEnvInt("WEEKLY_DIGEST_MAX_USERS_PER_RUN", 500);

  let processed = 0;
  let sent = 0;
  let errors = 0;

  const paginator = paginateListUsers({ client: cognito }, { UserPoolId: userPoolId, Limit: 60 });

  try {
    outer: for await (const page of paginator) {
      for (const u of page.Users ?? []) {
        if (processed >= maxUsers) break outer;
        const attrs = u.Attributes;
        const sub = subFromUserAttrs(attrs);
        const { email, verified } = emailFromUserAttrs(attrs);
        if (!sub || !email || !verified) {
          continue;
        }
        processed += 1;

        try {
          const settings = await loadSettings(settingsTable, sub);
          if (!settings?.weeklyDigestEmail) {
            continue;
          }

          if (await alreadySentDigest(digestLogTable, sub, weekStart)) {
            continue;
          }

          const entries = await loadEntriesRange(entriesTable, sub, weekStart, weekEnd);
          const photos = await loadProgressPhotosForWeek(photosTable, sub, weekStart, weekEnd);

          const agg = buildWeeklyAggregate({
            weekEnd,
            entries,
            settings: { unit: settings.unit, tone: settings.tone },
            photos,
          });
          const doc = buildWeeklyReportFromRules(agg);
          const html = buildWeeklyReportEmailHtml(doc, { deliverabilityNotice: "scheduledDigest" });
          const text = buildWeeklyReportEmailPlainText(doc, { deliverabilityNotice: "scheduledDigest" });
          const subject = `[Ojas Health] Weekly recap (${doc.aggregate.weekStart}–${doc.aggregate.weekEnd})`;

          await sendTransactionalWeeklyReportMime({ to: email, subject, html, textPlain: text });
          await markDigestSent(digestLogTable, sub, weekStart, email);
          sent += 1;
        } catch (e) {
          errors += 1;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(JSON.stringify({ msg: "weekly_digest_user_failed", sub, err: msg }));
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ msg: "weekly_digest_fatal", err: msg }));
    throw e;
  }

  console.log(
    JSON.stringify({
      msg: "weekly_digest_complete",
      weekStart,
      weekEnd,
      processed,
      sent,
      errors,
    }),
  );

  return { ok: true, weekStart, weekEnd, processed, sent, errors };
}
