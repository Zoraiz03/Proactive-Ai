import { dialog, ipcMain, type BrowserWindow } from "electron";
import { AUTOMATIC_RUN_CHANNELS, AUTOMATIC_RUN_CONFIG, AUTOMATIC_RUN_OFF, type AutomaticRunActivity } from "../shared/automatic-run";
import { OBSERVER_PROVIDERS, OBSERVER_PROVIDER_LABELS, type ObserverProvider } from "../shared/observer";
import { AutomaticRunController } from "./automatic-run";
import { ObserverApiClient } from "./observer-client";
import { LocalSettingsStore } from "./settings-store";
import { SettingsApiClient } from "./settings-client";
import { readWorkspaceTextFile } from "./workspace-files";

export function registerAutomaticRunIpc(getWindow: () => BrowserWindow | null, userDataPath: string, getAccessToken: () => Promise<string | null>, apiBaseUrl: string) {
  let workspace: { root: string; senderId: number } | null = null;
  let consentGeneration = 0;
  let confirming = false;
  const local = new LocalSettingsStore(userDataPath);
  const settings = new SettingsApiClient(apiBaseUrl, getAccessToken, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }));
  const client = new ObserverApiClient(apiBaseUrl, getAccessToken);
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => Boolean(workspace && workspace.senderId === event.sender.id && event.sender === getWindow()?.webContents && event.senderFrame === event.sender.mainFrame);
  const controller = new AutomaticRunController({
    readCurrent: async (path) => {
      if (!workspace || !getWindow()) throw new Error("Workspace unavailable");
      return (await readWorkspaceTextFile(workspace.root, path)).content;
    },
    policy: async () => {
      const [preferences, synced] = await Promise.all([local.get(), settings.getSynced()]);
      if (!synced.ok) throw new Error("Privacy preferences unavailable");
      return { enabled: synced.value.observerEnabled && synced.value.includeDiagnostics && synced.value.includeTerminalError, exclusions: preferences.aiContextExclusions, maximumCharacters: Math.min(synced.value.maximumContextChars, preferences.contextMaximumFileCharacters + AUTOMATIC_RUN_CONFIG.maximumErrorCharacters + 500) };
    },
    ask: (request, signal) => client.ask(request, signal),
    publish: (state) => {
      const window = getWindow();
      if (window && !window.isDestroyed()) window.webContents.send(AUTOMATIC_RUN_CHANNELS.state, state);
    },
  });
  const reset = () => { consentGeneration++; controller.reset(); };
  ipcMain.handle(AUTOMATIC_RUN_CHANNELS.getState, (event) => trusted(event) ? controller.getState() : { ...AUTOMATIC_RUN_OFF });
  ipcMain.handle(AUTOMATIC_RUN_CHANNELS.configure, async (event, enabled: unknown, provider: unknown) => {
    if (!trusted(event) || typeof enabled !== "boolean" || !OBSERVER_PROVIDERS.includes(provider as ObserverProvider)) return { ok: false, error: "Open a project and sign in before enabling automatic explanations." };
    if (!enabled) { reset(); return { ok: true, value: controller.getState() }; }
    if (confirming) return { ok: false, error: "An automatic-request consent dialog is already open." };
    const window = getWindow()!;
    const generation = ++consentGeneration;
    confirming = true;
    try {
      const answer = await dialog.showMessageBox(window, {
        type: "question", title: "Enable automatic failed-run explanations?", message: "Allow Observer to explain failed runs automatically for this project session?",
        detail: `After failed Python/JavaScript runs, a nearby code excerpt (up to ${AUTOMATIC_RUN_CONFIG.maximumCodeCharacters} characters, possibly the whole file if short) and up to ${AUTOMATIC_RUN_CONFIG.maximumErrorCharacters} error characters will be sent through your configured backend to ${OBSERVER_PROVIDER_LABELS[provider as ObserverProvider]} without a per-request preview. Up to ${AUTOMATIC_RUN_CONFIG.maximumRequestsPerHour} requests per hour; provider charges may apply. No raw keystrokes, stdout, unrelated files, or Context Tray items are included. No automatic edits or commands. Suggestions are not saved to history. Turns off when the project/session changes. Requests already received by a provider cannot be recalled.`,
        buttons: ["Cancel", "Enable for this session"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (generation !== consentGeneration || !trusted(event) || answer.response !== 1) return { ok: true, value: controller.getState() };
      controller.configure(true, provider as ObserverProvider);
      return { ok: true, value: controller.getState() };
    } finally { confirming = false; }
  });
  const activity = (event: Electron.IpcMainEvent, value: unknown) => {
    if (!trusted(event) || !value || typeof value !== "object") return;
    const input = value as AutomaticRunActivity;
    if (!(input.relativePath === null || (typeof input.relativePath === "string" && input.relativePath.length <= 4096 && !input.relativePath.includes("\0"))) || typeof input.dirty !== "boolean" || typeof input.blocked !== "boolean" || typeof input.focused !== "boolean") return;
    controller.observeActivity(input);
  };
  const dismiss = (event: Electron.IpcMainEvent) => { if (trusted(event)) controller.dismiss(); };
  ipcMain.on(AUTOMATIC_RUN_CHANNELS.activity, activity);
  ipcMain.on(AUTOMATIC_RUN_CHANNELS.dismiss, dismiss);
  const timer = setInterval(() => {
    if (!getWindow()) { if (controller.getState().enabled) reset(); return; }
    void controller.tick();
  }, 250);
  return {
    controller, reset,
    setWorkspace: (root: string, senderId: number) => { reset(); workspace = { root, senderId }; },
    clearWorkspace: () => { reset(); workspace = null; },
    cleanup: () => {
      reset(); clearInterval(timer);
      ipcMain.removeHandler(AUTOMATIC_RUN_CHANNELS.configure); ipcMain.removeHandler(AUTOMATIC_RUN_CHANNELS.getState);
      ipcMain.removeListener(AUTOMATIC_RUN_CHANNELS.activity, activity); ipcMain.removeListener(AUTOMATIC_RUN_CHANNELS.dismiss, dismiss);
    },
  };
}
