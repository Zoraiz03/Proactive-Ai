"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion, useSpring } from "motion/react";
import { Pause, Play } from "lucide-react";
import FloatingElements from "./FloatingElements";
import { PreviewMotionContext } from "./PreviewMotion";

export default function HeroVisual({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.12 });
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [entered, setEntered] = useState(false);
  const active = visible && entered && !paused && reduced === false;
  const x = useSpring(0, { stiffness: 65, damping: 25 });
  const y = useSpring(0, { stiffness: 65, damping: 25 });

  return (
    <div ref={ref} className="relative isolate pt-6"
      onPointerMove={(event) => {
        if (!active || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 6);
        y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 4);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {(["background", "foreground"] as const).map((layer) => <motion.div key={layer} className={`pointer-events-none absolute inset-0 motion-reduce:!transform-none ${layer === "foreground" ? "z-20" : "z-0"}`} style={{ x: active ? x : 0, y: active ? y : 0 }}>
        <motion.div className="absolute inset-0 motion-reduce:!opacity-100" initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 1.05 }}
          onAnimationComplete={() => setEntered(true)}>
          <FloatingElements active={active} layer={layer} />
        </motion.div>
      </motion.div>)}
      <div className="relative z-10">
        <PreviewMotionContext.Provider value={active}>{children}</PreviewMotionContext.Provider>
      </div>
      <div className="relative z-30 mt-5 flex justify-end">
        <button type="button" aria-pressed={paused} disabled={Boolean(reduced)}
          onClick={() => { x.jump(0); y.jump(0); setPaused(!paused); }}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sand bg-cream px-3 text-[11px] text-ink-soft hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze disabled:cursor-default">
          {paused || reduced ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          {reduced ? "Reduced motion enabled" : paused ? "Resume visual motion" : "Pause visual motion"}
        </button>
      </div>
    </div>
  );
}
