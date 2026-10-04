import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  SEARCH_LIMITS,
  type WorkspaceFileSuggestion,
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
  return <span className="search-match-preview">{match.preview.slice(0, start)}<mark>{match.preview.slice(start, end)}</mark>{match.preview.slice(end)}</span>;
}

function HighlightedPath({ suggestion }: { suggestion: WorkspaceFileSuggestion }) {
  const highlighted = new Set(suggestion.matchIndices);
  return <span className="search-file-path">{Array.from(suggestion.relativePath).map((character, index) => highlighted.has(index)
    ? <mark key={index}>{character}</mark>
    : <span key={index}>{character}</span>)}</span>;
}

export default function SearchPanel({ active, workspaceOpen, workspaceVersion, focusToken, onOpenMatch }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regularExpression, setRegularExpression] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [resultLimit, setResultLimit] = useState<number>(SEARCH_LIMITS.defaultResults);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [matches, setMatches] = useState<WorkspaceSearchMatch[]>([]);
  const [files, setFiles] = useState<WorkspaceFileSuggestion[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeSearchId = useRef<string | null>(null);

  useEffect(() => window.workspaceSearch.onBatch((batch) => {
    if (batch.searchId !== activeSearchId.current) return;
    if (batch.matches.length) setMatches((current) => [...current, ...batch.matches]);
    if (batch.files?.length) setFiles((current) => [...current, ...batch.files!]);
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
      setFiles([]);
      setCollapsedGroups(new Set());
      setError(null);
      return;
    }

    const searchId = crypto.randomUUID();
    activeSearchId.current = searchId;
    setStatus("loading");
    setMatches([]);
    setFiles([]);
    setCollapsedGroups(new Set());
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
        } else {
          if (result.value.files) setFiles(result.value.files);
          if (result.value.cancelled) setStatus("cancelled");
          else if (result.value.truncated) setStatus("too_many");
          else if (result.value.matchCount === 0 && result.value.fileCount === 0) setStatus("empty");
          else setStatus("ready");
        }
      });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      if (activeSearchId.current === searchId) {
        activeSearchId.current = null;
        void window.workspaceSearch.cancel(searchId);
      }
    };
  }, [active, workspaceOpen, workspaceVersion, query, caseSensitive, wholeWord, regularExpression, includePattern, excludePattern, resultLimit]);

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

  const clear = () => {
    cancel();
    setQuery("");
    setStatus("idle");
    setMatches([]);
    setFiles([]);
    setCollapsedGroups(new Set());
    inputRef.current?.focus();
  };

  const openFile = (relativePath: string) => onOpenMatch({ relativePath, line: 1, column: 1, endColumn: 1, preview: "", previewMatchStart: 0, previewMatchLength: 0 });

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = contentRef.current;
    if (!root) return;
    const selectables = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-search-selectable]"))
      .filter((item) => item.offsetParent !== null);
    const currentIndex = selectables.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!selectables.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0 ? (direction > 0 ? 0 : selectables.length - 1) : (currentIndex + direction + selectables.length) % selectables.length;
      selectables[nextIndex]?.focus();
    } else if (event.key === "Enter" && currentIndex >= 0) {
      event.preventDefault();
      selectables[currentIndex]?.click();
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      clear();
    }
  };

  const toggleGroup = (relativePath: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (next.has(relativePath)) next.delete(relativePath);
    else next.add(relativePath);
    return next;
  });

  return (
    <div className="search-content" ref={contentRef} onKeyDown={handleKeyboard}>
      <div className="search-form">
        <div className="search-input-row">
          <span className="search-input-shell">
            <span aria-hidden="true" className="search-input-icon">⌕</span>
            <input ref={inputRef} className="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={workspaceOpen ? "Search files and content" : "Open a project to search"} disabled={!workspaceOpen} aria-label="Search project" />
            {query && <button type="button" className="search-clear" onClick={clear} aria-label="Clear search" title="Clear search">×</button>}
          </span>
          {status === "loading" && <button className="search-cancel" type="button" onClick={cancel} title="Cancel search" aria-label="Cancel search">■</button>}
        </div>
        <div className="search-toggles" aria-label="Search options">
          <button type="button" className={caseSensitive ? "active" : ""} aria-pressed={caseSensitive} onClick={() => setCaseSensitive((value) => !value)} title="Match case">Aa</button>
          <button type="button" className={wholeWord ? "active" : ""} aria-pressed={wholeWord} onClick={() => setWholeWord((value) => !value)} title="Match whole word"><u>ab</u></button>
          <button type="button" className={regularExpression ? "active" : ""} aria-pressed={regularExpression} onClick={() => setRegularExpression((value) => !value)} title="Use regular expression">.*</button>
        </div>
        <details className="search-filters">
          <summary><span>Filters</span>{(includePattern || excludePattern || resultLimit !== SEARCH_LIMITS.defaultResults) && <span className="search-filter-active">Active</span>}</summary>
          <div className="search-filter-fields">
            <label><span>Files to include</span><input value={includePattern} onChange={(event) => setIncludePattern(event.target.value)} placeholder="src/**, *.ts" aria-label="Include pattern" disabled={!workspaceOpen} /></label>
            <label><span>Files to exclude</span><input value={excludePattern} onChange={(event) => setExcludePattern(event.target.value)} placeholder="**/*.test.ts" aria-label="Exclude pattern" disabled={!workspaceOpen} /></label>
            <label className="search-limit"><span>Result limit</span><select value={resultLimit} onChange={(event) => setResultLimit(Number(event.target.value))}>{[100, 500, 1_000, 2_000].map((limit) => <option key={limit} value={limit}>{limit.toLocaleString()}</option>)}</select></label>
          </div>
        </details>
      </div>

      <div className="search-state" aria-live="polite">
        <div className="search-state-copy">
          {!workspaceOpen && <p>Open a local project to search its supported files.</p>}
          {workspaceOpen && status === "idle" && <p>Search filenames and content across your project.</p>}
          {status === "loading" && <p>Searching… {matches.length || files.length ? `${files.length} files · ${matches.length} matches` : ""}</p>}
          {status === "ready" && <p>{files.length} filename suggestions · {matches.length} matches in {grouped.length} files</p>}
          {status === "empty" && <p>No filename or content matches found.</p>}
          {status === "cancelled" && <p>Search cancelled.</p>}
          {status === "error" && <p className="search-error" role="alert">{error}</p>}
          {status === "too_many" && <p className="search-warning">Showing the first {resultLimit} matches. Refine the query or filters.</p>}
        </div>
        {grouped.length > 0 && <button type="button" className="search-collapse-all" aria-label="Collapse all result groups" title="Collapse all result groups" onClick={() => setCollapsedGroups(new Set(grouped.map(([relativePath]) => relativePath)))}>Collapse all</button>}
      </div>

      {status === "idle" && workspaceOpen && <div className="search-empty"><span className="search-empty-icon" aria-hidden="true">⌕</span><strong>Search your project</strong><p>Find files by name or text inside supported files.</p><kbd>Ctrl/⌘ + Shift + F</kbd></div>}

      {(files.length > 0 || grouped.length > 0) && <div className="search-results" aria-label="Search results">
        {files.length > 0 && <section className="search-filename-results" aria-label="Filename suggestions">
          <header><strong>Files</strong><span>{files.length}</span></header>
          {files.map((file) => <button key={file.relativePath} type="button" className="search-file-suggestion" data-search-selectable onClick={() => openFile(file.relativePath)} title={`Open ${file.relativePath}`}><span className="search-file-icon" aria-hidden="true">◇</span><HighlightedPath suggestion={file} /><span className="search-file-open" aria-hidden="true">↵</span></button>)}
        </section>}
        {grouped.length > 0 && <div className="search-content-results-heading">Content matches</div>}
        {grouped.map(([relativePath, fileMatches]) => {
          const collapsed = collapsedGroups.has(relativePath);
          return <section className="search-file-group" key={relativePath}>
            <header title={relativePath}><button type="button" onClick={() => toggleGroup(relativePath)} aria-expanded={!collapsed}><span className="search-group-chevron" aria-hidden="true">{collapsed ? "›" : "⌄"}</span><strong>{relativePath}</strong><span className="search-count">{fileMatches.length}</span></button></header>
            {!collapsed && fileMatches.map((match, index) => <button key={`${match.line}:${match.column}:${index}`} type="button" className="search-result" data-search-selectable onClick={() => onOpenMatch(match)} title={`${relativePath}:${match.line}:${match.column}`}><span className="search-result-line">{match.line}</span><MatchPreview match={match} /></button>)}
          </section>;
        })}
      </div>}
    </div>
  );
}
