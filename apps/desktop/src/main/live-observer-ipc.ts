import { OBSERVER_CONTEXT_CHARACTERS } from "../shared/observer-budget";
import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { LIVE_CHANNELS, LIVE_CONFIG, LIVE_BLOCK_REASONS, type LiveEdit, type LiveActivity } from '../shared/live-observer';
import { OBSERVER_PROVIDERS, OBSERVER_PROVIDER_LABELS, type ObserverProvider } from '../shared/observer';
import { ProjectContextEngine } from './project-context';
import { validateContextTrayItem } from '../shared/context-tray';
import { LiveObserverController, buildLiveProjectRequest } from './live-observer';
import { LocalSettingsStore } from './settings-store';
import { SettingsApiClient } from './settings-client';
import { ObserverApiClient } from './observer-client';
export function registerLiveObserverIpc(getWindow: () => BrowserWindow | null, userData: string, token: () => Promise<string | null>, baseUrl: string, automaticBusy: () => boolean) {
 let senderId: number | null = null, consentGeneration = 0, confirming = false, completeFilesApproved = false;
 const contextEngine = new ProjectContextEngine();
 const local = new LocalSettingsStore(userData), settings = new SettingsApiClient(baseUrl, token, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) })), client = new ObserverApiClient(baseUrl, token);
 const policy = async () => {
  const [l, s] = await Promise.all([local.get(), settings.getSynced()]);
  if (!s.ok) throw new Error(`Privacy settings unavailable: ${s.error} No code was sent.`);
  if (automaticBusy()) { controller.pause('Paused: automatic error help has priority. Make a new edit when it finishes.'); throw new Error('Automatic error help has priority.'); }
  return { observerEnabled: s.value.observerEnabled, includeDiagnostics: s.value.includeDiagnostics, confirmCompleteFile: s.value.confirmCompleteFile && !completeFilesApproved, exclusions: l.aiContextExclusions, maximumCharacters: s.value.maximumContextChars, maximumFileCharacters: l.contextMaximumFileCharacters, maximumRelatedFiles: l.contextMaximumRelatedFiles };
 };
 const controller = new LiveObserverController({ policy, buildRequest: (edit, provider, policy) => buildLiveProjectRequest(edit, provider, policy, contextEngine), ask: (r, s) => client.ask(r, s), publish: state => getWindow()?.webContents.send(LIVE_CHANNELS.state, state) });
 const trusted = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => e.sender.id === senderId && e.sender === getWindow()?.webContents && e.senderFrame === e.sender.mainFrame;
 const reset = () => { consentGeneration++; completeFilesApproved = false; controller.configure(false, 'demo'); };
 ipcMain.handle(LIVE_CHANNELS.configure, async (e, enabled: unknown, provider: unknown, pause: unknown) => {
  if (!trusted(e) || typeof enabled !== 'boolean' || !OBSERVER_PROVIDERS.includes(provider as ObserverProvider) || typeof pause !== 'number' || !Number.isFinite(pause)) return { ok: false, error: 'Open a project and sign in first.' };
  if (!enabled) { reset(); return { ok: true, value: controller.getState() }; }
  if (provider === 'demo') return { ok: false, error: 'Select a configured AI provider first. Demo does not analyze or complete code.' };
  if (confirming) return { ok: false, error: 'Live Observer consent is already open.' };
  const generation = ++consentGeneration;
  confirming = true;
  try {
   const p = await policy();
   if (!p.observerEnabled) return { ok: false, error: 'Observer is disabled in Privacy settings.' };
   const answer = await dialog.showMessageBox(getWindow()!, { title: 'Live Observer · experimental', message: 'Allow automatic active-file code requests for this session?', detail: `After code edits and a pause, the latest active file INCLUDING UNSAVED CODE, cursor, relevant imported files, project references, and attached Context Tray items may be sent to ${OBSERVER_PROVIDER_LABELS[provider as ObserverProvider]}. This includes complete files when they fit. Enabling explicitly approves complete-file context for this session. Your ${p.maximumCharacters.toLocaleString()}-character total Privacy budget still applies; use 50,000 in Settings for 20,000–30,000-character files plus related context. Diagnostics ${p.includeDiagnostics ? 'are included' : 'are disabled'}. Exclusions and secret screening apply. ${LIVE_CONFIG.maximumRequestsPerHour} requests/hour maximum. Suggestions require review; no automatic edits, saves, execution, or history. Provider charges may apply. Already sent requests cannot be recalled.`, buttons: ['Cancel', 'Enable for this session'], defaultId: 0, cancelId: 0, noLink: true });
   if (generation === consentGeneration && trusted(e) && answer.response === 1) { completeFilesApproved = true; controller.configure(true, provider as ObserverProvider, pause); }
   return { ok: true, value: controller.getState() };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Live Observer unavailable.' }; }
  finally { confirming = false; }
 });
 const edit = (e: Electron.IpcMainEvent, value: LiveEdit) => {
  if (trusted(e) && value?.trayItems !== undefined && (!Array.isArray(value.trayItems) || value.trayItems.length > 20 || value.trayItems.some(item => !validateContextTrayItem(item)))) { controller.block('Invalid Context Tray attachment. Refresh or remove it.'); return; }
  if (trusted(e) && value && typeof value.content === 'string' && value.content.length > OBSERVER_CONTEXT_CHARACTERS) {
   controller.block('Blocked: the active buffer exceeds the 50,000-character Live Observer limit. Review a smaller selection with Ask Observer. No code was sent.', true); return;
  }
  if (!trusted(e) || !value || typeof value.relativePath !== 'string' || value.relativePath.length > 4096 || typeof value.content !== 'string' || value.content.length > OBSERVER_CONTEXT_CHARACTERS || typeof value.previousContent !== 'string' || value.previousContent.length > OBSERVER_CONTEXT_CHARACTERS || !Number.isInteger(value.line) || !Number.isInteger(value.column) || value.column < 1 || !Array.isArray(value.diagnostics) || value.diagnostics.length > 100 || value.diagnostics.some(d => !d || !Number.isInteger(d.line) || !Number.isInteger(d.column) || typeof d.message !== 'string' || d.message.length > 10000)) { if (trusted(e)) controller.cancel(); return; }
  controller.edit(value);
 };
 const activity = (e: Electron.IpcMainEvent, value: LiveActivity) => {
  if (trusted(e) && value && (value.relativePath === null || typeof value.relativePath === 'string') && typeof value.focused === 'boolean' && typeof value.blocked === 'boolean' && (value.reason === undefined || LIVE_BLOCK_REASONS.includes(value.reason))) controller.observeActivity({ ...value, focused: value.focused && Boolean(getWindow()?.isFocused()), blocked: value.blocked || automaticBusy(), reason: value.reason ?? (automaticBusy() ? 'automatic' : undefined) });
 };
 const cancel = (e: Electron.IpcMainEvent) => { if (trusted(e)) controller.dismiss(); };
 ipcMain.on(LIVE_CHANNELS.edit, edit); ipcMain.on(LIVE_CHANNELS.activity, activity); ipcMain.on(LIVE_CHANNELS.cancel, cancel);
 const timer = setInterval(() => { if (!getWindow()?.isFocused()) { if (controller.getState().status !== 'paused') controller.pause('Paused: the IDE window is not focused. Return and make a new edit.'); } else void controller.tick(); }, 250);
 return { controller, reset, setWorkspace: (root: string, id: number) => { reset(); contextEngine.setWorkspace(root); senderId = id; }, clearWorkspace: () => { reset(); contextEngine.clearWorkspace(); senderId = null; }, cleanup: () => { reset(); clearInterval(timer); ipcMain.removeHandler(LIVE_CHANNELS.configure); ipcMain.removeListener(LIVE_CHANNELS.edit, edit); ipcMain.removeListener(LIVE_CHANNELS.activity, activity); ipcMain.removeListener(LIVE_CHANNELS.cancel, cancel); } };
}
