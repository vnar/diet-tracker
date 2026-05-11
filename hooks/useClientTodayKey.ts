"use client";

import { useLayoutEffect, useState } from "react";
import { formatDateKeyLocal } from "@/lib/calculations";

/**
 * Calendar "today" in the user's local timezone. `null` on the server; on the
 * client, set synchronously before paint (layout effect) so KPIs and saves align
 * with the user's calendar as soon as JS runs — avoids a long "empty today" flash.
 */
export function useClientTodayKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    setKey(formatDateKeyLocal(new Date()));
    const onDayChange = () => setKey(formatDateKeyLocal(new Date()));
    const id = window.setInterval(onDayChange, 60_000);
    document.addEventListener("visibilitychange", onDayChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onDayChange);
    };
  }, []);
  return key;
}
