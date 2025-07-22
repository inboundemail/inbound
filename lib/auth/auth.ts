import { betterAuth } from "better-auth";
import { db } from "../db/index";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { stripe } from "@better-auth/stripe";
import { admin, apiKey, oAuthProxy } from "better-auth/plugins";
import { magicLink } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import * as schema from "../db/schema";
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
    session: {
        updateAge: 24 * 60 * 60, // 24 hours
        expiresIn: 60 * 60 * 24 * 7, // 7 days
    },
    user: {
        additionalFields: {
            featureFlags: {
                type: "string",
                required: false,
                defaultValue: null
            }
        }
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
                            <div style="max-width: 600px; margin: 0 auto; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #f8fafc, #f1f5f9); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                                <div style="background: white; margin: 8px; border-radius: 12px; padding: 48px 32px;">
                                    <div style="text-align: center; margin-bottom: 16px;">
                                        <div style="display: inline-block; background: #2563eb; color: white; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                            </svg>
                                        </div>
                                    </div>
                                    <h1 style="color: #111827; margin: 0 0 8px 0; font-size: 28px; font-weight: 600; text-align: center; letter-spacing: -0.025em;">Welcome to Inbound</h1>
                                    <p style="color: #6b7280; font-size: 16px; margin: 0 0 32px 0; text-align: center; line-height: 1.5;">
                                        Click the button below to securely sign in to your account and start managing your email infrastructure.
                                    </p>
                                    <div style="text-align: center; margin-bottom: 32px;">
                                        <a href="${url}" 
                                           style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; transition: background-color 0.2s;">
                                            Sign in to Inbound
                                        </a>
                                    </div>
                                    <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                                        <p style="color: #9ca3af; font-size: 14px; margin: 0; line-height: 1.4;">
                                            This secure link will expire in 5 minutes for your security.<br/>
                                            If you didn't request this, you can safely ignore this email.
                                        </p>
                                    </div>
                                    ${process.env.NODE_ENV === 'development' ? `
                                        <div style="margin-top: 32px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: left;">
                                            <p style="color: #475569; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; word-break: break-all; margin: 0; line-height: 1.4;">
                                                <strong style="color: #334155;">Development URL:</strong><br/>
                                                ${url}
                                            </p>
                                        </div>
                                    ` : ''}
                                </div>
                                <div style="text-align: center; padding: 24px; color: #64748b; font-size: 12px;">
                                    <p style="margin: 0;">
                                        © ${new Date().getFullYear()} Inbound. Email infrastructure, redefined.
                                    </p>
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