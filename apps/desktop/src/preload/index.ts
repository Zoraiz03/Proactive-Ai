import { contextBridge, ipcRenderer } from "electron";
import { AUTOMATIC_RUN_CHANNELS, type AutomaticRunBridge, type AutomaticRunActivity, type AutomaticRunState } from "../shared/automatic-run";
import type { ObserverProvider } from "../shared/observer";

const automaticRunBridge: AutomaticRunBridge = Object.freeze({
  configure: (enabled: boolean, provider: ObserverProvider) => ipcRenderer.invoke(AUTOMATIC_RUN_CHANNELS.configure, enabled, provider),
  activity: (activity: AutomaticRunActivity) => ipcRenderer.send(AUTOMATIC_RUN_CHANNELS.activity, activity),
  dismiss: () => ipcRenderer.send(AUTOMATIC_RUN_CHANNELS.dismiss),
  getState: () => ipcRenderer.invoke(AUTOMATIC_RUN_CHANNELS.getState),
  onState: (listener: (state: AutomaticRunState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AutomaticRunState) => listener(state);
    ipcRenderer.on(AUTOMATIC_RUN_CHANNELS.state, wrapped);
    return () => ipcRenderer.removeListener(AUTOMATIC_RUN_CHANNELS.state, wrapped);
  },
});
contextBridge.exposeInMainWorld("automaticRun", automaticRunBridge);
import {
  WORKSPACE_CHANNELS,
  type FileWriteRequest,
  type CreateWorkspaceEntryRequest,
  type RenameWorkspaceEntryRequest,
  type WorkspaceChangeBatch,
  type WorkspaceBridge,
} from "../shared/workspace";
import {
  TERMINAL_CHANNELS,
  type TerminalBridge,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalInputRequest,
  type TerminalResizeRequest,
} from "../shared/terminal";
import {
  RUNNER_CHANNELS,
  type RunCompleteEvent,
  type RunOutputEvent,
  type RunnerBridge,
  type RunStartRequest,
  type RunStopRequest,
} from "../shared/runner";
import {
  AUTH_CHANNELS,
  type DesktopAuthBridge,
  type DesktopAuthState,
  type DesktopSignInRequest,
} from "../shared/auth";
import {
  OBSERVER_CHANNELS,
  type ObserverBridge,
  type ObserverOutcomeRequest,
  type ObserverRequest,
  type ObserverPrepareRequest,
} from "../shared/observer";
import type { DocumentationDraftRequest } from "../shared/documentation-update";
import {
  SEARCH_CHANNELS,
  type WorkspaceSearchBatch,
  type WorkspaceSearchBridge,
  type WorkspaceSearchRequest,
} from "../shared/search";
import {
  SETTINGS_CHANNELS,
  type LocalSettings,
  type SaveApiKeyRequest,
  type SettingsBridge,
  type SyncedSettings,
} from "../shared/settings";
import { GIT_CHANNELS, type GitBridge, type GitDiffRequest } from "../shared/git";
import { CHECKPOINT_CHANNELS, type CheckpointBridge, type CreateCheckpointRequest, type RestoreCheckpointRequest } from "../shared/checkpoints";
import { MULTI_FILE_CHANNELS, type MultiFileApplyRequest, type MultiFileBridge, type MultiFileGenerateRequest, type MultiFileLimits, type MultiFileOutcomeRequest, type MultiFilePlan, type MultiFilePlanRequest } from "../shared/multi-file-change";
import { VERIFICATION_TASK_CHANNELS, type VerificationTaskBridge, type VerificationTaskRequest } from "../shared/verification-task";
import { INSIGHTS_CHANNELS, type EvaluationSessionRequest, type InsightMutation, type InsightsBridge, type InsightsExportRequest, type InsightsQuery } from "../shared/proactive-insights";
import { WEB_CONTEXT_CHANNELS, type IncomingWebContext, type WebContextBridge, type WebContextBridgeStatus } from "../shared/web-context-bridge";
import type { ContextTrayItem } from "../shared/context-tray";

const workspaceBridge: WorkspaceBridge = Object.freeze({
  openFolder: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.openFolder),
  closeWorkspace: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.closeWorkspace),
  listRecent: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.recentList),
  reopenRecent: (id: string) => ipcRenderer.invoke(WORKSPACE_CHANNELS.reopenRecent, id),
  removeRecent: (id: string) => ipcRenderer.invoke(WORKSPACE_CHANNELS.removeRecent, id),
  clearRecent: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.clearRecent),
  readDirectory: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.readDirectory, relativePath),
  readFile: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.readFile, relativePath),
  canWriteFile: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.canWriteFile, relativePath),
  writeFile: (request: FileWriteRequest) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.writeFile, request),
  createEntry: (request: CreateWorkspaceEntryRequest) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.createEntry, request),
  renameEntry: (request: RenameWorkspaceEntryRequest) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.renameEntry, request),
  deleteEntry: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.deleteEntry, relativePath),
  onDidChange: (listener: (batch: WorkspaceChangeBatch) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, batch: WorkspaceChangeBatch) => {
      listener(batch);
    };
    ipcRenderer.on(WORKSPACE_CHANNELS.changed, wrapped);
    return () => ipcRenderer.removeListener(WORKSPACE_CHANNELS.changed, wrapped);
  },
});

