"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/Card";
import {
  sortEntriesByDateAsc,
  sevenDayMovingAverageSeries,
} from "@/lib/calculations";
import { displayWeight } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import { track } from "@/lib/analytics";

interface Row {
  date: string;
  label: string;
  weight: number | null;
  avg: number | null;
  targetPath: number | null;
}

function formatTick(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WeightChart() {
  const chartSectionRef = useRef<HTMLDivElement>(null);
  const hasTrackedChartView = useRef(false);
  const gradId = useId().replace(/:/g, "");
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const settingsStartWeight = useHealthStore((s) => s.settings.startWeight);
  const goalWeight = useHealthStore((s) => s.settings.goalWeight);
  const targetDate = useHealthStore((s) => s.settings.targetDate);
  const [range, setRange] = useState<"1M" | "3M" | "ALL">("3M");

  const sorted = sortEntriesByDateAsc(entries);
  const rangeSorted = useMemo(() => {
    if (range === "ALL") return sorted;
    const keep = range === "1M" ? 30 : 90;
    return sorted.slice(-keep);
  }, [sorted, range]);
  const startWeight = rangeSorted[0]?.morningWeight ?? settingsStartWeight;
  const ma = sevenDayMovingAverageSeries(rangeSorted);
  const maByDate = new Map(ma.map((m) => [m.date, m.avg]));

  const rows: Row[] = rangeSorted.map((e) => ({
    date: e.date,
    label: formatTick(e.date),
    weight: e.morningWeight,
    avg: maByDate.get(e.date) ?? null,
    targetPath: null,
  }));

  const lastLoggedWeight = rangeSorted[rangeSorted.length - 1]?.morningWeight;
  const lastLoggedDate = rangeSorted[rangeSorted.length - 1]?.date;
  if (lastLoggedWeight !== undefined && lastLoggedDate) {
    const rowByDate = new Map(rows.map((r) => [r.date, r]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const goal = new Date(`${targetDate}T12:00:00`);

    if (!Number.isNaN(goal.getTime()) && goal.getTime() > today.getTime()) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const totalDays = Math.max(1, Math.round((goal.getTime() - today.getTime()) / msPerDay));

      const setProjectionPoint = (d: Date) => {
        const daysFromToday = Math.max(0, Math.round((d.getTime() - today.getTime()) / msPerDay));
        const t = Math.min(1, daysFromToday / totalDays);
        const expected = lastLoggedWeight + (goalWeight - lastLoggedWeight) * t;
        const dateKey = d.toISOString().slice(0, 10);
        const existing = rowByDate.get(dateKey);
        if (existing) {
          existing.targetPath = expected;
          return;
        }
        const futureRow: Row = {
          date: dateKey,
          label: formatTick(dateKey),
          weight: null,
          avg: null,
          targetPath: expected,
        };
        rows.push(futureRow);
        rowByDate.set(dateKey, futureRow);
      };

      setProjectionPoint(today);
      for (let d = new Date(today.getTime() + 7 * msPerDay); d < goal; d = new Date(d.getTime() + 7 * msPerDay)) {
        setProjectionPoint(d);
      }
      setProjectionPoint(goal);

      rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
  }

  const weights = rows
    .flatMap((r) => [r.weight, r.avg, r.targetPath])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minW = weights.length ? Math.min(...weights) : 0;
  const maxW = weights.length ? Math.max(...weights) : 1;
  const pad = 1;
  let low = minW - pad;
  let high = maxW + pad;
  if (low >= high) {
    low -= 0.5;
    high += 0.5;
  }
  const domain: [number, number] = [low, high];

  const empty = rangeSorted.length < 2;

  useEffect(() => {
    const el = chartSectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (hasTrackedChartView.current) return;

    const observer = new IntersectionObserver(
      (entriesObs) => {
        if (hasTrackedChartView.current) return;
        const entry = entriesObs[0];
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.2) return;
        hasTrackedChartView.current = true;
        const state = useHealthStore.getState();
        const sortedNow = sortEntriesByDateAsc(state.entries);
        track("chart_viewed", {
          chart: "weight_trend",
          entry_count: sortedNow.length,
          has_trend_line: sortedNow.length >= 2,
        });
        observer.disconnect();
      },
      { threshold: [0, 0.2, 0.35, 0.5], rootMargin: "0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={chartSectionRef} className="w-full">
    <Card variant="surface" className="overflow-hidden rounded-[13px] border [background:var(--s1)] [border-color:var(--b)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--txt)" }}>Weight journey</h3>
          <p className="text-[10px]" style={{ color: "var(--mu)" }}>{displayWeight(startWeight, unit)} → {displayWeight(goalWeight, unit)} {unit} target</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border p-0.5" style={{ borderColor: "var(--b)" }}>
          {(["1M", "3M", "ALL"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium transition"
              style={range === r ? { background: "var(--g3)", color: "var(--g)" } : { color: "var(--mu)" }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--g3)", borderColor: "rgba(61,219,122,0.18)", color: "var(--g)" }}>
        🏆 {(Math.max(0, Math.min(100, ((startWeight - (rangeSorted[rangeSorted.length - 1]?.morningWeight ?? startWeight)) / Math.max(0.0001, startWeight - goalWeight)) * 100))).toFixed(0)}% to goal
      </div>
      <div className="relative h-[280px] w-full">
        {empty ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-3">
            <svg
              width="160"
              height="24"
              viewBox="0 0 160 24"
              className="opacity-20"
            >
              <path
                d="M 0,12 Q 20,4 40,12 Q 60,20 80,12 Q 100,4 120,12 Q 140,20 160,12"
                fill="none"
                stroke="#71717a"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            </svg>
            <p className="text-xs text-zinc-600">Log at least 2 days to see your trend</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3DDB7A" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#3DDB7A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "rgba(220,238,226,0.32)" }}
                stroke="transparent"
              />
              <YAxis
                domain={domain}
                width={48}
                tick={{ fontSize: 10, fill: "rgba(220,238,226,0.32)" }}
                stroke="transparent"
                tickFormatter={(v: number) => `${displayWeight(v, unit)} ${unit}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  return (
                    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm shadow-xl">
                      <p className="font-medium text-slate-100">{p.label}</p>
                      {p.weight !== null ? (
                        <p className="font-mono text-slate-300">
                          Daily: {displayWeight(p.weight, unit)} {unit}
                        </p>
                      ) : null}
                      {p.avg !== null ? (
                        <p className="font-mono text-emerald-400">
                          7-point avg: {displayWeight(p.avg, unit)} {unit}
                        </p>
                      ) : null}
                      {p.targetPath !== null ? (
                        <p className="font-mono text-orange-400">
                          Weekly target: {displayWeight(p.targetPath, unit)} {unit}
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="weight"
                stroke="#3DDB7A"
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={{ r: 2, fill: "#3DDB7A", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Daily"
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="rgba(61,219,122,0.5)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                name="7-day avg"
              />
              <Line
                type="monotone"
                dataKey="targetPath"
                stroke="rgba(249,115,22,0.65)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={{ r: 0, fill: "#f97316", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Goal path"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {!empty ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3" style={{ borderColor: "var(--b)" }}>
          <span className="inline-flex items-center gap-2 text-[10px] font-medium" style={{ color: "var(--mu)" }}>
            <span className="h-2 w-5 rounded-sm" style={{ background: "#3DDB7A" }} aria-hidden />
            Daily weight
          </span>
          <span className="inline-flex items-center gap-2 text-[10px] font-medium" style={{ color: "var(--mu)" }}>
            <span
              className="h-0.5 w-5 border-t-2 border-dashed"
              style={{ borderColor: "rgba(61,219,122,0.5)" }}
              aria-hidden
            />
            Rolling average (last 7 logs)
          </span>
          <span className="inline-flex items-center gap-2 text-[10px] font-medium" style={{ color: "var(--mu)" }}>
            <span
              className="h-0.5 w-5 border-t-2 border-dashed"
              style={{ borderColor: "rgba(249,115,22,0.65)" }}
              aria-hidden
            />
            Weekly target path to goal
          </span>
        </div>
      ) : null}
    </Card>
    </div>
  );
}
