function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function isInsightsV2Enabled(): boolean {
  const explicit = parseBoolean(process.env.NEXT_PUBLIC_INSIGHTS_V2_ENABLED);
  if (explicit !== undefined) return explicit;
  return process.env.NODE_ENV === "development";
}

export function isInsightsLlmRefineEnabled(): boolean {
  const explicit = parseBoolean(process.env.NEXT_PUBLIC_INSIGHTS_LLM_REFINE);
  if (explicit !== undefined) return explicit;
  return false;
}
