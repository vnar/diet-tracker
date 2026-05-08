import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  unit?: string;
  id: string;
  /** Dark inputs for dashboard cards. */
  tone?: "default" | "dark";
  /** Shown between the input and the unit (e.g. photo button). */
  trailingAccessory?: ReactNode;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  function InputField(
    { label, unit, id, className = "", tone = "default", trailingAccessory, ...rest },
    ref
  ) {
    const labelClass =
      tone === "dark"
        ? "mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-zinc-500"
        : "mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-400";

    const unitClass =
      tone === "dark"
        ? "shrink-0 text-sm text-zinc-500"
        : "shrink-0 text-sm text-zinc-500 dark:text-zinc-400";

    if (trailingAccessory) {
      const inputRowClass =
        tone === "dark"
          ? "flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none transition-all duration-200 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/40"
          : "flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-within:border-emerald-600";
      const innerInputClass =
        tone === "dark"
          ? `w-full min-w-0 flex-1 border-0 bg-transparent py-0.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none ${className}`
          : `w-full min-w-0 flex-1 border-0 bg-transparent py-0.5 font-mono text-sm text-zinc-900 outline-none dark:text-zinc-100 ${className}`;
      return (
        <div className="block min-w-0">
          <label htmlFor={id} className="block min-w-0">
            <span className={labelClass}>{label}</span>
          </label>
          <div className="flex min-w-0 flex-col gap-2">
            <div className={inputRowClass}>
              <input
                ref={ref}
                id={id}
                className={innerInputClass}
                {...rest}
              />
              {unit ? <span className={unitClass}>{unit}</span> : null}
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-start gap-1.5">
              {trailingAccessory}
            </div>
          </div>
        </div>
      );
    }

    const inputClass =
      tone === "dark"
        ? `w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all duration-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/40`
        : `w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500`;

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
