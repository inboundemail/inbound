import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { AutumnProvider } from "autumn-js/react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SpeedInsights } from "@vercel/speed-insights/next"

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400"], // Regular weight
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "inbound",
  description: "inbound email management platform",
  metadataBase: new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000'),
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {process.env.NODE_ENV === "test" && (
        <script
          crossOrigin="anonymous"
            src="//unpkg.com/react-scan/dist/auto.global.js"
          />
        )}
        <QueryProvider>
          <AutumnProvider backendUrl={process.env.BETTER_AUTH_URL || ""}>
            {children}
            <Analytics />
            <SpeedInsights />
          </AutumnProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
