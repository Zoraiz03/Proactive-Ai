import { useCallback, useEffect, useRef, useState } from 'react';
import { sha256Text } from '../../shared/ai-edit';
import type { ObserverRequest } from '../../shared/observer';
import type { FixCodeResult } from '../../shared/fix-code';
import type { ObserverStatus } from './ObserverPanel';

type Source = { file: { relativePath: string }; draft: string; availability: string; externalConflict: unknown };

export function useFixCode(workspaceId: string | undefined, tabs: readonly Source[], onStatus: (s: ObserverStatus) => void, action: "Fix Code" | "Improve Code" = "Fix Code") {
  const latest = useRef(tabs);
  latest.current = tabs;
  const [request, setRequest] = useState<ObserverRequest | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [result, setResult] = useState<FixCodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0), running = useRef(false), id = useRef('');

  const clear = useCallback(() => {
    epoch.current++;
    running.current = false;
    setBusy(false);
    setRequest(null);
    setResult(null);
    setError('');
    setSnapshot('');
    onStatus('idle');
    void (action === "Improve Code" ? window.observer.improveClear() : window.observer.fixClear());
  }, [onStatus, action]);
  useEffect(() => {
    const generation = epoch;
    clear();
    return () => { generation.current++; void (action === "Improve Code" ? window.observer.improveClear() : window.observer.fixClear()); };
  }, [workspaceId, clear, action]);

  const source = tabs.find(t => t.file.relativePath === request?.editBase?.targetRelativePath);
  const stale = Boolean(request && (!source || source.draft !== snapshot || source.availability !== 'available' || source.externalConflict));
  const cancel = useCallback(() => {
    epoch.current++;
    running.current = false;
    setBusy(false);
    setError(`${action} cancelled. Start a new review through Context Preview.`);
    onStatus('error');
    void (action === "Improve Code" ? window.observer.improveClear() : window.observer.fixClear());
  }, [onStatus, action]);
  useEffect(() => { if (stale && busy) cancel(); }, [stale, busy, cancel]);

  const run = async (approved: ObserverRequest, invoke: () => ReturnType<typeof window.observer.fixClarify>) => {
    if (running.current) return;
    running.current = true;
    const token = ++epoch.current;
    setBusy(true);
    setError('');
    onStatus('thinking');
    try {
      const before = latest.current.find(t => t.file.relativePath === approved.editBase?.targetRelativePath);
      const beforeHash = before ? await sha256Text(before.draft) : undefined;
      if (token !== epoch.current) return;
      const latestBefore = latest.current.find(t => t.file.relativePath === approved.editBase?.targetRelativePath);
      if (!before || !latestBefore || latestBefore.draft !== before.draft || latestBefore.availability !== 'available' || latestBefore.externalConflict || beforeHash !== approved.editBase?.originalContentHash) {
        setError('Source changed since Context Preview. Nothing was sent; preview current code.');
        onStatus('error');
        return;
      }
      const response = await invoke();
      if (token !== epoch.current) return;
      const current = latest.current.find(t => t.file.relativePath === approved.editBase?.targetRelativePath);
      const hash = current ? await sha256Text(current.draft) : undefined;
      // Hashing is asynchronous too: clear/project switch must also invalidate this gap.
      if (token !== epoch.current) return;
      const newest = latest.current.find(t => t.file.relativePath === approved.editBase?.targetRelativePath);
      if (!current || !newest || newest.availability !== 'available' || newest.externalConflict || newest.draft !== current.draft || hash !== approved.editBase?.originalContentHash) {
        setError('Source changed. The stale response was rejected; preview current code.');
        onStatus('error');
        return;
      }
      if (response.ok) {
        setResult(response.value);
        onStatus('ready');
      } else {
        setError(response.error);
        onStatus('error');
      }
    } catch {
      if (token === epoch.current) {
        setError(`${action} could not complete. Check the backend and start a new review.`);
        onStatus('error');
      }
    } finally {
      if (token === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  return {
    request, result, busy, error, stale, clear, cancel, epoch,
    start: async (approved: ObserverRequest, content: string) => {
      if (running.current) return;
      id.current = crypto.randomUUID();
      setRequest(approved);
      setSnapshot(content);
      setResult(null);
      await run(approved, () => (action === "Improve Code" ? window.observer.improveStart(id.current, approved) : window.observer.fixStart(id.current, approved)));
    },
    clarify: async (answer: string) => {
      if (!request || stale || running.current) return;
      const current = latest.current.find(t => t.file.relativePath === request.editBase?.targetRelativePath);
      if (!current) return;
      const token = epoch.current, sessionId = id.current;
      const hash = await sha256Text(current.draft);
      const newest = latest.current.find(t => t.file.relativePath === request.editBase?.targetRelativePath);
      if (token !== epoch.current || !newest || newest.draft !== current.draft || newest.availability !== 'available' || newest.externalConflict) return;
      await run(request, () => (action === "Improve Code" ? window.observer.improveClarify(sessionId, answer, hash) : window.observer.fixClarify(sessionId, answer, hash)));
    },
  };
}
