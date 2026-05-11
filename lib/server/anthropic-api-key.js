"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnthropicApiKeyForServer = getAnthropicApiKeyForServer;
const fs = require("node:fs");
const path = require("node:path");
const PLACEHOLDER_HINTS = /^your-anthropic/i;
/**
 * Anthropic key for Next.js server routes only (never `NEXT_PUBLIC_*`).
 * Same variable name as food vision on `BackendApiLambda` / CDK deploy (`ANTHROPIC_API_KEY`).
 *
 * Resolution order:
 * 1. `ANTHROPIC_API_KEY` when non-empty
 * 2. In non-production only: `secrets.toml` at repo root (`ANTHROPIC_API_KEY = "…"`), skipping placeholders
 */
function getAnthropicApiKeyForServer() {
    const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
    if (fromEnv)
        return fromEnv;
    if (process.env.NODE_ENV === "production")
        return undefined;
    try {
        const file = path.join(process.cwd(), "secrets.toml");
        if (!fs.existsSync(file))
            return undefined;
        const raw = fs.readFileSync(file, "utf8");
        for (const line of raw.split("\n")) {
            const t = line.trim();
            if (!t || t.startsWith("#"))
                continue;
            const m = t.match(/^ANTHROPIC_API_KEY\s*=\s*"(.*)"\s*$/);
            if (!m?.[1])
                continue;
            const v = m[1].trim();
            if (!v || PLACEHOLDER_HINTS.test(v))
                continue;
            return v;
        }
    }
    catch {
        /* ignore missing file / parse issues */
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW50aHJvcGljLWFwaS1rZXkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhbnRocm9waWMtYXBpLWtleS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLGtFQXVCQztBQXBDRCw4QkFBOEI7QUFDOUIsa0NBQWtDO0FBRWxDLE1BQU0saUJBQWlCLEdBQUcsa0JBQWtCLENBQUM7QUFFN0M7Ozs7Ozs7R0FPRztBQUNILFNBQWdCLDJCQUEyQjtJQUN6QyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3RELElBQUksT0FBTztRQUFFLE9BQU8sT0FBTyxDQUFDO0lBRTVCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEtBQUssWUFBWTtRQUFFLE9BQU8sU0FBUyxDQUFDO0lBRTVELElBQUksQ0FBQztRQUNILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQztZQUFFLE9BQU8sU0FBUyxDQUFDO1FBQzNDLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzFDLEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDO2dCQUFFLFNBQVM7WUFDdEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO1lBQ3pELElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQUUsU0FBUztZQUN0QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUFFLFNBQVM7WUFDOUMsT0FBTyxDQUFDLENBQUM7UUFDWCxDQUFDO0lBQ0gsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNQLHdDQUF3QztJQUMxQyxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcblxuY29uc3QgUExBQ0VIT0xERVJfSElOVFMgPSAvXnlvdXItYW50aHJvcGljL2k7XG5cbi8qKlxuICogQW50aHJvcGljIGtleSBmb3IgTmV4dC5qcyBzZXJ2ZXIgcm91dGVzIG9ubHkgKG5ldmVyIGBORVhUX1BVQkxJQ18qYCkuXG4gKiBTYW1lIHZhcmlhYmxlIG5hbWUgYXMgZm9vZCB2aXNpb24gb24gYEJhY2tlbmRBcGlMYW1iZGFgIC8gQ0RLIGRlcGxveSAoYEFOVEhST1BJQ19BUElfS0VZYCkuXG4gKlxuICogUmVzb2x1dGlvbiBvcmRlcjpcbiAqIDEuIGBBTlRIUk9QSUNfQVBJX0tFWWAgd2hlbiBub24tZW1wdHlcbiAqIDIuIEluIG5vbi1wcm9kdWN0aW9uIG9ubHk6IGBzZWNyZXRzLnRvbWxgIGF0IHJlcG8gcm9vdCAoYEFOVEhST1BJQ19BUElfS0VZID0gXCLigKZcImApLCBza2lwcGluZyBwbGFjZWhvbGRlcnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFudGhyb3BpY0FwaUtleUZvclNlcnZlcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBmcm9tRW52ID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX0FQSV9LRVk/LnRyaW0oKTtcbiAgaWYgKGZyb21FbnYpIHJldHVybiBmcm9tRW52O1xuXG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBmaWxlID0gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksIFwic2VjcmV0cy50b21sXCIpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhmaWxlKSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZSwgXCJ1dGY4XCIpO1xuICAgIGZvciAoY29uc3QgbGluZSBvZiByYXcuc3BsaXQoXCJcXG5cIikpIHtcbiAgICAgIGNvbnN0IHQgPSBsaW5lLnRyaW0oKTtcbiAgICAgIGlmICghdCB8fCB0LnN0YXJ0c1dpdGgoXCIjXCIpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG0gPSB0Lm1hdGNoKC9eQU5USFJPUElDX0FQSV9LRVlcXHMqPVxccypcIiguKilcIlxccyokLyk7XG4gICAgICBpZiAoIW0/LlsxXSkgY29udGludWU7XG4gICAgICBjb25zdCB2ID0gbVsxXS50cmltKCk7XG4gICAgICBpZiAoIXYgfHwgUExBQ0VIT0xERVJfSElOVFMudGVzdCh2KSkgY29udGludWU7XG4gICAgICByZXR1cm4gdjtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGlnbm9yZSBtaXNzaW5nIGZpbGUgLyBwYXJzZSBpc3N1ZXMgKi9cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuIl19