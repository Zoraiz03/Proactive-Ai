import type { IpcResult } from "./workspace";

export const GIT_CHANNELS = {
  status: "git:status",
  diff: "git:diff",
  cancel: "git:cancel",
} as const;

export const GIT_CHANGED_FILE_LIMIT = 500;

export type GitChangeKind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";

export interface GitChangedFile {
  relativePath: string;
  originalPath?: string;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  kind: GitChangeKind;
}

export type GitStatusSnapshot =
  | { state: "repository"; repositoryName: string; branch: string; files: GitChangedFile[]; totalFiles: number; truncated: boolean }
  | { state: "not_repository" }
  | { state: "missing_git" };

export interface GitDiffRequest { relativePath: string }

export type GitDiffSnapshot =
  | {
      state: "text";
      relativePath: string;
      originalPath?: string;
      changeKind: GitChangeKind;
      originalContent: string;
      currentContent: string;
    }
  | {
      state: "binary" | "too_large" | "unavailable";
      relativePath: string;
      originalPath?: string;
      changeKind: GitChangeKind;
      message: string;
    };

export interface GitBridge {
  status: () => Promise<IpcResult<GitStatusSnapshot>>;
  diff: (request: GitDiffRequest) => Promise<IpcResult<GitDiffSnapshot>>;
  cancel: () => Promise<IpcResult<void>>;
}

export function validateGitDiffRequest(value: unknown): GitDiffRequest | null {
  if (!value || typeof value !== "object") return null;
  if (Object.keys(value).some((key) => key !== "relativePath")) return null;
  const path = (value as Partial<GitDiffRequest>).relativePath;
  return typeof path === "string" && path.length > 0 && path.length <= 4_096 && !path.includes("\0")
    ? { relativePath: path }
    : null;
}
