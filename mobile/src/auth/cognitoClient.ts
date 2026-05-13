import { getCognitoConfig } from "@/src/config/env";
import type { CognitoSessionTokens, CognitoUserProfile } from "@/src/auth/types";

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  username?: string;
  "cognito:username"?: string;
};

/** Cognito IDP JSON API — works reliably in React Native; AWS SDK v3 often mis-reports errors here. */
const INITIATE_AUTH_TARGET = "AWSCognitoIdentityProviderService.InitiateAuth";
const FORGOT_PASSWORD_TARGET = "AWSCognitoIdentityProviderService.ForgotPassword";
const CONFIRM_FORGOT_PASSWORD_TARGET = "AWSCognitoIdentityProviderService.ConfirmForgotPassword";

export type InitiateAuthResponse = {
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
  };
  ChallengeName?: string;
};

/** Cognito returned a challenge instead of tokens (password reset, MFA, etc.). */
export function messageForAuthChallenge(challengeName: string | undefined): string | null {
  if (!challengeName) return null;
  switch (challengeName) {
    case "NEW_PASSWORD_REQUIRED":
    case "FORCE_CHANGE_PASSWORD":
      return "Finish setting your password on the web app, then sign in here.";
    case "SMS_MFA":
    case "SOFTWARE_TOKEN_MFA":
    case "MFA_SETUP":
      return "Turn off MFA for this account on the web, or complete setup there first.";
    case "CUSTOM_CHALLENGE":
      return "This account needs extra verification. Complete sign-in on the web.";
    default:
      return "Sign-in needs an extra step. Complete it on the web app first.";
  }
}

function parseCognitoErrorType(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "Unknown";
  const t = raw.trim();
  const hash = t.lastIndexOf("#");
  return hash >= 0 ? t.slice(hash + 1) : t;
}

function decodeJwtPayload(token: string): JwtPayload {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return {};
  const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return JSON.parse(decoded) as JwtPayload;
}

export function sessionFromAuthResult(authResult: {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}): CognitoSessionTokens | null {
  if (!authResult.AccessToken || !authResult.IdToken) return null;
  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken,
    expiresAt: Date.now() + (authResult.ExpiresIn ?? 3600) * 1000,
  };
}

export function userFromIdToken(idToken: string): CognitoUserProfile | null {
  try {
    const payload = decodeJwtPayload(idToken);
    if (!payload.sub) return null;
    const emailRaw = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : undefined;
    const cognitoUsername =
      typeof payload["cognito:username"] === "string"
        ? payload["cognito:username"].trim().toLowerCase()
        : undefined;
    const email =
      emailRaw || (cognitoUsername && cognitoUsername.includes("@") ? cognitoUsername : undefined);
    return {
      id: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export function enrichProfileWithAccessToken(
  profile: CognitoUserProfile,
  accessToken: string,
): CognitoUserProfile {
  if (profile.email && profile.email.includes("@")) return profile;
  try {
    const payload = decodeJwtPayload(accessToken);
    const username =
      typeof payload.username === "string" ? payload.username.trim().toLowerCase() : undefined;
    if (username && username.includes("@")) {
      return { ...profile, email: username };
    }
  } catch {
    /* ignore */
  }
  return profile;
}

type CognitoClientConfig = NonNullable<ReturnType<typeof getCognitoConfig>>;

async function postCognitoIdp<T>(
  config: CognitoClientConfig,
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `https://cognito-idp.${config.region}.amazonaws.com/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": target,
    },
    body: JSON.stringify(body),
  });

  let json: Record<string, unknown>;
  try {
    const text = await res.text();
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error("COGNITO_BAD_RESPONSE");
  }

  const errType = json.__type;
  if (errType != null) {
    const name = parseCognitoErrorType(errType);
    const message = typeof json.message === "string" ? json.message : name;
    const err = new Error(message) as Error & { name: string };
    err.name = name;
    throw err;
  }

  if (!res.ok) {
    throw new Error("COGNITO_BAD_RESPONSE");
  }

  return json as T;
}

export async function signInWithCognito(
  email: string,
  password: string,
): Promise<InitiateAuthResponse> {
  const config = getCognitoConfig();
  if (!config) throw new Error("COGNITO_NOT_CONFIGURED");
  return postCognitoIdp<InitiateAuthResponse>(config, INITIATE_AUTH_TARGET, {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.userPoolClientId,
    AuthParameters: {
      USERNAME: email.trim().toLowerCase(),
      PASSWORD: password,
    },
  });
}

/** Sends a password-reset code to the user's verified email. */
export async function forgotPasswordWithCognito(email: string): Promise<void> {
  const config = getCognitoConfig();
  if (!config) throw new Error("COGNITO_NOT_CONFIGURED");
  await postCognitoIdp(config, FORGOT_PASSWORD_TARGET, {
    ClientId: config.userPoolClientId,
    Username: email.trim().toLowerCase(),
  });
}

/** Completes forgot-password with the emailed code and a new password. */
export async function confirmForgotPasswordWithCognito(args: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const config = getCognitoConfig();
  if (!config) throw new Error("COGNITO_NOT_CONFIGURED");
  await postCognitoIdp(config, CONFIRM_FORGOT_PASSWORD_TARGET, {
    ClientId: config.userPoolClientId,
    Username: args.email.trim().toLowerCase(),
    ConfirmationCode: args.code.trim(),
    Password: args.newPassword,
  });
}

export function mapAuthError(error: unknown): string {
  if (error instanceof Error && error.message === "COGNITO_NOT_CONFIGURED") {
    return "Sign-in isn’t available right now.";
  }
  if (error instanceof Error && error.message === "COGNITO_BAD_RESPONSE") {
    return "Couldn’t reach sign-in. Try again.";
  }
  if (error instanceof TypeError) {
    return "Check your connection and try again.";
  }
  if (
    error instanceof Error &&
    /network request failed|failed to fetch|internet connection appears/i.test(error.message)
  ) {
    return "Check your connection and try again.";
  }

  const name =
    error && typeof error === "object" && "name" in error && typeof (error as Error).name === "string"
      ? (error as Error).name
      : undefined;

  switch (name) {
    case "NotAuthorizedException":
      return "Wrong email or password.";
    case "UserNotConfirmedException":
      return "Account created, but email is not confirmed yet.";
    case "PasswordResetRequiredException":
      return "Use Forgot password below to set a new password, then sign in.";
    case "InvalidPasswordException":
      return "Password does not meet Cognito policy requirements.";
    case "CodeMismatchException":
      return "Invalid reset code.";
    case "ExpiredCodeException":
      return "Reset code expired. Request a new code.";
    case "InvalidParameterException":
      return "Sign-in isn’t set up for this app build. Contact support.";
    case "ResourceNotFoundException":
      return "Sign-in service not found. Try again later.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many attempts. Please wait and try again.";
    default:
      return "Sign-in failed. Try again, or use Forgot password.";
  }
}
