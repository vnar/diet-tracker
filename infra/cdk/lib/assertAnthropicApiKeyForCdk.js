"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAnthropicApiKeyForCdk = assertAnthropicApiKeyForCdk;
/**
 * Fail CDK synth/deploy before any resources are created if Anthropic is not
 * configured on the deploy machine. Prevents shipping Lambdas with an empty
 * `ANTHROPIC_API_KEY` (meal NL parse, food vision, activity burn, insights).
 *
 * Escape hatch (CI template-only synth, not for production deploy):
 * `CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true`
 */
function assertAnthropicApiKeyForCdk() {
    if (process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY === "true") {
        return;
    }
    const raw = process.env.ANTHROPIC_API_KEY;
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) {
        throw new Error([
            "ANTHROPIC_API_KEY is required for CDK (synth and deploy).",
            "Export a real key in the shell before `npm run infra:cdk:deploy` or `infra:cdk:synth`, e.g.:",
            "  set -a && source .env.local && set +a && npm run infra:cdk:deploy",
            "Synth/deploy without a key is only allowed when CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true (not for production).",
        ].join("\n"));
    }
    const lower = key.toLowerCase();
    if (lower.includes("your-anthropic-api-key") ||
        lower === "changeme" ||
        lower.startsWith("replace_me") ||
        lower.startsWith("xxx")) {
        throw new Error("ANTHROPIC_API_KEY looks like a placeholder. Replace it with a real Anthropic API key before CDK deploy.");
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXJ0QW50aHJvcGljQXBpS2V5Rm9yQ2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXNzZXJ0QW50aHJvcGljQXBpS2V5Rm9yQ2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsa0VBMkJDO0FBbkNEOzs7Ozs7O0dBT0c7QUFDSCxTQUFnQiwyQkFBMkI7SUFDekMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxLQUFLLE1BQU0sRUFBRSxDQUFDO1FBQy9ELE9BQU87SUFDVCxDQUFDO0lBQ0QsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztJQUMxQyxNQUFNLEdBQUcsR0FBRyxPQUFPLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ3RELElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNULE1BQU0sSUFBSSxLQUFLLENBQ2I7WUFDRSwyREFBMkQ7WUFDM0QsOEZBQThGO1lBQzlGLHFFQUFxRTtZQUNyRSxnSEFBZ0g7U0FDakgsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQ2IsQ0FBQztJQUNKLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDaEMsSUFDRSxLQUFLLENBQUMsUUFBUSxDQUFDLHdCQUF3QixDQUFDO1FBQ3hDLEtBQUssS0FBSyxVQUFVO1FBQ3BCLEtBQUssQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO1FBQzlCLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQ3ZCLENBQUM7UUFDRCxNQUFNLElBQUksS0FBSyxDQUNiLHlHQUF5RyxDQUMxRyxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEZhaWwgQ0RLIHN5bnRoL2RlcGxveSBiZWZvcmUgYW55IHJlc291cmNlcyBhcmUgY3JlYXRlZCBpZiBBbnRocm9waWMgaXMgbm90XG4gKiBjb25maWd1cmVkIG9uIHRoZSBkZXBsb3kgbWFjaGluZS4gUHJldmVudHMgc2hpcHBpbmcgTGFtYmRhcyB3aXRoIGFuIGVtcHR5XG4gKiBgQU5USFJPUElDX0FQSV9LRVlgIChtZWFsIE5MIHBhcnNlLCBmb29kIHZpc2lvbiwgYWN0aXZpdHkgYnVybiwgaW5zaWdodHMpLlxuICpcbiAqIEVzY2FwZSBoYXRjaCAoQ0kgdGVtcGxhdGUtb25seSBzeW50aCwgbm90IGZvciBwcm9kdWN0aW9uIGRlcGxveSk6XG4gKiBgQ0RLX0FMTE9XX01JU1NJTkdfQU5USFJPUElDX0FQSV9LRVk9dHJ1ZWBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydEFudGhyb3BpY0FwaUtleUZvckNkaygpOiB2b2lkIHtcbiAgaWYgKHByb2Nlc3MuZW52LkNES19BTExPV19NSVNTSU5HX0FOVEhST1BJQ19BUElfS0VZID09PSBcInRydWVcIikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCByYXcgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfQVBJX0tFWTtcbiAgY29uc3Qga2V5ID0gdHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIiA/IHJhdy50cmltKCkgOiBcIlwiO1xuICBpZiAoIWtleSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFtcbiAgICAgICAgXCJBTlRIUk9QSUNfQVBJX0tFWSBpcyByZXF1aXJlZCBmb3IgQ0RLIChzeW50aCBhbmQgZGVwbG95KS5cIixcbiAgICAgICAgXCJFeHBvcnQgYSByZWFsIGtleSBpbiB0aGUgc2hlbGwgYmVmb3JlIGBucG0gcnVuIGluZnJhOmNkazpkZXBsb3lgIG9yIGBpbmZyYTpjZGs6c3ludGhgLCBlLmcuOlwiLFxuICAgICAgICBcIiAgc2V0IC1hICYmIHNvdXJjZSAuZW52LmxvY2FsICYmIHNldCArYSAmJiBucG0gcnVuIGluZnJhOmNkazpkZXBsb3lcIixcbiAgICAgICAgXCJTeW50aC9kZXBsb3kgd2l0aG91dCBhIGtleSBpcyBvbmx5IGFsbG93ZWQgd2hlbiBDREtfQUxMT1dfTUlTU0lOR19BTlRIUk9QSUNfQVBJX0tFWT10cnVlIChub3QgZm9yIHByb2R1Y3Rpb24pLlwiLFxuICAgICAgXS5qb2luKFwiXFxuXCIpLFxuICAgICk7XG4gIH1cbiAgY29uc3QgbG93ZXIgPSBrZXkudG9Mb3dlckNhc2UoKTtcbiAgaWYgKFxuICAgIGxvd2VyLmluY2x1ZGVzKFwieW91ci1hbnRocm9waWMtYXBpLWtleVwiKSB8fFxuICAgIGxvd2VyID09PSBcImNoYW5nZW1lXCIgfHxcbiAgICBsb3dlci5zdGFydHNXaXRoKFwicmVwbGFjZV9tZVwiKSB8fFxuICAgIGxvd2VyLnN0YXJ0c1dpdGgoXCJ4eHhcIilcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJBTlRIUk9QSUNfQVBJX0tFWSBsb29rcyBsaWtlIGEgcGxhY2Vob2xkZXIuIFJlcGxhY2UgaXQgd2l0aCBhIHJlYWwgQW50aHJvcGljIEFQSSBrZXkgYmVmb3JlIENESyBkZXBsb3kuXCIsXG4gICAgKTtcbiAgfVxufVxuIl19