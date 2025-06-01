import { stripeClient } from "@better-auth/stripe/client"
import { createAuthClient } from "better-auth/react"
import { adminClient, apiKeyClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    plugins: [
        stripeClient({
            subscription: true
        }),
        adminClient(),
        apiKeyClient()
    ]
})

export const { signIn, signUp, signOut, useSession } = authClient