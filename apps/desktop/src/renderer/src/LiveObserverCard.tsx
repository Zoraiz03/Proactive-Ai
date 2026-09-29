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
 return <section className="proactive-nudge" aria-label="Live Observer controls">
  <div className="proactive-nudge-heading"><strong>Live Observer · experimental</strong><button type="button" role="switch" aria-label="Live Observer" aria-checked={state.enabled} disabled={busy || (!available && !state.enabled)} onClick={async () => { setBusy(true); setError(''); try { const result = await window.liveObserver.configure(!state.enabled, provider, pause); if (result.ok) onState(result.value); else setError(result.error); } catch { setError('Live Observer unavailable. Restart the desktop app.'); } finally { setBusy(false); } }}>{state.enabled ? 'On' : 'Off'}</button></div>
  <label>Typing pause <select aria-label="Live Observer pause" disabled={state.enabled || busy} value={pause} onChange={e => setPause(Number(e.target.value))}><option value={2000}>2 seconds</option><option value={4000}>4 seconds</option><option value={8000}>8 seconds</option></select></label>
  <small>After typing stops: {(state.timing?.pauseMs ?? pause) / 1000}s pause · Between requests: {(state.timing?.cooldownMs ?? LIVE_CONFIG.cooldownMs) / 1000}s cooldown · At most {state.timing?.maximumRequestsPerHour ?? LIVE_CONFIG.maximumRequestsPerHour}/hour. Provider response time is additional.</small>
  <p role="status" data-live-status={state.status}>{error || state.message}</p><small>Automatic bounded code requests, including unsaved code. Session-only. Escape dismisses.</small>
  {state.reviewWithObserver && <button type="button" disabled={!canAsk} onClick={onAsk}>Review with Ask Observer</button>}
  <LiveSuggestion state={state} onReview={onReview} />
 </section>;
}
