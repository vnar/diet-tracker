"use client";

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
}

function formatTick(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WeightChart() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const startWeight = useHealthStore((s) => s.settings.startWeight);

  const sorted = sortEntriesByDateAsc(entries);
  const ma = sevenDayMovingAverageSeries(sorted);
  const maByDate = new Map(ma.map((m) => [m.date, m.avg]));

  const rows: Row[] = sorted.map((e) => ({
    date: e.date,
    label: formatTick(e.date),
    weight: e.morningWeight,
    avg: maByDate.get(e.date) ?? null,
  }));

  const weights = sorted.map((e) => e.morningWeight);
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
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="!mb-0 text-lg font-semibold text-slate-800">Weight trend</h3>
        <p className="text-xs text-slate-500">
          Starting weight{" "}
          <span className="font-mono font-medium text-slate-700">
            {displayWeight(startWeight, unit)} {unit}
          </span>
        </p>
      </div>
      <div className="relative mt-3 h-[280px] w-full">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
            <p className="text-center text-sm text-slate-500">
              Log at least 2 days to see your trend
            </p>
            <svg
              className="mt-4 h-12 w-full max-w-xs text-slate-300"
              preserveAspectRatio="none"
              viewBox="0 0 200 40"
            >
              <path
                d="M0,30 Q50,10 100,25 T200,15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#cbd5e1"
              />
              <YAxis
                domain={domain}
                width={48}
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#cbd5e1"
                tickFormatter={(v: number) => displayWeight(v, unit)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
                      <p className="font-medium text-slate-900">{p.label}</p>
                      <p className="font-mono text-slate-600">
                        Daily: {displayWeight(p.weight ?? 0, unit)} {unit}
                      </p>
                      {p.avg !== null ? (
                        <p className="font-mono text-emerald-600">
                          7-day avg: {displayWeight(p.avg, unit)} {unit}
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
                fill="url(#weightArea)"
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
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {!empty ? (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-blue-600" aria-hidden />
            Daily weight
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500"
              aria-hidden
            />
            7-day average
          </span>
        </div>
      ) : null}
    </Card>
  );
}
