export type FileKind = "code" | "doc";

export interface WorkspaceFile {
  id: string;
  name: string;
  /** Raw source for code files, HTML for document files */
  content: string;
  updatedAt: number;
}

const CODE_EXTENSIONS: Record<string, string> = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  json: "json",
  css: "css",
  html: "html",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function kindOf(name: string): FileKind {
  return extensionOf(name) in CODE_EXTENSIONS ? "code" : "doc";
}

export function monacoLanguageOf(name: string): string {
  return CODE_EXTENSIONS[extensionOf(name)] ?? "plaintext";
}
