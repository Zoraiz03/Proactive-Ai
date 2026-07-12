"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import AuthShowcase from "@/components/AuthShowcase";
import AuthField from "@/components/AuthField";
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
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
          <h1 className="font-serif-display text-5xl">Sign in.</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Continue to your workspace.
          </p>

          <form onSubmit={submit} className="mt-9 space-y-5">
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
              autoComplete="current-password"
              trailing={
                <span
                  className="cursor-not-allowed text-bronze"
                  title="Password reset arrives with Supabase in Phase 3"
                >
                  Forgot?
                </span>
              }
            />

            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-bronze-deep"
              />
              Keep me signed in for 30 days
            </label>

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
              ✳ {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="flex items-center gap-3 text-xs text-tan">
              <span className="h-px flex-1 bg-sand" />
              OR
              <span className="h-px flex-1 bg-sand" />
            </div>

            <button
              type="button"
              title="Google sign-in arrives with Supabase in Phase 3"
              className="w-full cursor-not-allowed rounded-lg border border-sand bg-cream-deep py-2.5 text-sm text-ink-soft"
            >
              <span className="mr-2 font-bold text-[#4285F4]">G</span>
              Continue with Google
            </button>
          </form>

          <p className="mt-8 text-sm text-ink-soft">
            No account?{" "}
            <Link href="/signup" className="font-medium text-bronze hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <AuthShowcase
        eyebrow="Observer mode — Active"
        quote="Welcome back. The workspace remembers"
        accent="where you left off."
      />
    </div>
  );
}
