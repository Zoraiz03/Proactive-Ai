"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import AuthShowcase from "@/components/AuthShowcase";
import AuthField from "@/components/AuthField";
import { signUp } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await signUp(name, email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.push("/workspace");
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col px-8 py-8 sm:px-14">
        <Logo />

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-serif-display text-5xl">Create account.</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Your Observer is ready whenever you ask.
          </p>

          <form onSubmit={submit} className="mt-9 space-y-5">
            <AuthField
              label="Full name"
              icon="◉"
              type="text"
              value={name}
              onChange={setName}
              placeholder="Muhammad Umar Farooq"
              autoComplete="name"
            />
            <AuthField
              label="Email"
              icon="✉"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@university.edu.pk"
              autoComplete="email"
            />
            <AuthField
              label="Password"
              icon="🔒"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />

            {error && (
              <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-sm text-ember">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-bronze-deep py-2.5 text-sm font-medium text-cream shadow transition hover:bg-bronze disabled:opacity-60"
            >
              ✳ {busy ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-8 text-sm text-ink-soft">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-bronze hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <AuthShowcase
        eyebrow="Observer mode — Standby"
        quote="Write, select, and ask. The workspace"
        accent="keeps help close by."
      />
    </div>
  );
}
