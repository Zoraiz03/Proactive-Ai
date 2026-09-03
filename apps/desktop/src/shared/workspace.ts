export const WORKSPACE_CHANNELS = {
  openFolder: "workspace:open-folder",
  closeWorkspace: "workspace:close",
  recentList: "workspace:recent-list",
  reopenRecent: "workspace:reopen-recent",
  removeRecent: "workspace:remove-recent",
  clearRecent: "workspace:clear-recent",
  readDirectory: "workspace:read-directory",
  readFile: "workspace:read-file",
  canWriteFile: "workspace:can-write-file",
  writeFile: "workspace:write-file",
  createEntry: "workspace:create-entry",
  renameEntry: "workspace:rename-entry",
  deleteEntry: "workspace:delete-entry",
  changed: "workspace:changed",
} as const;

export interface WorkspaceEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  isSymbolicLink: boolean;
}

export interface OpenWorkspace {
  workspaceId: string;
  name: string;
  entries: WorkspaceEntry[];
}

export interface RecentWorkspace {
  id: string;
  displayName: string;
  displayPath: string;
  lastOpenedAt: number;
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

export interface WorkspaceChange {
  relativePath: string;
  type: "added" | "changed" | "deleted";
  kind: "file" | "directory";
}

export interface WorkspaceChangeBatch {
  changes: WorkspaceChange[];
  timestamp: number;
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface WorkspaceBridge {
  openFolder: () => Promise<IpcResult<OpenWorkspace | null>>;
  closeWorkspace: () => Promise<IpcResult<void>>;
  listRecent: () => Promise<IpcResult<RecentWorkspace[]>>;
  reopenRecent: (id: string) => Promise<IpcResult<OpenWorkspace>>;
  removeRecent: (id: string) => Promise<IpcResult<RecentWorkspace[]>>;
  clearRecent: () => Promise<IpcResult<void>>;
  readDirectory: (
    relativePath: string
  ) => Promise<IpcResult<WorkspaceEntry[]>>;
  readFile: (relativePath: string) => Promise<FileReadResult>;
  canWriteFile: (relativePath: string) => Promise<IpcResult<boolean>>;
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
  onDidChange: (listener: (batch: WorkspaceChangeBatch) => void) => () => void;
}
