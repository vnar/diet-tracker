type OverrideMap = Record<string, boolean>;

const overrideCacheByUser = new Map<string, OverrideMap>();

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

export function setUserFlagOverrides(userId: string, overrides: OverrideMap): void {
  overrideCacheByUser.set(userId, { ...overrides });
}

export function clearUserFlagOverrides(userId?: string): void {
  if (typeof userId === "string") {
    overrideCacheByUser.delete(userId);
    return;
  }
  overrideCacheByUser.clear();
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
  return false;
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
