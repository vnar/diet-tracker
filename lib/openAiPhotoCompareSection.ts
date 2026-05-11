/** Opens the dashboard “Photo compare (AI)” accordion and scrolls it into view (from the Photos column). */
export function openAiPhotoCompareSection(): void {
  if (typeof document === "undefined") return;
  const details = document.getElementById("ai-insights-photo-compare-details");
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
  }
  if (details && typeof details.scrollIntoView === "function") {
    details.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
