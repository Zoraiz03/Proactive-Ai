import { useExplanation } from "./useExplanation";
import ExplanationConversation from "./ExplanationConversation";
import { createLiveEditReporter, liveBlockReason } from "./live-editor-events";
import { LIVE_CONFIG, LIVE_OFF, type LiveState, type LiveEdit } from "../../shared/live-observer";
import LiveObserverCard from "./LiveObserverCard";
import Editor from "@monaco-editor/react";
import { AUTOMATIC_RUN_CONFIG, AUTOMATIC_RUN_OFF, type AutomaticRunState } from "../../shared/automatic-run";
import AutomaticRunCard from "./AutomaticRunCard";
import type { editor as MonacoEditor } from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { monacoLanguageForFile } from "../../shared/languages";
import {
  extractMarkdownHeadings,
  isMarkdownFile,
  type MarkdownViewMode,
} from "../../shared/markdown";
import {
  batchChangesFile,
  batchDeletesPath,
  resolveExternalFileUpdate,
} from "../../shared/external-sync";
import {
  replaceWorkspaceEntryPath,
  workspaceEntryContainsPath,
} from "../../shared/workspace-paths";
import type {
  FileReadErrorCode,
  WorkspaceChangeBatch,
  WorkspaceEntry,
  WorkspaceTextFile,
  OpenWorkspace,
} from "../../shared/workspace";
import type { RunDiagnostic } from "../../shared/runner";
import type { DesktopAuthUser } from "../../shared/auth";
import { searchMatchSelection, type WorkspaceSearchMatch } from "../../shared/search";
import {
  copyObserverSnippet,
  isObserverAskShortcut,
  isObserverDismissShortcut,
  CODE_OBSERVER_MODES,
  DOCUMENT_OBSERVER_MODES,
  OBSERVER_MODE_LABELS,
  relevantObserverRunError,
  type ObserverMode,
  type ObserverProvider,
  type ObserverRequest,
  type ObserverPrepareRequest,
  type ObserverSuggestion,
} from "../../shared/observer";
import Explorer from "./Explorer";
import BottomPanel, { type IdeOutputMessage, type RunOutputState } from "./BottomPanel";
import ObserverPanel, { type ObserverStatus } from "./ObserverPanel";
import MarkdownPreview from "./MarkdownPreview";
import SearchPanel from "./SearchPanel";
import WelcomeScreen from "./WelcomeScreen";
import CommandPalette from "./CommandPalette";
import SettingsPanel from "./SettingsPanel";
import SourceControlPanel from "./SourceControlPanel";
import GitDiffViewer from "./GitDiffViewer";
import ContextPreview from "./ContextPreview";
import ObserverEditReview, { type ObserverEditReviewState } from "./ObserverEditReview";
import { MultiFileAppliedSummary, MultiFileChangeReview, MultiFilePlanReview } from "./MultiFileChangeWorkspace";
import { sha256Text, validateAndBuildProposedEdit } from "../../shared/ai-edit";
import { requiresCompleteFileConfirmation } from "../../shared/project-context";
import type { GitChangedFile, GitDiffSnapshot } from "../../shared/git";
import type { MultiFileApplyResult, MultiFileBase, MultiFileChangeSet, MultiFileLimits, MultiFilePlan } from "../../shared/multi-file-change";
import {
  DEFAULT_LOCAL_SETTINGS,
  DEFAULT_SYNCED_SETTINGS,
  isExcludedFromAiContext,
  isMandatorySecretFile,
  monacoOptionsFromSettings,
  type LocalSettings,
  type ProviderStatus,
  type SyncedSettings,
} from "../../shared/settings";
import {
  resolveCommands,
  shouldOpenCommandPalette,
  shouldOpenSettings,
  shouldOpenSourceControl,
  shouldPreserveTerminalShortcut,
  safeVerificationCommands,
  type CommandHandlers,
  type CommandState,
} from "./commands";
import {
  ProactiveObserverEngine,
  type DiagnosticSignal,
  type ProactiveAction,
  type ProactiveEvent,
  type ProactiveNudge,
  type ProactiveObservation,
  type ProactiveOutcome,
  type ProactiveSettingsSnapshot,
} from "../../shared/proactive-observer";
import type { AssistPreset, InsightAction, InsightDetectorType, UsefulnessFeedback } from "../../shared/proactive-insights";
import {
  contextTrayTotal,
  createContextTrayItem,
  findContextTrayDuplicate,
  keepOriginalContextTrayItem,
  markContextTrayPathStale,
  refreshContextTrayItem,
  reorderContextTray,
  redactContextSecrets,
  truncateContextTrayItem,
  validateContextTrayItem,
  type ContextTrayItem,
  type CreateContextTrayItemInput,
} from "../../shared/context-tray";
import type { IncomingWebContext, WebContextBridgeStatus } from "../../shared/web-context-bridge";
import IncomingWebContextReview from "./IncomingWebContextReview";
import DocumentationImpactPanel from "./DocumentationImpactPanel";
import type { ChangedCodeSource, DocumentationRelationship, RelationshipDecision } from "../../shared/documentation-impact";
import DocumentationUpdateWorkspace, { type DocumentationUpdateView } from "./DocumentationUpdateWorkspace";
import ModalFocusManager from "./ModalFocusManager";
import { validateDocumentationEdit, type DocumentationUpdateContext } from "../../shared/documentation-update";
import { MONACO_CREAM_THEME } from "./theme";

const PANE_LIMITS = {
  sidebar: { min: 180, max: 320, initial: 230 },
  observer: { min: 230, max: 380, initial: 290 },
  bottom: { min: 160, max: 360, initial: 220 },
} as const;

type ResizablePane = keyof typeof PANE_LIMITS;

type SaveStatus = { kind: "success" | "error"; message: string };

