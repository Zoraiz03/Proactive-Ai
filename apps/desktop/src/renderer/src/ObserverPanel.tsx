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
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProactiveAction, ProactiveNudge } from "../../shared/proactive-observer";
import type { UsefulnessFeedback } from "../../shared/proactive-insights";
import type { ContextTrayItem } from "../../shared/context-tray";
import ContextTray from "./ContextTray";
import type { WebContextBridgeStatus } from "../../shared/web-context-bridge";

export type ObserverStatus = "idle" | "thinking" | "ready" | "error";

const OBSERVER_STATUS_LABELS: Record<ObserverStatus, string> = {
  idle: "Ready",
  thinking: "Reviewing",
  ready: "Suggestion ready",
  error: "Needs attention",
};

interface ObserverPanelProps {
  fixCard?: ReactNode;
  fixVerificationCard?: ReactNode;
  fixProblem?: string;
  onFixProblemChange?: (value:string)=>void;
  explanationCard?: ReactNode;
  explainQuestion?: string;
  onExplainQuestionChange?: (value: string) => void;
  automaticRunEnabled: boolean;
  liveObserverCard: ReactNode;
  automaticRunCard: ReactNode;
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
  webContextStatus: WebContextBridgeStatus;
  maximumContextCharacters: number;
  onRemoveContextItem: (id: string) => void;
  onClearContext: () => void;
  onMoveContextItem: (id: string, direction: -1 | 1) => void;
  onRefreshContextItem: (id: string) => void;
  onKeepOriginalContextItem: (id: string) => void;
  onTruncateContextItem: (id: string) => void;
}

