import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import "./prose.css";
import { AutumnProvider } from "autumn-js/react";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
import { QueryProvider } from "@/components/providers/query-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";

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
		default: "inbound | Email API for Developers - Send, Receive & Reply",
		template: "%s | inbound",
	},
	description:
		"Complete email infrastructure for modern applications. Send transactional emails, receive inbound messages, and build AI email agents with our TypeScript SDK and webhook API.",
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
		"custom domain email",
	],
	authors: [{ name: "inbound team" }],
	creator: "inbound",
	publisher: "inbound",
	formatDetection: {
		email: false,
		address: false,
		telephone: false,
	},
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	),
	openGraph: {
		type: "website",
		locale: "en_US",
		title: "inbound - email infrastructure, redefined",
		description:
			"the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing.",
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
		description:
			"the modern email infrastructure platform for developers. receive, parse, and manage inbound emails with powerful apis, webhooks, and real-time processing.",
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
				media: "(prefers-color-scheme: light)",
				url: "/images/icon-light.png",
				href: "/images/icon-light.png",
			},
			{
				media: "(prefers-color-scheme: dark)",
				url: "/images/icon-dark.png",
				href: "/images/icon-dark.png",
			},
		],
		shortcut: "/favicon.ico",
		apple: [
			{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
		],
	},
	category: "technology",
};

export const viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				{/* React Grab - AI Element Inspector (dev only) */}
				{process.env.NODE_ENV === "development" && (
					<Script
						src="//unpkg.com/react-grab/dist/index.global.js"
						crossOrigin="anonymous"
						strategy="beforeInteractive"
					/>
				)}

				{/* Google Analytics */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=G-0H8QD9DFB4"
					strategy="afterInteractive"
				/>
				<Script
					id="google-analytics"
					strategy="afterInteractive"
					dangerouslySetInnerHTML={{
						__html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-0H8QD9DFB4');
            `,
					}}
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
                  var d = document.documentElement;
                  // Enforce light mode only
                  d.classList.remove('dark');
                  try { localStorage.setItem('theme', 'light'); } catch {}
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
				{/* Schema.org structured data */}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify({
							"@context": "https://schema.org",
							"@type": "Organization",
							name: "Inbound",
							url: "https://inbound.new",
							logo: "https://inbound.new/logo.png",
							description:
								"Complete email infrastructure for modern applications. Send transactional emails, receive inbound messages, and build AI email agents with our TypeScript SDK and webhook API.",
							sameAs: [
								"https://twitter.com/inboundemail",
								"https://github.com/inboundemail/inbound",
							],
							contactPoint: {
								"@type": "ContactPoint",
								contactType: "customer service",
								email: "support@inbound.new",
							},
							offers: {
								"@type": "Offer",
								name: "Email API for Developers",
								description:
									"TypeScript SDK and webhook API for email automation",
								category: "Software Development Tools",
							},
						}),
					}}
				/>

				<NuqsAdapter>
					<QueryProvider>
						<RealtimeProvider>
							<AutumnProvider
								backendUrl={process.env.NEXT_PUBLIC_APP_URL || ""}
							>
								{children}
							</AutumnProvider>
						</RealtimeProvider>
					</QueryProvider>
				</NuqsAdapter>
				<AnalyticsTracker />
			</body>
		</html>
	);
}
