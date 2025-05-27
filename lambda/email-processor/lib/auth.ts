import { betterAuth } from "better-auth";
import { db } from "./db/index";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";
import * as schema from "./db/schema";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "mysql",
        schema: schema
    }),
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        },
    },
    plugins: [
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true
        })
    ]
})