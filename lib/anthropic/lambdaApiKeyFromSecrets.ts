import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { normalizeAnthropicSecretPayload } from "./secretPayload";

const sm = new SecretsManagerClient({});

let loadPromise: Promise<void> | null = null;

/**
 * Ensures `process.env.ANTHROPIC_API_KEY` is set when the stack configured
 * `ANTHROPIC_API_KEY_SECRET_ARN` (Secrets Manager). Idempotent per Lambda instance.
 *
 * If `ANTHROPIC_API_KEY` is already non-empty (legacy inline env), does nothing.
 * If no secret ARN and no key, no-op (callers use heuristics / return errors).
 */
export async function ensureAnthropicApiKeyFromSecrets(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return;
  }
  const arn = process.env.ANTHROPIC_API_KEY_SECRET_ARN?.trim();
  if (!arn) {
    return;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
      const raw = out.SecretString ?? "";
      process.env.ANTHROPIC_API_KEY = normalizeAnthropicSecretPayload(raw);
    })();
  }
  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}
