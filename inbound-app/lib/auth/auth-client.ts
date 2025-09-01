import { stripeClient } from "@better-auth/stripe/client"
import { createAuthClient } from "better-auth/react"
import { adminClient, apiKeyClient, lastLoginMethodClient } from "better-auth/client/plugins"
import { magicLinkClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    baseURL: typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NODE_ENV === 'development' 
            ? "http://localhost:3000" 
            : "https://inbound.new",
    plugins: [
        stripeClient({
            subscription: true
        }) as any, // Type assertion to resolve version compatibility issue
        adminClient(),
        apiKeyClient(),
        lastLoginMethodClient(),
        magicLinkClient()
    ]
})

export const { signIn, signUp, signOut, useSession } = authClient