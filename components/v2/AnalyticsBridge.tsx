"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

function normalizeText(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

export function AnalyticsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") {
      track("dashboard_viewed", { path: pathname });
    }
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = normalizeText(button.textContent);
      if (label.includes("save today") || label.includes("update today")) {
        track("day_saved", { source: "global_click_listener" });
        track("weight_logged", { source: "global_click_listener" });
      }
      if (label.includes("upload photo")) {
        track("photo_uploaded", { source: "global_click_listener", action: "open_picker" });
      }
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      const id = normalizeText(form.id);
      const className = normalizeText(form.className);
      if (id.includes("today") || className.includes("today")) {
        track("day_saved", { source: "global_submit_listener" });
      }
    }

    window.addEventListener("click", onClick);
    window.addEventListener("submit", onSubmit);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("submit", onSubmit);
    };
  }, []);

  return null;
}
