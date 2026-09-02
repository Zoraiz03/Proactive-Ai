import { useCallback, useEffect, useState } from "react";
import type {
  OpenWorkspace,
  WorkspaceChangeBatch,
  WorkspaceEntry,
} from "../../shared/workspace";

interface DeleteImpact {
  openCount: number;
  dirtyCount: number;
}

interface TreeEntryProps {
  entry: WorkspaceEntry;
  depth: number;
  activeFilePath: string | null;
  selectedPath: string | null;
  revealPath: string | null;
  expandedPaths: ReadonlySet<string>;
  refreshVersion: number;
  onExpandedChange: (relativePath: string, expanded: boolean) => void;
  onSelectEntry: (entry: WorkspaceEntry) => void;
  onSelectFile: (entry: WorkspaceEntry) => void;
}

function TreeEntry({
  entry,
  depth,
  activeFilePath,
  selectedPath,
  revealPath,
  expandedPaths,
  refreshVersion,
  onExpandedChange,
  onSelectEntry,
  onSelectFile,
}: TreeEntryProps) {
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expanded = expandedPaths.has(entry.relativePath);

  const loadChildren = useCallback(async () => {
    if (entry.kind !== "directory") return;
    setLoading(true);
    setError(null);
    const result = await window.workspace.readDirectory(entry.relativePath);
    setLoading(false);
    if (result.ok) setChildren(result.value);
    else setError(result.error);
  }, [entry.kind, entry.relativePath]);

  const expand = async () => {
    if (entry.kind !== "directory") return;
    onExpandedChange(entry.relativePath, true);
    if (children === null && !loading) await loadChildren();
  };

  const toggle = async () => {
    onSelectEntry(entry);
    if (entry.kind !== "directory") return;
    if (expanded) {
      onExpandedChange(entry.relativePath, false);
      return;
    }
    await expand();
  };

  useEffect(() => {
    if (
      entry.kind === "directory" &&
      revealPath &&
      (revealPath === entry.relativePath || revealPath.startsWith(`${entry.relativePath}/`))
    ) {
      void expand();
    }
  }, [entry.kind, entry.relativePath, revealPath]);

  useEffect(() => {
    if (expanded) void loadChildren();
  }, [expanded, loadChildren, refreshVersion]);

  const isSelected = selectedPath === entry.relativePath;

  return (
    <li className="tree-entry">
      {entry.kind === "directory" ? (
        <button
          type="button"
          className={`tree-row ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => void toggle()}
          aria-expanded={expanded}
        >
          <span className="tree-chevron" aria-hidden="true">{expanded ? "⌄" : "›"}</span>
          <span className="tree-icon folder-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="tree-name">{entry.name}</span>
          {entry.isSymbolicLink && <span className="symlink-mark">↗</span>}
        </button>
      ) : (
        <button
          type="button"
          className={`tree-row file-row ${
            activeFilePath === entry.relativePath ? "active" : ""
          } ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: 28 + depth * 14 }}
          onClick={() => {
            onSelectEntry(entry);
            onSelectFile(entry);
          }}
          aria-current={activeFilePath === entry.relativePath ? "page" : undefined}
        >
          <span className="tree-icon" aria-hidden="true">◻</span>
          <span className="tree-name">{entry.name}</span>
          {entry.isSymbolicLink && <span className="symlink-mark">↗</span>}
        </button>
      )}

      {expanded && (
        <div className="tree-children">
          {loading && <p className="tree-message">Loading…</p>}
          {error && <p className="tree-message tree-error">{error}</p>}
          {!loading && !error && children?.length === 0 && (
            <p className="tree-message">Empty folder</p>
          )}
          {children && children.length > 0 && (
            <ul>
              {children.map((child) => (
                <TreeEntry
                  key={child.relativePath}
                  entry={child}
                  depth={depth + 1}
                  activeFilePath={activeFilePath}
                  selectedPath={selectedPath}
                  revealPath={revealPath}
                  expandedPaths={expandedPaths}
                  refreshVersion={refreshVersion}
                  onExpandedChange={onExpandedChange}
                  onSelectEntry={onSelectEntry}
                  onSelectFile={onSelectFile}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

type OperationDialog =
  | { kind: "create-file" | "create-directory"; parentRelativePath: string }
  | { kind: "rename"; entry: WorkspaceEntry }
  | { kind: "delete"; entry: WorkspaceEntry; impact: DeleteImpact };

interface ExplorerProps {
  openedWorkspace: OpenWorkspace | null;
  workspaceOpen: boolean;
  activeFilePath: string | null;
  onSelectFile: (entry: WorkspaceEntry) => void;
  onBeforeWorkspaceOpen: () => Promise<boolean>;
  onWorkspaceOpened: (workspace: OpenWorkspace) => void;
  onEntryRenamed: (oldRelativePath: string, entry: WorkspaceEntry) => void;
  onEntryDeleted: (relativePath: string, kind: WorkspaceEntry["kind"]) => void;
  getDeleteImpact: (entry: WorkspaceEntry) => DeleteImpact;
  externalChanges: WorkspaceChangeBatch | null;
  onStatus: (message: string, kind?: "info" | "success" | "error") => void;
  commandRequest: { token: number; action: "open-folder" | "new-file" | "new-folder" } | null;
  confirmBeforeDelete: boolean;
  revealRequest?: { relativePath: string; token: number } | null;
  onAddFileToContext: (entry: WorkspaceEntry) => void;
}

function parentPath(relativePath: string): string {
  return relativePath.split("/").slice(0, -1).join("/");
}

export default function Explorer({
  openedWorkspace,
  workspaceOpen,
  activeFilePath,
  onSelectFile,
  onBeforeWorkspaceOpen,
  onWorkspaceOpened,
  onEntryRenamed,
  onEntryDeleted,
  getDeleteImpact,
  externalChanges,
  onStatus,
  commandRequest,
  confirmBeforeDelete,
  revealRequest,
  onAddFileToContext,
}: ExplorerProps) {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry | null>(null);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OperationDialog | null>(null);
  const [dialogName, setDialogName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [externalStatus, setExternalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceOpen) {
      setWorkspace(null);
      setSelectedEntry(null);
      setExpandedPaths(new Set());
      return;
    }
    if (!openedWorkspace) return;
    setWorkspace(openedWorkspace);
    setSelectedEntry(null);
    setRevealPath(null);
    setExpandedPaths(new Set());
    setRefreshVersion((version) => version + 1);
    setError(null);
  }, [openedWorkspace, workspaceOpen]);

  useEffect(() => {
    if (!workspace || !revealRequest) return;
    const name = revealRequest.relativePath.split("/").at(-1) ?? revealRequest.relativePath;
    setRevealPath(revealRequest.relativePath);
    setSelectedEntry({ name, relativePath: revealRequest.relativePath, kind: "file", isSymbolicLink: false });
  }, [revealRequest?.token, workspace]);

  const openFolder = async () => {
    if (loading || !(await onBeforeWorkspaceOpen())) return;
    setLoading(true);
    setError(null);
    const result = await window.workspace.openFolder();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value) {
      onWorkspaceOpened(result.value);
    }
  };

  const refreshWorkspace = async (entryToReveal: WorkspaceEntry | null) => {
    if (!workspace) return false;
    const result = await window.workspace.readDirectory("");
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setWorkspace({ ...workspace, entries: result.value });
    setSelectedEntry(entryToReveal);
    setRevealPath(entryToReveal?.relativePath ?? null);
    if (entryToReveal) {
      const segments = parentPath(entryToReveal.relativePath).split("/").filter(Boolean);
      setExpandedPaths((current) => {
        const next = new Set(current);
        for (let index = 1; index <= segments.length; index += 1) {
          next.add(segments.slice(0, index).join("/"));
        }
        return next;
      });
    }
    setRefreshVersion((version) => version + 1);
    return true;
  };

  const setEntryExpanded = useCallback((relativePath: string, expanded: boolean) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (expanded) next.add(relativePath);
      else next.delete(relativePath);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!workspace || !externalChanges) return;
    let cancelled = false;
    const refreshFromDisk = async () => {
      const result = await window.workspace.readDirectory("");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWorkspace((current) => current ? { ...current, entries: result.value } : current);
      setRefreshVersion((version) => version + 1);
      setSelectedEntry((current) => {
        if (!current) return current;
        const wasDeleted = externalChanges.changes.some((change) =>
          change.type === "deleted" &&
          (current.relativePath === change.relativePath ||
            (change.kind === "directory" && current.relativePath.startsWith(`${change.relativePath}/`)))
        );
        return wasDeleted ? null : current;
      });
      setExternalStatus("Workspace updated externally.");
    };
    void refreshFromDisk();
    const statusTimer = window.setTimeout(() => setExternalStatus(null), 3500);
    return () => {
      cancelled = true;
      window.clearTimeout(statusTimer);
    };
  }, [externalChanges]);

  const creationParent = selectedEntry
    ? selectedEntry.kind === "directory"
      ? selectedEntry.relativePath
      : parentPath(selectedEntry.relativePath)
    : "";

  const startCreate = (kind: "create-file" | "create-directory") => {
    setDialog({ kind, parentRelativePath: creationParent });
    setDialogName("");
    setDialogError(null);
  };

  useEffect(() => {
    if (!commandRequest) return;
    if (commandRequest.action === "open-folder") void openFolder();
    else startCreate(commandRequest.action === "new-file" ? "create-file" : "create-directory");
  }, [commandRequest?.token]);

  const startRename = () => {
    if (!selectedEntry) return;
    setDialog({ kind: "rename", entry: selectedEntry });
    setDialogName(selectedEntry.name);
    setDialogError(null);
  };

  const deleteEntry = async (entry: WorkspaceEntry) => {
    const result = await window.workspace.deleteEntry(entry.relativePath);
    if (!result.ok) { setError(result.error); return; }
    onEntryDeleted(entry.relativePath, entry.kind);
    if (!(await refreshWorkspace(null))) return;
    onStatus(`Deleted ${entry.relativePath}.`, "success");
  };

  const startDelete = () => {
    if (!selectedEntry) return;
    if (!confirmBeforeDelete && getDeleteImpact(selectedEntry).dirtyCount === 0) {
      void deleteEntry(selectedEntry);
      return;
    }
    setDialog({ kind: "delete", entry: selectedEntry, impact: getDeleteImpact(selectedEntry) });
    setDialogError(null);
  };

  const submitDialog = async () => {
    if (!dialog || dialogBusy) return;
    setDialogBusy(true);
    setDialogError(null);

    if (dialog.kind === "create-file" || dialog.kind === "create-directory") {
      const result = await window.workspace.createEntry({
        parentRelativePath: dialog.parentRelativePath,
        name: dialogName,
        kind: dialog.kind === "create-file" ? "file" : "directory",
      });
      setDialogBusy(false);
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      if (!(await refreshWorkspace(result.value))) return;
      setDialog(null);
      onStatus(`Created ${result.value.relativePath}.`, "success");
      if (result.value.kind === "file") onSelectFile(result.value);
      return;
    }

    if (dialog.kind === "rename") {
      const oldRelativePath = dialog.entry.relativePath;
      const result = await window.workspace.renameEntry({
        relativePath: oldRelativePath,
        newName: dialogName,
      });
      setDialogBusy(false);
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      onEntryRenamed(oldRelativePath, result.value);
      if (!(await refreshWorkspace(result.value))) return;
      setDialog(null);
      onStatus(`Renamed ${oldRelativePath} to ${result.value.relativePath}.`, "success");
      return;
    }

    if (dialog.kind !== "delete") return;
    const entry = dialog.entry;
    const result = await window.workspace.deleteEntry(entry.relativePath);
    setDialogBusy(false);
    if (!result.ok) {
      setDialogError(result.error);
      return;
    }
    onEntryDeleted(entry.relativePath, entry.kind);
    if (!(await refreshWorkspace(null))) return;
    setDialog(null);
    onStatus(`Deleted ${entry.relativePath}.`, "success");
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError(null);
  };

  return (
    <div className="explorer-content">
      <button
        type="button"
        className="open-folder-button"
        onClick={() => void openFolder()}
        disabled={loading}
      >
        {loading ? "Opening…" : "Open Folder"}
      </button>

      {workspace && (
        <div className="explorer-actions" aria-label="Workspace file actions">
          <button type="button" onClick={() => startCreate("create-file")} title="New file">+ File</button>
          <button type="button" onClick={() => startCreate("create-directory")} title="New folder">+ Folder</button>
          <button type="button" onClick={startRename} disabled={!selectedEntry || selectedEntry.isSymbolicLink}>Rename</button>
          <button type="button" onClick={() => selectedEntry && onAddFileToContext(selectedEntry)} disabled={!selectedEntry || selectedEntry.kind !== "file" || selectedEntry.isSymbolicLink}>Add to Context</button>
          <button type="button" className="danger" onClick={startDelete} disabled={!selectedEntry || selectedEntry.isSymbolicLink}>Delete</button>
        </div>
      )}

      {error && <div className="explorer-error">{error}</div>}
      {externalStatus && <div className="external-status" role="status">{externalStatus}</div>}

      {!workspace && !loading && !error && (
        <div className="explorer-empty">
          <span aria-hidden="true">◇</span>
          <p>Open a local project to browse its files.</p>
        </div>
      )}

      {workspace && (
        <div className="workspace-tree">
          <div className="workspace-name" title={workspace.name}>
            <span aria-hidden="true">⌄</span>
            {workspace.name}
          </div>
          {workspace.entries.length === 0 ? (
            <p className="tree-message root-empty">This folder is empty.</p>
          ) : (
            <ul>
              {workspace.entries.map((entry) => (
                <TreeEntry
                  key={entry.relativePath}
                  entry={entry}
                  depth={0}
                  activeFilePath={activeFilePath}
                  selectedPath={selectedEntry?.relativePath ?? null}
                  revealPath={revealPath}
                  expandedPaths={expandedPaths}
                  refreshVersion={refreshVersion}
                  onExpandedChange={setEntryExpanded}
                  onSelectEntry={setSelectedEntry}
                  onSelectFile={onSelectFile}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {dialog && (
        <div className="dialog-backdrop explorer-dialog-backdrop" role="presentation">
          <section className="unsaved-dialog operation-dialog" role="dialog" aria-modal="true">
            {dialog.kind === "delete" ? (
              <>
                <h2>Delete {dialog.entry.kind}?</h2>
                <p>
                  Permanently delete <strong>{dialog.entry.relativePath}</strong>? Non-empty
                  folders will be refused.
                </p>
                {dialog.impact.openCount > 0 && (
                  <p className="delete-warning">
                    This will close {dialog.impact.openCount} open tab
                    {dialog.impact.openCount === 1 ? "" : "s"}
                    {dialog.impact.dirtyCount > 0
                      ? ` and discard unsaved changes in ${dialog.impact.dirtyCount}.`
                      : "."}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>{dialog.kind === "rename" ? "Rename item" : dialog.kind === "create-file" ? "New file" : "New folder"}</h2>
                <p>
                  {dialog.kind === "rename"
                    ? `Enter a new name for ${dialog.entry.relativePath}.`
                    : `Create inside ${dialog.parentRelativePath || "the workspace root"}.`}
                </p>
                <input
                  value={dialogName}
                  onChange={(event) => setDialogName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitDialog();
                    if (event.key === "Escape") closeDialog();
                  }}
                  autoFocus
                  disabled={dialogBusy}
                  aria-label="Item name"
                />
              </>
            )}
            {dialogError && <div className="dialog-error" role="alert">{dialogError}</div>}
            <div className="dialog-actions">
              <button type="button" onClick={closeDialog} disabled={dialogBusy}>Cancel</button>
              <button
                type="button"
                className={dialog.kind === "delete" ? "danger" : "primary"}
                onClick={() => void submitDialog()}
                disabled={dialogBusy || (dialog.kind !== "delete" && dialogName.length === 0)}
              >
                {dialogBusy ? "Working…" : dialog.kind === "delete" ? "Delete" : dialog.kind === "rename" ? "Rename" : "Create"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
