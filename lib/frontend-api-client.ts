"use client";

import type { DailyEntry, ProgressPhoto, UserSettings } from "@/lib/types";
import type { SubscriptionSnapshot } from "@/lib/billing/types";
import type { PersonalizedCoachingApiPayload } from "@/lib/aiNudges/types";
import type { Insight, InsightVote } from "@/lib/insights/types";
import type { FoodEstimateResponse, FoodLogConfirmBody } from "@/lib/food/contracts";
import type { MealType } from "@/lib/meals/mealTypes";
import type { VoiceDailyParsedFields } from "@/lib/voiceDailyLog/types";

type JsonRecord = Record<string, unknown>;

function parseBoolEnv(value: string | undefined): boolean {
  return value === "true";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Normalized API base (trim, default https:// if scheme missing). Safe for execute-api URLs pasted without https. */
export function getAwsApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_AWS_API_URL ?? "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  return trimTrailingSlash(withScheme);
}

export function isAwsBackendEnabled(): boolean {
  const enabled = parseBoolEnv(process.env.NEXT_PUBLIC_USE_AWS_BACKEND);
  return enabled && getAwsApiBaseUrl().length > 0;
}

function buildAwsUrl(path: string): string {
  const baseUrl = getAwsApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_AWS_API_URL");
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readJsonSafe<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  useAws = false,
  accessToken?: string,
  timeoutMs = 15000
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    if (
      useAws &&
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      getAwsApiBaseUrl().startsWith("http://")
    ) {
      return {
        ok: false,
        error:
          "API URL is http:// but this page is https. Browsers block that. Set NEXT_PUBLIC_AWS_API_URL to the https API Gateway URL and rebuild.",
      };
    }
    const url = useAws ? buildAwsUrl(path) : path;
    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      // HTTP API JWT authorizers do not forward Authorization to Lambda; backend reads this for Cognito GetUser.
      headers.set("x-cognito-access-token", accessToken);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);
    const payload = await readJsonSafe<JsonRecord>(res);
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof payload?.error === "string"
            ? payload.error
            : `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Request timed out. Please try again." };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, error: "You're offline. Reconnect and try again." };
    }
    if (
      /failed to fetch|networkerror|load failed|network request failed|fetch api cannot load|could not connect|connection refused/i.test(
        message,
      )
    ) {
      try {
        const attempted = useAws ? buildAwsUrl(path) : path;
        let apiHost = "(n/a)";
        if (useAws) {
          try {
            apiHost = new URL(getAwsApiBaseUrl()).hostname;
          } catch {
            apiHost = "(invalid NEXT_PUBLIC_AWS_API_URL)";
          }
        }
        console.warn("[diet-tracker] fetch failed before HTTP response", {
          path,
          useAws,
          requestUrl: typeof attempted === "string" ? attempted : String(attempted),
          apiHost,
          hint: useAws
            ? "Run: npm run diag:aws (same machine). If that passes but the browser fails, the deployed JS may embed a different API URL — set NEXT_PUBLIC_* on Amplify and rebuild."
            : "Relative fetch failed (same-origin or Next route).",
        });
      } catch {
        console.warn("[diet-tracker] fetch failed (could not log URL)", { path });
      }
      const amplifyHint =
        typeof window !== "undefined" && /\.amplifyapp\.com$/i.test(window.location.hostname)
          ? " Amplify: confirm NEXT_PUBLIC_* vars are set in the Amplify Console (not only .env.local) so the build embeds the API URL."
          : "";
      return {
        ok: false,
        error: `Couldn't reach the server. Check your connection or VPN and try again.${amplifyHint}`,
      };
    }
    return { ok: false, error: "Network error. Please try again." };
  }
}

export async function getEntries(accessToken?: string) {
  return fetchJson<{ entries: DailyEntry[] }>("/entries", undefined, true, accessToken);
}

export async function putEntry(entry: DailyEntry, accessToken?: string) {
  return fetchJson<{ entry: DailyEntry }>(
    "/entries",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    },
    true,
    accessToken
  );
}

export async function deleteEntry(date: string, accessToken?: string) {
  const encoded = encodeURIComponent(date);
  return fetchJson<{ ok: true; date: string }>(
    `/entries?date=${encoded}`,
    { method: "DELETE" },
    true,
    accessToken
  );
}

