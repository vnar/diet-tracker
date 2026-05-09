import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  enrichProfileWithAccessToken,
  mapAuthError,
  messageForAuthChallenge,
  sessionFromAuthResult,
  signInWithCognito,
  userFromIdToken,
} from "@/src/auth/cognitoClient";
import { clearStoredSession, readStoredSession, writeStoredSession } from "@/src/auth/secureSession";
import type { CognitoSessionTokens, CognitoUserProfile } from "@/src/auth/types";
import { trackMobile } from "@/src/analytics/bridge";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  status: AuthStatus;
  user: CognitoUserProfile | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<CognitoSessionTokens | null>(null);
  const [user, setUser] = useState<CognitoUserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readStoredSession();
      if (cancelled) return;
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      const base = userFromIdToken(stored.idToken);
      if (!base) {
        await clearStoredSession();
        setStatus("unauthenticated");
        return;
      }
      const profile = enrichProfileWithAccessToken(base, stored.accessToken);
      setSession(stored);
      setUser(profile);
      setStatus("authenticated");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      const response = await signInWithCognito(email, password);
      const challengeMsg = messageForAuthChallenge(response.ChallengeName);
      if (challengeMsg) {
        return { ok: false, error: challengeMsg };
      }
      const next = sessionFromAuthResult(response.AuthenticationResult ?? {});
      if (!next) {
        return { ok: false, error: "Unexpected sign-in response. Try the web app, then try again." };
      }
      const base = userFromIdToken(next.idToken);
      if (!base) {
        return { ok: false, error: "Could not parse user profile from token." };
      }
      const profile = enrichProfileWithAccessToken(base, next.accessToken);
      await writeStoredSession(next);
      setSession(next);
      setUser(profile);
      setStatus("authenticated");
      trackMobile("mobile_login_completed", { user_id: profile.id });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: mapAuthError(error) };
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredSession();
    setSession(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const getAccessToken = useCallback((): string | null => {
    if (!session || Date.now() >= session.expiresAt) return null;
    return session.accessToken;
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn,
      signOut,
      getAccessToken,
    }),
    [getAccessToken, signIn, signOut, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
