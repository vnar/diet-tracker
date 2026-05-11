export declare function sendTransactionalWeeklyReportMime(opts: {
    to: string;
    subject: string;
    html: string;
    textPlain?: string;
}): Promise<void>;
