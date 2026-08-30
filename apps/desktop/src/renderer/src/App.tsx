import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "../../shared/workspace";
import type { RunDiagnostic } from "../../shared/runner";
import type { DesktopAuthUser } from "../../shared/auth";
import {
  canInsertObserverSnippet,
  copyObserverSnippet,
  createObserverRequest,
  isObserverAskShortcut,
  isObserverDismissShortcut,
  observerContextSummary,
  CODE_OBSERVER_MODES,
  DOCUMENT_OBSERVER_MODES,
  OBSERVER_MODE_LABELS,
  relevantObserverRunError,
  type ObserverMode,
  type ObserverProvider,
  type ObserverRequest,
  type ObserverSuggestion,
} from "../../shared/observer";
import Explorer from "./Explorer";
import BottomPanel, { type IdeOutputMessage, type RunOutputState } from "./BottomPanel";
import ObserverPanel, { type ObserverStatus } from "./ObserverPanel";
import MarkdownPreview from "./MarkdownPreview";

type SaveStatus = { kind: "success" | "error"; message: string };

interface EditorTab {
  file: WorkspaceTextFile;
  draft: string;
  saving: boolean;
  saveStatus: SaveStatus | null;
  availability: "available" | "unavailable";
  externalConflict: WorkspaceTextFile | null;
  externalNotice: string | null;
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
  token: number;
}

interface EditorObserverSnapshot {
  relativePath: string;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  nearbyCode: string;
}

interface ObserverInsertRequest {
  id: number;
  relativePath: string;
  snippet: string;
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
  tabs: EditorTab[];
  activePath: string | null;
  surface: EditorSurface;
  onActivate: (relativePath: string) => void;
  onClose: (relativePath: string) => void;
  onChange: (relativePath: string, content: string) => void;
  onSave: (relativePath: string) => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
  focusLocation: EditorLocation | null;
  onReloadExternal: (relativePath: string) => void;
  onKeepLocal: (relativePath: string) => void;
  onObserverContextChange: (snapshot: EditorObserverSnapshot) => void;
  insertRequest: ObserverInsertRequest | null;
  onInsertComplete: (id: number, inserted: boolean) => void;
  markdownViewMode: MarkdownViewMode;
  onMarkdownViewModeChange: (mode: MarkdownViewMode) => void;
}

