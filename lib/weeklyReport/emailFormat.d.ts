import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";
/** Minimal inline-CSS HTML suitable for pasting into email clients (best-effort). */
export declare function buildWeeklyReportEmailHtml(doc: WeeklyReportDocument): string;
export declare function buildWeeklyReportEmailPlainText(doc: WeeklyReportDocument): string;
