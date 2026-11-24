import { TextCursorInput, Files, FileText, HardDrive, MousePointer2, type LucideIcon } from "lucide-react";
import Reveal from "./Reveal";

const features: { icon: LucideIcon; title: string; description: string; detail: string }[] = [
  { icon: Files, title: "A place for your files", description: "Create, rename, and move between files from the workspace sidebar.", detail: "Keep your work together" },
  { icon: FileText, title: "Code meets documents", description: "Work in a code editor or write in a rich-text document, depending on the file you open.", detail: "Room for the thinking, too" },
  { icon: HardDrive, title: "Pick up where you left off", description: "Workspace files save locally in this browser as you type. Return using the same browser to continue.", detail: "Local browser storage" },
  { icon: MousePointer2, title: "The next move is yours", description: "Read each suggestion and its explanation. Use what helps, or dismiss it and keep working.", detail: "Assistance you choose" },
];

export default function FeatureGrid() {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-bronze-deep">Built around your work</p>
          <h2 id="features-heading" className="mt-5 max-w-2xl font-serif-display text-4xl leading-[1.12] sm:text-5xl">A little less friction.<br /><span className="italic text-bronze-deep">A little more flow.</span></h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <Reveal interactive className="group rounded-2xl border border-sand bg-cream-deep p-6 transition-colors duration-300 hover:border-bronze sm:col-span-2 sm:p-8">
            <TextCursorInput size={24} strokeWidth={1.5} className="text-bronze transition-transform motion-safe:group-hover:-rotate-6" aria-hidden="true" />
            <h3 className="mt-6 text-xl font-medium">Start with the code in front of you.</h3>
            <p className="mt-3 max-w-lg text-sm leading-6 text-ink-soft">Select a passage for focused feedback, or ask about the current file. Your request starts from the work already in your editor.</p>
            <div className="mt-7 flex flex-col gap-3 rounded-xl border border-sand bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <code className="text-xs text-bronze-deep">average_score(scores)</code>
              <span className="w-fit rounded-full border border-sand px-3 py-1.5 text-[11px] text-ink-soft">Selection → Ask Observer</span>
            </div>
          </Reveal>
          {features.map(({ icon: Icon, title, description, detail }, index) => (
            <Reveal key={title} interactive delay={index * 0.06} className="group flex h-full flex-col rounded-2xl border border-sand bg-card p-6 transition-colors duration-300 hover:border-bronze sm:p-8">
              <Icon size={24} strokeWidth={1.5} className="text-bronze transition-transform motion-safe:group-hover:-rotate-6" aria-hidden="true" />
              <h3 className="mt-6 text-lg font-medium">{title}</h3>
              <p className="mb-7 mt-3 text-sm leading-6 text-ink-soft">{description}</p>
              <p className="mt-auto border-t border-sand pt-4 text-[11px] text-bronze-deep">{detail}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
