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
        ? "mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-zinc-500"
        : "mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400";

    const inputClass =
      tone === "dark"
        ? "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/40"
        : "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

    const unitClass =
      tone === "dark"
        ? "shrink-0 text-sm text-zinc-500"
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
