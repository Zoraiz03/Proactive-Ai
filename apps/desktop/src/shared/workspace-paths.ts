import type { WorkspaceEntry } from "./workspace";

export function workspaceEntryContainsPath(
  filePath: string,
  entryPath: string,
  kind: WorkspaceEntry["kind"]
): boolean {
  return filePath === entryPath || (kind === "directory" && filePath.startsWith(`${entryPath}/`));
}

export function replaceWorkspaceEntryPath(
  filePath: string,
  oldEntryPath: string,
  renamedEntry: WorkspaceEntry
): string {
  return workspaceEntryContainsPath(filePath, oldEntryPath, renamedEntry.kind)
    ? `${renamedEntry.relativePath}${filePath.slice(oldEntryPath.length)}`
    : filePath;
}
