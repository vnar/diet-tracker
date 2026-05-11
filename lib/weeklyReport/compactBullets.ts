import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";

const DEFAULT_MAX = 5;

/** Short list for in-app weekly card and transactional email body. */
export function compactWeeklyBulletLines(
  doc: WeeklyReportDocument,
  max: number = DEFAULT_MAX,
): string[] {
  const { whatChanged, whatHelped, whatHarder, nextExperiment } = doc.sections;
  const out: string[] = [];
  for (const t of whatChanged) {
    if (t?.trim() && out.length < max) out.push(t.trim());
  }
  for (const t of whatHelped) {
    if (t?.trim() && out.length < max) out.push(t.trim());
  }
  for (const t of whatHarder) {
    if (t?.trim() && out.length < max) out.push(t.trim());
  }
  const hint = nextExperiment.title?.trim();
  if (hint && out.length < max) out.push(`Try next: ${hint}`);
  return out.slice(0, max);
}
