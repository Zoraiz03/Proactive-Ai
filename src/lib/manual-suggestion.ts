export interface EditorRequestContext {
  selectedText?: string;
  cursorLine?: number;
  nearbyContent?: string;
  mode?:
    | "explain"
    | "fix_error"
    | "improve_code"
    | "continue_code"
    | "generate_tests"
    | "explain_document"
    | "improve_writing"
    | "summarize"
    | "generate_readme_section";
  language?: string;
  source?: "selection" | "cursor" | "diagnostic";
  client?: "web" | "desktop";
  diagnostic?: {
    fileName: string;
    line: number;
    column: number;
    message: string;
  };
  runError?: string;
  activeFileIncluded?: boolean;
}

export interface ManualSuggestionRequest {
  fileName: string;
  kind: "code" | "doc";
  content: string;
  context: EditorRequestContext;
}

export function hasMeaningfulContent(
  kind: "code" | "doc",
  content: string
): boolean {
  if (kind === "code") return content.trim().length > 0;
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim().length > 0;
}

export function createManualSuggestionRequest(
  fileName: string,
  kind: "code" | "doc",
  content: string,
  editorContext: EditorRequestContext
): ManualSuggestionRequest {
  const selectedText = editorContext.selectedText?.trim()
    ? editorContext.selectedText
    : undefined;
  const context: EditorRequestContext = selectedText
    ? { selectedText }
    : kind === "code"
      ? {
          cursorLine: editorContext.cursorLine,
          nearbyContent: editorContext.nearbyContent,
        }
      : {};

  return { fileName, kind, content, context };
}
