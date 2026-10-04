import Reveal from "./Reveal";

const steps = [
  { title: "Bring your work", description: "Open a file and write code or a document in the workspace." },
  { title: "Set the focus", description: "Select the part you want help with, or use the current file." },
  { title: "Ask Observer", description: "Sign in, choose an available model, and request assistance." },
  { title: "Review. Keep building.", description: "Read the suggestion, decide what’s useful, and make your next move." },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="workflow-heading" className="scroll-mt-24 border-y border-sand bg-card px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-bronze-deep">How it works</p>
          <h2 id="workflow-heading" className="mt-5 font-serif-display text-4xl leading-[1.12] sm:text-5xl">From a question<br className="sm:hidden" /> to your next step.</h2>
        </Reveal>
        <ol className="relative mt-12 grid gap-0 before:pointer-events-none before:absolute before:bottom-10 before:left-5 before:top-5 before:w-px before:bg-sand md:grid-cols-4 md:gap-8 md:before:bottom-auto md:before:right-5 md:before:h-px md:before:w-auto">
          {steps.map(({ title, description }, index) => (
            <li key={title} className="relative min-w-0">
              <Reveal delay={index * 0.1} className="grid grid-cols-[40px_minmax(0,1fr)] gap-5 md:block">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-card font-mono text-xs text-bronze-deep">0{index + 1}</span>
                <div className="pb-8 md:pb-0 md:pt-7">
                  <h3 className="text-base font-medium">{title}</h3>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-ink-soft">{description}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
