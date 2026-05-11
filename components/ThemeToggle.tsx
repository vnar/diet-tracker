"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useState } from "react";

const KEY = "healthos-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(true);

  useLayoutEffect(() => {
    const stored = localStorage.getItem(KEY);
    const isDark = stored !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(KEY, next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-amber-600 shadow-sm transition-all duration-200 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-amber-400 dark:shadow-none dark:hover:bg-zinc-700 ${className}`}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-[15px] w-[15px]" strokeWidth={2} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={2} />}
    </button>
  );
}
