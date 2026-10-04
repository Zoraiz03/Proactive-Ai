"use client";

import { motion } from "motion/react";
import { FileCode2, Layers3, Sparkles } from "lucide-react";

const objects = [
  { label: "Project context", icon: Layers3, position: "-top-5 left-2 sm:-left-4", duration: 10, delay: 0, x: [0, 4, -2, 0], y: [0, -7, 3, 0], rotate: [0, -1, 0.6, 0] },
  { label: "Suggestion ready", icon: Sparkles, position: "-top-7 right-1 sm:-right-3", duration: 12, delay: 0.3, x: [0, -3, 4, 0], y: [0, 5, -8, 0], rotate: [0, 0.7, -0.5, 0] },
  { label: "Observer · example", icon: FileCode2, position: "bottom-24 -right-8 hidden xl:block", duration: 14, delay: 0.6, x: [0, 3, -4, 0], y: [0, -5, 4, 0], rotate: [0, -0.6, 0.4, 0] },
];

// Deterministic positions avoid hydration differences and keep the composition sparse.
const particles = [
  [3, 8, 3], [14, 1, 2], [28, 6, 3], [43, 0, 2], [66, 4, 3], [84, 2, 2],
  [98, 16, 4], [1, 48, 2], [99, 63, 3], [8, 87, 3], [73, 94, 2], [94, 88, 3],
];

// Move around an ellipse without flattening the planet artwork.
const orbitFrames = Array.from({ length: 65 }, (_, index) => index / 64 * Math.PI * 2);

function Planet({ variant }: { variant: number }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={variant === 0 ? "h-12 w-12" : "h-10 w-10"}>
      {variant === 0 && <ellipse cx="32" cy="33" rx="29" ry="9" transform="rotate(-22 32 33)" fill="var(--sand)" stroke="var(--bronze)" strokeWidth="2" />}
      <circle cx="32" cy="30" r="19" fill={variant === 2 ? "var(--cream-deep)" : "var(--tan)"} stroke="var(--bronze-deep)" strokeWidth="1.5" />
      <path d="M20 23c2-5 6-8 12-8" stroke="var(--cream)" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      {variant === 1 && <path d="M15 29c9 4 24 4 34-1M18 37c9 3 20 3 28-1" stroke="var(--bronze)" strokeWidth="3" opacity="0.35" />}
      {variant === 2 && <><circle cx="22" cy="28" r="4" fill="var(--sand)" /><circle cx="39" cy="19" r="3" fill="var(--tan)" /><circle cx="40" cy="40" r="4" fill="var(--sand)" /></>}
      <circle cx="27" cy="30" r="1.5" fill="var(--ink)" />
      <circle cx="36" cy="30" r="1.5" fill="var(--ink)" />
      <path d="M29 35q3 3 6 0" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
      {variant === 0 && <path d="M6 38c-2 7 12 7 29 0s27-16 22-20" stroke="var(--bronze)" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

export default function FloatingElements({ active, layer }: { active: boolean; layer: "background" | "foreground" }) {
  return (
    <>
      {layer === "background" && <div aria-hidden="true" className="pointer-events-none absolute -inset-x-5 -inset-y-10 z-0 overflow-hidden sm:-inset-x-12">
        {particles.map(([left, top, size], index) => (
          <motion.span key={index} className="absolute rounded-full bg-bronze" style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
            initial={false} animate={active ? { y: [0, -4 - index % 4, 0], x: [0, index % 2 ? 3 : -3, 0], opacity: [0.12, 0.3, 0.12] } : { x: 0, y: 0, opacity: 0.16 }}
            transition={{ duration: active ? 11 + index * 0.7 : 0, delay: active ? index * 0.17 : 0, repeat: active ? Infinity : 0, ease: "easeInOut" }} />
        ))}
        {[0, 1].map((ring) => (
          <div key={ring} className={`absolute inset-x-3 top-1/2 hidden -translate-y-1/2 sm:block ${ring ? "rotate-[12deg]" : "-rotate-[9deg]"}`}>
            <div className={`relative ${ring ? "mx-8 aspect-[2.7/1]" : "aspect-[2/1]"}`}>
              <div className="absolute inset-0 rounded-[50%] border border-sand opacity-60" />
              {(ring ? [2] : [0, 1]).map((variant, index) => {
                const phase = ring ? Math.PI / 3 : index * Math.PI;
                const direction = ring ? -1 : 1;
                const x = orbitFrames.map(angle => `${Math.cos(angle * direction + phase) * 50}%`);
                const y = orbitFrames.map(angle => `${Math.sin(angle * direction + phase) * 50}%`);
                return (
                  <motion.div key={variant} className="absolute inset-0" initial={false}
                    animate={{ x: active ? x : x[0], y: active ? y : y[0] }}
                    transition={{ duration: active ? (ring ? 65 : 52) : 0, repeat: active ? Infinity : 0, ease: "linear" }}>
                    <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${ring ? "-rotate-[12deg]" : "rotate-[9deg]"}`}>
                      <Planet variant={variant} />
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>}
      {layer === "foreground" && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
        {objects.map(({ label, icon: Icon, position, duration, delay, x, y, rotate }) => (
          <motion.div key={label} className={`absolute ${position}`} initial={false}
            animate={active ? { x, y, rotate } : { x: 0, y: 0, rotate: 0 }}
            transition={{ duration: active ? duration : 0, delay: active ? delay : 0, repeat: active ? Infinity : 0, ease: "easeInOut" }}>
            <span className="flex items-center gap-2 rounded-full border border-sand bg-card px-3 py-2 text-[10px] font-medium text-bronze-deep shadow-[0_8px_24px_-12px_rgba(43,33,24,0.3)] sm:px-4 sm:py-3 sm:text-xs">
              <Icon size={14} strokeWidth={1.5} />{label}
            </span>
          </motion.div>
        ))}
        <motion.div className="absolute -left-10 bottom-28 hidden rounded-xl border border-sand bg-card p-4 text-xs text-bronze-deep shadow-[0_12px_32px_-16px_rgba(43,33,24,0.3)] xl:block"
          initial={false} animate={active ? { y: [0, -6, 2, 0], x: [0, -2, 3, 0], rotate: [-2, -1, -2.5, -2] } : { y: 0, x: 0, rotate: -2 }}
          transition={{ duration: active ? 16 : 0, delay: active ? 0.4 : 0, repeat: active ? Infinity : 0, ease: "easeInOut" }}>
          <p className="mb-2 text-[9px] uppercase tracking-widest text-ink-soft">A little context</p>
          <code style={{ fontFamily: "var(--font-geist-mono), monospace" }}>if not scores:<br />&nbsp;&nbsp;return None</code>
        </motion.div>
      </div>}
    </>
  );
}
