"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AboutModal } from "@/components/AboutModal";

export function AboutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="group relative">
        <button
          onClick={() => setOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-600 transition-all duration-200 hover:border-zinc-600 hover:text-zinc-300"
          aria-label="About Ojas-Health"
          type="button"
        >
          <Info size={12} />
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          About
        </div>
      </div>

      {open ? <AboutModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

