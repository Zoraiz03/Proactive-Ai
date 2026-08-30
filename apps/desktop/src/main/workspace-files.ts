import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import { TextDecoder } from "node:util";
import type {
  FileReadErrorCode,
  FileWriteErrorCode,
  FileWriteRequest,
  CreateWorkspaceEntryRequest,
  RenameWorkspaceEntryRequest,
  WorkspaceMutationErrorCode,
  WorkspaceEntry,
  WorkspaceTextFile,
} from "../shared/workspace";

const IGNORED_NAMES = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const MAX_DIRECTORY_ENTRIES = 5_000;
const MAX_RELATIVE_PATH_LENGTH = 4_096;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".html",
  ".css",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
]);

export class WorkspaceAccessError extends Error {}

export class WorkspaceFileError extends WorkspaceAccessError {
  readonly code: FileReadErrorCode;

  constructor(message: string, code: FileReadErrorCode) {
    super(message);
    this.code = code;
  }
}

export class WorkspaceFileWriteError extends WorkspaceAccessError {
  readonly code: FileWriteErrorCode;

  constructor(message: string, code: FileWriteErrorCode) {
    super(message);
    this.code = code;
  }
}

export class WorkspaceMutationError extends WorkspaceAccessError {
  readonly code: WorkspaceMutationErrorCode;

  constructor(message: string, code: WorkspaceMutationErrorCode) {
    super(message);
    this.code = code;
  }
}

export function isSupportedWorkspaceTextFile(fileName: string): boolean {
  return SUPPORTED_TEXT_EXTENSIONS.has(extname(fileName).toLowerCase());
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function validateWorkspaceEntryName(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 255 ||
    input !== input.trim() ||
    input === "." ||
    input === ".." ||
    input.includes("\0") ||
    /[\\/:*?"<>|]/.test(input) ||
    input.endsWith(".") ||
    WINDOWS_RESERVED_NAME.test(input) ||
    IGNORED_NAMES.has(input.toLowerCase())
  ) {
    throw new WorkspaceMutationError(
      "Use a safe name without path separators, reserved characters, or leading/trailing spaces.",
      "invalid_name"
    );
  }
  return input;
}

export function normalizeWorkspaceRelativePath(input: unknown): {
  relativePath: string;
  segments: string[];
} {
  if (typeof input !== "string" || input.length > MAX_RELATIVE_PATH_LENGTH) {
    throw new WorkspaceAccessError("Invalid workspace path.");
  }
  if (input.includes("\0") || isAbsolute(input) || win32.isAbsolute(input)) {
    throw new WorkspaceAccessError("Invalid workspace path.");
  }

  const segments = input
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new WorkspaceAccessError("Workspace path escapes the selected folder.");
  }

  return { relativePath: segments.join("/"), segments };
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const difference = relative(rootPath, candidatePath);
  return (
    difference === "" ||
    (difference !== ".." &&
      !difference.startsWith(`..${sep}`) &&
      !isAbsolute(difference))
  );
}

export async function resolveWorkspacePath(
  rootPath: string,
  input: unknown
): Promise<{ realPath: string; relativePath: string }> {
  const normalized = normalizeWorkspaceRelativePath(input);
  const canonicalRootPath = await realpath(rootPath);
  const lexicalPath = resolve(canonicalRootPath, ...normalized.segments);
  if (!isWithinRoot(canonicalRootPath, lexicalPath)) {
    throw new WorkspaceAccessError("Workspace path escapes the selected folder.");
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(lexicalPath);
  } catch {
    throw new WorkspaceAccessError("The requested folder is no longer available.");
  }
  if (!isWithinRoot(canonicalRootPath, resolvedPath)) {
    throw new WorkspaceAccessError("Workspace path escapes the selected folder.");
  }

  return { realPath: resolvedPath, relativePath: normalized.relativePath };
}

