"use client";

import Editor, { OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { monacoLanguageOf } from "@/lib/files";
import type { EditorRequestContext } from "@/lib/manual-suggestion";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  onContextChange: (context: EditorRequestContext) => void;
}

export default function CodeEditor({
  fileName,
  value,
  onChange,
  onContextChange,
}: Props) {
  const onContextChangeRef = useRef(onContextChange);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  useEffect(() => {
    onContextChangeRef.current = onContextChange;
  }, [onContextChange]);
  useEffect(
    () => () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
    },
    []
  );

  const handleMount: OnMount = (editor) => {
    disposablesRef.current.forEach((disposable) => disposable.dispose());
    const model = editor.getModel();
    if (!model) return;

    const emitContext = () => {
      const selection = editor.getSelection();
      const cursorLine = editor.getPosition()?.lineNumber ?? 1;
      const startLine = Math.max(1, cursorLine - 3);
      const endLine = Math.min(model.getLineCount(), cursorLine + 3);
      const selectedText =
        selection && !selection.isEmpty()
          ? model.getValueInRange(selection)
          : undefined;
      onContextChangeRef.current({
        selectedText,
        cursorLine,
        nearbyContent: model.getValueInRange({
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: model.getLineMaxColumn(endLine),
        }),
      });
    };

    disposablesRef.current = [
      editor.onDidChangeModelContent(emitContext),
      editor.onDidChangeCursorSelection(emitContext),
    ];
    emitContext();
  };

  return (
    <Editor
      key={fileName}
      language={monacoLanguageOf(fileName)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      theme="vs"
      options={{
        fontSize: 14,
        fontFamily: "var(--font-geist-mono), Menlo, monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        automaticLayout: true,
        wordWrap: "on",
        renderLineHighlight: "gutter",
      }}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-tan">
          Loading editor…
        </div>
      }
    />
  );
}
