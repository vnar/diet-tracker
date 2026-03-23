"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";

export function LoginForm() {
  const router = useRouter();
  const { signIn, signUp } = useCognitoAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
        setError("Check your email to confirm your account, then sign in.");
        setMode("signin");
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

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
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
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
            mode === "signup"
              ? "bg-emerald-600 text-white"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Create account
        </button>
      </div>

      <form
        onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
        className="space-y-4"
      >
        {mode === "signup" ? (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Name (optional)
            </span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="e.g. Vihar"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            Password (min 8 characters)
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
