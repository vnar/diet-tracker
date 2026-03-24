"use client";

import { useId } from "react";
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
  const gradId = useId().replace(/:/g, "");
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const settingsStartWeight = useHealthStore((s) => s.settings.startWeight);
  const goalWeight = useHealthStore((s) => s.settings.goalWeight);
  const targetDate = useHealthStore((s) => s.settings.targetDate);

  const sorted = sortEntriesByDateAsc(entries);
  const startWeight = sorted[0]?.morningWeight ?? settingsStartWeight;
  const ma = sevenDayMovingAverageSeries(sorted);
  const maByDate = new Map(ma.map((m) => [m.date, m.avg]));

  const rows: Row[] = sorted.map((e) => ({
    date: e.date,
    label: formatTick(e.date),
    weight: e.morningWeight,
    avg: maByDate.get(e.date) ?? null,
    targetPath: null,
  }));

  const lastLoggedWeight = sorted[sorted.length - 1]?.morningWeight;
  const lastLoggedDate = sorted[sorted.length - 1]?.date;
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

  const empty = sorted.length < 2;

  return (
    <Card variant="surface" className="overflow-hidden">
      <div className="-mt-0.5 mb-6 flex flex-col gap-4 border-b border-slate-600/40 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <h3 className="ui-card-title-lg shrink-0">Weight trend</h3>
        <div className="flex flex-col gap-1 sm:items-end sm:text-right">
          <p className="ui-overline">Starting weight</p>
          <p className="ui-metric text-xl font-semibold leading-none text-slate-50">
            {displayWeight(startWeight, unit)} {unit}
          </p>
        </div>
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
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                stroke="#64748b"
              />
              <YAxis
                domain={domain}
                width={48}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                stroke="#64748b"
                tickFormatter={(v: number) => displayWeight(v, unit)}
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
                stroke="#2563eb"
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Daily"
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                name="7-day avg"
              />
              <Line
                type="monotone"
                dataKey="targetPath"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="Goal path"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {!empty ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-600/50 pt-5">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="h-2 w-5 rounded-sm bg-blue-500" aria-hidden />
            Daily weight
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-400">
            <span
              className="h-0.5 w-5 border-t-2 border-dashed border-emerald-400"
              aria-hidden
            />
            Rolling average (last 7 logs)
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-400">
            <span
              className="h-0.5 w-5 border-t-2 border-dashed border-orange-400"
              aria-hidden
            />
            Weekly target path to goal
          </span>
        </div>
      ) : null}
    </Card>
  );
}
