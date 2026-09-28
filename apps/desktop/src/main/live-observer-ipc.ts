import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { LIVE_CHANNELS, LIVE_CONFIG, LIVE_BLOCK_REASONS, type LiveEdit, type LiveActivity } from '../shared/live-observer';
import { OBSERVER_PROVIDERS, OBSERVER_PROVIDER_LABELS, type ObserverProvider } from '../shared/observer';
import { LiveObserverController } from './live-observer';
import { LocalSettingsStore } from './settings-store';
import { SettingsApiClient } from './settings-client';
import { ObserverApiClient } from './observer-client';
export function registerLiveObserverIpc(getWindow: () => BrowserWindow | null, userData: string, token: () => Promise<string | null>, baseUrl: string, automaticBusy: () => boolean) {
 let senderId: number | null = null, consentGeneration = 0, confirming = false;
 const local = new LocalSettingsStore(userData), settings = new SettingsApiClient(baseUrl, token, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) })), client = new ObserverApiClient(baseUrl, token);
 const policy = async () => {
  const [l, s] = await Promise.all([local.get(), settings.getSynced()]);
  if (!s.ok) throw new Error(`Privacy settings unavailable: ${s.error} No code was sent.`);
  if (automaticBusy()) { controller.pause('Paused: automatic error help has priority. Make a new edit when it finishes.'); throw new Error('Automatic error help has priority.'); }
  return { observerEnabled: s.value.observerEnabled, includeDiagnostics: s.value.includeDiagnostics, confirmCompleteFile: s.value.confirmCompleteFile, exclusions: l.aiContextExclusions, maximumCharacters: s.value.maximumContextChars, maximumFileCharacters: l.contextMaximumFileCharacters };
 };
 const controller = new LiveObserverController({ policy, ask: (r, s) => client.ask(r, s), publish: state => getWindow()?.webContents.send(LIVE_CHANNELS.state, state) });
 const trusted = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => e.sender.id === senderId && e.sender === getWindow()?.webContents && e.senderFrame === e.sender.mainFrame;
 const reset = () => { consentGeneration++; controller.configure(false, 'demo'); };
 ipcMain.handle(LIVE_CHANNELS.configure, async (e, enabled: unknown, provider: unknown, pause: unknown) => {
  if (!trusted(e) || typeof enabled !== 'boolean' || !OBSERVER_PROVIDERS.includes(provider as ObserverProvider) || typeof pause !== 'number' || !Number.isFinite(pause)) return { ok: false, error: 'Open a project and sign in first.' };
  if (!enabled) { reset(); return { ok: true, value: controller.getState() }; }
  if (confirming) return { ok: false, error: 'Live Observer consent is already open.' };
  const generation = ++consentGeneration;
  confirming = true;
  try {
   const p = await policy();
   if (!p.observerEnabled) return { ok: false, error: 'Observer is disabled in Privacy settings.' };
   const answer = await dialog.showMessageBox(getWindow()!, { title: 'Live Observer · experimental', message: 'Allow automatic active-file code requests for this session?', detail: `After meaningful Python/JavaScript edits and a pause, bounded active-file code INCLUDING UNSAVED CODE, cursor location, line numbers${p.includeDiagnostics ? ', and relevant diagnostics' : ' (diagnostics are disabled in Privacy settings)'} may be sent automatically to ${OBSERVER_PROVIDER_LABELS[provider as ObserverProvider]} through your backend. Up to ${LIVE_CONFIG.maximumCodeCharacters} code characters, ${LIVE_CONFIG.cooldownMs / 1000}-second cooldown, ${LIVE_CONFIG.maximumRequestsPerHour} requests/hour. Exclusions and secret screening apply. ${p.confirmCompleteFile ? 'Confirm complete files is enabled: excerpts covering a whole file will be blocked; use Ask Observer for those files.' : 'A short file may fit entirely in the excerpt.'} No history, automatic edits, saves, or execution. Provider charges may apply. Already sent requests cannot be recalled.`, buttons: ['Cancel', 'Enable for this session'], defaultId: 0, cancelId: 0, noLink: true });
   if (generation === consentGeneration && trusted(e) && answer.response === 1) controller.configure(true, provider as ObserverProvider, pause);
   return { ok: true, value: controller.getState() };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Live Observer unavailable.' }; }
  finally { confirming = false; }
 });
 const edit = (e: Electron.IpcMainEvent, value: LiveEdit) => {
  if (trusted(e) && value && typeof value.content === 'string' && value.content.length > 50000) {
   controller.block('Blocked: the active buffer exceeds the 50,000-character Live Observer limit. Review a smaller selection with Ask Observer. No code was sent.', true); return;
  }
  if (!trusted(e) || !value || typeof value.relativePath !== 'string' || value.relativePath.length > 4096 || typeof value.content !== 'string' || value.content.length > 50000 || typeof value.previousContent !== 'string' || value.previousContent.length > 50000 || !Number.isInteger(value.line) || !Number.isInteger(value.column) || value.column < 1 || !Array.isArray(value.diagnostics) || value.diagnostics.length > 100 || value.diagnostics.some(d => !d || !Number.isInteger(d.line) || !Number.isInteger(d.column) || typeof d.message !== 'string' || d.message.length > 10000)) { if (trusted(e)) controller.cancel(); return; }
  controller.edit(value);
 };
 const activity = (e: Electron.IpcMainEvent, value: LiveActivity) => {
  if (trusted(e) && value && (value.relativePath === null || typeof value.relativePath === 'string') && typeof value.focused === 'boolean' && typeof value.blocked === 'boolean' && (value.reason === undefined || LIVE_BLOCK_REASONS.includes(value.reason))) controller.observeActivity({ ...value, focused: value.focused && Boolean(getWindow()?.isFocused()), blocked: value.blocked || automaticBusy(), reason: value.reason ?? (automaticBusy() ? 'automatic' : undefined) });
 };
 const cancel = (e: Electron.IpcMainEvent) => { if (trusted(e)) controller.dismiss(); };
 ipcMain.on(LIVE_CHANNELS.edit, edit); ipcMain.on(LIVE_CHANNELS.activity, activity); ipcMain.on(LIVE_CHANNELS.cancel, cancel);
 const timer = setInterval(() => { if (!getWindow()?.isFocused()) { if (controller.getState().status !== 'paused') controller.pause('Paused: the IDE window is not focused. Return and make a new edit.'); } else void controller.tick(); }, 250);
 return { controller, reset, setWorkspace: (_root: string, id: number) => { reset(); senderId = id; }, clearWorkspace: () => { reset(); senderId = null; }, cleanup: () => { reset(); clearInterval(timer); ipcMain.removeHandler(LIVE_CHANNELS.configure); ipcMain.removeListener(LIVE_CHANNELS.edit, edit); ipcMain.removeListener(LIVE_CHANNELS.activity, activity); ipcMain.removeListener(LIVE_CHANNELS.cancel, cancel); } };
}
