import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { GIT_CHANNELS, validateGitDiffRequest } from "../shared/git.ts";
import type { IpcResult } from "../shared/workspace.ts";
import { GitExecutionError, GitRepositoryService } from "./git-service.ts";

function publicGitError(error: unknown): string {
  if (error instanceof GitExecutionError && error.code === "timeout") return "Git took too long to respond. Refresh and try again.";
  if (error instanceof GitExecutionError && error.code === "cancelled") return "Git operation cancelled.";
  return error instanceof Error && error.message === "Refresh Source Control before opening this diff."
    ? error.message
    : "Git information could not be loaded.";
}

export class GitWorkspaceController {
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private readonly service: GitRepositoryService;
  constructor(service = new GitRepositoryService()) { this.service = service; }
  setWorkspace(rootPath: string, webContentsId: number) { this.service.cancel(); this.workspace = { rootPath, webContentsId }; }
  clearWorkspace(webContentsId?: number) {
    if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return;
    this.service.cancel(); this.workspace = null;
  }
  async status(webContentsId: number) {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) return { ok: false, error: "Open a workspace before viewing Source Control." } as const;
    try { return { ok: true, value: await this.service.status(this.workspace.rootPath) } as const; }
    catch (error) { return { ok: false, error: publicGitError(error) } as const; }
  }
  async diff(webContentsId: number, value: unknown) {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) return { ok: false, error: "Open a workspace before viewing a diff." } as const;
    const request = validateGitDiffRequest(value);
    if (!request) return { ok: false, error: "The Git diff request was rejected." } as const;
    try { return { ok: true, value: await this.service.diff(this.workspace.rootPath, request.relativePath) } as const; }
    catch (error) { return { ok: false, error: publicGitError(error) } as const; }
  }
  cancel(webContentsId: number): IpcResult<void> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) return { ok: false, error: "No Git operation is active." };
    this.service.cancel(); return { ok: true, value: undefined };
  }
}

export function registerGitIpc(getWindow: () => BrowserWindow | null) {
  const controller = new GitWorkspaceController();
  const trusted = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
  };
  ipcMain.handle(GIT_CHANNELS.status, (event) => trusted(event) ? controller.status(event.sender.id) : { ok: false, error: "Git request denied." });
  ipcMain.handle(GIT_CHANNELS.diff, (event, value) => trusted(event) ? controller.diff(event.sender.id, value) : { ok: false, error: "Git request denied." });
  ipcMain.handle(GIT_CHANNELS.cancel, (event) => trusted(event) ? controller.cancel(event.sender.id) : { ok: false, error: "Git request denied." });
  return {
    controller,
    cleanup: () => {
      controller.clearWorkspace();
      ipcMain.removeHandler(GIT_CHANNELS.status);
      ipcMain.removeHandler(GIT_CHANNELS.diff);
      ipcMain.removeHandler(GIT_CHANNELS.cancel);
    },
  };
}
