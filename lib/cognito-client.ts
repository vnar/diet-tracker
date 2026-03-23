"use client";

import {
  ConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getClientCognitoConfig } from "@/lib/cognito-config";

export type CognitoSessionTokens = {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
};

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
};

export type CognitoUserProfile = {
  id: string;
  email?: string;
  name?: string;
};

let cachedClient: CognitoIdentityProviderClient | null = null;

function getClient() {
  const config = getClientCognitoConfig();
  if (!config) {
    throw new Error("Cognito is not configured in NEXT_PUBLIC env variables.");
  }

  if (!cachedClient) {
    cachedClient = new CognitoIdentityProviderClient({ region: config.region });
  }

  return { config, client: cachedClient };
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
  if (!authResult.AccessToken || !authResult.IdToken) {
    return null;
  }

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
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export async function signInWithCognito(email: string, password: string) {
  const { client, config } = getClient();
  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.userPoolClientId,
    AuthParameters: {
      USERNAME: email.trim().toLowerCase(),
      PASSWORD: password,
    },
  });

  const response = await client.send(command);
  return response;
}

export async function signUpWithCognito(args: {
  email: string;
  password: string;
  name?: string;
}) {
  const { client, config } = getClient();
  const command = new SignUpCommand({
    ClientId: config.userPoolClientId,
    Username: args.email.trim().toLowerCase(),
    Password: args.password,
    UserAttributes: [
      { Name: "email", Value: args.email.trim().toLowerCase() },
      ...(args.name ? [{ Name: "name", Value: args.name.trim() }] : []),
    ],
  });

  const response = await client.send(command);
  return response;
}

export async function confirmSignUpWithCognito(args: {
  email: string;
  code: string;
}) {
  const { client, config } = getClient();
  const command = new ConfirmSignUpCommand({
    ClientId: config.userPoolClientId,
    Username: args.email.trim().toLowerCase(),
    ConfirmationCode: args.code.trim(),
  });
  const response = await client.send(command);
  return response;
}

export async function resendConfirmationWithCognito(email: string) {
  const { client, config } = getClient();
  const command = new ResendConfirmationCodeCommand({
    ClientId: config.userPoolClientId,
    Username: email.trim().toLowerCase(),
  });
  const response = await client.send(command);
  return response;
}
