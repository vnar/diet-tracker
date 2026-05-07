"use client";

import {
  getEntryForDate,
  getYesterdayKey,
  priorLoggedEntry,
  rollingSevenDayAverage,
  sevenDayAvgDeltaVsPriorWeek,
  weightDeltaKg,
  daysUntilTarget,
} from "@/lib/calculations";
import { displayWeight, kgToLbs } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";

function fmtDelta(kgDelta: number, unit: "kg" | "lbs"): string {
  const v = unit === "kg" ? kgDelta : kgToLbs(kgDelta);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} ${unit}`;
}

function deltaClass(kgDelta: number | null): string {
  if (kgDelta === null) return "text-slate-400";
  if (kgDelta > 0) return "text-rose-400";
  if (kgDelta < 0) return "text-emerald-400";
  return "text-slate-400";
}

/** For week-over-week *average* change: negative kg delta = average dropped (usually good). */
function weekAvgDeltaClass(kgDelta: number | null): string {
  if (kgDelta === null) return "text-slate-400";
  if (kgDelta < 0) return "text-emerald-400";
  if (kgDelta > 0) return "text-rose-400";
  return "text-slate-400";
}

function formatGoalDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const GOAL_DATE_TOOLTIP =
  "This date is the goal deadline saved in your settings — it is not calculated from your weight. The countdown above is calendar days from today to that date.";

const GOAL_DATE_PAST_TOOLTIP =
  "That goal date is still the one stored in your settings; update it there if you want a new deadline.";

export function DashboardKpiRow() {
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const today = useClientTodayKey();
  const yKey = today ? getYesterdayKey(today) : "";
  const todayEntry = today ? getEntryForDate(entries, today) : undefined;
  const yesterdayEntry =
    today && yKey ? (entries.find((e) => e.date === yKey) ?? null) : null;

  const u = settings.unit;
  const currentKg = todayEntry?.morningWeight;
  const comparisonEntry =
    today && todayEntry
      ? (yesterdayEntry ?? priorLoggedEntry(entries, today))
      : null;
  const dayDelta =
    todayEntry && comparisonEntry
      ? weightDeltaKg(todayEntry, comparisonEntry)
      : null;

  const sevenAvg =
    today ? rollingSevenDayAverage(entries, today) : null;
  const weekAvgDelta =
    today ? sevenDayAvgDeltaVsPriorWeek(entries, today) : null;

  const remainingKg =
    currentKg !== undefined
      ? Math.abs(settings.goalWeight - currentKg)
      : null;

  const daysLeft = today
    ? daysUntilTarget(settings.targetDate, today)
    : null;

  const kpis: Array<{
    title: string;
    value: string;
    sub: string;
    subClass: string;
    subTooltip?: string;
  }> = [
    {
      title: "Today's weight",
      value:
        currentKg !== undefined
          ? `${displayWeight(currentKg, u)} ${u}`
          : "—",
      sub:
        dayDelta !== null
          ? yesterdayEntry
            ? `${fmtDelta(dayDelta, u)} since yesterday`
            : `${fmtDelta(dayDelta, u)} vs prior weigh-in`
          : "Log morning weight",
      subClass: deltaClass(dayDelta),
    },
    {
      title: "7-day average",
      value:
        sevenAvg !== null
          ? `${displayWeight(sevenAvg, u)} ${u}`
          : "—",
      sub:
        weekAvgDelta !== null
          ? `${fmtDelta(weekAvgDelta, u)} vs prior week`
          : "Needs a few weeks of data",
      subClass: weekAvgDeltaClass(weekAvgDelta),
    },
    {
      title: "Target",
      value: `${displayWeight(settings.goalWeight, u)} ${u}`,
      sub:
        remainingKg !== null
          ? `${displayWeight(remainingKg, u)} ${u} to go`
          : "—",
      subClass: "text-amber-400",
    },
    {
      title: "Countdown to goal date",
      value:
        daysLeft === null
          ? "—"
          : daysLeft < 0
            ? "Date passed"
            : daysLeft === 0
              ? "Due today"
              : daysLeft === 1
                ? "1 day left"
                : `${daysLeft} days left`,
      sub:
        daysLeft !== null && daysLeft >= 0
          ? `Target: ${formatGoalDate(settings.targetDate)}`
          : daysLeft !== null && daysLeft < 0
            ? `Was ${formatGoalDate(settings.targetDate)} — update target in settings`
            : "Log today and set a target date in settings",
      subClass:
        daysLeft !== null && daysLeft >= 0
          ? "text-emerald-400"
          : "text-zinc-400",
      subTooltip:
        daysLeft !== null && daysLeft >= 0
          ? GOAL_DATE_TOOLTIP
          : daysLeft !== null && daysLeft < 0
            ? GOAL_DATE_PAST_TOOLTIP
            : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[13px] border p-4" style={{ background: "var(--s1)", borderColor: "rgba(61,219,122,0.14)" }}>
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-[110px] w-[110px]"
          style={{ background: "radial-gradient(circle, rgba(61,219,122,0.1) 0%, transparent 70%)" }}
        />
        <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--mu)" }}>
          Today&apos;s weight
        </p>
        <div className="mt-1 flex items-end gap-2">
          <p style={{ fontFamily: '"Playfair Display", serif', fontSize: 46, fontWeight: 700, letterSpacing: "-2px", color: "var(--g)", lineHeight: 1 }}>
            {currentKg !== undefined ? displayWeight(currentKg, u) : "—"}
          </p>
          <span className="pb-1 text-[17px] font-light" style={{ color: "var(--g2)" }}>{u}</span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-[10px] border px-2 py-1 text-[11px] font-medium" style={{ background: "var(--g3)", borderColor: "rgba(61,219,122,0.15)", color: "var(--g)" }}>
          <span>▾</span>
          <span>{dayDelta !== null ? fmtDelta(dayDelta, u) : "No delta yet"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2" style={{ background: "rgba(0,0,0,0.22)", borderColor: "var(--b)" }}>
            <p className="text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--mu)" }}>7-day avg</p>
            <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--txt)" }}>
              {sevenAvg !== null ? `${displayWeight(sevenAvg, u)} ${u}` : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-2" style={{ background: "rgba(0,0,0,0.22)", borderColor: "var(--b)" }}>
            <p className="text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--mu)" }}>Target</p>
            <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--warn)" }}>
              {displayWeight(settings.goalWeight, u)} {u}
            </p>
            <p className="text-[9px]" style={{ color: "var(--mu)" }}>
              {remainingKg !== null ? `${displayWeight(remainingKg, u)} left` : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[13px] border p-3" style={{ background: "var(--s1)", borderColor: "var(--b)" }}>
        {(() => {
          const denom = settings.startWeight - settings.goalWeight;
          const numer = settings.startWeight - (currentKg ?? settings.startWeight);
          const rawPct = denom !== 0 ? (numer / denom) * 100 : 0;
          const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
          const circumference = 144.5;
          const dashOffset = circumference * (1 - pct / 100);
          const dateSet = new Set(entries.map((e) => e.date));
          const streak = Array.from({ length: 14 }).map((_, i) => {
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            d.setDate(d.getDate() - (13 - i));
            const iso = d.toISOString().slice(0, 10);
            return dateSet.has(iso);
          });
          return (
            <>
              <div className="flex items-center gap-3">
                <svg width="58" height="58" viewBox="0 0 58 58" className="shrink-0">
                  <defs>
                    <linearGradient id="goalRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3DDB7A" />
                      <stop offset="100%" stopColor="#6EE89A" />
                    </linearGradient>
                  </defs>
                  <circle cx="29" cy="29" r="23" fill="none" stroke="rgba(61,219,122,0.1)" strokeWidth="6" />
                  <circle
                    cx="29"
                    cy="29"
                    r="23"
                    fill="none"
                    stroke="url(#goalRingGrad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    transform="rotate(-90 29 29)"
                    strokeDasharray={144.5}
                    strokeDashoffset={dashOffset}
                  />
                  <text x="29" y="32" textAnchor="middle" style={{ fontFamily: '"Playfair Display", serif', fontSize: 12, fontWeight: 700, fill: "var(--g)" }}>
                    {pct}%
                  </text>
                </svg>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--txt)" }}>
                    {(settings.startWeight - (currentKg ?? settings.startWeight)).toFixed(1)} {u} lost
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--mu)" }}>
                    {remainingKg !== null ? `${displayWeight(remainingKg, u)} to goal` : "—"} ·{" "}
                    {daysLeft !== null ? `${Math.max(0, daysLeft)} days` : "—"} · {formatGoalDate(settings.targetDate)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--mu)" }}>
                Logging streak
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {streak.map((on, i) => (
                  <span
                    key={i}
                    className="h-[11px] w-[11px] rounded-[3px]"
                    style={{ background: on ? "var(--g)" : "rgba(61,219,122,0.12)" }}
                  />
                ))}
              </div>
            </>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {kpis.slice(1).map((k) => (
          <div
            key={k.title}
            className="rounded-lg border p-2"
            style={{ background: "var(--s2)", borderColor: "var(--b)" }}
          >
            <p className="text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--mu)" }}>{k.title}</p>
            <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--txt)" }}>{k.value}</p>
            <p className={`text-[10px] ${k.subTooltip ? "cursor-help" : ""}`} style={{ color: "var(--mu)" }} title={k.subTooltip}>
              {k.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
