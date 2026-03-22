"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import { setHealthStorageMode, useHealthStore } from "@/lib/store";
import type { DailyEntry, UserSettings } from "@/lib/types";

export function HealthBootstrap({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const prev = useRef(status);

  useEffect(() => {
    if (status === "authenticated") {
      setHealthStorageMode(true);
      void (async () => {
        const [eRes, sRes] = await Promise.all([
          fetch("/api/entries"),
          fetch("/api/settings"),
        ]);
        if (!eRes.ok || !sRes.ok) return;
        const eJson = (await eRes.json()) as { entries: DailyEntry[] };
        const sJson = (await sRes.json()) as { settings: UserSettings };
        useHealthStore.getState().replaceEntriesAndSettings(
          sortEntriesByDateAsc(eJson.entries),
          sJson.settings
        );
      })();
    } else if (prev.current === "authenticated" && status === "unauthenticated") {
      setHealthStorageMode(false);
      void useHealthStore.persist.rehydrate();
    }
    prev.current = status;
  }, [status]);

  return <>{children}</>;
}
