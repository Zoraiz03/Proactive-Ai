import { useEffect, useMemo, useRef, useState } from "react";
import {
  SEARCH_LIMITS,
  type WorkspaceSearchMatch,
} from "../../shared/search";

type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error" | "cancelled" | "too_many";

interface SearchPanelProps {
  active: boolean;
  workspaceOpen: boolean;
  workspaceVersion: number;
  focusToken: number;
  onOpenMatch: (match: WorkspaceSearchMatch) => void;
}

function MatchPreview({ match }: { match: WorkspaceSearchMatch }) {
  const start = Math.max(0, Math.min(match.previewMatchStart, match.preview.length));
  const end = Math.max(start, Math.min(start + match.previewMatchLength, match.preview.length));
  return (
    <span className="search-match-preview">
      {match.preview.slice(0, start)}
      <mark>{match.preview.slice(start, end)}</mark>
      {match.preview.slice(end)}
    </span>
  );
}

export default function SearchPanel({
  active,
  workspaceOpen,
  workspaceVersion,
  focusToken,
  onOpenMatch,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regularExpression, setRegularExpression] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [resultLimit, setResultLimit] = useState<number>(SEARCH_LIMITS.defaultResults);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [matches, setMatches] = useState<WorkspaceSearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeSearchId = useRef<string | null>(null);

  useEffect(() => window.workspaceSearch.onBatch((batch) => {
    if (batch.searchId !== activeSearchId.current) return;
    setMatches((current) => [...current, ...batch.matches]);
  }), []);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active, focusToken]);

  useEffect(() => {
    const previousSearchId = activeSearchId.current;
    if (previousSearchId) void window.workspaceSearch.cancel(previousSearchId);
    activeSearchId.current = null;

    if (!active || !workspaceOpen || !query.trim()) {
      setStatus("idle");
      setMatches([]);
      setError(null);
      return;
    }

    const searchId = crypto.randomUUID();
    activeSearchId.current = searchId;
    setStatus("loading");
    setMatches([]);
    setError(null);
    const timer = window.setTimeout(() => {
      void window.workspaceSearch.search({
        searchId,
        query,
        caseSensitive,
        wholeWord,
        regularExpression,
        ...(includePattern.trim() ? { includePattern } : {}),
        ...(excludePattern.trim() ? { excludePattern } : {}),
        resultLimit,
      }).then((result) => {
        if (activeSearchId.current !== searchId) return;
        activeSearchId.current = null;
        if (!result.ok) {
          setError(result.error);
          setStatus("error");
        } else if (result.value.cancelled) setStatus("cancelled");
        else if (result.value.truncated) setStatus("too_many");
        else if (result.value.matchCount === 0) setStatus("empty");
        else setStatus("ready");
      });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      if (activeSearchId.current === searchId) {
        activeSearchId.current = null;
        void window.workspaceSearch.cancel(searchId);
      }
    };
  }, [
    active,
    workspaceOpen,
    workspaceVersion,
    query,
    caseSensitive,
    wholeWord,
    regularExpression,
    includePattern,
    excludePattern,
    resultLimit,
  ]);

  const grouped = useMemo(() => {
    const groups = new Map<string, WorkspaceSearchMatch[]>();
    for (const match of matches) groups.set(match.relativePath, [...(groups.get(match.relativePath) ?? []), match]);
    return Array.from(groups.entries());
  }, [matches]);

  const cancel = () => {
    const searchId = activeSearchId.current;
    activeSearchId.current = null;
    if (searchId) void window.workspaceSearch.cancel(searchId);
    setStatus("cancelled");
  };

  return (
    <div className="search-content">
      <div className="search-form">
        <div className="search-input-row">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={workspaceOpen ? "Search project" : "Open a project to search"}
            disabled={!workspaceOpen}
            aria-label="Search project"
          />
          {status === "loading" && <button type="button" onClick={cancel} title="Cancel search">■</button>}
        </div>
        <div className="search-toggles" aria-label="Search options">
          <button type="button" className={caseSensitive ? "active" : ""} aria-pressed={caseSensitive} onClick={() => setCaseSensitive((value) => !value)} title="Match case">Aa</button>
          <button type="button" className={wholeWord ? "active" : ""} aria-pressed={wholeWord} onClick={() => setWholeWord((value) => !value)} title="Match whole word">ab</button>
          <button type="button" className={regularExpression ? "active" : ""} aria-pressed={regularExpression} onClick={() => setRegularExpression((value) => !value)} title="Use regular expression">.*</button>
          <label>
            Limit
            <select value={resultLimit} onChange={(event) => setResultLimit(Number(event.target.value))}>
              {[100, 500, 1_000, 2_000].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
            </select>
          </label>
        </div>
        <input value={includePattern} onChange={(event) => setIncludePattern(event.target.value)} placeholder="Include: src/**, *.ts" aria-label="Include pattern" disabled={!workspaceOpen} />
        <input value={excludePattern} onChange={(event) => setExcludePattern(event.target.value)} placeholder="Exclude: **/*.test.ts" aria-label="Exclude pattern" disabled={!workspaceOpen} />
      </div>

      <div className="search-state" aria-live="polite">
        {!workspaceOpen && <p>Open a local project to search its supported files.</p>}
        {workspaceOpen && status === "idle" && <p>Type a query to search the current project.</p>}
        {status === "loading" && <p>Searching… {matches.length ? `${matches.length} matches found` : ""}</p>}
        {status === "ready" && <p>{matches.length} matches in {grouped.length} files.</p>}
        {status === "empty" && <p>No matches found.</p>}
        {status === "cancelled" && <p>Search cancelled.</p>}
        {status === "error" && <p className="search-error" role="alert">{error}</p>}
        {status === "too_many" && <p className="search-warning">Showing the first {resultLimit} matches. Refine the query or patterns.</p>}
      </div>

      {grouped.length > 0 && (
        <div className="search-results" aria-label="Search results">
          {grouped.map(([relativePath, fileMatches]) => (
            <section className="search-file-group" key={relativePath}>
              <header title={relativePath}>
                <strong>{relativePath}</strong>
                <span>{fileMatches.length}</span>
              </header>
              {fileMatches.map((match, index) => (
                <button
                  key={`${match.line}:${match.column}:${index}`}
                  type="button"
                  className="search-result"
                  onClick={() => onOpenMatch(match)}
                  title={`${relativePath}:${match.line}:${match.column}`}
                >
                  <span className="search-result-line">{match.line}</span>
                  <MatchPreview match={match} />
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
