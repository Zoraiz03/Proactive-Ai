import { BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  OBSERVER_CHANNELS,
  validateObserverOutcome,
  validateObserverRequest,
} from "../shared/observer";
import { ObserverApiClient } from "./observer-client";

function isTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): boolean {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
}

export function registerObserverIpc(
  getMainWindow: () => BrowserWindow | null,
  getAccessToken: () => Promise<string | null>,
  apiBaseUrl: string
): { cleanup: () => void } {
  const client = new ObserverApiClient(apiBaseUrl, getAccessToken);

  ipcMain.handle(OBSERVER_CHANNELS.ask, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer request was rejected." };
    }
    const request = validateObserverRequest(value);
    if (!request) return { ok: false, error: "Observer context is invalid or unsafe." };
    return client.ask(request);
  });

  ipcMain.handle(OBSERVER_CHANNELS.outcome, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer outcome was rejected." };
    }
    const request = validateObserverOutcome(value);
    if (!request) return { ok: false, error: "Observer outcome is invalid." };
    return client.recordOutcome(request);
  });

  ipcMain.handle(OBSERVER_CHANNELS.copy, (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer copy request was rejected." };
    }
    if (typeof value !== "string" || !value || value.length > 50_000) {
      return { ok: false, error: "Observer snippet is invalid." };
    }
    clipboard.writeText(value);
    return { ok: true, value: undefined };
  });

  return {
    cleanup: () => {
      ipcMain.removeHandler(OBSERVER_CHANNELS.ask);
      ipcMain.removeHandler(OBSERVER_CHANNELS.outcome);
      ipcMain.removeHandler(OBSERVER_CHANNELS.copy);
    },
  };
}
