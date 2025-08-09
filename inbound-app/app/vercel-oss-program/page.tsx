"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/lib/auth/auth-client";
import { toast } from "sonner";
import { submitVercelOssApplication } from "./actions";

// Component that uses useSearchParams - needs to be wrapped in Suspense
function VercelOssProgramContent() {
  const { data: session, isPending } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Handle success/error from URL params
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success) {
      toast.success("Application submitted successfully! We'll review your request and get back to you soon.");
      setIsSubmitted(true);
      // Clean up URL
      router.replace('/vercel-oss-program');
    }
    
    if (error) {
      toast.error("Failed to submit application. Please try again.");
      setIsSubmitting(false);
    }
  }, [searchParams, router]);

  const handleSubmit = async () => {
    if (!session?.user) {
      toast.error("Please log in to submit your application");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      const result = await submitVercelOssApplication(formData);
      if (result.success) {
        setIsSubmitted(true);
      } else {
        toast.error("Failed to submit application. Please try again.");
      }
    } catch (error) {
      toast.error("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header - matching app/page.tsx */}
        <header className="flex items-center justify-between py-3 sm:py-4 lg:py-6 w-full">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <Image
              src="https://inbound.new/inbound-logo-3.png"
              alt="Inbound Logo"
              width={24}
              height={24}
              className="rounded-lg shadow-sm sm:w-7 sm:h-7 lg:w-8 lg:h-8"
            />
            <span className="font-semibold text-xl sm:text-2xl lg:text-3xl text-foreground">inbound</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Desktop navigation */}
            <div className="hidden md:flex items-center gap-4 text-sm lg:text-base text-muted-foreground">
              <a href="/docs" className="hover:text-foreground transition-colors">docs</a>
              <a href="/#pricing" className="hover:text-foreground transition-colors">pricing</a>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">help</a>
            </div>
            {session?.user ? (
              <Button size="default" className="text-sm sm:text-base" asChild>
                <Link href="/logs">
                  <span className="hidden sm:inline">hey {session.user.name?.toLowerCase()} 👋</span>
                  <span className="sm:hidden">dashboard</span>
                </Link>
              </Button>
            ) : (
              <Button size="default" className="text-sm sm:text-base" asChild>
                <Link href="/login">
                  get started
                </Link>
              </Button>
            )}
          </div>
        </header>

        {/* Page Title Section */}
        <div className="mb-8 pt-4">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Exclusive Offer
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Vercel OSS Program
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Exclusive offer for Vercel Open Source Program participants
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8 pb-16">
          {/* Main Offer Card */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <CardContent className="p-8 lg:p-12">
              <div className="text-center space-y-6">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
                  Get 1 Free Year of Inbound Scale
                </h2>

                <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                  As a participant in the Vercel Open Source Program, you're eligible for a complimentary 
                  year of Inbound Scale - our premium email management solution designed for developers and teams.
                </p>

                <div className="pt-4">
                  {isSubmitted ? (
                    <div className="space-y-4">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-medium">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Application Submitted
                      </div>
                      <p className="text-muted-foreground">
                        Thank you for your application! We'll review it and get back to you soon.
                      </p>
                    </div>
                  ) : session?.user ? (
                    <Button 
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      size="lg"
                      className="px-8 py-4 text-lg font-medium min-w-[200px]"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Application"}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-muted-foreground">
                        Please log in to submit your application
                      </p>
                      <Button 
                        size="lg"
                        className="px-8 py-4 text-lg font-medium min-w-[200px]"
                        asChild
                      >
                        <Link href="/login">
                          Log In to Apply
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* What's Included Card */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">What's Included in Inbound Scale</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Everything you need for enterprise-grade email management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 text-green-500 flex-shrink-0 mt-1">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 text-lg">Unlimited Domains & Addresses</h4>
                    <p className="text-muted-foreground leading-relaxed">Connect unlimited custom domains and create unlimited email addresses</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 text-green-500 flex-shrink-0 mt-1">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 text-lg">Advanced Webhooks</h4>
                    <p className="text-muted-foreground leading-relaxed">Real-time email notifications with retry logic and custom headers</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 text-green-500 flex-shrink-0 mt-1">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 text-lg">Priority Support</h4>
                    <p className="text-muted-foreground leading-relaxed">Get fast, dedicated support from our engineering team</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 text-green-500 flex-shrink-0 mt-1">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2 text-lg">Enhanced API Access</h4>
                    <p className="text-muted-foreground leading-relaxed">Higher rate limits and advanced API features for integration</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Program Information Card */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-foreground">About This Offer</CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Supporting the open source community
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <p className="text-muted-foreground leading-relaxed text-lg">
                  This exclusive offer is available to verified participants of the Vercel Open Source Program. 
                  We believe in supporting developers who contribute to the open source ecosystem, and we're 
                  excited to provide you with the tools to build amazing email experiences.
                </p>
                
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
                    Valid for 1 year
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
                    Full Scale features
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
                    No setup fees
                  </Badge>
                </div>
                
                <p className="text-muted-foreground">
                  Learn more about the{" "}
                  <a 
                    href="https://oss-starter-pack.vercel.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors font-medium text-primary"
                  >
                    Vercel Open Source Program
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Main page component with Suspense wrapper
export default function VercelOssProgramPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    }>
      <VercelOssProgramContent />
    </Suspense>
  );
}