export async function readWorkspaceDirectory(
  rootPath: string,
  relativePath: unknown
): Promise<WorkspaceEntry[]> {
  const canonicalRootPath = await realpath(rootPath);
  const target = await resolveWorkspacePath(canonicalRootPath, relativePath);
  const targetStats = await stat(target.realPath);
  if (!targetStats.isDirectory()) {
    throw new WorkspaceAccessError("Only folders can be expanded.");
  }

  const directoryEntries = await readdir(target.realPath, { withFileTypes: true });
  if (directoryEntries.length > MAX_DIRECTORY_ENTRIES) {
    throw new WorkspaceAccessError("This folder contains too many entries to display.");
  }

  const entries = await Promise.all(
    directoryEntries.map(async (entry): Promise<WorkspaceEntry | null> => {
      if (IGNORED_NAMES.has(entry.name.toLowerCase())) return null;

      const entryPath = resolve(target.realPath, entry.name);
      let resolvedEntryPath: string;
      try {
        resolvedEntryPath = await realpath(entryPath);
      } catch {
        return null;
      }
      if (!isWithinRoot(canonicalRootPath, resolvedEntryPath)) return null;

      let kind: WorkspaceEntry["kind"];
      if (entry.isSymbolicLink()) {
        const targetEntryStats = await stat(resolvedEntryPath);
        if (targetEntryStats.isDirectory()) kind = "directory";
        else if (targetEntryStats.isFile()) kind = "file";
        else return null;
      } else if (entry.isDirectory()) {
        kind = "directory";
      } else if (entry.isFile()) {
        kind = "file";
      } else {
        return null;
      }

      return {
        name: entry.name,
        relativePath: [target.relativePath, entry.name].filter(Boolean).join("/"),
        kind,
        isSymbolicLink: entry.isSymbolicLink(),
      };
    })
  );

  return entries
    .filter((entry): entry is WorkspaceEntry => entry !== null)
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export async function prepareWorkspaceRoot(selectedPath: string): Promise<{
  name: string;
  rootPath: string;
}> {
  const rootPath = await realpath(selectedPath);
  const rootStats = await stat(rootPath);
  if (!rootStats.isDirectory()) {
    throw new WorkspaceAccessError("The selected item is not a folder.");
  }
  return { name: basename(selectedPath) || basename(rootPath) || rootPath, rootPath };
}

export async function readWorkspaceTextFile(
  rootPath: string,
  relativePath: unknown
): Promise<WorkspaceTextFile> {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const fileName = normalized.segments.at(-1) ?? "";
  if (!isSupportedWorkspaceTextFile(fileName)) {
    throw new WorkspaceFileError(
      "This file type is not supported by the read-only viewer.",
      "unsupported"
    );
  }

  const target = await resolveWorkspacePath(rootPath, normalized.relativePath);
  const fileStats = await stat(target.realPath);
  if (!fileStats.isFile()) {
    throw new WorkspaceFileError("Only text files can be opened.", "not_file");
  }
  if (fileStats.size > MAX_TEXT_FILE_BYTES) {
    throw new WorkspaceFileError(
      "This file is too large to open. The current limit is 2 MiB.",
      "too_large"
    );
  }

  const contents = await readFile(target.realPath);
  if (contents.byteLength > MAX_TEXT_FILE_BYTES) {
    throw new WorkspaceFileError(
      "This file is too large to open. The current limit is 2 MiB.",
      "too_large"
    );
  }
  if (contents.includes(0)) {
    throw new WorkspaceFileError(
      "This appears to be a binary file and cannot be displayed.",
      "binary"
    );
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new WorkspaceFileError(
      "This file is not valid UTF-8 text and cannot be displayed.",
      "binary"
    );
  }

  const finalStats = await stat(target.realPath);
  if (
    finalStats.mtimeMs !== fileStats.mtimeMs ||
    finalStats.size !== fileStats.size
  ) {
    throw new WorkspaceFileError(
      "This file changed while it was being opened. Try opening it again.",
      "read_error"
    );
  }

  return {
    name: fileName,
    relativePath: target.relativePath,
    content,
    modifiedAtMs: finalStats.mtimeMs,
  };
}

function validateFileWriteRequest(input: unknown): FileWriteRequest {
  if (
    typeof input !== "object" ||
    input === null ||
    !("relativePath" in input) ||
    !("content" in input) ||
    !("expectedModifiedAtMs" in input) ||
    typeof input.relativePath !== "string" ||
    typeof input.content !== "string" ||
    typeof input.expectedModifiedAtMs !== "number" ||
    !Number.isFinite(input.expectedModifiedAtMs) ||
    input.expectedModifiedAtMs < 0
  ) {
    throw new WorkspaceFileWriteError("Invalid save request.", "access_denied");
  }
  return input as FileWriteRequest;
}

export async function writeWorkspaceTextFile(
  rootPath: string,
  input: unknown
): Promise<{ modifiedAtMs: number }> {
  const request = validateFileWriteRequest(input);
  const normalized = normalizeWorkspaceRelativePath(request.relativePath);
  const fileName = normalized.segments.at(-1) ?? "";
  if (!isSupportedWorkspaceTextFile(fileName)) {
    throw new WorkspaceFileWriteError(
      "This file type is not supported by the editor.",
      "unsupported"
    );
  }
  if (Buffer.byteLength(request.content, "utf8") > MAX_TEXT_FILE_BYTES) {
    throw new WorkspaceFileWriteError(
      "This file is too large to save. The current limit is 2 MiB.",
      "too_large"
    );
  }

  const target = await resolveWorkspacePath(rootPath, normalized.relativePath);
  const handle = await open(target.realPath, "r+").catch(() => {
    throw new WorkspaceFileWriteError(
      "The file is no longer available.",
      "not_file"
    );
  });

  try {
    const currentStats = await handle.stat();
    if (!currentStats.isFile()) {
      throw new WorkspaceFileWriteError(
        "Only existing text files can be saved.",
        "not_file"
      );
    }
    if (currentStats.mtimeMs !== request.expectedModifiedAtMs) {
      throw new WorkspaceFileWriteError(
        "This file changed on disk after it was opened. Reopen it before saving.",
        "changed_on_disk"
      );
    }

    await handle.truncate(0);
    await handle.writeFile(request.content, { encoding: "utf8" });
    await handle.sync();
    return { modifiedAtMs: (await handle.stat()).mtimeMs };
  } finally {
    await handle.close();
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function validateCreateRequest(input: unknown): CreateWorkspaceEntryRequest {
  if (
    typeof input !== "object" ||
    input === null ||
    !("parentRelativePath" in input) ||
    !("name" in input) ||
    !("kind" in input) ||
    typeof input.parentRelativePath !== "string" ||
    typeof input.name !== "string" ||
    (input.kind !== "file" && input.kind !== "directory")
  ) {
    throw new WorkspaceMutationError("Invalid create request.", "access_denied");
  }
  return input as CreateWorkspaceEntryRequest;
}

function validateRenameRequest(input: unknown): RenameWorkspaceEntryRequest {
  if (
    typeof input !== "object" ||
    input === null ||
    !("relativePath" in input) ||
    !("newName" in input) ||
    typeof input.relativePath !== "string" ||
    typeof input.newName !== "string"
  ) {
    throw new WorkspaceMutationError("Invalid rename request.", "access_denied");
  }
  return input as RenameWorkspaceEntryRequest;
}

async function resolveMutableWorkspaceEntry(
  rootPath: string,
  input: unknown
): Promise<{
  canonicalRootPath: string;
  realPath: string;
  relativePath: string;
  name: string;
  kind: WorkspaceEntry["kind"];
}> {
  const normalized = normalizeWorkspaceRelativePath(input);
  if (normalized.segments.length === 0) {
    throw new WorkspaceMutationError(
      "The workspace root cannot be renamed or deleted.",
      "access_denied"
    );
  }

  const canonicalRootPath = await realpath(rootPath);
  const lexicalPath = resolve(canonicalRootPath, ...normalized.segments);
  if (!isWithinRoot(canonicalRootPath, lexicalPath)) {
    throw new WorkspaceMutationError(
      "Workspace path escapes the selected folder.",
      "access_denied"
    );
  }

  let lexicalStats;
  try {
    lexicalStats = await lstat(lexicalPath);
  } catch {
    throw new WorkspaceMutationError("The requested item no longer exists.", "not_found");
  }
  if (lexicalStats.isSymbolicLink()) {
    throw new WorkspaceMutationError(
      "Symbolic links cannot be renamed or deleted in this phase.",
      "unsupported"
    );
  }

  const realPath = await realpath(lexicalPath);
  if (!isWithinRoot(canonicalRootPath, realPath)) {
    throw new WorkspaceMutationError(
      "Workspace path escapes the selected folder.",
      "access_denied"
    );
  }
  const entryStats = await stat(realPath);
  const kind = entryStats.isDirectory()
    ? "directory"
    : entryStats.isFile()
      ? "file"
      : null;
  if (!kind) {
    throw new WorkspaceMutationError("This item type is not supported.", "unsupported");
  }

  return {
    canonicalRootPath,
    realPath,
    relativePath: normalized.relativePath,
    name: normalized.segments.at(-1) ?? "",
    kind,
  };
}

export async function createWorkspaceEntry(
  rootPath: string,
  input: unknown
): Promise<WorkspaceEntry> {
  const request = validateCreateRequest(input);
  const name = validateWorkspaceEntryName(request.name);
  if (request.kind === "file" && !isSupportedWorkspaceTextFile(name)) {
    throw new WorkspaceMutationError(
      "New files must use one of the supported text or code extensions.",
      "unsupported"
    );
  }

  const parent = await resolveWorkspacePath(rootPath, request.parentRelativePath);
  const parentStats = await stat(parent.realPath);
  if (!parentStats.isDirectory()) {
    throw new WorkspaceMutationError("New items can only be created in a folder.", "access_denied");
  }
  const canonicalRootPath = await realpath(rootPath);
  const targetPath = resolve(parent.realPath, name);
  if (!isWithinRoot(canonicalRootPath, targetPath)) {
    throw new WorkspaceMutationError(
      "Workspace path escapes the selected folder.",
      "access_denied"
    );
  }

  try {
    if (request.kind === "directory") {
      await mkdir(targetPath);
    } else {
      const handle = await open(targetPath, "wx");
      await handle.close();
    }
  } catch (error) {
    if (isNodeError(error, "EEXIST")) {
      throw new WorkspaceMutationError("An item with this name already exists.", "duplicate");
    }
    throw new WorkspaceMutationError("The item could not be created.", "operation_error");
  }

  return {
    name,
    relativePath: [parent.relativePath, name].filter(Boolean).join("/"),
    kind: request.kind,
    isSymbolicLink: false,
  };
}

export async function renameWorkspaceEntry(
  rootPath: string,
  input: unknown
): Promise<WorkspaceEntry> {
  const request = validateRenameRequest(input);
  const newName = validateWorkspaceEntryName(request.newName);
  const target = await resolveMutableWorkspaceEntry(rootPath, request.relativePath);
  if (target.kind === "file" && !isSupportedWorkspaceTextFile(newName)) {
    throw new WorkspaceMutationError(
      "Renamed files must keep a supported text or code extension.",
      "unsupported"
    );
  }
  if (newName === target.name) {
    return {
      name: target.name,
      relativePath: target.relativePath,
      kind: target.kind,
      isSymbolicLink: false,
    };
  }

  const destinationPath = resolve(dirname(target.realPath), newName);
  if (!isWithinRoot(target.canonicalRootPath, destinationPath)) {
    throw new WorkspaceMutationError(
      "Workspace path escapes the selected folder.",
      "access_denied"
    );
  }
  try {
    await lstat(destinationPath);
    throw new WorkspaceMutationError("An item with this name already exists.", "duplicate");
  } catch (error) {
    if (error instanceof WorkspaceMutationError) throw error;
    if (!isNodeError(error, "ENOENT")) {
      throw new WorkspaceMutationError("The item could not be renamed.", "operation_error");
    }
  }

  try {
    await rename(target.realPath, destinationPath);
  } catch {
    throw new WorkspaceMutationError("The item could not be renamed.", "operation_error");
  }

  const parentRelativePath = target.relativePath.split("/").slice(0, -1).join("/");
  return {
    name: newName,
    relativePath: [parentRelativePath, newName].filter(Boolean).join("/"),
    kind: target.kind,
    isSymbolicLink: false,
  };
}

export async function deleteWorkspaceEntry(
  rootPath: string,
  relativePath: unknown
): Promise<{ relativePath: string }> {
  const target = await resolveMutableWorkspaceEntry(rootPath, relativePath);
  try {
    if (target.kind === "directory") await rmdir(target.realPath);
    else await unlink(target.realPath);
  } catch (error) {
    if (isNodeError(error, "ENOTEMPTY") || isNodeError(error, "EEXIST")) {
      throw new WorkspaceMutationError(
        "This folder is not empty. Recursive deletion is not available yet.",
        "not_empty"
      );
    }
    if (isNodeError(error, "ENOENT")) {
      throw new WorkspaceMutationError("The requested item no longer exists.", "not_found");
    }
    throw new WorkspaceMutationError("The item could not be deleted.", "operation_error");
  }
  return { relativePath: target.relativePath };
}
