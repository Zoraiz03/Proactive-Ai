"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
  preview?: boolean;
  as?: "div" | "span";
  interactive?: boolean;
};

export default function Reveal({ children, className, delay = 0, once = true, preview = false, as = "div", interactive = false }: RevealProps) {
  const reducedMotion = useReducedMotion();
  const Component = as === "span" ? motion.span : motion.div;
  return (
    <Component
      className={`motion-reduce:!transform-none motion-reduce:!opacity-100 ${className ?? ""}`}
      initial={reducedMotion ? false : { opacity: 0, y: preview ? 24 : 12, scale: preview ? 0.97 : 1 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once, amount: 0.12 }}
      transition={{ duration: reducedMotion ? 0 : 0.65, delay: reducedMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={interactive && !reducedMotion ? { y: -4, scale: 1.01, transition: { duration: 0.4 } } : undefined}
    >
      {children}
    </Component>
  );
}
