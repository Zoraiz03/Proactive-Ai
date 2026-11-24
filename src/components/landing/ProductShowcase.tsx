import ProductPreview from "./ProductPreview";
import Reveal from "./Reveal";

export default function ProductShowcase() {
  return (
    <section id="product" aria-labelledby="product-heading" className="scroll-mt-24 border-y border-sand bg-cream-deep px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-bronze-deep">Inside the workspace</p>
            <h2 id="product-heading" className="mt-5 max-w-2xl font-serif-display text-4xl leading-[1.12] sm:text-5xl lg:text-6xl">The work. The question.<br /><span className="italic text-bronze-deep">In the same place.</span></h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-md text-base leading-7 text-ink-soft lg:ml-auto">Keep your file open, select what matters, and ask Observer for a fresh perspective. Read the explanation alongside your code before deciding what comes next.</p>
          </Reveal>
        </div>
        <Reveal preview delay={0.16}><ProductPreview /></Reveal>
      </div>
    </section>
  );
}
