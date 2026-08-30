import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
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
import { WorkspaceWatcher } from "./workspace-watcher";
import {
  SEARCH_CHANNELS,
  validateWorkspaceSearchRequest,
  type WorkspaceSearchCompletion,
} from "../shared/search";
import { WorkspaceSearchService } from "./workspace-search";
import {
  prepareRecentWorkspace,
  RecentProjectsStore,
  validateRecentId,
} from "./recent-projects";

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
  getMainWindow: () => BrowserWindow | null,
  lifecycle: {
    onWorkspaceOpened: (rootPath: string, webContentsId: number) => void;
    onWorkspaceClosed: (webContentsId?: number) => void;
  },
  userDataPath: string
): { clearWorkspace: () => Promise<void>; cleanup: () => Promise<void> } {
  let cleanupBoundWebContentsId: number | null = null;
  const watcher = new WorkspaceWatcher((batch) => {
    const mainWindow = getMainWindow();
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      workspaceAuthorization?.webContentsId === mainWindow.webContents.id
    ) {
      mainWindow.webContents.send(WORKSPACE_CHANNELS.changed, batch);
    }
  });
  const searchService = new WorkspaceSearchService();
  const recentProjects = new RecentProjectsStore(userDataPath);

  const activateWorkspace = async (
    rootPath: string,
    name: string,
    webContentsId: number,
    sender: WebContents
  ): Promise<OpenWorkspace> => {
    const entries = await readWorkspaceDirectory(rootPath, "");
    searchService.cancel();
    workspaceAuthorization = { rootPath, webContentsId };
    lifecycle.onWorkspaceOpened(rootPath, webContentsId);
    void watcher.start(rootPath).catch((error: unknown) => {
      console.error(
        "[desktop] workspace watcher failed:",
        error instanceof Error ? error.message : "Unknown watcher error"
      );
    });
    if (cleanupBoundWebContentsId !== webContentsId) {
      cleanupBoundWebContentsId = webContentsId;
      sender.once("destroyed", () => {
        if (workspaceAuthorization?.webContentsId === webContentsId) {
          workspaceAuthorization = null;
          void watcher.stop();
          lifecycle.onWorkspaceClosed(webContentsId);
        }
        if (cleanupBoundWebContentsId === webContentsId) cleanupBoundWebContentsId = null;
      });
    }
    await recentProjects.add(rootPath, name).catch((error: unknown) => {
      console.error(
        "[desktop] recent project metadata could not be saved:",
        error instanceof Error ? error.message : "Unknown storage error"
      );
    });
    return { name, entries };
  };

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
        return {
          ok: true,
          value: await activateWorkspace(
            selected.rootPath,
            selected.name,
            event.sender.id,
            event.sender
          ),
        };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.recentList,
    async (event) => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Recent projects request was rejected." };
      }
      try {
        return { ok: true, value: await recentProjects.listPublic() };
      } catch {
        return { ok: false, error: "Recent projects could not be loaded." };
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.reopenRecent,
    async (event, value: unknown): Promise<IpcResult<OpenWorkspace>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Recent project request was rejected." };
      }
      const id = validateRecentId(value);
      if (!id) return { ok: false, error: "This project is not in the recent projects list." };
      try {
        const selected = await prepareRecentWorkspace(recentProjects, id);
        return {
          ok: true,
          value: await activateWorkspace(
            selected.rootPath,
            selected.name,
            event.sender.id,
            event.sender
          ),
        };
      } catch {
        return {
          ok: false,
          error: "This project folder is missing or inaccessible. You can remove it from Recents.",
        };
      }
    }
  );

  ipcMain.handle(
    WORKSPACE_CHANNELS.removeRecent,
    async (event, value: unknown) => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Recent project request was rejected." };
      }
      const id = validateRecentId(value);
      if (!id) return { ok: false, error: "Recent project identifier is invalid." };
      try {
        return { ok: true, value: await recentProjects.remove(id) };
      } catch {
        return { ok: false, error: "The recent project could not be removed." };
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
        const value = await writeWorkspaceTextFile(rootPath, request);
        if (
          typeof request === "object" &&
          request !== null &&
          "relativePath" in request &&
          typeof request.relativePath === "string"
        ) {
          watcher.suppress([request.relativePath]);
        }
        return {
          ok: true,
          value,
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
        const value = await createWorkspaceEntry(rootPath, request);
        watcher.suppress([value.relativePath]);
        return { ok: true, value };
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
        const value = await renameWorkspaceEntry(rootPath, request);
        const oldRelativePath =
          typeof request === "object" &&
          request !== null &&
          "relativePath" in request &&
          typeof request.relativePath === "string"
            ? request.relativePath
            : "";
        watcher.suppress([oldRelativePath, value.relativePath]);
        return { ok: true, value };
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
        const value = await deleteWorkspaceEntry(rootPath, relativePath);
        watcher.suppress([value.relativePath]);
        return { ok: true, value };
      } catch (error) {
        return publicMutationError(error);
      }
    }
  );

  ipcMain.handle(
    SEARCH_CHANNELS.start,
    async (event, value: unknown): Promise<IpcResult<WorkspaceSearchCompletion>> => {
      if (!isTrustedSender(event, getMainWindow)) {
        return { ok: false, error: "Search request was rejected." };
      }
      const rootPath = authorizedRoot(event);
      if (!rootPath) return { ok: false, error: "Open a project folder first." };
      const request = validateWorkspaceSearchRequest(value);
      if (!request) return { ok: false, error: "Search options are invalid." };
      try {
        const value = await searchService.search(rootPath, request, (batch) => {
          const mainWindow = getMainWindow();
          if (
            mainWindow && !mainWindow.isDestroyed() &&
            mainWindow.webContents.id === event.sender.id &&
            authorizedRoot(event) === rootPath
          ) mainWindow.webContents.send(SEARCH_CHANNELS.batch, batch);
        });
        return { ok: true, value };
      } catch {
        return {
          ok: false,
          error: request.regularExpression
            ? "The regular expression is invalid or unsupported."
            : "Workspace search could not be completed.",
        };
      }
    }
  );

  ipcMain.handle(
    SEARCH_CHANNELS.cancel,
    async (event, searchId: unknown): Promise<IpcResult<void>> => {
      if (!isTrustedSender(event, getMainWindow) || !authorizedRoot(event)) {
        return { ok: false, error: "Search request was rejected." };
      }
      if (searchId !== undefined && (typeof searchId !== "string" || searchId.length > 80)) {
        return { ok: false, error: "Search cancellation is invalid." };
      }
      searchService.cancel(searchId);
      return { ok: true, value: undefined };
    }
  );

  const clearWorkspace = async () => {
    const webContentsId = workspaceAuthorization?.webContentsId;
    workspaceAuthorization = null;
    cleanupBoundWebContentsId = null;
    lifecycle.onWorkspaceClosed(webContentsId);
    searchService.cancel();
    await watcher.stop();
  };

  return {
    clearWorkspace,
    cleanup: async () => {
      await clearWorkspace();
      ipcMain.removeHandler(WORKSPACE_CHANNELS.openFolder);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.recentList);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.reopenRecent);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.removeRecent);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.readDirectory);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.readFile);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.writeFile);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.createEntry);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.renameEntry);
      ipcMain.removeHandler(WORKSPACE_CHANNELS.deleteEntry);
      ipcMain.removeHandler(SEARCH_CHANNELS.start);
      ipcMain.removeHandler(SEARCH_CHANNELS.cancel);
    },
  };
}
