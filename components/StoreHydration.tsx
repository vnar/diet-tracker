"use client";

import { useEffect } from "react";
import { useHealthStore } from "@/lib/store";

export function StoreHydration() {
  useEffect(() => {
    void useHealthStore.persist.rehydrate();
  }, []);
  return null;
}
