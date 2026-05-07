"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  /**
   * `positive` — checked means a good habit (e.g. workout): success styling when checked.
   * `negative` — checked means the “bad” option (e.g. had alcohol): success styling when unchecked.
   */
  habitPolarity?: "positive" | "negative";
}

export function Toggle({
  id,
  label,
  checked,
  onChange,
  className,
  habitPolarity = "positive",
}: ToggleProps) {
  /** Row tint: on = filled; “negative” habits use amber when that option is on (e.g. had alcohol). */
  const rowClass = !checked
    ? "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
    : habitPolarity === "positive"
      ? "border-emerald-400/55 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
      : "border-amber-500/45 bg-amber-500/10";

  const iconWrapClass = !checked
    ? "border-zinc-600 bg-zinc-900/50"
    : habitPolarity === "positive"
      ? "border-emerald-400 bg-emerald-500 text-white"
      : "border-amber-400/80 bg-amber-600/35 text-white";

  return (
    <div className={`rounded-lg ${className ?? ""}`}>
      <motion.button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        whileTap={{ scale: 0.97 }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${rowClass}`}
      >
        <span className="min-w-0 text-[13px] font-medium text-zinc-100">{label}</span>
        <motion.span
          key={`${id}-${checked}`}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${iconWrapClass}`}
          aria-hidden
          initial={{ scale: 0.88, opacity: 0.85 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 26 }}
        >
          {checked ? (
            <Check className="h-3 w-3" strokeWidth={2.5} />
          ) : null}
        </motion.span>
      </motion.button>
    </div>
  );
}
