import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {title ? (
        <h3 className="mb-3 font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}
