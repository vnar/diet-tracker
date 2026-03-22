"use client";

import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LoginLanding() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          HealthOS
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Sign in or create an account to track weight and photos.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
