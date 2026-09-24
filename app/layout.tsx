import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AdSetGo — Google Ads reporting for agencies",
  description: "Give every client their own live Google Ads report.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The stored choice arrives with the request, so the right theme is in the
  // first byte of HTML. With nothing stored, no class is set and the media
  // query in globals.css follows the system. Either way there is no inline
  // script and no flash of the wrong theme.
  const stored = (await cookies()).get("theme")?.value;
  const themeClass = stored === "dark" ? "dark" : stored === "light" ? "light" : "";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${themeClass} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
