import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitChangedFile, GitStatusSnapshot } from "../../shared/git";

interface Props {
  active: boolean;
  workspaceOpen: boolean;
  workspaceVersion: number;
  refreshToken: number;
  onOpenDiff: (file: GitChangedFile) => void;
}

const statusLabel = (file: GitChangedFile) => file.kind === "untracked" ? "U" : file.kind === "renamed" ? "R" : file.kind === "deleted" ? "D" : file.kind === "added" ? "A" : file.kind === "conflicted" ? "!" : "M";

export default function SourceControlPanel({ active, workspaceOpen, workspaceVersion, refreshToken, onOpenDiff }: Props) {
  const [status, setStatus] = useState<GitStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!workspaceOpen) { setStatus(null); setError(null); setLoading(false); return; }
    const sequence = ++requestSequence.current;
    setLoading(true); setError(null);
    const result = await window.git.status();
    if (sequence !== requestSequence.current) return;
    setLoading(false);
    if (result.ok) setStatus(result.value); else { setStatus(null); setError(result.error); }
  }, [workspaceOpen]);

  useEffect(() => {
    if (!active || !workspaceOpen) return;
    const timer = window.setTimeout(() => void refresh(), refreshToken ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [active, refresh, refreshToken, workspaceOpen, workspaceVersion]);

  useEffect(() => () => { requestSequence.current += 1; void window.git.cancel(); }, []);

  const groups = useMemo(() => {
    const files = status?.state === "repository" ? status.files : [];
    return [
      { label: "Staged Changes", files: files.filter((file) => file.staged) },
      { label: "Changes", files: files.filter((file) => file.unstaged && ["modified", "added", "conflicted"].includes(file.kind)) },
      { label: "Renamed", files: files.filter((file) => file.kind === "renamed") },
      { label: "Deleted", files: files.filter((file) => file.kind === "deleted") },
      { label: "Untracked", files: files.filter((file) => file.kind === "untracked") },
    ].filter((group) => group.files.length > 0);
  }, [status]);

  if (!workspaceOpen) return <div className="source-control-state">Open a workspace to inspect Source Control.</div>;
  return <div className="source-control-panel">
    <div className="source-control-toolbar">
      <strong>Source Control</strong>
      <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh Git status">{loading ? "…" : "↻"}</button>
    </div>
    {error && <div className="source-control-state error" role="alert">{error}</div>}
    {!error && loading && !status && <div className="source-control-state">Loading Git status…</div>}
    {!error && status?.state === "missing_git" && <div className="source-control-state error">Git is not installed or is unavailable on PATH.</div>}
    {!error && status?.state === "not_repository" && <div className="source-control-state">This folder is not a Git repository.</div>}
    {!error && status?.state === "repository" && <>
      <div className="source-control-summary">
        <strong title={status.repositoryName}>{status.repositoryName}</strong>
        <span title={`Current branch: ${status.branch}`}>⑂ {status.branch}</span>
        <span>{status.totalFiles} changed file{status.totalFiles === 1 ? "" : "s"}</span>
      </div>
      {status.truncated && <div className="source-control-truncated">Showing the first {status.files.length} of {status.totalFiles} changed files. Refine the repository outside the IDE to inspect the remainder.</div>}
      {!loading && status.totalFiles === 0 ? <div className="source-control-state">No changed files.</div> : groups.map((group) => <section className="source-control-group" key={group.label}>
        <h3>{group.label}<span>{group.files.length}</span></h3>
        {group.files.map((file) => <button type="button" key={`${group.label}:${file.relativePath}`} onClick={() => onOpenDiff(file)} title={file.originalPath ? `${file.originalPath} → ${file.relativePath}` : file.relativePath}>
          <span className={`git-status-letter ${file.kind}`}>{statusLabel(file)}</span>
          <span className="git-file-path">{file.relativePath}</span>
          {file.originalPath && <small>from {file.originalPath}</small>}
        </button>)}
      </section>)}
    </>}
  </div>;
}
