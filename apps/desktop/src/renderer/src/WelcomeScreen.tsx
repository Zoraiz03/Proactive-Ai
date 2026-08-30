import { useCallback, useEffect, useState } from "react";
import type { OpenWorkspace, RecentWorkspace } from "../../shared/workspace";

interface WelcomeScreenProps {
  onBeforeOpen: () => Promise<boolean>;
  onWorkspaceOpened: (workspace: OpenWorkspace) => void;
}

function openedLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function WelcomeScreen({ onBeforeOpen, onWorkspaceOpened }: WelcomeScreenProps) {
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecents = useCallback(async () => {
    setLoading(true);
    const result = await window.workspace.listRecent();
    setLoading(false);
    if (result.ok) {
      setRecents(result.value);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  const openFolder = async () => {
    if (openingPath || !(await onBeforeOpen())) return;
    setOpeningPath("__picker__");
    setError(null);
    const result = await window.workspace.openFolder();
    setOpeningPath(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value) onWorkspaceOpened(result.value);
  };

  const reopen = async (project: RecentWorkspace) => {
    if (openingPath || !(await onBeforeOpen())) return;
    setOpeningPath(project.id);
    setError(null);
    const result = await window.workspace.reopenRecent(project.id);
    setOpeningPath(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onWorkspaceOpened(result.value);
  };

  const remove = async (project: RecentWorkspace) => {
    setError(null);
    const result = await window.workspace.removeRecent(project.id);
    if (result.ok) setRecents(result.value);
    else setError(result.error);
  };

  return (
    <div className="welcome-screen">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-heading">
          <span className="welcome-logo" aria-hidden="true">P</span>
          <div>
            <h2 id="welcome-title">Welcome to Proactive AI IDE</h2>
            <p>Open a local project to start coding.</p>
          </div>
        </div>

        <button
          type="button"
          className="welcome-open-button"
          onClick={() => void openFolder()}
          disabled={openingPath !== null}
        >
          {openingPath === "__picker__" ? "Opening…" : "Open Folder"}
        </button>

        <div className="recent-projects-heading">
          <h3>Recent Projects</h3>
          {!loading && recents.length > 0 && <span>{recents.length} of 10</span>}
        </div>

        {error && <div className="welcome-error" role="alert">{error}</div>}
        {loading ? (
          <p className="recent-empty">Loading recent projects…</p>
        ) : recents.length === 0 ? (
          <div className="recent-empty">
            <span aria-hidden="true">◇</span>
            <p>No recent projects yet.</p>
            <small>Folders you open will appear here for quick access.</small>
          </div>
        ) : (
          <ul className="recent-project-list">
            {recents.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="recent-project-open"
                  onClick={() => void reopen(project)}
                  disabled={openingPath !== null}
                >
                  <span className="recent-project-icon" aria-hidden="true">▸</span>
                  <span className="recent-project-details">
                    <strong>{project.displayName}</strong>
                    <span>{project.displayPath}</span>
                  </span>
                  <time dateTime={new Date(project.lastOpenedAt).toISOString()}>
                    {openingPath === project.id ? "Opening…" : openedLabel(project.lastOpenedAt)}
                  </time>
                </button>
                <button
                  type="button"
                  className="recent-project-remove"
                  aria-label={`Remove ${project.displayName} from recent projects`}
                  title="Remove from Recents"
                  onClick={() => void remove(project)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
