export const WORKSPACE_CHANNELS = {
  openFolder: "workspace:open-folder",
  readDirectory: "workspace:read-directory",
  readFile: "workspace:read-file",
  writeFile: "workspace:write-file",
  createEntry: "workspace:create-entry",
  renameEntry: "workspace:rename-entry",
  deleteEntry: "workspace:delete-entry",
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

export interface CreateWorkspaceEntryRequest {
  parentRelativePath: string;
  name: string;
  kind: "file" | "directory";
}

export interface RenameWorkspaceEntryRequest {
  relativePath: string;
  newName: string;
}

export type WorkspaceMutationErrorCode =
  | "invalid_name"
  | "unsupported"
  | "duplicate"
  | "not_found"
  | "not_empty"
  | "access_denied"
  | "operation_error";

export type WorkspaceMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: WorkspaceMutationErrorCode };

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
  createEntry: (
    request: CreateWorkspaceEntryRequest
  ) => Promise<WorkspaceMutationResult<WorkspaceEntry>>;
  renameEntry: (
    request: RenameWorkspaceEntryRequest
  ) => Promise<WorkspaceMutationResult<WorkspaceEntry>>;
  deleteEntry: (
    relativePath: string
  ) => Promise<WorkspaceMutationResult<{ relativePath: string }>>;
}
