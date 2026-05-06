/**
 * Parses headline/detail from Anthropic responses. Models often wrap JSON in
 * markdown fences; plain JSON.parse would fail and downstream code would fall
 * back to rule-only copy.
 */
export type LlmInsightCopy = {
    headline?: string;
    detail?: string;
};
export declare function parseInsightCopyFromLlmText(raw: string): LlmInsightCopy | null;
