/** Shared schema for GET /v2/insights AI card (JSON from Claude). */
export type VerdictStatus = "on_track" | "at_risk" | "off_track";
export type AiInsightActionIcon = "walk" | "food" | "moon" | "heart" | "run";
export type AiInsightStructured = {
    verdict: {
        status: VerdictStatus;
        headline: string;
        detail: string;
    };
    working: {
        body: string;
    };
    stalling: {
        body: string;
        metrics: Array<{
            value: string;
            label: string;
        }>;
    };
    actions: Array<{
        icon: AiInsightActionIcon;
        action: string;
        reason: string;
    }>;
    prediction: {
        headline: string;
        basis: string;
    };
};
/**
 * Extract and validate structured insight JSON from model output.
 */
export declare function parseAiInsightStructured(raw: string): {
    ok: true;
    data: AiInsightStructured;
} | {
    ok: false;
    error: string;
};