function EditorWorkspace({
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
  insertRequest,
  onInsertComplete,
  markdownViewMode,
  onMarkdownViewModeChange,
}: EditorWorkspaceProps) {
  const activeTab = tabs.find((tab) => tab.file.relativePath === activePath) ?? null;
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const activePathRef = useRef(activePath);
  const observerContextRef = useRef(onObserverContextChange);
  const insertCompleteRef = useRef(onInsertComplete);
  const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const handledInsertRef = useRef<number | null>(null);
  activePathRef.current = activePath;
  observerContextRef.current = onObserverContextChange;
  insertCompleteRef.current = onInsertComplete;

  useEffect(() => {
    activePathRef.current = activePath;
    observerContextRef.current = onObserverContextChange;
    insertCompleteRef.current = onInsertComplete;
  }, [activePath, onInsertComplete, onObserverContextChange]);

  useEffect(() => () => {
    editorDisposablesRef.current.forEach((disposable) => disposable.dispose());
    editorDisposablesRef.current = [];
  }, []);

  useEffect(() => {
    if (!focusLocation || focusLocation.relativePath !== activePath || !editorRef.current) return;
    editorRef.current.setPosition({ lineNumber: focusLocation.line, column: focusLocation.column });
    editorRef.current.revealLineInCenter(focusLocation.line);
    editorRef.current.focus();
  }, [activePath, focusLocation]);

  useEffect(() => {
    if (!insertRequest || handledInsertRef.current === insertRequest.id) return;
    handledInsertRef.current = insertRequest.id;
    const instance = editorRef.current;
    const position = instance?.getPosition();
    if (!instance || !position || insertRequest.relativePath !== activePath) {
      insertCompleteRef.current(insertRequest.id, false);
      return;
    }
    instance.pushUndoStop();
    const inserted = instance.executeEdits("observer", [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: insertRequest.snippet,
      forceMoveMarkers: true,
    }]);
    instance.pushUndoStop();
    instance.focus();
    insertCompleteRef.current(insertRequest.id, inserted);
  }, [activePath, insertRequest]);

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
              theme="vs-dark"
              onMount={(instance) => {
                editorRef.current = instance;
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
                  instance.onDidChangeModel(emitObserverContext),
                ];
                if (focusLocation?.relativePath === activeTab.file.relativePath) {
                  instance.setPosition({ lineNumber: focusLocation.line, column: focusLocation.column });
                  instance.revealLineInCenter(focusLocation.line);
                  instance.focus();
                }
                emitObserverContext();
              }}
              onChange={(value) => onChange(activeTab.file.relativePath, value ?? "")}
              loading={<Placeholder icon="⋯">Starting editor…</Placeholder>}
              saveViewState
              options={{
                automaticLayout: true,
                fontSize: 13,
                lineNumbers: "on",
                minimap: { enabled: false },
                padding: { top: 14 },
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: "on",
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
  const [observerSnapshot, setObserverSnapshot] = useState<EditorObserverSnapshot | null>(null);
  const [observerSuggestion, setObserverSuggestion] = useState<ObserverSuggestion | null>(null);
  const [observerError, setObserverError] = useState<string | null>(null);
  const [observerRequestPath, setObserverRequestPath] = useState<string | null>(null);
  const [sentContextSummary, setSentContextSummary] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [insertRequest, setInsertRequest] = useState<ObserverInsertRequest | null>(null);
  const [markdownViewModes, setMarkdownViewModes] = useState<Record<string, MarkdownViewMode>>({});
  const tabsRef = useRef(tabs);
  const runOutputRef = useRef(runOutput);
  const observerRequestInFlight = useRef(false);
  const insertSequence = useRef(0);
  const requestSequence = useRef(0);
  const externalReadSequence = useRef(new Map<string, number>());
  const outputSequence = useRef(0);

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
  const activeMarkdownViewMode = activePath ? markdownViewModes[activePath] ?? "edit" : "edit";
  const observerModes = activeIsMarkdown ? DOCUMENT_OBSERVER_MODES : CODE_OBSERVER_MODES;
  const activeObserverMode: ObserverMode = observerModes.some((mode) => mode === observerMode)
    ? observerMode
    : activeIsMarkdown ? "explain_document" : "explain";

  const observerRequest = useMemo<ObserverRequest | null>(() => {
    if (!activeTab || activeTab.availability !== "available" || activeTab.externalConflict) return null;
    const snapshot = observerSnapshot?.relativePath === activeTab.file.relativePath
      ? observerSnapshot
      : null;
    const diagnostic = activeObserverMode === "fix_error"
      ? runOutput?.diagnostics.find((item) => item.relativePath === activeTab.file.relativePath)
      : undefined;
    const fallbackNearbyCode = activeTab.draft.split("\n").slice(0, 41).join("\n");
    return createObserverRequest({
      provider: observerProvider,
      mode: activeObserverMode,
      kind: activeIsMarkdown ? "doc" : "code",
      fileName: activeTab.file.name,
      language: monacoLanguageForFile(activeTab.file.name),
      content: activeTab.draft,
      cursorLine: snapshot?.cursorLine ?? diagnostic?.line ?? 1,
      cursorColumn: snapshot?.cursorColumn ?? diagnostic?.column ?? 1,
      selectedCode: snapshot?.selectedCode,
      nearbyCode: snapshot?.nearbyCode ?? fallbackNearbyCode,
      diagnostic: diagnostic
        ? {
            fileName: activeTab.file.name,
            line: diagnostic.line,
            column: diagnostic.column,
            message: diagnostic.message,
          }
        : undefined,
      runError: diagnostic && runOutput?.status === "failed"
        ? relevantObserverRunError(runOutput.stderr, {
            fileName: activeTab.file.name,
            line: diagnostic.line,
            column: diagnostic.column,
            message: diagnostic.message,
          })
        : undefined,
    });
  }, [activeIsMarkdown, activeObserverMode, activeTab, observerProvider, observerSnapshot, runOutput]);
  const currentContextSummary = observerRequest ? observerContextSummary(observerRequest) : null;

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
          externalNotice: null,
          saveStatus: {
            kind: "success",
            message: hasNewerChanges ? "Saved; newer changes pending" : "Saved",
          },
        };
      })
    );
    appendOutput(`Saved ${tab.file.relativePath}.`, "success");
    return !hasNewerChanges;
  }, [appendOutput]);

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

  const clearWorkspaceTabs = useCallback(() => {
    requestSequence.current += 1;
    setTabs([]);
    setActivePath(null);
    setSurface({ status: "idle" });
    setExternalChanges(null);
    externalReadSequence.current.clear();
    setWorkspaceOpen(true);
    setWorkspaceVersion((current) => current + 1);
    setRunOutput(null);
    setEditorLocation(null);
    setObserverSnapshot(null);
    setObserverSuggestion(null);
    setObserverError(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setInsertRequest(null);
    setMarkdownViewModes({});
    appendOutput("Workspace opened. Previous terminal and file-run processes were closed.");
  }, [appendOutput]);

  const renameOpenEntries = useCallback((oldRelativePath: string, entry: WorkspaceEntry) => {
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
  }, []);

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
    appendOutput(
      `Workspace updated externally (${batch.changes.length} change${batch.changes.length === 1 ? "" : "s"}).`
    );

    for (const snapshot of tabsRef.current) {
      const deleted = batchDeletesPath(batch, snapshot.file.relativePath);
      if (deleted) {
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
  }), [appendOutput]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (activePath) void saveTab(activePath);
      }
    };
    window.addEventListener("keydown", handleSaveShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleSaveShortcut, { capture: true });
  }, [activePath, saveTab]);

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
      setOutputFocusToken((current) => current + 1);
    });
    return () => {
      unsubscribeOutput();
      unsubscribeComplete();
    };
  }, [appendOutput]);

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

  const askObserver = useCallback(async () => {
    if (!observerRequest || !activeTab || observerRequestInFlight.current || observerSuggestion) return;
    observerRequestInFlight.current = true;
    const requestedPath = activeTab.file.relativePath;
    const summary = observerContextSummary(observerRequest);
    setObserverStatus("thinking");
    setObserverError(null);
    setCopyStatus("idle");
    setObserverRequestPath(requestedPath);
    setSentContextSummary(summary);
    const result = await window.observer.ask(observerRequest);
    observerRequestInFlight.current = false;
    if (!result.ok) {
      setObserverError(result.error);
      setObserverStatus("error");
      appendOutput(`Observer: ${result.error}`, "error");
      return;
    }
    setObserverSuggestion(result.value.suggestion);
    setObserverStatus("ready");
    appendOutput(`Observer returned a ${OBSERVER_MODE_LABELS[observerRequest.mode].toLowerCase()} suggestion.`, "success");
  }, [activeTab, appendOutput, observerRequest, observerSuggestion]);

  const dismissObserver = useCallback(() => {
    const suggestionId = observerSuggestion?.id;
    setObserverSuggestion(null);
    setObserverError(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setCopyStatus("idle");
    setInsertRequest(null);
    if (suggestionId) {
      void window.observer.recordOutcome({ suggestionId, outcome: "dismissed" });
    }
  }, [observerSuggestion]);

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

  const observerCanInsert = canInsertObserverSnippet(
    observerSuggestion,
    observerRequestPath,
    activePath,
    Boolean(
      activeTab &&
      activeTab.availability === "available" &&
      !activeTab.externalConflict &&
      (!activeIsMarkdown || activeMarkdownViewMode !== "preview")
    )
  );

  const insertObserverSnippet = useCallback(() => {
    if (!observerCanInsert || !observerSuggestion?.snippet || !observerRequestPath) return;
    setInsertRequest({
      id: ++insertSequence.current,
      relativePath: observerRequestPath,
      snippet: observerSuggestion.snippet,
    });
  }, [observerCanInsert, observerRequestPath, observerSuggestion]);

  const finishObserverInsert = useCallback((id: number, inserted: boolean) => {
    setInsertRequest((current) => current?.id === id ? null : current);
    if (!inserted) {
      setObserverError("The snippet could not be inserted safely. Return to the requested file and try again.");
      setObserverStatus("error");
      return;
    }
    const suggestionId = observerSuggestion?.id;
    setObserverSuggestion(null);
    setObserverError(null);
    setObserverStatus("idle");
    setObserverRequestPath(null);
    setSentContextSummary(null);
    setCopyStatus("idle");
    appendOutput("Inserted Observer snippet at the cursor. Use Undo to revert it.", "success");
    if (suggestionId) {
      void window.observer.recordOutcome({ suggestionId, outcome: "accepted" });
    }
  }, [appendOutput, observerSuggestion]);

  useEffect(() => {
    const handleObserverShortcut = (event: KeyboardEvent) => {
      if (!isObserverAskShortcut(event)) return;
      event.preventDefault();
      if (observerRequest && observerStatus !== "thinking" && !observerSuggestion) {
        void askObserver();
      }
    };
    window.addEventListener("keydown", handleObserverShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleObserverShortcut, { capture: true });
  }, [askObserver, observerRequest, observerStatus, observerSuggestion]);

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

  const signOut = useCallback(async () => {
    if (!(await canOpenWorkspace())) return;
    setSigningOut(true);
    setAccountError(null);
    const error = await onSignOut();
    if (error) {
      setAccountError(error);
      setSigningOut(false);
    }
  }, [canOpenWorkspace, onSignOut]);

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

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">P</div>
        <h1>Proactive AI IDE</h1>
        <span className="phase-label">Secure workspace</span>
        <details className="user-menu">
          <summary title={user.email}>
            <span className="user-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
            <span>{user.name || user.email}</span>
          </summary>
          <div className="user-menu-popover">
            <strong>{user.name || "Proactive AI user"}</strong>
            <span>{user.email}</span>
            {accountError && <p role="alert">{accountError}</p>}
            <button type="button" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </details>
      </header>

      <div className="ide-layout">
        <aside className="panel explorer-panel">
          <PanelTitle>Explorer</PanelTitle>
          <Explorer
            activeFilePath={activePath}
            onSelectFile={(entry) => void selectFile(entry)}
            onBeforeWorkspaceOpen={canOpenWorkspace}
            onWorkspaceOpened={clearWorkspaceTabs}
            onEntryRenamed={renameOpenEntries}
            onEntryDeleted={deleteOpenEntries}
            getDeleteImpact={getDeleteImpact}
            externalChanges={externalChanges}
            onStatus={appendOutput}
          />
        </aside>

        <main className="panel editor-panel">
          <PanelTitle>Editor</PanelTitle>
          <EditorWorkspace
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
            insertRequest={insertRequest}
            onInsertComplete={finishObserverInsert}
            markdownViewMode={activeMarkdownViewMode}
            onMarkdownViewModeChange={(mode) => {
              if (!activePath) return;
              setMarkdownViewModes((current) => ({ ...current, [activePath]: mode }));
            }}
          />
        </main>

        <aside className="panel observer-panel">
          <PanelTitle>Observer</PanelTitle>
          <ObserverPanel
            mode={activeObserverMode}
            modes={observerModes}
            provider={observerProvider}
            status={observerStatus}
            contextSummary={observerStatus === "idle" ? currentContextSummary : sentContextSummary}
            suggestion={observerSuggestion}
            error={observerError}
            copyStatus={copyStatus}
            canAsk={Boolean(observerRequest) && observerStatus === "idle" && !observerSuggestion}
            canInsert={observerCanInsert}
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
            onInsert={insertObserverSnippet}
            onDismiss={dismissObserver}
          />
        </aside>

        <section className="panel output-panel">
          <BottomPanel
            workspaceOpen={workspaceOpen}
            workspaceVersion={workspaceVersion}
            messages={outputMessages}
            run={runOutput}
            outputFocusToken={outputFocusToken}
            onDiagnosticClick={(diagnostic) => void focusDiagnostic(diagnostic)}
            onStatus={appendOutput}
          />
        </section>
      </div>

      <footer className="status-bar">
        <span>Phase 6</span>
        <span>{hasDirtyTabs ? "Unsaved changes" : `${tabs.length} open file${tabs.length === 1 ? "" : "s"}`}</span>
      </footer>

      {unsavedPrompt && (
        <div className="dialog-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <h2 id="unsaved-dialog-title">{unsavedPrompt.title}</h2>
            <p>{unsavedPrompt.message}</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => answerUnsavedPrompt("cancel")}>Cancel</button>
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
    </div>
  );
}
