import { FileCode2, MessageSquare, ArrowRight } from "lucide-react";
import Reveal from "./Reveal";

export default function ProblemSection() {
  return (
    <section aria-labelledby="why-heading" className="border-t border-sand px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-20">
        <div>
          <Reveal><p className="text-xs font-medium uppercase tracking-[0.18em] text-bronze-deep">Why Proactive AI</p></Reveal>
          <Reveal delay={0.08}>
            <h2 id="why-heading" className="mt-5 font-serif-display text-4xl leading-[1.12] sm:text-5xl lg:text-6xl">Your code has context.<br /><span className="italic text-bronze-deep">Your tools should too.</span></h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-lg text-base leading-7 text-ink-soft">A question rarely starts from a blank page. It starts with a function, a document, or an idea already taking shape. Keep that work beside the assistance you ask for.</p>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <div className="rounded-2xl border border-sand bg-cream-deep p-6 sm:p-8">
            <p className="mb-6 text-xs text-ink-soft">Less starting over. More building on what’s there.</p>
            <div className="rounded-xl border border-sand bg-card p-5">
              <div className="flex items-center gap-2 text-xs font-medium"><FileCode2 size={16} className="text-bronze" aria-hidden="true" /> main.py <span className="ml-auto text-ink-soft">Selected code</span></div>
              <div className="mt-4 border-l-2 border-bronze bg-cream p-3 font-mono text-[10px] leading-6 [overflow-wrap:anywhere] sm:text-xs text-ink-soft">def average_score(scores):<br />&nbsp;&nbsp;return sum(scores) / len(scores)</div>
            </div>
            <div aria-hidden="true" className="ml-7 h-6 w-px bg-tan" />
            <div className="flex items-start gap-3 rounded-xl border border-sand bg-card p-5">
              <MessageSquare size={17} className="mt-0.5 shrink-0 text-bronze" aria-hidden="true" />
              <div><p className="text-sm font-medium">A better place to ask.</p><p className="mt-1 text-xs leading-5 text-ink-soft">Start with the code you’re working on.</p></div>
              <ArrowRight size={16} className="ml-auto mt-1 shrink-0 text-bronze" aria-hidden="true" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
