export type CognitoConfig = {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
};

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

export function getClientCognitoConfig(): CognitoConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  const region = firstNonEmpty([
    process.env.NEXT_PUBLIC_COGNITO_REGION,
    process.env.NEXT_PUBLIC_AWS_REGION,
  ]);
  const userPoolId = firstNonEmpty([process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID]);
  const userPoolClientId = firstNonEmpty([
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
  ]);

  if (!region || !userPoolId || !userPoolClientId) {
    return null;
  }

  return { region, userPoolId, userPoolClientId };
}

export function getServerCognitoConfig(): CognitoConfig | null {
  const region = firstNonEmpty([
    process.env.COGNITO_REGION,
    process.env.AWS_REGION,
    process.env.NEXT_PUBLIC_COGNITO_REGION,
    process.env.NEXT_PUBLIC_AWS_REGION,
  ]);
  const userPoolId = firstNonEmpty([
    process.env.COGNITO_USER_POOL_ID,
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  ]);
  const userPoolClientId = firstNonEmpty([
    process.env.COGNITO_USER_POOL_CLIENT_ID,
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
  ]);

  if (!region || !userPoolId || !userPoolClientId) {
    return null;
  }

  return { region, userPoolId, userPoolClientId };
}
