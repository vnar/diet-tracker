import { handlers } from "@/auth";

/** Required for `output: 'export'` — handlers are not executed at static build time. */
export const dynamic = "force-static";

/**
 * Static paths for Auth.js actions (see `@auth/core` `parseActionAndProviderId`).
 * Export build requires these; runtime on pure static hosting still needs a server for APIs.
 */
export function generateStaticParams() {
  return [
    { nextauth: ["providers"] },
    { nextauth: ["session"] },
    { nextauth: ["csrf"] },
    { nextauth: ["signout"] },
    { nextauth: ["error"] },
    { nextauth: ["verify-request"] },
    { nextauth: ["signin", "credentials"] },
    { nextauth: ["callback", "credentials"] },
  ];
}

export const { GET, POST } = handlers;
