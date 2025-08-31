"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import InboundIcon from "@/components/icons/inbound";
import { useSession } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";

// Component that handles search params logic
function LoginContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Magic link verification states
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  
  // Magic link sent state (moved from LoginForm to prevent resets)
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");

  // Check for magic link verification status on mount
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success === 'magic_link' && session && !isPending) {
      // Magic link success - redirect immediately to logs
      router.push("/logs");
      return;
    } else if (error) {
      setMagicLinkError(error === 'auth_failed' ? 'Magic link verification failed. Please try again.' : 'An authentication error occurred.');
    }
  }, [searchParams, session, isPending, router]);

  // Regular session redirect (only if not handling magic link)
  useEffect(() => {
    const success = searchParams.get('success');
    if (session && !isPending && success !== 'magic_link') {
      router.push("/logs");
    }
  }, [session, isPending, router, searchParams]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="w-full max-w-sm z-10 px-4 sm:px-0">
          <div className="flex flex-col items-center gap-6">
            <InboundIcon width={44} height={44} />
            <div className="flex items-center gap-2 text-foreground">
              <span className="text-xl">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show magic link error state
  if (magicLinkError) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="w-full max-w-sm z-10 px-4 sm:px-0">
          <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">Authentication Failed</h1>
                <p className="text-sm text-muted-foreground">
                  {magicLinkError}
                </p>
              </div>
              <Button 
                onClick={() => {
                  setMagicLinkError(null);
                  // Clear URL params
                  router.replace('/login');
                }} 
                className="w-full"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show magic link sent state (moved from LoginForm component)
  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="w-full max-w-sm z-10 px-4 sm:px-0">
          <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
            <div className="flex flex-col items-center gap-6 text-center">
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
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">check your email</h1>
                <p className="text-balance text-sm text-muted-foreground">
                  We've sent a magic link to <strong className="text-foreground">{magicLinkEmail}</strong>. Click the link
                  in your email to sign in.
                </p>
              </div>
              {process.env.NODE_ENV === "development" && (
                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                  <strong>Dev mode:</strong> Check your console for the magic link
                  URL
                </p>
              )}
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setMagicLinkSent(false);
                  setMagicLinkEmail("");
                }}
              >
                Try a different email
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If user is logged in, don't render the login form (will redirect)
  if (session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
      <BackgroundSvg />
      {/* Main content */}
      <div className="w-full max-w-sm z-10 px-4 sm:px-0">
        {/* Logo section */}
        <Link href="/">
          <div className="flex flex-col items-center gap-3 mb-8">
            <InboundIcon width={44} height={44} />

            <div className="flex flex-col items-center gap-2">
              <p className="text-3xl font-semibold text-foreground">Welcome Back!</p>
              <p className="text-sm text-muted-foreground">
                Enter your email below to login to your account.
              </p>
            </div>
          </div>
        </Link>
        {/* Login card */}
        <div>
          <div className="bg-card rounded-2xl shadow-sm p-6 border border-border z-10 relative">
            <LoginForm 
              onMagicLinkSent={(email: string) => {
                setMagicLinkSent(true);
                setMagicLinkEmail(email);
              }}
            />
          </div>
          <div className="flex flex-col items-center gap-2 -mt-4 p-4 pt-6 bg-muted/50 border border-border rounded-b-2xl shadow-[0_4px_10px_0.5px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.8)] dark:shadow-[0_4px_10px_0.5px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(255,255,255,0.1)]">
            <p className="text-xs text-muted-foreground">
              By clicking signing in , you agree to our{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="w-full max-w-sm z-10 px-4 sm:px-0">
          <div className="flex flex-col items-center gap-6">
            <InboundIcon width={44} height={44} />
            <div className="flex items-center gap-2 text-foreground">
              <span className="text-xl">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

const BackgroundSvg = () => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1920 1080"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0"
    >
      <rect
        width="100%"
        height="100%"
        fill="url(#dotPattern)"
        mask="url(#circleMask)"
      />
      <defs>
        <pattern
          id="dotPattern"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="7" cy="7" r="2" className="fill-foreground/10" />
        </pattern>
        <mask id="circleMask">
          <circle
            filter="blur(100px)"
            cx="960"
            cy="590"
            r="340"
            fill="url(#white-linear-gradient)"
          />
        </mask>
        <linearGradient id="white-linear-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="10%" stopColor="black" />
          <stop offset="100%" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  );
};
