"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  confirmSignUpWithCognito,
  resendConfirmationWithCognito,
  sessionFromAuthResult,
  signInWithCognito,
  signUpWithCognito,
  enrichProfileWithAccessToken,
  userFromIdToken,
  type CognitoSessionTokens,
  type CognitoUserProfile,
} from "@/lib/cognito-client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type SignUpResult =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; error: string };

type SignInResult =
  | { ok: true }
  | { ok: false; error: string };

type ConfirmSignUpResult =
  | { ok: true }
  | { ok: false; error: string };

type AuthContextValue = {
  status: AuthStatus;
  user: CognitoUserProfile | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (args: { email: string; password: string; name?: string }) => Promise<SignUpResult>;
  confirmSignUp: (args: { email: string; code: string }) => Promise<ConfirmSignUpResult>;
  resendConfirmation: (email: string) => Promise<ConfirmSignUpResult>;
  signOut: () => void;
  getAccessToken: () => string | null;
};

const STORAGE_KEY = "healthos.cognito.session";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): CognitoSessionTokens | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CognitoSessionTokens;
    if (!parsed.accessToken || !parsed.idToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapAuthError(error: unknown) {
  const err = error as { name?: string };
  switch (err?.name) {
    case "NotAuthorizedException":
      return "Wrong email or password.";
    case "UserNotConfirmedException":
      return "Account created, but email is not confirmed yet.";
    case "UsernameExistsException":
      return "That email is already registered. Sign in instead.";
    case "InvalidPasswordException":
      return "Password does not meet Cognito policy requirements.";
    case "CodeMismatchException":
      return "Invalid verification code.";
    case "ExpiredCodeException":
      return "Verification code expired. Request a new code.";
    case "LimitExceededException":
      return "Too many attempts. Please wait and try again.";
    default:
      return "Authentication failed.";
  }
}

export function CognitoAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<CognitoSessionTokens | null>(null);
  const [user, setUser] = useState<CognitoUserProfile | null>(null);

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setStatus("unauthenticated");
      return;
    }
    const base = userFromIdToken(stored.idToken);
    if (!base) {
      window.localStorage.removeItem(STORAGE_KEY);
      setStatus("unauthenticated");
      return;
    }
    const profile = enrichProfileWithAccessToken(base, stored.accessToken);
    setSession(stored);
    setUser(profile);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async signIn(email, password) {
        try {
          const response = await signInWithCognito(email, password);
          const next = sessionFromAuthResult(response.AuthenticationResult ?? {});
          if (!next) {
            return { ok: false, error: "Sign in challenge not supported in this client." };
          }

          const base = userFromIdToken(next.idToken);
          if (!base) {
            return { ok: false, error: "Could not parse user profile from token." };
          }
          const profile = enrichProfileWithAccessToken(base, next.accessToken);

          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          setSession(next);
          setUser(profile);
          setStatus("authenticated");
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapAuthError(error) };
        }
      },
      async signUp(args) {
        try {
          const response = await signUpWithCognito(args);
          return {
            ok: true,
            needsConfirmation: response.UserConfirmed === false,
          };
        } catch (error) {
          return { ok: false, error: mapAuthError(error) };
        }
      },
      async confirmSignUp(args) {
        try {
          await confirmSignUpWithCognito(args);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapAuthError(error) };
        }
      },
      async resendConfirmation(email) {
        try {
          await resendConfirmationWithCognito(email);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapAuthError(error) };
        }
      },
      signOut() {
        window.localStorage.removeItem(STORAGE_KEY);
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
      },
      getAccessToken() {
        if (!session || Date.now() >= session.expiresAt) return null;
        return session.accessToken;
      },
    }),
    [session, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCognitoAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useCognitoAuth must be used within CognitoAuthProvider");
  }
  return context;
}
