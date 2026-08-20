import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  WORKSPACE_CHANNELS,
  type IpcResult,
  type FileReadResult,
  type FileWriteResult,
  type OpenWorkspace,
  type WorkspaceEntry,
  type WorkspaceMutationResult,
} from "../shared/workspace";
import {
  prepareWorkspaceRoot,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  readWorkspaceDirectory,
  readWorkspaceTextFile,
  renameWorkspaceEntry,
  writeWorkspaceTextFile,
  WorkspaceAccessError,
  WorkspaceFileError,
  WorkspaceFileWriteError,
  WorkspaceMutationError,
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

function publicFileError(error: unknown): FileReadResult {
  if (error instanceof WorkspaceFileError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof WorkspaceAccessError) {
    return {
      ok: false,
      error: "This file is outside the selected workspace or is unavailable.",
      code: "access_denied",
    };
  }
  return {
    ok: false,
    error: "The file could not be read.",
    code: "read_error",
  };
}

function publicFileWriteError(error: unknown): FileWriteResult {
  if (error instanceof WorkspaceFileWriteError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof WorkspaceAccessError) {
    return {
      ok: false,
      error: "This file is outside the selected workspace or is unavailable.",
      code: "access_denied",
    };
  }
  return {
    ok: false,
    error: "The file could not be saved.",
    code: "write_error",
  };
}

function publicMutationError<T>(error: unknown): WorkspaceMutationResult<T> {
  if (error instanceof WorkspaceMutationError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof WorkspaceAccessError) {
    return {
      ok: false,
      error: "This operation is outside the selected workspace or is unavailable.",
      code: "access_denied",
    };
  }
  return {
    ok: false,
    error: "The workspace operation could not be completed.",
    code: "operation_error",
  };
}

function authorizedRoot(event: IpcMainInvokeEvent): string | null {
  return workspaceAuthorization?.webContentsId === event.sender.id
    ? workspaceAuthorization.rootPath
    : null;
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

  ipcMain.handle(
    WORKSPACE_CHANNELS.readFile,
    async (event, relativePath: unknown): Promise<FileReadResult> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return {
          ok: false,
          error: "Workspace request was rejected.",
          code: "access_denied",
        };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) {
        return {
          ok: false,
          error: "Open a project folder first.",
          code: "access_denied",
        };
      }

      try {
        return {
          ok: true,
          value: await readWorkspaceTextFile(rootPath, relativePath),
        };
      } catch (error) {
        return publicFileError(error);
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.writeFile,
    async (event, request: unknown): Promise<FileWriteResult> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return {
          ok: false,
          error: "Workspace request was rejected.",
          code: "access_denied",
        };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) {
        return {
          ok: false,
          error: "Open a project folder first.",
          code: "access_denied",
        };
      }

      try {
        return {
          ok: true,
          value: await writeWorkspaceTextFile(rootPath, request),
        };
      } catch (error) {
        return publicFileWriteError(error);
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.createEntry,
    async (event, request: unknown): Promise<WorkspaceMutationResult<WorkspaceEntry>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Workspace request was rejected.", code: "access_denied" };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) {
        return { ok: false, error: "Open a project folder first.", code: "access_denied" };
      }
      try {
        return { ok: true, value: await createWorkspaceEntry(rootPath, request) };
      } catch (error) {
        return publicMutationError(error);
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.renameEntry,
    async (event, request: unknown): Promise<WorkspaceMutationResult<WorkspaceEntry>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Workspace request was rejected.", code: "access_denied" };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) {
        return { ok: false, error: "Open a project folder first.", code: "access_denied" };
      }
      try {
        return { ok: true, value: await renameWorkspaceEntry(rootPath, request) };
      } catch (error) {
        return publicMutationError(error);
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.deleteEntry,
    async (
      event,
      relativePath: unknown
    ): Promise<WorkspaceMutationResult<{ relativePath: string }>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Workspace request was rejected.", code: "access_denied" };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) {
        return { ok: false, error: "Open a project folder first.", code: "access_denied" };
      }
      try {
        return { ok: true, value: await deleteWorkspaceEntry(rootPath, relativePath) };
      } catch (error) {
        return publicMutationError(error);
      }
    }
  );
}
