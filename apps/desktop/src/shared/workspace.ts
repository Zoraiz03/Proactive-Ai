export const WORKSPACE_CHANNELS = {
  openFolder: "workspace:open-folder",
  readDirectory: "workspace:read-directory",
} as const;

export interface WorkspaceEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  isSymbolicLink: boolean;
}

export interface OpenWorkspace {
  name: string;
  entries: WorkspaceEntry[];
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface WorkspaceBridge {
  openFolder: () => Promise<IpcResult<OpenWorkspace | null>>;
  readDirectory: (
    relativePath: string
  ) => Promise<IpcResult<WorkspaceEntry[]>>;
}
