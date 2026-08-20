import { useEffect, useState, type FormEvent } from "react";
import type { DesktopAuthState } from "../../shared/auth";
import App from "./App";

function AuthenticationScreen({ state }: { state: DesktopAuthState }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configurationError = state.status === "configuration_error" ? state.message : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || configurationError) return;
    setBusy(true);
    setError(null);
    const result = await window.desktopAuth.signIn({ email, password });
    setBusy(false);
    if (!result.ok) {
      setPassword("");
      setError(result.error);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="desktop-sign-in-title">
        <div className="auth-brand-mark" aria-hidden="true">P</div>
        <p className="auth-eyebrow">Proactive AI IDE</p>
        <h1 id="desktop-sign-in-title">Sign in to your workspace</h1>
        <p className="auth-intro">Use the same account as the Proactive AI Workspace web app.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              disabled={busy || Boolean(configurationError)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={busy || Boolean(configurationError)}
              required
            />
          </label>
          {(error || configurationError) && (
            <p className="auth-error" role="alert">{error ?? configurationError}</p>
          )}
          <button type="submit" disabled={busy || Boolean(configurationError) || !email || !password}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="auth-security-note">Your session is encrypted with your operating system’s secure storage.</p>
      </section>
    </main>
  );
}

export default function DesktopAuth() {
  const [state, setState] = useState<DesktopAuthState>({ status: "initializing" });

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktopAuth.onStateChanged((nextState) => {
      if (active) setState(nextState);
    });
    void window.desktopAuth.getState().then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (state.status === "initializing") {
    return (
      <main className="auth-shell">
        <div className="auth-loading" role="status">
          <span className="auth-brand-mark" aria-hidden="true">P</span>
          <p>Restoring your secure session…</p>
        </div>
      </main>
    );
  }
  if (state.status !== "signed_in") return <AuthenticationScreen state={state} />;

  return (
    <App
      user={state.user}
      onSignOut={async () => {
        const result = await window.desktopAuth.signOut();
        return result.ok ? null : result.error;
      }}
    />
  );
}

