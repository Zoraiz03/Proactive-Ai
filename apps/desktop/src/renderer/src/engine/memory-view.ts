import type { EngineBridge, MemoryStatus } from '../../../shared/observer-engine';

export interface MemoryView { status: MemoryStatus | null; error: string | null; loading: boolean }

/** Read-only subscription: mounting the panel never opens, pauses or purges memory. */
export function observeMemory(bridge: EngineBridge, workspaceId: string, update: (view: MemoryView) => void): () => void {
  let active = true, events = 0;
  update({ status: null, error: null, loading: true });
  const apply = (result: Awaited<ReturnType<EngineBridge['memoryStatus']>>) => {
    if (!active) return;
    if (result.ok && result.value.workspaceId && result.value.workspaceId !== workspaceId) return;
    update(result.ok ? { status: result.value, error: null, loading: false } : { status: null, error: result.error, loading: false });
  };
  const unsubscribe = bridge.onMemoryStatus(event => {
    if (event.workspaceId !== workspaceId) return;
    events++; apply(event.result);
  });
  const initialEvents = events;
  void bridge.memoryStatus({ workspaceId }).then(result => { if (events === initialEvents) apply(result); })
    .catch(() => { if (events === initialEvents) apply({ ok: false, error: 'Project memory status is unavailable.' }); });
  return () => { active = false; unsubscribe(); };
}

export function memoryStateLabel(status: MemoryStatus): string {
  if (!status.open) return 'No memory database open';
  if (status.paused) return 'Memory paused';
  return status.scanning ? 'Scanning saved files' : 'Scan complete';
}
