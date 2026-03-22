"use client";

import { Card } from "@/components/ui/Card";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import { displayWeight } from "@/lib/units";
import { useHealthStore } from "@/lib/store";

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function WeightHistoryTable() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);

  const rows = [...sortEntriesByDateAsc(entries)].reverse();

  if (rows.length === 0) {
    return (
      <Card title="History" variant="surface">
        <p className="text-sm text-slate-500">
          No entries yet. Log your morning weight above to build your history.
        </p>
      </Card>
    );
  }

  return (
    <Card title="History — weight & photos" variant="surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4">Morning</th>
              <th className="pb-3 pr-4">Night</th>
              <th className="pb-3">Photo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className="border-b border-zinc-100 dark:border-zinc-800/80"
              >
                <td className="py-3 pr-4 align-middle text-zinc-800 dark:text-zinc-200">
                  {formatDisplayDate(e.date)}
                </td>
                <td className="py-3 pr-4 align-middle font-mono text-zinc-900 dark:text-zinc-100">
                  {displayWeight(e.morningWeight, unit)} {unit}
                </td>
                <td className="py-3 pr-4 align-middle font-mono text-zinc-700 dark:text-zinc-300">
                  {e.nightWeight !== undefined
                    ? `${displayWeight(e.nightWeight, unit)} ${unit}`
                    : "—"}
                </td>
                <td className="py-3 align-middle">
                  {e.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.photoUrl}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Newest first. Compare morning weight and progress photos side by side.
      </p>
    </Card>
  );
}
