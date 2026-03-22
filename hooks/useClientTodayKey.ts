"use client";

import { useEffect, useState } from "react";
import { formatDateKeyLocal } from "@/lib/calculations";

/**
 * Calendar "today" in the user's local timezone. `null` on the server and on
 * the first client render so SSR markup matches hydration; set after mount.
 */
export function useClientTodayKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    setKey(formatDateKeyLocal(new Date()));
  }, []);
  return key;
}
