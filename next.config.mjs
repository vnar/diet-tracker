import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  turbopack: {
    root: repoRoot,
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
  },
  env: {
    // Fallback so admin UI works if Amplify omits the var; API still enforces ADMIN_EMAILS on Lambda.
    NEXT_PUBLIC_ADMIN_EMAILS:
      process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "ojashealth2026@gmail.com",
  },
};

export default nextConfig;
