import LandingHeader from "@/components/landing/LandingHeader";
import LandingHero from "@/components/landing/LandingHero";

import ProblemSection from "@/components/landing/ProblemSection";
import ProductShowcase from "@/components/landing/ProductShowcase";
import FeatureGrid from "@/components/landing/FeatureGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import WebAppSection from "@/components/landing/WebAppSection";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream text-ink selection:bg-sand">
      <LandingHeader />
      <main id="main-content">
        <LandingHero />
        <ProblemSection />
        <ProductShowcase />
        <FeatureGrid />
        <HowItWorks />
        <WebAppSection />
      </main>
    </div>
  );
}
