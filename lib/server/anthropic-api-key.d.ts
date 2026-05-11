/**
 * Anthropic key for Next.js server routes only (never `NEXT_PUBLIC_*`).
 * Same variable name as food vision on `BackendApiLambda` / CDK deploy (`ANTHROPIC_API_KEY`).
 *
 * Resolution order:
 * 1. `ANTHROPIC_API_KEY` when non-empty
 * 2. In non-production only: `secrets.toml` at repo root (`ANTHROPIC_API_KEY = "…"`), skipping placeholders
 */
export declare function getAnthropicApiKeyForServer(): string | undefined;
