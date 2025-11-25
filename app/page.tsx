import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/landing/hero";
import { getHomepageContent } from "./actions/homepage";
import { UseCases, Solution, Footer, DeveloperExperience, CTA } from "@/components/landing";
import { Separator } from "@/components/ui/separator";

export default async function HomePage() {
  const homepageResult = await getHomepageContent();

  const content =
    homepageResult.success && homepageResult.data
      ? homepageResult.data
      : {
        _title: "HomePage",
        heroPrimaryText: "The API for your email.",
        heroSublineText:
          "Recieve email to webhooks & send them via TypeScript, perfect for agents.",
        ctaButtonPrimaryText: "Get Started",
      };

  return (
    <div className="min-h-screen relative">
      <SiteHeader />
      <section className="max-w-7xl mx-auto gap-12 flex flex-col main-content">
        <Hero content={content} />
        <Solution />
        <DeveloperExperience />
        <UseCases />
        <CTA />
        <Separator />
        <Footer />
      </section>
    </div>
  );
}
