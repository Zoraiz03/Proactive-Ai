import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent, IpcMain } from 'electron';
import { registerMemoryIpc } from './ipc.ts';
import { ENGINE_CHANNELS, type MemoryStatusEvent, type MemoryStatus } from '../../shared/observer-engine.ts';
import type { IpcResult } from '../../shared/workspace';
import { recentProjectId } from '../recent-projects.ts';
import { LocalSettingsStore } from '../settings-store.ts';
import { createMemoryBridge } from '../../preload/memory-bridge.ts';
import { observeMemory, type MemoryView } from '../../renderer/src/engine/memory-view.ts';
import { journalHash } from '../../shared/edit-journal.ts';

test('edit IPC orders bootstrap and batches, rejects stale sessions and unauthorized workspace messages', async () => fixture(async f => {
  await f.invoke(ENGINE_CHANNELS.memoryOpen, { workspaceId: f.id });
  const text = 'export const count = 1;';
  const begin = await f.invoke(ENGINE_CHANNELS.memoryBuffer, { workspaceId: f.id, sessionId: 'editor-1', path: 'main.ts', content: text });
  assert.ok(begin.ok);
  const batch = { path: 'main.ts', clientSeq: 1, expectedBaseHash: journalHash(text), deltas: [
    { path: 'main.ts', offset: text.length, removedLen: 0, inserted: '\n// typed', origin: 'typing', ts: Date.now() },
  ] };
  f.handlers.get(ENGINE_CHANNELS.memoryEdits)!(f.event, { workspaceId: 'other', sessionId: 'editor-1', batch });
  await f.controller.fileSaved('main.ts');
  let status = await f.invoke(ENGINE_CHANNELS.memoryStatus, { workspaceId: f.id });
  assert.ok(status.ok && status.value.journalRows === 0);
  f.handlers.get(ENGINE_CHANNELS.memoryEdits)!(f.event, { workspaceId: f.id, sessionId: 'editor-1', batch });
  // A save is an explicit queue barrier; disk drift rebaselines but retains the edit trail.
  await f.controller.fileSaved('main.ts');
  status = await f.invoke(ENGINE_CHANNELS.memoryStatus, { workspaceId: f.id });
  assert.ok(status.ok && status.value.journalRows === 1);
  f.handlers.get(ENGINE_CHANNELS.memoryEdits)!(f.event, { workspaceId: f.id, sessionId: 'editor-1', batch });
  await f.controller.fileSaved('main.ts');
  assert.ok(f.events.some(event => !event.result.ok && event.result.error.includes('resynchronization')));
  assert.equal((await f.invoke(ENGINE_CHANNELS.memoryBuffer, { workspaceId: f.id, sessionId: 'x', path: '../outside', content: text })).ok, false);
}));

async function fixture(run: (f: {
  root: string; data: string; id: string; event: IpcMainInvokeEvent;
  handlers: Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResult<MemoryStatus>>>;
  controller: ReturnType<typeof registerMemoryIpc>; events: MemoryStatusEvent[];
  invoke: (channel: string, request: unknown, event?: IpcMainInvokeEvent) => Promise<IpcResult<MemoryStatus>>;
  listeners: Set<(event: MemoryStatusEvent) => void>;
  setConsent: (fn: () => Promise<boolean>) => void; signOut: () => void;
}) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), 'memory-ipc-'));
  const data = join(base, 'data'); await mkdir(join(base, 'project')); const root = await realpath(join(base, 'project'));
  const handlers = new Map(); const events: MemoryStatusEvent[] = [];
  const listeners = new Set<(event: MemoryStatusEvent) => void>();
  const frame = {}; const sender = { id: 7, mainFrame: frame, send: (_channel: string, event: MemoryStatusEvent) => { events.push(event); for (const listener of listeners) listener(event); } };
  const window = { isDestroyed: () => false, webContents: sender } as unknown as BrowserWindow;
  const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  let signedIn = true, consent = async () => true;
  const ipc = { on: (channel: string, fn: unknown) => handlers.set(channel, fn), removeListener: (channel: string) => handlers.delete(channel), handle: (channel: string, fn: unknown) => handlers.set(channel, fn), removeHandler: (channel: string) => handlers.delete(channel) } as unknown as IpcMain;
  const controller = registerMemoryIpc({ ipc, getWindow: () => signedIn ? window : null, userData: data, confirm: () => consent() });
  const invoke = (channel: string, request: unknown, source = event) => handlers.get(channel)(source, request) as Promise<IpcResult<MemoryStatus>>;
  try {
    await writeFile(join(root, 'main.ts'), 'export const count = 1;');
    await writeFile(join(root, '.env'), 'TOP_SECRET_FIXTURE');
    await controller.setWorkspace(root, 7);
    await run({ root, data, id: recentProjectId(root), event, handlers, controller, events, listeners, invoke,
      setConsent: fn => { consent = fn; }, signOut: () => { signedIn = false; } });
  } finally { await controller.cleanup(); await rm(base, { recursive: true, force: true }); }
}

