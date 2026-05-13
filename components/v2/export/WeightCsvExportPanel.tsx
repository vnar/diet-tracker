"use client";

import { useCallback, useMemo } from "react";
import { Download } from "lucide-react";
import { dailyEntriesToWeightCsv } from "@/lib/exportWeightCsv";
import { useHealthStore } from "@/lib/store";
import { track } from "@/lib/analytics";
import { formatDateKeyLocal } from "@/lib/calculations";

export function WeightCsvExportPanel() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);

  const disabled = entries.length === 0;

  const filename = useMemo(() => {
    const day = formatDateKeyLocal(new Date());
    return `ojas-weight-history-${day}.csv`;
  }, []);

  const onDownload = useCallback(() => {
    if (disabled) return;
    const text = dailyEntriesToWeightCsv(entries, unit);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track("weight_csv_export", { rows: entries.length, unit });
  }, [disabled, entries, filename, unit]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <p className="text-xs text-zinc-400">
        Export morning/night weights and notes as CSV (opens in Excel, Sheets, Numbers).
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onDownload}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download CSV
      </button>
    </div>
  );
}
