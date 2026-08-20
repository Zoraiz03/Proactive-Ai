import { useRef, useState } from "react";
import type {
  FileReadErrorCode,
  WorkspaceEntry,
  WorkspaceTextFile,
} from "../../shared/workspace";
import Explorer from "./Explorer";

type EditorState =
  | { status: "idle" }
  | { status: "loading"; name: string; relativePath: string }
  | { status: "ready"; file: WorkspaceTextFile }
  | {
      status: "error";
      name: string;
      relativePath: string;
      message: string;
      code: FileReadErrorCode;
    };

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="panel-title">{children}</h2>;
}

function Placeholder({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="placeholder">
      <span className="placeholder-icon" aria-hidden="true">
        {icon}
      </span>
      <p>{children}</p>
    </div>
  );
}

function EditorViewer({ state }: { state: EditorState }) {
  if (state.status === "idle") {
    return <Placeholder icon="⌘">Select a supported text file to view it.</Placeholder>;
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
    <div className="file-viewer">
      <div className="file-viewer-bar">
        <span title={state.file.relativePath}>{state.file.name}</span>
        <span className="read-only-badge">Read only</span>
      </div>
      {state.file.content.length === 0 ? (
        <div className="editor-state">
          <span className="editor-state-icon" aria-hidden="true">
            ∅
          </span>
          <strong>Empty file</strong>
          <p>This file does not contain any text yet.</p>
        </div>
      ) : (
        <pre className="code-viewer" tabIndex={0}>
          <code>{state.file.content}</code>
        </pre>
      )}
    </div>
  );
}

export default function App() {
  const [editorState, setEditorState] = useState<EditorState>({ status: "idle" });
  const requestSequence = useRef(0);

  const selectFile = async (entry: WorkspaceEntry) => {
    const requestId = ++requestSequence.current;
    setEditorState({
      status: "loading",
      name: entry.name,
      relativePath: entry.relativePath,
    });
    const result = await window.workspace.readFile(entry.relativePath);
    if (requestId !== requestSequence.current) return;

    if (result.ok) {
      setEditorState({ status: "ready", file: result.value });
    } else {
      setEditorState({
        status: "error",
        name: entry.name,
        relativePath: entry.relativePath,
        message: result.error,
        code: result.code,
      });
    }
  };

  const clearEditor = () => {
    requestSequence.current += 1;
    setEditorState({ status: "idle" });
  };

  const activeFilePath =
    editorState.status === "idle"
      ? null
      : editorState.status === "ready"
        ? editorState.file.relativePath
        : editorState.relativePath;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">
          P
        </div>
        <h1>Proactive AI IDE</h1>
        <span className="phase-label">File viewer</span>
      </header>

      <div className="ide-layout">
        <aside className="panel explorer-panel">
          <PanelTitle>Explorer</PanelTitle>
          <Explorer
            activeFilePath={activeFilePath}
            onSelectFile={(entry) => void selectFile(entry)}
            onWorkspaceOpened={clearEditor}
          />
        </aside>

        <main className="panel editor-panel">
          <PanelTitle>Editor</PanelTitle>
          <EditorViewer state={editorState} />
        </main>

        <aside className="panel observer-panel">
          <PanelTitle>Observer</PanelTitle>
          <div className="observer-content">
            <div className="observer-orb" aria-hidden="true" />
            <p>AI assistance will be added in a later phase.</p>
            <button type="button" disabled>
              Ask Observer
            </button>
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
        <span>Phase 2B</span>
        <span>Secure read-only viewer</span>
      </footer>
    </div>
  );
}
