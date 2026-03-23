"use client";

import { useCallback, useEffect, useState } from "react";
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
    <tr className="border-b border-slate-600/50 align-middle">
      <td className="whitespace-nowrap py-3 pr-4 text-sm font-medium text-slate-300">
        {formatDisplayDate(entry.date)}
      </td>
      <td className="py-2 pr-3">
        <input
          type="text"
          inputMode="decimal"
          value={morning}
          onChange={(e) => setMorning(e.target.value)}
          className="w-full min-w-[5rem] rounded-lg border border-slate-600 bg-slate-950/60 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          aria-label={`Morning weight ${entry.date}`}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          type="text"
          inputMode="decimal"
          value={night}
          onChange={(e) => setNight(e.target.value)}
          placeholder="—"
          className="w-full min-w-[5rem] rounded-lg border border-slate-600 bg-slate-950/60 px-2 py-1.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          aria-label={`Night weight ${entry.date}`}
        />
      </td>
      <td className="py-2 pr-3">
        {entry.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.photoUrl}
            alt=""
            className="h-12 w-12 rounded-lg border border-slate-600 object-cover"
          />
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </td>
      <td className="py-2">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-35"
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

  const rows = [...sortEntriesByDateAsc(entries)].reverse();

  if (rows.length === 0) {
    return (
      <Card title="History" variant="surface">
        <p className="text-sm text-slate-400">
          No entries yet. Log your morning weight above to build your history.
        </p>
      </Card>
    );
  }

  return (
    <Card title="History — editable" variant="surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-600/80 text-left">
              <th className="ui-overline pb-4 pr-4 text-left">Date</th>
              <th className="ui-overline pb-4 pr-4 text-left">
                Morning ({unit})
              </th>
              <th className="ui-overline pb-4 pr-4 text-left">
                Night ({unit})
              </th>
              <th className="ui-overline pb-4 pr-4 text-left">Photo</th>
              <th className="ui-overline w-28 pb-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <HistoryRow key={e.id} entry={e} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 border-t border-slate-600/40 pt-5 text-[13px] font-medium leading-relaxed text-slate-500">
        Newest first. Edit weights inline, then Save. Clear night field and save
        to remove night weight.
      </p>
    </Card>
  );
}
