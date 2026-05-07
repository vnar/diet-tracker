import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
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
import { generateAiInsightCard } from "./insights-ai-card";
import { handleV2FoodEstimate, handleV2FoodLogConfirm } from "./food-log-api";
import {
  handleV2DayMealEntriesCreate,
  handleV2DayMealEntriesList,
  handleV2DayMealEntryDelete,
  handleV2FoodMealComplete,
  handleV2MealsCreate,
  handleV2MealsDelete,
  handleV2MealsHistory,
  handleV2MealsList,
  handleV2MealsPatch,
  handleV2MealsSuggestMatch,
} from "./meals-api";

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
const cognitoIdp = new CognitoIdentityProviderClient({});

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

type Claims = {
  sub: string;
  [key: string]: unknown;
};

type HttpEvent = {
  rawPath: string;
  headers?: Record<string, string | undefined>;
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
  tone?: "friendly" | "clinical" | "tough-love" | "ayurvedic";
};

type StoredEntry = DailyEntryUpsert & {
  id: string;
  userId: string;
  notes?: string;
};

type StoredSettings = SettingsPatch & {
  userId: string;
};

type PlateauUserSettings = {
  rollingWindowDays?: number;
  comparisonSpanDays?: number;
  maxAvgMovementKg?: number;
};

