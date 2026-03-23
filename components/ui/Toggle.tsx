"use client";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/50 bg-slate-900/40 px-3 py-2.5">
      <label
        htmlFor={id}
        className="cursor-pointer select-none text-sm font-semibold tracking-wide text-slate-200"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-[3.25rem] shrink-0 rounded-full border-2 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          checked
            ? "border-emerald-400/80 bg-emerald-500/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            : "border-slate-500/80 bg-slate-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform duration-200 ease-out ${
            checked ? "translate-x-[1.35rem]" : "translate-x-0.5"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              checked ? "bg-emerald-500" : "bg-slate-400"
            }`}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
}
