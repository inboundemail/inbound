"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { useState } from "react";
import { toast } from "sonner";
import Envelope2 from "@/components/icons/envelope-2";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"form">) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleGitHubSignIn = async () => {
    setIsGitHubLoading(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/logs", // Main layout will handle onboarding redirect
        errorCallbackURL: "/login?error=auth_failed",
      });
      // Don't reset loading state here as we'll be redirecting
    } catch (error) {
      console.error("GitHub sign in error:", error);
      setIsGitHubLoading(false); // Only reset on error
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/logs", // Main layout will handle onboarding redirect
        errorCallbackURL: "/login?error=auth_failed",
      });
      // Don't reset loading state here as we'll be redirecting
    } catch (error) {
      console.error("Google sign in error:", error);
      setIsGoogleLoading(false); // Only reset on error
    }
  };

  const handleMagicLinkSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    if (!email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsMagicLinkLoading(true);
    try {
      const { data, error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: "/logs", // Main layout will handle onboarding redirect
      });

      if (error) {
        throw new Error(error.message || "Failed to send magic link");
      }

      setMagicLinkSent(true);
      toast.success(
        `Magic link sent to ${email}! Check your email to sign in.`
      );
    } catch (error) {
      console.error("Magic link error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send magic link"
      );
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  // Disable buttons if any login is in progress
  const isAnyLoading = isGoogleLoading || isGitHubLoading || isMagicLinkLoading;

  if (magicLinkSent) {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">check your email</h1>
          <p className="text-balance text-sm text-muted-foreground">
            We've sent a magic link to <strong className="text-foreground">{email}</strong>. Click the link
            in your email to sign in.
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
              <strong>Dev mode:</strong> Check your console for the magic link
              URL
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setMagicLinkSent(false);
            setEmail("");
          }}
        >
          Try a different email
        </Button>
      </div>
    );
  }

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      onSubmit={handleMagicLinkSignIn}
      {...props}
    >
      {/* Magic Link Section */}
      <div className="grid gap-1">
        <Label htmlFor="email" className="text-sm font-medium">
          Email Address
        </Label>
        <div className="grid gap-2">
          <div className="relative">
            <Envelope2
              width="15"
              height="15"
              className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            />
            <Input
              className="pl-9"
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isAnyLoading}
              autoComplete="email"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isAnyLoading || !email.trim()}
          >
            {isMagicLinkLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending magic link...
              </>
            ) : (
              <>Send magic link</>
            )}
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="relative flex items-center justify-center text-xs uppercase">
        <div className="w-full h-px bg-gradient-to-r from-transparent to-border" />
        <span className="bg-card px-2 text-muted-foreground whitespace-nowrap">
          or continue with
        </span>
        <div className="w-full h-px bg-gradient-to-l from-transparent to-border" />
      </div>

      <div className="grid gap-2">
        {/* Google OAuth */}
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isAnyLoading}
        >
          {!isGoogleLoading && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-2"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {isGoogleLoading
            ? "Redirecting to Google..."
            : "Continue with Google"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleGitHubSignIn}
          disabled={isAnyLoading}
        >
          {!isGitHubLoading && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-2"
            >
              <path
                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                fill="currentColor"
              />
            </svg>
          )}
          {isGitHubLoading
            ? "Redirecting to GitHub..."
            : "Continue with GitHub"}
        </Button>
      </div>
    </form>
  );
}
