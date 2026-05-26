"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  confirmForgotPasswordWithCognito,
  confirmSignUpWithCognito,
  forgotPasswordWithCognito,
  resendConfirmationWithCognito,
  sessionFromAuthResult,
  signInWithCognito,
  signUpWithCognito,
  enrichProfileWithAccessToken,
  userFromIdToken,
  type CognitoSessionTokens,
  type CognitoUserProfile,
} from "@/lib/cognito-client";
import { mapCognitoAuthError } from "@/lib/cognito-map-auth-error";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type SignUpResult =
  | { ok: true; needsConfirmation: boolean; deliveryDestination?: string }
  | { ok: false; error: string };

type SignInResult =
  | { ok: true }
  | { ok: false; error: string };

type ConfirmSignUpResult =
  | { ok: true; deliveryDestination?: string }
  | { ok: false; error: string };

type PasswordResetRequestResult =
  | { ok: true }
  | { ok: false; error: string };

type PasswordResetCompleteResult =
  | { ok: true }
  | { ok: false; error: string };

export type IdentityEmailMismatch = {
  /** Normalized email/username used at InitiateAuth. */
  signInWith: string;
  /** Email claim shown on the ID token after sign-in (Cognito primary / linked identity). */
  idTokenEmail: string;
};

type AuthContextValue = {
  status: AuthStatus;
  user: CognitoUserProfile | null;
  /** Set when the email you typed at sign-in does not match the ID token email (check Cognito aliases / linked accounts). */
  identityEmailMismatch: IdentityEmailMismatch | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (args: { email: string; password: string; name?: string }) => Promise<SignUpResult>;
  confirmSignUp: (args: { email: string; code: string }) => Promise<ConfirmSignUpResult>;
  resendConfirmation: (email: string) => Promise<ConfirmSignUpResult>;
  /** Sends a reset code to the user's email. Does not reveal whether the email is registered. */
  requestPasswordReset: (email: string) => Promise<PasswordResetRequestResult>;
  completePasswordReset: (args: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<PasswordResetCompleteResult>;
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

export function CognitoAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<CognitoSessionTokens | null>(null);
  const [user, setUser] = useState<CognitoUserProfile | null>(null);
  /** Last username/email used for InitiateAuth (normalized). Hydrated sessions seed from ID token email so we do not false-alarm. */
  const [lastAuthUsernameNorm, setLastAuthUsernameNorm] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setStatus("unauthenticated");
      setLastAuthUsernameNorm(null);
      return;
    }
    const base = userFromIdToken(stored.idToken);
    if (!base) {
      window.localStorage.removeItem(STORAGE_KEY);
      setStatus("unauthenticated");
      setLastAuthUsernameNorm(null);
      return;
    }
    const profile = enrichProfileWithAccessToken(base, stored.accessToken);
    setSession(stored);
    setUser(profile);
    setLastAuthUsernameNorm(profile.email?.trim().toLowerCase() ?? null);
    setStatus("authenticated");
  }, []);

  const identityEmailMismatch = useMemo((): IdentityEmailMismatch | null => {
    if (status !== "authenticated" || !user?.email?.trim()) return null;
    const tokenEmail = user.email.trim().toLowerCase();
    if (!lastAuthUsernameNorm || lastAuthUsernameNorm === tokenEmail) return null;
    return { signInWith: lastAuthUsernameNorm, idTokenEmail: tokenEmail };
  }, [status, user?.email, lastAuthUsernameNorm]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      identityEmailMismatch,
      async signIn(email, password) {
        try {
          const requested = email.trim().toLowerCase();
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
          setLastAuthUsernameNorm(requested);
          setSession(next);
          setUser(profile);
          setStatus("authenticated");
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      async signUp(args) {
        try {
          const response = await signUpWithCognito(args);
          const destination = response.CodeDeliveryDetails?.Destination?.trim();
          return {
            ok: true,
            needsConfirmation: response.UserConfirmed === false,
            deliveryDestination: destination && destination.length > 0 ? destination : undefined,
          };
        } catch (error) {
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      async confirmSignUp(args) {
        try {
          await confirmSignUpWithCognito(args);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      async resendConfirmation(email) {
        try {
          const response = await resendConfirmationWithCognito(email);
          const destination = response.CodeDeliveryDetails?.Destination?.trim();
          return { ok: true, deliveryDestination: destination && destination.length > 0 ? destination : undefined };
        } catch (error) {
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      async requestPasswordReset(email) {
        try {
          await forgotPasswordWithCognito(email);
          return { ok: true };
        } catch (error) {
          const name = (error as { name?: string })?.name;
          if (name === "UserNotFoundException") {
            return { ok: true };
          }
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      async completePasswordReset(args) {
        try {
          await confirmForgotPasswordWithCognito(args);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: mapCognitoAuthError(error) };
        }
      },
      signOut() {
        window.localStorage.removeItem(STORAGE_KEY);
        setSession(null);
        setUser(null);
        setLastAuthUsernameNorm(null);
        setStatus("unauthenticated");
      },
      getAccessToken() {
        if (!session || Date.now() >= session.expiresAt) return null;
        return session.accessToken;
      },
    }),
    [identityEmailMismatch, session, status, user]
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
