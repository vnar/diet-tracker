"use client";

import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LoginLanding() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-5 py-12 sm:px-8">
      <div className="absolute right-5 top-6 sm:right-8">
        <ThemeToggle />
      </div>
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-[-0.04em] text-zinc-900 dark:text-white sm:text-4xl">
          HealthOS
        </h1>
        <p className="mt-3 text-[13px] font-medium leading-relaxed tracking-wide text-zinc-500 dark:text-slate-400">
          Sign in or create an account to track weight and photos.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
