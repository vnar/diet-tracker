export declare function sendTransactionalWeeklyReportMime(opts: {
    to: string;
    subject: string;
    html: string;
    textPlain?: string;
    /**
     * `transactional` = user tapped “Send email” — omit List-ID / Auto-Submitted / List-Unsubscribe
     * so the message does not mimic bulk list mail (better inbox placement with freemail From).
     * `digest` = scheduled Monday job — keep list semantics for mailbox classification.
     */
    emailKind?: "digest" | "transactional";
}): Promise<void>;
