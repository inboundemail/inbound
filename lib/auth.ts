import { betterAuth } from "better-auth";
import { db } from "./db/index";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { stripe } from "@better-auth/stripe";
import { admin } from "better-auth/plugins";
import Stripe from "stripe";
import * as schema from "./db/schema";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);

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
        },
        google: { 
            prompt: "select_account", 
            clientId: process.env.GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, 
        },
    },
    plugins: [
        admin(),
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true
        })
    ]
})