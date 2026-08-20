import Link from "next/link";
import Logo from "@/components/Logo";

function WorkspacePreview() {
  return (
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-sand bg-card shadow-[0_24px_60px_-20px_rgba(43,33,24,0.25)]">
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-sand bg-cream px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5654f]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e8b84f]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#7bb662]" />
          </span>
          <span className="font-mono text-xs text-ink-soft">fibonacci.py</span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-sand bg-card px-2.5 py-0.5 font-mono text-[10px] text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          Observing
        </span>
      </div>

      <div className="flex">
        {/* code pane */}
        <pre className="flex-1 overflow-hidden p-4 font-mono text-[12.5px] leading-6 text-ink">
          <code>
            <span className="text-tan">1  </span>
            <span className="text-ember">def</span>{" "}
            <span className="text-bronze">fibonacci</span>(n):{"\n"}
            <span className="text-tan">2  </span>{"    "}
            <span className="text-ember">if</span> n {"<"}= 1:{"\n"}
            <span className="text-tan">3  </span>{"        "}
            <span className="text-ember">return</span> n{"\n"}
            <span className="text-tan">4  </span>{"    "}
            <span className="text-ember">return</span>{" "}
            <span className="text-bronze">fibonacci</span>(n-1) +{" "}
            <span className="text-bronze">fibonacci</span>(n-2){"\n"}
            <span className="text-tan">5  </span>{"\n"}
            <span className="text-tan">6  </span>
            <span className="text-tan"># This is recursive but slow…</span>
          </code>
        </pre>

        {/* observer pane */}
        <div className="w-44 shrink-0 space-y-3 border-l border-sand bg-cream p-3">
          <p className="flex items-center justify-between text-[10px] font-semibold">
            <span>◉ Observer</span>
            <span className="font-mono font-normal text-tan">watching…</span>
          </p>
          <div className="rounded-md border border-dashed border-tan bg-card p-2 text-[10px] leading-relaxed text-ink-soft">
            Suggestions appear after a 5-second typing pause.
          </div>
          <div className="rounded-md border border-sand bg-card p-2 text-[10px] text-ink-soft">
            🌐 Web context: “Dynamic Programming — Wikipedia”
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-sand bg-card/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-ink-soft md:flex">
            <a href="#product" className="hover:text-ink">Product</a>
            <Link href="/workspace" className="hover:text-ink">Workspace</Link>
            <span className="cursor-not-allowed text-tan" title="Coming in Phase 4">History</span>
            <span className="cursor-not-allowed text-tan" title="Coming in Phase 6">Admin</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-sand bg-card px-4 py-1.5 text-sm text-ink-soft hover:border-bronze hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/workspace"
            className="rounded-lg bg-bronze-deep px-4 py-1.5 text-sm font-medium text-cream hover:bg-bronze"
          >
            ✳ Open workspace
          </Link>
        </div>
      </header>

      <main id="product" className="hero-grid">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-14 px-6 py-20 lg:flex-row lg:gap-10">
          <div className="max-w-xl">
            <h1 className="font-serif-display text-5xl leading-[1.08] md:text-6xl">
              The AI that <span className="italic text-ember">Watches.</span>
              <br />
              Not the one you ask.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-soft">
              Proactive AI Workspace inverts the request-response loop. A
              combination of editing signals detects when you are stuck in{" "}
              <strong className="text-ink">code</strong>, while pauses trigger
              help in <strong className="text-ink">documents</strong>. Free and
              paid models stay one dropdown away — so it never burns your budget.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/workspace"
                className="rounded-lg bg-bronze-deep px-5 py-2.5 text-sm font-medium text-cream shadow hover:bg-bronze"
              >
                ✳ Open the workspace
              </Link>
              <Link
                href="/signup"
                className="rounded-lg border border-sand bg-card px-5 py-2.5 text-sm text-ink-soft hover:border-bronze hover:text-ink"
              >
                Create account ›
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 font-mono text-xs text-ink-soft">
              <span>⚡ Streaming responses</span>
              <span>◎ Usage governance</span>
              <span>🌐 Live web context</span>
            </div>
          </div>

          <WorkspacePreview />
        </div>
      </main>

      <footer className="border-t border-sand bg-card px-6 py-4 text-center font-mono text-xs text-tan">
        Proactive AI Workspace — COMSATS University Islamabad, Abbottabad
        Campus · FYP 2023–2027
      </footer>
    </div>
  );
}
