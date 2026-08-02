import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { render } from "@react-email/components";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
	admin,
	bearer,
	deviceAuthorization,
	jwt,
	magicLink,
	oAuthProxy,
} from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import Inbound from "inboundemail";
import { nanoid } from "nanoid";

import MagicLinkEmail from "@/emails/magic-link-email";
import WelcomeSignupEmail from "@/emails/welcome-signup";
import {
	getCurrentOAuthClientId,
	getInboundOAuthSession,
	getValidRecentInboundOAuthGrantId,
	INBOUND_DOMAIN_SCOPE,
	INBOUND_SESSION_CLAIM,
} from "@/lib/auth/inbound-oauth";
import { inboundOAuthNeedsDomainSelection } from "@/lib/auth/inbound-oauth-session";
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

export const authBaseURL =
	process.env.NODE_ENV === "development"
		? process.env.NEXT_PUBLIC_APP_URL
		: process.env.VERCEL_ENV === "preview"
			? `https://${process.env.VERCEL_BRANCH_URL}`
			: "https://inbound.new";

async function requireInboundOAuthSession(referenceId: string, userId: string) {
	const inboundSession = await getInboundOAuthSession(referenceId, userId);
	if (!inboundSession) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_grant",
			error_description: "The Inbound domain grant is no longer valid.",
		});
	}
	return inboundSession;
}

/**
 * Check if an email domain is blocked from signing up
 */
async function isBlockedEmailDomain(email: string): Promise<boolean> {
	const domain = email.split("@")[1]?.toLowerCase();
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
	baseURL: authBaseURL,
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
					: process.env.VERCEL_ENV === "preview"
						? `https://${process.env.VERCEL_BRANCH_URL}`
						: undefined,
		}),
		jwt(),
		oauthProvider({
			loginPage: "/login",
			consentPage: "/oauth/consent",
			scopes: [
				"openid",
				"profile",
				"email",
				"offline_access",
				INBOUND_DOMAIN_SCOPE,
			],
			grantTypes: ["authorization_code", "refresh_token"],
			validAudiences: [`${authBaseURL}/api`],
			allowDynamicClientRegistration: false,
			allowUnauthenticatedClientRegistration: false,
			clientPrivileges: ({ user }) => user?.role === "admin",
			postLogin: {
				page: "/oauth/domain-access",
				shouldRedirect: async ({ user, session, scopes }) => {
					if (!scopes.includes(INBOUND_DOMAIN_SCOPE)) return false;
					const clientId = await getCurrentOAuthClientId();
					const grantId = clientId
						? await getValidRecentInboundOAuthGrantId({
								userId: user.id,
								sessionId: session.id,
								clientId,
							})
						: null;
					return inboundOAuthNeedsDomainSelection(scopes, grantId);
				},
				consentReferenceId: async ({ user, session, scopes }) => {
					if (!scopes.includes(INBOUND_DOMAIN_SCOPE)) return undefined;
					const clientId = await getCurrentOAuthClientId();
					if (!clientId) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description: "The OAuth client could not be resolved.",
						});
					}
					const grantId = await getValidRecentInboundOAuthGrantId({
						userId: user.id,
						sessionId: session.id,
						clientId,
					});
					if (!grantId) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description: "Select Inbound domain access first.",
						});
					}
					return grantId;
				},
			},
			customAccessTokenClaims: async ({ user, scopes, referenceId }) => {
				if (!scopes.includes(INBOUND_DOMAIN_SCOPE)) return {};
				if (!user?.id || !referenceId) {
					throw new APIError("UNAUTHORIZED", {
						error: "invalid_grant",
						error_description: "The Inbound domain grant is missing.",
					});
				}
				return {
					[INBOUND_SESSION_CLAIM]: await requireInboundOAuthSession(
						referenceId,
						user.id,
					),
				};
			},
			customTokenResponseFields: async ({
				user,
				scopes,
				verificationValue,
			}) => {
				if (!scopes.includes(INBOUND_DOMAIN_SCOPE)) return {};
				const referenceId = verificationValue?.referenceId;
				if (!user?.id || !referenceId) return {};
				return {
					inbound_session: await requireInboundOAuthSession(
						referenceId,
						user.id,
					),
				};
			},
		}),
		bearer(),
		deviceAuthorization({
			verificationUri: "/device",
			expiresIn: "10m",
			interval: "5s",
			userCodeLength: 8,
			validateClient: (clientId) => clientId === "inboundctl",
		}),
		apiKey({
			// E2 endpoints already enforce account-level rate limits. Disabling
			// Better Auth's per-key limiter avoids turning valid internal traffic
			// into 401s before the API's own rate-limit handling runs.
			rateLimit: {
				enabled: false,
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
			sendMagicLink: async ({ email, url }, _request) => {
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
	],
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Personal welcome email from Ryan on every new signup.
					// Fire-and-forget: never block or fail the signup flow.
					try {
						const firstName = user.name?.trim().split(/\s+/)[0];
						const html = await render(
							WelcomeSignupEmail({ userFirstname: firstName }),
						);
						const response = await inbound.emails.send({
							from: "Ryan Vogel <ryan@inbound.new>",
							to: user.email,
							reply_to: "ryan@inbound.new",
							subject: "thanks for signing up for inbound",
							html,
							text: `hey${firstName ? ` ${firstName}` : ""} — my name is ryan. i built inbound.\n\nthanks for signing up. if you have any questions, hit a wall, or just want to tell me what you're building, reply to this email and i will most likely be the one who reads it and responds. this is my real email.\n\n— ryan`,
							tags: [{ name: "type", value: "welcome-signup" }],
						});
						console.log("✅ Welcome email sent:", response.id, user.email);
					} catch (error) {
						console.error("❌ Error sending welcome email:", error);
					}
				},
			},
		},
	},
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
			if (ctx.path === "/device/token") return;

			if (ctx.context.newSession?.user) {
				const user = ctx.context.newSession.user;
				const userCreatedAt = new Date(user.createdAt);
				const now = new Date();
				const timeDiffSeconds =
					(now.getTime() - userCreatedAt.getTime()) / 1000;
				const [onboarding] = await db
					.select({ isCompleted: schema.userOnboarding.isCompleted })
					.from(schema.userOnboarding)
					.where(eq(schema.userOnboarding.userId, user.id))
					.limit(1);

				if (onboarding && !onboarding.isCompleted) {
					throw ctx.redirect("/onboarding");
				}

				if (timeDiffSeconds < 10) {
					console.log("New user signed up with email: ", user.email);
					await db
						.insert(schema.userOnboarding)
						.values({
							id: nanoid(),
							userId: user.id,
							isCompleted: false,
							defaultEndpointCreated: false,
							createdAt: now,
							updatedAt: now,
						})
						.onConflictDoNothing();
					throw ctx.redirect("/onboarding");
				}

				const location = ctx.context.responseHeaders?.get("location");
				const responsePath = location
					? new URL(location, ctx.context.baseURL).pathname
					: null;
				if (
					ctx.path === "/passkey/verify-authentication" ||
					responsePath === "/device"
				) {
					return;
				}

				if ((await getCurrentOAuthClientId()) !== null) return;

				console.log("Existing user logged in with email: ", user.email);
				throw ctx.redirect("/logs");
			}
		}),
	},
});
