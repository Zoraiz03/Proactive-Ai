"use client";

import Editor from "@monaco-editor/react";
import { monacoLanguageOf } from "@/lib/files";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
}

export default function CodeEditor({ fileName, value, onChange }: Props) {
  return (
    <Editor
      key={fileName}
      language={monacoLanguageOf(fileName)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
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
