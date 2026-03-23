import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Dark elevated panel for the dashboard (always dark, readable on blue/slate page). */
  variant?: "default" | "surface";
}

export function Card({
  title,
  children,
  className = "",
  variant = "default",
}: CardProps) {
  const shell =
    variant === "surface"
      ? "rounded-2xl border border-slate-600/50 bg-slate-800/95 p-6 text-slate-100 shadow-xl shadow-black/45 backdrop-blur-sm sm:p-7"
      : "rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-7";

  const titleClass =
    variant === "surface"
      ? "ui-card-title mb-4 border-b border-slate-600/40 pb-4"
      : "mb-4 border-b border-zinc-200 pb-4 text-lg font-semibold leading-snug tracking-[-0.02em] text-zinc-900 dark:border-zinc-800 dark:text-zinc-100";

  return (
    <div className={`${shell} ${className}`}>
      {title ? <h3 className={titleClass}>{title}</h3> : null}
      {children}
    </div>
  );
}
