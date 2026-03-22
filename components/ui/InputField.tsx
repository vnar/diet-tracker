import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  unit?: string;
  id: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  function InputField({ label, unit, id, className = "", ...rest }, ref) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          id={id}
          className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${className}`}
          {...rest}
        />
        {unit ? (
          <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
            {unit}
          </span>
        ) : null}
      </div>
    </label>
  );
  }
);

InputField.displayName = "InputField";
