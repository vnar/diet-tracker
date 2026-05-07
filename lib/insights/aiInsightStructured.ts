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

function isVerdictStatus(s: unknown): s is VerdictStatus {
  return s === "on_track" || s === "at_risk" || s === "off_track";
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function normMetric(v: unknown): { value: string; label: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.value) || !isStr(o.label)) return null;
  return { value: o.value.trim(), label: o.label.trim() };
}

function normAction(v: unknown): {
  icon: AiInsightActionIcon;
  action: string;
  reason: string;
} | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const iconRaw = o.icon;
  if (!isStr(iconRaw) || !ALLOWED_ICONS.has(iconRaw)) return null;
  if (!isStr(o.action) || !isStr(o.reason)) return null;
  return {
    icon: iconRaw as AiInsightActionIcon,
    action: o.action.trim(),
    reason: o.reason.trim(),
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
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { ok: false, error: "no_json_object" };
  }
  text = text.slice(start, end + 1);
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
  if (!isVerdictStatus(v.status) || !isStr(v.headline) || !isStr(v.detail)) {
    return { ok: false, error: "verdict_fields" };
  }

  const working = o.working;
  if (!working || typeof working !== "object" || !isStr((working as Record<string, unknown>).body)) {
    return { ok: false, error: "working" };
  }

  const stalling = o.stalling;
  if (!stalling || typeof stalling !== "object") {
    return { ok: false, error: "stalling" };
  }
  const st = stalling as Record<string, unknown>;
  if (!isStr(st.body) || !Array.isArray(st.metrics)) {
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
  if (!isStr(p.headline) || !isStr(p.basis)) {
    return { ok: false, error: "prediction_fields" };
  }

  const data: AiInsightStructured = {
    verdict: {
      status: v.status,
      headline: v.headline.trim(),
      detail: v.detail.trim(),
    },
    working: { body: (working as { body: string }).body.trim() },
    stalling: {
      body: st.body.trim(),
      metrics: padMetrics(metrics),
    },
    actions: padActions(actions),
    prediction: {
      headline: p.headline.trim(),
      basis: p.basis.trim(),
    },
  };

  return { ok: true, data };
}
