import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { ENGINE_CHANNELS, type MemoryStatus, type MemoryStatusEvent, type PurgeScope } from '../../shared/observer-engine.ts';
import type { IpcResult } from '../../shared/workspace';
import { ProjectMemoryService } from './memory-service.ts';
import { LocalSettingsStore } from '../settings-store.ts';
import { recentProjectId } from '../recent-projects.ts';

const denied = (): IpcResult<MemoryStatus> => ({ ok: false, error: 'Memory request denied. Open a project and sign in first.' });
const unavailable = (): IpcResult<MemoryStatus> => ({ ok: false, error: 'Project memory is unavailable. Check the native SQLite installation and local storage.' });
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validScope = (value: unknown): value is PurgeScope => ['all','web','journal'].includes(value as string) ||
  (exact(value, ['path']) && typeof value.path === 'string' && value.path.length > 0 && value.path.length <= 4096 &&
    !/[\x00-\x1f\\:]/.test(value.path) && !value.path.startsWith('/') && value.path.split('/').every(part => part !== '.' && part !== '..' && part !== ''));

export function registerMemoryIpc(deps: {
  ipc: Pick<IpcMain, 'handle'|'removeHandler'>;
  getWindow: () => BrowserWindow | null;
  userData: string;
  confirm: (kind: 'open'|'resume'|'purge') => Promise<boolean>;
}) {
  let owner: { root: string; id: string; sender: number } | null = null;
  let generation = 0, consent = false, opening = false;
  let failure = false;
  let tail: Promise<unknown> = Promise.resolve();
  const settings = new LocalSettingsStore(deps.userData);
  const publish = (result: IpcResult<MemoryStatus>) => {
    const window = deps.getWindow();
    if (!window || window.isDestroyed() || window.webContents.id !== owner?.sender) return;
    // Do not publish an old project's final scan while a workspace switch closes it.
    if (result.ok && result.value.workspaceId && result.value.workspaceId !== owner.id) return;
    const event: MemoryStatusEvent = { workspaceId: owner.id, result };
    window.webContents.send(ENGINE_CHANNELS.memoryStatus, event);
  };
  const service = new ProjectMemoryService(deps.userData, { onStatus: status => publish({ ok: true, value: status }) });
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const next = tail.then(action); tail = next.catch(() => {}); return next;
  };
  const trusted = (event: IpcMainInvokeEvent) => {
    const window = deps.getWindow();
    return !!window && !window.isDestroyed() && event.sender === window.webContents &&
      event.sender.id === owner?.sender && event.senderFrame === event.sender.mainFrame;
  };
  const valid = (event: IpcMainInvokeEvent, request: unknown, keys: string[]) => trusted(event) && exact(request, keys) &&
    typeof request.workspaceId === 'string' && request.workspaceId === owner?.id;
  const current = (epoch: number, event: IpcMainInvokeEvent) => generation === epoch && trusted(event);
  const snapshot = (): IpcResult<MemoryStatus> => {
    if (failure) return unavailable();
    const status = service.status();
    if (status.workspaceId && status.workspaceId !== owner?.id) return { ok: false, error: 'Project memory is opening.' };
    return { ok: true, value: status };
  };
  const policy = async () => {
    const local = await settings.get();
    return { exclusions: local.aiContextExclusions };
  };
  const channels = [ENGINE_CHANNELS.memoryOpen, ENGINE_CHANNELS.memoryStatus, ENGINE_CHANNELS.memoryPause, ENGINE_CHANNELS.memoryPurge];

  deps.ipc.handle(ENGINE_CHANNELS.memoryStatus, async (event, request: unknown, ...extra: unknown[]) => {
    if (extra.length || !valid(event, request, ['workspaceId'])) return denied();
    return snapshot();
  });
  deps.ipc.handle(ENGINE_CHANNELS.memoryOpen, async (event, request: unknown, ...extra: unknown[]) => {
    if (extra.length || !valid(event, request, ['workspaceId']) || opening) return denied();
    const epoch = generation;
    opening = true;
    try {
      if (!consent && !await deps.confirm('open')) return current(epoch, event) ? snapshot() : denied();
      if (!current(epoch, event)) return denied();
      consent = true;
      return await serial(async () => {
        const options = await policy();
        if (!current(epoch, event)) return denied();
        failure = false;
        service.configure({ ...options, memoryEnabled: true });
        if (!service.status().open) await service.open(owner!.root, 'existing');
        else await service.scan();
        return current(epoch, event) ? snapshot() : denied();
      });
    } catch { failure = current(epoch, event); if (failure) publish(unavailable()); return unavailable(); }
    finally { if (generation === epoch) opening = false; }
  });
  deps.ipc.handle(ENGINE_CHANNELS.memoryPause, async (event, request: unknown, ...extra: unknown[]) => {
    if (extra.length || !valid(event, request, ['workspaceId','paused']) || typeof (request as Record<string,unknown>).paused !== 'boolean') return denied();
    const epoch = generation;
    const paused = (request as { paused: boolean }).paused;
    try {
      if (paused) { service.setPaused(true); return snapshot(); }
      if (!consent || !await deps.confirm('resume') || !current(epoch, event)) return denied();
      return await serial(async () => {
        const options = await policy(); if (!current(epoch, event)) return denied();
        service.configure({ ...options, memoryEnabled: true }); service.setPaused(false);
        await service.scan(); return current(epoch, event) ? snapshot() : denied();
      });
    } catch { return unavailable(); }
  });
  deps.ipc.handle(ENGINE_CHANNELS.memoryPurge, async (event, request: unknown, ...extra: unknown[]) => {
    if (extra.length || !valid(event, request, ['workspaceId','scope']) || !validScope((request as Record<string,unknown>).scope)) return denied();
    const epoch = generation;
    try {
      if (!await deps.confirm('purge') || !current(epoch, event)) return denied();
      service.purge((request as { scope: PurgeScope }).scope);
      return snapshot();
    } catch { return unavailable(); }
  });
  return {
    setWorkspace(root: string, sender: number) {
      generation++; consent = false; opening = false; failure = false;
      service.configure({ memoryEnabled: false });
      owner = { root, id: recentProjectId(root), sender };
      const epoch = generation;
      return serial(async () => {
        await service.close();
        const options = await policy(); if (epoch !== generation) return;
        service.configure({ ...options, memoryEnabled: false });
        await service.open(root, 'existing');
        if (epoch === generation) { service.configure(options); publish(snapshot()); }
      }).catch(() => { if (epoch === generation) { failure = true; publish(unavailable()); } });
    },
    clearWorkspace() {
      generation++; consent = false; opening = false; owner = null;
      service.configure({ memoryEnabled: false });
      return serial(() => service.close());
    },
    async refreshPolicy() {
      const epoch = generation;
      try { const options = await policy(); if (epoch === generation) service.configure(options); }
      catch { if (epoch === generation) { service.configure({ memoryEnabled: false }); failure = true; publish(unavailable()); } }
    },
    async cleanup() {
      channels.forEach(channel => deps.ipc.removeHandler(channel));
      generation++; owner = null; service.configure({ memoryEnabled: false }); await serial(() => service.close());
    },
  };
}
