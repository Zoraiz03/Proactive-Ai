import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObserverRequest } from '../../shared/observer';
import type { ExplanationResult } from '../../shared/explanation';
import type { ObserverStatus } from './ObserverPanel';

export function useExplanation(workspaceId: string | undefined, onStatus: (status: ObserverStatus) => void) {
 const [request, setRequest] = useState<ObserverRequest | null>(null);
 const [snapshot, setSnapshot] = useState<{ path: string; content: string } | null>(null);
 const [result, setResult] = useState<ExplanationResult | null>(null);
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const epoch = useRef(0), inFlight = useRef(false), id = useRef('');
 const cancel = useCallback(() => {
  epoch.current++; inFlight.current = false; setBusy(false);
  void window.observer.cancelExplanation(); onStatus('idle');
 }, [onStatus]);
 const clear = useCallback(() => {
  epoch.current++; inFlight.current = false; id.current = '';
  setRequest(null); setSnapshot(null); setResult(null); setError(''); setBusy(false); onStatus('idle');
  void window.observer.clearExplanation();
 }, [onStatus]);
 useEffect(() => { const generation = epoch; clear(); return () => { generation.current++; void window.observer.clearExplanation(); }; }, [workspaceId, clear]);
 const run = async (invoke: () => ReturnType<typeof window.observer.followup>) => {
  if (inFlight.current) return;
  inFlight.current = true; const token = ++epoch.current;
  setBusy(true); setError(''); onStatus('thinking');
  try {
   const response = await invoke();
   if (token !== epoch.current) return;
   if (response.ok) { setResult(response.value); onStatus('ready'); }
   else { setError(response.error); onStatus('error'); }
  } catch { if (token === epoch.current) { setError('Unable to complete the explanation. Check the connection and try again.'); onStatus('error'); } }
  finally { if (token === epoch.current) { inFlight.current = false; setBusy(false); } }
 };
 return { request, snapshot, result, error, busy, clear, cancel, epoch,
  start: async (approved: ObserverRequest, source: { path: string; content: string }) => {
   if (inFlight.current) return;
   id.current = crypto.randomUUID(); setRequest(approved); setSnapshot(source); setResult(null);
   await run(() => window.observer.explain(id.current, approved));
  },
  followup: (question: string) => run(() => window.observer.followup(id.current, question)),
 };
}
