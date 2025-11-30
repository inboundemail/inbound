"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";

export function CTANew() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5" />
      
      <div className="container px-4 md:px-6 mx-auto relative z-10">
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-8">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Ready to build with Inbound?
          </h2>
          <p className="text-xl text-muted-foreground">
            Get your API key in seconds. No credit card required for development.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button size="lg" asChild>
              <Link href="/login">
                Get Started Now
                <ArrowBoldRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/contact">
                Contact Sales
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

