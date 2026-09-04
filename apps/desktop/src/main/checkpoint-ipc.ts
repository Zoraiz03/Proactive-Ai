import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { CHECKPOINT_CHANNELS, type CreateCheckpointRequest, type RestoreCheckpointRequest } from "../shared/checkpoints";
import { recentProjectId } from "./recent-projects";
import { CheckpointStore } from "./checkpoint-store";

export function registerCheckpointIpc(getAuthenticatedWindow: () => BrowserWindow | null, userDataPath: string) {
  const store = new CheckpointStore(userDataPath);
  let workspace: { rootPath: string; webContentsId: number } | null = null;
  const authorize = (event: IpcMainInvokeEvent, workspaceId?: string) => {
    const window = getAuthenticatedWindow();
    if (!window || window.webContents.id !== event.sender.id) throw new Error("Sign in to manage Observer checkpoints.");
    if (workspaceId && (!workspace || workspace.webContentsId !== event.sender.id || recentProjectId(workspace.rootPath) !== workspaceId)) throw new Error("The selected workspace is no longer available.");
  };
  const wrap = <T>(operation: () => Promise<T>) => operation().then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Checkpoint operation failed." }));

  ipcMain.handle(CHECKPOINT_CHANNELS.create, (event, request: CreateCheckpointRequest) => wrap(async () => {
    authorize(event, request?.workspaceId);
    return store.create({ workspaceId: request.workspaceId, relativePath: request.relativePath, previousContent: request.previousContent,
      previousContentHash: request.previousContentHash, appliedContentHash: request.appliedContentHash,
      ...(request.suggestionId ? { suggestionId: request.suggestionId } : {}) }, request.retentionLimit);
  }));
  ipcMain.handle(CHECKPOINT_CHANNELS.restore, (event, request: RestoreCheckpointRequest) => wrap(async () => {
    authorize(event, request?.workspaceId);
    return store.restore(request.workspaceId, request.relativePath, request.currentContentHash);
  }));
  ipcMain.handle(CHECKPOINT_CHANNELS.clear, (event) => wrap(async () => { authorize(event); await store.clear(); }));

  return {
    controller: {
      setWorkspace: (rootPath: string, webContentsId: number) => { workspace = { rootPath, webContentsId }; },
      clearWorkspace: (webContentsId?: number) => { if (!webContentsId || workspace?.webContentsId === webContentsId) workspace = null; },
    },
    cleanup: () => Object.values(CHECKPOINT_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel)),
  };
}
