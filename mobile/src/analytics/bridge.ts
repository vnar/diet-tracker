type CaptureFn = (event: string, props?: Record<string, unknown>) => void;

let capture: CaptureFn | null = null;

export function setAnalyticsCapture(fn: CaptureFn | null): void {
  capture = fn;
}

export function trackMobile(event: string, props?: Record<string, unknown>): void {
  try {
    capture?.(event, props);
  } catch {
    /* never block UX on analytics */
  }
}
