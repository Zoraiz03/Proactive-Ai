import { DiffEditor } from "@monaco-editor/react";
import type { GitDiffSnapshot } from "../../shared/git";
import type { LocalSettings } from "../../shared/settings";
import { monacoLanguageForFile } from "../../shared/languages";
import { monacoOptionsFromSettings } from "../../shared/settings";

interface Props {
  diff: GitDiffSnapshot;
  editorSettings: LocalSettings["editor"];
  theme: string;
  onClose: () => void;
  onOpenFile: () => void;
}

export default function GitDiffViewer({ diff, editorSettings, theme, onClose, onOpenFile }: Props) {
  const canOpenFile = diff.changeKind !== "deleted" && diff.state === "text";
  return <div className="git-diff-viewer">
    <div className="git-diff-toolbar">
      <button type="button" onClick={onClose}>← Back to Editor</button>
      <div><strong>{diff.relativePath}</strong><span className={`git-diff-kind ${diff.changeKind}`}>{diff.changeKind}</span></div>
      <button type="button" onClick={onOpenFile} disabled={!canOpenFile}>Open File</button>
    </div>
    {diff.originalPath && <div className="git-rename-note">Renamed from {diff.originalPath}</div>}
    {diff.state === "text" ? <>
      <div className="git-diff-labels"><span>Git base / original</span><span>Current workspace</span></div>
      {diff.changeKind === "deleted" && <div className="git-deleted-note">Deleted from the current workspace.</div>}
      <DiffEditor
        original={diff.originalContent}
        modified={diff.currentContent}
        language={monacoLanguageForFile(diff.relativePath)}
        theme={theme}
        originalModelPath={`git-original:///${encodeURIComponent(diff.originalPath ?? diff.relativePath)}`}
        modifiedModelPath={`git-current:///${encodeURIComponent(diff.relativePath)}`}
        options={{
          ...monacoOptionsFromSettings(editorSettings),
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          renderOverviewRuler: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </> : <div className={`git-diff-unavailable ${diff.state}`}><span aria-hidden="true">◇</span><strong>{diff.state === "binary" ? "Binary file" : diff.state === "too_large" ? "Diff too large" : "Diff unavailable"}</strong><p>{diff.message}</p></div>}
  </div>;
}
