/** Shared schema for GET /v2/insights AI card (JSON from Claude). */

export type VerdictStatus = "on_track" | "at_risk" | "off_track";

export type AiInsightActionIcon = "walk" | "food" | "moon" | "heart" | "run";

export type AiInsightStructured = {
  verdict: {
    status: VerdictStatus;
    headline: string;
    detail: string;
  };
  working: { body: string };
  stalling: {
    body: string;
    metrics: Array<{ value: string; label: string }>;
  };
  actions: Array<{
    icon: AiInsightActionIcon;
    action: string;
    reason: string;
  }>;
  prediction: {
    headline: string;
    basis: string;
  };
};

const ALLOWED_ICONS = new Set<string>(["walk", "food", "moon", "heart", "run"]);

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function asTrimmedString(v: unknown): string | null {
  if (isStr(v)) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

/** Model may return enum variants or spacing differences. */
function normalizeVerdictStatus(s: unknown): VerdictStatus | null {
  const raw = asTrimmedString(s);
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "on_track" || t === "ontrack") return "on_track";
  if (t === "at_risk" || t === "atrisk" || t === "rate_at_risk") return "at_risk";
  if (t === "off_track" || t === "offtrack") return "off_track";
  return null;
}

/** Pull a single JSON object from model text (handles trailing junk; balanced braces). */
export function extractJsonObjectFromModelText(raw: string): string | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normMetric(v: unknown): { value: string; label: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const value = asTrimmedString(o.value);
  const label = asTrimmedString(o.label);
  if (value === null || label === null) return null;
  return { value, label };
}

function normAction(v: unknown): {
  icon: AiInsightActionIcon;
  action: string;
  reason: string;
} | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const iconRaw = asTrimmedString(o.icon)?.toLowerCase();
  if (!iconRaw || !ALLOWED_ICONS.has(iconRaw)) return null;
  const action = asTrimmedString(o.action);
  const reason = asTrimmedString(o.reason);
  if (action === null || reason === null) return null;
  return {
    icon: iconRaw as AiInsightActionIcon,
    action,
    reason,
  };
}

function padMetrics(
  m: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const out = [...m];
  while (out.length < 3) {
    out.push({ value: "—", label: "—" });
  }
  return out.slice(0, 3);
}

function padActions(
  a: Array<{ icon: AiInsightActionIcon; action: string; reason: string }>,
): Array<{ icon: AiInsightActionIcon; action: string; reason: string }> {
  const out = [...a];
  while (out.length < 3) {
    out.push({ icon: "walk", action: "—", reason: "—" });
  }
  return out.slice(0, 3);
}

/**
 * Extract and validate structured insight JSON from model output.
 */
export function parseAiInsightStructured(
  raw: string,
): { ok: true; data: AiInsightStructured } | { ok: false; error: string } {
  const extracted = extractJsonObjectFromModelText(raw);
  if (!extracted) {
    return { ok: false, error: "no_json_object" };
  }
  let text = extracted.replace(/,\s*([}\]])/g, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "json_parse" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "not_object" };
  }
  const o = parsed as Record<string, unknown>;

  const verdict = o.verdict;
  if (!verdict || typeof verdict !== "object") {
    return { ok: false, error: "verdict" };
  }
  const v = verdict as Record<string, unknown>;
  const statusNorm = normalizeVerdictStatus(v.status);
  const headline = asTrimmedString(v.headline);
  const detail = asTrimmedString(v.detail);
  if (!statusNorm || headline === null || detail === null) {
    return { ok: false, error: "verdict_fields" };
  }

  const working = o.working;
  if (!working || typeof working !== "object") {
    return { ok: false, error: "working" };
  }
  const workingBody = asTrimmedString((working as Record<string, unknown>).body);
  if (workingBody === null) {
    return { ok: false, error: "working" };
  }

  const stalling = o.stalling;
  if (!stalling || typeof stalling !== "object") {
    return { ok: false, error: "stalling" };
  }
  const st = stalling as Record<string, unknown>;
  const stallBody = asTrimmedString(st.body);
  if (stallBody === null || !Array.isArray(st.metrics)) {
    return { ok: false, error: "stalling_fields" };
  }
  const metrics = st.metrics.map(normMetric).filter((x): x is NonNullable<typeof x> => x !== null);
  if (metrics.length < 1) {
    return { ok: false, error: "metrics_empty" };
  }

  const actionsRaw = o.actions;
  if (!Array.isArray(actionsRaw)) {
    return { ok: false, error: "actions" };
  }
  const actions = actionsRaw.map(normAction).filter((x): x is NonNullable<typeof x> => x !== null);
  if (actions.length < 1) {
    return { ok: false, error: "actions_empty" };
  }

  const prediction = o.prediction;
  if (!prediction || typeof prediction !== "object") {
    return { ok: false, error: "prediction" };
  }
  const p = prediction as Record<string, unknown>;
  const predHeadline = asTrimmedString(p.headline);
  const predBasis = asTrimmedString(p.basis);
  if (predHeadline === null || predBasis === null) {
    return { ok: false, error: "prediction_fields" };
  }

  const data: AiInsightStructured = {
    verdict: {
      status: statusNorm,
      headline,
      detail,
    },
    working: { body: workingBody },
    stalling: {
      body: stallBody,
      metrics: padMetrics(metrics),
    },
    actions: padActions(actions),
    prediction: {
      headline: predHeadline,
      basis: predBasis,
    },
  };

  return { ok: true, data };
}
