import type { Metadata } from "next";
import { Outfit, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { Analytics as DubAnalytics } from '@dub/analytics/react';
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

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "inbound - email infrastructure, redefined",
    template: "%s | inbound"
  },
  description: "the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing. built for scale.",
  keywords: [
    "email infrastructure",
    "inbound email",
    "email API",
    "webhook email",
    "email parsing",
    "developer tools",
    "email management",
    "SMTP",
    "email automation",
    "transactional email",
    "email routing"
  ],
  authors: [{ name: "inbound team" }],
  creator: "inbound",
  publisher: "inbound",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000'),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "inbound - email infrastructure, redefined",
    description: "the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing.",
    siteName: "inbound",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "inbound - email infrastructure platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "inbound - email infrastructure, redefined",
    description: "the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing.",
    images: ["/twitter-image.png"],
    creator: "@inboundemail",
    site: "@inboundemail",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      {
        media: '(prefers-color-scheme: light)',
        url: '/images/icon-light.png',
        href: '/images/icon-light.png',
      },
      {
        media: '(prefers-color-scheme: dark)',
        url: '/images/icon-dark.png',
        href: '/images/icon-dark.png',
      },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  category: "technology",
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
        {/* Structured Data for SEO */}
        <Script
          id="structured-data"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "inbound",
              "description": "the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing.",
              "url": process.env.BETTER_AUTH_URL || "https://inbound.new",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Organization",
                "name": "inbound",
                "url": process.env.BETTER_AUTH_URL || "https://inbound.new"
              },
              "publisher": {
                "@type": "Organization",
                "name": "inbound",
                "url": process.env.BETTER_AUTH_URL || "https://inbound.new"
              }
            })
          }}
        />

        {/* Twitter Conversion Tracking */}
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
        className={`${outfit.variable} ${geist.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var theme = localStorage.getItem('theme');
                  var d = document.documentElement;
                  if (theme === 'light') d.classList.remove('dark');
                  else d.classList.add('dark');
                } catch {}
              })();
            `,
          }}
        />
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
      <DubAnalytics domainsConfig={{
        refer: "inbd.link"
      }} />
    </html>
  );
}
