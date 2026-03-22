"use client";

import {
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
    <Card title="Weight trend">
      <div className="relative h-[260px] w-full">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-950/50">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Log at least 2 days to see your trend
            </p>
            <svg
              className="mt-4 h-12 w-full max-w-xs text-zinc-300 dark:text-zinc-600"
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
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-zinc-200 dark:stroke-zinc-800"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                stroke="currentColor"
              />
              <YAxis
                domain={domain}
                width={44}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                stroke="currentColor"
                tickFormatter={(v: number) => displayWeight(v, unit)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {p.label}
                      </p>
                      <p className="font-mono text-zinc-600 dark:text-zinc-300">
                        Weight: {displayWeight(p.weight ?? 0, unit)} {unit}
                      </p>
                      {p.avg !== null ? (
                        <p className="font-mono text-emerald-600 dark:text-emerald-400">
                          7d avg: {displayWeight(p.avg, unit)} {unit}
                        </p>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#71717a"
                strokeWidth={1}
                dot={false}
                strokeDasharray="4 4"
                name="Daily"
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="7-day avg"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
