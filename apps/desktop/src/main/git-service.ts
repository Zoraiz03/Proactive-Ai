import { spawn, type ChildProcess } from "node:child_process";
import { lstat, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { TextDecoder } from "node:util";
import {
  GIT_CHANGED_FILE_LIMIT,
  type GitChangedFile,
  type GitChangeKind,
  type GitDiffSnapshot,
  type GitStatusSnapshot,
} from "../shared/git.ts";
import { normalizeWorkspaceRelativePath, resolveWorkspacePath } from "./workspace-files.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_STATUS_BYTES = 8 * 1024 * 1024;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 128 * 1024;

type Operation = "status" | "diff";
type GitErrorCode = "missing_git" | "timeout" | "cancelled" | "failed" | "too_large";

export class GitExecutionError extends Error {
  readonly code: GitErrorCode;
  readonly stderr: string;
  constructor(code: GitErrorCode, message: string, stderr = "") { super(message); this.code = code; this.stderr = stderr; }
}

interface CommandResult { stdout: Buffer; stderr: string; }

export function gitProcessEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV ?? "production" };
  for (const name of ["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR"] as const) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  return {
    ...environment,
    LC_ALL: "C",
    LANG: "C",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    GIT_OPTIONAL_LOCKS: "0",
  };
}

export const gitStatusArguments = () => [
  "-c", "core.quotepath=false", "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all",
];

export function gitBaseArguments(relativePath: string): string[] {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!normalized.relativePath) throw new Error("Invalid Git path.");
  return ["cat-file", "blob", `HEAD:${normalized.relativePath}`];
}

function changeKind(indexStatus: string, workTreeStatus: string, untracked = false): GitChangeKind {
  if (untracked) return "untracked";
  if (indexStatus === "U" || workTreeStatus === "U") return "conflicted";
  if (indexStatus === "R" || workTreeStatus === "R") return "renamed";
  if (indexStatus === "D" || workTreeStatus === "D") return "deleted";
  if (indexStatus === "A" || workTreeStatus === "A") return "added";
  return "modified";
}

function statusFile(relativePath: string, xy: string, originalPath?: string, untracked = false): GitChangedFile | null {
  try {
    const path = normalizeWorkspaceRelativePath(relativePath).relativePath;
    const original = originalPath ? normalizeWorkspaceRelativePath(originalPath).relativePath : undefined;
    if (!path || (originalPath && !original)) return null;
    const indexStatus = untracked ? "?" : xy[0] ?? ".";
    const workTreeStatus = untracked ? "?" : xy[1] ?? ".";
    return {
      relativePath: path,
      ...(original ? { originalPath: original } : {}),
      indexStatus,
      workTreeStatus,
      staged: !untracked && indexStatus !== ".",
      unstaged: untracked || workTreeStatus !== ".",
      kind: changeKind(indexStatus, workTreeStatus, untracked),
    };
  } catch { return null; }
}

export function parseGitStatusPorcelain(output: string, repositoryName: string, limit = GIT_CHANGED_FILE_LIMIT): Extract<GitStatusSnapshot, { state: "repository" }> {
  const records = output.split("\0");
  const files: GitChangedFile[] = [];
  let branch = "Unknown";
  let totalFiles = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("# branch.head ")) {
      const head = record.slice(14);
      branch = head === "(detached)" ? "Detached HEAD" : head;
      continue;
    }
    let file: GitChangedFile | null = null;
    if (record.startsWith("? ")) {
      file = statusFile(record.slice(2), "??", undefined, true);
    } else if (record.startsWith("1 ")) {
      const match = /^1 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/.exec(record);
      if (match) file = statusFile(match[2], match[1]);
    } else if (record.startsWith("2 ")) {
      const match = /^2 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/.exec(record);
      const originalPath = records[++index] ?? "";
      if (match) file = statusFile(match[2], match[1], originalPath);
    } else if (record.startsWith("u ")) {
      const match = /^u ([^ ]{2}) (?:[^ ]+ ){8}(.*)$/.exec(record);
      if (match) file = statusFile(match[2], match[1]);
    }
    if (!file) continue;
    totalFiles += 1;
    if (files.length < limit) files.push(file);
  }
  return { state: "repository", repositoryName, branch, files, totalFiles, truncated: totalFiles > files.length };
}

function decodeText(contents: Buffer): string | null {
  if (contents.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(contents); }
  catch { return null; }
}

export interface GitRepositoryServiceOptions {
  binaryPath?: string;
  timeoutMs?: number;
  resultLimit?: number;
}

export class GitRepositoryService {
  private readonly binaryPath: string;
  private readonly timeoutMs: number;
  private readonly resultLimit: number;
  private readonly active = new Map<Operation, { child: ChildProcess; cancelled: boolean }>();
  private lastFiles = new Map<string, GitChangedFile>();

  constructor(options: GitRepositoryServiceOptions = {}) {
    this.binaryPath = options.binaryPath ?? "git";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.resultLimit = options.resultLimit ?? GIT_CHANGED_FILE_LIMIT;
  }

  cancel(operation?: Operation): void {
    const targets = operation ? [[operation, this.active.get(operation)] as const] : Array.from(this.active.entries());
    for (const [key, item] of targets) {
      if (!item) continue;
      item.cancelled = true;
      item.child.kill();
      this.active.delete(key);
    }
  }

