import { contextBridge, ipcRenderer } from "electron";
import {
  WORKSPACE_CHANNELS,
  type WorkspaceBridge,
} from "../shared/workspace";

const workspaceBridge: WorkspaceBridge = Object.freeze({
  openFolder: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.openFolder),
  readDirectory: (relativePath: string) =>
    ipcRenderer.invoke(WORKSPACE_CHANNELS.readDirectory, relativePath),
});

contextBridge.exposeInMainWorld("workspace", workspaceBridge);
