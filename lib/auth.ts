import { betterAuth } from "better-auth";
import { db } from "./db/index";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { stripe } from "@better-auth/stripe";
import { admin, apiKey, oAuthProxy } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import * as schema from "./db/schema";
import { nanoid } from "nanoid";
import { Resend } from "resend";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
    trustedOrigins: process.env.VERCEL_URL ? [process.env.VERCEL_URL] : ["http://localhost:3000"],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: schema
    }),
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
            ...(process.env.NODE_ENV !== 'development' && {
                redirectURI: "https://inbound.new/api/auth/callback/github"
            })
        },
        google: { 
            prompt: "select_account", 
            clientId: process.env.GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            ...(process.env.NODE_ENV !== 'development' && {
                redirectURI: "https://inbound.new/api/auth/callback/google"
            })
        },
    },
    plugins: [
        oAuthProxy({
            productionURL: process.env.BETTER_AUTH_URL || "http://localhost:3000"
        }),
        apiKey(
            {
                rateLimit: {
                    enabled: false
                }
            }
        ),
        admin(),
        magicLink({
            expiresIn: 300, // 5 minutes
            disableSignUp: false, // Allow new user creation via magic link
            sendMagicLink: async ({ email, url, token }, request) => {
                console.log(`📧 Sending magic link to ${email}`);
                
                if (process.env.NODE_ENV === 'development') {
                    // In development, log the magic link to console for easy access
                    console.log(`🔗 Magic Link URL: ${url}`);
                    console.log(`🎫 Token: ${token}`);
                }

                try {
                    const { data, error } = await resend.emails.send({
                        from: 'noreply@inbound.new',
                        to: email,
                        subject: 'Sign in to Inbound',
                        html: `
                            <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                <div style="text-align: center; padding: 40px 20px;">
                                    <h1 style="color: #1f2937; margin-bottom: 16px;">Sign in to Inbound</h1>
                                    <p style="color: #6b7280; font-size: 16px; margin-bottom: 32px;">
                                        Click the button below to securely sign in to your account.
                                    </p>
                                    <a href="${url}" 
                                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                        Sign in to Inbound
                                    </a>
                                    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
                                        This link will expire in 5 minutes for security.
                                    </p>
                                    ${process.env.NODE_ENV === 'development' ? `
                                        <div style="margin-top: 32px; padding: 16px; background: #f3f4f6; border-radius: 8px; text-align: left;">
                                            <p style="color: #374151; font-size: 12px; font-family: monospace; word-break: break-all; margin: 0;">
                                                <strong>Dev URL:</strong> ${url}
                                            </p>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `,
                        text: `Sign in to Inbound\n\nClick this link to sign in: ${url}\n\nThis link will expire in 5 minutes.`
                    });

                    if (error) {
                        console.error('❌ Failed to send magic link email:', error);
                        throw new Error(`Failed to send email: ${error.message}`);
                    }

                    console.log('✅ Magic link email sent successfully:', data?.id);
                } catch (error) {
                    console.error('❌ Error sending magic link:', error);
                    throw error;
                }
            }
        }),
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true
        })
    ],
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
            // Check if this is a new user creation event
            if (ctx.path.startsWith("/sign-up") || (ctx.path.startsWith("/sign-in") && ctx.context.newSession)) {
                const newSession = ctx.context.newSession;
                if (newSession?.user) {
                    const user = newSession.user;
                    console.log(`🎉 New user detected: ${user.email} (${user.id})`);
                    
                    try {
                        // Check if this user already has onboarding record (to avoid duplicates on social sign-in)
                        const existingOnboarding = await db
                            .select()
                            .from(schema.userOnboarding)
                            .where(eq(schema.userOnboarding.userId, user.id))
                            .limit(1);
                        
                        if (existingOnboarding.length === 0) {
                            console.log(`📝 Creating onboarding record for user ${user.id}`);
                            
                            // Create onboarding record
                            const onboardingId = nanoid();
                            await db.insert(schema.userOnboarding).values({
                                id: onboardingId,
                                userId: user.id,
                                isCompleted: false,
                                defaultEndpointCreated: false,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            });
                            
                            // Note: User will manually create their first endpoint through the onboarding UI
                            console.log(`ℹ️ Onboarding record created for user ${user.id}. User will create endpoints manually.`);
                        } else {
                            console.log(`ℹ️ Onboarding record already exists for user ${user.id}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error creating onboarding data for user ${user.id}:`, error);
                        // Don't throw error to avoid blocking the auth flow
                    }
                }
            }
        })
    }
})