import { join } from "node:path";
import { BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import { WEB_CONTEXT_CHANNELS, type WebContextActionResult, type WebContextBridgeStatus } from "../shared/web-context-bridge.ts";
import type { SessionEncryption } from "./auth-session-store.ts";
import { LocalWebContextBridge } from "./web-context-bridge.ts";
import { EncryptedWebContextStore } from "./web-context-store.ts";

declare const __DESKTOP_CHROME_EXTENSION_ORIGIN__: string;

const encryption = (): SessionEncryption => ({
  isAvailable: async () => (await safeStorage.isAsyncEncryptionAvailable()) && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
  encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
  decrypt: async (encrypted) => { const result = await safeStorage.decryptStringAsync(encrypted); return { value: result.result, shouldReEncrypt: result.shouldReEncrypt }; },
});

export function registerWebContextIpc(getWindow: () => BrowserWindow | null, userDataPath: string) {
  let workspaceWebContentsId: number | null = null;
  const trustedWindow = () => { const window = getWindow(); return window && !window.isDestroyed() && window.webContents.id === workspaceWebContentsId ? window : null; };
  const trusted = (event: IpcMainInvokeEvent) => event.sender.id === trustedWindow()?.webContents.id;
  const bridge = new LocalWebContextBridge({
    canAccept: () => Boolean(trustedWindow()),
    store: new EncryptedWebContextStore(join(userDataPath, "browser-integration", "pairing.enc"), encryption()),
    expectedOrigin: __DESKTOP_CHROME_EXTENSION_ORIGIN__.trim() || undefined,
    onPendingChanged: (item) => trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.pending, item),
    onStatusChanged: (status) => trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.status, status),
  });
  const denied: WebContextBridgeStatus = { available: false, enabled: false, paired: false, connected: false, pairingCode: null, pairingExpiresAt: null, pairedDevice: null, port: null, message: "Chrome bridge request denied." };
  const action = async (event: IpcMainInvokeEvent, operation: () => Promise<void> | void): Promise<WebContextActionResult> => { if (!trusted(event)) return { ok: false, error: "Browser integration request denied." }; try { await operation(); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Browser integration action failed." }; } };
  ipcMain.handle(WEB_CONTEXT_CHANNELS.status, (event) => trusted(event) ? bridge.status() : denied);
  ipcMain.handle(WEB_CONTEXT_CHANNELS.setEnabled, (event, enabled: unknown) => action(event, () => { if (typeof enabled !== "boolean") throw new Error("Invalid integration setting."); return bridge.setEnabled(enabled); }));
  ipcMain.handle(WEB_CONTEXT_CHANNELS.startPairing, (event) => action(event, () => bridge.startPairing()));
  ipcMain.handle(WEB_CONTEXT_CHANNELS.cancelPairing, (event) => action(event, () => bridge.cancelPairing()));
  ipcMain.handle(WEB_CONTEXT_CHANNELS.revoke, (event) => action(event, () => bridge.revoke()));
  ipcMain.handle(WEB_CONTEXT_CHANNELS.accept, async (event, transferId: unknown): Promise<WebContextActionResult> => { if (!trusted(event) || typeof transferId !== "string") return { ok: false, error: "Incoming context request denied." }; try { const item = await bridge.accept(transferId); trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.received, item); return { ok: true, item }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not add incoming selection." }; } });
  ipcMain.handle(WEB_CONTEXT_CHANNELS.reject, (event, transferId: unknown) => action(event, () => { if (typeof transferId !== "string") throw new Error("Invalid transfer."); bridge.reject(transferId); }));
  void bridge.initialize();
  return {
    controller: { setWorkspace: (webContentsId: number) => { workspaceWebContentsId = webContentsId; trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.status, bridge.status()); }, clearWorkspace: (webContentsId?: number) => { if (!webContentsId || workspaceWebContentsId === webContentsId) workspaceWebContentsId = null; } },
    cleanup: async () => { for (const channel of [WEB_CONTEXT_CHANNELS.status, WEB_CONTEXT_CHANNELS.setEnabled, WEB_CONTEXT_CHANNELS.startPairing, WEB_CONTEXT_CHANNELS.cancelPairing, WEB_CONTEXT_CHANNELS.revoke, WEB_CONTEXT_CHANNELS.accept, WEB_CONTEXT_CHANNELS.reject]) ipcMain.removeHandler(channel); await bridge.stop(); },
  };
}
