import { ipcMain, type BrowserWindow } from "electron";
import { OBSERVER_PROVIDERS, type ObserverProvider } from "../shared/observer.ts";
import { SETTINGS_CHANNELS, type SaveApiKeyRequest } from "../shared/settings.ts";
import { clearLocalObserverHistory, LocalSettingsStore, ProactiveFeedbackStore, WorkspaceTabStore } from "./settings-store.ts";
import { SettingsApiClient } from "./settings-client.ts";

export function registerSettingsIpc(
  getWindow: () => BrowserWindow | null,
  userDataPath: string,
  getAccessToken: () => Promise<string | null>,
  apiBaseUrl: string
) {
  const store = new LocalSettingsStore(userDataPath);
  const tabStore = new WorkspaceTabStore(userDataPath);
  const feedbackStore = new ProactiveFeedbackStore(userDataPath);
  const client = new SettingsApiClient(apiBaseUrl, getAccessToken);
  const trusted = (event: Electron.IpcMainInvokeEvent) => event.sender === getWindow()?.webContents;
  const local = async <T>(event: Electron.IpcMainInvokeEvent, action: () => Promise<T>) => {
    if (!trusted(event)) return { ok: false, error: "Settings request denied." } as const;
    try { return { ok: true, value: await action() } as const; }
    catch { return { ok: false, error: "Could not update local settings." } as const; }
  };
  ipcMain.handle(SETTINGS_CHANNELS.getLocal, (event) => local(event, () => store.get()));
  ipcMain.handle(SETTINGS_CHANNELS.updateLocal, (event, value) => local(event, () => store.set(value)));
  ipcMain.handle(SETTINGS_CHANNELS.resetLocal, (event) => local(event, () => store.reset()));
  ipcMain.handle(SETTINGS_CHANNELS.getSynced, (event) => trusted(event) ? client.getSynced() : { ok: false, error: "Settings request denied." });
  ipcMain.handle(SETTINGS_CHANNELS.updateSynced, (event, value) => trusted(event) ? client.updateSynced(value) : { ok: false, error: "Settings request denied." });
  ipcMain.handle(SETTINGS_CHANNELS.providerStatus, (event) => trusted(event) ? client.providerStatus() : { ok: false, error: "Settings request denied." });
  ipcMain.handle(SETTINGS_CHANNELS.saveKey, (event, value: SaveApiKeyRequest) => {
    const valid = value && OBSERVER_PROVIDERS.includes(value.provider as ObserverProvider) &&
      typeof value.apiKey === "string" && value.apiKey.trim().length > 0 && value.apiKey.length <= 500 && typeof value.verify === "boolean";
    return trusted(event) && valid ? client.saveApiKey({ ...value, apiKey: value.apiKey.trim() }) : { ok: false, error: "Invalid API-key request." };
  });
  ipcMain.handle(SETTINGS_CHANNELS.deleteKey, (event, provider: unknown) => trusted(event) && typeof provider === "string" && ["gemini", "openai", "deepseek", "anthropic"].includes(provider)
    ? client.deleteApiKey(provider as Exclude<ObserverProvider, "demo">) : { ok: false, error: "Invalid provider." });
  ipcMain.handle(SETTINGS_CHANNELS.clearObserverHistory, (event) => local(event, async () => { await clearLocalObserverHistory(userDataPath); }));
  ipcMain.handle(SETTINGS_CHANNELS.getWorkspaceTabs, (event, workspaceId: string) => local(event, () => tabStore.get(workspaceId)));
  ipcMain.handle(SETTINGS_CHANNELS.saveWorkspaceTabs, async (event, workspaceId: string, paths: string[]) => {
    if (!trusted(event)) return { ok: false, error: "Settings request denied." };
    try { await tabStore.set(workspaceId, paths); return { ok: true, value: undefined }; }
    catch { return { ok: false, error: "Could not save open-tab metadata." }; }
  });
  ipcMain.handle(SETTINGS_CHANNELS.recordProactiveFeedback, (event, value) => local(event, () => feedbackStore.append(value)));
  return { cleanup: () => Object.values(SETTINGS_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel)) };
}