test('IPC to preload to read-only model delivers real SQLite counts without content or credentials', async () => fixture(async f => {
  const bridge = createMemoryBridge({ send: () => {}, invoke: f.invoke, subscribe: (_channel, listener) => { f.listeners.add(listener); return () => { f.listeners.delete(listener); }; } });
  const states: MemoryView[] = [];
  const stop = observeMemory(bridge, f.id, state => states.push(state));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1)?.status?.indexedFiles, 0); // viewing does not grant consent
  const opened = await bridge.openMemory({ workspaceId: f.id });
  assert.ok(opened.ok);
  if (opened.ok) { assert.equal(opened.value.indexedFiles, 1); assert.equal(opened.value.chunks, 1); assert.equal(opened.value.symbols, 1); }
  assert.equal(states.at(-1)?.status?.indexedFiles, 1);
  assert.ok(f.events.some(e => e.result.ok && e.result.value.scanning));
  assert.equal(JSON.stringify(states).includes('export const'), false);
  assert.equal(JSON.stringify(states).includes('TOP_SECRET_FIXTURE'), false);
  assert.equal(JSON.stringify(states).includes(f.root), false);
  stop(); assert.equal(f.listeners.size, 0);
}));

test('memory rejects unknown fields, arbitrary paths, wrong workspace, sender, subframes and signed-out requests', async () => fixture(async f => {
  for (const value of [null, [], {}, { workspaceId: f.id, root: f.root }, { workspaceId: 'other' }]) {
    assert.equal((await f.invoke(ENGINE_CHANNELS.memoryOpen, value)).ok, false);
  }
  const request = { workspaceId: f.id };
  assert.equal((await f.invoke(ENGINE_CHANNELS.memoryOpen, request, { ...f.event, senderFrame: {} } as IpcMainInvokeEvent)).ok, false);
  assert.equal((await f.invoke(ENGINE_CHANNELS.memoryOpen, request, { ...f.event, sender: { id: 8 } } as IpcMainInvokeEvent)).ok, false);
  assert.equal((await f.handlers.get(ENGINE_CHANNELS.memoryStatus)!(f.event, request, 'extra')).ok, false);
  f.signOut(); assert.equal((await f.invoke(ENGINE_CHANNELS.memoryStatus, request)).ok, false);
}));

test('consent cancellation performs no indexing and stale consent cannot index another workspace', async () => fixture(async f => {
  f.setConsent(async () => false);
  const cancelled = await f.invoke(ENGINE_CHANNELS.memoryOpen, { workspaceId: f.id });
  assert.ok(cancelled.ok && cancelled.value.indexedFiles === 0);
  let resolveConsent!: (value: boolean) => void;
  f.setConsent(() => new Promise(resolve => { resolveConsent = resolve; }));
  const opening = f.invoke(ENGINE_CHANNELS.memoryOpen, { workspaceId: f.id });
  const other = join(f.data, 'other-project'); await mkdir(other);
  // Outside the DB directory but under userData is safe for this empty fixture.
  await f.controller.setWorkspace(other, 7); resolveConsent(true);
  assert.equal((await opening).ok, false);
  const current = await f.invoke(ENGINE_CHANNELS.memoryStatus, { workspaceId: recentProjectId(other) });
  assert.ok(current.ok && current.value.indexedFiles === 0);
}));

test('pause/resume/purge are validated and local exclusion changes remove indexed content', async () => fixture(async f => {
  const request = { workspaceId: f.id };
  await f.invoke(ENGINE_CHANNELS.memoryOpen, request);
  assert.equal((await f.invoke(ENGINE_CHANNELS.memoryPause, { ...request, paused: 'yes' })).ok, false);
  const paused = await f.invoke(ENGINE_CHANNELS.memoryPause, { ...request, paused: true });
  assert.ok(paused.ok && paused.value.paused);
  const resumed = await f.invoke(ENGINE_CHANNELS.memoryPause, { ...request, paused: false });
  assert.ok(resumed.ok && !resumed.value.paused);
  for (const scope of [{ path: '../escape' }, { path: 'main.ts', extra: true }, 'everything']) assert.equal((await f.invoke(ENGINE_CHANNELS.memoryPurge, { ...request, scope })).ok, false);
  const store = new LocalSettingsStore(f.data); await store.set({ ...await store.get(), aiContextExclusions: ['main.ts'] });
  await f.controller.refreshPolicy();
  const status = await f.invoke(ENGINE_CHANNELS.memoryStatus, request);
  assert.ok(status.ok && status.value.indexedFiles === 0 && status.value.chunks === 0 && status.value.symbols === 0);
  assert.ok((await f.invoke(ENGINE_CHANNELS.memoryPurge, { ...request, scope: 'all' })).ok);
  await f.controller.clearWorkspace(); assert.equal((await f.invoke(ENGINE_CHANNELS.memoryStatus, request)).ok, false);
}));

test('read-only model ignores stale initial responses and unsubscribes on project change', async () => {
  let initial!: (result: IpcResult<MemoryStatus>) => void;
  let listener!: (event: MemoryStatusEvent) => void;
  let removed = false;
  const bridge = createMemoryBridge({ send: () => {}, invoke: async () => new Promise(resolve => { initial = resolve; }), subscribe: (_channel, callback) => { listener = callback; return () => { removed = true; }; } });
  const views: MemoryView[] = [];
  const stop = observeMemory(bridge, 'project', view => views.push(view));
  listener({ workspaceId: 'other', result: { ok: false, error: 'wrong project' } });
  listener({ workspaceId: 'project', result: { ok: false, error: 'newest status' } });
  initial({ ok: false, error: 'stale status' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(views.at(-1)?.error, 'newest status');
  stop(); listener({ workspaceId: 'project', result: { ok: false, error: 'late status' } });
  assert.equal(views.at(-1)?.error, 'newest status'); assert.ok(removed);
});
