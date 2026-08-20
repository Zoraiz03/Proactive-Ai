export const WORKSPACE_CHANNELS = {
  openFolder: "workspace:open-folder",
  readDirectory: "workspace:read-directory",
  readFile: "workspace:read-file",
  writeFile: "workspace:write-file",
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

export interface WorkspaceTextFile {
  name: string;
  relativePath: string;
  content: string;
  modifiedAtMs: number;
}

export type FileReadErrorCode =
  | "unsupported"
  | "binary"
  | "too_large"
  | "not_file"
  | "access_denied"
  | "read_error";

export type FileReadResult =
  | { ok: true; value: WorkspaceTextFile }
  | { ok: false; error: string; code: FileReadErrorCode };

export interface FileWriteRequest {
  relativePath: string;
  content: string;
  expectedModifiedAtMs: number;
}

export type FileWriteErrorCode =
  | "unsupported"
  | "too_large"
  | "not_file"
  | "access_denied"
  | "changed_on_disk"
  | "write_error";

export type FileWriteResult =
  | { ok: true; value: { modifiedAtMs: number } }
  | { ok: false; error: string; code: FileWriteErrorCode };

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface WorkspaceBridge {
  openFolder: () => Promise<IpcResult<OpenWorkspace | null>>;
  readDirectory: (
    relativePath: string
  ) => Promise<IpcResult<WorkspaceEntry[]>>;
  readFile: (relativePath: string) => Promise<FileReadResult>;
  writeFile: (request: FileWriteRequest) => Promise<FileWriteResult>;
}