function markdownSectionAt(content: string, line: number) {
  const lines = content.split(/\r?\n/); let start = Math.max(0, Math.min(lines.length - 1, line - 1));
  while (start > 0 && !/^#{1,6}\s+/.test(lines[start])) start -= 1;
  if (!/^#{1,6}\s+/.test(lines[start])) start = Math.max(0, line - 2);
  let end = start + 1; while (end < lines.length && !/^#{1,6}\s+/.test(lines[end])) end += 1;
  const sectionLines = lines.slice(start, end); const heading = sectionLines[0]?.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1] ?? "";
  return { heading, text: sectionLines.join("\n"), range: { start: { line: start + 1, column: 1 }, end: { line: Math.max(start + 1, end), column: (lines[Math.max(start, end - 1)]?.length ?? 0) + 1 } } };
}

interface EditorTab {
  file: WorkspaceTextFile;
  draft: string;
  saving: boolean;
  saveStatus: SaveStatus | null;
  availability: "available" | "unavailable";
  externalConflict: WorkspaceTextFile | null;
  externalNotice: string | null;
  autoSaveBlocked?: boolean;
}

type EditorSurface =
  | { status: "idle" }
  | { status: "loading"; name: string; relativePath: string }
  | {
      status: "error";
      name: string;
      relativePath: string;
      message: string;
      code: FileReadErrorCode;
    };

type UnsavedChoice = "save" | "discard" | "cancel";

interface UnsavedPrompt {
  title: string;
  message: string;
  saveLabel: string;
  allowDiscard?: boolean;
  resolve: (choice: UnsavedChoice) => void;
}

interface EditorLocation {
  relativePath: string;
  line: number;
  column: number;
  endColumn?: number;
  token: number;
}

interface EditorObserverSnapshot {
  relativePath: string;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  selectedLineStart?: number;
  selectedLineEnd?: number;
  nearbyCode: string;
}

function currentSymbolContext(content: string, cursorLine: number): { content: string; lineStart: number; lineEnd: number; name: string } | null {
  const lines = content.split(/\r?\n/);
  const pattern = /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|def)\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/;
  let start = -1; let name = "";
  for (let index = Math.min(lines.length, Math.max(1, cursorLine)) - 1; index >= 0; index -= 1) {
    const match = pattern.exec(lines[index]);
    if (match) { start = index; name = match[1] ?? match[2]; break; }
  }
  if (start < 0) return null;
  let end = Math.min(lines.length, start + 80);
  for (let index = start + 1; index < end; index += 1) if (pattern.test(lines[index]) && /^\S/.test(lines[index])) { end = index; break; }
  return { content: lines.slice(start, end).join("\n"), lineStart: start + 1, lineEnd: end, name };
}

function currentMarkdownSection(content: string, cursorLine: number): { content: string; lineStart: number; lineEnd: number; title: string } {
  const lines = content.split(/\r?\n/); let start = 0;
  for (let index = Math.min(lines.length, Math.max(1, cursorLine)) - 1; index >= 0; index -= 1) if (/^#{1,6}\s+/.test(lines[index])) { start = index; break; }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) if (/^#{1,6}\s+/.test(lines[index])) { end = index; break; }
  return { content: lines.slice(start, end).join("\n"), lineStart: start + 1, lineEnd: end, title: lines[start].replace(/^#{1,6}\s+/, "") || "Document section" };
}

function runSupport(fileName: string): "supported" | "typescript" | "unsupported" {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if ([".py", ".js", ".mjs"].includes(extension)) return "supported";
  return extension === ".ts" ? "typescript" : "unsupported";
}

function isDirty(tab: EditorTab): boolean {
  return tab.draft !== tab.file.content;
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="panel-title">{children}</h2>;
}

function Placeholder({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="placeholder">
      <span className="placeholder-icon" aria-hidden="true">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

interface EditorWorkspaceProps {
  onLiveEdit?: (edit: LiveEdit) => void;
  liveState: LiveState;
  onLiveReview: () => void;
  tabs: EditorTab[];
  activePath: string | null;
  surface: EditorSurface;
  onActivate: (relativePath: string) => void;
  onClose: (relativePath: string) => void;
  onChange: (relativePath: string, content: string, context?: { line: number; column: number; diagnostics: DiagnosticSignal[] }) => void;
  onSave: (relativePath: string) => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
  focusLocation: EditorLocation | null;
  onReloadExternal: (relativePath: string) => void;
  onKeepLocal: (relativePath: string) => void;
  onObserverContextChange: (snapshot: EditorObserverSnapshot) => void;
  onDiagnosticsChange: (relativePath: string, diagnostics: DiagnosticSignal[]) => void;
  onAddContext: (action: "selection" | "symbol" | "excerpt" | "markdown_section") => void;
  markdownViewMode: MarkdownViewMode;
  onMarkdownViewModeChange: (mode: MarkdownViewMode) => void;
  editorSettings: LocalSettings["editor"];
  editorTheme: string;
}

export function EditorWorkspace({
  liveState, onLiveReview, onLiveEdit,
  tabs,
  activePath,
  surface,
  onActivate,
  onClose,
  onChange,
  onSave,
  onRun,
  onStop,
  running,
  focusLocation,
  onReloadExternal,
  onKeepLocal,
  onObserverContextChange,
  onDiagnosticsChange,
  onAddContext,
  markdownViewMode,
  onMarkdownViewModeChange,
  editorSettings,
  editorTheme,
}: EditorWorkspaceProps) {
  const activeTab = tabs.find((tab) => tab.file.relativePath === activePath) ?? null;
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const liveDiagnostics = useRef<DiagnosticSignal[]>([]);
  const liveEditCallback = useRef(onLiveEdit);
  liveEditCallback.current = onLiveEdit;
  const lastEditorContent = useRef(activeTab?.draft ?? "");
  useEffect(() => { lastEditorContent.current = activeTab?.draft ?? ""; }, [activeTab?.draft]);
  const liveReporter = useRef<ReturnType<typeof createLiveEditReporter> | null>(null);
  const activePathRef = useRef(activePath);
  const observerContextRef = useRef(onObserverContextChange);
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !liveState.suggestion || liveState.request?.editBase?.targetRelativePath !== activePath) return;
    const node = document.createElement("aside"); node.className = "live-suggestion live-inline"; node.setAttribute("aria-label", "Live Observer near code");
    const heading = document.createElement("strong"); heading.textContent = `Live Observer · line ${liveState.request.cursorLine} · not tested`;
    const explanation = document.createElement("p"); explanation.textContent = liveState.suggestion.explanation;
    const reason = document.createElement("small"); reason.textContent = liveState.suggestion.reason;
    node.append(heading, explanation, reason);
    if (liveState.suggestion.edit) { const review = document.createElement("button"); review.textContent = "Review diff"; review.onclick = onLiveReview; node.append(review); }
    const dismiss = document.createElement("button"); dismiss.textContent = "Dismiss"; dismiss.onclick = () => window.liveObserver.cancel(); node.append(dismiss);
    const widget: MonacoEditor.IContentWidget = { getId: () => "live-observer", getDomNode: () => node, getPosition: () => ({ position: { lineNumber: liveState.request!.cursorLine, column: 1 }, preference: [2, 1] }), allowEditorOverflow: false, suppressMouseDown: true };
    editor.addContentWidget(widget);
    return () => editor.removeContentWidget(widget);
  }, [liveState, activePath, onLiveReview]);
  activePathRef.current = activePath;
  observerContextRef.current = onObserverContextChange;

  useEffect(() => {
    activePathRef.current = activePath;
    observerContextRef.current = onObserverContextChange;
  }, [activePath, onObserverContextChange]);

  useEffect(() => () => {
    liveReporter.current?.cancel();
    editorDisposablesRef.current.forEach((disposable) => disposable.dispose());
    editorDisposablesRef.current = [];
  }, []);


  useEffect(() => {
    if (!focusLocation || focusLocation.relativePath !== activePath || !editorRef.current) return;
    editorRef.current.setSelection({
      startLineNumber: focusLocation.line,
      startColumn: focusLocation.column,
      endLineNumber: focusLocation.line,
      endColumn: focusLocation.endColumn ?? focusLocation.column,
    });
    editorRef.current.revealLineInCenter(focusLocation.line);
    editorRef.current.focus();
  }, [activePath, focusLocation]);

  const support = activeTab ? runSupport(activeTab.file.name) : "unsupported";
  const markdownActive = Boolean(activeTab && isMarkdownFile(activeTab.file.name));
  const headings = useMemo(
    () => markdownActive && activeTab ? extractMarkdownHeadings(activeTab.draft) : [],
    [activeTab, markdownActive]
  );
  const runDisabled = !activeTab || support !== "supported" || activeTab.availability !== "available" || Boolean(activeTab.externalConflict);
  const runHint = support === "typescript"
    ? "TypeScript runner not configured"
    : support === "unsupported" && activeTab
      ? "This file type cannot be run"
      : null;

  useEffect(() => {
    if (!markdownActive || markdownViewMode !== "preview") return;
    editorRef.current = null;
    editorDisposablesRef.current.forEach((disposable) => disposable.dispose());
    editorDisposablesRef.current = [];
  }, [markdownActive, markdownViewMode]);

  const navigateToHeading = (line: number, id: string) => {
    if (markdownViewMode !== "preview" && editorRef.current) {
      editorRef.current.setPosition({ lineNumber: line, column: 1 });
      editorRef.current.revealLineInCenter(line);
      editorRef.current.focus();
    }
    if (markdownViewMode !== "edit") {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    }
  };

  return (
    <div className="editor-workspace">
      {tabs.length > 0 && (
        <div className="editor-tabs" role="tablist" aria-label="Open files">
          {tabs.map((tab) => {
            const active = tab.file.relativePath === activePath;
            return (
              <div
                key={tab.file.relativePath}
                className={`editor-tab ${active ? "active" : ""}`}
                title={tab.file.relativePath}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="editor-tab-main"
                  onClick={() => onActivate(tab.file.relativePath)}
                >
                  <span className="editor-tab-name">{tab.file.name}</span>
                  {isDirty(tab) && <span className="tab-dirty" aria-label="Unsaved changes">•</span>}
                  {tab.availability === "unavailable" && (
                    <span className="tab-unavailable" aria-label="File unavailable">!</span>
                  )}
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`Close ${tab.file.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.file.relativePath);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab ? (
        <div className="file-editor">
          <div className="file-viewer-bar">
            <span className="active-file-name" title={activeTab.file.relativePath}>
              {activeTab.file.relativePath}
              {isDirty(activeTab) && <span className="dirty-mark"> •</span>}
            </span>
            {markdownActive && (
              <div className="documentation-toolbar" role="group" aria-label="Markdown view">
                {(["edit", "preview", "split"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={markdownViewMode === mode ? "active" : ""}
                    aria-pressed={markdownViewMode === mode}
                    onClick={() => onMarkdownViewModeChange(mode)}
                  >
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <details className="editor-context-actions">
              <summary>Add to Context</summary>
              <div>
                <button type="button" onClick={() => onAddContext("selection")}>Add Selection</button>
                {markdownActive
                  ? <button type="button" onClick={() => onAddContext("markdown_section")}>Add Current Section</button>
                  : <><button type="button" onClick={() => onAddContext("symbol")}>Add Current Symbol</button><button type="button" onClick={() => onAddContext("excerpt")}>Add File Excerpt</button></>}
              </div>
            </details>
            {!markdownActive && runHint && <span className="run-hint">{runHint}</span>}
            {activeTab.saveStatus && (
              <span className={`save-status ${activeTab.saveStatus.kind}`} role="status">
                {activeTab.saveStatus.message}
              </span>
            )}
            {!markdownActive && (
              <button
                type="button"
                className={running ? "run-button stop" : "run-button"}
                onClick={running ? onStop : onRun}
                disabled={!running && runDisabled}
                title={running ? "Stop running file" : "Run current file (Ctrl+R / Cmd+R)"}
              >
                {running ? "■ Stop" : isDirty(activeTab) && support === "supported" ? "▶ Save & Run" : "▶ Run"}
              </button>
            )}
            <button
              type="button"
              className="save-button"
              onClick={() => onSave(activeTab.file.relativePath)}
              disabled={
                !isDirty(activeTab) ||
                activeTab.saving ||
                activeTab.availability === "unavailable" ||
                Boolean(activeTab.externalConflict)
              }
              title="Save (Ctrl+S / Cmd+S)"
            >
              {activeTab.saving ? "Saving…" : "Save"}
            </button>
          </div>
          {activeTab.externalConflict ? (
            <div className="external-file-banner conflict" role="alert">
              <span>This file changed on disk while you have unsaved edits.</span>
              <div className="external-file-actions">
                <button type="button" onClick={() => onReloadExternal(activeTab.file.relativePath)}>
                  Reload external version
                </button>
                <button type="button" className="primary" onClick={() => onKeepLocal(activeTab.file.relativePath)}>
                  Keep my local changes
                </button>
              </div>
            </div>
          ) : activeTab.availability === "unavailable" ? (
            <div className="external-file-banner unavailable" role="alert">
              This file is no longer available on disk. Its editor content is preserved in this tab.
            </div>
          ) : activeTab.externalNotice ? (
            <div className="external-file-banner notice" role="status">{activeTab.externalNotice}</div>
          ) : null}
          <div className={markdownActive ? `markdown-workspace ${markdownViewMode}` : "monaco-host"}>
            {markdownActive && (
              <nav className="markdown-outline" aria-label="Document outline">
                <strong>Outline</strong>
                {headings.length ? headings.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    style={{ paddingLeft: `${8 + (heading.level - 1) * 10}px` }}
                    title={`Line ${heading.line}: ${heading.text}`}
                    onClick={() => navigateToHeading(heading.line, heading.id)}
                  >
                    {heading.text}
                  </button>
                )) : <span>No headings</span>}
              </nav>
            )}
            <div className={markdownActive ? "markdown-content" : "code-editor-content"}>
            {(!markdownActive || markdownViewMode !== "preview") && (
              <div className={markdownActive ? "markdown-editor-pane" : "code-editor-pane"}>
              <Editor
              path={activeTab.file.relativePath}
              value={activeTab.draft}
              language={monacoLanguageForFile(activeTab.file.name)}
              theme={editorTheme}
              onMount={(instance) => {
                editorRef.current = instance;
                lastEditorContent.current = instance.getValue();
                liveReporter.current = createLiveEditReporter(() => {
                  const position = instance.getPosition(); const path = activePathRef.current;
                  return position && path ? { relativePath: path, content: instance.getValue(), line: position.lineNumber, column: position.column, diagnostics: liveDiagnostics.current.slice(0, 100) } : null;
                }, (edit) => liveEditCallback.current?.(edit));
                editorDisposablesRef.current.forEach((disposable) => disposable.dispose());
                const emitObserverContext = () => {
                  const model = instance.getModel();
                  const position = instance.getPosition();
                  const relativePath = activePathRef.current;
                  if (!model || !position || !relativePath) return;
                  const selection = instance.getSelection();
                  const startLine = Math.max(1, position.lineNumber - 20);
                  const endLine = Math.min(model.getLineCount(), position.lineNumber + 20);
                  const selectedCode = selection && !selection.isEmpty()
                    ? model.getValueInRange(selection)
                    : undefined;
                  observerContextRef.current({
                    relativePath,
                    cursorLine: position.lineNumber,
                    cursorColumn: position.column,
                    selectedCode,
                    ...(selectedCode && selection ? { selectedLineStart: selection.startLineNumber, selectedLineEnd: selection.endLineNumber } : {}),
                    nearbyCode: model.getValueInRange({
                      startLineNumber: startLine,
                      startColumn: 1,
                      endLineNumber: endLine,
                      endColumn: model.getLineMaxColumn(endLine),
                    }),
                  });
                };
                editorDisposablesRef.current = [
                  instance.onDidChangeCursorSelection(emitObserverContext),
                  instance.onDidChangeModelContent(emitObserverContext),
                  instance.onDidChangeModel(() => { liveReporter.current?.cancel(); lastEditorContent.current = instance.getValue(); liveDiagnostics.current = []; emitObserverContext(); }),
                ];
                if (focusLocation?.relativePath === activeTab.file.relativePath) {
                  instance.setSelection({
                    startLineNumber: focusLocation.line,
                    startColumn: focusLocation.column,
                    endLineNumber: focusLocation.line,
                    endColumn: focusLocation.endColumn ?? focusLocation.column,
                  });
                  instance.revealLineInCenter(focusLocation.line);
                  instance.focus();
                }
                emitObserverContext();
              }}
              onChange={(value, event) => { const previous = lastEditorContent.current; lastEditorContent.current = value ?? ""; if (event.isFlush) { liveReporter.current?.cancel(); return; } liveReporter.current?.changed(activeTab.file.relativePath, previous); const position = editorRef.current?.getPosition(); onChange(activeTab.file.relativePath, value ?? "", { line: position?.lineNumber ?? 1, column: position?.column ?? 1, diagnostics: liveDiagnostics.current }); }}
              onValidate={(markers) => { liveDiagnostics.current = markers.map((marker) => ({
                severity: marker.severity === 8 ? "error" : marker.severity === 4 ? "warning" : marker.severity === 2 ? "info" : "hint",
                message: marker.message,
                line: marker.startLineNumber,
                column: marker.startColumn,
              })); onDiagnosticsChange(activeTab.file.relativePath, liveDiagnostics.current); }}
              loading={<Placeholder icon="⋯">Starting editor…</Placeholder>}
              saveViewState
              options={{
                ...monacoOptionsFromSettings(editorSettings),
                automaticLayout: true,
                lineNumbers: "on",
                padding: { top: 14 },
                scrollBeyondLastLine: false,
              }}
            />
              </div>
            )}
            {markdownActive && markdownViewMode !== "edit" && (
              <MarkdownPreview source={activeTab.draft} />
            )}
            </div>
          </div>
        </div>
      ) : surface.status === "loading" ? (
        <Placeholder icon="⋯">Loading {surface.name}…</Placeholder>
      ) : surface.status === "error" ? (
        <div className="editor-state editor-error" role="alert">
          <span className="editor-state-icon" aria-hidden="true">
            {surface.code === "unsupported" ? "⊘" : "!"}
          </span>
          <strong>{surface.code === "unsupported" ? "Unsupported file" : "Unable to open file"}</strong>
          <span className="editor-state-name">{surface.name}</span>
          <p>{surface.message}</p>
        </div>
      ) : (
        <Placeholder icon="⌘">Select a supported text file to edit it.</Placeholder>
      )}
    </div>
  );
}

interface AppProps {
  user: DesktopAuthUser;
  onSignOut: () => Promise<string | null>;
}

export default function App({ user, onSignOut }: AppProps) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [surface, setSurface] = useState<EditorSurface>({ status: "idle" });
  const [externalChanges, setExternalChanges] = useState<WorkspaceChangeBatch | null>(null);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPrompt | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [openedWorkspace, setOpenedWorkspace] = useState<OpenWorkspace | null>(null);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [outputMessages, setOutputMessages] = useState<IdeOutputMessage[]>([]);
  const [runOutput, setRunOutput] = useState<RunOutputState | null>(null);
  const [outputFocusToken, setOutputFocusToken] = useState(0);
  const [editorLocation, setEditorLocation] = useState<EditorLocation | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [observerMode, setObserverMode] = useState<ObserverMode>("explain");
  const [observerProvider, setObserverProvider] = useState<ObserverProvider>("gemini");
  const [observerStatus, setObserverStatus] = useState<ObserverStatus>("idle");
  const [explainQuestion, setExplainQuestion] = useState("");
  const explanation = useExplanation(openedWorkspace?.workspaceId, setObserverStatus);
  const clearExplanation = explanation.clear;
  const explanationPreparing = useRef(false);
  const explanationPreviewSource = useRef<{ path: string; content: string } | null>(null);
  const lastLiveEdit = useRef<{ path: string; content: string } | null>(null);
  const [liveState, setLiveState] = useState<LiveState>({ ...LIVE_OFF });
  const [automaticRunState, setAutomaticRunState] = useState<AutomaticRunState>({ ...AUTOMATIC_RUN_OFF });
  const [observerSnapshot, setObserverSnapshot] = useState<EditorObserverSnapshot | null>(null);
  const [observerSuggestion, setObserverSuggestion] = useState<ObserverSuggestion | null>(null);
  const [observerError, setObserverError] = useState<string | null>(null);
  const [observerRequestPath, setObserverRequestPath] = useState<string | null>(null);
  const [sentContextSummary, setSentContextSummary] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [observerEditReview, setObserverEditReview] = useState<ObserverEditReviewState | null>(null);
  const [applyingObserverEdit, setApplyingObserverEdit] = useState(false);
  const [markdownViewModes, setMarkdownViewModes] = useState<Record<string, MarkdownViewMode>>({});
  const [sidebarView, setSidebarView] = useState<"explorer" | "search" | "source-control" | "documentation-impact">("explorer");
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [commandPaletteToken, setCommandPaletteToken] = useState(0);
  const [explorerCommandRequest, setExplorerCommandRequest] = useState<{
    token: number;
    action: "open-folder" | "new-file" | "new-folder";
  } | null>(null);
  const [bottomCommandRequest, setBottomCommandRequest] = useState<{
    token: number;
    action: "terminal" | "output" | "new-terminal";
  } | null>(null);
  const [terminalState, setTerminalState] = useState({ active: false, creating: false });
  const [observerFocusToken, setObserverFocusToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS, editor: { ...DEFAULT_LOCAL_SETTINGS.editor }, aiContextExclusions: [] });
  const [syncedSettings, setSyncedSettings] = useState<SyncedSettings>({ ...DEFAULT_SYNCED_SETTINGS });
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [recentRefreshToken, setRecentRefreshToken] = useState(0);
  const [gitRefreshToken, setGitRefreshToken] = useState(0);
  const [gitDiff, setGitDiff] = useState<{ status: "loading"; file: GitChangedFile } | { status: "error"; file: GitChangedFile; message: string } | { status: "ready"; value: GitDiffSnapshot } | null>(null);
  const [explorerRevealRequest, setExplorerRevealRequest] = useState<{ relativePath: string; token: number } | null>(null);
  const [contextPreviewRequest, setContextPreviewRequest] = useState<ObserverRequest | null>(null);
  const [contextTrayItems, setContextTrayItems] = useState<ContextTrayItem[]>([]);
  const [webContextStatus, setWebContextStatus] = useState<WebContextBridgeStatus>({ available: false, enabled: false, paired: false, connected: false, pairingCode: null, pairingExpiresAt: null, pairedDevice: null, port: null, message: "Chrome bridge is starting…" });
  const [incomingWebContext, setIncomingWebContext] = useState<IncomingWebContext | null>(null);
  const [latestTaskFailure, setLatestTaskFailure] = useState<{ kind: "test" | "build"; command: string; summary: string } | null>(null);
  const [documentationSessionChanges, setDocumentationSessionChanges] = useState<ChangedCodeSource[]>([]);
  const [documentationUpdateView, setDocumentationUpdateView] = useState<DocumentationUpdateView | null>(null);
  const [documentationUpdateRelationship, setDocumentationUpdateRelationship] = useState<DocumentationRelationship | null>(null);
  const [multiFileDescription, setMultiFileDescription] = useState("");
  const [multiFilePlan, setMultiFilePlan] = useState<MultiFilePlan | null>(null);
  const [multiFileBases, setMultiFileBases] = useState<MultiFileBase[] | null>(null);
  const [multiFileChangeSet, setMultiFileChangeSet] = useState<MultiFileChangeSet | null>(null);
  const [multiFileApplied, setMultiFileApplied] = useState<{ changeSet: MultiFileChangeSet; result: MultiFileApplyResult } | null>(null);
  const [multiFileBusy, setMultiFileBusy] = useState(false);
  const [multiFileError, setMultiFileError] = useState<string | null>(null);
  const [multiFileActiveIndex, setMultiFileActiveIndex] = useState(0);
  const [multiFilePreviewPhase, setMultiFilePreviewPhase] = useState<"plan" | "generate" | null>(null);
  const [proactiveNudge, setProactiveNudge] = useState<ProactiveNudge | null>(null);
  const [usefulnessPrompt, setUsefulnessPrompt] = useState<{ eventId: string; title: string } | null>(null);
  const [paneSizes, setPaneSizes] = useState({
    sidebar: PANE_LIMITS.sidebar.initial,
    observer: PANE_LIMITS.observer.initial,
    bottom: PANE_LIMITS.bottom.initial,
  });
  const tabsRef = useRef(tabs);
  const runOutputRef = useRef(runOutput);
  const observerRequestInFlight = useRef(false);
  const requestSequence = useRef(0);
  const externalReadSequence = useRef(new Map<string, number>());
  const outputSequence = useRef(0);
  const proactiveEngineRef = useRef(new ProactiveObserverEngine());
  const proactiveDiagnosticsRef = useRef(new Map<string, DiagnosticSignal[]>());
  const proactiveEvidenceRef = useRef(new Map<string, { message: string; runError?: string }>());
  const proactiveFailureReportedRef = useRef(false);
  const proactiveInsightIdsRef = useRef(new Map<string, string>());
  const pendingProactiveFeedbackRef = useRef<ProactiveEvent | null>(null);

  useEffect(() => {
    void Promise.all([window.settings.getLocal(), window.settings.getSynced(), window.settings.providerStatus()]).then(([local, synced, providers]) => {
      if (local.ok) setLocalSettings(local.value);
      if (synced.ok) {
        setSyncedSettings(synced.value);
        setObserverMode(synced.value.defaultObserverAction);
        setObserverProvider(synced.value.preferredProvider);
      }
      if (providers.ok) setProviderStatuses(providers.value);
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = localSettings.theme === "system" ? (media.matches ? "dark" : "light") : localSettings.theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [localSettings.theme]);

  const appendOutput = useCallback(
    (message: string, kind: IdeOutputMessage["kind"] = "info") => {
      const item: IdeOutputMessage = {
        id: ++outputSequence.current,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        kind,
        message,
      };
      setOutputMessages((current) => [...current.slice(-199), item]);
    },
    []
  );

  useEffect(() => {
    let active = true;
    void window.webContext.getStatus().then((status) => { if (active) setWebContextStatus(status); });
    const removeStatus = window.webContext.onStatusChanged(setWebContextStatus);
    const removePending = window.webContext.onPendingChanged(setIncomingWebContext);
    const removeContext = window.webContext.onContextReceived((raw) => {
      const item = validateContextTrayItem(raw);
      if (!item || item.type !== "web_research") { appendOutput("Incoming Chrome context failed renderer validation.", "error"); return; }
      setContextTrayItems((current) => {
        if (current.some((candidate) => candidate.id === item.id || candidate.contentHash === item.contentHash || (candidate.type === "web_research" && candidate.webSource?.captureId === item.webSource?.captureId))) { appendOutput(`${item.title} duplicates context already in the tray.`, "error"); return current; }
        if (contextTrayTotal([...current, item]).characters > syncedSettings.maximumContextChars) {
          appendOutput(`${item.title} exceeds the current context limit. Remove or truncate another item, then send it again.`, "error");
          return current;
        }
        appendOutput(`Added ${item.title} from Chrome to the local Context Tray${item.redacted ? " with secrets redacted" : ""}.`, "success");
        return [...current, item];
      });
    });
    return () => { active = false; removeStatus(); removePending(); removeContext(); };
  }, [appendOutput, syncedSettings.maximumContextChars]);

  const insightIdFor = useCallback((event: ProactiveEvent) => {
    const existing = proactiveInsightIdsRef.current.get(event.eventId); if (existing) return existing;
    const id = crypto.randomUUID(); proactiveInsightIdsRef.current.set(event.eventId, id); return id;
  }, []);

  const mutateInsight = useCallback((event: ProactiveEvent, kind: "eligible" | "shown" | "action" | "resolved", outcome?: ProactiveOutcome) => {
    const detectorType: InsightDetectorType = event.occurrenceCount > 1 && event.detectorType !== "persistent_diagnostic" ? "repeated_objective_failure" : event.detectorType;
    const action = outcome && !["shown", "resolved"].includes(outcome) ? outcome as InsightAction : undefined;
    void window.observerInsights.mutate({ kind, eventId: insightIdFor(event), detectorType, severity: "error", timestamp: Date.now(), preset: localSettings.proactivePreset, collectionEnabled: localSettings.proactiveMetricsCollection, ...(action ? { action } : {}) }, localSettings.proactiveRetentionDays).then((result) => {
      if (!result.ok && !proactiveFailureReportedRef.current) {
        proactiveFailureReportedRef.current = true;
        appendOutput("Proactive Observer local insights could not be recorded. Detection continues safely.", "error");
      }
    });
  }, [appendOutput, insightIdFor, localSettings.proactiveMetricsCollection, localSettings.proactivePreset, localSettings.proactiveRetentionDays]);

  const queueUsefulnessPrompt = useCallback((event: ProactiveEvent) => {
    if (!localSettings.proactiveFeedbackPrompts || !localSettings.proactiveMetricsCollection) return;
    setUsefulnessPrompt({ eventId: insightIdFor(event), title: event.detectorType === "failed_run" ? "Failed run nudge" : event.detectorType === "failed_test" ? "Failed test nudge" : event.detectorType === "failed_build" ? "Failed build nudge" : "Persistent diagnostic nudge" });
  }, [insightIdFor, localSettings.proactiveFeedbackPrompts, localSettings.proactiveMetricsCollection]);

  const consumeProactiveObservation = useCallback((observation: ProactiveObservation, evidence?: { message: string; runError?: string }) => {
    if (observation.failedSafely) {
      if (!proactiveFailureReportedRef.current) {
        proactiveFailureReportedRef.current = true;
        appendOutput("Proactive Observer detection failed safely; no assistance request was made.", "error");
      }
      return;
    }
    for (const event of observation.eligible) mutateInsight(event, "eligible");
    for (const event of observation.resolved) {
      proactiveEvidenceRef.current.delete(event.normalizedSignature);
      mutateInsight(event, "resolved", "resolved");
    }
    if (observation.nudge) {
      if (evidence) proactiveEvidenceRef.current.set(observation.nudge.event.normalizedSignature, evidence);
      setProactiveNudge(observation.nudge);
      mutateInsight(observation.nudge.event, "shown", "shown");
    } else if (!proactiveEngineRef.current.currentNudge()) {
      setProactiveNudge(null);
    }
  }, [appendOutput, mutateInsight]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    runOutputRef.current = runOutput;
  }, [runOutput]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.file.relativePath === activePath) ?? null,
    [activePath, tabs]
  );
  const activeIsMarkdown = Boolean(activeTab && isMarkdownFile(activeTab.file.name));
  useEffect(() => {
    let active = true;
    const unsubscribe = window.automaticRun.onState((state) => { if (active) setAutomaticRunState(state); });
    void window.automaticRun.getState().then((state) => { if (active) setAutomaticRunState(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => window.liveObserver.onState(setLiveState), []);
  useEffect(() => {
    if (lastLiveEdit.current?.path !== activePath || lastLiveEdit.current?.content !== activeTab?.draft) window.liveObserver.cancel();
  }, [activePath, activeTab?.draft]);
  useEffect(() => {
    const report = () => {
      const reason = liveBlockReason({
        settingsLoaded, observerEnabled: syncedSettings.observerEnabled, workspaceUnavailable: signingOut,
        reviewOpen: Boolean(contextPreviewRequest || observerEditReview || multiFilePlan || multiFileChangeSet || multiFileApplied || documentationUpdateView || gitDiff),
        dialogOpen: Boolean(settingsOpen || unsavedPrompt || incomingWebContext || document.querySelector('[role="dialog"], dialog[open]')),
        manualBusy: Boolean(observerStatus !== "idle" || observerSuggestion || multiFileBusy),
        automaticBusy: Boolean(proactiveNudge || ["waiting", "thinking", "ready"].includes(automaticRunState.status)),
        fileUnavailable: Boolean(!activeTab || activeTab.externalConflict || activeTab.availability !== "available"),
      });
      window.liveObserver.activity({ relativePath: activePath, focused: document.hasFocus() && document.visibilityState === "visible", blocked: Boolean(reason), reason });
    };
    report(); const timer = window.setInterval(report, 1000);
    window.addEventListener("blur", report); window.addEventListener("focus", report); document.addEventListener("visibilitychange", report);
    return () => { window.clearInterval(timer); window.removeEventListener("blur", report); window.removeEventListener("focus", report); document.removeEventListener("visibilitychange", report); };
  }, [activePath, activeTab, settingsLoaded, syncedSettings.observerEnabled, settingsOpen, unsavedPrompt, contextPreviewRequest, observerEditReview, observerStatus, observerSuggestion, multiFileBusy, multiFilePlan, multiFileChangeSet, multiFileApplied, documentationUpdateView, gitDiff, signingOut, incomingWebContext, proactiveNudge, automaticRunState.status]);
  useEffect(() => { void window.liveObserver.configure(false, observerProvider, LIVE_CONFIG.pauseMs).then(result => { if (result.ok) setLiveState(result.value); }); }, [observerProvider, openedWorkspace?.workspaceId]);

  useEffect(() => {
    const report = () => window.automaticRun.activity({
      relativePath: activePath,
      dirty: Boolean(activeTab && (isDirty(activeTab) || activeTab.externalConflict || activeTab.availability !== "available")),
      blocked: Boolean(["waiting", "checking", "thinking", "ready"].includes(liveState.status) || !settingsLoaded || !syncedSettings.observerEnabled || settingsOpen || unsavedPrompt || contextPreviewRequest || observerEditReview || observerStatus !== "idle" || observerSuggestion || multiFileBusy || multiFilePlan || multiFileChangeSet || multiFileApplied || documentationUpdateView || gitDiff || signingOut || incomingWebContext || document.querySelector('[role="dialog"], dialog[open]')),
      focused: document.hasFocus() && document.visibilityState === "visible",
    });
    report();
    const interval = window.setInterval(report, AUTOMATIC_RUN_CONFIG.heartbeatMs);
    window.addEventListener("blur", report); window.addEventListener("focus", report); document.addEventListener("visibilitychange", report);
    return () => { window.clearInterval(interval); window.removeEventListener("blur", report); window.removeEventListener("focus", report); document.removeEventListener("visibilitychange", report); };
  }, [activePath, activeTab, settingsLoaded, syncedSettings.observerEnabled, settingsOpen, unsavedPrompt, contextPreviewRequest, observerEditReview, observerStatus, observerSuggestion, multiFileBusy, multiFilePlan, multiFileChangeSet, multiFileApplied, documentationUpdateView, gitDiff, signingOut, incomingWebContext, liveState.status]);

  useEffect(() => {
    if (settingsLoaded && !syncedSettings.observerEnabled && automaticRunState.enabled) void window.automaticRun.configure(false, observerProvider).then((result) => { if (result.ok) setAutomaticRunState(result.value); });
  }, [settingsLoaded, syncedSettings.observerEnabled, automaticRunState.enabled, observerProvider]);

  useEffect(() => {
    if (!automaticRunState.enabled || !["waiting", "thinking", "ready", "error", "skipped"].includes(automaticRunState.status)) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || settingsOpen || unsavedPrompt || contextPreviewRequest || observerEditReview || observerSuggestion || document.querySelector('[role="dialog"], dialog[open]')) return;
      window.automaticRun.dismiss();
      setAutomaticRunState((current) => ({ enabled: current.enabled, provider: current.provider, status: "armed", message: "Dismissed. No repeat explanation for this unchanged failure." }));
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [automaticRunState.enabled, automaticRunState.status, settingsOpen, unsavedPrompt, contextPreviewRequest, observerEditReview, observerSuggestion]);
  const activeMarkdownViewMode = activePath ? markdownViewModes[activePath] ?? "edit" : "edit";
  const observerModes = activeIsMarkdown ? DOCUMENT_OBSERVER_MODES : CODE_OBSERVER_MODES;
  const activeObserverMode: ObserverMode = observerModes.some((mode) => mode === observerMode)
    ? observerMode
    : activeIsMarkdown ? "explain_document" : "explain";
  const multiFileLimits = useMemo<MultiFileLimits>(() => ({ maximumFiles: localSettings.multiFileMaximumFiles, maximumChangedLines: localSettings.multiFileMaximumChangedLines, maximumGeneratedBytes: localSettings.multiFileMaximumGeneratedBytes }), [localSettings.multiFileMaximumChangedLines, localSettings.multiFileMaximumFiles, localSettings.multiFileMaximumGeneratedBytes]);
  const proactiveSettings = useMemo<ProactiveSettingsSnapshot>(() => ({
    mode: localSettings.proactiveObserverMode,
    persistentDiagnostics: localSettings.proactivePersistentDiagnostics,
    failedRuns: localSettings.proactiveFailedRuns && !automaticRunState.enabled,
    failedTests: localSettings.proactiveFailedTests,
    failedBuilds: localSettings.proactiveFailedBuilds,
    cooldownMinutes: localSettings.proactiveCooldownMinutes,
    maximumNudgesPerHour: localSettings.proactiveMaximumNudgesPerHour,
    diagnosticCycles: localSettings.proactiveDiagnosticCycles,
    failedRunOccurrences: localSettings.proactiveFailedRunOccurrences,
    detectorCooldownMinutes: localSettings.proactiveDetectorCooldownMinutes,
    detectorMaximumPerHour: localSettings.proactiveDetectorMaximumPerHour,
    mutedErrors: localSettings.proactiveMutedErrors,
    mutedFiles: localSettings.proactiveMutedFiles,
    mutedProjects: localSettings.proactiveMutedProjects,
  }), [localSettings, automaticRunState.enabled]);

  const observerRequest = useMemo<ObserverPrepareRequest | null>(() => {
    if (!syncedSettings.observerEnabled || !activeTab || activeTab.availability !== "available" || activeTab.externalConflict || isExcludedFromAiContext(activeTab.file.relativePath, localSettings.aiContextExclusions)) return null;
    const snapshot = observerSnapshot?.relativePath === activeTab.file.relativePath
      ? observerSnapshot
      : null;
    const diagnostic = activeObserverMode === "fix_error" && syncedSettings.includeDiagnostics
      ? runOutput?.diagnostics.find((item) => item.relativePath === activeTab.file.relativePath)
      : undefined;
    const fallbackNearbyCode = activeTab.draft.split("\n").slice(0, 41).join("\n");
    return {
      provider: observerProvider,
      ...(observerProvider === syncedSettings.preferredProvider ? { model: syncedSettings.preferredModel } : {}),
      storeHistory: activeObserverMode === "explain" ? false : syncedSettings.storeSuggestionHistory,
      seed: {
        mode: activeObserverMode,
        kind: activeIsMarkdown ? "doc" : "code",
        activeRelativePath: activeTab.file.relativePath,
        fileName: activeTab.file.name,
        language: monacoLanguageForFile(activeTab.file.name),
        content: activeTab.draft,
        activeContentDirty: isDirty(activeTab),
        cursorLine: snapshot?.cursorLine ?? diagnostic?.line ?? 1,
        cursorColumn: snapshot?.cursorColumn ?? diagnostic?.column ?? 1,
        ...(snapshot?.selectedCode ? { selectedCode: snapshot.selectedCode } : {}),
        ...(snapshot?.selectedCode && snapshot.selectedLineStart && snapshot.selectedLineEnd ? { selectedLineStart: snapshot.selectedLineStart, selectedLineEnd: snapshot.selectedLineEnd } : {}),
        nearbyCode: snapshot?.nearbyCode ?? fallbackNearbyCode,
        ...(diagnostic ? { diagnostic: { fileName: activeTab.file.name, line: diagnostic.line, column: diagnostic.column, message: diagnostic.message } } : {}),
        ...(syncedSettings.includeTerminalError && diagnostic && runOutput?.status === "failed" ? { runError: relevantObserverRunError(runOutput.stderr, { fileName: activeTab.file.name, line: diagnostic.line, column: diagnostic.column, message: diagnostic.message }) } : {}),
        exclusions: localSettings.aiContextExclusions,
        maximumTotalCharacters: syncedSettings.maximumContextChars,
        maximumRelatedFiles: localSettings.contextMaximumRelatedFiles,
        maximumCharactersPerFile: localSettings.contextMaximumFileCharacters,
        ...(activeObserverMode === "explain" && explainQuestion.trim() ? { userRequest: explainQuestion.trim() } : {}),
        ...(activeObserverMode === "plan_multi_file" ? { userRequest: multiFileDescription.trim() } : {}),
        ...(contextTrayItems.length && activeObserverMode !== "explain" ? { trayItems: contextTrayItems } : {}),
      },
    };
  }, [explainQuestion, activeIsMarkdown, activeObserverMode, activeTab, contextTrayItems, localSettings.aiContextExclusions, localSettings.contextMaximumFileCharacters, localSettings.contextMaximumRelatedFiles, multiFileDescription, observerProvider, observerSnapshot, runOutput, syncedSettings.includeDiagnostics, syncedSettings.includeTerminalError, syncedSettings.maximumContextChars, syncedSettings.observerEnabled, syncedSettings.preferredModel, syncedSettings.preferredProvider, syncedSettings.storeSuggestionHistory]);
  const currentContextSummary = observerRequest ? "A focused project context package will be previewed before sending." : null;

  const attachTrayItem = useCallback(async (input: CreateContextTrayItemInput) => {
    try {
      const item = await createContextTrayItem(input);
      const duplicate = findContextTrayDuplicate(contextTrayItems, item);
      if (duplicate === "exact") { appendOutput("That exact context is already attached."); return; }
      if (duplicate === "overlap" && !window.confirm("This overlaps context already in the tray. Attach it as a separate item anyway?")) return;
      const total = contextTrayTotal([...contextTrayItems, item]);
      if (total.characters > syncedSettings.maximumContextChars) {
        appendOutput(`${item.title} would exceed the ${syncedSettings.maximumContextChars.toLocaleString()} character context limit. Remove or truncate another item, or increase the safe limit in Settings.`, "error");
        return;
      }
      setContextTrayItems((current) => [...current, item]);
      appendOutput(`Added ${item.title} to the local Context Tray${item.redacted ? " with secrets redacted" : ""}.`, "success");
    } catch (error) { appendOutput(error instanceof Error ? error.message : "Context could not be attached.", "error"); }
  }, [appendOutput, contextTrayItems, syncedSettings.maximumContextChars]);

  const addActiveEditorContext = useCallback(async (action: "selection" | "symbol" | "excerpt" | "markdown_section") => {
    if (!activeTab || activeTab.availability !== "available" || activeTab.externalConflict) return;
    const snapshot = observerSnapshot?.relativePath === activeTab.file.relativePath ? observerSnapshot : null;
    if (action === "selection") {
      if (!snapshot?.selectedCode) { appendOutput("Select code or document text before adding it to Context.", "error"); return; }
      await attachTrayItem({ type: activeIsMarkdown ? "selected_markdown" : "selected_code", title: activeIsMarkdown ? `Selected text from ${activeTab.file.name}` : `Selected code from ${activeTab.file.name}`, content: snapshot.selectedCode, relativePath: activeTab.file.relativePath, lineStart: snapshot.selectedLineStart, lineEnd: snapshot.selectedLineEnd, sourceContent: activeTab.draft, reason: "Explicitly attached from the Monaco selection." });
      return;
    }
    if (action === "symbol") {
      const symbol = currentSymbolContext(activeTab.draft, snapshot?.cursorLine ?? 1);
      if (!symbol) { appendOutput("No current function, class, or symbol was detected at the cursor.", "error"); return; }
      await attachTrayItem({ type: "current_symbol", title: `${symbol.name} from ${activeTab.file.name}`, content: symbol.content, relativePath: activeTab.file.relativePath, lineStart: symbol.lineStart, lineEnd: symbol.lineEnd, sourceContent: activeTab.draft, reason: "Explicitly attached current symbol." });
      return;
    }
    if (action === "markdown_section") {
      const section = currentMarkdownSection(activeTab.draft, snapshot?.cursorLine ?? 1);
      await attachTrayItem({ type: "markdown_section", title: `${section.title} from ${activeTab.file.name}`, content: section.content, relativePath: activeTab.file.relativePath, lineStart: section.lineStart, lineEnd: section.lineEnd, sourceContent: activeTab.draft, reason: "Explicitly attached current Markdown section." });
      return;
    }
    const excerpt = snapshot?.nearbyCode ?? activeTab.draft.split(/\r?\n/).slice(0, 41).join("\n");
    const line = snapshot?.cursorLine ?? 1;
    await attachTrayItem({ type: "file_excerpt", title: `Excerpt from ${activeTab.file.name}`, content: excerpt, relativePath: activeTab.file.relativePath, lineStart: Math.max(1, line - 20), lineEnd: line + 20, sourceContent: activeTab.draft, reason: "Explicitly attached bounded excerpt around the cursor." });
  }, [activeIsMarkdown, activeTab, appendOutput, attachTrayItem, observerSnapshot]);

  const addDiagnosticContext = useCallback(async (diagnostic: RunDiagnostic) => {
    await attachTrayItem({ type: "diagnostic", title: `Diagnostic on line ${diagnostic.line}`, content: `${diagnostic.relativePath}:${diagnostic.line}:${diagnostic.column}\n${diagnostic.message}`, relativePath: diagnostic.relativePath, lineStart: diagnostic.line, lineEnd: diagnostic.line, sourceContent: tabsRef.current.find((tab) => tab.file.relativePath === diagnostic.relativePath)?.draft ?? diagnostic.message, reason: "Explicitly attached structured Monaco/run diagnostic." });
  }, [attachTrayItem]);

  const addSelectedOutputContext = useCallback(async (content: string, source: "terminal" | "output") => {
    await attachTrayItem({ type: "selected_output", title: `Selected ${source} text`, content, reason: `Explicitly attached user-selected ${source} text.`, maximumCharacters: 8_000 });
  }, [attachTrayItem]);

  const addLatestRunFailureContext = useCallback(async () => {
    if (!runOutput || runOutput.status !== "failed") { appendOutput("There is no failed controlled run to attach.", "error"); return; }
    const content = `${runOutput.relativePath}\nexit ${runOutput.exitCode ?? "unknown"}\n${runOutput.stderr || runOutput.stdout || "No process output."}`;
    await attachTrayItem({ type: "controlled_run_error", title: `Failed run: ${runOutput.relativePath}`, content, relativePath: runOutput.relativePath, sourceContent: tabsRef.current.find((tab) => tab.file.relativePath === runOutput.relativePath)?.draft ?? content, reason: "Explicitly attached latest controlled Run Current File failure.", maximumCharacters: 8_000 });
  }, [appendOutput, attachTrayItem, runOutput]);

  const addLatestTaskFailureContext = useCallback(async () => {
    if (!latestTaskFailure) { appendOutput("There is no failed controlled test/build summary to attach.", "error"); return; }
    await attachTrayItem({ type: "task_failure", title: `Failed ${latestTaskFailure.kind}: ${latestTaskFailure.command}`, content: latestTaskFailure.summary, reason: "Explicitly attached failed controlled verification summary.", maximumCharacters: 8_000 });
  }, [appendOutput, attachTrayItem, latestTaskFailure]);

  const addExplorerFileContext = useCallback(async (entry: WorkspaceEntry) => {
    if (entry.kind !== "file" || entry.isSymbolicLink || isMandatorySecretFile(entry.relativePath) || isExcludedFromAiContext(entry.relativePath, localSettings.aiContextExclusions)) { appendOutput("That file is unavailable or excluded from AI context.", "error"); return; }
    const result = await window.workspace.readFile(entry.relativePath);
    if (!result.ok) { appendOutput(result.error, "error"); return; }
    if (result.value.content.length > localSettings.contextMaximumFileCharacters) { appendOutput(`Complete file exceeds the ${localSettings.contextMaximumFileCharacters.toLocaleString()} character per-file limit. Attach an excerpt instead.`, "error"); return; }
    const preview = result.value.content.slice(0, 500);
    if (!window.confirm(`Attach complete file ${entry.relativePath}?\n\n${result.value.content.length.toLocaleString()} characters · ~${Math.ceil(result.value.content.length / 4).toLocaleString()} tokens\n\nPreview:\n${preview}${result.value.content.length > preview.length ? "…" : ""}`)) return;
    const projectRule = /(^|\/)(AGENTS\.md|README\.md|rules\.md)$/i.test(entry.relativePath);
    await attachTrayItem({ type: projectRule ? "project_rule" : "complete_file", title: `${projectRule ? "Project rule" : "Complete file"}: ${entry.name}`, content: result.value.content, relativePath: entry.relativePath, lineStart: 1, lineEnd: result.value.content.split(/\r?\n/).length, sourceContent: result.value.content, reason: projectRule ? "Explicitly attached project rule reference from Explorer." : "Explicitly attached complete text file from Explorer after confirmation.", maximumCharacters: localSettings.contextMaximumFileCharacters, completeFile: true });
  }, [appendOutput, attachTrayItem, localSettings.aiContextExclusions, localSettings.contextMaximumFileCharacters]);

  const refreshTrayItem = useCallback(async (id: string) => {
    const item = contextTrayItems.find((candidate) => candidate.id === id);
    const path = item?.source?.relativePath;
    if (!item || !path) return;
    const open = tabsRef.current.find((tab) => tab.file.relativePath === path);
    const result = open ? { ok: true as const, value: { content: open.draft } } : await window.workspace.readFile(path);
    if (!result.ok) { setContextTrayItems((current) => current.map((candidate) => candidate.id === id ? { ...candidate, staleState: "unavailable" } : candidate)); appendOutput(result.error, "error"); return; }
    const full = result.value.content; const start = item.source?.lineStart ?? 1; const end = item.completeFile ? full.split(/\r?\n/).length : item.source?.lineEnd ?? start;
    const content = item.completeFile ? full : full.split(/\r?\n/).slice(start - 1, end).join("\n");
    const refreshed = await refreshContextTrayItem(item, content, full);
    setContextTrayItems((current) => current.map((candidate) => candidate.id === id ? refreshed : candidate));
    appendOutput(`Refreshed ${item.title} from the current file.`, "success");
  }, [appendOutput, contextTrayItems]);

  const saveTab = useCallback(async (relativePath: string): Promise<boolean> => {
    const tab = tabsRef.current.find((candidate) => candidate.file.relativePath === relativePath);
    if (!tab || !isDirty(tab)) return true;
    if (tab.saving) return false;
    if (tab.availability === "unavailable" || tab.externalConflict) {
      setTabs((current) =>
        current.map((candidate) =>
          candidate.file.relativePath === relativePath
            ? {
                ...candidate,
                saveStatus: {
                  kind: "error",
                  message: tab.externalConflict
                    ? "Resolve the external change before saving"
                    : "This file is unavailable on disk",
                },
              }
            : candidate
        )
      );
      return false;
    }

    const contentToSave = tab.draft;
    setTabs((current) =>
      current.map((candidate) =>
        candidate.file.relativePath === relativePath
          ? { ...candidate, saving: true, saveStatus: null }
          : candidate
      )
    );
    const result = await window.workspace.writeFile({
      relativePath,
      content: contentToSave,
      expectedModifiedAtMs: tab.file.modifiedAtMs,
    });

    if (!result.ok) {
      appendOutput(`Save failed for ${tab.file.relativePath}: ${result.error}`, "error");
      setTabs((current) =>
        current.map((candidate) =>
          candidate.file.relativePath === relativePath
            ? {
                ...candidate,
                saving: false,
                saveStatus: { kind: "error", message: result.error },
              }
            : candidate
        )
      );
      return false;
    }

    setDocumentationSessionChanges((current) => {
      const previous = current.find((item) => item.relativePath === relativePath);
      const next: ChangedCodeSource = { relativePath, originalContent: previous?.originalContent ?? tab.file.content, currentContent: contentToSave, kind: "session" };
      return [...current.filter((item) => item.relativePath !== relativePath), next].slice(-100);
    });

    const latestDraft = tabsRef.current.find(
      (candidate) => candidate.file.relativePath === relativePath
    )?.draft;
    const hasNewerChanges = latestDraft !== undefined && latestDraft !== contentToSave;
    setTabs((current) =>
      current.map((candidate) => {
        if (candidate.file.relativePath !== relativePath) return candidate;
        return {
          ...candidate,
          file: {
            ...candidate.file,
            content: contentToSave,
            modifiedAtMs: result.value.modifiedAtMs,
          },
          saving: false,
          autoSaveBlocked: false,
          externalNotice: null,
          saveStatus: {
            kind: "success",
            message: hasNewerChanges ? "Saved; newer changes pending" : "Saved",
          },
        };
      })
    );
    appendOutput(`Saved ${tab.file.relativePath}.`, "success");
    if (openedWorkspace) {
      consumeProactiveObservation(proactiveEngineRef.current.observeDiagnosticCycle(
        openedWorkspace.workspaceId,
        tab.file.relativePath,
        proactiveDiagnosticsRef.current.get(tab.file.relativePath) ?? [],
        proactiveSettings
      ));
    }
    return !hasNewerChanges;
  }, [appendOutput, consumeProactiveObservation, openedWorkspace, proactiveSettings]);

  const askAboutUnsavedChanges = useCallback(
    (details: Omit<UnsavedPrompt, "resolve">): Promise<UnsavedChoice> => {
      if (unsavedPrompt) return Promise.resolve("cancel");
      return new Promise((resolve) => setUnsavedPrompt({ ...details, resolve }));
    },
    [unsavedPrompt]
  );

  const closeTab = useCallback(async (relativePath: string) => {
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((candidate) => candidate.file.relativePath === relativePath);
    if (!tab) return;
    if (isDirty(tab)) {
      const choice = await askAboutUnsavedChanges({
        title: "Save changes before closing?",
        message: `${tab.file.name} has unsaved changes.`,
        saveLabel: "Save",
      });
      if (choice === "cancel") return;
      if (choice === "save" && !(await saveTab(relativePath))) return;
    }

    const index = currentTabs.findIndex((candidate) => candidate.file.relativePath === relativePath);
    const remaining = currentTabs.filter((candidate) => candidate.file.relativePath !== relativePath);
    setTabs(remaining);
    setActivePath((currentActive) => {
      if (currentActive !== relativePath) return currentActive;
      return remaining[Math.min(index, remaining.length - 1)]?.file.relativePath ?? null;
    });
    setSurface({ status: "idle" });
  }, [askAboutUnsavedChanges, saveTab]);

  const selectFile = useCallback(async (entry: WorkspaceEntry) => {
    setGitDiff(null);
    const existing = tabsRef.current.find((tab) => tab.file.relativePath === entry.relativePath);
    if (existing) {
      setActivePath(entry.relativePath);
      setSurface({ status: "idle" });
      return;
    }

    const requestId = ++requestSequence.current;
    setActivePath(null);
    setSurface({ status: "loading", name: entry.name, relativePath: entry.relativePath });
    const result = await window.workspace.readFile(entry.relativePath);
    if (requestId !== requestSequence.current) return;
    if (!result.ok) {
      setSurface({
        status: "error",
        name: entry.name,
        relativePath: entry.relativePath,
        message: result.error,
        code: result.code,
      });
      return;
    }

    const newTab: EditorTab = {
      file: result.value,
      draft: result.value.content,
      saving: false,
      saveStatus: null,
      availability: "available",
      externalConflict: null,
      externalNotice: null,
    };
    setTabs((current) =>
      current.some((tab) => tab.file.relativePath === entry.relativePath)
        ? current
        : [...current, newTab]
    );
    setActivePath(entry.relativePath);
    setSurface({ status: "idle" });
  }, []);

  const canOpenWorkspace = useCallback(async (): Promise<boolean> => {
    const dirtyTabs = tabsRef.current.filter(isDirty);
    if (dirtyTabs.length === 0) return true;
    const choice = await askAboutUnsavedChanges({
      title: "Save open changes?",
      message: `${dirtyTabs.length} open file${dirtyTabs.length === 1 ? " has" : "s have"} unsaved changes.`,
      saveLabel: dirtyTabs.length === 1 ? "Save" : "Save All",
    });
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    for (const tab of dirtyTabs) {
      if (!(await saveTab(tab.file.relativePath))) return false;
    }
    return true;
  }, [askAboutUnsavedChanges, saveTab]);

  const clearWorkspaceTabs = useCallback((workspace: OpenWorkspace) => {
    clearExplanation(); setExplainQuestion(""); explanationPreviewSource.current = null;
    requestSequence.current += 1;
    proactiveEngineRef.current = new ProactiveObserverEngine();
    proactiveDiagnosticsRef.current.clear();
    proactiveEvidenceRef.current.clear();
    proactiveInsightIdsRef.current.clear();
    pendingProactiveFeedbackRef.current = null;
    setUsefulnessPrompt(null);
    setProactiveNudge(null);
    setTabs([]);
    setActivePath(null);
    setSurface({ status: "idle" });
    setExternalChanges(null);
    externalReadSequence.current.clear();
    setWorkspaceOpen(true);
    setOpenedWorkspace(workspace);
    setWorkspaceVersion((current) => current + 1);
    setRunOutput(null);
    setEditorLocation(null);
    setObserverSnapshot(null);
    setObserverSuggestion(null);
    setObserverError(null);
    setMultiFilePlan(null);
    setMultiFileBases(null);
    setMultiFileChangeSet(null);
    setMultiFileApplied(null);
    setMultiFileError(null);
    setMultiFilePreviewPhase(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setObserverEditReview(null);
    setContextPreviewRequest(null);
    setContextTrayItems([]);
    setLatestTaskFailure(null);
    setDocumentationSessionChanges([]);
    setDocumentationUpdateView(null); setDocumentationUpdateRelationship(null);
    setGitDiff(null);
    setMarkdownViewModes({});
    appendOutput("Workspace opened. Previous terminal and file-run processes were closed.");
    if (localSettings.restoreOpenTabs) {
      void window.settings.getWorkspaceTabs(workspace.workspaceId).then(async (result) => {
        if (!result.ok) return;
        for (const relativePath of result.value) {
          const name = relativePath.split("/").at(-1) ?? relativePath;
          await selectFile({ name, relativePath, kind: "file", isSymbolicLink: false });
        }
      });
    }
  }, [appendOutput, clearExplanation, localSettings.restoreOpenTabs, selectFile]);

  useEffect(() => {
    if (localSettings.proactiveObserverMode === "assist") return;
    proactiveEngineRef.current.clearActive();
    setProactiveNudge(null);
  }, [localSettings.proactiveObserverMode]);

  const startupAttempted = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || startupAttempted.current || localSettings.startupBehavior !== "reopen_last" || workspaceOpen) return;
    startupAttempted.current = true;
    void window.workspace.listRecent().then(async (recent) => {
      const first = recent.ok ? recent.value[0] : null;
      if (!first) return;
      const reopened = await window.workspace.reopenRecent(first.id);
      if (reopened.ok) clearWorkspaceTabs(reopened.value);
      else appendOutput(reopened.error, "error");
    });
  }, [appendOutput, clearWorkspaceTabs, localSettings.startupBehavior, settingsLoaded, workspaceOpen]);

  useEffect(() => {
    if (!openedWorkspace || !localSettings.restoreOpenTabs) return;
    const timeout = window.setTimeout(() => {
      void window.settings.saveWorkspaceTabs(openedWorkspace.workspaceId, tabs.map((tab) => tab.file.relativePath));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [localSettings.restoreOpenTabs, openedWorkspace, tabs]);

  const renameOpenEntries = useCallback((oldRelativePath: string, entry: WorkspaceEntry) => {
    setContextTrayItems((current) => current.map((item) => item.source?.relativePath && workspaceEntryContainsPath(item.source.relativePath, oldRelativePath, entry.kind) ? { ...item, staleState: "unavailable" } : item));
    setTabs((current) =>
      current.map((tab) => {
        if (!workspaceEntryContainsPath(tab.file.relativePath, oldRelativePath, entry.kind)) return tab;
        return {
          ...tab,
          file: {
            ...tab.file,
            name: tab.file.relativePath === oldRelativePath ? entry.name : tab.file.name,
            relativePath: replaceWorkspaceEntryPath(tab.file.relativePath, oldRelativePath, entry),
          },
        };
      })
    );
    setActivePath((current) => {
      if (!current) return current;
      return replaceWorkspaceEntryPath(current, oldRelativePath, entry);
    });
    setMarkdownViewModes((current) => Object.fromEntries(
      Object.entries(current).map(([path, mode]) => [
        replaceWorkspaceEntryPath(path, oldRelativePath, entry),
        mode,
      ])
    ));
  }, []);

  const deleteOpenEntries = useCallback((relativePath: string, kind: WorkspaceEntry["kind"]) => {
    if (openedWorkspace) {
      for (const tab of tabsRef.current.filter((candidate) => workspaceEntryContainsPath(candidate.file.relativePath, relativePath, kind))) {
        consumeProactiveObservation(proactiveEngineRef.current.resolveFile(openedWorkspace.workspaceId, tab.file.relativePath));
      }
    }
    const currentTabs = tabsRef.current;
    const remaining = currentTabs.filter(
      (tab) => !workspaceEntryContainsPath(tab.file.relativePath, relativePath, kind)
    );
    setTabs(remaining);
    setActivePath((current) => {
      if (!current || !workspaceEntryContainsPath(current, relativePath, kind)) return current;
      return remaining.at(-1)?.file.relativePath ?? null;
    });
    setSurface({ status: "idle" });
    setMarkdownViewModes((current) => Object.fromEntries(
      Object.entries(current).filter(([path]) => !workspaceEntryContainsPath(path, relativePath, kind))
    ));
  }, [consumeProactiveObservation, openedWorkspace]);

  const getDeleteImpact = useCallback((entry: WorkspaceEntry) => {
    const affected = tabsRef.current.filter((tab) =>
      workspaceEntryContainsPath(tab.file.relativePath, entry.relativePath, entry.kind)
    );
    return { openCount: affected.length, dirtyCount: affected.filter(isDirty).length };
  }, []);

  const reloadExternalVersion = useCallback((relativePath: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.file.relativePath !== relativePath || !tab.externalConflict) return tab;
        return {
          ...tab,
          file: tab.externalConflict,
          draft: tab.externalConflict.content,
          availability: "available",
          externalConflict: null,
          externalNotice: "Reloaded the external version.",
          saveStatus: null,
        };
      })
    );
  }, []);

  const keepLocalChanges = useCallback((relativePath: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.file.relativePath !== relativePath || !tab.externalConflict) return tab;
        return {
          ...tab,
          file: { ...tab.file, modifiedAtMs: tab.externalConflict.modifiedAtMs },
          availability: "available",
          externalConflict: null,
          externalNotice: "Keeping local changes. Save to overwrite the external version.",
          saveStatus: null,
        };
      })
    );
  }, []);

  useEffect(() => window.workspace.onDidChange((batch) => {
    setExternalChanges(batch);
    setGitRefreshToken((value) => value + 1);
    appendOutput(
      `Workspace updated externally (${batch.changes.length} change${batch.changes.length === 1 ? "" : "s"}).`
    );
    setContextTrayItems((current) => batch.changes.reduce((items, change) => {
      if (change.kind === "directory") return items.map((item) => item.source?.relativePath?.startsWith(`${change.relativePath}/`) && item.staleState === "fresh" ? { ...item, staleState: change.type === "deleted" ? "unavailable" : "stale" } : item);
      return markContextTrayPathStale(items, change.relativePath, change.type === "deleted");
    }, current));

    for (const snapshot of tabsRef.current) {
      const deleted = batchDeletesPath(batch, snapshot.file.relativePath);
      if (deleted) {
        if (openedWorkspace) consumeProactiveObservation(proactiveEngineRef.current.resolveFile(openedWorkspace.workspaceId, snapshot.file.relativePath));
        externalReadSequence.current.set(
          snapshot.file.relativePath,
          (externalReadSequence.current.get(snapshot.file.relativePath) ?? 0) + 1
        );
        setTabs((current) =>
          current.map((tab) =>
            tab.file.relativePath === snapshot.file.relativePath
              ? {
                  ...tab,
                  availability: "unavailable",
                  externalConflict: null,
                  externalNotice: "The file was deleted externally; local editor content is preserved.",
                  saveStatus: null,
                }
              : tab
          )
        );
        continue;
      }

      const changed = batchChangesFile(batch, snapshot.file.relativePath);
      if (!changed) continue;

      const sequence = (externalReadSequence.current.get(snapshot.file.relativePath) ?? 0) + 1;
      externalReadSequence.current.set(snapshot.file.relativePath, sequence);
      void window.workspace.readFile(snapshot.file.relativePath).then((result) => {
        if (externalReadSequence.current.get(snapshot.file.relativePath) !== sequence) return;
        if (!result.ok) {
          setTabs((current) =>
            current.map((tab) =>
              tab.file.relativePath === snapshot.file.relativePath
                ? {
                    ...tab,
                    availability: "unavailable",
                    externalConflict: null,
                    externalNotice: result.error,
                  }
                : tab
            )
          );
          return;
        }
        setTabs((current) =>
          current.map((tab) => {
            if (tab.file.relativePath !== snapshot.file.relativePath) return tab;
            const update = resolveExternalFileUpdate(tab.file, tab.draft, result.value);
            if (update.kind === "conflict") {
              return {
                ...tab,
                availability: "available",
                externalConflict: update.externalFile,
                externalNotice: null,
                saveStatus: null,
              };
            }
            return {
              ...tab,
              file: update.file,
              draft: update.draft,
              availability: "available",
              externalConflict: null,
              externalNotice: "Reloaded after an external change.",
              saveStatus: null,
            };
          })
        );
      });
    }
  }), [appendOutput, consumeProactiveObservation, openedWorkspace]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        if (shouldPreserveTerminalShortcut(event.target, "save")) return;
        event.preventDefault();
        if (activePath) void saveTab(activePath);
      }
    };
    window.addEventListener("keydown", handleSaveShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleSaveShortcut, { capture: true });
  }, [activePath, saveTab]);

  useEffect(() => {
    if (localSettings.editor.autoSave !== "after_delay") return;
    const pending = tabs.filter((tab) => isDirty(tab) && !tab.autoSaveBlocked && !tab.saving && tab.availability === "available" && !tab.externalConflict);
    if (!pending.length) return;
    const timeout = window.setTimeout(() => pending.forEach((tab) => void saveTab(tab.file.relativePath)), localSettings.editor.autoSaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [localSettings.editor.autoSave, localSettings.editor.autoSaveDelayMs, saveTab, tabs]);

  useEffect(() => {
    const unsubscribeOutput = window.runner.onOutput((event) => {
      setRunOutput((current) => {
        if (!current || current.runId !== event.runId) return current;
        const next = (current[event.stream] + event.data).slice(-2 * 1024 * 1024);
        const updated = { ...current, [event.stream]: next };
        runOutputRef.current = updated;
        return updated;
      });
    });
    const unsubscribeComplete = window.runner.onComplete((event) => {
      const completedRun = runOutputRef.current;
      setRunOutput((current) => {
        if (!current || current.runId !== event.runId) return current;
        const updated: RunOutputState = {
          ...current,
          status: event.status,
          exitCode: event.exitCode,
          durationMs: event.durationMs,
          diagnostics: event.diagnostics,
        };
        runOutputRef.current = updated;
        return updated;
      });
      const kind = event.status === "succeeded" ? "success" : event.status === "stopped" ? "info" : "error";
      appendOutput(
        event.status === "stopped"
          ? "Run stopped."
          : `Run ${event.status} in ${event.durationMs} ms${event.exitCode === null ? "" : ` (exit ${event.exitCode})`}.`,
        kind
      );
      if (openedWorkspace && completedRun && event.status !== "stopped") {
        const diagnostic = event.diagnostics[0];
        const relevantError = event.status === "failed"
          ? relevantObserverRunError(completedRun.stderr, diagnostic ? {
              fileName: diagnostic.relativePath.split("/").at(-1) ?? diagnostic.relativePath,
              line: diagnostic.line,
              column: diagnostic.column,
              message: diagnostic.message,
            } : undefined)
          : undefined;
        consumeProactiveObservation(proactiveEngineRef.current.observeObjectiveFailure({
          kind: "run",
          workspaceId: openedWorkspace.workspaceId,
          relativePath: completedRun.relativePath,
          ...(diagnostic ? { line: diagnostic.line, column: diagnostic.column } : {}),
          message: diagnostic?.message ?? relevantError ?? `exit:${event.exitCode ?? "unknown"}`,
          succeeded: event.status === "succeeded",
        }, proactiveSettings), {
          message: diagnostic?.message ?? relevantError ?? "The controlled run returned a non-zero result.",
          ...(relevantError ? { runError: relevantError } : {}),
        });
      }
      setOutputFocusToken((current) => current + 1);
    });
    return () => {
      unsubscribeOutput();
      unsubscribeComplete();
    };
  }, [appendOutput, consumeProactiveObservation, openedWorkspace, proactiveSettings]);

  const runCurrentFile = useCallback(async () => {
    if (runOutputRef.current?.status === "running") {
      appendOutput("A file is already running. Stop it before starting another.", "error");
      setOutputFocusToken((current) => current + 1);
      return;
    }
    const tab = tabsRef.current.find((candidate) => candidate.file.relativePath === activePath);
    if (!tab) return;
    const support = runSupport(tab.file.name);
    if (support !== "supported") {
      appendOutput(
        support === "typescript"
          ? "TypeScript runner not configured."
          : `Run Current File does not support ${tab.file.name}.`,
        "error"
      );
      setOutputFocusToken((current) => current + 1);
      return;
    }
    if (tab.availability !== "available" || tab.externalConflict) {
      appendOutput("Resolve the file's external-change state before running it.", "error");
      setOutputFocusToken((current) => current + 1);
      return;
    }
    if (isDirty(tab)) {
      const choice = await askAboutUnsavedChanges({
        title: "Save before running?",
        message: `${tab.file.name} must be saved before it can run.`,
        saveLabel: "Save and Run",
        allowDiscard: false,
      });
      if (choice !== "save" || !(await saveTab(tab.file.relativePath))) return;
    }

    setOutputFocusToken((current) => current + 1);
    const runId = crypto.randomUUID();
    const nextRun: RunOutputState = {
      runId,
      relativePath: tab.file.relativePath,
      language: tab.file.name.toLowerCase().endsWith(".py") ? "python" : "javascript",
      status: "running",
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: null,
      diagnostics: [],
    };
    runOutputRef.current = nextRun;
    setRunOutput(nextRun);
    const result = await window.runner.start({ runId, relativePath: tab.file.relativePath });
    if (!result.ok) {
      runOutputRef.current = null;
      setRunOutput((current) => current?.runId === runId ? null : current);
      appendOutput(result.error, "error");
      return;
    }
    appendOutput(`Running ${result.value.relativePath}…`);
  }, [activePath, appendOutput, askAboutUnsavedChanges, saveTab]);

  const stopCurrentRun = useCallback(async () => {
    const current = runOutputRef.current;
    if (!current || current.status !== "running") return;
    const result = await window.runner.stop({ runId: current.runId });
    if (!result.ok) appendOutput(result.error, "error");
  }, [appendOutput]);

  useEffect(() => {
    const handleRunShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        if (shouldPreserveTerminalShortcut(event.target, "run")) return;
        event.preventDefault();
        void runCurrentFile();
      }
    };
    window.addEventListener("keydown", handleRunShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleRunShortcut, { capture: true });
  }, [runCurrentFile]);

  const focusDiagnostic = useCallback(async (diagnostic: RunDiagnostic) => {
    const name = diagnostic.relativePath.split("/").at(-1) ?? diagnostic.relativePath;
    await selectFile({ name, relativePath: diagnostic.relativePath, kind: "file", isSymbolicLink: false });
    setEditorLocation({ ...diagnostic, token: Date.now() });
  }, [selectFile]);

  const focusSearchMatch = useCallback(async (match: WorkspaceSearchMatch) => {
    const name = match.relativePath.split("/").at(-1) ?? match.relativePath;
    if (isMarkdownFile(name)) {
      setMarkdownViewModes((current) => ({ ...current, [match.relativePath]: "edit" }));
    }
    await selectFile({
      name,
      relativePath: match.relativePath,
      kind: "file",
      isSymbolicLink: false,
    });
    setEditorLocation({ ...searchMatchSelection(match), token: Date.now() });
  }, [selectFile]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setSidebarView("search");
      setSearchFocusToken((current) => current + 1);
    };
    window.addEventListener("keydown", handleGlobalSearchShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut, { capture: true });
  }, []);

  const recordMultiFileOutcome = useCallback((request: Parameters<typeof window.multiFileObserver.outcome>[0]) => {
    void window.multiFileObserver.outcome(request).then((result) => {
      if (!result.ok) appendOutput(`Multi-file metadata logging: ${result.error}`, "error");
    });
  }, [appendOutput]);

  const requestMultiFilePlan = useCallback(async (context: ObserverRequest) => {
    const description = multiFileDescription.trim();
    if (context.mode !== "plan_multi_file" || description.length < 3) return;
    setContextPreviewRequest(null); setMultiFilePreviewPhase(null); setMultiFileBusy(true); setMultiFileError(null); setObserverStatus("thinking");
    const result = await window.multiFileObserver.plan({ provider: observerProvider, ...(observerProvider === syncedSettings.preferredProvider ? { model: syncedSettings.preferredModel } : {}), storeHistory: syncedSettings.storeSuggestionHistory, userRequest: description, context, limits: multiFileLimits });
    setMultiFileBusy(false); setObserverStatus("idle");
    if (!result.ok) { setMultiFileError(result.error); setObserverError(result.error); setObserverStatus("error"); appendOutput(`Multi-file plan: ${result.error}`, "error"); return; }
    setMultiFilePlan(result.value.plan); setMultiFileBases(null); setMultiFileChangeSet(null); setMultiFileApplied(null);
    appendOutput("Observer created a multi-file implementation plan. No files were changed.", "success");
  }, [appendOutput, multiFileDescription, multiFileLimits, observerProvider, recordMultiFileOutcome, syncedSettings.preferredModel, syncedSettings.preferredProvider, syncedSettings.storeSuggestionHistory]);

  const approveMultiFilePlan = useCallback(async () => {
    if (!multiFilePlan || !observerRequest || multiFileBusy) return;
    setMultiFileBusy(true); setMultiFileError(null);
    const bases = await window.multiFileObserver.prepare(multiFilePlan, multiFileLimits);
    if (!bases.ok) { setMultiFileBusy(false); setMultiFileError(bases.error); appendOutput(`Plan approval: ${bases.error}`, "error"); return; }
    recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "plan", outcome: "approved", provider: observerProvider, planId: multiFilePlan.planId, fileCount: multiFilePlan.files.length, updateCount: multiFilePlan.files.filter((item) => item.operation === "update").length, createCount: multiFilePlan.files.filter((item) => item.operation === "create").length, changedLines: 0, durationMs: 0 });
    const context = await window.observer.prepare(observerRequest);
    setMultiFileBusy(false);
    if (!context.ok) { setMultiFileError(context.error); appendOutput(`Generation context: ${context.error}`, "error"); return; }
    setMultiFileBases(bases.value); setMultiFilePreviewPhase("generate"); setContextPreviewRequest(context.value);
  }, [appendOutput, multiFileBusy, multiFileLimits, multiFilePlan, observerProvider, observerRequest, recordMultiFileOutcome, syncedSettings.storeSuggestionHistory]);

  const generateMultiFileChangeSet = useCallback(async (context: ObserverRequest) => {
    if (!multiFilePlan || !multiFileBases || context.mode !== "plan_multi_file") return;
    setContextPreviewRequest(null); setMultiFilePreviewPhase(null); setMultiFileBusy(true); setMultiFileError(null); setObserverStatus("thinking");
    const result = await window.multiFileObserver.generate({ provider: observerProvider, ...(observerProvider === syncedSettings.preferredProvider ? { model: syncedSettings.preferredModel } : {}), storeHistory: syncedSettings.storeSuggestionHistory, userRequest: multiFileDescription.trim(), context, limits: multiFileLimits, plan: multiFilePlan, fileBases: multiFileBases });
    setMultiFileBusy(false); setObserverStatus("idle");
    if (!result.ok) { setMultiFileError(result.error); appendOutput(`Change-set generation: ${result.error}`, "error"); return; }
    setMultiFileChangeSet(result.value.changeSet); setMultiFileActiveIndex(0);
    appendOutput("The complete multi-file change set is ready for explicit diff review.", "success");
  }, [appendOutput, multiFileBases, multiFileDescription, multiFileLimits, multiFilePlan, observerProvider, recordMultiFileOutcome, syncedSettings.preferredModel, syncedSettings.preferredProvider, syncedSettings.storeSuggestionHistory]);

  const applyMultiFileChangeSet = useCallback(async () => {
    if (!openedWorkspace || !multiFilePlan || !multiFileChangeSet || multiFileBusy) return;
    setMultiFileBusy(true); setMultiFileError(null); const started = Date.now();
    recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "change_set", outcome: "approved", provider: observerProvider, planId: multiFilePlan.planId, changeSetId: multiFileChangeSet.changeSetId, fileCount: multiFileChangeSet.changes.length, updateCount: multiFileChangeSet.changes.filter((item) => item.operation === "update").length, createCount: multiFileChangeSet.changes.filter((item) => item.operation === "create").length, changedLines: 0, durationMs: 0 });
    const result = await window.multiFileObserver.apply({ workspaceId: openedWorkspace.workspaceId, plan: multiFilePlan, changeSet: multiFileChangeSet, dirtyPaths: tabsRef.current.filter(isDirty).map((tab) => tab.file.relativePath), limits: multiFileLimits, checkpointRetentionLimit: localSettings.checkpointRetentionLimit });
    setMultiFileBusy(false);
    if (!result.ok) { setMultiFileError(result.error); appendOutput(`Multi-file apply: ${result.error}`, "error"); recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "apply", outcome: "failed", provider: observerProvider, planId: multiFilePlan.planId, changeSetId: multiFileChangeSet.changeSetId, fileCount: multiFileChangeSet.changes.length, updateCount: multiFileChangeSet.changes.filter((item) => item.operation === "update").length, createCount: multiFileChangeSet.changes.filter((item) => item.operation === "create").length, changedLines: 0, durationMs: Date.now() - started }); return; }
    const snapshots = new Map(result.value.files.map((file) => [file.relativePath, file]));
    setTabs((current) => current.map((tab) => { const file = snapshots.get(tab.file.relativePath); return file ? { ...tab, file: { ...tab.file, content: file.content, modifiedAtMs: file.modifiedAtMs }, draft: file.content, saveStatus: null, externalConflict: null, externalNotice: null } : tab; }));
    const first = result.value.files[0];
    if (first) await selectFile({ name: first.relativePath.split("/").at(-1) ?? first.relativePath, relativePath: first.relativePath, kind: "file", isSymbolicLink: false });
    setRunOutput(null); setGitRefreshToken((value) => value + 1); setMultiFileApplied({ changeSet: multiFileChangeSet, result: result.value }); setMultiFileChangeSet(null);
    recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "apply", outcome: "accepted", provider: observerProvider, planId: multiFilePlan.planId, changeSetId: multiFileChangeSet.changeSetId, fileCount: multiFileChangeSet.changes.length, updateCount: multiFileChangeSet.changes.filter((item) => item.operation === "update").length, createCount: multiFileChangeSet.changes.filter((item) => item.operation === "create").length, changedLines: result.value.addedLines + result.value.deletedLines, durationMs: Date.now() - started });
    appendOutput(`Applied ${result.value.files.length} files atomically. Verification was not run.`, "success");
  }, [appendOutput, localSettings.checkpointRetentionLimit, multiFileBusy, multiFileChangeSet, multiFileLimits, multiFilePlan, observerProvider, openedWorkspace, recordMultiFileOutcome, selectFile, syncedSettings.storeSuggestionHistory]);

  const undoMultiFileChange = useCallback(async () => {
    if (!openedWorkspace || multiFileBusy) return;
    setMultiFileBusy(true); setMultiFileError(null); const started = Date.now();
    const result = await window.multiFileObserver.undo({ workspaceId: openedWorkspace.workspaceId, dirtyPaths: tabsRef.current.filter(isDirty).map((tab) => tab.file.relativePath) }); setMultiFileBusy(false);
    if (!result.ok) { setMultiFileError(result.error); appendOutput(`Multi-file rollback: ${result.error}`, "error"); return; }
    const restored = new Map(result.value.restoredFiles.map((file) => [file.relativePath, file])); const removed = new Set(result.value.removedPaths);
    setTabs((current) => current.filter((tab) => !removed.has(tab.file.relativePath)).map((tab) => { const file = restored.get(tab.file.relativePath); return file ? { ...tab, file: { ...tab.file, content: file.content, modifiedAtMs: file.modifiedAtMs }, draft: file.content, saveStatus: null, externalConflict: null, externalNotice: null } : tab; }));
    if (activePath && removed.has(activePath)) setActivePath(null);
    setMultiFileApplied(null); setMultiFilePlan(null); setMultiFileBases(null); setRunOutput(null); setGitRefreshToken((value) => value + 1);
    recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "rollback", outcome: "rolled_back", provider: observerProvider, changeSetId: result.value.changeSetId, fileCount: result.value.restoredFiles.length + result.value.removedPaths.length, updateCount: result.value.restoredFiles.length, createCount: result.value.removedPaths.length, changedLines: 0, durationMs: Date.now() - started });
    appendOutput("The complete multi-file change set was rolled back.", "success");
  }, [activePath, appendOutput, multiFileBusy, observerProvider, openedWorkspace, recordMultiFileOutcome, syncedSettings.storeSuggestionHistory]);

  const sendObserverRequest = useCallback(async (request: ObserverRequest) => {
    if (!activeTab || observerRequestInFlight.current || observerSuggestion || observerEditReview) return;
    if (request.mode === "explain" && request.kind === "code") {
      setContextPreviewRequest(null);
      await explanation.start(request, explanationPreviewSource.current ?? { path: activeTab.file.relativePath, content: activeTab.draft });
      return;
    }
    if (request.contextPackage && requiresCompleteFileConfirmation(request.contextPackage, syncedSettings.confirmCompleteFile) &&
      !window.confirm("This package includes at least one complete local file. Send the reviewed package to Observer?")) { setObserverStatus("idle"); return; }
    observerRequestInFlight.current = true;
    const requestedPath = activeTab.file.relativePath;
    const summary = request.contextPackage
      ? `${request.contextPackage.items.length} focused items · ~${request.contextPackage.estimatedTokens} tokens`
      : "Focused editor context";
    setContextPreviewRequest(null);
    setObserverStatus("thinking");
    setObserverError(null);
    setCopyStatus("idle");
    setObserverRequestPath(requestedPath);
    setSentContextSummary(summary);
    const result = await window.observer.ask(request);
    observerRequestInFlight.current = false;
    const completedProactive = pendingProactiveFeedbackRef.current;
    if (completedProactive) { pendingProactiveFeedbackRef.current = null; queueUsefulnessPrompt(completedProactive); }
    if (!result.ok) {
      setObserverError(result.error);
      setObserverStatus("error");
      appendOutput(`Observer: ${result.error}`, "error");
      return;
    }
    if (result.value.suggestion.edit && request.editBase) {
      const currentTab = tabsRef.current.find((tab) => tab.file.relativePath === requestedPath);
      if (!currentTab) {
        setObserverError("The target file is no longer open.");
        setObserverStatus("error");
        return;
      }
      const currentHash = await sha256Text(currentTab.draft);
      const validated = validateAndBuildProposedEdit(result.value.suggestion.edit, request.editBase, currentTab.draft, currentHash);
      setObserverEditReview({
        request,
        suggestion: result.value.suggestion,
        originalContent: currentTab.draft,
        proposedContent: validated.ok ? validated.value.proposedContent : currentTab.draft,
        contextSummary: summary,
        ...(!validated.ok ? { staleMessage: validated.message } : {}),
      });
      setObserverStatus("idle");
      appendOutput(validated.ok ? "Observer change is ready for explicit diff review." : `Observer edit rejected: ${validated.message}`, validated.ok ? "success" : "error");
      return;
    }
    setObserverSuggestion(result.value.suggestion);
    setObserverStatus("ready");
    appendOutput(`Observer returned a ${OBSERVER_MODE_LABELS[request.mode].toLowerCase()} suggestion.`, "success");
  }, [activeTab, appendOutput, explanation, observerEditReview, observerSuggestion, queueUsefulnessPrompt, syncedSettings.confirmCompleteFile]);

  const reviewLiveSuggestion = useCallback(async () => {
    const { request, suggestion } = liveState;
    if (!request?.editBase || !suggestion?.edit) return;
    const tab = tabsRef.current.find(tab => tab.file.relativePath === request.editBase!.targetRelativePath);
    if (!tab) return;
    const validated = validateAndBuildProposedEdit(suggestion.edit, request.editBase, tab.draft, await sha256Text(tab.draft));
    window.liveObserver.cancel();
    setObserverEditReview({ request, suggestion, originalContent: tab.draft, proposedContent: validated.ok ? validated.value.proposedContent : tab.draft, contextSummary: "Live Observer · bounded unsaved code · not tested", ...(!validated.ok ? { staleMessage: validated.message } : {}) });
  }, [liveState]);

  const askObserver = useCallback(async (refreshExplanation = false) => {
    window.liveObserver.cancel();
    if (!observerRequest || !activeTab || observerRequestInFlight.current || observerSuggestion || observerEditReview) return;
    if (explanationPreparing.current || (explanation.request && !refreshExplanation)) return;
    if (refreshExplanation) explanation.clear();
    const token = explanation.epoch.current;
    explanationPreviewSource.current = { path: activeTab.file.relativePath, content: activeTab.draft };
    setObserverStatus("thinking"); setObserverError(null);
    explanationPreparing.current = true;
    let prepared;
    try { prepared = await window.observer.prepare(observerRequest); }
    catch { prepared = { ok: false as const, error: "Context preview failed. Try again." }; }
    finally { explanationPreparing.current = false; }
    if (token !== explanation.epoch.current) return;
    if (!prepared.ok) { setObserverStatus("error"); setObserverError(prepared.error); appendOutput(`Observer: ${prepared.error}`, "error"); return; }
    setObserverStatus("idle");
    setMultiFilePreviewPhase(prepared.value.mode === "plan_multi_file" ? "plan" : null);
    setContextPreviewRequest(prepared.value);
  }, [activeTab, appendOutput, explanation, observerEditReview, observerRequest, observerSuggestion]);

  const finishProactiveNudge = useCallback((outcome: Exclude<ProactiveOutcome, "shown" | "resolved">) => {
    const event = proactiveEngineRef.current.dismiss(outcome);
    setProactiveNudge(null);
    if (event) mutateInsight(event, "action", outcome);
    return event;
  }, [mutateInsight]);

  const updateProactiveLocal = useCallback(async (update: (current: LocalSettings) => LocalSettings) => {
    const result = await window.settings.updateLocal(update(localSettings));
    if (result.ok) setLocalSettings(result.value);
    else appendOutput(`Proactive Observer settings: ${result.error}`, "error");
  }, [appendOutput, localSettings]);

  const handleProactiveAction = useCallback(async (action: ProactiveAction) => {
    const event = proactiveNudge?.event;
    if (!event || !syncedSettings.observerEnabled) return;
    const evidence = proactiveEvidenceRef.current.get(event.normalizedSignature);
    let tab = event.relativePath ? tabsRef.current.find((candidate) => candidate.file.relativePath === event.relativePath) : undefined;
    if (!tab && event.relativePath) {
      const read = await window.workspace.readFile(event.relativePath);
      if (read.ok) {
        tab = { file: read.value, draft: read.value.content, saving: false, saveStatus: null, availability: "available", externalConflict: null, externalNotice: null };
        await selectFile({ name: read.value.name, relativePath: read.value.relativePath, kind: "file", isSymbolicLink: false });
      }
    }
    tab ??= tabsRef.current.find((candidate) => candidate.file.relativePath === activePath);
    if (!tab || isExcludedFromAiContext(tab.file.relativePath, localSettings.aiContextExclusions)) {
      appendOutput("The proactive event has no safe file context to preview.", "error");
      return;
    }
    const mode: ObserverMode = action === "explain" || action === "investigate" ? "explain" : "fix_error";
    const lines = tab.draft.split("\n");
    const cursorLine = event.line ?? 1;
    const start = Math.max(0, cursorLine - 21);
    const end = Math.min(lines.length, cursorLine + 20);
    const prepare: ObserverPrepareRequest = {
      provider: observerProvider,
      ...(observerProvider === syncedSettings.preferredProvider ? { model: syncedSettings.preferredModel } : {}),
      storeHistory: syncedSettings.storeSuggestionHistory,
      seed: {
        mode,
        kind: isMarkdownFile(tab.file.name) ? "doc" : "code",
        activeRelativePath: tab.file.relativePath,
        fileName: tab.file.name,
        language: monacoLanguageForFile(tab.file.name),
        content: tab.draft,
        activeContentDirty: isDirty(tab),
        cursorLine,
        cursorColumn: event.column ?? 1,
        nearbyCode: lines.slice(start, end).join("\n"),
        ...(syncedSettings.includeDiagnostics && (event.line || evidence?.message) ? { diagnostic: { fileName: tab.file.name, line: event.line ?? 1, column: event.column ?? 1, message: evidence?.message ?? event.reason } } : {}),
        ...(syncedSettings.includeTerminalError && evidence?.runError ? { runError: evidence.runError } : {}),
        exclusions: localSettings.aiContextExclusions,
        maximumTotalCharacters: syncedSettings.maximumContextChars,
        maximumRelatedFiles: localSettings.contextMaximumRelatedFiles,
        maximumCharactersPerFile: localSettings.contextMaximumFileCharacters,
        ...(contextTrayItems.length ? { trayItems: contextTrayItems } : {}),
      },
    };
    pendingProactiveFeedbackRef.current = event;
    finishProactiveNudge(action);
    setObserverMode(mode);
    setObserverStatus("thinking");
    const prepared = await window.observer.prepare(prepare);
    setObserverStatus("idle");
    if (!prepared.ok) {
      pendingProactiveFeedbackRef.current = null;
      queueUsefulnessPrompt(event);
      setObserverError(prepared.error);
      setObserverStatus("error");
      return;
    }
    setContextPreviewRequest(prepared.value);
  }, [activePath, appendOutput, contextTrayItems, finishProactiveNudge, localSettings.aiContextExclusions, localSettings.contextMaximumFileCharacters, localSettings.contextMaximumRelatedFiles, observerProvider, proactiveNudge, queueUsefulnessPrompt, selectFile, syncedSettings.includeDiagnostics, syncedSettings.includeTerminalError, syncedSettings.maximumContextChars, syncedSettings.observerEnabled, syncedSettings.preferredModel, syncedSettings.preferredProvider, syncedSettings.storeSuggestionHistory]);

  const muteProactiveNudge = useCallback((scope: "error" | "file" | "project") => {
    const event = finishProactiveNudge(scope === "error" ? "mute_error" : scope === "file" ? "mute_file" : "mute_project");
    if (!event) return;
    queueUsefulnessPrompt(event);
    void updateProactiveLocal((current) => scope === "error"
      ? { ...current, proactiveMutedErrors: Array.from(new Set([...current.proactiveMutedErrors, event.normalizedSignature])) }
      : scope === "file" && event.relativePath
        ? { ...current, proactiveMutedFiles: Array.from(new Set([...current.proactiveMutedFiles, event.relativePath])) }
        : { ...current, proactiveMutedProjects: Array.from(new Set([...current.proactiveMutedProjects, event.workspaceId])) });
  }, [finishProactiveNudge, queueUsefulnessPrompt, updateProactiveLocal]);

  const disableProactiveAssist = useCallback(() => {
    const event = finishProactiveNudge("disable_assist"); if (event) queueUsefulnessPrompt(event);
    void updateProactiveLocal((current) => ({ ...current, proactiveObserverMode: "manual" }));
  }, [finishProactiveNudge, queueUsefulnessPrompt, updateProactiveLocal]);

  const answerUsefulness = useCallback((usefulness: UsefulnessFeedback) => {
    const prompt = usefulnessPrompt; setUsefulnessPrompt(null); if (!prompt) return;
    void window.observerInsights.mutate({ kind: "feedback", eventId: prompt.eventId, timestamp: Date.now(), usefulness, collectionEnabled: localSettings.proactiveMetricsCollection }, localSettings.proactiveRetentionDays);
  }, [localSettings.proactiveMetricsCollection, localSettings.proactiveRetentionDays, usefulnessPrompt]);

  const rejectObserverEdit = useCallback(() => {
    const suggestionId = observerEditReview?.suggestion.id;
    setObserverEditReview(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    appendOutput("Observer change rejected; the editor was not modified.");
    if (suggestionId) void window.observer.recordOutcome({ suggestionId, outcome: "dismissed" });
  }, [appendOutput, observerEditReview]);

  const regenerateObserverEdit = useCallback(() => {
    const suggestionId = observerEditReview?.suggestion.id;
    setObserverEditReview(null);
    if (suggestionId) void window.observer.recordOutcome({ suggestionId, outcome: "dismissed" });
    window.setTimeout(() => void askObserver(), 0);
  }, [askObserver, observerEditReview]);

  const acceptObserverEdit = useCallback(async () => {
    const review = observerEditReview;
    const workspaceId = openedWorkspace?.workspaceId;
    const editBase = review?.request.editBase;
    const edit = review?.suggestion.edit;
    if (!review || !workspaceId || !editBase || !edit || applyingObserverEdit) return;
    setApplyingObserverEdit(true);
    const currentTab = tabsRef.current.find((tab) => tab.file.relativePath === editBase.targetRelativePath);
    const currentHash = currentTab ? await sha256Text(currentTab.draft) : "";
    const validated = currentTab ? validateAndBuildProposedEdit(edit, editBase, currentTab.draft, currentHash) : null;
    if (!currentTab || !validated?.ok) {
      const message = validated && !validated.ok ? validated.message : "The target file is no longer open.";
      setObserverEditReview((current) => current ? { ...current, staleMessage: message } : current);
      setApplyingObserverEdit(false);
      return;
    }
    const appliedContentHash = await sha256Text(validated.value.proposedContent);
    const checkpoint = await window.checkpoints.create({
      workspaceId,
      relativePath: editBase.targetRelativePath,
      previousContent: currentTab.draft,
      previousContentHash: currentHash,
      appliedContentHash,
      ...(review.suggestion.id ? { suggestionId: review.suggestion.id } : {}),
      retentionLimit: localSettings.checkpointRetentionLimit,
    });
    if (!checkpoint.ok) {
      setApplyingObserverEdit(false);
      setObserverEditReview((current) => current ? { ...current, staleMessage: `Checkpoint creation failed: ${checkpoint.error}` } : current);
      appendOutput(`Observer change was not applied: ${checkpoint.error}`, "error");
      return;
    }
    const latest = tabsRef.current.find((tab) => tab.file.relativePath === editBase.targetRelativePath);
    if (!latest || await sha256Text(latest.draft) !== currentHash) {
      setApplyingObserverEdit(false);
      setObserverEditReview((current) => current ? { ...current, staleMessage: "The file changed after this suggestion was generated." } : current);
      return;
    }
    setTabs((current) => current.map((tab) => tab.file.relativePath === editBase.targetRelativePath
      ? { ...tab, draft: validated.value.proposedContent, saveStatus: null, autoSaveBlocked: true }
      : tab));
    setObserverEditReview(null);
    setApplyingObserverEdit(false);
    setObserverRequestPath(null);
    setSentContextSummary(null);
    appendOutput("Observer change applied in memory. The file remains unsaved; use Undo Observer Change to restore the checkpoint.", "success");
    if (review.suggestion.id) void window.observer.recordOutcome({ suggestionId: review.suggestion.id, outcome: "accepted" });
  }, [applyingObserverEdit, appendOutput, localSettings.checkpointRetentionLimit, observerEditReview, openedWorkspace?.workspaceId]);

  const undoObserverChange = useCallback(async () => {
    if (!activeTab || !openedWorkspace) { appendOutput("Open the edited file before undoing an Observer change.", "error"); return; }
    if (activeTab.externalConflict || activeTab.availability !== "available") { appendOutput("The underlying file changed or is unavailable, so the checkpoint cannot be safely restored.", "error"); return; }
    const currentContentHash = await sha256Text(activeTab.draft);
    const restored = await window.checkpoints.restore({ workspaceId: openedWorkspace.workspaceId, relativePath: activeTab.file.relativePath, currentContentHash });
    if (!restored.ok) { appendOutput(restored.error, "error"); return; }
    setTabs((current) => current.map((tab) => tab.file.relativePath === activeTab.file.relativePath
      ? { ...tab, draft: restored.value.previousContent, saveStatus: null, autoSaveBlocked: true }
      : tab));
    appendOutput("Restored the previous content from the local Observer checkpoint.", "success");
  }, [activeTab, appendOutput, openedWorkspace]);

  const dismissObserver = useCallback(() => {
    if (explanation.request) { explanation.clear(); return; }
    const suggestionId = observerSuggestion?.id;
    setObserverSuggestion(null);
    setObserverError(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setCopyStatus("idle");
    setObserverEditReview(null);
    if (suggestionId) {
      void window.observer.recordOutcome({ suggestionId, outcome: "dismissed" });
    }
  }, [explanation, observerSuggestion]);

  const copySnippet = useCallback(async () => {
    const snippet = observerSuggestion?.snippet;
    if (!snippet) {
      setCopyStatus("error");
      return;
    }
    const copied = await copyObserverSnippet(snippet, async (value) => {
      const result = await window.observer.copySnippet(value);
      if (!result.ok) throw new Error(result.error);
    });
    setCopyStatus(copied ? "copied" : "error");
  }, [observerSuggestion]);

  useEffect(() => {
    const handleObserverShortcut = (event: KeyboardEvent) => {
      if (!isObserverAskShortcut(event)) return;
      event.preventDefault();
      if (observerRequest && observerStatus !== "thinking" && !observerSuggestion && !observerEditReview && !contextPreviewRequest) {
        void askObserver();
      }
    };
    window.addEventListener("keydown", handleObserverShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleObserverShortcut, { capture: true });
  }, [askObserver, contextPreviewRequest, observerEditReview, observerRequest, observerStatus, observerSuggestion]);

  useEffect(() => {
    if (!contextPreviewRequest) return;
    const closePreview = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setContextPreviewRequest(null); } };
    window.addEventListener("keydown", closePreview, { capture: true });
    return () => window.removeEventListener("keydown", closePreview, { capture: true });
  }, [contextPreviewRequest]);

  useEffect(() => {
    if (!proactiveNudge || contextPreviewRequest || observerEditReview || settingsOpen) return;
    const dismissNudge = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const dismissed = finishProactiveNudge("not_now"); if (dismissed) queueUsefulnessPrompt(dismissed);
    };
    window.addEventListener("keydown", dismissNudge, { capture: true });
    return () => window.removeEventListener("keydown", dismissNudge, { capture: true });
  }, [contextPreviewRequest, finishProactiveNudge, observerEditReview, proactiveNudge, queueUsefulnessPrompt, settingsOpen]);

  useEffect(() => {
    if (observerStatus !== "ready" || !observerSuggestion) return;
    const handleObserverDismiss = (event: KeyboardEvent) => {
      if (!isObserverDismissShortcut(event)) return;
      event.preventDefault();
      dismissObserver();
    };
    window.addEventListener("keydown", handleObserverDismiss, { capture: true });
    return () => window.removeEventListener("keydown", handleObserverDismiss, { capture: true });
  }, [dismissObserver, observerStatus, observerSuggestion]);

  useEffect(() => {
    if (!observerEditReview) return;
    const closeReview = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      rejectObserverEdit();
    };
    window.addEventListener("keydown", closeReview, { capture: true });
    return () => window.removeEventListener("keydown", closeReview, { capture: true });
  }, [observerEditReview, rejectObserverEdit]);

  const signOut = useCallback(async () => {
    if (!(await canOpenWorkspace())) return;
    clearExplanation(); setExplainQuestion("");
    setSigningOut(true);
    setAccountError(null);
    const error = await onSignOut();
    if (error) {
      setAccountError(error);
      setSigningOut(false);
    }
  }, [canOpenWorkspace, clearExplanation, onSignOut]);

  const saveAll = useCallback(async () => {
    for (const tab of tabsRef.current.filter(isDirty)) {
      if (!(await saveTab(tab.file.relativePath))) return;
    }
  }, [saveTab]);

  const closeCurrentWorkspace = useCallback(async () => {
    if (!workspaceOpen || !(await canOpenWorkspace())) return;
    const result = await window.workspace.closeWorkspace();
    if (!result.ok) {
      appendOutput(result.error, "error");
      return;
    }
    requestSequence.current += 1;
    proactiveEngineRef.current = new ProactiveObserverEngine();
    proactiveDiagnosticsRef.current.clear();
    proactiveEvidenceRef.current.clear();
    proactiveInsightIdsRef.current.clear();
    pendingProactiveFeedbackRef.current = null;
    setUsefulnessPrompt(null);
    setProactiveNudge(null);
    setTabs([]);
    setActivePath(null);
    setSurface({ status: "idle" });
    setExternalChanges(null);
    externalReadSequence.current.clear();
    clearExplanation(); setExplainQuestion(""); explanationPreviewSource.current = null;
    setWorkspaceOpen(false);
    setOpenedWorkspace(null);
    setWorkspaceVersion((current) => current + 1);
    setRunOutput(null);
    setEditorLocation(null);
    setObserverSnapshot(null);
    setObserverSuggestion(null);
    setObserverError(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setObserverEditReview(null);
    setMultiFilePlan(null);
    setMultiFileBases(null);
    setMultiFileChangeSet(null);
    setMultiFileApplied(null);
    setMultiFileError(null);
    setMultiFilePreviewPhase(null);
    setContextPreviewRequest(null);
    setContextTrayItems([]);
    setLatestTaskFailure(null);
    setDocumentationSessionChanges([]);
    setDocumentationUpdateView(null); setDocumentationUpdateRelationship(null);
    setMarkdownViewModes({});
    setSidebarView("explorer");
    appendOutput("Workspace closed. Welcome screen opened.");
  }, [appendOutput, canOpenWorkspace, clearExplanation, workspaceOpen]);

  const saveLocalSettings = useCallback(async (settings: LocalSettings) => {
    const result = await window.settings.updateLocal(settings);
    if (!result.ok) return result.error;
    setLocalSettings(result.value);
    return null;
  }, []);

  const documentationChanges = useMemo<ChangedCodeSource[]>(() => {
    const dirty = tabs.filter((tab) => isDirty(tab) && !isMarkdownFile(tab.file.name)).map((tab) => ({ relativePath: tab.file.relativePath, originalContent: tab.file.content, currentContent: tab.draft, kind: "session" as const }));
    return [...documentationSessionChanges.filter((saved) => !dirty.some((item) => item.relativePath === saved.relativePath)), ...dirty];
  }, [documentationSessionChanges, tabs]);

  const openDocumentationLocation = useCallback(async (relativePath: string, line = 1) => {
    await selectFile({ name: relativePath.split("/").at(-1) ?? relativePath, relativePath, kind: "file", isSymbolicLink: false });
    setEditorLocation({ relativePath, line: Math.max(1, line), column: 1, token: Date.now() });
  }, [selectFile]);

  const decideDocumentationRelationship = useCallback(async (relationship: DocumentationRelationship, decision: RelationshipDecision["decision"]) => {
    const decisions = [...localSettings.documentationRelationshipDecisions.filter((item) => item.relationshipId !== relationship.id), { relationshipId: relationship.id, evidenceHash: relationship.evidenceHash, decision }].slice(-500);
    const result = await window.settings.updateLocal({ ...localSettings, documentationRelationshipDecisions: decisions });
    if (result.ok) { setLocalSettings(result.value); appendOutput(decision === "confirmed" ? "Documentation relationship confirmed." : "Documentation relationship marked not related.", "success"); }
    else appendOutput(result.error, "error");
  }, [appendOutput, localSettings]);

  const addDocumentationRelationshipContext = useCallback(async (relationship: DocumentationRelationship) => {
    const [code, document] = await Promise.all([window.workspace.readFile(relationship.codePath), window.workspace.readFile(relationship.documentationPath)]);
    if (!code.ok || !document.ok) { appendOutput("One of the related files is unavailable, so nothing was attached.", "error"); return; }
    const excerpt = (content: string, line: number) => { const lines = content.split(/\r?\n/); const start = Math.max(1, line - 10); const end = Math.min(lines.length, line + 10); return { content: lines.slice(start - 1, end).join("\n"), start, end }; };
    const codeExcerpt = excerpt(code.value.content, relationship.codeLineStart ?? 1);
    const docExcerpt = excerpt(document.value.content, relationship.documentationLineStart);
    const reason = `Documentation relationship (${relationship.type}, ${relationship.confidence}): ${relationship.evidence}`.slice(0, 500);
    try {
      const pair = await Promise.all([
        createContextTrayItem({ type: "file_excerpt", title: `Related code: ${relationship.codePath}`, content: codeExcerpt.content, relativePath: relationship.codePath, lineStart: codeExcerpt.start, lineEnd: codeExcerpt.end, sourceContent: code.value.content, reason, maximumCharacters: 8_000, provenance: "documentation_relationship" }),
        createContextTrayItem({ type: "markdown_section", title: `Related documentation: ${relationship.documentationPath}`, content: `Evidence: ${relationship.evidence}\n\n${docExcerpt.content}`, relativePath: relationship.documentationPath, lineStart: docExcerpt.start, lineEnd: docExcerpt.end, sourceContent: document.value.content, reason, maximumCharacters: 8_000, provenance: "documentation_relationship" }),
      ]);
      if (pair.some((item) => findContextTrayDuplicate(contextTrayItems, item))) { appendOutput("One of those relationship excerpts is already attached.", "error"); return; }
      if (contextTrayTotal([...contextTrayItems, ...pair]).characters > syncedSettings.maximumContextChars) { appendOutput("Those relationship excerpts would exceed the current Context Tray limit.", "error"); return; }
      setContextTrayItems((current) => [...current, ...pair]);
      appendOutput("Added bounded code and documentation excerpts with relationship evidence to the local Context Tray.", "success");
    } catch (error) { appendOutput(error instanceof Error ? error.message : "Documentation relationship context could not be attached.", "error"); }
  }, [appendOutput, contextTrayItems, syncedSettings.maximumContextChars]);

  const startDocumentationDraft = useCallback(async (relationship: DocumentationRelationship) => {
    if (!syncedSettings.observerEnabled || (relationship.decision !== "confirmed" && relationship.confidence !== "high")) { appendOutput("Confirm this relationship before drafting a documentation update.", "error"); return; }
    if (!/\.md$/i.test(relationship.documentationPath) || /(?:^|\/)(?:node_modules|dist|build|out|coverage|\.next)\//i.test(relationship.documentationPath) || isMandatorySecretFile(relationship.documentationPath) || isExcludedFromAiContext(relationship.documentationPath, localSettings.aiContextExclusions)) { appendOutput("Only safe existing workspace Markdown files can be updated.", "error"); return; }
    if (localSettings.documentationUpdateMaximumFiles < 1) return;
    const openDocument = tabsRef.current.find((tab) => tab.file.relativePath === relationship.documentationPath);
    if (openDocument && (isDirty(openDocument) || openDocument.externalConflict || openDocument.availability !== "available")) { appendOutput("Save or resolve the documentation tab before preparing an update.", "error"); return; }
    const [codeRead, documentRead, rulesRead, writable] = await Promise.all([window.workspace.readFile(relationship.codePath), window.workspace.readFile(relationship.documentationPath), window.workspace.readFile("AGENTS.md"), window.workspace.canWriteFile(relationship.documentationPath)]);
    if (!codeRead.ok || !documentRead.ok || !writable.ok || !writable.value) { appendOutput("The related code or Markdown file no longer exists or is not writable.", "error"); return; }
    const openCode = tabsRef.current.find((tab) => tab.file.relativePath === relationship.codePath);
    const codeContent = openCode?.draft ?? codeRead.value.content; const documentContent = documentRead.value.content;
    const [codeHash, documentationHash] = await Promise.all([sha256Text(codeContent), sha256Text(documentContent)]);
    if (codeHash !== relationship.codeHash || documentationHash !== relationship.documentationHash) { appendOutput("Relationship evidence changed. Recheck Documentation Impact before generating.", "error"); setWorkspaceVersion((value) => value + 1); return; }
    const codeLines = codeContent.split(/\r?\n/); const codeLine = relationship.codeLineStart ?? 1; const codeExcerpt = codeLines.slice(Math.max(0, codeLine - 11), Math.min(codeLines.length, codeLine + 10)).join("\n");
    const section = markdownSectionAt(documentContent, relationship.documentationLineStart);
    const safeCode = redactContextSecrets(codeExcerpt); const safeSection = redactContextSecrets(section.text); const safeRules = rulesRead.ok ? redactContextSecrets(rulesRead.value.content.slice(0, 8_000)) : { content: "", redacted: false };
    const context: DocumentationUpdateContext = { userRequest: "Update only the relevant Markdown section to match the verified local code evidence.", relationshipId: relationship.id, evidenceHash: relationship.evidenceHash, relationshipType: relationship.type, confidence: relationship.confidence, reference: relationship.reference, evidence: relationship.evidence, codePath: relationship.codePath, codeHash, codeExcerpt: safeCode.content, documentationPath: relationship.documentationPath, documentationHash, documentationContent: documentContent, affectedHeading: section.heading, sectionRange: section.range, sectionText: safeSection.content, redacted: safeCode.redacted || safeSection.redacted || safeRules.redacted, ...(safeRules.content ? { projectRules: safeRules.content } : {}), selectedContext: [] };
    setDocumentationUpdateRelationship(relationship); setDocumentationUpdateView({ stage: "prepare", value: { context, availableContext: contextTrayItems.filter((item) => item.staleState === "fresh"), userRequest: context.userRequest, busy: false } });
  }, [appendOutput, contextTrayItems, localSettings.aiContextExclusions, localSettings.documentationUpdateMaximumFiles, syncedSettings.observerEnabled]);

  const generateDocumentationDraft = useCallback(async (userRequest: string, selectedIds: string[]) => {
    if (!documentationUpdateView || documentationUpdateView.stage !== "prepare") return;
    const preparation = documentationUpdateView.value; const context = preparation.context;
    const [code, document] = await Promise.all([window.workspace.readFile(context.codePath), window.workspace.readFile(context.documentationPath)]);
    const openCode = tabsRef.current.find((tab) => tab.file.relativePath === context.codePath);
    if (!code.ok || !document.ok || await sha256Text(openCode?.draft ?? code.value.content) !== context.codeHash || await sha256Text(document.value.content) !== context.documentationHash) { setDocumentationUpdateView({ stage: "prepare", value: { ...preparation, busy: false, error: "Code or Markdown became stale. Cancel and Refresh Context from Documentation Impact." } }); return; }
    const selectedContext = preparation.availableContext.filter((item) => selectedIds.includes(item.id)).map((item) => ({ title: item.title, type: item.type, content: item.content.slice(0, 8_000), ...(item.webSource ? { source: item.webSource.sourceUrl } : item.source?.relativePath ? { source: item.source.relativePath } : {}) }));
    const { documentationContent: _localDocument, ...boundedContext } = context;
    const request = { ...boundedContext, userRequest, selectedContext, provider: observerProvider, ...(observerProvider === syncedSettings.preferredProvider ? { model: syncedSettings.preferredModel } : {}), storeHistory: syncedSettings.storeSuggestionHistory };
    setDocumentationUpdateView({ stage: "prepare", value: { ...preparation, userRequest, busy: true } });
    const result = await window.observer.documentationDraft(request);
    if (!result.ok) { setDocumentationUpdateView({ stage: "prepare", value: { ...preparation, userRequest, busy: false, error: result.error } }); appendOutput(`Documentation draft: ${result.error}`, "error"); return; }
    const validated = validateDocumentationEdit(result.value.edit, { ...context, userRequest, selectedContext }, document.value.content, context.documentationHash, context.codeHash);
    if (!validated.ok) { setDocumentationUpdateView({ stage: "prepare", value: { ...preparation, userRequest, busy: false, error: validated.message } }); return; }
    setDocumentationUpdateView({ stage: "review", value: { context: { ...context, userRequest, selectedContext }, validated: validated.value, busy: false } });
    appendOutput("Documentation draft is ready for explicit diff review. No file was modified.", "success");
  }, [appendOutput, documentationUpdateView, observerProvider, syncedSettings.preferredModel, syncedSettings.preferredProvider, syncedSettings.storeSuggestionHistory]);

  const editDocumentationDraft = useCallback((replacement: string) => {
    setDocumentationUpdateView((current) => {
      if (!current || current.stage !== "review") return current;
      const candidate = { ...current.value.validated.edit, replacementMarkdown: replacement };
      const validated = validateDocumentationEdit(candidate, current.value.context, current.value.context.documentationContent, current.value.context.documentationHash, current.value.context.codeHash);
      return validated.ok ? { stage: "review", value: { ...current.value, validated: validated.value, staleMessage: undefined } } : { stage: "review", value: { ...current.value, staleMessage: validated.message } };
    });
  }, []);

  const acceptDocumentationDraft = useCallback(async () => {
    if (!documentationUpdateView || documentationUpdateView.stage !== "review" || !openedWorkspace) return;
    const review = documentationUpdateView.value; const context = review.context;
    const open = tabsRef.current.find((tab) => tab.file.relativePath === context.documentationPath);
    if (open && (isDirty(open) || open.externalConflict)) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: "The documentation tab has newer or conflicting edits." } }); return; }
    const [code, document] = await Promise.all([window.workspace.readFile(context.codePath), window.workspace.readFile(context.documentationPath)]); const openCode = tabsRef.current.find((tab) => tab.file.relativePath === context.codePath);
    if (!code.ok || !document.ok) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: "A relationship source is unavailable." } }); return; }
    const codeHash = await sha256Text(openCode?.draft ?? code.value.content); const documentHash = await sha256Text(document.value.content);
    const validated = validateDocumentationEdit(review.validated.edit, context, document.value.content, documentHash, codeHash);
    if (!validated.ok || !documentationUpdateRelationship || documentationUpdateRelationship.id !== context.relationshipId) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: validated.ok ? "The confirmed relationship disappeared." : validated.message } }); return; }
    setDocumentationUpdateView({ stage: "review", value: { ...review, busy: true } }); const appliedHash = await sha256Text(validated.value.proposedContent);
    const checkpoint = await window.checkpoints.create({ workspaceId: openedWorkspace.workspaceId, relativePath: context.documentationPath, previousContent: document.value.content, previousContentHash: documentHash, appliedContentHash: appliedHash, suggestionId: validated.value.edit.suggestionId, retentionLimit: localSettings.checkpointRetentionLimit });
    if (!checkpoint.ok) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: `Checkpoint creation failed: ${checkpoint.error}` } }); return; }
    const latest = await window.workspace.readFile(context.documentationPath);
    if (!latest.ok || await sha256Text(latest.value.content) !== documentHash) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: "Markdown changed after checkpoint creation; nothing was applied." } }); return; }
    const written = await window.workspace.writeFile({ relativePath: context.documentationPath, content: validated.value.proposedContent, expectedModifiedAtMs: latest.value.modifiedAtMs });
    if (!written.ok) { setDocumentationUpdateView({ stage: "review", value: { ...review, staleMessage: written.error } }); return; }
    setTabs((current) => current.map((tab) => tab.file.relativePath === context.documentationPath ? { ...tab, file: { ...tab.file, content: validated.value.proposedContent, modifiedAtMs: written.value.modifiedAtMs }, draft: validated.value.proposedContent, saveStatus: null, autoSaveBlocked: false } : tab));
    setWorkspaceVersion((value) => value + 1); setGitRefreshToken((value) => value + 1); setDocumentationUpdateView({ stage: "applied", path: context.documentationPath, relationshipId: context.relationshipId });
    await openDocumentationLocation(context.documentationPath, context.sectionRange.start.line);
    if (syncedSettings.storeSuggestionHistory) void window.observer.recordOutcome({ suggestionId: validated.value.edit.suggestionId, outcome: "accepted" });
    appendOutput("Documentation update saved with a local rollback checkpoint. No commands or Git actions ran.", "success");
  }, [appendOutput, documentationUpdateRelationship, documentationUpdateView, localSettings.checkpointRetentionLimit, openDocumentationLocation, openedWorkspace, syncedSettings.storeSuggestionHistory]);

  const undoDocumentationUpdate = useCallback(async () => {
    if (!documentationUpdateView || documentationUpdateView.stage !== "applied" || !openedWorkspace) return;
    const current = await window.workspace.readFile(documentationUpdateView.path); if (!current.ok) { appendOutput(current.error, "error"); return; }
    const restored = await window.checkpoints.restore({ workspaceId: openedWorkspace.workspaceId, relativePath: documentationUpdateView.path, currentContentHash: await sha256Text(current.value.content) });
    if (!restored.ok) { appendOutput(restored.error, "error"); return; }
    const written = await window.workspace.writeFile({ relativePath: documentationUpdateView.path, content: restored.value.previousContent, expectedModifiedAtMs: current.value.modifiedAtMs });
    if (!written.ok) { appendOutput(written.error, "error"); return; }
    setTabs((tabs) => tabs.map((tab) => tab.file.relativePath === documentationUpdateView.path ? { ...tab, file: { ...tab.file, content: restored.value.previousContent, modifiedAtMs: written.value.modifiedAtMs }, draft: restored.value.previousContent, saveStatus: null } : tab)); setWorkspaceVersion((value) => value + 1); setGitRefreshToken((value) => value + 1); setDocumentationUpdateView(null); appendOutput("Documentation update rolled back without overwriting newer edits.", "success");
  }, [appendOutput, documentationUpdateView, openedWorkspace]);
  const saveSyncedSettings = useCallback(async (settings: SyncedSettings) => {
    const result = await window.settings.updateSynced(settings);
    if (!result.ok) return result.error;
    setSyncedSettings(result.value);
    setObserverMode(result.value.defaultObserverAction);
    setObserverProvider(result.value.preferredProvider);
    return null;
  }, []);
  const refreshProviders = useCallback(async () => {
    const result = await window.settings.providerStatus();
    if (result.ok) setProviderStatuses(result.value);
  }, []);
  const saveApiKey = useCallback(async (provider: Exclude<ObserverProvider, "demo">, apiKey: string, verify: boolean) => {
    const result = await window.settings.saveApiKey({ provider, apiKey, verify });
    if (!result.ok) return result.error;
    await refreshProviders();
    return null;
  }, [refreshProviders]);
  const deleteApiKey = useCallback(async (provider: Exclude<ObserverProvider, "demo">) => {
    const result = await window.settings.deleteApiKey(provider);
    if (!result.ok) return result.error;
    await refreshProviders();
    return null;
  }, [refreshProviders]);
  const resetLocalSettings = useCallback(async () => {
    const result = await window.settings.resetLocal();
    if (!result.ok) return result.error;
    setLocalSettings(result.value);
    return null;
  }, []);
  const clearRecentProjects = useCallback(async () => {
    const result = await window.workspace.clearRecent();
    if (result.ok) setRecentRefreshToken((value) => value + 1);
    return result.ok ? null : result.error;
  }, []);
  const clearObserverHistory = useCallback(async () => {
    const result = await window.settings.clearObserverHistory();
    return result.ok ? null : result.error;
  }, []);
  const clearObserverCheckpoints = useCallback(async () => {
    const result = await window.checkpoints.clear();
    return result.ok ? null : result.error;
  }, []);

  const issueExplorerCommand = useCallback((action: "open-folder" | "new-file" | "new-folder") => {
    if (action !== "open-folder") setSidebarView("explorer");
    setExplorerCommandRequest({ token: Date.now() + Math.random(), action });
  }, []);

  const issueBottomCommand = useCallback((action: "terminal" | "output" | "new-terminal") => {
    setBottomCommandRequest({ token: Date.now() + Math.random(), action });
  }, []);

  const runVerificationTasks = useCallback(async (commands: string[]) => {
    if (!openedWorkspace) return;
    setOutputFocusToken((current) => current + 1);
    for (const command of commands) {
      appendOutput(`Running explicit verification: ${command}`);
      const result = await window.verificationTask.run({ taskId: crypto.randomUUID(), command });
      if (!result.ok) {
        appendOutput(result.error, "error");
        continue;
      }
      const task = result.value;
      if (task.stdout.trim()) appendOutput(task.stdout.slice(-8_000));
      if (task.stderr.trim()) appendOutput(task.stderr.slice(-8_000), task.status === "succeeded" ? "info" : "error");
      appendOutput(`${task.kind === "test" ? "Test" : "Build"} ${task.status} in ${task.durationMs} ms${task.exitCode === null ? "" : ` (exit ${task.exitCode})`}.`, task.status === "succeeded" ? "success" : "error");
      if (task.status !== "succeeded") setLatestTaskFailure({ kind: task.kind, command, summary: `${task.kind} failed\ncommand: ${command}\nexit: ${task.exitCode ?? "unknown"}\n${task.stderr || task.stdout || "No output."}`.slice(0, 8_000) });
      const message = `${command}\n${task.stderr || task.stdout || `exit:${task.exitCode ?? "unknown"}`}`.slice(0, 16_000);
      consumeProactiveObservation(proactiveEngineRef.current.observeObjectiveFailure({
        kind: task.kind,
        workspaceId: openedWorkspace.workspaceId,
        ...(activePath ? { relativePath: activePath } : {}),
        message,
        succeeded: task.status === "succeeded",
      }, proactiveSettings), {
        message: (task.stderr || task.stdout).slice(-2_000) || `The explicit ${task.kind} action failed.`,
        ...(task.stderr ? { runError: task.stderr.slice(-8_000) } : {}),
      });
      if (task.status !== "succeeded") break;
    }
  }, [activePath, appendOutput, consumeProactiveObservation, openedWorkspace, proactiveSettings]);

  const commandState = useMemo<CommandState>(() => ({
    workspaceOpen,
    activeFile: Boolean(activeTab),
    activeFileSavable: Boolean(
      activeTab && activeTab.availability === "available" && !activeTab.externalConflict
    ),
    dirtyFileCount: tabs.filter(isDirty).length,
    activeFileRunnable: Boolean(activeTab && runSupport(activeTab.file.name) === "supported"),
    runActive: runOutput?.status === "running",
    terminalActive: terminalState.active,
    terminalCreating: terminalState.creating,
    observerCanAsk: Boolean(observerRequest) && observerStatus === "idle" && !observerSuggestion && !observerEditReview && !contextPreviewRequest,
    multiFileUndoAvailable: Boolean(multiFileApplied),
    markdownActive: activeIsMarkdown,
    welcomeOpen: !workspaceOpen,
    hasSelection: Boolean(activeTab && observerSnapshot?.relativePath === activeTab.file.relativePath && observerSnapshot.selectedCode),
    hasDiagnostic: Boolean(activeTab && runOutput?.diagnostics.some((item) => item.relativePath === activeTab.file.relativePath)),
    hasRunFailure: runOutput?.status === "failed",
    hasTaskFailure: Boolean(latestTaskFailure),
    contextTrayCount: contextTrayItems.length,
  }), [
    activeIsMarkdown,
    activeTab,
    observerRequest,
    contextPreviewRequest,
    observerStatus,
    observerSuggestion,
    observerEditReview,
    multiFileApplied,
    runOutput?.status,
    tabs,
    terminalState,
    workspaceOpen,
    observerSnapshot,
    latestTaskFailure,
    contextTrayItems.length,
  ]);

  const commandHandlers = useMemo<CommandHandlers>(() => ({
    "file.openFolder": () => issueExplorerCommand("open-folder"),
    "file.closeWorkspace": () => void closeCurrentWorkspace(),
    "file.save": () => { if (activePath) void saveTab(activePath); },
    "file.saveAll": () => void saveAll(),
    "file.newFile": () => issueExplorerCommand("new-file"),
    "file.newFolder": () => issueExplorerCommand("new-folder"),
    "search.findInFiles": () => {
      setSidebarView("search");
      setSearchFocusToken((current) => current + 1);
    },
    "git.showSourceControl": () => setSidebarView("source-control"),
    "view.showExplorer": () => setSidebarView("explorer"),
    "view.showSearch": () => {
      setSidebarView("search");
      setSearchFocusToken((current) => current + 1);
    },
    "view.toggleTerminal": () => issueBottomCommand("terminal"),
    "view.toggleOutput": () => issueBottomCommand("output"),
    "view.focusObserver": () => setObserverFocusToken((current) => current + 1),
    "terminal.new": () => issueBottomCommand("new-terminal"),
    "run.currentFile": () => void runCurrentFile(),
    "run.stop": () => void stopCurrentRun(),
    "observer.ask": () => void askObserver(),
    "observer.undoChange": () => void undoObserverChange(),
    "observer.undoMultiFileChange": () => void undoMultiFileChange(),
    "observer.context.addSelection": () => void addActiveEditorContext("selection"),
    "observer.context.addCurrentSymbol": () => void addActiveEditorContext("symbol"),
    "observer.context.addFileExcerpt": () => void addActiveEditorContext("excerpt"),
    "observer.context.addDiagnostic": () => { const diagnostic = activeTab && runOutput?.diagnostics.find((item) => item.relativePath === activeTab.file.relativePath); if (diagnostic) void addDiagnosticContext(diagnostic); },
    "observer.context.addRunFailure": () => void addLatestRunFailureContext(),
    "observer.context.addTaskFailure": () => void addLatestTaskFailureContext(),
    "observer.context.addMarkdownSection": () => void addActiveEditorContext("markdown_section"),
    "observer.context.clear": () => { if (contextTrayItems.length === 0 || window.confirm("Clear all session-local Context Tray items?")) setContextTrayItems([]); },
    "markdown.edit": () => {
      if (activePath) setMarkdownViewModes((current) => ({ ...current, [activePath]: "edit" }));
    },
    "markdown.preview": () => {
      if (activePath) setMarkdownViewModes((current) => ({ ...current, [activePath]: "preview" }));
    },
    "markdown.split": () => {
      if (activePath) setMarkdownViewModes((current) => ({ ...current, [activePath]: "split" }));
    },
    "preferences.openSettings": () => setSettingsOpen(true),
    "window.openWelcome": () => void closeCurrentWorkspace(),
  }), [
    activePath,
    askObserver,
    closeCurrentWorkspace,
    issueBottomCommand,
    issueExplorerCommand,
    runCurrentFile,
    saveAll,
    saveTab,
    stopCurrentRun,
    undoObserverChange,
    undoMultiFileChange,
    addActiveEditorContext,
    addDiagnosticContext,
    addLatestRunFailureContext,
    addLatestTaskFailureContext,
    activeTab,
    runOutput,
    contextTrayItems,
  ]);

  const resolvedCommands = useMemo(
    () => resolveCommands(commandState, commandHandlers),
    [commandHandlers, commandState]
  );

  useEffect(() => {
    const handleCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (unsavedPrompt) return;
      if (!shouldOpenCommandPalette(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setCommandPaletteToken((current) => current + 1);
    };
    window.addEventListener("keydown", handleCommandPaletteShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleCommandPaletteShortcut, { capture: true });
  }, [unsavedPrompt]);

  useEffect(() => {
    const openSourceControl = (event: KeyboardEvent) => {
      if (!shouldOpenSourceControl(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (workspaceOpen) setSidebarView("source-control");
    };
    window.addEventListener("keydown", openSourceControl, { capture: true });
    return () => window.removeEventListener("keydown", openSourceControl, { capture: true });
  }, [workspaceOpen]);

  const openGitDiff = useCallback(async (file: GitChangedFile) => {
    if (file.kind !== "deleted") setExplorerRevealRequest({ relativePath: file.relativePath, token: Date.now() });
    setGitDiff({ status: "loading", file });
    const result = await window.git.diff({ relativePath: file.relativePath });
    setGitDiff((current) => {
      if (!current || current.status !== "loading" || current.file.relativePath !== file.relativePath) return current;
      return result.ok ? { status: "ready", value: result.value } : { status: "error", file, message: result.error };
    });
  }, []);

  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
      if (!shouldOpenSettings(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(true);
    };
    window.addEventListener("keydown", openSettings, { capture: true });
    return () => window.removeEventListener("keydown", openSettings, { capture: true });
  }, []);

  const hasDirtyTabs = tabs.some(isDirty);
  useEffect(() => {
    const preventUnsavedClose = (event: BeforeUnloadEvent) => {
      if (!hasDirtyTabs) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedClose);
    return () => window.removeEventListener("beforeunload", preventUnsavedClose);
  }, [hasDirtyTabs]);

  const updateDraft = (relativePath: string, content: string) => {
    const previous = tabsRef.current.find(tab => tab.file.relativePath === relativePath);
    if (liveState.enabled && previous && previous.draft !== content && relativePath === activePath) {
      lastLiveEdit.current = { path: relativePath, content };

    }

    // Immediate invalidation, including edits later undone before the next render.
    window.automaticRun.activity({ relativePath, dirty: true, blocked: true, focused: document.hasFocus() });
    setContextTrayItems((current) => markContextTrayPathStale(current, relativePath));
    setTabs((current) =>
      current.map((tab) =>
        tab.file.relativePath === relativePath
          ? { ...tab, draft: content, saveStatus: null, externalNotice: null }
          : tab
      )
    );
  };

  const answerUnsavedPrompt = (choice: UnsavedChoice) => {
    const prompt = unsavedPrompt;
    setUnsavedPrompt(null);
    prompt?.resolve(choice);
  };

  const setPaneSize = (pane: ResizablePane, value: number) => {
    const limits = PANE_LIMITS[pane];
    setPaneSizes((current) => ({
      ...current,
      [pane]: Math.min(limits.max, Math.max(limits.min, value)),
    }));
  };

  const beginPaneResize = (pane: ResizablePane, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startingPointer = pane === "bottom" ? event.clientY : event.clientX;
    const startingSize = paneSizes[pane];
    document.body.classList.add("pane-resizing");

    const move = (pointerEvent: PointerEvent) => {
      const pointer = pane === "bottom" ? pointerEvent.clientY : pointerEvent.clientX;
      const delta = pointer - startingPointer;
      setPaneSize(pane, startingSize + (pane === "observer" || pane === "bottom" ? -delta : delta));
    };
    const finish = () => {
      document.body.classList.remove("pane-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const handlePaneResizeKey = (pane: ResizablePane, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const decreaseKey = pane === "bottom" ? "ArrowDown" : pane === "observer" ? "ArrowRight" : "ArrowLeft";
    const increaseKey = pane === "bottom" ? "ArrowUp" : pane === "observer" ? "ArrowLeft" : "ArrowRight";
    if (event.key !== decreaseKey && event.key !== increaseKey) return;
    event.preventDefault();
    setPaneSize(pane, paneSizes[pane] + (event.key === increaseKey ? 8 : -8));
  };

  const layoutStyle = {
    "--sidebar-width": `${paneSizes.sidebar}px`,
    "--observer-width": `${paneSizes.observer}px`,
    "--bottom-panel-height": `${paneSizes.bottom}px`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <ModalFocusManager />
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <h1>Proactive·AI <span>IDE</span></h1>
        <span className="phase-label">Secure workspace</span>
        <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+, / Cmd+,)">⚙ Settings</button>
        <details className="user-menu">
          <summary title={user.email}>
            <span className="user-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
            <span>{user.name || user.email}</span>
          </summary>
          <div className="user-menu-popover">
            <strong>{user.name || "Proactive AI user"}</strong>
            <span>{user.email}</span>
            <button type="button" onClick={() => setSettingsOpen(true)}>Settings</button>
            {accountError && <p role="alert">{accountError}</p>}
            <button type="button" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </details>
      </header>

      <div className="workspace-shell">
      <nav className="activity-bar" aria-label="Workspace views">
        <button type="button" className={sidebarView === "explorer" ? "active" : ""} aria-current={sidebarView === "explorer" ? "page" : undefined} aria-label="Explorer" data-label="Explorer" onClick={() => setSidebarView("explorer")}><span aria-hidden="true">▱</span></button>
        <button type="button" className={sidebarView === "search" ? "active" : ""} aria-current={sidebarView === "search" ? "page" : undefined} aria-label="Search" data-label="Search" onClick={() => { setSidebarView("search"); setSearchFocusToken((current) => current + 1); }}><span aria-hidden="true">⌕</span></button>
        <button type="button" className={sidebarView === "source-control" ? "active" : ""} aria-current={sidebarView === "source-control" ? "page" : undefined} aria-label="Source Control" data-label="Source Control" title="Source Control (Ctrl/Cmd+Shift+G)" onClick={() => setSidebarView("source-control")}><span aria-hidden="true">⑂</span></button>
        <button type="button" className={sidebarView === "documentation-impact" ? "active" : ""} aria-current={sidebarView === "documentation-impact" ? "page" : undefined} aria-label="Documentation impact" data-label="Docs" onClick={() => setSidebarView("documentation-impact")}><span aria-hidden="true">¶</span></button>
      </nav>

      <div className="ide-layout" style={layoutStyle}>
        <aside className="panel explorer-panel">
          <div className="sidebar-heading">{sidebarView === "explorer" ? "Explorer" : sidebarView === "search" ? "Search" : sidebarView === "source-control" ? "Source Control" : "Documentation"}</div>
          <div className={`sidebar-view ${sidebarView === "explorer" ? "active" : ""}`}>
            <Explorer
              openedWorkspace={openedWorkspace}
              workspaceOpen={workspaceOpen}
              activeFilePath={activePath}
              onSelectFile={(entry) => void selectFile(entry)}
              onBeforeWorkspaceOpen={canOpenWorkspace}
              onWorkspaceOpened={clearWorkspaceTabs}
              onEntryRenamed={renameOpenEntries}
              onEntryDeleted={deleteOpenEntries}
              getDeleteImpact={getDeleteImpact}
              externalChanges={externalChanges}
              onStatus={appendOutput}
              commandRequest={explorerCommandRequest}
              confirmBeforeDelete={localSettings.confirmBeforeDelete}
              revealRequest={explorerRevealRequest}
              onAddFileToContext={(entry) => void addExplorerFileContext(entry)}
            />
          </div>
          <div className={`sidebar-view ${sidebarView === "search" ? "active" : ""}`}>
            <SearchPanel
              active={sidebarView === "search"}
              workspaceOpen={workspaceOpen}
              workspaceVersion={workspaceVersion}
              focusToken={searchFocusToken}
              onOpenMatch={(match) => void focusSearchMatch(match)}
            />
          </div>
          <div className={`sidebar-view ${sidebarView === "source-control" ? "active" : ""}`}>
            <SourceControlPanel
              active={sidebarView === "source-control"}
              workspaceOpen={workspaceOpen}
              workspaceVersion={workspaceVersion}
              refreshToken={gitRefreshToken}
              onOpenDiff={(file) => void openGitDiff(file)}
            />
          </div>
          <div className={`sidebar-view ${sidebarView === "documentation-impact" ? "active" : ""}`}>
            <DocumentationImpactPanel active={sidebarView === "documentation-impact"} workspaceOpen={workspaceOpen} workspaceVersion={workspaceVersion} settings={localSettings} sessionChanges={documentationChanges} observerEnabled={syncedSettings.observerEnabled} onOpen={(path, line) => void openDocumentationLocation(path, line)} onDecision={(relationship, decision) => void decideDocumentationRelationship(relationship, decision)} onAddBoth={(relationship) => void addDocumentationRelationshipContext(relationship)} onDraftUpdate={(relationship) => void startDocumentationDraft(relationship)} />
          </div>
        </aside>

        <button type="button" className="pane-resizer sidebar-resizer" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={PANE_LIMITS.sidebar.min} aria-valuemax={PANE_LIMITS.sidebar.max} aria-valuenow={paneSizes.sidebar} onPointerDown={(event) => beginPaneResize("sidebar", event)} onKeyDown={(event) => handlePaneResizeKey("sidebar", event)} />

        <main className="panel editor-panel">
          <PanelTitle>Editor</PanelTitle>
          {!workspaceOpen ? (
            <WelcomeScreen
              onBeforeOpen={canOpenWorkspace}
              onWorkspaceOpened={clearWorkspaceTabs}
              refreshToken={recentRefreshToken}
            />
          ) : multiFileApplied ? (
            <MultiFileAppliedSummary
              changeSet={multiFileApplied.changeSet}
              result={multiFileApplied.result}
              undoing={multiFileBusy}
              onUndo={() => void undoMultiFileChange()}
              onOpenTerminal={() => issueBottomCommand("terminal")}
              onSkip={() => { setMultiFileApplied(null); setMultiFilePlan(null); setMultiFileBases(null); }}
              onRunVerification={() => {
                const commands = safeVerificationCommands(multiFileApplied.changeSet.verificationSuggestions);
                if (!commands) { appendOutput("Suggested verification contains an unsupported or unsafe command. Review and run it manually in the terminal.", "error"); issueBottomCommand("terminal"); return; }
                if (window.confirm(`Run these controlled verification actions?\n\n${commands.join("\n")}`)) void runVerificationTasks(commands);
              }}
            />
          ) : multiFileChangeSet ? (
            <MultiFileChangeReview
              changeSet={multiFileChangeSet}
              activeIndex={multiFileActiveIndex}
              settings={localSettings.editor}
              theme={MONACO_CREAM_THEME}
              applying={multiFileBusy}
              conflict={multiFileError}
              onSelect={setMultiFileActiveIndex}
              onApprove={() => void applyMultiFileChangeSet()}
              onReject={() => { recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "change_set", outcome: "rejected", provider: observerProvider, planId: multiFilePlan?.planId, changeSetId: multiFileChangeSet.changeSetId, fileCount: multiFileChangeSet.changes.length, updateCount: multiFileChangeSet.changes.filter((item) => item.operation === "update").length, createCount: multiFileChangeSet.changes.filter((item) => item.operation === "create").length, changedLines: 0, durationMs: 0 }); setMultiFileChangeSet(null); setMultiFilePlan(null); setMultiFileBases(null); setMultiFileError(null); }}
              onRegenerate={() => { setMultiFileChangeSet(null); void approveMultiFilePlan(); }}
            />
          ) : multiFilePlan ? (
            <MultiFilePlanReview
              plan={multiFilePlan}
              busy={multiFileBusy}
              error={multiFileError}
              onApprove={() => void approveMultiFilePlan()}
              onEdit={() => { setMultiFilePlan(null); setMultiFileBases(null); setObserverFocusToken((value) => value + 1); }}
              onCancel={() => { recordMultiFileOutcome({ storeHistory: syncedSettings.storeSuggestionHistory, phase: "plan", outcome: "rejected", provider: observerProvider, planId: multiFilePlan.planId, fileCount: multiFilePlan.files.length, updateCount: multiFilePlan.files.filter((item) => item.operation === "update").length, createCount: multiFilePlan.files.filter((item) => item.operation === "create").length, changedLines: 0, durationMs: 0 }); setMultiFilePlan(null); setMultiFileBases(null); setMultiFileError(null); }}
            />
          ) : observerEditReview ? (
            <ObserverEditReview
              review={observerEditReview}
              settings={localSettings.editor}
              theme={MONACO_CREAM_THEME}
              applying={applyingObserverEdit}
              onAccept={() => void acceptObserverEdit()}
              onReject={rejectObserverEdit}
              onRegenerate={regenerateObserverEdit}
              onCopy={() => void window.observer.copySnippet(observerEditReview.proposedContent)}
            />
          ) : gitDiff?.status === "loading" ? (
            <div className="git-diff-loading"><span aria-hidden="true">⋯</span><p>Loading diff for {gitDiff.file.relativePath}…</p><button type="button" onClick={() => { void window.git.cancel(); setGitDiff(null); }}>Cancel</button></div>
          ) : gitDiff?.status === "error" ? (
            <div className="git-diff-loading error" role="alert"><span aria-hidden="true">!</span><p>{gitDiff.message}</p><button type="button" onClick={() => setGitDiff(null)}>Back to Editor</button></div>
          ) : gitDiff?.status === "ready" ? (
            <GitDiffViewer
              diff={gitDiff.value}
              editorSettings={localSettings.editor}
              theme={MONACO_CREAM_THEME}
              onClose={() => setGitDiff(null)}
              onOpenFile={() => {
                const relativePath = gitDiff.value.relativePath;
                setSidebarView("explorer");
                void selectFile({ name: relativePath.split("/").at(-1) ?? relativePath, relativePath, kind: "file", isSymbolicLink: false });
              }}
            />
          ) : (
          <EditorWorkspace
            onLiveEdit={(edit) => { if (liveState.enabled && edit.relativePath === activePath) window.liveObserver.edit(edit); }}
            liveState={liveState}
            onLiveReview={() => void reviewLiveSuggestion()}
            tabs={tabs}
            activePath={activePath}
            surface={surface}
            onActivate={(relativePath) => {
              setActivePath(relativePath);
              setSurface({ status: "idle" });
            }}
            onClose={(relativePath) => void closeTab(relativePath)}
            onChange={updateDraft}
            onSave={(relativePath) => void saveTab(relativePath)}
            onRun={() => void runCurrentFile()}
            onStop={() => void stopCurrentRun()}
            running={runOutput?.status === "running"}
            focusLocation={editorLocation}
            onReloadExternal={reloadExternalVersion}
            onKeepLocal={keepLocalChanges}
            onObserverContextChange={setObserverSnapshot}
            onDiagnosticsChange={(relativePath, diagnostics) => {
              proactiveDiagnosticsRef.current.set(relativePath, diagnostics);
            }}
            onAddContext={(action) => void addActiveEditorContext(action)}
            markdownViewMode={activeMarkdownViewMode}
            onMarkdownViewModeChange={(mode) => {
              if (!activePath) return;
              setMarkdownViewModes((current) => ({ ...current, [activePath]: mode }));
            }}
            editorSettings={localSettings.editor}
            editorTheme={MONACO_CREAM_THEME}
          />
          )}
        </main>

        <button type="button" className="pane-resizer observer-resizer" role="separator" aria-label="Resize Observer panel" aria-orientation="vertical" aria-valuemin={PANE_LIMITS.observer.min} aria-valuemax={PANE_LIMITS.observer.max} aria-valuenow={paneSizes.observer} onPointerDown={(event) => beginPaneResize("observer", event)} onKeyDown={(event) => handlePaneResizeKey("observer", event)} />

        <aside className="panel observer-panel">
          <ObserverPanel
            explainQuestion={explainQuestion}
            onExplainQuestionChange={setExplainQuestion}
            explanationCard={explanation.request && <ExplanationConversation request={explanation.request} result={explanation.result} busy={explanation.busy} error={explanation.error}
              stale={!tabs.some(tab => tab.file.relativePath === explanation.snapshot?.path && tab.draft === explanation.snapshot.content && tab.availability === "available" && !tab.externalConflict)}
              onFollowup={explanation.followup} onClear={explanation.clear} onCancel={explanation.cancel}
              onRefresh={activePath === explanation.snapshot?.path && activeObserverMode === "explain" && observerRequest ? () => void askObserver(true) : undefined} />}

            automaticRunEnabled={automaticRunState.enabled}
            automaticRunCard={<><LiveObserverCard onAsk={() => void askObserver()} canAsk={!explanation.request && syncedSettings.observerEnabled && Boolean(observerRequest) && observerStatus === "idle" && !observerSuggestion && !observerEditReview && !contextPreviewRequest} state={liveState} provider={observerProvider} available={workspaceOpen && settingsLoaded} onState={setLiveState} onReview={() => void reviewLiveSuggestion()} /><AutomaticRunCard state={automaticRunState} provider={observerProvider} available={workspaceOpen && settingsLoaded && syncedSettings.observerEnabled} onState={setAutomaticRunState} /></>}
            mode={activeObserverMode}
            modes={observerModes}
            provider={observerProvider}
            status={observerStatus}
            contextSummary={observerStatus === "idle" ? currentContextSummary : sentContextSummary}
            suggestion={observerSuggestion}
            error={observerError}
            copyStatus={copyStatus}
            canAsk={!explanation.request && syncedSettings.observerEnabled && Boolean(observerRequest) && observerStatus === "idle" && !observerSuggestion && !observerEditReview && !contextPreviewRequest}
            onModeChange={(mode) => {
              setObserverMode(mode);
              if (observerStatus === "error") dismissObserver();
            }}
            onProviderChange={(provider) => {
              setObserverProvider(provider);
              if (observerStatus === "error") dismissObserver();
            }}
            onAsk={() => void askObserver()}
            onCopy={() => void copySnippet()}
            onDismiss={dismissObserver}
            onUndo={() => void undoObserverChange()}
            canUndo={Boolean(activeTab && openedWorkspace)}
            focusToken={observerFocusToken}
            multiFileDescription={multiFileDescription}
            onMultiFileDescriptionChange={setMultiFileDescription}
            proactiveNudge={automaticRunState.enabled && proactiveNudge?.event.detectorType === "failed_run" ? null : proactiveNudge}
            onProactiveAction={(action) => void handleProactiveAction(action)}
            onProactiveNotNow={() => { const event = finishProactiveNudge("not_now"); if (event) queueUsefulnessPrompt(event); }}
            onProactiveMute={muteProactiveNudge}
            onDisableProactiveAssist={disableProactiveAssist}
            usefulnessPrompt={usefulnessPrompt}
            onUsefulness={answerUsefulness}
            contextTrayItems={contextTrayItems}
            maximumContextCharacters={syncedSettings.maximumContextChars}
            webContextStatus={webContextStatus}
            onRemoveContextItem={(id) => setContextTrayItems((current) => current.filter((item) => item.id !== id))}
            onClearContext={() => { if (contextTrayItems.length === 0 || window.confirm("Clear all session-local Context Tray items?")) setContextTrayItems([]); }}
            onMoveContextItem={(id, direction) => setContextTrayItems((current) => reorderContextTray(current, id, direction))}
            onRefreshContextItem={(id) => void refreshTrayItem(id)}
            onKeepOriginalContextItem={(id) => setContextTrayItems((current) => current.map((item) => item.id === id ? keepOriginalContextTrayItem(item) : item))}
            onTruncateContextItem={(id) => { const item = contextTrayItems.find((candidate) => candidate.id === id); if (item) void truncateContextTrayItem(item, Math.max(500, Math.floor(item.estimatedCharacters / 2))).then((truncated) => setContextTrayItems((current) => current.map((candidate) => candidate.id === id ? truncated : candidate))); }}
          />
        </aside>

        <button type="button" className="pane-resizer bottom-resizer" role="separator" aria-label="Resize bottom panel" aria-orientation="horizontal" aria-valuemin={PANE_LIMITS.bottom.min} aria-valuemax={PANE_LIMITS.bottom.max} aria-valuenow={paneSizes.bottom} onPointerDown={(event) => beginPaneResize("bottom", event)} onKeyDown={(event) => handlePaneResizeKey("bottom", event)} />

        <section className="panel output-panel">
          <BottomPanel
            workspaceOpen={workspaceOpen}
            workspaceVersion={workspaceVersion}
            messages={outputMessages}
            run={runOutput}
            outputFocusToken={outputFocusToken}
            onDiagnosticClick={(diagnostic) => void focusDiagnostic(diagnostic)}
            onStatus={appendOutput}
            commandRequest={bottomCommandRequest}
            onTerminalStateChange={setTerminalState}
            onAddDiagnostic={(diagnostic) => void addDiagnosticContext(diagnostic)}
            onAddSelectedOutput={(content, source) => void addSelectedOutputContext(content, source)}
            onAddRunFailure={() => void addLatestRunFailureContext()}
            onAddTaskFailure={() => void addLatestTaskFailureContext()}
            hasTaskFailure={Boolean(latestTaskFailure)}
          />
        </section>
      </div>
      </div>

      <footer className="status-bar">
        <span>Local-first secure workspace</span>
        <span>{hasDirtyTabs ? "Unsaved changes" : `${tabs.length} open file${tabs.length === 1 ? "" : "s"}`}</span>
      </footer>

      {unsavedPrompt && (
        <div className="dialog-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <h2 id="unsaved-dialog-title">{unsavedPrompt.title}</h2>
            <p>{unsavedPrompt.message}</p>
            <div className="dialog-actions">
              <button type="button" data-dialog-dismiss onClick={() => answerUnsavedPrompt("cancel")}>Cancel</button>
              {unsavedPrompt.allowDiscard !== false && (
                <button type="button" onClick={() => answerUnsavedPrompt("discard")}>Discard</button>
              )}
              <button type="button" className="primary" autoFocus onClick={() => answerUnsavedPrompt("save")}>
                {unsavedPrompt.saveLabel}
              </button>
            </div>
          </section>
        </div>
      )}
      <CommandPalette
        commands={resolvedCommands}
        openToken={commandPaletteToken}
        onClosed={() => undefined}
      />
      {incomingWebContext && <IncomingWebContextReview
        item={incomingWebContext}
        canAdd={contextTrayTotal(contextTrayItems).characters + incomingWebContext.characterCount <= syncedSettings.maximumContextChars}
        onAdd={() => void window.webContext.accept(incomingWebContext.transferId).then((result) => { if (!result.ok) appendOutput(result.error ?? "Incoming browser selection could not be added.", "error"); })}
        onReject={() => void window.webContext.reject(incomingWebContext.transferId).then((result) => { if (!result.ok) appendOutput(result.error ?? "Incoming browser selection could not be rejected.", "error"); })}
      />}
      {documentationUpdateView && <DocumentationUpdateWorkspace
        view={documentationUpdateView}
        theme={MONACO_CREAM_THEME}
        fontSize={localSettings.editor.fontSize}
        onCancel={() => { if (documentationUpdateView.stage === "review" && syncedSettings.storeSuggestionHistory) void window.observer.recordOutcome({ suggestionId: documentationUpdateView.value.validated.edit.suggestionId, outcome: "dismissed" }); setDocumentationUpdateView(null); }}
        onGenerate={(request, selectedIds) => void generateDocumentationDraft(request, selectedIds)}
        onEdit={editDocumentationDraft}
        onAccept={() => void acceptDocumentationDraft()}
        onRegenerate={() => { if (documentationUpdateRelationship) void startDocumentationDraft(documentationUpdateRelationship); }}
        onRefresh={() => { if (documentationUpdateRelationship) void startDocumentationDraft(documentationUpdateRelationship); }}
        onCopy={() => { if (documentationUpdateView.stage === "review") void window.observer.copySnippet(documentationUpdateView.value.validated.edit.replacementMarkdown); }}
        onOpenCode={() => { if (documentationUpdateRelationship) void openDocumentationLocation(documentationUpdateRelationship.codePath, documentationUpdateRelationship.codeLineStart); }}
        onOpenDocument={() => { if (documentationUpdateRelationship) void openDocumentationLocation(documentationUpdateRelationship.documentationPath, documentationUpdateRelationship.documentationLineStart); }}
        onUndo={() => void undoDocumentationUpdate()}
        onPreview={() => { if (documentationUpdateView.stage === "applied") { setMarkdownViewModes((current) => ({ ...current, [documentationUpdateView.path]: "preview" })); void openDocumentationLocation(documentationUpdateView.path); setDocumentationUpdateView(null); } }}
        onRecheck={() => { setWorkspaceVersion((value) => value + 1); setSidebarView("documentation-impact"); setDocumentationUpdateView(null); }}
        onGitDiff={() => { if (documentationUpdateView.stage === "applied") void window.git.status().then((status) => { if (status.ok && status.value.state === "repository") { const file = status.value.files.find((item) => item.relativePath === documentationUpdateView.path); if (file) void openGitDiff(file); } }); setDocumentationUpdateView(null); }}
        onAddContext={() => { if (documentationUpdateRelationship) void addDocumentationRelationshipContext(documentationUpdateRelationship); }}
      />}
      <SettingsPanel
        open={settingsOpen}
        local={localSettings}
        synced={syncedSettings}
        providers={providerStatuses}
        webContextStatus={webContextStatus}
        onClose={() => setSettingsOpen(false)}
        onSaveLocal={saveLocalSettings}
        onSaveSynced={saveSyncedSettings}
        onSaveKey={saveApiKey}
        onDeleteKey={deleteApiKey}
        onResetLocal={resetLocalSettings}
        onClearRecents={clearRecentProjects}
        onClearHistory={clearObserverHistory}
        onClearCheckpoints={clearObserverCheckpoints}
        onSetBrowserIntegration={async (enabled) => { const result = await window.webContext.setEnabled(enabled); return result.ok ? null : result.error ?? "Browser integration could not be updated."; }}
        onStartBrowserPairing={async () => { const result = await window.webContext.startPairing(); return result.ok ? null : result.error ?? "Pairing could not start."; }}
        onCancelBrowserPairing={async () => { const result = await window.webContext.cancelPairing(); return result.ok ? null : result.error ?? "Pairing could not be canceled."; }}
        onRevokeBrowserPairing={async () => { const result = await window.webContext.revoke(); return result.ok ? null : result.error ?? "Pairing could not be revoked."; }}
        onSignOut={() => void signOut()}
      />
      {contextPreviewRequest && <ContextPreview
        request={contextPreviewRequest}
        onChange={setContextPreviewRequest}
        onCancel={() => { const event = pendingProactiveFeedbackRef.current; pendingProactiveFeedbackRef.current = null; if (event) queueUsefulnessPrompt(event); setContextPreviewRequest(null); setMultiFilePreviewPhase(null); }}
        onSend={() => {
          if (multiFilePreviewPhase === "plan") void requestMultiFilePlan(contextPreviewRequest);
          else if (multiFilePreviewPhase === "generate") void generateMultiFileChangeSet(contextPreviewRequest);
          else void sendObserverRequest(contextPreviewRequest);
        }}
      />}
    </div>
  );
}
