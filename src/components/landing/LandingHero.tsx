import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import ProductPreview from "./ProductPreview";
import Reveal from "./Reveal";
import HeroVisual from "./HeroVisual";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze";

export default function LandingHero() {
  return (
    <section aria-labelledby="hero-heading" className="overflow-hidden px-5 pb-12 pt-14 sm:px-8 sm:pt-20 lg:px-12 lg:pb-20 lg:pt-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal><p className="inline-flex items-center gap-2.5 rounded-full border border-sand bg-card px-4 py-2 text-xs font-medium tracking-wide text-bronze-deep"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-bronze" /> AI coding, made proactive.</p></Reveal>
          <h1 id="hero-heading" className="mt-7 font-serif-display text-[clamp(2.65rem,7.5vw,6.5rem)] leading-[1.04] tracking-[-0.055em]">
            <Reveal as="span" className="block" delay={0.08}>Code with context.</Reveal>
            <Reveal as="span" className="block" delay={0.16}><span className="italic text-bronze-deep">Build proactively.</span></Reveal>
          </h1>
          <Reveal delay={0.24}><p className="mx-auto mt-7 max-w-xl text-base leading-7 text-ink-soft sm:text-lg sm:leading-8">Bring your code, context, and ideas into one intelligent workspace. Get focused assistance, right where you build.</p></Reveal>
          <Reveal delay={0.32}>
            <div className="mx-auto mt-8 flex max-w-sm flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
              <Link href="/signup" className={`group inline-flex items-center justify-center gap-8 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-cream shadow-sm transition-transform motion-safe:hover:scale-[1.025] ${focus}`}>Get started <ArrowUpRight size={17} aria-hidden="true" className="transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" /></Link>
              <Link href="/workspace" className={`group inline-flex items-center justify-center gap-5 rounded-full border border-sand bg-card px-7 py-3.5 text-sm font-medium transition-transform motion-safe:hover:scale-[1.025] ${focus}`}>Open workspace <ArrowRight size={17} aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-1" /></Link>
            </div>
            <Link href="#product" className={`mt-5 hidden items-center gap-2 rounded-sm text-xs text-ink-soft hover:text-bronze md:inline-flex ${focus}`}>A closer look at the workspace <ArrowDown size={12} aria-hidden="true" /></Link>
          </Reveal>
        </div>
        <div className="relative mx-auto mt-14 max-w-6xl sm:mt-16">
          <div aria-hidden="true" className="pointer-events-none absolute -inset-x-12 -bottom-12 top-16 rounded-[50%] bg-[radial-gradient(ellipse_at_center,var(--sand),transparent_70%)] opacity-70" />
          <HeroVisual><Reveal delay={0.42} preview><ProductPreview /></Reveal></HeroVisual>
        </div>
      </div>
    </section>
  );
}
