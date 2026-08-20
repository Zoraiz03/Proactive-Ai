const MONACO_LANGUAGES: Readonly<Record<string, string>> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".html": "html",
  ".css": "css",
  ".json": "json",
  ".md": "markdown",
  ".txt": "plaintext",
  ".yml": "yaml",
  ".yaml": "yaml",
};

export function monacoLanguageForFile(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  return MONACO_LANGUAGES[extension] ?? "plaintext";
}