  async status(rootPath: string): Promise<GitStatusSnapshot> {
    try {
      const result = await this.run(rootPath, gitStatusArguments(), "status", MAX_STATUS_BYTES);
      const status = parseGitStatusPorcelain(result.stdout.toString("utf8"), basename(rootPath), this.resultLimit);
      this.lastFiles = new Map(status.files.map((file) => [file.relativePath, file]));
      return status;
    } catch (error) {
      this.lastFiles.clear();
      if (error instanceof GitExecutionError && error.code === "missing_git") return { state: "missing_git" };
      if (error instanceof GitExecutionError && error.code === "failed" && /not a git repository/i.test(error.stderr)) return { state: "not_repository" };
      throw error;
    }
  }

  async diff(rootPath: string, relativePath: string): Promise<GitDiffSnapshot> {
    const normalized = normalizeWorkspaceRelativePath(relativePath).relativePath;
    const file = this.lastFiles.get(normalized);
    if (!file) throw new Error("Refresh Source Control before opening this diff.");
    this.cancel("diff");
    try {
      const originalBuffer = file.kind === "untracked" || (file.kind === "added" && !file.originalPath)
        ? Buffer.alloc(0)
        : await this.readBase(rootPath, file.originalPath ?? file.relativePath);
      const currentBuffer = file.kind === "deleted" ? Buffer.alloc(0) : await this.readCurrent(rootPath, file.relativePath);
      const originalContent = decodeText(originalBuffer);
      const currentContent = decodeText(currentBuffer);
      if (originalContent === null || currentContent === null) {
        return { state: "binary", relativePath: file.relativePath, originalPath: file.originalPath, changeKind: file.kind, message: "Binary files cannot be displayed as text diffs." };
      }
      return { state: "text", relativePath: file.relativePath, originalPath: file.originalPath, changeKind: file.kind, originalContent, currentContent };
    } catch (error) {
      if (error instanceof GitExecutionError && error.code === "too_large") {
        return { state: "too_large", relativePath: file.relativePath, originalPath: file.originalPath, changeKind: file.kind, message: "This diff exceeds the 2 MiB per-side display limit." };
      }
      if (error instanceof GitExecutionError && error.code === "cancelled") throw error;
      return { state: "unavailable", relativePath: file.relativePath, originalPath: file.originalPath, changeKind: file.kind, message: "The file changed or became unavailable. Refresh Source Control and try again." };
    }
  }

  private async readBase(rootPath: string, relativePath: string): Promise<Buffer> {
    try { return (await this.run(rootPath, gitBaseArguments(relativePath), "diff", MAX_DIFF_BYTES)).stdout; }
    catch (error) {
      if (error instanceof GitExecutionError && error.code === "failed" && /does not exist|not a valid object name|path .* exists on disk/i.test(error.stderr)) return Buffer.alloc(0);
      throw error;
    }
  }

  private async readCurrent(rootPath: string, relativePath: string): Promise<Buffer> {
    const normalized = normalizeWorkspaceRelativePath(relativePath);
    const lexicalPath = resolve(rootPath, ...normalized.segments);
    const lexicalStats = await lstat(lexicalPath);
    if (lexicalStats.isSymbolicLink() || !lexicalStats.isFile()) throw new Error("Unsafe current file.");
    const target = await resolveWorkspacePath(rootPath, normalized.relativePath);
    const before = await stat(target.realPath);
    if (before.size > MAX_DIFF_BYTES) throw new GitExecutionError("too_large", "Current file is too large.");
    const contents = await readFile(target.realPath);
    if (contents.byteLength > MAX_DIFF_BYTES) throw new GitExecutionError("too_large", "Current file is too large.");
    const after = await stat(target.realPath);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Current file changed while reading.");
    return contents;
  }

  private run(rootPath: string, args: string[], operation: Operation, maximumBytes: number): Promise<CommandResult> {
    this.cancel(operation);
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(this.binaryPath, args, {
        cwd: rootPath,
        shell: false,
        windowsHide: true,
        env: gitProcessEnvironment(process.env),
        stdio: ["ignore", "pipe", "pipe"],
      });
      const active = { child, cancelled: false };
      this.active.set(operation, active);
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let stderr = "";
      let settled = false;
      const finish = (error?: Error, value?: CommandResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.active.get(operation) === active) this.active.delete(operation);
        if (error) rejectPromise(error); else resolvePromise(value!);
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(new GitExecutionError("timeout", "Git operation timed out."));
      }, this.timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > maximumBytes) {
          child.kill();
          finish(new GitExecutionError("too_large", "Git output exceeded the display limit."));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-MAX_ERROR_BYTES); });
      child.once("error", (error: NodeJS.ErrnoException) => {
        finish(new GitExecutionError(error.code === "ENOENT" ? "missing_git" : "failed", "Git could not be started.", stderr));
      });
      child.once("close", (code) => {
        if (active.cancelled) finish(new GitExecutionError("cancelled", "Git operation was cancelled."));
        else if (code !== 0) finish(new GitExecutionError("failed", "Git command failed.", stderr));
        else finish(undefined, { stdout: Buffer.concat(stdout), stderr });
      });
    });
  }
}
