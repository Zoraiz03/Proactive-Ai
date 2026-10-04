import { useState, useEffect } from 'react';
import { LIVE_CONFIG, type LiveState } from '../../shared/live-observer';
import type { ObserverProvider } from '../../shared/observer';
export function LiveSuggestion({ state, onReview }: { state: LiveState; onReview: () => void }) {
 if (!state.suggestion) return null;
 return <article className="live-suggestion" aria-label="Live Observer suggestion">
  <strong>Live Observer · line {state.request?.cursorLine} · not tested</strong>
  <p>{state.suggestion.explanation}</p><small>{state.suggestion.reason}</small>
  <div>{state.suggestion.edit && <button type="button" onClick={onReview}>Review diff</button>} <button type="button" onClick={() => window.liveObserver.cancel()}>Dismiss</button></div>
 </article>;
}
export default function LiveObserverCard({ state, provider, available, onState, onReview, onAsk, canAsk = false }: { state: LiveState; provider: ObserverProvider; available: boolean; onState: (state: LiveState) => void; onReview: () => void; onAsk?: () => void; canAsk?: boolean }) {
 useEffect(() => {
  const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape' && ['waiting', 'cooldown', 'limited', 'checking', 'thinking', 'ready'].includes(state.status)) { event.preventDefault(); window.liveObserver.cancel(); } };
  window.addEventListener('keydown', dismiss, { capture: true }); return () => window.removeEventListener('keydown', dismiss, { capture: true });
 }, [state.status]);
 const [pause, setPause] = useState<number>(LIVE_CONFIG.pauseMs), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const pauseSeconds = (state.timing?.pauseMs ?? pause) / 1000;
 const cooldownSeconds = (state.timing?.cooldownMs ?? LIVE_CONFIG.cooldownMs) / 1000;
 const maximumRequests = state.timing?.maximumRequestsPerHour ?? LIVE_CONFIG.maximumRequestsPerHour;
 const status = error ? 'error' : state.status;
 return <section className="proactive-nudge live-observer-card" aria-label="Live Observer controls">
  <div className="proactive-nudge-heading">
   <div className="live-observer-title"><h3>Live Observer</h3><span className="live-observer-badge">Experimental</span></div>
   <button className="observer-toggle" type="button" role="switch" aria-label="Live Observer" aria-checked={state.enabled} disabled={busy || (!available && !state.enabled)} onClick={async () => { setBusy(true); setError(''); try { const result = await window.liveObserver.configure(!state.enabled, provider, pause); if (result.ok) onState(result.value); else setError(result.error); } catch { setError('Live Observer unavailable. Restart the desktop app.'); } finally { setBusy(false); } }}>{busy ? 'Please wait…' : state.enabled ? 'On' : 'Off'}</button>
  </div>
  <label className="live-observer-control"><span className="live-observer-control-label">Trigger after typing stops</span><select className="observer-enhanced-select" aria-label="Live Observer pause" disabled={state.enabled || busy} value={pause} onChange={e => setPause(Number(e.target.value))}><option value={2000}>2 seconds</option><option value={2500}>2.5 seconds</option><option value={4000}>4 seconds</option><option value={8000}>8 seconds</option></select></label>
  <div className="live-observer-meta" aria-label="Live Observer timing and limits"><span>Pause {pauseSeconds}s</span><span>Cooldown {cooldownSeconds}s</span><span>Up to {maximumRequests}/hour</span><span>Session only</span></div>
  <div className={`live-observer-status live-observer-status-${status}`} role="status" data-live-status={state.status}><span aria-hidden="true" /><p>{error || state.message}</p></div>
  {state.reviewWithObserver && <button className="live-observer-review" type="button" disabled={!canAsk} onClick={onAsk}>Review with Ask Observer</button>}
  <div className="live-observer-safety"><span aria-hidden="true">✓</span><p><strong>Bounded code context.</strong> Requests can include unsaved code. Provider response time is additional. Press Escape to dismiss.</p></div>
  <LiveSuggestion state={state} onReview={onReview} />
 </section>;
}
