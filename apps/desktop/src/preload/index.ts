import { contextBridge, ipcRenderer } from "electron";
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

const workspaceBridge: WorkspaceBridge = Object.freeze({
  openFolder: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.openFolder),
  readDirectory: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.readDirectory, relativePath),
  readFile: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.readFile, relativePath),
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