export type SettingsApiResponse = {
  settings: UserSettings;
  /** Present when API returns subscription snapshot (additive GET /settings). */
  subscription?: SubscriptionSnapshot | null;
};

export async function getSettings(accessToken?: string) {
  return fetchJson<SettingsApiResponse>(
    "/settings",
    undefined,
    true,
    accessToken
  );
}

export async function postBillingCheckoutSession(priceId: string, accessToken: string) {
  return fetchJson<{ url: string }>(
    "/v2/billing/checkout-session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    },
    true,
    accessToken,
  );
}

export async function postBillingPortalSession(accessToken: string) {
  return fetchJson<{ url: string }>(
    "/v2/billing/portal",
    { method: "POST" },
    true,
    accessToken,
  );
}

export async function postV2WeeklyReportSendEmail(
  body: { htmlBody: string; textBody?: string; subject?: string },
  accessToken: string,
) {
  return fetchJson<{ ok: true; to: string }>(
    "/v2/weekly-report/send-email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function patchSettings(settings: UserSettings, accessToken?: string) {
  return fetchJson<{ settings: UserSettings }>(
    "/settings",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    true,
    accessToken
  );
}

export async function getFooterStats(accessToken?: string) {
  return fetchJson<{ users: number; pageViews: number }>("/stats", undefined, true, accessToken);
}

export type AdminUserRow = {
  sub: string;
  email?: string;
  firstName?: string;
  fullName?: string;
  status?: string;
};

export async function getAdminUsers(accessToken?: string) {
  return fetchJson<{ count: number; users: AdminUserRow[] }>(
    "/admin/users",
    undefined,
    true,
    accessToken,
  );
}

export async function trackPageView(accessToken?: string) {
  return fetchJson<{ pageViews: number }>(
    "/metrics/page-view",
    { method: "POST" },
    true,
    accessToken
  );
}

export async function getInsightsV2(accessToken?: string) {
  return fetchJson<{
    insights: Insight[];
    personalizedCoaching?: PersonalizedCoachingApiPayload;
  }>("/v2/insights", undefined, true, accessToken);
}

export async function getFeatureFlagOverrides(accessToken?: string) {
  return fetchJson<{ userId: string; overrides: Record<string, boolean> }>(
    "/feature-flags",
    undefined,
    true,
    accessToken,
  );
}

export async function getAdminFlagOverrides(userId: string, accessToken?: string) {
  return fetchJson<{ overrides: Array<{ userId: string; flag: string; enabled: boolean; ts: string }> }>(
    `/admin/flags?userId=${encodeURIComponent(userId)}`,
    undefined,
    true,
    accessToken,
  );
}

export async function putAdminFlagOverride(
  payload: { userId: string; flag: string; enabled: boolean },
  accessToken?: string,
) {
  return fetchJson<{ ok: true; override: { userId: string; flag: string; enabled: boolean; ts: string } }>(
    "/admin/flags",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    true,
    accessToken,
  );
}

export async function submitInsightFeedback(
  payload: {
    insightId: string;
    vote: InsightVote;
    comment?: string;
    feedbackType?: "negative";
  },
  accessToken?: string,
) {
  return fetchJson<{ ok: true }>(
    "/v2/insights/feedback",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    true,
    accessToken,
  );
}

export async function postFoodVisionEstimate(
  body: { photoUrl: string; day: string },
  accessToken: string,
) {
  return fetchJson<FoodEstimateResponse>(
    "/v2/food/estimate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
    60000,
  );
}

export async function postFoodLogConfirm(body: FoodLogConfirmBody, accessToken: string) {
  return fetchJson<{ ok: true }>(
    "/v2/food/log-confirm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export type MealLibraryRow = {
  id: string;
  name: string;
  mealType: MealType;
  photoKey?: string;
  estKcal: number;
  estProteinG: number;
  estCarbsG?: number;
  estFatG?: number;
  timesLogged: number;
  lastLoggedAt?: string;
};

export type DayMealEntryRow = {
  id: string;
  day: string;
  mealId?: string;
  nameSnapshot: string;
  mealType: MealType;
  photoKey?: string;
  kcal: number | null;
  proteinG: number | null;
  loggedAt: string;
  notes?: string;
  fiberG?: number | null;
  rawInput?: string;
  source?: string;
};

/** Response from POST /v2/meals/nl-parse */
export type NlMealParseApiResponse = {
  title: string;
  confidence: number;
  items: Array<{
    name: string;
    quantity_description: string;
    quantity_grams: number;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    icon_hint: string;
    isInLibrary?: boolean;
    libraryId?: string | null;
  }>;
  meal_type_guess: MealType;
  notes: string | null;
};

export async function postFoodMealComplete(
  body: {
    foodLogId: string;
    confirmedKcal: number;
    confirmedProtein: number;
    dishName: string;
    mealType: MealType;
    saveToLibrary: boolean;
    carbsG?: number;
    fatG?: number;
  },
  accessToken: string,
) {
  return fetchJson<{ ok: true; entry: DayMealEntryRow; libraryMealId: string | null }>(
    "/v2/food/meal-complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function getMealsSuggestMatch(query: string, accessToken: string) {
  return fetchJson<{ match: MealLibraryRow | null; similarity: number }>(
    `/v2/meals/suggest-match?query=${encodeURIComponent(query)}`,
    undefined,
    true,
    accessToken,
  );
}

export async function postMealLibraryCreate(
  body: {
    name: string;
    meal_type: MealType;
    kcal: number;
    protein_g: number;
    carbs_g?: number;
    fat_g?: number;
    source?: string;
  },
  accessToken: string,
) {
  return fetchJson<{ meal: MealLibraryRow; created: boolean }>(
    "/v2/meals",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function getMealsList(
  accessToken: string,
  params?: { type?: MealType; q?: string; sort?: "frequent" | "recent" | "alpha"; limit?: number },
) {
  const sp = new URLSearchParams();
  if (params?.type) sp.set("type", params.type);
  if (params?.q) sp.set("q", params.q);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return fetchJson<{ items: MealLibraryRow[] }>(`/v2/meals${qs ? `?${qs}` : ""}`, undefined, true, accessToken);
}

export async function getMealHistory(mealId: string, accessToken: string) {
  return fetchJson<{
    items: Array<{
      day: string;
      nameSnapshot: string;
      kcal: number | null;
      proteinG: number | null;
      loggedAt: string;
      notes?: string;
    }>;
  }>(`/v2/meals/${encodeURIComponent(mealId)}/history`, undefined, true, accessToken);
}

export async function patchMealLibrary(
  mealId: string,
  body: Partial<{
    name: string;
    meal_type: MealType;
    est_kcal: number;
    est_protein_g: number;
  }>,
  accessToken: string,
) {
  return fetchJson<{ meal: MealLibraryRow }>(
    `/v2/meals/${encodeURIComponent(mealId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function deleteMealLibrary(mealId: string, accessToken: string) {
  return fetchJson<{ ok: true }>(
    `/v2/meals/${encodeURIComponent(mealId)}`,
    { method: "DELETE" },
    true,
    accessToken,
  );
}

export async function getDayMealEntries(day: string, accessToken: string) {
  return fetchJson<{ items: DayMealEntryRow[] }>(
    `/v2/days/${encodeURIComponent(day)}/meal-entries`,
    undefined,
    true,
    accessToken,
  );
}

export async function postDayMealEntry(
  day: string,
  body:
    | { meal_id: string }
    | {
        name: string;
        meal_type: MealType;
        kcal: number;
        protein_g: number;
        photo_key?: string;
        carbs_g?: number;
        fat_g?: number;
        fiber_g?: number;
        notes?: string;
        raw_input?: string;
        source?: string;
      },
  accessToken: string,
) {
  return fetchJson<{ entry: DayMealEntryRow }>(
    `/v2/days/${encodeURIComponent(day)}/meal-entries`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function deleteDayMealEntry(day: string, entryId: string, accessToken: string) {
  return fetchJson<{ ok: true }>(
    `/v2/days/${encodeURIComponent(day)}/meal-entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
    true,
    accessToken,
  );
}

export async function postMealNlParse(text: string, accessToken: string) {
  return fetchJson<NlMealParseApiResponse>(
    "/v2/meals/nl-parse",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
    true,
    accessToken,
    60000,
  );
}

export type VoiceDailyParseApiResponse = { ok: true; parsed: VoiceDailyParsedFields };

export type VoiceDailyParseFetchResult =
  | { ok: true; data: VoiceDailyParseApiResponse }
  | { ok: false; error: string };

/** True when AWS voice parse failed in a way that might succeed via Next.js (dev) or a missing CDK route. */
export function voiceParseAwsFailureMayRetryWithNext(awsError: string): boolean {
  const e = awsError.toLowerCase();
  if (e.includes("couldn't reach") || e.includes("couldn’t reach")) return true;
  if (e.includes("network error")) return true;
  if (e.includes("timed out")) return true;
  if (e.includes("request failed (404)")) return true;
  if (e.includes("request failed (403)")) return true;
  if (e.includes("request failed (502)")) return true;
  return false;
}

/**
 * `next dev` serves `/api/v2/...`. Static export (Amplify `out/`) does not — same-origin fallback
 * only makes sense on localhost unless explicitly opted in (e.g. a full Node host).
 */
export function isVoiceParseNextOriginFallbackAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return process.env.NEXT_PUBLIC_VOICE_PARSE_ALLOW_NEXT_FALLBACK === "true";
}

/** One extra AWS attempt after flaky transport (not used for HTTP 4xx/5xx — those need config/deploy fixes). */
function awsVoiceParseShouldRetryOnce(awsError: string): boolean {
  const e = awsError.toLowerCase();
  if (e.includes("request failed (")) return false;
  if (e.includes("you're offline")) return false;
  if (e.includes("couldn't reach") || e.includes("couldn’t reach")) return true;
  if (e.includes("network error")) return true;
  if (e.includes("timed out")) return true;
  if (/failed to fetch|load failed|network request failed/i.test(awsError)) return true;
  return false;
}

/**
 * Voice transcript → structured check-in.
 * When AWS is enabled, calls API Gateway first (same key as food vision). On localhost only, a
 * transport/missing-route style failure can fall back to the Next.js `/api/v2/...` route (`next dev`).
 * Amplify uses static export — there is no Next API; fix connectivity or deploy POST /v2/voice-daily-log/parse on API GW.
 */
export async function postVoiceDailyLogParse(
  transcript: string,
  accessToken: string,
): Promise<VoiceDailyParseFetchResult> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  };

  if (isAwsBackendEnabled()) {
    let awsRes = await fetchJson<VoiceDailyParseApiResponse>(
      "/v2/voice-daily-log/parse",
      init,
      true,
      accessToken,
      60000,
    );
    if (!awsRes.ok && awsVoiceParseShouldRetryOnce(awsRes.error)) {
      await new Promise((r) => setTimeout(r, 450));
      const second = await fetchJson<VoiceDailyParseApiResponse>(
        "/v2/voice-daily-log/parse",
        init,
        true,
        accessToken,
        60000,
      );
      if (second.ok) return second;
      awsRes = second;
    }

    if (awsRes.ok) return awsRes;

    if (voiceParseAwsFailureMayRetryWithNext(awsRes.error) && isVoiceParseNextOriginFallbackAllowed()) {
      const nextRes = await fetchJson<VoiceDailyParseApiResponse>(
        "/api/v2/voice-daily-log/parse",
        init,
        false,
        accessToken,
        60000,
      );
      if (nextRes.ok) return nextRes;
      return {
        ok: false as const,
        error: `${awsRes.error}\n\nStill failing after same-origin fallback. Deploy CDK so API Gateway includes POST /v2/voice-daily-log/parse (same stack as photo food). Fallback error: ${nextRes.error}`,
      };
    }

    return awsRes;
  }

  return fetchJson<VoiceDailyParseApiResponse>(
    "/api/v2/voice-daily-log/parse",
    init,
    false,
    accessToken,
    60000,
  );
}

export async function postInsightCacheInvalidateAfterMeals(accessToken: string) {
  return fetchJson<{ ok: true }>(
    "/v2/meals/nl-parse/invalidate-insights",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    true,
    accessToken,
  );
}

export async function postActivityBurnEstimate(
  body: { activityText: string; weightKg: number },
  accessToken: string,
) {
  return fetchJson<{
    activitySummary: string;
    minutes: number;
    met: number;
    kcalBurn: number;
    confidence: number;
  }>(
    "/v2/activity/estimate-burn",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function postActivityLog(
  body: {
    day: string;
    activityText: string;
    activitySummary: string;
    kcalBurn: number;
    met: number;
    minutes: number;
    confidence: number;
  },
  accessToken: string,
) {
  return fetchJson<{ ok: true }>(
    "/v2/activity/log",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function patchActivityCalibration(factor: number, accessToken: string) {
  return fetchJson<{ ok: true; factor: number }>(
    "/v2/activity/calibration",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factor }),
    },
    true,
    accessToken,
  );
}

export async function getEnergyWeeklySummary(accessToken: string, endDate?: string) {
  const qs = endDate ? `?endDate=${encodeURIComponent(endDate)}` : "";
  return fetchJson<{
    calibrationFactor: number;
    avgNetKcal: number;
    trend: "deficit" | "surplus" | "near_maintenance";
    rows: Array<{
      day: string;
      consumedKcal: number;
      baselineKcal: number;
      stepsKcal: number;
      activityKcal: number;
      burnKcal: number;
      netKcal: number;
    }>;
  }>(`/v2/activity/energy-weekly-summary${qs}`, undefined, true, accessToken);
}

export async function getProgressPhotos(accessToken: string) {
  return fetchJson<{ items: ProgressPhoto[] }>(
    "/v2/progress-photos",
    undefined,
    true,
    accessToken,
  );
}

export async function postProgressPhoto(
  body: {
    date: string;
    storageKey?: string;
    imageUrl?: string;
    weightAtPhoto?: number;
  },
  accessToken: string,
) {
  return fetchJson<{ item: ProgressPhoto }>(
    "/v2/progress-photos",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
  );
}

export async function deleteProgressPhoto(photoId: string, accessToken: string) {
  return fetchJson<{ ok: true }>(
    `/v2/progress-photos/${encodeURIComponent(photoId)}`,
    { method: "DELETE" },
    true,
    accessToken,
  );
}

export async function postProgressPhotoAssessment(
  body: {
    photos: Array<
      | { date: string; photoUrl: string }
      | {
          date: string;
          imageBase64: string;
          mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        }
    >;
    query?: string;
  },
  accessToken: string,
) {
  return fetchJson<{
    summary: string;
    confidence: number;
    estimated: boolean;
    disclaimer: string;
    highlights: Array<{
      area: string;
      assessment: string;
      direction: "leaner" | "unchanged" | "uncertain";
    }>;
    timeframe: { from: string; to: string };
  }>(
    "/v2/progress-photos/assessment",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    true,
    accessToken,
    60000,
  );
}

export async function uploadPhotoFile(
  file: File,
  accessToken?: string,
  options?: { day?: string; kind?: "food" },
): Promise<{
  ok: boolean;
  photoUrl?: string;
  error?: string;
}> {
  if (!isAwsBackendEnabled()) {
    return { ok: false, error: "AWS backend disabled" };
  }

  const uploadInit = await fetchJson<{
    uploadUrl: string;
    fileUrl?: string;
    photoUrl?: string;
  }>(
    "/photos/upload-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        extension: (() => {
          const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
          return m?.[1]?.toLowerCase() ?? "jpg";
        })(),
        ...(options?.day ? { date: options.day } : {}),
        ...(options?.kind ? { kind: options.kind } : {}),
      }),
    },
    true,
    accessToken
  );

  if (!uploadInit.ok) {
    return { ok: false, error: uploadInit.error };
  }

  let putRes: Response;
  try {
    putRes = await fetch(uploadInit.data.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      return {
        ok: false,
        error:
          "Could not upload to photo storage (network or CORS). If this site is not ojas-health.com or localhost, add its full https origin to the S3 bucket CORS via PHOTO_CORS_EXTRA_ORIGINS and redeploy the CDK stack.",
      };
    }
    return { ok: false, error: "Photo upload failed. Please try again." };
  }

  if (!putRes.ok) {
    return { ok: false, error: `Photo upload failed (${putRes.status})` };
  }

  const photoUrl = uploadInit.data.photoUrl ?? uploadInit.data.fileUrl;
  if (!photoUrl) {
    return { ok: false, error: "Photo upload init succeeded, but photo URL missing." };
  }

  return { ok: true, photoUrl };
}
