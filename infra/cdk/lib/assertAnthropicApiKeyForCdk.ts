/**
 * Fail CDK synth/deploy before any resources are created if Anthropic is not
 * configured on the deploy machine. Prevents shipping stacks without a key to
 * seed Secrets Manager (meal NL parse, food vision, activity burn, insights).
 *
 * Escape hatch (CI template-only synth, not for production deploy):
 * `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true`
 */
export function assertAnthropicApiKeyForCdk(): void {
  if (process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY === "true") {
    return;
  }
  const raw = process.env.ANTHROPIC_API_KEY;
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) {
    throw new Error(
      [
        "ANTHROPIC_API_KEY is required for CDK (synth and deploy).",
        "Export a real key in the shell before `npm run infra:cdk:deploy` or `infra:cdk:synth`, e.g.:",
        "  set -a && source .env.local && set +a && npm run infra:cdk:deploy",
        "Synth/deploy without a key is only allowed when CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true (not for production).",
      ].join("\n"),
    );
  }
  const lower = key.toLowerCase();
  if (
    lower.includes("your-anthropic-api-key") ||
    lower === "changeme" ||
    lower.startsWith("replace_me") ||
    lower.startsWith("xxx")
  ) {
    throw new Error(
      "ANTHROPIC_API_KEY looks like a placeholder. Replace it with a real Anthropic API key before CDK deploy.",
    );
  }
}
