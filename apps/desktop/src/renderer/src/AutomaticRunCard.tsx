import { useState } from "react";
import type { AutomaticRunState } from "../../shared/automatic-run";
import { OBSERVER_PROVIDER_LABELS, type ObserverProvider } from "../../shared/observer";

export default function AutomaticRunCard({ state, provider, available, onState }: {
  state: AutomaticRunState; provider: ObserverProvider; available: boolean; onState: (state: AutomaticRunState) => void;
}) {
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setConfiguring(true); setError(null);
    try {
      const result = await window.automaticRun.configure(!state.enabled, provider);
      if (result.ok) onState(result.value); else setError(result.error);
    } catch { setError("Automatic explanation controls are unavailable. Restart the desktop application."); }
    finally { setConfiguring(false); }
  };
  const dismissible = ["waiting", "thinking", "ready", "error", "skipped"].includes(state.status);
  return <section className="proactive-nudge automatic-run-card" aria-label="Automatic failed-run explanations">
    <div className="proactive-nudge-heading">
      <div className="automatic-run-title"><h3>Auto-explain failed runs</h3><span className="automatic-run-badge">Experimental</span></div>
      <button className="observer-toggle" type="button" role="switch" aria-checked={state.enabled} aria-label="Auto-explain failed runs" disabled={configuring || (!available && !state.enabled)} onClick={() => void toggle()}>{configuring ? "Please wait…" : state.enabled ? "On" : "Off"}</button>
    </div>
    <div className="automatic-run-meta" aria-label="Automatic failed-run capabilities"><span>Python</span><span>JavaScript</span><span>Session only</span><span>{OBSERVER_PROVIDER_LABELS[state.provider ?? provider]}</span></div>
    <div className={`automatic-run-status automatic-run-status-${state.status}`} role="status"><span aria-hidden="true" /><p>{state.message}</p></div>
    {error && <p className="automatic-run-error" role="alert">{error}</p>}
    {state.explanation && <article className="observer-suggestion" aria-label="Automatic explanation">
      <p className="observer-explanation">{state.explanation}</p>
      <p className="observer-reason">{state.reason}</p>
    </article>}
    {dismissible && <button type="button" onClick={() => {
      window.automaticRun.dismiss();
      onState({ enabled: state.enabled, provider: state.provider, status: "armed", message: "Dismissed. No repeat explanation for this unchanged failure." });
    }} className="automatic-run-dismiss">Dismiss</button>}
    <div className="automatic-run-safety"><span aria-hidden="true">✓</span><p><strong>No automatic edits.</strong> Enabling permits bounded code/error requests without a per-request preview.</p></div>
  </section>;
}