type InsightCard = {
  id: string;
  ruleId: string;
  priority: number;
  headline: string;
  detail?: string;
  why: string[];
  action: string;
  category: "sodium" | "alcohol" | "late_snack" | "workout" | "plateau" | "streak" | "trajectory";
  generationSource?: "llm" | "rules";
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

function envFlagTriState(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
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
  if (
    body.tone !== undefined &&
    body.tone !== "friendly" &&
    body.tone !== "clinical" &&
    body.tone !== "tough-love" &&
    body.tone !== "ayurvedic"
  ) {
    return { ok: false, error: "Invalid tone" };
  }
  return {
    ok: true,
    data: {
      goalWeight: body.goalWeight,
      startWeight: body.startWeight,
      targetDate: body.targetDate,
      unit: body.unit,
      tone: body.tone as SettingsPatch["tone"],
    },
  };
}

function getJwtClaims(event: HttpEvent): Record<string, unknown> | undefined {
  const raw = event.requestContext?.authorizer?.jwt?.claims;
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function getUserId(event: HttpEvent): string | undefined {
  const sub = getJwtClaims(event)?.sub;
  return typeof sub === "string" ? sub : undefined;
}

function firstNameFromJwtClaims(claims: Record<string, unknown> | undefined): string | undefined {
  if (!claims) return undefined;
  const given = claims.given_name;
  if (typeof given === "string" && given.trim()) return given.trim();
  const name = claims.name;
  if (typeof name === "string" && name.trim()) {
    const first = name.trim().split(/\s+/)[0];
    return first || undefined;
  }
  return undefined;
}

function plateauSettingsFromItem(
  item: Record<string, { S?: string; N?: string }> | undefined,
): PlateauUserSettings | undefined {
  if (!item) return undefined;
  const out: PlateauUserSettings = {};
  const rw = item.plateauRollingWindowDays?.N;
  const span = item.plateauComparisonSpanDays?.N;
  const mv = item.plateauMaxMovementKg?.N;
  if (rw != null) {
    const n = Number(rw);
    if (Number.isFinite(n)) out.rollingWindowDays = n;
  }
  if (span != null) {
    const n = Number(span);
    if (Number.isFinite(n)) out.comparisonSpanDays = n;
  }
  if (mv != null) {
    const n = Number(mv);
    if (Number.isFinite(n)) out.maxAvgMovementKg = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validatePlateauPatchObject(
  raw: unknown,
): { ok: true; data: PlateauUserSettings } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "plateau must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const data: PlateauUserSettings = {};
  if (o.rollingWindowDays !== undefined) {
    const n = Number(o.rollingWindowDays);
    if (!Number.isFinite(n)) return { ok: false, error: "Invalid plateau.rollingWindowDays" };
    data.rollingWindowDays = n;
  }
  if (o.comparisonSpanDays !== undefined) {
    const n = Number(o.comparisonSpanDays);
    if (!Number.isFinite(n)) return { ok: false, error: "Invalid plateau.comparisonSpanDays" };
    data.comparisonSpanDays = n;
  }
  if (o.maxAvgMovementKg !== undefined) {
    const n = Number(o.maxAvgMovementKg);
    if (!Number.isFinite(n)) return { ok: false, error: "Invalid plateau.maxAvgMovementKg" };
    data.maxAvgMovementKg = n;
  }
  return { ok: true, data };
}

/** Gmail treats dots and +labels as aliases; normalize so admin list matches real sign-in identities. */
function normalizeEmailForAdminMatch(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const baseLocal = (local.split("+")[0] ?? local).replace(/\./g, "");
    return `${baseLocal}@${domain}`;
  }
  return lower;
}

function getAdminAllowListNormalized(): Set<string> {
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

const ADMIN_CLAIM_KEYS = ["username", "cognito:username", "email", "preferred_username"] as const;

function collectAdminIdentityCandidates(claims: Record<string, unknown>): string[] {
  const found: string[] = [];
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
function isAdminCaller(event: HttpEvent): boolean {
  const claims = getJwtClaims(event);
  if (!claims) return false;
  const allow = getAdminAllowListNormalized();
  if (allow.size === 0) return false;
  const candidates = collectAdminIdentityCandidates(claims);
  for (const c of candidates) {
    if (allow.has(normalizeEmailForAdminMatch(c))) return true;
  }
  return false;
}

function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
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
function bearerAccessToken(event: HttpEvent): string | undefined {
  const h = event.headers;
  const custom = headerValue(h, "x-cognito-access-token");
  if (custom?.trim()) return custom.trim();
  const raw = headerValue(h, "authorization");
  if (!raw) return undefined;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

/** When claims lack a resolvable email, verify admin via GetUser; token sub must match JWT sub. */
async function isAdminViaGetUser(event: HttpEvent): Promise<boolean> {
  const token = bearerAccessToken(event);
  if (!token) return false;
  const jwtSub = getUserId(event);
  if (!jwtSub) return false;
  const allow = getAdminAllowListNormalized();
  if (allow.size === 0) return false;
  try {
    const out = await cognitoIdp.send(new GetUserCommand({ AccessToken: token }));
    const attrs = out.UserAttributes ?? [];
    const tokenSub = attrs.find((a) => a.Name === "sub")?.Value;
    if (tokenSub !== jwtSub) return false;
    const email =
      attrs.find((a) => a.Name === "email")?.Value ??
      attrs.find((a) => a.Name === "preferred_username")?.Value;
    const fromUsername = out.Username?.includes("@") ? out.Username : undefined;
    const candidate = (email ?? fromUsername ?? "").trim().toLowerCase();
    if (!candidate) return false;
    return allow.has(normalizeEmailForAdminMatch(candidate));
  } catch {
    return false;
  }
}

async function isAdminAllowed(event: HttpEvent): Promise<boolean> {
  if (isAdminCaller(event)) return true;
  return isAdminViaGetUser(event);
}

function defaultTargetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 118);
  return d.toISOString().slice(0, 10);
}

function normalizePhotoReference(photoUrl: string | null | undefined): string | undefined {
  if (!photoUrl || typeof photoUrl !== "string") return undefined;
  if (photoUrl.startsWith("s3://")) return photoUrl;
  if (!photoUrl.includes("://")) {
    const keyOnly = photoUrl.replace(/^\/+/, "");
    if (!keyOnly) return undefined;
    if (photoBucketName) {
      return `s3://${photoBucketName}/${keyOnly}`;
    }
    return undefined;
  }
  try {
    const parsed = new URL(photoUrl);
    const host = parsed.hostname.toLowerCase();
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path) return undefined;

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
      if (slash <= 0) return undefined;
      const bucket = path.slice(0, slash);
      const key = path.slice(slash + 1);
      if (!bucket || !key) return undefined;
      return `s3://${bucket}/${key}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sortByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nextMorningDeltas(
  logs: StoredEntry[],
  predicate: (log: StoredEntry) => boolean,
): { flagged: number[]; baseline: number[] } {
  const sorted = sortByDateAsc(logs);
  const flagged: number[] = [];
  const baseline: number[] = [];
  for (let idx = 0; idx < sorted.length - 1; idx += 1) {
    const delta = sorted[idx + 1].morningWeight - sorted[idx].morningWeight;
    if (predicate(sorted[idx])) flagged.push(delta);
    else baseline.push(delta);
  }
  return { flagged, baseline };
}

function sodiumInsight(logs: StoredEntry[]): InsightCard | null {
  const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.highSodium);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg == null || baselineAvg == null) return null;
  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;
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

function alcoholInsight(logs: StoredEntry[]): InsightCard | null {
  const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.alcohol);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg == null || baselineAvg == null) return null;
  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;
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

function lateSnackInsight(logs: StoredEntry[]): InsightCard | null {
  const { flagged, baseline } = nextMorningDeltas(logs, (log) => log.lateSnack);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg == null || baselineAvg == null) return null;
  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;
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

function baselineInsightWithLogs(entryCount: number, latestDate: string): InsightCard {
  return {
    id: `baseline-insight-${latestDate}`,
    ruleId: "baseline",
    priority: 10,
    headline: "Great consistency so far — keep logging daily for sharper insights.",
    detail:
      "We need a bit more signal to detect strong personal patterns, but your data flow is active.",
    why: [
      `${entryCount} logs analyzed from the last 90 days`,
      "No rule crossed confidence thresholds yet",
    ],
    action: "Keep tracking daily habits and weight to unlock stronger personalized insights.",
    category: "streak",
  };
}

function baselineInsightNoLogs(asOfDate: string): InsightCard {
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

async function getInsightsV2(userId: string, _event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("ENTRIES_TABLE_NAME", entriesTableName);
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 89);
  const from = fromDate.toISOString().slice(0, 10);
  const out = await ddb.send(
    new QueryCommand({
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
    }),
  );
  const entriesRaw = (out.Items ?? []).map(
    (item: Record<string, { S?: string; N?: string; BOOL?: boolean }>) => ({
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
    }),
  ).filter((e) => e.date && e.morningWeight > 0);

  const settingsTable = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const settingsRow = await ddb.send(
    new GetItemCommand({
      TableName: settingsTable,
      Key: { userId: { S: userId } },
      ConsistentRead: true,
    }),
  );
  const gItem = settingsRow.Item;
  const goalWeight = gItem ? Number(gItem.goalWeight?.N ?? 72) : 72;
  const startWeight = gItem ? Number(gItem.startWeight?.N ?? 85) : 85;
  const targetDate = gItem?.targetDate?.S ?? to;

  const insights = await generateAiInsightCard(ddb, {
    userId,
    entriesRaw,
    goalWeight,
    startWeight,
    targetDate,
    dayMealsTableName: dayMealEntriesTableName,
  });
  return json(200, { insights });
}

async function saveInsightFeedback(userId: string, event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("INSIGHT_FEEDBACK_TABLE_NAME", insightFeedbackTableName);
  const payload = parseJsonBody(event);
  if (!payload || typeof payload !== "object") return json(400, { error: "Body must be an object" });
  const body = payload as Record<string, unknown>;
  const insightId = typeof body.insightId === "string" ? body.insightId.trim() : "";
  const vote = body.vote === "up" || body.vote === "down" ? body.vote : null;
  if (!insightId || !vote) return json(400, { error: "Invalid insight feedback payload" });
  const ts = new Date().toISOString();
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        userId: { S: userId },
        insightTs: { S: `${ts}#${insightId}` },
        insightId: { S: insightId },
        vote: { S: vote },
        ts: { S: ts },
      },
    }),
  );
  return json(200, { ok: true });
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
      const photo = normalizePhotoReference(entry.photoUrl);
      if (!photo) return entry;
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
  const normalizedPhotoReference = normalizePhotoReference(data.photoUrl);
  if (normalizedPhotoReference) item.photoUrl = { S: normalizedPhotoReference };
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
      tone: "friendly",
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
          tone: { S: settings.tone ?? "friendly" },
        },
      }),
    );
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
      tone:
        out.Item.tone?.S === "clinical" ||
        out.Item.tone?.S === "tough-love" ||
        out.Item.tone?.S === "ayurvedic"
          ? out.Item.tone.S
          : "friendly",
      plateau: plateauSettingsFromItem(out.Item),
    },
  });
}

