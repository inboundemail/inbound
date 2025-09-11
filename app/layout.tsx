import type { Metadata } from "next";
import { Outfit, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./prose.css";
import { Analytics } from "@vercel/analytics/next"
import { Analytics as DubAnalytics } from '@dub/analytics/react';
import { AutumnProvider } from "autumn-js/react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SpeedInsights } from "@vercel/speed-insights/next"
import Script from "next/script";
import { Databuddy } from "@databuddy/sdk"
import { RootProvider } from 'fumadocs-ui/provider';

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"], // Regular weight
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
    "email routing",
    "mailgun alternative",
    "sendgrid alternative",
    "improvmx alternative",
    "email to webhook",
    "email webhook service",
    "inbound email API",
    "email processing API",
    "typescript email SDK",
    "structured email data",
    "email parser API",
    "webhook email forwarding",
    "email API for developers",
    "inbound email processing",
    "email infrastructure platform",
    "modern email API",
    "email parsing service",
    "webhook email integration",
    "email automation API",
    "custom domain email"
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
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  "name": "inbound",
                  "description": "the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing. built for scale.",
                  "url": process.env.BETTER_AUTH_URL || "https://inbound.new",
                  "applicationCategory": "DeveloperApplication",
                  "operatingSystem": "Web",
                  "softwareVersion": "2.0",
                  "programmingLanguage": ["TypeScript", "JavaScript", "Python", "PHP", "Ruby"],
                  "offers": [
                    {
                      "@type": "Offer",
                      "name": "Free Plan",
                      "price": "0",
                      "priceCurrency": "USD",
                      "description": "1,000 emails/month free"
                    },
                    {
                      "@type": "Offer", 
                      "name": "Pro Plan",
                      "price": "5",
                      "priceCurrency": "USD",
                      "description": "100,000 emails/month"
                    }
                  ],
                  "author": {
                    "@type": "Organization",
                    "name": "inbound",
                    "url": process.env.BETTER_AUTH_URL || "https://inbound.new",
                    "logo": {
                      "@type": "ImageObject",
                      "url": (process.env.BETTER_AUTH_URL || "https://inbound.new") + "/images/icon-light.png"
                    }
                  },
                  "publisher": {
                    "@type": "Organization",
                    "name": "inbound",
                    "url": process.env.BETTER_AUTH_URL || "https://inbound.new"
                  },
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.9",
                    "reviewCount": "127",
                    "bestRating": "5"
                  },
                  "featureList": [
                    "inbound email processing",
                    "webhook integration",
                    "typescript SDK",
                    "email parsing API",
                    "real-time processing",
                    "custom domain support",
                    "email routing",
                    "structured data parsing"
                  ]
                },
                {
                  "@type": "WebSite",
                  "name": "inbound",
                  "url": process.env.BETTER_AUTH_URL || "https://inbound.new",
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": (process.env.BETTER_AUTH_URL || "https://inbound.new") + "/search?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                  }
                },
                {
                  "@type": "Organization",
                  "name": "inbound",
                  "url": process.env.BETTER_AUTH_URL || "https://inbound.new",
                  "logo": {
                    "@type": "ImageObject",
                    "url": (process.env.BETTER_AUTH_URL || "https://inbound.new") + "/images/icon-light.png"
                  },
                  "sameAs": [
                    "https://twitter.com/inbounddotnew",
                    "https://discord.gg/JVdUrY9gJZ"
                  ],
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "Customer Service",
                    "email": "support@inbound.new"
                  }
                }
              ]
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
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
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

        <RootProvider>
          <QueryProvider>
            <AutumnProvider backendUrl={process.env.BETTER_AUTH_URL || ""}>
              {children}
              <Analytics />
              <SpeedInsights />
            </AutumnProvider>
          </QueryProvider>
        </RootProvider>
      </body>
      <DubAnalytics domainsConfig={{
        refer: "inbd.link"
      }} />
    </html>
  );
}