export default function ObserverPanel({
  fixCard, fixVerificationCard, fixProblem = "", onFixProblemChange,
  explanationCard, explainQuestion = "", onExplainQuestionChange,
  automaticRunEnabled,
  liveObserverCard,
  automaticRunCard,
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
  webContextStatus,
  maximumContextCharacters,
  onRemoveContextItem,
  onClearContext,
  onMoveContextItem,
  onRefreshContextItem,
  onKeepOriginalContextItem,
  onTruncateContextItem,
}: ObserverPanelProps) {
  type ObserverTab = "ask" | "live" | "failed-runs" | "context";
  const isExplanationMode = (value: ObserverMode) => value === "explain" || value === "explain_document";
  const explanationModeActive = isExplanationMode(mode);
  const [activeTab, setActiveTab] = useState<ObserverTab>("ask");
  const conversationCard = activeTab === "ask" ? (explanationModeActive ? explanationCard : fixCard) : null;
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusToken > 0) workspaceRef.current?.focus();
  }, [focusToken]);

  return (
    <div ref={workspaceRef} className="observer-workspace" tabIndex={-1} aria-label="Observer panel">
      <header className="observer-header">
        <div className="observer-identity">
          <span className="observer-emblem" aria-hidden="true"><span /></span>
          <div>
            <h2>Observer</h2>
            <p>Focused AI assistance</p>
          </div>
        </div>
        <span className={`observer-status observer-status-${status}`} role="status">
          <span aria-hidden="true" />
          {explanationModeActive && status === "ready" ? "Explanation ready" : OBSERVER_STATUS_LABELS[status]}
        </span>
      </header>

      <nav className="observer-tabs" role="tablist" aria-label="Observer functionality">
        {([
          ["ask", "Ask Observer"],
          ["live", "Live"],
          ["failed-runs", "Failed Runs"],
          ["context", "Context"],
        ] as const).map(([tab, label]) => (
          <button key={tab} id={`observer-tab-${tab}`} type="button" role="tab" data-observer-tab={tab} aria-selected={activeTab === tab} aria-controls={`observer-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)}>{label}</button>
        ))}
      </nav>

      <div id={`observer-panel-${activeTab}`} className="observer-tab-panel" role="tabpanel" data-observer-panel={activeTab} aria-labelledby={`observer-tab-${activeTab}`}>
      {activeTab === "ask" && <section className="observer-controls" aria-label="Ask Observer controls">
        <div className="observer-request-card">
        <div className="observer-request-heading">
          <div><span>Manual request</span><h3>Create a focused request</h3></div>
          <span className="observer-request-mode-badge">{OBSERVER_MODE_LABELS[mode]}</span>
        </div>
        <div className="observer-control-grid">
          <label>
            <span>Request mode</span>
            <select
              className="observer-enhanced-select"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as ObserverMode)}
              disabled={status === "thinking" || Boolean(conversationCard)}
            >
              {modes.map((value) => (
                <option key={value} value={value}>{OBSERVER_MODE_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Provider</span>
            <select
              className="observer-enhanced-select"
              value={provider}
              onChange={(event) => onProviderChange(event.target.value as ObserverProvider)}
              disabled={status === "thinking" || Boolean(conversationCard)}
            >
              {OBSERVER_PROVIDERS.map((value) => (
                <option key={value} value={value}>{OBSERVER_PROVIDER_LABELS[value]}</option>
              ))}
            </select>
          </label>
        </div>
        {explanationModeActive && onExplainQuestionChange && <label className="observer-multi-file-request"><span>Question or instruction (optional)</span><textarea aria-label="Explanation guidance" rows={2} maxLength={500} value={explainQuestion} disabled={status === "thinking" || Boolean(conversationCard)} onChange={e => onExplainQuestionChange(e.target.value)} placeholder="For example: Explain this for a beginner" /><small>Uses selected code, or the current function and nearby lines. You will preview the focused context before it is sent; Context Tray items and other files stay excluded.</small></label>}
        {mode === "fix_error" && onFixProblemChange && <label className="observer-multi-file-request"><span>What should this code do, or what is going wrong?</span><textarea aria-label="Fix Code problem" rows={3} maxLength={500} value={fixProblem} disabled={status === "thinking" || Boolean(conversationCard)} onChange={e=>onFixProblemChange(e.target.value)} placeholder="Optional: describe the expected behavior or problem" /><small>Uses the selection and bounded surroundings, or the active file including unsaved changes. You will preview everything before it is sent.</small></label>}
        {mode === "plan_multi_file" && <label className="observer-multi-file-request">
          <span>Describe the change</span>
          <textarea value={multiFileDescription} maxLength={500} rows={5} disabled={status === "thinking"} onChange={(event) => onMultiFileDescriptionChange(event.target.value)} placeholder="Describe the outcome that may require coordinated changes across files." />
          <small>{multiFileDescription.length}/500 · planning changes no files</small>
        </label>}
        <div className={`observer-context-summary ${contextSummary ? "ready" : "empty"}`}>
          <span aria-hidden="true">◎</span>
          <div><strong>Context preview</strong><p>{contextSummary ?? (mode === "fix_error"
            ? "Select code or open a file for Fix Code; diagnostics are optional."
            : "Open a supported code or Markdown file to choose focused context.")}</p></div>
        </div>
        <div className="observer-primary-actions">
          <button
            type="button"
            className="observer-ask"
            onClick={onAsk}
            disabled={!canAsk}
            title="Ask Observer (Ctrl+Enter / Cmd+Enter)"
          >
            {status === "thinking" ? explanationModeActive ? "Explaining…" : "Asking Observer…" : explanationModeActive ? "Explain" : "Ask Observer"}
          </button>
          <button type="button" className="observer-undo" onClick={onUndo} disabled={!canUndo}>Undo</button>
        </div>
        <span className="observer-shortcut">{explanationModeActive ? "Explain" : "Ask"} with Ctrl/⌘ + Enter</span>
        </div>
      </section>}

      <div className="observer-scroll-region">
        {activeTab === "live" && liveObserverCard}
        {activeTab === "failed-runs" && automaticRunCard}
        {activeTab === "context" && <ContextTray
          items={contextTrayItems}
          maximumCharacters={maximumContextCharacters}
          webContextStatus={webContextStatus}
          onRemove={onRemoveContextItem}
          onClear={onClearContext}
          onMove={onMoveContextItem}
          onRefresh={onRefreshContextItem}
          onKeepOriginal={onKeepOriginalContextItem}
          onTruncate={onTruncateContextItem}
        />}

        {activeTab === "ask" && proactiveNudge && (
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

        {activeTab === "ask" && usefulnessPrompt && (
          <section className="observer-usefulness" aria-label="Optional Observer usefulness feedback">
            <strong>Was this Observer nudge useful?</strong>
            <span>{usefulnessPrompt.title} · optional local feedback</span>
            <div><button type="button" onClick={() => onUsefulness("yes")}>Yes</button><button type="button" onClick={() => onUsefulness("no")}>No</button><button type="button" onClick={() => onUsefulness("skip")}>Skip</button></div>
          </section>
        )}

        {conversationCard}
        {activeTab === "ask" && fixVerificationCard}
        {activeTab === "ask" && !conversationCard && <div className="observer-result" aria-live="polite">
          {status === "idle" && (
            <div className="observer-empty">
              <span className="observer-state-emblem" aria-hidden="true"><span /></span>
              <div className="observer-empty-copy"><span className="observer-state-label">Manual assistant</span><strong>Ready for focused help</strong>
              <p>{automaticRunEnabled ? "Auto-explain is watching failed runs, and manual help remains available here." : "Choose a request mode and describe what you need. Observer will prepare only the relevant context."}</p></div>
              <div className="observer-empty-features"><span>✓ Preview before sending</span><span>✓ No automatic edits</span></div>
            </div>
          )}
          {status === "thinking" && (
            <div className="observer-loading" role="status">
              <span className="observer-state-emblem pulse" aria-hidden="true"><span /></span>
              <strong>Reviewing focused context</strong>
              <p>{contextSummary}</p>
            </div>
          )}
          {status === "error" && (
            <div className="observer-error" role="alert">
              <span className="observer-state-label">Request error</span>
              <strong>Observer request failed</strong>
              <p>{error}</p>
              <button type="button" onClick={onDismiss}>Dismiss</button>
            </div>
          )}
          {status === "ready" && suggestion && (
            <article className="observer-suggestion">
              <div className="observer-card-heading">
                <div>
                  <span className="observer-state-label">Observer suggestion</span>
                  <strong>Focused review</strong>
                </div>
                <button type="button" onClick={onDismiss} aria-label="Dismiss suggestion" title="Dismiss (Escape)">×</button>
              </div>
              {suggestion.historyWarning && <p role="status" className="observer-reason">{suggestion.historyWarning}</p>}
              <p className="observer-explanation">{suggestion.explanation}</p>
              <section className="observer-reason-block" aria-label="Suggestion reason">
                <span>Why this suggestion</span>
                <p className="observer-reason">{suggestion.reason}</p>
              </section>
              {suggestion.snippet && <pre tabIndex={0}><code>{suggestion.snippet}</code></pre>}
              <div className="observer-actions">
                {suggestion.snippet && (
                  <button type="button" className="primary" onClick={onCopy}>
                    {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy snippet"}
                  </button>
                )}
                <button type="button" onClick={onDismiss}>Dismiss</button>
              </div>
            </article>
          )}
        </div>}
      </div>
      </div>

      <div className="observer-privacy-note observer-trust-note">
        <span aria-hidden="true">✓</span><div><strong>Privacy first</strong><p>Manual requests always show Context Preview. Automatic features send only bounded context when you enable them. No project-wide uploads or automatic edits.</p></div>
      </div>
    </div>
  );
}
