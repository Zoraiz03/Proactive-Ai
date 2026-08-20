import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { monacoLanguageForFile } from "../../shared/languages";
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
import Explorer from "./Explorer";
import BottomPanel, { type IdeOutputMessage } from "./BottomPanel";

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
  resolve: (choice: UnsavedChoice) => void;
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
  onReloadExternal: (relativePath: string) => void;
  onKeepLocal: (relativePath: string) => void;
}

function EditorWorkspace({
  tabs,
  activePath,
  surface,
  onActivate,
  onClose,
  onChange,
  onSave,
  onReloadExternal,
  onKeepLocal,
}: EditorWorkspaceProps) {
  const activeTab = tabs.find((tab) => tab.file.relativePath === activePath) ?? null;

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
            {activeTab.saveStatus && (
              <span className={`save-status ${activeTab.saveStatus.kind}`} role="status">
                {activeTab.saveStatus.message}
              </span>
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
          <div className="monaco-host">
            <Editor
              path={activeTab.file.relativePath}
              value={activeTab.draft}
              language={monacoLanguageForFile(activeTab.file.name)}
              theme="vs-dark"
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

export default function App() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [surface, setSurface] = useState<EditorSurface>({ status: "idle" });
  const [externalChanges, setExternalChanges] = useState<WorkspaceChangeBatch | null>(null);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPrompt | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [outputMessages, setOutputMessages] = useState<IdeOutputMessage[]>([]);
  const tabsRef = useRef(tabs);
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

    setTabs((current) =>
      current.map((candidate) => {
        if (candidate.file.relativePath !== relativePath) return candidate;
        const hasNewerChanges = candidate.draft !== contentToSave;
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
    return true;
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
    appendOutput("Workspace opened. Previous terminal sessions were closed.");
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
        <span className="phase-label">Workspace terminal</span>
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
            onReloadExternal={reloadExternalVersion}
            onKeepLocal={keepLocalChanges}
          />
        </main>

        <aside className="panel observer-panel">
          <PanelTitle>Observer</PanelTitle>
          <div className="observer-content">
            <div className="observer-orb" aria-hidden="true" />
            <p>AI assistance will be added in a later phase.</p>
            <button type="button" disabled>Ask Observer</button>
          </div>
        </aside>

        <section className="panel output-panel">
          <BottomPanel
            workspaceOpen={workspaceOpen}
            workspaceVersion={workspaceVersion}
            messages={outputMessages}
            onStatus={appendOutput}
          />
        </section>
      </div>

      <footer className="status-bar">
        <span>Phase 4A</span>
        <span>{hasDirtyTabs ? "Unsaved changes" : `${tabs.length} open file${tabs.length === 1 ? "" : "s"}`}</span>
      </footer>

      {unsavedPrompt && (
        <div className="dialog-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <h2 id="unsaved-dialog-title">{unsavedPrompt.title}</h2>
            <p>{unsavedPrompt.message}</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => answerUnsavedPrompt("cancel")}>Cancel</button>
              <button type="button" onClick={() => answerUnsavedPrompt("discard")}>Discard</button>
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
