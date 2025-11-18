import { LandingHeader } from "@/components/landing_new/landing-header";
import { HeroNew } from "@/components/landing_new/hero-new";
import { TrustedBy } from "@/components/landing_new/trusted-by";
import { FeaturesGrid } from "@/components/landing_new/features-grid";
import { HowItWorks } from "@/components/landing_new/how-it-works";
import { CTANew } from "@/components/landing_new/cta";
import { Footer } from "@/components/landing/footer";

export default function LandingNewPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroNew />
        <TrustedBy />
        <FeaturesGrid />
        <HowItWorks />
        <CTANew />
      </main>
      <Footer />
    </div>
  );
}
