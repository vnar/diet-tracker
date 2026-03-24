"use client";

import { Check } from "lucide-react";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}

export function Toggle({ id, label, checked, onChange, className }: ToggleProps) {
  return (
    <div
      className={`rounded-lg ${className ?? ""}`}
    >
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
          checked
            ? "border-emerald-400/50 bg-emerald-500/15"
            : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
        }`}
      >
        <span className="min-w-0 text-[13px] font-medium text-zinc-100">{label}</span>
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            checked
              ? "border-emerald-400 bg-emerald-500 text-white"
              : "border-zinc-600 bg-zinc-800 text-zinc-500"
          }`}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
      </button>
    </div>
  );
}
