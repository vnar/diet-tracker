import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Elevated white card for dark “portal” backgrounds (dashboard). */
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
      ? "rounded-2xl border border-slate-200/90 bg-white p-5 text-slate-900 shadow-xl shadow-slate-900/10 dark:border-white/10 dark:shadow-black/35"
      : "rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";

  const titleClass =
    variant === "surface"
      ? "mb-3 font-semibold tracking-tight text-slate-800"
      : "mb-3 font-semibold tracking-tight text-zinc-900 dark:text-zinc-100";

  return (
    <div className={`${shell} ${className}`}>
      {title ? <h3 className={titleClass}>{title}</h3> : null}
      {children}
    </div>
  );
}
