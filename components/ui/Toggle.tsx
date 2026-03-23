"use client";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label
        htmlFor={id}
        className="truncate text-xs text-zinc-400"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 flex-shrink-0 rounded-full transition-colors duration-200 ${
          checked
            ? "bg-emerald-500"
            : "bg-zinc-700"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
