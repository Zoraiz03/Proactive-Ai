import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { MULTI_FILE_CHANNELS, normalizeMultiFileLimits, parseMultiFilePlan, type MultiFileApplyRequest, type MultiFileGenerateRequest, type MultiFileOutcomeRequest, type MultiFilePlanRequest } from "../shared/multi-file-change.ts";
import { validateObserverRequest } from "../shared/observer.ts";
import type { ProjectContextPackage } from "../shared/project-context.ts";
import { recentProjectId } from "./recent-projects.ts";
import { MultiFileApiClient } from "./multi-file-client.ts";
import { MultiFileChangeService } from "./multi-file-service.ts";

export function registerMultiFileIpc(getWindow: () => BrowserWindow | null, getAccessToken: () => Promise<string | null>, apiBaseUrl: string, userDataPath: string, authorizeContext: (webContentsId: number, context: ProjectContextPackage) => boolean) {
  const client = new MultiFileApiClient(apiBaseUrl, getAccessToken); const service = new MultiFileChangeService(userDataPath);
  let workspace: { rootPath: string; webContentsId: number } | null = null;
  let approved: { planId: string; plan: unknown; bases: unknown; webContentsId: number } | null = null;
  let generated: { plan: unknown; changeSet: unknown; limits: unknown; webContentsId: number } | null = null;
  const trusted = (event: IpcMainInvokeEvent) => { const window = getWindow(); return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window && workspace?.webContentsId === event.sender.id); };
  const wrap = async <T>(operation: () => Promise<T>) => { try { return { ok: true as const, value: await operation() }; } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Multi-file operation failed." }; } };

  ipcMain.handle(MULTI_FILE_CHANNELS.plan, (event, value: MultiFilePlanRequest) => wrap(async () => {
    if (!trusted(event)) throw new Error("Multi-file plan request was rejected."); const context = validateObserverRequest(value?.context); const limits = normalizeMultiFileLimits(value?.limits);
    if (!context?.contextPackage || context.mode !== "plan_multi_file" || !limits || typeof value.userRequest !== "string" || value.userRequest.trim().length < 3 || value.userRequest.length > 500 || !authorizeContext(event.sender.id, context.contextPackage)) throw new Error("Multi-file plan context is invalid or changed after preview.");
    const result = await client.plan({ ...value, userRequest: value.userRequest.trim(), context, limits }); if (!result.ok) throw new Error(result.error);
    await service.prepare(workspace!.rootPath, result.value.plan, limits); approved = null; generated = null; return result.value;
  }));
  ipcMain.handle(MULTI_FILE_CHANNELS.prepare, (event, rawPlan: unknown, rawLimits: unknown) => wrap(async () => {
    if (!trusted(event)) throw new Error("Plan approval was rejected."); const limits = normalizeMultiFileLimits(rawLimits); const plan = limits ? parseMultiFilePlan(rawPlan, limits) : null; if (!plan) throw new Error("The approved plan is invalid.");
    const bases = await service.prepare(workspace!.rootPath, plan, limits!); approved = { planId: plan.planId, plan, bases, webContentsId: event.sender.id }; generated = null; return bases;
  }));
  ipcMain.handle(MULTI_FILE_CHANNELS.generate, (event, value: MultiFileGenerateRequest) => wrap(async () => {
    if (!trusted(event) || !approved || approved.webContentsId !== event.sender.id || approved.planId !== value?.plan?.planId || JSON.stringify(approved.plan) !== JSON.stringify(value.plan) || JSON.stringify(approved.bases) !== JSON.stringify(value.fileBases)) throw new Error("Approve the unchanged plan before generating its change set.");
    const context = validateObserverRequest(value.context); const limits = normalizeMultiFileLimits(value.limits); if (!context?.contextPackage || context.mode !== "plan_multi_file" || !limits || !authorizeContext(event.sender.id, context.contextPackage)) throw new Error("Generation context is invalid or stale.");
    const result = await client.generate({ ...value, context, limits }); if (!result.ok) throw new Error(result.error);
    generated = { plan: value.plan, changeSet: result.value.changeSet, limits, webContentsId: event.sender.id };
    return result.value;
  }));
  ipcMain.handle(MULTI_FILE_CHANNELS.apply, (event, value: MultiFileApplyRequest) => wrap(async () => {
    const limits = normalizeMultiFileLimits(value?.limits);
    if (!trusted(event) || recentProjectId(workspace!.rootPath) !== value?.workspaceId || !limits || !Array.isArray(value.dirtyPaths) || value.dirtyPaths.length > 1_000 || !value.dirtyPaths.every((item) => typeof item === "string" && item.length <= 4096) || !Number.isInteger(value.checkpointRetentionLimit) || value.checkpointRetentionLimit < 1 || value.checkpointRetentionLimit > 100) throw new Error("The selected workspace or apply options changed before apply.");
    if (!generated || generated.webContentsId !== event.sender.id || JSON.stringify(generated.plan) !== JSON.stringify(value.plan) || JSON.stringify(generated.changeSet) !== JSON.stringify(value.changeSet) || JSON.stringify(generated.limits) !== JSON.stringify(limits)) throw new Error("Only the complete, reviewed generated change set can be applied.");
    const result = await service.apply(workspace!.rootPath, { ...value, limits }); generated = null; approved = null; return result;
  }));
  ipcMain.handle(MULTI_FILE_CHANNELS.undo, (event, request: unknown) => wrap(async () => {
    const value = request as { workspaceId?: unknown; dirtyPaths?: unknown } | null;
    if (!trusted(event) || typeof value?.workspaceId !== "string" || !Array.isArray(value.dirtyPaths) || value.dirtyPaths.length > 1_000 || !value.dirtyPaths.every((item) => typeof item === "string" && item.length <= 4096) || recentProjectId(workspace!.rootPath) !== value.workspaceId) throw new Error("The selected workspace changed before rollback.");
    return service.undo(workspace!.rootPath, value.workspaceId, value.dirtyPaths);
  }));
  ipcMain.handle(MULTI_FILE_CHANNELS.outcome, (event, value: MultiFileOutcomeRequest) => wrap(async () => { if (!trusted(event)) throw new Error("Outcome logging was rejected."); const result = await client.outcome(value); if (!result.ok) throw new Error(result.error); }));

  return { controller: { setWorkspace: (rootPath: string, webContentsId: number) => { workspace = { rootPath, webContentsId }; approved = null; generated = null; }, clearWorkspace: (webContentsId?: number) => { if (!webContentsId || workspace?.webContentsId === webContentsId) { workspace = null; approved = null; generated = null; } } }, cleanup: () => Object.values(MULTI_FILE_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel)) };
}
