import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { monacoLanguageForFile } from "../../shared/languages";
import type {
  FileReadErrorCode,
  WorkspaceEntry,
  WorkspaceTextFile,
} from "../../shared/workspace";
import Explorer from "./Explorer";

type SaveStatus = { kind: "success" | "error"; message: string };

type EditorState =
  | { status: "idle" }
  | { status: "loading"; name: string; relativePath: string }
  | {
      status: "ready";
      file: WorkspaceTextFile;
      draft: string;
      saving: boolean;
      saveStatus: SaveStatus | null;
    }
  | {
      status: "error";
      name: string;
      relativePath: string;
      message: string;
      code: FileReadErrorCode;
    };

type UnsavedChoice = "save" | "discard" | "cancel";

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

interface EditorViewProps {
  state: EditorState;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
}

function EditorView({ state, isDirty, onChange, onSave }: EditorViewProps) {
  if (state.status === "idle") {
    return <Placeholder icon="⌘">Select a supported text file to edit it.</Placeholder>;
  }
  if (state.status === "loading") {
    return <Placeholder icon="⋯">Loading {state.name}…</Placeholder>;
  }
  if (state.status === "error") {
    const title = state.code === "unsupported" ? "Unsupported file" : "Unable to open file";
    return (
      <div className="editor-state editor-error" role="alert">
        <span className="editor-state-icon" aria-hidden="true">
          {state.code === "unsupported" ? "⊘" : "!"}
        </span>
        <strong>{title}</strong>
        <span className="editor-state-name">{state.name}</span>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <div className="file-editor">
      <div className="file-viewer-bar">
        <span className="active-file-name" title={state.file.relativePath}>
          {state.file.name}{isDirty && <span className="dirty-mark"> •</span>}
        </span>
        {state.saveStatus && (
          <span className={`save-status ${state.saveStatus.kind}`} role="status">
            {state.saveStatus.message}
          </span>
        )}
        <button
          type="button"
          className="save-button"
          onClick={onSave}
          disabled={!isDirty || state.saving}
          title="Save (Ctrl+S / Cmd+S)"
        >
          {state.saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="monaco-host">
        <Editor
          key={state.file.relativePath}
          value={state.draft}
          language={monacoLanguageForFile(state.file.name)}
          theme="vs-dark"
          onChange={(value) => onChange(value ?? "")}
          loading={<Placeholder icon="⋯">Starting editor…</Placeholder>}
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
  );
}

export default function App() {
  const [editorState, setEditorState] = useState<EditorState>({ status: "idle" });
  const [unsavedPrompt, setUnsavedPrompt] = useState<{
    resolve: (choice: UnsavedChoice) => void;
  } | null>(null);
  const requestSequence = useRef(0);

  const isDirty =
    editorState.status === "ready" && editorState.draft !== editorState.file.content;

  const saveActiveFile = useCallback(async (): Promise<boolean> => {
    if (editorState.status !== "ready") return true;
    if (editorState.draft === editorState.file.content) return true;
    if (editorState.saving) return false;

    const relativePath = editorState.file.relativePath;
    const contentToSave = editorState.draft;
    const expectedModifiedAtMs = editorState.file.modifiedAtMs;
    setEditorState((current) =>
      current.status === "ready" && current.file.relativePath === relativePath
        ? { ...current, saving: true, saveStatus: null }
        : current
    );

    const result = await window.workspace.writeFile({
      relativePath,
      content: contentToSave,
      expectedModifiedAtMs,
    });
    if (!result.ok) {
      setEditorState((current) =>
        current.status === "ready" && current.file.relativePath === relativePath
          ? { ...current, saving: false, saveStatus: { kind: "error", message: result.error } }
          : current
      );
      return false;
    }

    setEditorState((current) => {
      if (current.status !== "ready" || current.file.relativePath !== relativePath) {
        return current;
      }
      const hasNewerChanges = current.draft !== contentToSave;
      return {
        ...current,
        file: {
          ...current.file,
          content: contentToSave,
          modifiedAtMs: result.value.modifiedAtMs,
        },
        saving: false,
        saveStatus: {
          kind: "success",
          message: hasNewerChanges ? "Saved; newer changes pending" : "Saved",
        },
      };
    });
    return true;
  }, [editorState]);

  const askAboutUnsavedChanges = useCallback((): Promise<UnsavedChoice> => {
    if (unsavedPrompt) return Promise.resolve("cancel");
    return new Promise((resolve) => setUnsavedPrompt({ resolve }));
  }, [unsavedPrompt]);

  const canLeaveActiveFile = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    const choice = await askAboutUnsavedChanges();
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    return saveActiveFile();
  }, [askAboutUnsavedChanges, isDirty, saveActiveFile]);

  const loadFile = useCallback(async (entry: WorkspaceEntry) => {
    const requestId = ++requestSequence.current;
    setEditorState({ status: "loading", name: entry.name, relativePath: entry.relativePath });
    const result = await window.workspace.readFile(entry.relativePath);
    if (requestId !== requestSequence.current) return;

    if (result.ok) {
      setEditorState({
        status: "ready",
        file: result.value,
        draft: result.value.content,
        saving: false,
        saveStatus: null,
      });
    } else {
      setEditorState({
        status: "error",
        name: entry.name,
        relativePath: entry.relativePath,
        message: result.error,
        code: result.code,
      });
    }
  }, []);

  const selectFile = useCallback(async (entry: WorkspaceEntry) => {
    if (editorState.status === "ready" && editorState.file.relativePath === entry.relativePath) {
      return;
    }
    if (!(await canLeaveActiveFile())) return;
    await loadFile(entry);
  }, [canLeaveActiveFile, editorState, loadFile]);

  const clearEditor = useCallback(() => {
    requestSequence.current += 1;
    setEditorState({ status: "idle" });
  }, []);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveFile();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleSaveShortcut, { capture: true });
  }, [saveActiveFile]);

  useEffect(() => {
    const preventUnsavedClose = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedClose);
    return () => window.removeEventListener("beforeunload", preventUnsavedClose);
  }, [isDirty]);

  const activeFilePath = editorState.status === "idle"
    ? null
    : editorState.status === "ready"
      ? editorState.file.relativePath
      : editorState.relativePath;

  const updateDraft = (content: string) => {
    setEditorState((current) =>
      current.status === "ready" ? { ...current, draft: content, saveStatus: null } : current
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
        <span className="phase-label">Monaco editor</span>
      </header>

      <div className="ide-layout">
        <aside className="panel explorer-panel">
          <PanelTitle>Explorer</PanelTitle>
          <Explorer
            activeFilePath={activeFilePath}
            onSelectFile={(entry) => void selectFile(entry)}
            onBeforeWorkspaceOpen={canLeaveActiveFile}
            onWorkspaceOpened={clearEditor}
          />
        </aside>

        <main className="panel editor-panel">
          <PanelTitle>Editor</PanelTitle>
          <EditorView
            state={editorState}
            isDirty={isDirty}
            onChange={updateDraft}
            onSave={() => void saveActiveFile()}
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
          <PanelTitle>Output</PanelTitle>
          <div className="output-line">
            <span aria-hidden="true">›</span> Output and diagnostics will appear here.
          </div>
        </section>
      </div>

      <footer className="status-bar">
        <span>Phase 2C</span>
        <span>{isDirty ? "Unsaved changes" : "Secure Monaco editor"}</span>
      </footer>

      {unsavedPrompt && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-dialog-title"
          >
            <h2 id="unsaved-dialog-title">Save your changes?</h2>
            <p>
              {editorState.status === "ready" ? editorState.file.name : "This file"} has
              unsaved changes.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => answerUnsavedPrompt("cancel")}>Cancel</button>
              <button type="button" onClick={() => answerUnsavedPrompt("discard")}>Discard</button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => answerUnsavedPrompt("save")}
              >
                Save
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
