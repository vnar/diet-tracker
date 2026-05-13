"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";

export function LoginForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const {
    signIn,
    signUp,
    confirmSignUp,
    resendConfirmation,
    requestPasswordReset,
    completePasswordReset,
  } = useCognitoAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "confirm" | "forgot" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const signupResult = await signUp({
        email,
        password,
        name: name.trim() || undefined,
      });
      if (!signupResult.ok) {
        setError(signupResult.error);
        return;
      }

      if (signupResult.needsConfirmation) {
        setMessage("Check your email for a verification code to confirm your account.");
        setMode("confirm");
        return;
      }

      const signInResult = await signIn(email, password);
      if (!signInResult.ok) {
        setError(signInResult.error);
        setMode("signin");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await confirmSignUp({ email, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Email confirmed. You can sign in now.");
      setMode("signin");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await resendConfirmation(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("A new verification code was sent to your email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        "If an account exists for that email, we sent a reset code. Check your inbox (and spam).",
      );
      setMode("reset");
      setCode("");
      setNewPassword("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await completePasswordReset({
        email,
        code,
        newPassword,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Password updated. Sign in with your new password.");
      setMode("signin");
      setPassword("");
      setCode("");
      setNewPassword("");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendResetCode() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("If an account exists for that email, we sent another reset code.");
    } finally {
      setLoading(false);
    }
  }

  function goBackToSignIn() {
    setMode("signin");
    setError(null);
    setMessage(null);
    setCode("");
    setNewPassword("");
  }

  const tabBtn = compact
    ? "flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium leading-tight transition-all duration-200 sm:px-2 sm:text-[11px]"
    : "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200";
  const fieldLabel = compact
    ? "mb-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400"
    : "mb-1 block text-sm text-zinc-500 dark:text-zinc-400";
  const fieldInput = compact
    ? "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
    : "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  const showTabs = mode !== "forgot" && mode !== "reset";

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {showTabs ? (
        <div
          className={`flex rounded-xl border border-zinc-200 dark:border-zinc-800 ${compact ? "gap-0.5 p-0.5" : "gap-2 p-1"}`}
        >
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
            className={`${tabBtn} ${
              mode === "signin"
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
            className={`${tabBtn} ${
              mode === "signup"
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("confirm");
              setError(null);
              setMessage(null);
            }}
            className={`${tabBtn} ${
              mode === "confirm"
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Verify email
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={goBackToSignIn}
          className={
            compact
              ? "text-left text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              : "text-left text-sm font-medium text-emerald-600 dark:text-emerald-400"
          }
        >
          ← Back to sign in
        </button>
      )}

      <form
        onSubmit={
          mode === "signin"
            ? handleSignIn
            : mode === "signup"
              ? handleSignUp
              : mode === "confirm"
                ? handleConfirm
                : mode === "forgot"
                  ? handleForgotRequest
                  : handleResetComplete
        }
        className={compact ? "space-y-2.5" : "space-y-4"}
      >
        {mode === "signup" ? (
          <label className="block">
            <span className={fieldLabel}>Name (optional)</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldInput}
              placeholder="e.g. Vihar"
            />
          </label>
        ) : null}

        {mode === "forgot" ? (
          <p className={compact ? "text-[11px] text-zinc-600 dark:text-zinc-400" : "text-sm text-zinc-600 dark:text-zinc-400"}>
            Enter your email and we will send a reset code if an account exists.
          </p>
        ) : null}

        <label className="block">
          <span className={fieldLabel}>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldInput}
            placeholder="you@example.com"
          />
        </label>

        {mode === "signin" || mode === "signup" ? (
          <label className="block">
            <span className={fieldLabel}>Password (min 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldInput}
            />
          </label>
        ) : null}

        {mode === "signin" ? (
          <div className={compact ? "-mt-1" : "-mt-2"}>
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setMessage(null);
                setCode("");
                setNewPassword("");
              }}
              className={
                compact
                  ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-sm font-medium text-emerald-600 dark:text-emerald-400"
              }
            >
              Forgot password?
            </button>
          </div>
        ) : null}

        {mode === "confirm" || mode === "reset" ? (
          <label className="block">
            <span className={fieldLabel}>
              {mode === "reset" ? "Reset code from email" : "Verification code"}
            </span>
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={fieldInput}
              placeholder={mode === "reset" ? "Enter the code from the email" : "Enter 6-digit code"}
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <label className="block">
            <span className={fieldLabel}>New password (min 8 characters)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={fieldInput}
            />
          </label>
        ) : null}

        {error ? (
          <p className={compact ? "text-[11px] text-rose-600 dark:text-rose-400" : "text-sm text-rose-600 dark:text-rose-400"}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            className={
              compact ? "text-[11px] text-emerald-600 dark:text-emerald-400" : "text-sm text-emerald-600 dark:text-emerald-400"
            }
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className={
            compact
              ? "w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-emerald-500 disabled:opacity-50"
              : "w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:bg-emerald-500 disabled:opacity-50"
          }
        >
          {loading
            ? "..."
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "confirm"
                  ? "Confirm email"
                  : mode === "forgot"
                    ? "Email reset code"
                    : "Set new password"}
        </button>
        {mode === "confirm" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleResendCode()}
            className={
              compact
                ? "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                : "w-full rounded-xl border border-zinc-300 px-4 py-3 font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }
          >
            Resend code
          </button>
        ) : null}
        {mode === "reset" ? (
          <button
            type="button"
            disabled={loading || !email.trim()}
            onClick={() => void handleResendResetCode()}
            className={
              compact
                ? "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                : "w-full rounded-xl border border-zinc-300 px-4 py-3 font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }
          >
            Resend reset code
          </button>
        ) : null}
      </form>
    </div>
  );
}