contextBridge.exposeInMainWorld("workspace", workspaceBridge);

const workspaceSearchBridge: WorkspaceSearchBridge = Object.freeze({
  search: (request: WorkspaceSearchRequest) => ipcRenderer.invoke(SEARCH_CHANNELS.start, request),
  cancel: (searchId?: string) => ipcRenderer.invoke(SEARCH_CHANNELS.cancel, searchId),
  onBatch: (listener: (batch: WorkspaceSearchBatch) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, batch: WorkspaceSearchBatch) => listener(batch);
    ipcRenderer.on(SEARCH_CHANNELS.batch, wrapped);
    return () => ipcRenderer.removeListener(SEARCH_CHANNELS.batch, wrapped);
  },
});

contextBridge.exposeInMainWorld("workspaceSearch", workspaceSearchBridge);

const terminalBridge: TerminalBridge = Object.freeze({
  create: (request: TerminalCreateRequest) =>
    ipcRenderer.invoke(TERMINAL_CHANNELS.create, request),
  sendInput: (request: TerminalInputRequest) =>
    ipcRenderer.invoke(TERMINAL_CHANNELS.input, request),
  resize: (request: TerminalResizeRequest) =>
    ipcRenderer.invoke(TERMINAL_CHANNELS.resize, request),
  close: (request: TerminalCloseRequest) =>
    ipcRenderer.invoke(TERMINAL_CHANNELS.close, request),
  onData: (listener: (event: TerminalDataEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: TerminalDataEvent) => listener(data);
    ipcRenderer.on(TERMINAL_CHANNELS.data, wrapped);
    return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.data, wrapped);
  },
  onExit: (listener: (event: TerminalExitEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: TerminalExitEvent) => listener(data);
    ipcRenderer.on(TERMINAL_CHANNELS.exit, wrapped);
    return () => ipcRenderer.removeListener(TERMINAL_CHANNELS.exit, wrapped);
  },
});

contextBridge.exposeInMainWorld("terminal", terminalBridge);

const runnerBridge: RunnerBridge = Object.freeze({
  start: (request: RunStartRequest) => ipcRenderer.invoke(RUNNER_CHANNELS.start, request),
  stop: (request: RunStopRequest) => ipcRenderer.invoke(RUNNER_CHANNELS.stop, request),
  onOutput: (listener: (event: RunOutputEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: RunOutputEvent) => listener(data);
    ipcRenderer.on(RUNNER_CHANNELS.output, wrapped);
    return () => ipcRenderer.removeListener(RUNNER_CHANNELS.output, wrapped);
  },
  onComplete: (listener: (event: RunCompleteEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: RunCompleteEvent) => listener(data);
    ipcRenderer.on(RUNNER_CHANNELS.complete, wrapped);
    return () => ipcRenderer.removeListener(RUNNER_CHANNELS.complete, wrapped);
  },
});

contextBridge.exposeInMainWorld("runner", runnerBridge);

const authBridge: DesktopAuthBridge = Object.freeze({
  getState: () => ipcRenderer.invoke(AUTH_CHANNELS.state),
  signIn: (request: DesktopSignInRequest) => ipcRenderer.invoke(AUTH_CHANNELS.signIn, request),
  signOut: () => ipcRenderer.invoke(AUTH_CHANNELS.signOut),
  onStateChanged: (listener: (state: DesktopAuthState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopAuthState) => listener(state);
    ipcRenderer.on(AUTH_CHANNELS.changed, wrapped);
    return () => ipcRenderer.removeListener(AUTH_CHANNELS.changed, wrapped);
  },
});

contextBridge.exposeInMainWorld("desktopAuth", authBridge);

const observerBridge: ObserverBridge = Object.freeze({
  prepare: (request: ObserverPrepareRequest) => ipcRenderer.invoke(OBSERVER_CHANNELS.prepare, request),
  ask: (request: ObserverRequest) => ipcRenderer.invoke(OBSERVER_CHANNELS.ask, request),
  recordOutcome: (request: ObserverOutcomeRequest) =>
    ipcRenderer.invoke(OBSERVER_CHANNELS.outcome, request),
  copySnippet: (snippet: string) => ipcRenderer.invoke(OBSERVER_CHANNELS.copy, snippet),
  documentationDraft: (request: DocumentationDraftRequest) => ipcRenderer.invoke(OBSERVER_CHANNELS.documentationDraft, request),
});

contextBridge.exposeInMainWorld("observer", observerBridge);

