import { ArrowRight, Check, ChevronDown, ChevronRight, Code2, FileCode2, FileText, Folder, PanelLeft, Sparkles } from "lucide-react";

import { PreviewMotion } from "./PreviewMotion";

const code = [
  <span key="1" className="text-tan"># A little context goes a long way.</span>,
  <span key="2" />,
  <span key="3"><span className="text-tan">def</span> <span className="text-cream">average_score</span>(scores):</span>,
  <span key="4">    total = <span className="text-cream">sum</span>(scores)</span>,
  <span key="5">    <span className="text-tan">return</span> total / <span className="text-cream">len</span>(scores)</span>,
  <span key="6" />,
  <span key="7">scores = [<span className="text-tan">82, 91, 76</span>]</span>,
  <span key="8">average = average_score(scores)</span>,
  <span key="9"><span className="text-cream">print</span>(average)</span>,
];

export default function ProductPreview() {
  return (
    <figure aria-label="Illustrative Proactive AI workspace with Python code and a contextual suggestion" className="relative scroll-mt-28">
      <div className="overflow-hidden rounded-2xl border border-sand bg-card p-1.5 shadow-[0_32px_80px_-32px_rgba(43,33,24,0.3)] sm:rounded-[22px] sm:p-2">
        <div className="overflow-hidden rounded-xl border border-sand sm:rounded-2xl">
          <div className="flex h-12 items-center justify-between gap-3 border-b border-sand bg-cream px-4 sm:px-5">
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="hidden gap-1.5 sm:flex">{[0, 1, 2].map((dot) => <span key={dot} className="h-2 w-2 rounded-full bg-tan opacity-60" />)}</span>
              <span className="text-xs font-medium">student-manager <span className="ml-2 font-normal text-ink-soft">/ workspace</span></span>
            </div>
            <span className="hidden items-center gap-1.5 text-[10px] text-ink-soft sm:flex"><Check size={12} aria-hidden="true" /> Example project</span>
          </div>
          <div className="grid md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)_300px]">
            <aside aria-label="Example project files" className="hidden border-r border-sand bg-cream px-3 py-5 md:block">
              <div className="mb-7 flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-ink-soft">Explorer <PanelLeft size={13} aria-hidden="true" /></div>
              <div className="mb-3 flex items-center gap-1.5 px-1 text-xs"><ChevronDown size={12} aria-hidden="true" /><Folder size={14} aria-hidden="true" /> student-manager</div>
              <div className="flex items-center gap-2 rounded-md border border-sand bg-sand px-3 py-2.5 text-xs text-bronze-deep"><FileCode2 size={14} aria-hidden="true" /> main.py</div>
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-soft"><FileText size={14} aria-hidden="true" /> requirements.md</div>
              <div className="mt-24 border-t border-sand px-2 pt-4 text-[10px] leading-5 text-ink-soft">Your files.<br />A shared context.</div>
            </aside>
            <div className="min-w-0 bg-ink text-sand">
              <div className="flex h-12 items-center justify-between border-b border-[color-mix(in_srgb,var(--cream)_10%,transparent)] px-4"><span className="flex h-full items-center gap-2 border-b border-tan text-xs"><FileCode2 size={13} className="text-tan" aria-hidden="true" /> main.py</span><span className="text-[10px] text-tan">Python</span></div>
              <div className="flex items-center gap-2 px-5 pb-2 pt-4 text-[10px] text-tan">main.py <ChevronRight size={10} aria-hidden="true" /> average_score</div>
              <pre tabIndex={0} aria-label="Python example before the suggested guard is added" className="overflow-x-auto py-5 text-[11px] leading-7 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tan sm:text-xs" style={{ fontFamily: "var(--font-geist-mono), monospace" }}><code>{code.map((line, index) => <span key={index} className={`relative isolate block min-w-max border-l-2 pr-5 ${index === 4 ? "border-tan bg-[color-mix(in_srgb,var(--cream)_10%,transparent)]" : "border-transparent"}`}>{index === 4 && <PreviewMotion kind="line" className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_srgb,var(--cream)_12%,transparent)]" />}<span aria-hidden="true" className="mr-5 inline-block w-8 select-none text-right text-tan">{index + 1}</span>{line}{"\n"}</span>)}</code></pre>
              <div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--cream)_10%,transparent)] px-4 py-3 text-[10px] text-tan"><span className="flex items-center gap-1.5"><Code2 size={12} aria-hidden="true" /> Python</span><span>UTF-8 <span className="ml-3">Ln 5, Col 12</span></span></div>
            </div>
            <aside aria-label="Example contextual assistance" className="scroll-mt-28 border-t border-sand bg-card p-5 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0">
              <div className="mb-5 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={14} className="text-bronze" aria-hidden="true" /> AI assistance</p><span className="rounded-full border border-sand px-2 py-1 text-[9px] text-ink-soft"><PreviewMotion kind="status" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-bronze" />Example</span></div>
              <div className="flex items-center gap-2 rounded-lg border border-sand bg-cream px-3 py-2 text-[10px] text-ink-soft"><FileCode2 size={12} aria-hidden="true" /><span>Context: main.py · lines 3–5</span></div>
              <p className="mt-5 text-sm font-semibold">A small guard. A safer function.</p>
              <p className="mt-2 text-xs leading-6 text-ink-soft">An empty list would divide by zero. Check for missing scores before calculating the average.</p>
              <PreviewMotion kind="suggestion" className="mt-4 rounded-lg border border-sand bg-cream p-3"><p className="mb-2 text-[9px] font-medium uppercase tracking-widest text-bronze-deep">Suggested addition</p><pre className="text-xs leading-6 text-bronze-deep" style={{ fontFamily: "var(--font-geist-mono), monospace" }}><code>{"if not scores:\n    return None"}</code></pre></PreviewMotion>
              <p className="mt-4 flex items-center gap-2 text-[10px] leading-5 text-ink-soft"><Check size={12} className="shrink-0 text-bronze" aria-hidden="true" /> Review the suggestion before applying.</p>
            </aside>
          </div>
        </div>
      </div>
      <figcaption className="mt-6 flex scroll-mt-28 flex-col items-center justify-between gap-3 px-1 text-[10px] text-ink-soft sm:flex-row sm:text-xs"><span className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"><span>Bring your code</span><ArrowRight size={11} aria-hidden="true" /><span>Add context</span><ArrowRight size={11} aria-hidden="true" /><span>Ask. Review. Build.</span></span><span className="text-[10px]">Product preview · illustrative example</span></figcaption>
    </figure>
  );
}
