import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn } from "node-pty";
import {
  TERMINAL_CHANNELS,
  type TerminalCreateRequest,
  type TerminalResult,
} from "../shared/terminal";
import { TerminalSessionController, type SpawnTerminal } from "./terminal-session";
import { createTerminalEnvironment, selectTerminalShell } from "./terminal-environment";

function isTrustedSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null
): boolean {
  const mainWindow = getMainWindow();
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      BrowserWindow.fromWebContents(event.sender) === mainWindow
  );
}

export function registerTerminalIpc(getMainWindow: () => BrowserWindow | null): {
  controller: TerminalSessionController;
  cleanup: () => void;
} {
  const spawnTerminal: SpawnTerminal = ({ cwd, cols, rows }) =>
    spawn(selectTerminalShell(process.platform, process.env), [], {
      name: "xterm-256color",
      cwd,
      cols,
      rows,
      env: createTerminalEnvironment(process.env),
    });
  const controller = new TerminalSessionController(spawnTerminal, {
    data: (webContentsId, event) => {
      const mainWindow = getMainWindow();
      if (mainWindow?.webContents.id === webContentsId && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TERMINAL_CHANNELS.data, event);
      }
    },
    exit: (webContentsId, event) => {
      const mainWindow = getMainWindow();
      if (mainWindow?.webContents.id === webContentsId && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(TERMINAL_CHANNELS.exit, event);
      }
    },
  });

  ipcMain.handle(
    TERMINAL_CHANNELS.create,
    (event, request: TerminalCreateRequest): TerminalResult<{ sessionId: string }> =>
      isTrustedSender(event, getMainWindow)
        ? controller.create(event.sender.id, request)
        : { ok: false, error: "Terminal request was rejected." }
  );
  ipcMain.handle(TERMINAL_CHANNELS.input, (event, request: unknown): TerminalResult =>
    isTrustedSender(event, getMainWindow)
      ? controller.input(event.sender.id, request)
      : { ok: false, error: "Terminal request was rejected." }
  );
  ipcMain.handle(TERMINAL_CHANNELS.resize, (event, request: unknown): TerminalResult =>
    isTrustedSender(event, getMainWindow)
      ? controller.resize(event.sender.id, request)
      : { ok: false, error: "Terminal request was rejected." }
  );
  ipcMain.handle(TERMINAL_CHANNELS.close, (event, request: unknown): TerminalResult =>
    isTrustedSender(event, getMainWindow)
      ? controller.close(event.sender.id, request)
      : { ok: false, error: "Terminal request was rejected." }
  );

  return {
    controller,
    cleanup: () => {
      controller.dispose();
      ipcMain.removeHandler(TERMINAL_CHANNELS.create);
      ipcMain.removeHandler(TERMINAL_CHANNELS.input);
      ipcMain.removeHandler(TERMINAL_CHANNELS.resize);
      ipcMain.removeHandler(TERMINAL_CHANNELS.close);
    },
  };
}
