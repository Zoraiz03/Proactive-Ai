"use client";

import Editor, { OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor as MonacoEditor, Uri } from "monaco-editor";
import { monacoLanguageOf } from "@/lib/files";
import type { StuckDetectionConfig } from "@/lib/stuck-config";
import {
  StuckDetectorEngine,
  StuckMetadata,
} from "@/lib/stuck-detectors";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  detectionConfig: StuckDetectionConfig;
  onStuck: (metadata: StuckMetadata) => void;
}

export default function CodeEditor({
  fileName,
  value,
  onChange,
  detectionConfig,
  onStuck,
}: Props) {
  const engineRef = useRef(new StuckDetectorEngine(detectionConfig));
  const onStuckRef = useRef(onStuck);
  const disposablesRef = useRef<Array<{ dispose: () => void }>>([]);

  useEffect(() => {
    engineRef.current = new StuckDetectorEngine(detectionConfig);
  }, [detectionConfig]);
  useEffect(() => {
    onStuckRef.current = onStuck;
  }, [onStuck]);
  useEffect(
    () => () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
    },
    []
  );

  const handleMount: OnMount = (editor, monaco) => {
    disposablesRef.current.forEach((disposable) => disposable.dispose());
    engineRef.current = new StuckDetectorEngine(detectionConfig);
    const model = editor.getModel();
    if (!model) return;

    const emit = (metadata: StuckMetadata | null) => {
      if (metadata) onStuckRef.current(metadata);
    };
    const observeMarkers = () => {
      const markers = monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter(
          (marker: MonacoEditor.IMarker) =>
            marker.severity === monaco.MarkerSeverity.Error
        )
        .map((marker: MonacoEditor.IMarker) => ({
          message: marker.message,
          startLine: marker.startLineNumber,
          endLine: marker.endLineNumber,
          severity: marker.severity,
        }));
      emit(engineRef.current.recordMarkers(markers, Date.now()));
    };

    disposablesRef.current = [
      editor.onDidChangeModelContent((event) => {
        for (const change of event.changes) {
          emit(
            engineRef.current.recordEdit({
              startLine: change.range.startLineNumber,
              endLine: Math.max(
                change.range.endLineNumber,
                change.range.startLineNumber + change.text.split("\n").length - 1
              ),
              removedTextLength: change.rangeLength,
              insertedText: change.text,
              timestamp: Date.now(),
            })
          );
        }
      }),
      editor.onDidChangeCursorPosition((event) => {
        emit(
          engineRef.current.recordCursor(event.position.lineNumber, Date.now())
        );
      }),
      monaco.editor.onDidChangeMarkers((resources: readonly Uri[]) => {
        if (
          resources.some(
            (resource: Uri) => resource.toString() === model.uri.toString()
          )
        ) {
          observeMarkers();
        }
      }),
    ];
    observeMarkers();
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
