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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  improveCard?: ReactNode;
  improveGoal?: 'readability'|'performance';
  improveInstruction?: string;
  improveFullFile?: boolean;
  onImproveGoalChange?: (value:'readability'|'performance')=>void;
  onImproveInstructionChange?: (value:string)=>void;
  onImproveFullFileChange?: (value:boolean)=>void;
  fixCard?: ReactNode;
  fixVerificationCard?: ReactNode;
  fixProblem?: string;
  onFixProblemChange?: (value:string)=>void;
  explanationCard?: ReactNode;
  explainQuestion?: string;
  explainScopeControl?: ReactNode;
  onExplainQuestionChange?: (value: string) => void;
  automaticRunEnabled: boolean;
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
  improveCard, improveGoal="readability", improveInstruction="", improveFullFile=false, onImproveGoalChange, onImproveInstructionChange, onImproveFullFileChange,
  fixCard, fixVerificationCard, fixProblem = "", onFixProblemChange,
  explanationCard, explainScopeControl, explainQuestion = "", onExplainQuestionChange,
  automaticRunEnabled,
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
  const conversationCard = explanationCard ?? fixCard ?? improveCard;
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<"conversation" | "context">("conversation");
  const tabId = useId();
  const conversationTabRef = useRef<HTMLButtonElement>(null);
  const contextTabRef = useRef<HTMLButtonElement>(null);
  const selectTab = (tab: "conversation" | "context") => {
    setActiveTab(tab);
    (tab === "conversation" ? conversationTabRef : contextTabRef).current?.focus();
  };
  useEffect(() => {
    if (focusToken > 0) {
      setActiveTab("conversation");
      conversationTabRef.current?.focus();
    }
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
          {mode === "explain" && status === "ready" ? "Explanation ready" : OBSERVER_STATUS_LABELS[status]}
        </span>
      </header>

      <div className="observer-tabs" role="tablist" aria-label="Observer views" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectTab(event.key === "Home" ? "conversation" : event.key === "End" ? "context" : activeTab === "conversation" ? "context" : "conversation");
      }}>
        <button ref={conversationTabRef} type="button" role="tab" id={`${tabId}-conversation-tab`} aria-controls={`${tabId}-conversation`} aria-selected={activeTab === "conversation"} tabIndex={activeTab === "conversation" ? 0 : -1} onClick={() => selectTab("conversation")}>Conversation</button>
        <button ref={contextTabRef} type="button" role="tab" id={`${tabId}-context-tab`} aria-controls={`${tabId}-context`} aria-selected={activeTab === "context"} tabIndex={activeTab === "context" ? 0 : -1} onClick={() => selectTab("context")}>Project Context <span aria-label={`${contextTrayItems.length} attachments`}>({contextTrayItems.length})</span></button>
      </div>
      {/* Keep both panels mounted: tab navigation must not reset drafts or request state. */}
      <section className="observer-tab-panel observer-conversation-panel" role="tabpanel" id={`${tabId}-conversation`} aria-labelledby={`${tabId}-conversation-tab`} hidden={activeTab !== "conversation"} tabIndex={0}>
      <section className="observer-controls" aria-label="Observer request controls">
        <div className="observer-control-grid">
          <label>
            <span>Request mode</span>
            <select
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
        {mode === "explain" && explainScopeControl}
        {mode === "explain" && onExplainQuestionChange && <label className="observer-multi-file-request"><span>Question or instruction (optional)</span><textarea aria-label="Explanation guidance" rows={2} maxLength={500} value={explainQuestion} disabled={status === "thinking" || Boolean(conversationCard)} onChange={e => onExplainQuestionChange(e.target.value)} placeholder="Explain this for a beginner" /><small>Choose an explicit scope and preview before sending. Context Tray and other files are not included in Explain.</small></label>}
        {mode === "improve_code" && onImproveGoalChange && <div className="observer-multi-file-request"><label>Improvement goal<select aria-label="Improvement goal" value={improveGoal} disabled={status==="thinking"||Boolean(conversationCard)} onChange={e=>onImproveGoalChange(e.target.value as 'readability'|'performance')}><option value="readability">Readability &amp; maintainability</option><option value="performance">Performance</option></select></label><label>Optional instruction<textarea aria-label="Improvement instruction" rows={3} maxLength={500} value={improveInstruction} disabled={status==="thinking"||Boolean(conversationCard)} onChange={e=>onImproveInstructionChange?.(e.target.value)} placeholder="Reduce duplication without changing the public API."/></label><label><input type="checkbox" aria-label="Approve active file scope" checked={improveFullFile} disabled={status==="thinking"||Boolean(conversationCard)} onChange={e=>onImproveFullFileChange?.(e.target.checked)}/> Explicitly approve active-file scope when no code is selected</label><small>Selection first, otherwise the current function. If no function is found, select code or approve the file above. Exact code and optional read-only configuration are previewed; never silently truncated.</small></div>}
        {mode === "fix_error" && onFixProblemChange && <label className="observer-multi-file-request"><span>What should this code do, or what is going wrong?</span><textarea aria-label="Fix Code problem" rows={3} maxLength={500} value={fixProblem} disabled={status === "thinking" || Boolean(conversationCard)} onChange={e=>onFixProblemChange(e.target.value)} placeholder="Optional: describe the expected behavior or problem" /><small>Selected code plus bounded surrounding lines, otherwise the entire active file including unsaved changes. Preview before sending. No Context Tray or other files.</small></label>}
        {mode === "plan_multi_file" && <label className="observer-multi-file-request">
          <span>Describe the change</span>
          <textarea value={multiFileDescription} maxLength={500} rows={5} disabled={status === "thinking"} onChange={(event) => onMultiFileDescriptionChange(event.target.value)} placeholder="Describe the outcome that may require coordinated changes across files." />
          <small>{multiFileDescription.length}/500 · planning changes no files</small>
        </label>}
        <div className={`observer-context-summary ${contextSummary ? "ready" : "empty"}`}>
          <span aria-hidden="true">◎</span>
          <p>{contextSummary ?? (mode === "fix_error"
            ? "Select code or open a file for Fix Code; diagnostics are optional."
            : "Open a supported code or Markdown file to choose focused context.")}</p>
        </div>
        <div className="observer-primary-actions">
          <button
            type="button"
            className="observer-ask"
            onClick={onAsk}
            disabled={!canAsk}
            title="Ask Observer (Ctrl+Enter / Cmd+Enter)"
          >
            {status === "thinking" ? "Asking Observer…" : "Ask Observer"}
          </button>
          <button type="button" className="observer-undo" onClick={onUndo} disabled={!canUndo}>Undo</button>
        </div>
        <span className="observer-shortcut">Ask with Ctrl/⌘ + Enter</span>
      </section>

      <div className="observer-scroll-region">
        {automaticRunCard}

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

        {conversationCard}
        {fixVerificationCard}
        {!conversationCard && <div className="observer-result" aria-live="polite">
          {status === "idle" && (
            <div className="observer-empty">
              <span className="observer-state-emblem" aria-hidden="true"><span /></span>
              <strong>Ready when you are</strong>
              <p>{automaticRunEnabled ? "Auto-explain is enabled for failed runs. Ask Observer remains available for manual help." : "Ask Observer for help, or explicitly enable Auto-explain for failed runs."}</p>
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

      </section>
      <section className="observer-tab-panel observer-project-context-panel" role="tabpanel" id={`${tabId}-context`} aria-labelledby={`${tabId}-context-tab`} hidden={activeTab !== "context"} tabIndex={0}>
        <p className="observer-context-eligibility">Attachments are local and session-only. Explain, Fix Code, Improve Code, Live Observer and automatic error help do not use this tray. Other workflows show included sources in Context Preview.</p>
        <button type="button" className="observer-return-conversation" onClick={() => selectTab("conversation")}>{status === "thinking" ? "Return to Conversation for request and cancellation controls" : "Return to Conversation"}</button>
        <ContextTray
          items={contextTrayItems}
          maximumCharacters={maximumContextCharacters}
          webContextStatus={webContextStatus}
          onRemove={onRemoveContextItem}
          onClear={onClearContext}
          onMove={onMoveContextItem}
          onRefresh={onRefreshContextItem}
          onKeepOriginal={onKeepOriginalContextItem}
          onTruncate={onTruncateContextItem}
        />
      </section>

      <div className="observer-privacy-note">
        Manual requests show Context Preview. Auto-explain, when explicitly enabled, sends bounded failed-run context without another preview. No project-wide upload or automatic edits.
      </div>
    </div>
  );
}
