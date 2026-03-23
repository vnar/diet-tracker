"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import { displayWeight, inputToKg, kgToInput } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry } from "@/lib/types";
import { useSaveEntry } from "@/hooks/useHealthActions";

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HistoryRow({
  entry,
  unit,
}: {
  entry: DailyEntry;
  unit: "kg" | "lbs";
}) {
  const saveEntry = useSaveEntry();
  const [morning, setMorning] = useState("");
  const [night, setNight] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMorning(String(kgToInput(entry.morningWeight, unit)));
    setNight(
      entry.nightWeight != null
        ? String(kgToInput(entry.nightWeight, unit))
        : ""
    );
    setErr(null);
  }, [entry, unit]);

  const morningNorm = String(kgToInput(entry.morningWeight, unit));
  const nightNorm =
    entry.nightWeight != null
      ? String(kgToInput(entry.nightWeight, unit))
      : "";
  const dirty = morning !== morningNorm || night !== nightNorm;

  const save = useCallback(async () => {
    const m = parseFloat(morning);
    if (Number.isNaN(m) || m <= 0) {
      setErr("Morning weight must be a positive number");
      return;
    }
    const mw = inputToKg(m, unit);
    const nwRaw = night.trim();
    const nwParsed = nwRaw === "" ? NaN : parseFloat(nwRaw);
    const nightWeight =
      nwRaw === "" || Number.isNaN(nwParsed)
        ? null
        : inputToKg(nwParsed, unit);

    setErr(null);
    setSaving(true);
    const next: DailyEntry = {
      ...entry,
      morningWeight: mw,
      nightWeight,
    };
    const r = await saveEntry(next);
    setSaving(false);
    if (!r.ok) setErr(r.error ?? "Save failed");
  }, [entry, morning, night, unit, saveEntry]);

  return (
    <tr className="group border-b border-zinc-800/50 align-middle transition-colors hover:bg-zinc-800/20">
      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-zinc-400">
        {formatDisplayDate(entry.date)}
      </td>
      <td className="py-2 pr-3">
        <div className="relative w-24">
          <input
            type="text"
            inputMode="decimal"
            value={morning}
            onChange={(e) => setMorning(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 pr-7 text-xs font-mono text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            aria-label={`Morning weight ${entry.date}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
            {unit}
          </span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="relative w-24">
          <input
            type="text"
            inputMode="decimal"
            value={night}
            onChange={(e) => setNight(e.target.value)}
            placeholder="—"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 pr-7 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            aria-label={`Night weight ${entry.date}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">
            {unit}
          </span>
        </div>
      </td>
      <td className="py-2 pr-3">
        {entry.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.photoUrl}
            alt=""
            className="h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-800" />
        )}
      </td>
      <td className="py-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="h-7 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 text-[11px] font-medium text-zinc-300 opacity-0 transition-all hover:border-transparent hover:bg-emerald-500 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving ? "…" : "Save"}
        </button>
        {err ? (
          <p className="mt-1 max-w-[140px] text-[11px] text-rose-400">{err}</p>
        ) : null}
      </td>
    </tr>
  );
}

export function WeightHistoryTable() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const [open, setOpen] = useState(false);

  const rows = [...sortEntriesByDateAsc(entries)].reverse();

  if (rows.length === 0) {
    return (
      <Card variant="surface">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between"
          aria-expanded={open}
        >
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">History</h3>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {open ? (
          <p className="mt-3 text-sm text-slate-400">
            No entries yet. Log your morning weight above to build your history.
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card variant="surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
        aria-expanded={open}
      >
        <h3 className="text-sm font-semibold tracking-tight text-zinc-100">History</h3>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-left">
                  <th className="pb-3 pr-4 text-[9px] font-medium uppercase tracking-widest text-zinc-500">Date</th>
                  <th className="pb-3 pr-4 text-[9px] font-medium uppercase tracking-widest text-zinc-500">Morning</th>
                  <th className="pb-3 pr-4 text-[9px] font-medium uppercase tracking-widest text-zinc-500">Night</th>
                  <th className="pb-3 pr-4 text-[9px] font-medium uppercase tracking-widest text-zinc-500">Photo</th>
                  <th className="w-16 pb-3 text-[9px] font-medium uppercase tracking-widest text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <HistoryRow key={e.id} entry={e} unit={unit} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 border-t border-zinc-800/60 pt-3 text-xs text-zinc-500">
            Newest first. Edit weights inline, then Save. Clear night field and save
            to remove night weight.
          </p>
        </>
      ) : null}
    </Card>
  );
}
