/** ISO date YYYY-MM-DD helpers (local noon to avoid DST edge cases). */
export function addDaysIso(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Inclusive range from `startIso` through `endIso` (assumes start ≤ end). */
export function eachDayInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}
