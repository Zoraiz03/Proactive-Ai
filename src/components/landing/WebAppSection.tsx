import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileCode2, FileText, Globe, PanelLeft } from "lucide-react";
import Reveal from "./Reveal";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze";

export default function WebAppSection() {
  return (
    <section aria-labelledby="web-heading" className="px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-bronze-deep">The web experience</p>
          <h2 id="web-heading" className="mt-5 font-serif-display text-4xl leading-[1.12] sm:text-5xl">Your workspace.<br /><span className="italic text-bronze-deep">Just a tab away.</span></h2>
          <p className="mt-6 max-w-md text-base leading-7 text-ink-soft">An intelligent coding workspace, available in your browser. Open a file, develop an idea, and ask for help without leaving your work.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/workspace" className={`group inline-flex items-center justify-center gap-3 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-cream transition-transform motion-safe:hover:scale-[1.02] ${focus}`}>Open workspace <ArrowUpRight size={16} className="transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden="true" /></Link>
            <Link href="/signup" className={`group inline-flex items-center justify-center gap-3 rounded-full border border-sand px-6 py-3.5 text-sm font-medium transition-transform motion-safe:hover:scale-[1.02] ${focus}`}>Get started <ArrowRight size={16} className="transition-transform motion-safe:group-hover:translate-x-1" aria-hidden="true" /></Link>
          </div>
          <p className="mt-5 text-xs leading-5 text-ink-soft">Explore the workspace. Sign in when you’re ready to ask Observer.</p>
        </Reveal>
        <Reveal preview delay={0.12}>
          <figure aria-label="Illustrative browser workspace with code and document files" className="min-w-0 rounded-2xl border border-sand bg-cream-deep p-4 sm:p-6">
            <div className="overflow-hidden rounded-xl border border-sand bg-card shadow-[0_16px_40px_-24px_rgba(43,33,24,0.25)]">
              <div className="flex items-center gap-3 border-b border-sand bg-cream px-4 py-3"><Globe size={14} className="shrink-0 text-bronze" aria-hidden="true" /><span className="min-w-0 flex-1 rounded-md border border-sand bg-card px-3 py-1.5 text-xs text-ink-soft">Proactive AI / workspace</span></div>
              <div className="flex items-center gap-2 border-b border-sand px-4 py-3 text-xs"><PanelLeft size={14} className="text-bronze" aria-hidden="true" /><span>My workspace</span></div>
              <div className="p-5 sm:p-7">
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink-soft">A place to begin</p>
                <p className="mt-3 font-serif-display text-2xl">What are you building?</p>
                <div className="mt-6 flex items-center gap-3 rounded-lg border border-sand bg-cream p-3"><FileCode2 size={18} className="shrink-0 text-bronze" aria-hidden="true" /><div><p className="text-xs font-medium">main.py</p><p className="mt-1 text-[10px] text-ink-soft">Code, one idea at a time</p></div></div>
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-sand p-3"><FileText size={18} className="shrink-0 text-bronze" aria-hidden="true" /><div><p className="text-xs font-medium">notes.md</p><p className="mt-1 text-[10px] text-ink-soft">Space to think it through</p></div></div>
              </div>
            </div>
            <figcaption className="mt-4 text-center text-[10px] text-ink-soft">Web workspace · illustrative preview</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
