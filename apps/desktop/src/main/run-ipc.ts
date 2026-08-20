import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { RUNNER_CHANNELS, type RunStartRequest, type RunStopRequest } from "../shared/runner";
import { RunSessionController } from "./run-session";

function isTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): boolean {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
}

export function registerRunIpc(getMainWindow: () => BrowserWindow | null): {
  controller: RunSessionController;
  cleanup: () => void;
} {
  const send = (channel: string, webContentsId: number, value: unknown) => {
    const window = getMainWindow();
    if (window?.webContents.id === webContentsId && !window.isDestroyed()) {
      window.webContents.send(channel, value);
    }
  };
  const controller = new RunSessionController({
    output: (id, event) => send(RUNNER_CHANNELS.output, id, event),
    complete: (id, event) => send(RUNNER_CHANNELS.complete, id, event),
  });

  ipcMain.handle(RUNNER_CHANNELS.start, (event, request: RunStartRequest) =>
    isTrustedSender(event, getMainWindow)
      ? controller.start(event.sender.id, request)
      : { ok: false, error: "Run request was rejected." }
  );
  ipcMain.handle(RUNNER_CHANNELS.stop, (event, request: RunStopRequest) =>
    isTrustedSender(event, getMainWindow)
      ? controller.stop(event.sender.id, request)
      : { ok: false, error: "Stop request was rejected." }
  );

  return {
    controller,
    cleanup: () => {
      controller.dispose();
      ipcMain.removeHandler(RUNNER_CHANNELS.start);
      ipcMain.removeHandler(RUNNER_CHANNELS.stop);
    },
  };
}
