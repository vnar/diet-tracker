/**
 * Pure helpers for turning CloudFormation stack outputs into suggested .env.local lines.
 * Used by scripts/print-dotenv-local-from-stack.mjs and unit tests.
 */

/**
 * @param {Record<string, string>} map OutputKey → OutputValue from describe-stacks
 * @param {string} region AWS region (e.g. us-east-1)
 * @returns {string[]}
 */
export function formatNextPublicEnvFromStackOutputs(map, region) {
  const apiUrl = map.ApiUrl;
  const userPoolId = map.UserPoolId;
  const userPoolClientId = map.UserPoolClientId;
  if (!apiUrl?.trim() || !userPoolId?.trim() || !userPoolClientId?.trim()) {
    throw new Error(
      "Stack outputs must include ApiUrl, UserPoolId, and UserPoolClientId (from CDK stack outputs).",
    );
  }
  return [
    "# Suggested lines for .env.local (from CloudFormation stack outputs)",
    "NEXT_PUBLIC_USE_AWS_BACKEND=true",
    `NEXT_PUBLIC_AWS_API_URL=${apiUrl}`,
    `NEXT_PUBLIC_AWS_REGION=${region}`,
    `NEXT_PUBLIC_COGNITO_USER_POOL_ID=${userPoolId}`,
    `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${userPoolClientId}`,
  ];
}

/**
 * Expo mobile app: same stack outputs, EXPO_PUBLIC_* names + values baked via app.config `extra`.
 *
 * @param {Record<string, string>} map OutputKey → OutputValue from describe-stacks
 * @param {string} region AWS region (e.g. us-east-1)
 * @returns {string[]}
 */
export function formatExpoPublicEnvFromStackOutputs(map, region) {
  const apiUrl = map.ApiUrl;
  const userPoolId = map.UserPoolId;
  const userPoolClientId = map.UserPoolClientId;
  if (!apiUrl?.trim() || !userPoolId?.trim() || !userPoolClientId?.trim()) {
    throw new Error(
      "Stack outputs must include ApiUrl, UserPoolId, and UserPoolClientId (from CDK stack outputs).",
    );
  }
  const apiTrimmed = apiUrl.trim().replace(/\/+$/, "");
  const reg = region.trim();
  return [
    "# Generated from CloudFormation — refresh: node scripts/print-mobile-dotenv-from-stack.mjs",
    "EXPO_PUBLIC_APP_ENV=development",
    "EXPO_PUBLIC_USE_AWS_BACKEND=true",
    `EXPO_PUBLIC_AWS_API_URL=${apiTrimmed}`,
    `EXPO_PUBLIC_AWS_REGION=${reg}`,
    `EXPO_PUBLIC_COGNITO_REGION=${reg}`,
    `EXPO_PUBLIC_COGNITO_USER_POOL_ID=${userPoolId.trim()}`,
    `EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${userPoolClientId.trim()}`,
    "",
    "# Optional (same as web PostHog project)",
    "EXPO_PUBLIC_POSTHOG_KEY=",
    "EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com",
    "",
    "EXPO_PUBLIC_SENTRY_DSN=",
  ];
}
