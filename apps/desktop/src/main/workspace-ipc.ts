import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  WORKSPACE_CHANNELS,
  type IpcResult,
  type OpenWorkspace,
  type WorkspaceEntry,
} from "../shared/workspace";
import {
  prepareWorkspaceRoot,
  readWorkspaceDirectory,
  WorkspaceAccessError,
} from "./workspace-files";

let workspaceAuthorization: {
  rootPath: string;
  webContentsId: number;
} | null = null;

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

function publicError(error: unknown): string {
  return error instanceof WorkspaceAccessError
    ? error.message
    : "The folder could not be read.";
}

export function registerWorkspaceIpc(
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    WORKSPACE_CHANNELS.openFolder,
    async (event): Promise<IpcResult<OpenWorkspace | null>> => {
      const mainWindow = getMainWindow();
      if (!mainWindow || !isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Workspace request was rejected." };
      }

      try {
        const selection = await dialog.showOpenDialog(mainWindow, {
          title: "Open Project Folder",
          buttonLabel: "Open Folder",
          properties: ["openDirectory"],
        });
        if (selection.canceled || !selection.filePaths[0]) {
          return { ok: true, value: null };
        }

        const selected = await prepareWorkspaceRoot(selection.filePaths[0]);
        const entries = await readWorkspaceDirectory(selected.rootPath, "");
        workspaceAuthorization = {
          rootPath: selected.rootPath,
          webContentsId: event.sender.id,
        };
        return { ok: true, value: { name: selected.name, entries } };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.readDirectory,
    async (event, relativePath: unknown): Promise<IpcResult<WorkspaceEntry[]>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Workspace request was rejected." };
      }
      if (
        !workspaceAuthorization ||
        workspaceAuthorization.webContentsId !== event.sender.id
      ) {
        return { ok: false, error: "Open a project folder first." };
      }

      try {
        return {
          ok: true,
          value: await readWorkspaceDirectory(
            workspaceAuthorization.rootPath,
            relativePath
          ),
        };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    }
  );
}
