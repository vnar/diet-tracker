/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    // Fallback so admin UI works if Amplify omits the var; API still enforces ADMIN_EMAILS on Lambda.
    NEXT_PUBLIC_ADMIN_EMAILS:
      process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "viharnar@gmail.com",
  },
};

export default nextConfig;