const settingsBridge: SettingsBridge = Object.freeze({
  getLocal: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getLocal),
  updateLocal: (settings: LocalSettings) => ipcRenderer.invoke(SETTINGS_CHANNELS.updateLocal, settings),
  resetLocal: () => ipcRenderer.invoke(SETTINGS_CHANNELS.resetLocal),
  getSynced: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getSynced),
  updateSynced: (settings: SyncedSettings) => ipcRenderer.invoke(SETTINGS_CHANNELS.updateSynced, settings),
  providerStatus: () => ipcRenderer.invoke(SETTINGS_CHANNELS.providerStatus),
  saveApiKey: (request: SaveApiKeyRequest) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveKey, request),
  deleteApiKey: (provider: "gemini" | "openai" | "deepseek" | "anthropic") => ipcRenderer.invoke(SETTINGS_CHANNELS.deleteKey, provider),
  clearObserverHistory: () => ipcRenderer.invoke(SETTINGS_CHANNELS.clearObserverHistory),
  getWorkspaceTabs: (workspaceId: string) => ipcRenderer.invoke(SETTINGS_CHANNELS.getWorkspaceTabs, workspaceId),
  saveWorkspaceTabs: (workspaceId: string, paths: string[]) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveWorkspaceTabs, workspaceId, paths),
});

contextBridge.exposeInMainWorld("settings", settingsBridge);

const gitBridge: GitBridge = Object.freeze({
  status: () => ipcRenderer.invoke(GIT_CHANNELS.status),
  diff: (request: GitDiffRequest) => ipcRenderer.invoke(GIT_CHANNELS.diff, request),
  cancel: () => ipcRenderer.invoke(GIT_CHANNELS.cancel),
});
contextBridge.exposeInMainWorld("git", gitBridge);

const checkpointBridge: CheckpointBridge = Object.freeze({
  create: (request: CreateCheckpointRequest) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.create, request),
  restore: (request: RestoreCheckpointRequest) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.restore, request),
  clear: () => ipcRenderer.invoke(CHECKPOINT_CHANNELS.clear),
});
contextBridge.exposeInMainWorld("checkpoints", checkpointBridge);

const multiFileBridge: MultiFileBridge = Object.freeze({
  plan: (request: MultiFilePlanRequest) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.plan, request),
  prepare: (plan: MultiFilePlan, limits: MultiFileLimits) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.prepare, plan, limits),
  generate: (request: MultiFileGenerateRequest) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.generate, request),
  apply: (request: MultiFileApplyRequest) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.apply, request),
  undo: (request: Parameters<MultiFileBridge["undo"]>[0]) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.undo, request),
  outcome: (request: MultiFileOutcomeRequest) => ipcRenderer.invoke(MULTI_FILE_CHANNELS.outcome, request),
});
contextBridge.exposeInMainWorld("multiFileObserver", multiFileBridge);

const verificationTaskBridge: VerificationTaskBridge = Object.freeze({ run: (request: VerificationTaskRequest) => ipcRenderer.invoke(VERIFICATION_TASK_CHANNELS.run, request) });
contextBridge.exposeInMainWorld("verificationTask", verificationTaskBridge);

const insightsBridge: InsightsBridge = Object.freeze({
  report: (query: InsightsQuery) => ipcRenderer.invoke(INSIGHTS_CHANNELS.report, query),
  mutate: (mutation: InsightMutation, retentionDays: number) => ipcRenderer.invoke(INSIGHTS_CHANNELS.mutate, mutation, retentionDays),
  session: (request: EvaluationSessionRequest) => ipcRenderer.invoke(INSIGHTS_CHANNELS.session, request),
  clear: () => ipcRenderer.invoke(INSIGHTS_CHANNELS.clear),
  export: (request: InsightsExportRequest) => ipcRenderer.invoke(INSIGHTS_CHANNELS.export, request),
});
contextBridge.exposeInMainWorld("observerInsights", insightsBridge);

const webContextBridge: WebContextBridge = Object.freeze({
  getStatus: () => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.status),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.setEnabled, enabled),
  startPairing: () => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.startPairing),
  cancelPairing: () => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.cancelPairing),
  revoke: () => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.revoke),
  accept: (transferId: string) => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.accept, transferId),
  reject: (transferId: string) => ipcRenderer.invoke(WEB_CONTEXT_CHANNELS.reject, transferId),
  onStatusChanged: (listener: (status: WebContextBridgeStatus) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: WebContextBridgeStatus) => listener(status);
    ipcRenderer.on(WEB_CONTEXT_CHANNELS.status, wrapped);
    return () => ipcRenderer.removeListener(WEB_CONTEXT_CHANNELS.status, wrapped);
  },
  onPendingChanged: (listener: (item: IncomingWebContext | null) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, item: IncomingWebContext | null) => listener(item);
    ipcRenderer.on(WEB_CONTEXT_CHANNELS.pending, wrapped);
    return () => ipcRenderer.removeListener(WEB_CONTEXT_CHANNELS.pending, wrapped);
  },
  onContextReceived: (listener: (item: ContextTrayItem) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, item: ContextTrayItem) => listener(item);
    ipcRenderer.on(WEB_CONTEXT_CHANNELS.received, wrapped);
    return () => ipcRenderer.removeListener(WEB_CONTEXT_CHANNELS.received, wrapped);
  },
});
contextBridge.exposeInMainWorld("webContext", webContextBridge);
