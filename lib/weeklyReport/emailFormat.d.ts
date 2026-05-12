import type { WeeklyReportDocument } from "./types";
/** When set, prepends a visible “transactional / consent” block for outbound email only (not in-app preview). */
export type WeeklyReportEmailDeliverabilityNotice = "userTapSend" | "scheduledDigest";
export type BuildWeeklyReportEmailOptions = {
    deliverabilityNotice?: WeeklyReportEmailDeliverabilityNotice;
};
/** Minimal inline-CSS HTML suitable for email clients (best-effort). Human-centric copy, not clinical report strings. */
export declare function buildWeeklyReportEmailHtml(doc: WeeklyReportDocument, options?: BuildWeeklyReportEmailOptions): string;
export declare function buildWeeklyReportEmailPlainText(doc: WeeklyReportDocument, options?: BuildWeeklyReportEmailOptions): string;
