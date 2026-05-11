"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

type HelpHintProps = {
  /** Short topic for assistive tech, e.g. "Today's weight" */
  topic: string;
  children: ReactNode;
  className?: string;
};

/**
 * Compact “?” control that opens a short explanation (tap / click). Closes on outside click or Escape.
 */
export function HelpHint({ topic, children, className = "" }: HelpHintProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex shrink-0 align-middle ${className}`}>
      <button
        type="button"
        className="-m-0.5 rounded p-0.5 text-zinc-500 outline-none ring-offset-2 ring-offset-zinc-900 transition hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-emerald-500/80"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Help: ${topic}`}
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          id={panelId}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+6px)] z-[80] w-[min(288px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-zinc-300 shadow-xl"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
