"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Apple,
  Beef,
  Check,
  Coffee,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  GlassWater,
  LeafyGreen,
  Library,
  Loader2,
  Pencil,
  RefreshCw,
  Salad,
  Sparkles,
  Utensils,
  Wheat,
  X,
} from "lucide-react";
import { track } from "@/lib/analytics";
import type { MealType } from "@/lib/meals/mealTypes";
import {
  postDayMealEntry,
  postInsightCacheInvalidateAfterMeals,
  postMealLibraryCreate,
  postMealNlParse,
  type NlMealParseApiResponse,
} from "@/lib/frontend-api-client";
import { heuristicNlMealParse } from "@/lib/meals/nlMealParseHeuristic";

const PURPLE = "#A78BFA";
const G = "#3DDB7A";
const G2 = "#4ade80";
const WARN = "#F97316";
const RED = "#F43F5E";
const BLUE = "#60A5FA";

const HINT_CHIPS: Array<{ label: string; text: string }> = [
  { label: "dal + rice", text: "dal and one portion of rice" },
  { label: "roti + sabzi", text: "two rotis with sabzi" },
  { label: "curd rice", text: "a bowl of curd rice" },
  { label: "poha + chai", text: "poha with chai" },
  { label: "oats", text: "a bowl of oats with milk" },
];

const STATUS_LINES = [
  "Identifying ingredients…",
  "Estimating portions…",
  "Looking up nutrition data…",
  "Calculating macros…",
];

function HintIcon({ hint }: { hint: string }) {
  const cls = "h-[13px] w-[13px] shrink-0";
  const style = { color: G };
  switch (hint) {
    case "soup":
      return <Utensils className={cls} style={style} strokeWidth={2} />;
    case "bowl-rice":
      return <Wheat className={cls} style={style} strokeWidth={2} />;
    case "bread":
      return <Croissant className={cls} style={style} strokeWidth={2} />;
    case "plant":
      return <LeafyGreen className={cls} style={style} strokeWidth={2} />;
    case "grain":
      return <Wheat className={cls} style={style} strokeWidth={2} />;
    case "drumstick":
      return <Drumstick className={cls} style={style} strokeWidth={2} />;
    case "cup":
      return <GlassWater className={cls} style={style} strokeWidth={2} />;
    case "egg":
      return <Egg className={cls} style={style} strokeWidth={2} />;
    case "fish":
      return <Fish className={cls} style={style} strokeWidth={2} />;
    case "salad":
      return <Salad className={cls} style={style} strokeWidth={2} />;
    case "meat":
      return <Beef className={cls} style={style} strokeWidth={2} />;
    case "apple":
      return <Apple className={cls} style={style} strokeWidth={2} />;
    case "lemon":
      return <LeafyGreen className={cls} style={style} strokeWidth={2} />;
    case "coffee":
      return <Coffee className={cls} style={style} strokeWidth={2} />;
    default:
      return <Utensils className={cls} style={style} strokeWidth={2} />;
  }
}

type Props = {
  day: string;
  getAccessToken: () => string | null;
  onLogged: () => void;
  className?: string;
};

