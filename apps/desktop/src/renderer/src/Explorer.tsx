import { useState } from "react";
import type { OpenWorkspace, WorkspaceEntry } from "../../shared/workspace";

interface TreeEntryProps {
  entry: WorkspaceEntry;
  depth: number;
  activeFilePath: string | null;
  onSelectFile: (entry: WorkspaceEntry) => void;
}

function TreeEntry({
  entry,
  depth,
  activeFilePath,
  onSelectFile,
}: TreeEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (entry.kind !== "directory") return;
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (children !== null || loading) return;

    setLoading(true);
    setError(null);
    const result = await window.workspace.readDirectory(entry.relativePath);
    setLoading(false);
    if (result.ok) setChildren(result.value);
    else setError(result.error);
  };

  return (
    <li className="tree-entry">
      {entry.kind === "directory" ? (
        <button
          type="button"
          className="tree-row"
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => void toggle()}
          aria-expanded={expanded}
        >
          <span className="tree-chevron" aria-hidden="true">
            {expanded ? "⌄" : "›"}
          </span>
          <span className="tree-icon folder-icon" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="tree-name">{entry.name}</span>
          {entry.isSymbolicLink && <span className="symlink-mark">↗</span>}
        </button>
      ) : (
        <button
          type="button"
          className={`tree-row file-row ${
            activeFilePath === entry.relativePath ? "active" : ""
          }`}
          style={{ paddingLeft: 28 + depth * 14 }}
          onClick={() => onSelectFile(entry)}
          aria-current={activeFilePath === entry.relativePath ? "page" : undefined}
        >
          <span className="tree-icon" aria-hidden="true">
            ◻
          </span>
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

interface ExplorerProps {
  activeFilePath: string | null;
  onSelectFile: (entry: WorkspaceEntry) => void;
  onBeforeWorkspaceOpen: () => Promise<boolean>;
  onWorkspaceOpened: () => void;
}

export default function Explorer({
  activeFilePath,
  onSelectFile,
  onBeforeWorkspaceOpen,
  onWorkspaceOpened,
}: ExplorerProps) {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFolder = async () => {
    if (loading) return;
    if (!(await onBeforeWorkspaceOpen())) return;
    setLoading(true);
    setError(null);
    const result = await window.workspace.openFolder();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value) {
      onWorkspaceOpened();
      setWorkspace(result.value);
      setWorkspaceVersion((version) => version + 1);
    }
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

      {error && <div className="explorer-error">{error}</div>}

      {!workspace && !loading && !error && (
        <div className="explorer-empty">
          <span aria-hidden="true">◇</span>
          <p>Open a local project to browse its files.</p>
        </div>
      )}

      {workspace && (
        <div className="workspace-tree" key={workspaceVersion}>
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
                  onSelectFile={onSelectFile}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
