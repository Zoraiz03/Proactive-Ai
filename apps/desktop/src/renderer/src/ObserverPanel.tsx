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
import type { ProactiveAction, ProactiveNudge } from "../../shared/proactive-observer";
import type { UsefulnessFeedback } from "../../shared/proactive-insights";
import type { ContextTrayItem } from "../../shared/context-tray";
import ContextTray from "./ContextTray";

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
  multiFileDescription: string;
  onMultiFileDescriptionChange: (value: string) => void;
  proactiveNudge: ProactiveNudge | null;
  onProactiveAction: (action: ProactiveAction) => void;
  onProactiveNotNow: () => void;
  onProactiveMute: (scope: "error" | "file" | "project") => void;
  onDisableProactiveAssist: () => void;
  usefulnessPrompt: { eventId: string; title: string } | null;
  onUsefulness: (feedback: UsefulnessFeedback) => void;
  contextTrayItems: readonly ContextTrayItem[];
  maximumContextCharacters: number;
  onRemoveContextItem: (id: string) => void;
  onClearContext: () => void;
  onMoveContextItem: (id: string, direction: -1 | 1) => void;
  onRefreshContextItem: (id: string) => void;
  onKeepOriginalContextItem: (id: string) => void;
  onTruncateContextItem: (id: string) => void;
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
  multiFileDescription,
  onMultiFileDescriptionChange,
  proactiveNudge,
  onProactiveAction,
  onProactiveNotNow,
  onProactiveMute,
  onDisableProactiveAssist,
  usefulnessPrompt,
  onUsefulness,
  contextTrayItems,
  maximumContextCharacters,
  onRemoveContextItem,
  onClearContext,
  onMoveContextItem,
  onRefreshContextItem,
  onKeepOriginalContextItem,
  onTruncateContextItem,
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
        {mode === "plan_multi_file" && <label className="observer-multi-file-request">
          <span>Describe the change</span>
          <textarea value={multiFileDescription} maxLength={500} rows={5} disabled={status === "thinking"} onChange={(event) => onMultiFileDescriptionChange(event.target.value)} placeholder="Describe the outcome that may require coordinated changes across files." />
          <small>{multiFileDescription.length}/500 · planning changes no files</small>
        </label>}
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
        <ContextTray
          items={contextTrayItems}
          maximumCharacters={maximumContextCharacters}
          onRemove={onRemoveContextItem}
          onClear={onClearContext}
          onMove={onMoveContextItem}
          onRefresh={onRefreshContextItem}
          onKeepOriginal={onKeepOriginalContextItem}
          onTruncate={onTruncateContextItem}
        />
      </div>

      {proactiveNudge && (
        <article className="proactive-nudge" aria-label="Proactive Observer suggestion">
          <div className="proactive-nudge-heading">
            <span>Local proactive signal</span>
            <button type="button" onClick={onProactiveNotNow} aria-label="Dismiss proactive suggestion" title="Not now (Escape)">×</button>
          </div>
          <strong>{proactiveNudge.title}</strong>
          <p>{proactiveNudge.event.reason}</p>
          <small>No code or output has been sent. An action opens Context Preview first.</small>
          <div className="proactive-nudge-actions">
            <button type="button" onClick={() => onProactiveAction("investigate")}>Investigate</button>
            <button type="button" onClick={() => onProactiveAction("explain")}>Explain</button>
            <button type="button" onClick={() => onProactiveAction("suggest_fix")}>Suggest Fix</button>
            <button type="button" onClick={onProactiveNotNow}>Not Now</button>
          </div>
          <details>
            <summary>Mute options</summary>
            <div className="proactive-mute-actions">
              <button type="button" onClick={() => onProactiveMute("error")}>Mute this error</button>
              <button type="button" onClick={() => onProactiveMute("file")} disabled={!proactiveNudge.event.relativePath}>Mute this file</button>
              <button type="button" onClick={() => onProactiveMute("project")}>Mute this project</button>
              <button type="button" onClick={onDisableProactiveAssist}>Disable Assist Mode</button>
            </div>
          </details>
        </article>
      )}

      {usefulnessPrompt && (
        <section className="observer-usefulness" aria-label="Optional Observer usefulness feedback">
          <strong>Was this Observer nudge useful?</strong>
          <span>{usefulnessPrompt.title} · optional local feedback</span>
          <div><button type="button" onClick={() => onUsefulness("yes")}>Yes</button><button type="button" onClick={() => onUsefulness("no")}>No</button><button type="button" onClick={() => onUsefulness("skip")}>Skip</button></div>
        </section>
      )}

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
