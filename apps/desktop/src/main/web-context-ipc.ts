import { ipcMain, type BrowserWindow } from "electron";
import { WEB_CONTEXT_CHANNELS } from "../shared/web-context-bridge.ts";
import { LocalWebContextBridge } from "./web-context-bridge.ts";

export function registerWebContextIpc(getWindow: () => BrowserWindow | null) {
  let workspaceWebContentsId: number | null = null;
  const trustedWindow = () => {
    const window = getWindow();
    return window && !window.isDestroyed() && window.webContents.id === workspaceWebContentsId ? window : null;
  };
  const bridge = new LocalWebContextBridge({
    canAccept: () => Boolean(trustedWindow()),
    onContext: (item) => trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.received, item),
    onStatusChanged: (status) => trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.status, status),
  });
  ipcMain.handle(WEB_CONTEXT_CHANNELS.status, (event) => event.sender.id === trustedWindow()?.webContents.id ? bridge.status() : { available: false, paired: false, pairingCode: null, port: null, message: "Chrome bridge request denied." });
  void bridge.start();
  return {
    controller: {
      setWorkspace: (webContentsId: number) => { workspaceWebContentsId = webContentsId; trustedWindow()?.webContents.send(WEB_CONTEXT_CHANNELS.status, bridge.status()); },
      clearWorkspace: (webContentsId?: number) => { if (!webContentsId || workspaceWebContentsId === webContentsId) workspaceWebContentsId = null; },
    },
    cleanup: async () => { ipcMain.removeHandler(WEB_CONTEXT_CHANNELS.status); await bridge.stop(); },
  };
}
