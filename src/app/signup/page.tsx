"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import AuthShowcase from "@/components/AuthShowcase";
import AuthField from "@/components/AuthField";
import { signUp } from "@/lib/auth";

const PAUSE_OPTIONS = [3, 5, 8, 12];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pauseSeconds, setPauseSeconds] = useState(5);
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
    const err = await signUp(name, email, password, pauseSeconds);
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
            Your observer starts watching in under a minute.
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

            <div>
              <span className="text-xs font-medium text-ink-soft">
                ⏱ Suggest after a typing pause of
              </span>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {PAUSE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPauseSeconds(s)}
                    className={`rounded-lg border py-2 text-sm transition ${
                      pauseSeconds === s
                        ? "border-bronze-deep bg-bronze-deep font-medium text-cream"
                        : "border-sand bg-[#fffdf5] text-ink-soft hover:border-bronze"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-tan">
                You can change this any time in preferences.
              </p>
            </div>

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
        quote="Stop asking. Start typing. The workspace"
        accent="watches with you."
      />
    </div>
  );
}
