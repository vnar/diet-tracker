/** Shared limits for POST /v2/weekly-report/send-email (Lambda + optional Next proxy). */
export declare const WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES = 450000;
export declare const WEEKLY_REPORT_EMAIL_SUBJECT_MAX = 200;
export type WeeklyReportEmailSendPayload = {
    htmlBody: string;
    textBody?: string;
    subject?: string;
};
export declare function validateWeeklyReportEmailPayload(raw: unknown): {
    ok: true;
    value: WeeklyReportEmailSendPayload;
} | {
    ok: false;
    error: string;
};
