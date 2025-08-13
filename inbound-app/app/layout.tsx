import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { AutumnProvider } from "autumn-js/react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script";
import { Databuddy } from "@databuddy/sdk"

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
      <head>

        <Script
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(e,t,n,s,u,a){e.twq || (s = e.twq = function () {
                s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
              }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0, u.src = 'https://static.ads-twitter.com/uwt.js',
                a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a))}(window,document,'script');
              twq('config','q190x');
            `
          }}
        />

        <Script
          src="https://static.ads-twitter.com/uwt.js"
          strategy="beforeInteractive"
        />

      </head>
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
        <Databuddy clientId="jj0WXe_nNBuyT2e2YnLSY" trackErrors trackAttributes disabled={process.env.NODE_ENV === "development"} />

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
