import { apiKey } from "@better-auth/api-key";
import { dash } from "@better-auth/infra";
import { passkey } from "@better-auth/passkey";
import { render } from "@react-email/components";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin, magicLink, oAuthProxy } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import Inbound from "inboundemail";

import MagicLinkEmail from "@/emails/magic-link-email";
import { extractDomainFromEmail } from "@/lib/utils/email-utils";
import { db } from "../db/index";
import * as schema from "../db/schema";

// Blocked email domains - users cannot sign up with these domains
const BLOCKED_SIGNUP_DOMAINS = [
	// Mail.ru Group domains
	"mail.ru",
	"bk.ru",
	"inbox.ru",
	"list.ru",

	// Disposable/temp email services
	"trashmail.win",
	"bipochub.com",
	"fermiro.com",
	"dropeso.com",
	"nyfhk.com",
	"byom.de",
	"yopmail.com",
	"drmail.in",
	"protonza.com",
	"bitmens.com",
	"reuseme.info",
	"passmail.com",
	"mvpmedix.com",
	"tempmail.com",
	"guerrillamail.com",
	"mailinator.com",
	"10minutemail.com",
	"throwaway.email",
	"fakeinbox.com",
	"sharklasers.com",
	"guerrillamail.info",
	"grr.la",
	"guerrillamail.biz",
	"guerrillamail.de",
	"guerrillamail.net",
	"guerrillamail.org",
	"spam4.me",
	"temp-mail.org",
	"dispostable.com",
	"mailnesia.com",
	"getairmail.com",
	"mohmal.com",
	"tempail.com",
	"emailondeck.com",

	// Suspicious .xyz domains often used for spam
	"05050101.xyz",
	"621688.xyz",
];

const inbound = new Inbound({
	apiKey: process.env.INBOUND_API_KEY!,
	// Use localhost in development, production URL otherwise
	baseURL:
		process.env.NODE_ENV === "development"
			? "http://localhost:3000"
			: undefined,
});

/**
 * Check if an email domain is blocked from signing up
 */
async function isBlockedEmailDomain(email: string): Promise<boolean> {
	const domain = extractDomainFromEmail(email);
	if (!domain) return false;

	if (BLOCKED_SIGNUP_DOMAINS.includes(domain)) {
		return true;
	}

	try {
		const blockedDomain = await db
			.select({ id: schema.blockedSignupDomains.id })
			.from(schema.blockedSignupDomains)
			.where(
				and(
					eq(schema.blockedSignupDomains.domain, domain),
					eq(schema.blockedSignupDomains.isActive, true),
				),
			)
			.limit(1);

		return blockedDomain.length > 0;
	} catch (error) {
		console.error("Error checking blocked signup domain list:", error);
		return false;
	}
}

export const auth = betterAuth({
	baseURL:
		process.env.NODE_ENV === "development"
			? process.env.NEXT_PUBLIC_APP_URL
			: process.env.VERCEL_ENV === "preview"
				? `https://${process.env.VERCEL_BRANCH_URL}`
				: "https://inbound.new",
	trustedOrigins:
		process.env.NODE_ENV === "development"
			? [process.env.NEXT_PUBLIC_APP_URL as string, "http://localhost:3000"]
			: ([
					process.env.VERCEL_URL
						? `https://${process.env.VERCEL_URL}`
						: undefined,
					process.env.VERCEL_BRANCH_URL
						? `https://${process.env.VERCEL_BRANCH_URL}`
						: undefined,
					"https://inbound.new",
				].filter(Boolean) as string[]),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
			redirectURI: "https://inbound.new/api/auth/callback/github",
		},
		google: {
			prompt: "select_account",
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			redirectURI: "https://inbound.new/api/auth/callback/google",
		},
	},
	session: {
		updateAge: 24 * 60 * 60, // 24 hours
		expiresIn: 60 * 60 * 24 * 7, // 7 days
	},
	user: {
		additionalFields: {
			featureFlags: {
				type: "string",
				required: false,
				defaultValue: null,
			},
		},
	},
	plugins: [
		oAuthProxy({
			productionURL: "https://inbound.new",
			currentURL:
				process.env.NODE_ENV === "development"
					? (process.env.NEXT_PUBLIC_APP_URL as string)
					: process.env.VERCEL_URL
						? `https://${process.env.VERCEL_URL}`
						: process.env.VERCEL_BRANCH_URL
							? `https://${process.env.VERCEL_BRANCH_URL}`
							: undefined,
		}),
		apiKey({
			rateLimit: {
				enabled: true,
				timeWindow: 1000, // 1 second in milliseconds
				maxRequests: 4, // 4 requests per second
			},
		}),
		admin(),
		passkey({
			rpID:
				process.env.NODE_ENV === "development"
					? (process.env.NEXT_PUBLIC_APP_URL as string)
					: "inbound.new",
			rpName: "Inbound",
			origin:
				process.env.NODE_ENV === "development"
					? (process.env.NEXT_PUBLIC_APP_URL as string)
					: "https://inbound.new",
		}),
		magicLink({
			expiresIn: 300, // 5 minutes
			disableSignUp: process.env.NODE_ENV === "development" ? false : true, // Only allow magic link for existing accounts - new users must use Google OAuth
			sendMagicLink: async ({ email, url }, request) => {
				console.log(`📧 Sending magic link to ${email}`);

				try {
					// Use Inbound SDK (throws on error)
					const response = await inbound.emails.send({
						from: "Inbound <noreply@notifications.inbound.new>",
						to: email,
						subject: "Sign in to inbound",
						html: await render(MagicLinkEmail(url)),
						text: `Sign in to inbound\n\nClick this link to sign in: ${url}\n\nThis link will expire in 5 minutes.`,
						reply_to: "support@inbound.new",
					});

					console.log("✅ Magic link email sent successfully:", response.id);
				} catch (error) {
					console.error("❌ Error sending magic link:", error);
					throw error;
				}
			},
		}),
		dash(),
	],
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			// Block signups from banned email domains
			const body = ctx.body as { email?: string } | undefined;
			if (body?.email && (await isBlockedEmailDomain(body.email))) {
				console.log(
					`🚫 Blocked signup attempt from banned domain: ${body.email}`,
				);
				throw new Error(
					"Signups from this email domain are not allowed. Please use a different email address.",
				);
			}
		}),
		after: createAuthMiddleware(async (ctx) => {
			// Check if this is actually a new user creation (not just a login)
			if (ctx.context.newSession?.user) {
				const user = ctx.context.newSession.user;

				// Check if user was created very recently (within last 10 seconds)
				// This indicates actual signup vs existing user login
				const userCreatedAt = new Date(user.createdAt);
				const now = new Date();
				const timeDiffSeconds =
					(now.getTime() - userCreatedAt.getTime()) / 1000;

				if (timeDiffSeconds < 10) {
					console.log("New user signed up with email: ", user.email);

					// Redirect to onboarding page
					throw ctx.redirect("/onboarding-demo");
				} else {
					console.log("Existing user logged in with email: ", user.email);
					// need to redirect to dashboard
					throw ctx.redirect("/logs");
				}
			}
		}),
	},
});
