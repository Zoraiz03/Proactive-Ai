import type {
  ObserverMode,
  ObserverProvider,
  ObserverSuggestion,
} from "../../shared/observer";
import {
  OBSERVER_MODE_LABELS,
  OBSERVER_PROVIDERS,
  OBSERVER_PROVIDER_LABELS,
} from "../../shared/observer";
import { useEffect, useRef } from "react";

export type ObserverStatus = "idle" | "thinking" | "ready" | "error";

interface ObserverPanelProps {
  mode: ObserverMode;
  modes: readonly ObserverMode[];
  provider: ObserverProvider;
  status: ObserverStatus;
  contextSummary: string | null;
  suggestion: ObserverSuggestion | null;
  error: string | null;
  copyStatus: "idle" | "copied" | "error";
  canAsk: boolean;
  onModeChange: (mode: ObserverMode) => void;
  onProviderChange: (provider: ObserverProvider) => void;
  onAsk: () => void;
  onCopy: () => void;
  onDismiss: () => void;
  onUndo: () => void;
  canUndo: boolean;
  focusToken: number;
}

export default function ObserverPanel({
  mode,
  modes,
  provider,
  status,
  contextSummary,
  suggestion,
  error,
  copyStatus,
  canAsk,
  onModeChange,
  onProviderChange,
  onAsk,
  onCopy,
  onDismiss,
  onUndo,
  canUndo,
  focusToken,
}: ObserverPanelProps) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusToken > 0) workspaceRef.current?.focus();
  }, [focusToken]);

  return (
    <div ref={workspaceRef} className="observer-workspace" tabIndex={-1} aria-label="Observer panel">
      <div className="observer-controls">
        <label>
          <span>Request mode</span>
          <select
            value={mode}
            onChange={(event) => onModeChange(event.target.value as ObserverMode)}
            disabled={status === "thinking"}
          >
            {modes.map((value) => (
              <option key={value} value={value}>{OBSERVER_MODE_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Provider</span>
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as ObserverProvider)}
            disabled={status === "thinking"}
          >
            {OBSERVER_PROVIDERS.map((value) => (
              <option key={value} value={value}>{OBSERVER_PROVIDER_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <div className={`observer-context-summary ${contextSummary ? "ready" : "empty"}`}>
          <span aria-hidden="true">◎</span>
          <p>{contextSummary ?? (mode === "fix_error"
            ? "Run the active file and select Fix Error when a diagnostic is available."
            : "Open a supported code or Markdown file to choose focused context.")}</p>
        </div>
        <button
          type="button"
          className="observer-ask"
          onClick={onAsk}
          disabled={!canAsk}
          title="Ask Observer (Ctrl+Enter / Cmd+Enter)"
        >
          {status === "thinking" ? "Asking Observer…" : "Ask Observer"}
        </button>
        <span className="observer-shortcut">Ctrl/⌘ + Enter</span>
        <button type="button" onClick={onUndo} disabled={!canUndo}>Undo Observer Change</button>
      </div>

      <div className="observer-result" aria-live="polite">
        {status === "idle" && (
          <div className="observer-empty">
            <div className="observer-orb" aria-hidden="true" />
            <p>Observer sends nothing until you explicitly ask.</p>
          </div>
        )}
        {status === "thinking" && (
          <div className="observer-loading" role="status">
            <div className="observer-orb pulse" aria-hidden="true" />
            <strong>Reviewing focused context</strong>
            <p>{contextSummary}</p>
          </div>
        )}
        {status === "error" && (
          <div className="observer-error" role="alert">
            <strong>Observer request failed</strong>
            <p>{error}</p>
            <button type="button" onClick={onDismiss}>Dismiss</button>
          </div>
        )}
        {status === "ready" && suggestion && (
          <article className="observer-suggestion">
            <div className="observer-card-heading">
              <strong>Suggestion</strong>
              <button type="button" onClick={onDismiss} aria-label="Dismiss suggestion" title="Dismiss (Escape)">
                ×
              </button>
            </div>
            <p className="observer-explanation">{suggestion.explanation}</p>
            <p className="observer-reason">{suggestion.reason}</p>
            {suggestion.snippet && <pre><code>{suggestion.snippet}</code></pre>}
            <div className="observer-actions">
              {suggestion.snippet && (
                <>
                  <button type="button" onClick={onCopy}>
                    {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy snippet"}
                  </button>
                </>
              )}
              <button type="button" onClick={onDismiss}>Dismiss</button>
            </div>
          </article>
        )}
      </div>

      <div className="observer-privacy-note">
        Context is built locally and shown before sending. No project-wide upload, indexing, or automatic request occurs.
      </div>
    </div>
  );
}
