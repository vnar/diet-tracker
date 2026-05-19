type OverrideMap = Record<string, boolean>;

const overrideCacheByUser = new Map<string, OverrideMap>();

let featureFlagOverridesEpoch = 0;
const featureFlagOverridesSubscribers = new Set<() => void>();

function notifyFeatureFlagOverridesChanged(): void {
  featureFlagOverridesEpoch += 1;
  featureFlagOverridesSubscribers.forEach((fn) => fn());
}

/** Subscribe to cache updates from `setUserFlagOverrides` / `clearUserFlagOverrides` (client UI). */
export function subscribeFeatureFlagOverrides(listener: () => void): () => void {
  featureFlagOverridesSubscribers.add(listener);
  return () => featureFlagOverridesSubscribers.delete(listener);
}

export function getFeatureFlagOverridesEpoch(): number {
  return featureFlagOverridesEpoch;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeFlag(flag: string): string {
  return flag.startsWith("FF_") ? flag : `FF_${flag}`;
}

function readEnvFlag(flag: string): boolean | undefined {
  const normalized = normalizeFlag(flag);
  const serverValue = parseBoolean(process.env[normalized]);
  if (serverValue !== undefined) return serverValue;
  const publicValue = parseBoolean(process.env[`NEXT_PUBLIC_${normalized}`]);
  return publicValue;
}

/**
 * Roadmap slots: `defaultWhenUnset` is **true** for shipped client tools, **false** for betas / teasers.
 * Explicit env `true`/`false` and per-user overrides still win.
 */
function roadmapEval(flagSuffixWithoutFF: string, userId: string | undefined, defaultWhenUnset: boolean): boolean {
  const full = normalizeFlag(flagSuffixWithoutFF);
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.[full];
    if (typeof o === "boolean") return o;
  }
  const v = readEnvFlag(flagSuffixWithoutFF);
  if (v === true) return true;
  if (v === false) return false;
  return defaultWhenUnset;
}

export function setUserFlagOverrides(userId: string, overrides: OverrideMap): void {
  overrideCacheByUser.set(userId, { ...overrides });
  notifyFeatureFlagOverridesChanged();
}

export function clearUserFlagOverrides(userId?: string): void {
  if (typeof userId === "string") {
    overrideCacheByUser.delete(userId);
    notifyFeatureFlagOverridesChanged();
    return;
  }
  overrideCacheByUser.clear();
  notifyFeatureFlagOverridesChanged();
}

export function isEnabled(flag: string, userId?: string): boolean {
  const normalized = normalizeFlag(flag);
  if (userId) {
    const userOverrides = overrideCacheByUser.get(userId);
    const direct = userOverrides?.[normalized];
    if (typeof direct === "boolean") return direct;
  }
  const envValue = readEnvFlag(normalized);
  if (typeof envValue === "boolean") return envValue;
  /** Test / internal portal default: flags are ON unless env explicitly disables them. */
  return true;
}

// Backward-compatible wrappers for existing insights wiring.
export function isInsightsV2Enabled(userId?: string): boolean {
  const legacyExplicit = parseBoolean(process.env.NEXT_PUBLIC_INSIGHTS_V2_ENABLED);
  if (legacyExplicit !== undefined) return legacyExplicit;
  const explicit = readEnvFlag("INSIGHTS_V2");
  if (explicit !== undefined) return isEnabled("INSIGHTS_V2", userId);
  return true;
}

export function isInsightsLlmRefineEnabled(userId?: string): boolean {
  const legacyExplicit = parseBoolean(process.env.NEXT_PUBLIC_INSIGHTS_LLM_REFINE);
  if (legacyExplicit !== undefined) return legacyExplicit;
  const explicit = readEnvFlag("INSIGHTS_LLM_REFINE");
  if (explicit !== undefined) return isEnabled("INSIGHTS_LLM_REFINE", userId);
  return true;
}

/** When true, insights UI shows whether copy is AI-refined vs rule-based (requires API `generationSource`). */
export function isInsightsSourceLabelEnabled(userId?: string): boolean {
  const legacyExplicit = parseBoolean(process.env.NEXT_PUBLIC_INSIGHTS_SOURCE_LABEL);
  if (legacyExplicit !== undefined) return legacyExplicit;
  const explicit = readEnvFlag("INSIGHTS_SOURCE_LABEL");
  if (explicit !== undefined) return isEnabled("INSIGHTS_SOURCE_LABEL", userId);
  return true;
}

/** P1.3 multimodal food logging (camera → vision estimate → calories/protein). Default OFF. */
export function isPhotoFoodLogEnabled(userId?: string): boolean {
  return isEnabled("PHOTO_FOOD_LOG", userId);
}

/** P1.3.1 meal library + daily meal log (extends photo flow when also enabled). Default OFF. */
export function isMealLibraryEnabled(userId?: string): boolean {
  return isEnabled("MEAL_LIBRARY", userId);
}

/** Natural-language "Log a meal" AI parse (requires MEAL_LIBRARY). Default OFF. */
export function isNlMealParseEnabled(userId?: string): boolean {
  return isEnabled("NL_MEAL_PARSE", userId);
}

/** AI visual compare assessment for progress photos (estimate-only; no medical claims). */
export function isBodyCompareAiEnabled(userId?: string): boolean {
  return isEnabled("BODY_COMPARE_AI", userId);
}

/**
 * Personalized AI coaching nudges (rule-based; optional LLM later). Defaults ON when unset (opt-out:
 * set `FF_PERSONALIZED_AI_COACHING=false` / `NEXT_PUBLIC_FF_PERSONALIZED_AI_COACHING=false` to disable).
 */
export function isPersonalizedAiCoachingEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_PERSONALIZED_AI_COACHING"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("PERSONALIZED_AI_COACHING");
  if (explicit === false) return false;
  return true;
}

/**
 * Voice daily check-in (browser speech-to-text + Next parse API). Default ON when unset (opt-out:
 * set `FF_VOICE_DAILY_LOGGING=false` / `NEXT_PUBLIC_FF_VOICE_DAILY_LOGGING=false` to disable).
 */
export function isVoiceDailyLoggingEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_VOICE_DAILY_LOGGING"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("VOICE_DAILY_LOGGING");
  if (explicit === false) return false;
  return true;
}

/**
 * Pro paywall + Stripe checkout on the API. **ON when unset** (opt-out:
 * `FF_PRO_MONETIZATION=false` / `NEXT_PUBLIC_FF_PRO_MONETIZATION=false`).
 */
export function isProMonetizationEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_PRO_MONETIZATION"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("PRO_MONETIZATION");
  if (explicit === false) return false;
  return true;
}

/**
 * AI Weekly Report Card (rule-based aggregate + coach tone). Default ON when unset (opt-out:
 * `FF_WEEKLY_REPORT=false` / `NEXT_PUBLIC_FF_WEEKLY_REPORT=false`).
 */
export function isWeeklyReportEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_WEEKLY_REPORT"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("WEEKLY_REPORT");
  if (explicit === false) return false;
  return true;
}

/**
 * POST /v2/weekly-report/send-email (SES to Cognito user's verified email). Default ON when unset (opt-out:
 * `FF_WEEKLY_REPORT_EMAIL=false` / `NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL=false`). Lambda uses
 * `TRANSACTIONAL_EMAIL_FROM` when set, otherwise the verified product default `ojashealth2026@gmail.com`.
 */
export function isWeeklyReportEmailSendEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_WEEKLY_REPORT_EMAIL"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("WEEKLY_REPORT_EMAIL");
  if (explicit === false) return false;
  return true;
}

/**
 * Dashboard: download weight history as CSV (client-side from synced entries).
 * **ON when unset**; set `FF_WEIGHT_CSV_EXPORT=false` / `NEXT_PUBLIC_FF_WEIGHT_CSV_EXPORT=false` to disable.
 */
export function isWeightCsvExportEnabled(userId?: string): boolean {
  if (userId) {
    const o = overrideCacheByUser.get(userId)?.["FF_WEIGHT_CSV_EXPORT"];
    if (typeof o === "boolean") return o;
  }
  const explicit = readEnvFlag("WEIGHT_CSV_EXPORT");
  if (explicit === true) return true;
  if (explicit === false) return false;
  return true;
}

/** Morning weight logging streak card. On by default when unset. */
export function isWeightLogStreakEnabled(userId?: string): boolean {
  return roadmapEval("WEIGHT_LOG_STREAK", userId, true);
}

export function isCareCircleTeaserEnabled(userId?: string): boolean {
  return roadmapEval("CARE_CIRCLE_TEASER", userId, true);
}

export function isWearablesRoadmapEnabled(userId?: string): boolean {
  return roadmapEval("WEARABLES_ROADMAP", userId, true);
}

export function isLabsRoadmapEnabled(userId?: string): boolean {
  return roadmapEval("LABS_ROADMAP", userId, true);
}

export function isCommunityRoadmapEnabled(userId?: string): boolean {
  return roadmapEval("COMMUNITY_ROADMAP", userId, true);
}

export function isEmployerWellnessTeaserEnabled(userId?: string): boolean {
  return roadmapEval("EMPLOYER_WELLNESS_TEASER", userId, true);
}

export function isSsoForTeamsTeaserEnabled(userId?: string): boolean {
  return roadmapEval("SSO_FOR_TEAMS_TEASER", userId, true);
}

export function isDeveloperHooksTeaserEnabled(userId?: string): boolean {
  return roadmapEval("DEVELOPER_HOOKS_TEASER", userId, true);
}

export function isMealPlanTeaserEnabled(userId?: string): boolean {
  return roadmapEval("MEAL_PLAN_TEASER", userId, true);
}

export function isProteinHintStripEnabled(userId?: string): boolean {
  return roadmapEval("PROTEIN_HINT_STRIP", userId, true);
}

export function isSleepWeekCardEnabled(userId?: string): boolean {
  return roadmapEval("SLEEP_WEEK_CARD", userId, true);
}

export function isMedicationWellnessCardEnabled(userId?: string): boolean {
  return roadmapEval("MEDICATION_WELLNESS_CARD", userId, true);
}

export function isProValueStripEnabled(userId?: string): boolean {
  return roadmapEval("PRO_VALUE_STRIP", userId, true);
}

export function isReferralInviteEnabled(userId?: string): boolean {
  return roadmapEval("REFERRAL_INVITE", userId, true);
}

export function isYearReviewPageEnabled(userId?: string): boolean {
  return roadmapEval("YEAR_REVIEW_PAGE", userId, true);
}

export function isAiTrustFooterEnabled(userId?: string): boolean {
  return roadmapEval("AI_TRUST_FOOTER", userId, true);
}

export function isLocaleRoadmapCardEnabled(userId?: string): boolean {
  return roadmapEval("LOCALE_ROADMAP_CARD", userId, true);
}

/** Public marketing timelapse share links (no-login viewers). On when unset (opt-out via env). */
export function isProgressTimelapseShareEnabled(userId?: string): boolean {
  return roadmapEval("PROGRESS_TIMELAPSE_SHARE", userId, true);
}
