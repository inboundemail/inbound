"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import InboundIcon from "@/components/icons/inbound";
import { useSession } from "@/lib/auth/auth-client";

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If user is already logged in, redirect to main app (layout will handle onboarding check)
    if (session && !isPending) {
      router.push("/logs");
    }
  }, [session, isPending, router]);

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="w-full max-w-sm z-10 px-4 sm:px-0">
          <div className="flex flex-col items-center gap-6">
            <InboundIcon  width={44} height={44} />
            <div className="flex items-center gap-2 text-foreground">
              <span className="text-xl">Loading...</span>
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
            <InboundIcon  width={44} height={44} />

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
            <LoginForm />
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
