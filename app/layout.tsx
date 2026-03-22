import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreHydration } from "@/components/StoreHydration";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "HealthOS",
  description: "Daily awareness dashboard for weight and habits",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers>
          <StoreHydration />
          {children}
        </Providers>
      </body>
    </html>
  );
}
