import type {
  WorkspaceChangeBatch,
  WorkspaceTextFile,
} from "./workspace";

export function batchDeletesPath(
  batch: WorkspaceChangeBatch,
  relativePath: string
): boolean {
  return batch.changes.some(
    (change) =>
      change.type === "deleted" &&
      (change.relativePath === relativePath ||
        (change.kind === "directory" && relativePath.startsWith(`${change.relativePath}/`)))
  );
}

export function batchChangesFile(
  batch: WorkspaceChangeBatch,
  relativePath: string
): boolean {
  return batch.changes.some(
    (change) =>
      change.kind === "file" &&
      change.relativePath === relativePath &&
      (change.type === "changed" || change.type === "added")
  );
}

export function resolveExternalFileUpdate(
  openedFile: WorkspaceTextFile,
  draft: string,
  externalFile: WorkspaceTextFile
):
  | { kind: "reload"; file: WorkspaceTextFile; draft: string }
  | { kind: "conflict"; externalFile: WorkspaceTextFile } {
  if (draft !== openedFile.content) return { kind: "conflict", externalFile };
  return { kind: "reload", file: externalFile, draft: externalFile.content };
}