async function patchSettings(userId: string, event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("SETTINGS_TABLE_NAME", settingsTableName);
  const existingOut = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { userId: { S: userId } },
      ConsistentRead: true,
    }),
  );
  const payload = parseJsonBody(event);
  const parsed = validateSettings(payload);
  if (!parsed.ok) return json(400, { error: "Validation failed", details: parsed.error });
  const data = parsed.data;
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const existingTone =
    existingOut.Item?.tone?.S === "clinical" ||
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
    } else {
      const p = validatePlateauPatchObject(rawPlateau);
      if (!p.ok) return json(400, { error: "Validation failed", details: p.error });
      nextPlateau = { ...nextPlateau, ...p.data };
    }
  }

  const item: Record<string, { S?: string; N?: string }> = {
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

  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: item as never,
    }),
  );

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

async function createUploadUrl(userId: string, event: HttpEvent): Promise<HttpResult> {
  const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
  const payload = parseJsonBody(event);
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const contentType =
    typeof body.contentType === "string" && body.contentType.length > 0
      ? body.contentType
      : "application/octet-stream";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const extFromFileName = fileName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "";
  const extFromBody =
    typeof body.extension === "string" && /^[a-zA-Z0-9]+$/.test(body.extension)
      ? body.extension.toLowerCase()
      : "";
  const extension =
    extFromFileName && /^[a-z0-9]+$/.test(extFromFileName)
      ? extFromFileName
      : extFromBody && /^[a-z0-9]+$/.test(extFromBody)
        ? extFromBody
        : "jpg";
  const date = isDateString(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  const key =
    kind === "food"
      ? `${userId}/food/${date}/${Date.now()}.${extension}`
      : `${userId}/${date}/${Date.now()}.${extension}`;

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

async function listCognitoUsersForAdmin(): Promise<HttpResult> {
  const poolId = getRequiredEnv("USER_POOL_ID", userPoolIdEnv);
  const users: Array<{
    sub: string;
    email?: string;
    firstName?: string;
    fullName?: string;
    status?: string;
  }> = [];

  let paginationToken: string | undefined;
  do {
    const out = await cognitoIdp.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Limit: 60,
        PaginationToken: paginationToken,
      }),
    );
    for (const u of out.Users ?? []) {
      const attrs: Record<string, string> = {};
      for (const a of u.Attributes ?? []) {
        if (a.Name && a.Value) attrs[a.Name] = a.Value;
      }
      const fullName = attrs.name;
      const given = attrs.given_name;
      const firstName =
        given ?? (fullName ? fullName.trim().split(/\s+/)[0] : undefined);
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

async function getFeatureFlagsForUser(userId: string): Promise<HttpResult> {
  const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": { S: userId } },
      ConsistentRead: true,
    }),
  );
  const fromDb = (out.Items ?? []).reduce<Record<string, boolean>>((acc, item) => {
    const flag = item.flag?.S;
    const enabledRaw = item.enabled?.BOOL;
    if (typeof flag === "string" && typeof enabledRaw === "boolean") {
      acc[flag] = enabledRaw;
    }
    return acc;
  }, {});

  const serverDefaults: Record<string, boolean> = {};
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

