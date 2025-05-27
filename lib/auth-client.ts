import { stripeClient } from "@better-auth/stripe/client"
import { createAuthClient } from "better-auth/react"

export const { signIn, signUp, signOut, useSession } = createAuthClient({
    plugins: [
        stripeClient({
            subscription: true
        })
    ]
})