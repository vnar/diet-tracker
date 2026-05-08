"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { NaturalMealInput } from "@/components/v2/meals/NaturalMealInput";

type Props = {
  day: string;
  getAccessToken: () => string | null;
  onLogged: () => void;
  compact?: boolean;
};

export function NaturalMealSheet(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className={props.compact ? "group relative" : "mb-3"}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            props.compact
              ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
              : "inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/20"
          }
          aria-label="Log meal with AI"
          title={props.compact ? "Log meal with AI" : undefined}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {props.compact ? null : "Log meal with AI"}
        </button>
        {props.compact ? (
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            Log meal with AI
          </span>
        ) : null}
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-end justify-center bg-black/70 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl"
              >
                <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                  <p className="text-sm font-semibold text-zinc-100">Log a meal (AI)</p>
                  <button
                    type="button"
                    className="rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <NaturalMealInput
                  day={props.day}
                  getAccessToken={props.getAccessToken}
                  onLogged={() => {
                    props.onLogged();
                    setOpen(false);
                  }}
                  className="mb-0 border-zinc-700"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
