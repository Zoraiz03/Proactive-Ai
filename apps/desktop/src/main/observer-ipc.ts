import { BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  OBSERVER_CHANNELS,
  validateObserverPrepareRequest,
  validateObserverOutcome,
  validateObserverRequest,
} from "../shared/observer";
import { ObserverApiClient } from "./observer-client";
import { ProjectContextEngine, redactProjectSecrets } from "./project-context";
import type { ObserverRequest } from "../shared/observer";
import type { ProjectContextPackage } from "../shared/project-context";
import { createHash } from "node:crypto";
import { isEditableObserverMode } from "../shared/ai-edit";
import { validateDocumentationDraftRequest } from "../shared/documentation-update";

function isTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): boolean {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
}

export function registerObserverIpc(
  getMainWindow: () => BrowserWindow | null,
  getAccessToken: () => Promise<string | null>,
  apiBaseUrl: string
): { controller: ObserverContextController; cleanup: () => void } {
  const client = new ObserverApiClient(apiBaseUrl, getAccessToken);
  const controller = new ObserverContextController();

  ipcMain.handle(OBSERVER_CHANNELS.prepare, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: "Observer context request was rejected." };
    const request = validateObserverPrepareRequest(value);
    if (!request) return { ok: false, error: "Observer context options are invalid." };
    try { return { ok: true, value: await controller.prepare(event.sender.id, request) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Observer context could not be built." }; }
  });

  ipcMain.handle(OBSERVER_CHANNELS.ask, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer request was rejected." };
    }
    const request = validateObserverRequest(value);
    if (!request) return { ok: false, error: "Observer context is invalid or unsafe." };
    if (request.contextPackage && !controller.authorize(event.sender.id, request.contextPackage)) {
      return { ok: false, error: "Observer context changed after preview. Build the preview again." };
    }
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

  ipcMain.handle(OBSERVER_CHANNELS.documentationDraft, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: "Documentation draft request was rejected." };
    const request = validateDocumentationDraftRequest(value);
    if (!request) return { ok: false, error: "Documentation update context is invalid or unsafe." };
    return client.documentationDraft(request);
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
    controller,
    cleanup: () => {
      controller.clearWorkspace();
      ipcMain.removeHandler(OBSERVER_CHANNELS.prepare);
      ipcMain.removeHandler(OBSERVER_CHANNELS.ask);
      ipcMain.removeHandler(OBSERVER_CHANNELS.outcome);
      ipcMain.removeHandler(OBSERVER_CHANNELS.copy);
      ipcMain.removeHandler(OBSERVER_CHANNELS.documentationDraft);
    },
  };
}

export class ObserverContextController {
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private prepared: ProjectContextPackage | null = null;
  readonly engine = new ProjectContextEngine();
  setWorkspace(rootPath: string, webContentsId: number) { this.workspace = { rootPath, webContentsId }; this.prepared = null; this.engine.setWorkspace(rootPath); }
  clearWorkspace(webContentsId?: number) { if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return; this.workspace = null; this.prepared = null; this.engine.clearWorkspace(); }
  invalidate() { this.prepared = null; this.engine.invalidate(); }
  async prepare(webContentsId: number, request: import("../shared/observer").ObserverPrepareRequest): Promise<ObserverRequest> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) throw new Error("Open a workspace before asking Observer.");
    const contextPackage = await this.engine.build(request.seed);
    this.prepared = contextPackage;
    const source = contextPackage.items.some((item) => item.type === "selected_code") ? "selection" : contextPackage.items.some((item) => item.type === "diagnostic") ? "diagnostic" : "cursor";
    return {
      provider: request.provider,
      ...(request.model ? { model: request.model } : {}),
      ...(request.storeHistory === false ? { storeHistory: false } : {}),
      mode: request.seed.mode,
      kind: request.seed.kind,
      fileName: request.seed.fileName,
      language: request.seed.language,
      source,
      cursorLine: request.seed.cursorLine,
      cursorColumn: request.seed.cursorColumn,
      contextPackage,
      ...(isEditableObserverMode(request.seed.mode) ? { editBase: {
        targetRelativePath: request.seed.activeRelativePath,
        originalContentHash: createHash("sha256").update(request.seed.content).digest("hex"),
        contentLength: request.seed.content.length,
        basedOnUnsavedContent: Boolean(request.seed.activeContentDirty),
      } } : {}),
    };
  }
  authorize(webContentsId: number, candidate: ProjectContextPackage): boolean {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId || !this.prepared) return false;
    if (candidate.version !== this.prepared.version || candidate.activeFile.relativePath !== this.prepared.activeFile.relativePath || candidate.intent.mode !== this.prepared.intent.mode) return false;
    const prepared = new Map(this.prepared.items.map((item) => [item.id, item]));
    if (candidate.items.some((item) => JSON.stringify(prepared.get(item.id)) !== JSON.stringify(item) || redactProjectSecrets(item.content).redacted || item.staleState === "stale" || item.staleState === "unavailable")) return false;
    const mandatoryIds = this.prepared.items.filter((item) => !item.optional).map((item) => item.id);
    return mandatoryIds.every((id) => candidate.items.some((item) => item.id === id));
  }
}
