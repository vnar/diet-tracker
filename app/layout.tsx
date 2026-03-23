import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppFooter } from "@/components/AppFooter";
import { FeedbackButton } from "@/components/FeedbackButton";
import { StoreHydration } from "@/components/StoreHydration";
import { Providers } from "@/components/Providers";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Ojas-Helath",
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
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body className={`${fontSans.className} flex min-h-screen flex-col overflow-x-hidden bg-zinc-950 text-zinc-100 antialiased`}>
        <Providers>
          <StoreHydration />
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <AppFooter />
          </div>
          <FeedbackButton />
        </Providers>
      </body>
    </html>
  );
}
