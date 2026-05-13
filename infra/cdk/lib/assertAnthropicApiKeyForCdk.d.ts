/**
 * Fail CDK synth/deploy before any resources are created if Anthropic is not
 * configured on the deploy machine. Prevents shipping Lambdas with an empty
 * `ANTHROPIC_API_KEY` (meal NL parse, food vision, activity burn, insights).
 *
 * Escape hatch (CI template-only synth, not for production deploy):
 * `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true`
 */
export declare function assertAnthropicApiKeyForCdk(): void;
