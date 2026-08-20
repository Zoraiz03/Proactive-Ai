import { contextBridge, ipcRenderer } from "electron";
import {
  WORKSPACE_CHANNELS,
  type FileWriteRequest,
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
});

contextBridge.exposeInMainWorld("workspace", workspaceBridge);
