import { betterAuth } from "better-auth";
import { db } from "../db/index";
import { Dub } from "dub";
import { dubAnalytics } from "@dub/better-auth";
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
import { Inbound } from "@inboundemail/sdk";
import path from "path";
import fs from "fs";

const dub = new Dub();


const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const resend = new Resend(process.env.RESEND_API_KEY);
const inbound = new Inbound(process.env.INBOUND_API_KEY!);

export const auth = betterAuth({
    baseURL: process.env.NODE_ENV === 'development'
        ? "http://localhost:3000"
        : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.VERCEL_BRANCH_URL
                ? `https://${process.env.VERCEL_BRANCH_URL}`
                : "https://inbound.new",
    trustedOrigins: process.env.NODE_ENV === 'development' 
        ? ["http://localhost:3000"] 
        : [
            "https://inbound.new",
            process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
            process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : "",
            process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ""
        ].filter(Boolean),
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: schema
    }),
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
            // Always use production URL for OAuth proxy to work properly
            redirectURI: "https://inbound.new/api/auth/callback/github"
        },
        google: { 
            prompt: "select_account", 
            clientId: process.env.GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            // Always use production URL for OAuth proxy to work properly
            redirectURI: "https://inbound.new/api/auth/callback/google"
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
        dubAnalytics({
            dubClient: dub,
          }),
        oAuthProxy({
            productionURL: process.env.BETTER_AUTH_URL || "https://inbound.new",
            currentURL: process.env.NODE_ENV === 'development' 
                ? "http://localhost:3000" 
                : process.env.VERCEL_URL 
                    ? `https://${process.env.VERCEL_URL}` 
                    : process.env.VERCEL_BRANCH_URL 
                        ? `https://${process.env.VERCEL_BRANCH_URL}` 
                        : undefined
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
                    const { data, error } = await inbound.emails.send({
                        from: 'Inbound <noreply@inbound.new>',
                        to: email,
                        subject: 'Sign in to inbound',
                        html: `
                            <!DOCTYPE html>
                            <html lang="en">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>Sign in to inbound</title>
                                <link rel="preconnect" href="https://fonts.googleapis.com">
                                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                                <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
                                <style>
                                    @media (prefers-color-scheme: dark) {
                                        .dark-mode { display: block !important; }
                                        .light-mode { display: none !important; }
                                    }
                                    @media (prefers-color-scheme: light) {
                                        .dark-mode { display: none !important; }
                                        .light-mode { display: block !important; }
                                    }
                                </style>
                            </head>
                            <body style="margin: 0; padding: 20px; font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; letter-spacing: -0.04em; background: linear-gradient(135deg, #f8fafc, #f1f5f9);">
                                <!-- Light Mode Version -->
                                <div class="light-mode" style="display: block;">
                                    <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, rgba(248, 250, 252, 0.6), rgba(241, 245, 249, 0.4)); border-radius: 30px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                                        <div style="background: #ffffff; margin: 8px; border-radius: 25px; padding: 48px 32px; border: 1px solid rgba(0, 0, 0, 0.10);">
                                            <!-- Header with Inbound Logo -->
                                            <div style="text-align: center; margin-bottom: 32px;">
                                                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 20px;">
                                                    <span style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 600; color: #414141;">inbound</span>
                                                </div>
                                                <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #414141; margin: 0 0 12px 0; font-size: 32px; font-weight: 600; text-align: center; letter-spacing: -0.025em;">Welcome back!</h1>
                                                <p style="color: #6b7280; font-size: 16px; margin: 0; text-align: center; line-height: 1.5;">
                                                    Click the button below to securely sign in to your account.
                                                </p>
                                            </div>

                                            <!-- CTA Button with gradient background -->
                                            <div style="text-align: center; margin-bottom: 40px; position: relative;">
                                                <!-- Subtle gradient glow effect -->
                                                <div style="position: absolute; inset: -8px; background: linear-gradient(45deg, rgba(124, 58, 237, 0.1), rgba(139, 92, 246, 0.1), rgba(168, 85, 247, 0.1)); border-radius: 16px; filter: blur(8px);"></div>
                                                <a href="${url}" 
                                                   style="position: relative; display: inline-block; background: #8161FF; color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 14px 0 rgba(129, 97, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.26); transition: all 0.2s ease;">
                                                    Sign in to inbound
                                                </a>
                                            </div>

                                            <!-- Security note -->
                                            <div style="text-align: center; padding: 24px 0; border-top: 1px solid rgba(0, 0, 0, 0.08); margin-top: 8px;">
                                                <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.4;">
                                                    This secure link will expire in <strong style="color: #414141;">5 minutes</strong> for your security.<br/>
                                                    If you didn't request this, you can safely ignore this email.
                                                </p>
                                            </div>

                                            ${process.env.NODE_ENV === 'development' ? `
                                                <!-- Development URL (light) -->
                                                <div style="margin-top: 32px; padding: 16px; background: rgba(139, 92, 246, 0.05); border: 1px solid rgba(139, 92, 246, 0.15); border-radius: 12px;">
                                                    <p style="color: #7c3aed; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; word-break: break-all; margin: 0; line-height: 1.4;">
                                                        <strong style="color: #6d28d9;">Development URL:</strong><br/>
                                                        ${url}
                                                    </p>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>

                                    <!-- Footer -->
                                    <div style="text-align: center; padding: 24px; margin-top: 16px;">
                                        <p style="color: #6b7280; font-size: 12px; margin: 0;">
                                            © ${new Date().getFullYear()} inbound • Email infrastructure, redefined
                                        </p>
                                    </div>
                                </div>

                                <!-- Dark Mode Version -->
                                <div class="dark-mode" style="display: none;">
                                    <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, rgba(20, 2, 28, 0.6), rgba(15, 1, 20, 0.4)); border-radius: 30px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);">
                                        <div style="background: #0f0114; margin: 8px; border-radius: 25px; padding: 48px 32px; border: 1px solid rgba(255, 255, 255, 0.10);">
                                            <!-- Header with Inbound Logo (Dark) -->
                                            <div style="text-align: center; margin-bottom: 32px;">
                                                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 20px;">
                                                    <!-- Inbound Icon SVG (same as light) -->
                                                    <span style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 600; color: #ffffff;">inbound</span>
                                                </div>
                                                <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0 0 12px 0; font-size: 32px; font-weight: 600; text-align: center; letter-spacing: -0.025em;">Welcome back!</h1>
                                                <p style="color: #94a3b8; font-size: 16px; margin: 0; text-align: center; line-height: 1.5;">
                                                    Click the button below to securely sign in to your account.
                                                </p>
                                            </div>

                                            <!-- CTA Button with gradient background (Dark) -->
                                            <div style="text-align: center; margin-bottom: 40px; position: relative;">
                                                <!-- Subtle gradient glow effect -->
                                                <div style="position: absolute; inset: -8px; background: linear-gradient(45deg, rgba(124, 58, 237, 0.2), rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.2)); border-radius: 16px; filter: blur(8px);"></div>
                                                <a href="${url}" 
                                                   style="position: relative; display: inline-block; background: #8161FF; color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 14px 0 rgba(129, 97, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1); transition: all 0.2s ease;">
                                                    Sign in to inbound
                                                </a>
                                            </div>

                                            <!-- Security note (Dark) -->
                                            <div style="text-align: center; padding: 24px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 8px;">
                                                <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.4;">
                                                    This secure link will expire in <strong style="color: #ffffff;">5 minutes</strong> for your security.<br/>
                                                    If you didn't request this, you can safely ignore this email.
                                                </p>
                                            </div>

                                            ${process.env.NODE_ENV === 'development' ? `
                                                <!-- Development URL (dark) -->
                                                <div style="margin-top: 32px; padding: 16px; background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.20); border-radius: 12px;">
                                                    <p style="color: #bcacff; font-size: 12px; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; word-break: break-all; margin: 0; line-height: 1.4;">
                                                        <strong style="color: #d8b4fe;">Development URL:</strong><br/>
                                                        ${url}
                                                    </p>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>

                                    <!-- Footer (Dark) -->
                                    <div style="text-align: center; padding: 24px; margin-top: 16px;">
                                        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                                            © ${new Date().getFullYear()} inbound • Email infrastructure, redefined
                                        </p>
                                    </div>
                                </div>
                            </body>
                            </html>
                        `,
                        text: `Sign in to inbound\n\nClick this link to sign in: ${url}\n\nThis link will expire in 5 minutes.`,
                    });

                    if (error) {
                        console.error('❌ Failed to send magic link email:', error);
                        throw new Error(`Failed to send email: ${error}`);
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