export function NaturalMealInput(props: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<NlMealParseApiResponse | null>(null);
  const [parseInput, setParseInput] = useState("");
  const [statusIdx, setStatusIdx] = useState(0);
  const [success, setSuccess] = useState<{ title: string; subtitle: string; fading: boolean } | null>(null);
  const [rowEdit, setRowEdit] = useState<{ index: number; value: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_LINES.length);
    }, 700);
    return () => window.clearInterval(t);
  }, [loading]);

  const resizeTa = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, []);

  useEffect(() => {
    resizeTa();
  }, [text, resizeTa]);

  async function runParse(overrideText?: string) {
    const raw = (overrideText ?? text).trim();
    if (!raw) return;
    const token = props.getAccessToken();
    if (!token) {
      setErr("Sign in required.");
      return;
    }
    setErr(null);
    setLoading(true);
    setResult(null);
    setParseInput(raw);
    track("meal_nl_parse_started", { day: props.day });
    const res = await postMealNlParse(raw, token);
    setLoading(false);
    if (!res.ok) {
      if (res.error === "AI is not configured.") {
        const data = heuristicNlMealParse(raw);
        setResult({ ...data, parseSource: "heuristic" });
        track("meal_nl_parse_ok", { day: props.day, items: data.items.length, parseSource: "heuristic" });
        return;
      }
      const msg =
        res.error.includes("parse") || res.error.includes("422")
          ? "Couldn't parse that — try rephrasing"
          : res.error.includes("reach AI") || res.error.includes("connection")
            ? "Couldn't reach AI — check connection"
            : res.error;
      setErr(msg);
      track("meal_nl_parse_failed", { day: props.day });
      return;
    }
    setResult(res.data);
    track("meal_nl_parse_ok", {
      day: props.day,
      items: res.data.items.length,
      parseSource: res.data.parseSource ?? "llm",
    });
  }

  function onParseClick() {
    void runParse();
  }

  function totals(r: NlMealParseApiResponse) {
    let kcal = 0;
    let p = 0;
    let c = 0;
    let f = 0;
    for (const it of r.items) {
      kcal += it.kcal;
      p += it.protein_g;
      c += it.carbs_g;
      f += it.fat_g;
    }
    return {
      kcal,
      protein: Math.round(p * 10) / 10,
      carbs: Math.round(c * 10) / 10,
      fat: Math.round(f * 10) / 10,
    };
  }

  function confColor(conf: number): string {
    if (conf >= 90) return G;
    if (conf >= 70) return WARN;
    return RED;
  }

  async function confirmAdd() {
    if (!result) return;
    const token = props.getAccessToken();
    if (!token) return;
    setErr(null);
    setLoading(true);
    try {
      for (const item of result.items) {
        if (!item.isInLibrary) {
          const lib = await postMealLibraryCreate(
            {
              name: item.name,
              meal_type: result.meal_type_guess as MealType,
              kcal: item.kcal,
              protein_g: item.protein_g,
              carbs_g: item.carbs_g,
              fat_g: item.fat_g,
              source: "ai_parse",
            },
            token,
          );
          if (!lib.ok) {
            setErr(lib.error ?? "Could not save to library");
            setLoading(false);
            return;
          }
        }
        const dayRes = await postDayMealEntry(
          props.day,
          {
            name: item.name,
            meal_type: result.meal_type_guess as MealType,
            kcal: item.kcal,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            fiber_g: item.fiber_g,
            notes: item.quantity_description,
            raw_input: parseInput,
            source: "ai_parse",
          },
          token,
        );
        if (!dayRes.ok) {
          setErr(dayRes.error ?? "Could not log meal");
          setLoading(false);
          return;
        }
      }
      void postInsightCacheInvalidateAfterMeals(token);
      const anyNew = result.items.some((i) => !i.isInLibrary);
      const t = totals(result);
      setSuccess({
        title: `${result.title} added to today's log`,
        subtitle: anyNew
          ? `(New to library · saved) · +${Math.round(t.kcal)} kcal`
          : `(From library) · +${Math.round(t.kcal)} kcal`,
        fading: false,
      });
      window.setTimeout(() => {
        setSuccess((s) => (s ? { ...s, fading: true } : null));
      }, 3500);
      window.setTimeout(() => setSuccess(null), 4000);
      setResult(null);
      setText("");
      track("meal_nl_parse_confirmed", { day: props.day, items: result.items.length });
      props.onLogged();
    } finally {
      setLoading(false);
    }
  }

  async function applyRowEdit() {
    if (!result || rowEdit == null) return;
    const item = result.items[rowEdit.index];
    if (!item) {
      setRowEdit(null);
      return;
    }
    const v = rowEdit.value.trim();
    if (!v || v === item.quantity_description.trim()) {
      setRowEdit(null);
      return;
    }
    const suffix = ` (adjust ${item.name} to ${v})`;
    const nextText = `${parseInput}${suffix}`;
    setRowEdit(null);
    setRowBusy(rowEdit.index);
    const token = props.getAccessToken();
    if (!token) {
      setRowBusy(null);
      return;
    }
    const res = await postMealNlParse(nextText, token);
    setRowBusy(null);
    if (!res.ok) {
      if (res.error === "AI is not configured.") {
        const data = heuristicNlMealParse(nextText);
        setParseInput(nextText);
        setResult({ ...data, parseSource: "heuristic" });
        setText(nextText);
        return;
      }
      setErr("Couldn't re-parse — try again");
      return;
    }
    setParseInput(nextText);
    setResult(res.data);
    setText(nextText);
  }

  return (
    <div
      className={`rounded-xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-3 shadow-inner shadow-black/20 ${props.className ?? ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-zinc-100">Log a meal</p>
        <span
          className="inline-flex items-center gap-1.5 rounded-[20px] border px-2 py-0.5"
          style={{
            backgroundColor: "rgba(167,139,250,0.1)",
            borderColor: "rgba(167,139,250,0.2)",
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: PURPLE, boxShadow: `0 0 6px ${PURPLE}` }}
          />
          <span
            className="text-[9px] font-bold uppercase tracking-[1px]"
            style={{ color: PURPLE }}
          >
            Smart parse
          </span>
        </span>
      </div>

      {!loading ? (
        <div className="flex gap-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              resizeTa();
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void runParse();
              }
            }}
            placeholder={'Describe what you ate… e.g. dal and one portion of rice'}
            rows={1}
            className="min-h-[42px] max-h-[80px] flex-1 resize-none rounded-[9px] border border-zinc-700 bg-zinc-800/80 px-3 py-2.5 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-[rgba(167,139,250,0.45)] focus:outline-none focus:ring-1 focus:ring-[rgba(167,139,250,0.35)]"
          />
          <button
            type="button"
            disabled={loading || !text.trim()}
            onClick={onParseClick}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-[9px] px-3.5 py-2.5 text-[12px] font-bold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: PURPLE }}
          >
            <Sparkles className="h-[13px] w-[13px]" strokeWidth={2.5} />
            Parse
          </button>
        </div>
      ) : (
        <div className="space-y-2 py-1">
          <div className="h-0.5 overflow-hidden rounded-sm bg-zinc-800">
            <div
              className="nl-parse-bar-inner h-full w-[40%] rounded-sm"
              style={{
                background: `linear-gradient(90deg, transparent, ${PURPLE}, transparent)`,
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: PURPLE }}>
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin" strokeWidth={2} />
            {STATUS_LINES[statusIdx]}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {HINT_CHIPS.map((h) => (
          <button
            key={h.label}
            type="button"
            onClick={() => {
              setText(h.text);
              requestAnimationFrame(resizeTa);
            }}
            className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-[10px] text-zinc-400 transition hover:border-[rgba(167,139,250,0.35)] hover:text-[#A78BFA]"
          >
            {h.label}
          </button>
        ))}
      </div>

      {err ? (
        <div
          className="mt-2 flex items-start gap-2 rounded-r-lg border border-rose-500/20 py-2 pl-2 pr-3"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: RED,
            backgroundColor: "rgba(244,63,94,0.07)",
          }}
        >
          <AlertCircle className="mt-0.5 h-[13px] w-[13px] shrink-0 text-rose-400" strokeWidth={2} />
          <p className="text-[12px] text-rose-100">{err}</p>
        </div>
      ) : null}

      {result && !loading ? (
        <div className="mt-3 overflow-hidden rounded-[11px] border border-zinc-700/80 bg-zinc-800/40">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-700/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-zinc-100">{result.title}</p>
              {result.items.some((i) => !i.isInLibrary) ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded-[10px] border px-1.5 py-0.5 text-[9px]"
                  style={{
                    backgroundColor: "rgba(96,165,250,0.1)",
                    color: BLUE,
                    borderColor: "rgba(96,165,250,0.2)",
                  }}
                >
                  <Library className="h-2.5 w-2.5" strokeWidth={2} />
                  New to library
                </span>
              ) : null}
            </div>
            <span className="flex items-center gap-0.5 text-[10px]" style={{ color: confColor(result.confidence) }}>
              <Check className="h-3 w-3" strokeWidth={2.5} />
              {result.confidence}% confident
            </span>
          </div>

          {result.notes ? (
            <p className="border-b border-zinc-700/50 px-3 py-2 text-[10px] text-amber-200/90">{result.notes}</p>
          ) : null}

          <div className="divide-y divide-white/[0.04]">
            {result.items.map((item, i) => (
              <div key={`${item.name}-${i}`} className="flex gap-2 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-zinc-700 bg-zinc-900/80">
                  <HintIcon hint={item.icon_hint} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-zinc-100">{item.name}</p>
                  {rowEdit?.index === i ? (
                    <input
                      autoFocus
                      className="mt-1 w-20 rounded border border-[rgba(167,139,250,0.4)] bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-100"
                      value={rowEdit.value}
                      onChange={(e) => setRowEdit({ index: i, value: e.target.value })}
                      onBlur={() => void applyRowEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void applyRowEdit();
                      }}
                    />
                  ) : (
                    <p className="text-[10px] text-zinc-500">{item.quantity_description}</p>
                  )}
                  <p className="text-[10px] text-zinc-500">{item.protein_g}g protein</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] font-semibold" style={{ color: G2 }}>
                      {item.kcal} kcal
                    </span>
                    {rowBusy === i ? (
                      <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                    ) : (
                      <button
                        type="button"
                        className="rounded p-0.5 text-zinc-500 hover:text-sky-400"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => setRowEdit({ index: i, value: item.quantity_description })}
                      >
                        <Pencil className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(() => {
            const t = totals(result);
            return (
              <div
                className="grid grid-cols-4 gap-0 border-t border-zinc-700/80 px-3 py-2"
                style={{ backgroundColor: "rgba(61,219,122,0.05)" }}
              >
                {[
                  { label: "kcal", v: String(Math.round(t.kcal)) },
                  { label: "protein", v: `${t.protein}g` },
                  { label: "carbs", v: `${t.carbs}g` },
                  { label: "fat", v: `${t.fat}g` },
                ].map((cell, idx) => (
                  <div
                    key={cell.label}
                    className={`text-center ${idx > 0 ? "border-l border-zinc-700/80" : ""}`}
                  >
                    <p
                      className="text-base font-bold leading-tight text-emerald-400"
                      style={{ fontFamily: "var(--font-insight-display), ui-serif, serif" }}
                    >
                      {cell.v}
                    </p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">{cell.label}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2 border-t border-zinc-700/80 px-3 py-2.5">
            <button
              type="button"
              onClick={() => void confirmAdd()}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[12px] font-bold text-zinc-950 transition hover:-translate-y-px disabled:opacity-50"
              style={{ backgroundColor: G }}
            >
              <Check className="h-[13px] w-[13px]" strokeWidth={2.5} />
              Add to today&apos;s log
            </button>
            <button
              type="button"
              onClick={() => {
                taRef.current?.focus();
                setErr(null);
              }}
              className="flex items-center gap-1 rounded-[9px] border border-zinc-600 px-3 py-2 text-[12px] text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setText("");
                setErr(null);
              }}
              className="rounded-[9px] border border-zinc-600 px-2.5 py-2 text-zinc-500 transition hover:border-rose-500/30 hover:text-rose-400"
              aria-label="Discard"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}

      {success ? (
        <div
          className={`mt-2 flex gap-2 rounded-[10px] border border-emerald-500/20 px-3 py-2.5 transition-opacity duration-500 ${
            success.fading ? "opacity-0" : "opacity-100"
          }`}
          style={{ backgroundColor: "rgba(61,219,122,0.07)" }}
        >
          <Check className="h-[18px] w-[18px] shrink-0 text-emerald-400" strokeWidth={2} />
          <div>
            <p className="text-[12px] font-medium text-emerald-200">{success.title}</p>
            <p className="text-[10px] text-zinc-500">{success.subtitle}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
