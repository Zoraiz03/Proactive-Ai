"use client";

import { createContext, useContext, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Only the hero opts into continuous motion; other previews remain static.
export const PreviewMotionContext = createContext(false);

export function PreviewMotion({ children, className, kind }: {
  children?: ReactNode;
  className?: string;
  kind: "line" | "status" | "suggestion";
}) {
  const enabled = useContext(PreviewMotionContext);
  const reduced = useReducedMotion();
  const active = enabled && reduced === false;

  if (kind === "suggestion") {
    return <motion.div className={className} initial={false}
      animate={active ? { y: [3, 0, 0], opacity: [0.7, 1, 1] } : { y: 0, opacity: 1 }}
      transition={{ duration: active ? 0.7 : 0, ease: "easeOut" }}>
      {children}
    </motion.div>;
  }

  return <motion.span aria-hidden="true" className={className} initial={false}
    animate={active ? { opacity: kind === "line" ? [0.3, 0.85, 0.3] : [0.45, 1, 0.45], scale: kind === "status" ? [1, 1.18, 1] : 1 } : { opacity: kind === "line" ? 0.45 : 1, scale: 1 }}
    transition={{ duration: active ? (kind === "line" ? 6 : 4.5) : 0, repeat: active ? Infinity : 0, ease: "easeInOut" }} />;
}
