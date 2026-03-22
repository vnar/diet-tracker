import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreHydration } from "@/components/StoreHydration";

export const metadata: Metadata = {
  title: "HealthOS",
  description: "Daily awareness dashboard for weight and habits",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <StoreHydration />
        {children}
      </body>
    </html>
  );
}
