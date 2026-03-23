import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  unit?: string;
  id: string;
  /** Dark inputs for dashboard cards. */
  tone?: "default" | "dark";
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  function InputField(
    { label, unit, id, className = "", tone = "default", ...rest },
    ref
  ) {
    const labelClass =
      tone === "dark"
        ? "ui-label mb-2.5 block"
        : "mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400";

    const inputClass =
      tone === "dark"
        ? "w-full rounded-xl border border-slate-600 bg-slate-950/60 px-3 py-2 font-mono text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        : "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

    const unitClass =
      tone === "dark"
        ? "shrink-0 text-sm text-slate-400"
        : "shrink-0 text-sm text-zinc-500 dark:text-zinc-400";

    return (
      <label htmlFor={id} className="block">
        <span className={labelClass}>{label}</span>
        <div className="flex items-center gap-2">
          <input
            ref={ref}
            id={id}
            className={`${inputClass} ${className}`}
            {...rest}
          />
          {unit ? <span className={unitClass}>{unit}</span> : null}
        </div>
      </label>
    );
  }
);

InputField.displayName = "InputField";
