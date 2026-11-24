"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

const navigation = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
];
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze";

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { scrollY } = useScroll();
  const reducedMotion = useReducedMotion();
  useMotionValueEvent(scrollY, "change", (position) => setScrolled(position > 16));

  useEffect(() => {
    setScrolled(window.scrollY > 16);
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <motion.header
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      initial={false}
      animate={{ backgroundColor: scrolled || open ? "var(--cream)" : "rgba(250, 247, 240, 0)", borderColor: scrolled || open ? "var(--sand)" : "rgba(232, 223, 208, 0)" }}
      transition={{ duration: reducedMotion ? 0 : 0.25 }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { setOpen(false); buttonRef.current?.focus(); }
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    >
      <a href="#main-content" className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 ${focus}`}>Skip to content</a>
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-8 px-5 sm:px-8 lg:px-12">
        <div className="[&_a]:rounded-sm [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4 [&_a]:focus-visible:outline-bronze"><Logo /></div>
        <nav aria-label="Main navigation" className="hidden items-center gap-8 lg:flex">
          {navigation.map(({ label, href }) => <Link key={href} href={href} className={`rounded-sm text-sm text-ink-soft transition-colors hover:text-bronze ${focus}`}>{label}</Link>)}
        </nav>
        <div className="hidden items-center gap-6 lg:flex">
          <Link href="/login" className={`rounded-sm text-sm text-ink-soft hover:text-ink ${focus}`}>Sign in</Link>
          <Link href="/signup" className={`group flex items-center gap-3 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-transform motion-safe:hover:scale-[1.02] ${focus}`}>
            Get started <ArrowUpRight aria-hidden="true" size={15} className="transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
          </Link>
        </div>
        <button ref={buttonRef} type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls={open ? "mobile-navigation" : undefined} onClick={() => setOpen(!open)} className={`flex h-11 w-11 items-center justify-center rounded-full border border-sand lg:hidden ${focus}`}>
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.nav id="mobile-navigation" aria-label="Mobile navigation" className="overflow-hidden bg-cream lg:hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>
          <div className="space-y-1 border-t border-sand px-5 pb-6 pt-3">
            {navigation.map(({ label, href }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-3 text-ink-soft hover:bg-cream-deep ${focus}`}>{label}</Link>)}
            <div className="grid grid-cols-2 gap-3 pt-3">
              <Link href="/login" onClick={() => setOpen(false)} className={`rounded-full border border-sand px-4 py-3 text-center text-sm ${focus}`}>Sign in</Link>
              <Link href="/signup" onClick={() => setOpen(false)} className={`rounded-full bg-ink px-4 py-3 text-center text-sm text-cream ${focus}`}>Get started</Link>
            </div>
          </div>
        </motion.nav>}
      </AnimatePresence>
    </motion.header>
  );
}
