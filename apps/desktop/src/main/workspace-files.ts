import { readFile, readdir, realpath, stat } from "node:fs/promises";
import {
  basename,
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
  WorkspaceEntry,
  WorkspaceTextFile,
} from "../shared/workspace";

const IGNORED_NAMES = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const MAX_DIRECTORY_ENTRIES = 5_000;
const MAX_RELATIVE_PATH_LENGTH = 4_096;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".js",
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

export function isSupportedWorkspaceTextFile(fileName: string): boolean {
  return SUPPORTED_TEXT_EXTENSIONS.has(extname(fileName).toLowerCase());
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

  return {
    name: fileName,
    relativePath: target.relativePath,
    content,
  };
}