async function listFeatureFlagOverrides(event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
  const targetUserId = event.queryStringParameters?.userId;
  if (!targetUserId) {
    return json(400, { error: "Missing userId query parameter" });
  }
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": { S: targetUserId } },
      ConsistentRead: true,
    }),
  );
  const overrides = (out.Items ?? []).map((item) => ({
    userId: item.userId?.S ?? targetUserId,
    flag: item.flag?.S ?? "",
    enabled: item.enabled?.BOOL ?? false,
    ts: item.ts?.S ?? "",
  }));
  return json(200, { overrides });
}

async function upsertFeatureFlagOverride(event: HttpEvent): Promise<HttpResult> {
  const tableName = getRequiredEnv("FEATURE_FLAG_OVERRIDES_TABLE_NAME", featureFlagOverridesTableName);
  const payload = parseJsonBody(event);
  if (!payload || typeof payload !== "object") return json(400, { error: "Body must be an object" });
  const body = payload as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const rawFlag = typeof body.flag === "string" ? body.flag.trim() : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : null;
  if (!userId || !rawFlag || enabled === null) {
    return json(400, { error: "Invalid payload. Expected userId, flag, enabled." });
  }
  const normalizedFlag = rawFlag.startsWith("FF_") ? rawFlag : `FF_${rawFlag}`;
  const ts = new Date().toISOString();
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        userId: { S: userId },
        flag: { S: normalizedFlag },
        enabled: { BOOL: enabled },
        ts: { S: ts },
      },
    }),
  );
  return json(200, { ok: true, override: { userId, flag: normalizedFlag, enabled, ts } });
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

    if (event.rawPath === "/v2/insights" && method === "GET") {
      return getInsightsV2(userId, event);
    }

    if (event.rawPath === "/v2/insights/feedback" && method === "POST") {
      return saveInsightFeedback(userId, event);
    }

    if (event.rawPath === "/v2/food/estimate" && method === "POST") {
      const table = foodLogEntriesTableName;
      const bucket = getRequiredEnv("PHOTO_BUCKET_NAME", photoBucketName);
      if (!table) return json(500, { error: "Food log storage is not configured." });
      return handleV2FoodEstimate(userId, event, {
        ddb,
        s3,
        foodLogTableName: table,
        photoBucketName: bucket,
      });
    }

    if (event.rawPath === "/v2/food/log-confirm" && method === "POST") {
      const table = foodLogEntriesTableName;
      if (!table) return json(500, { error: "Food log storage is not configured." });
      return handleV2FoodLogConfirm(userId, event, { ddb, foodLogTableName: table });
    }

    if (event.rawPath === "/v2/food/meal-complete" && method === "POST") {
      const foodT = foodLogEntriesTableName;
      const mT = mealsTableName;
      const dT = dayMealEntriesTableName;
      if (!foodT || !mT || !dT) {
        return json(500, { error: "Meal library storage is not configured." });
      }
      return handleV2FoodMealComplete(userId, event, {
        ddb,
        foodLogTableName: foodT,
        mealsTableName: mT,
        dayMealsTableName: dT,
      });
    }

    if (event.rawPath === "/v2/meals/suggest-match" && method === "GET") {
      const mT = mealsTableName;
      if (!mT) return json(500, { error: "Meals storage is not configured." });
      return handleV2MealsSuggestMatch(userId, event, { ddb, mealsTableName: mT });
    }

    if (event.rawPath === "/v2/meals" && method === "GET") {
      const mT = mealsTableName;
      if (!mT) return json(500, { error: "Meals storage is not configured." });
      return handleV2MealsList(userId, event, { ddb, mealsTableName: mT });
    }

    if (event.rawPath === "/v2/meals" && method === "POST") {
      const mT = mealsTableName;
      if (!mT) return json(500, { error: "Meals storage is not configured." });
      return handleV2MealsCreate(userId, event, { ddb, mealsTableName: mT });
    }

    const mealHistoryMatch = event.rawPath.match(/^\/v2\/meals\/([^/]+)\/history$/);
    if (mealHistoryMatch && method === "GET") {
      const dT = dayMealEntriesTableName;
      if (!dT) return json(500, { error: "Day meal entries storage is not configured." });
      return handleV2MealsHistory(userId, mealHistoryMatch[1], { ddb, dayMealsTableName: dT });
    }

    const mealPatchDel = event.rawPath.match(/^\/v2\/meals\/([^/]+)$/);
    if (mealPatchDel && mealPatchDel[1] !== "suggest-match" && method === "PATCH") {
      const mT = mealsTableName;
      if (!mT) return json(500, { error: "Meals storage is not configured." });
      return handleV2MealsPatch(userId, mealPatchDel[1], event, { ddb, mealsTableName: mT });
    }
    if (mealPatchDel && mealPatchDel[1] !== "suggest-match" && method === "DELETE") {
      const mT = mealsTableName;
      if (!mT) return json(500, { error: "Meals storage is not configured." });
      return handleV2MealsDelete(userId, mealPatchDel[1], { ddb, mealsTableName: mT });
    }

    const dayMealListOrCreate = event.rawPath.match(/^\/v2\/days\/([\d-]+)\/meal-entries$/);
    if (dayMealListOrCreate && method === "GET") {
      const dT = dayMealEntriesTableName;
      if (!dT) return json(500, { error: "Day meal entries storage is not configured." });
      return handleV2DayMealEntriesList(userId, dayMealListOrCreate[1], { ddb, dayMealsTableName: dT });
    }
    if (dayMealListOrCreate && method === "POST") {
      const dT = dayMealEntriesTableName;
      const mT = mealsTableName;
      if (!dT || !mT) return json(500, { error: "Meal library storage is not configured." });
      return handleV2DayMealEntriesCreate(userId, dayMealListOrCreate[1], event, {
        ddb,
        dayMealsTableName: dT,
        mealsTableName: mT,
      });
    }

    const dayMealDel = event.rawPath.match(/^\/v2\/days\/([\d-]+)\/meal-entries\/([^/]+)$/);
    if (dayMealDel && method === "DELETE") {
      const dT = dayMealEntriesTableName;
      if (!dT) return json(500, { error: "Day meal entries storage is not configured." });
      return handleV2DayMealEntryDelete(userId, dayMealDel[1], dayMealDel[2], { ddb, dayMealsTableName: dT });
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
      if (!(await isAdminAllowed(event))) return json(403, { error: "Forbidden" });
      return listFeatureFlagOverrides(event);
    }

    if (event.rawPath === "/admin/flags" && method === "PUT") {
      if (!(await isAdminAllowed(event))) return json(403, { error: "Forbidden" });
      return upsertFeatureFlagOverride(event);
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
