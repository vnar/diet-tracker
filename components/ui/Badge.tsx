import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "danger" | "neutral";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  const styles =
    variant === "success"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : variant === "danger"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
        : variant === "neutral"
          ? "border-slate-500/50 bg-slate-900/60 text-slate-300"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}
