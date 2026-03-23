"use client";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
      <label
        htmlFor={id}
        className="min-w-0 truncate text-[11px] text-zinc-300 sm:text-xs"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          checked
            ? "bg-emerald-500"
            : "bg-zinc-700"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
