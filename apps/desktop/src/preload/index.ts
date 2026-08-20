import { contextBridge, ipcRenderer } from "electron";
import {
  WORKSPACE_CHANNELS,
  type FileWriteRequest,
  type CreateWorkspaceEntryRequest,
  type RenameWorkspaceEntryRequest,
  type WorkspaceChangeBatch,
  type WorkspaceBridge,
} from "../shared/workspace";

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
