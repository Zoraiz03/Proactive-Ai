import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunDiagnostic, RunLanguage } from "../shared/runner";

function relativeWorkspacePath(rootPath: string, rawPath: string): string | null {
  let candidate = rawPath.trim();
  try {
    if (candidate.startsWith("file://")) candidate = fileURLToPath(candidate);
  } catch {
    return null;
  }
  if (!isAbsolute(candidate)) return null;
  const difference = relative(rootPath, candidate);
  if (
    difference === "" ||
    difference === ".." ||
    difference.startsWith(`..${sep}`) ||
    isAbsolute(difference)
  ) return null;
  return difference.split(sep).join("/");
}

function errorMessage(output: string, language: RunLanguage): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matching = [...lines].reverse().find((line) =>
    language === "python"
      ? /^[A-Za-z_][\w.]*?(?:Error|Exception):/.test(line)
      : /(?:SyntaxError|TypeError|ReferenceError|RangeError|Error):/.test(line)
  );
  return matching ?? (language === "python" ? "Python execution error" : "JavaScript execution error");
}

export function parseRunDiagnostics(
  rootPath: string,
  language: RunLanguage,
  stderr: string
): RunDiagnostic[] {
  const diagnostics: RunDiagnostic[] = [];
  const seen = new Set<string>();
  const message = errorMessage(stderr, language);
  const patterns = language === "python"
    ? [/File "([^"]+)", line (\d+)/g]
    : [/(file:\/\/[^\s():]+|(?:[A-Za-z]:)?[/\\][^\r\n()]+?\.(?:js|mjs)):(\d+)(?::(\d+))?/g];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(stderr)) !== null) {
      const relativePath = relativeWorkspacePath(rootPath, match[1]);
      const line = Number(match[2]);
      const column = Number(match[3] ?? 1);
      if (!relativePath || !Number.isSafeInteger(line) || line < 1) continue;
      const key = `${relativePath}:${line}:${column}:${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diagnostics.push({ relativePath, line, column, message, source: language });
    }
  }
  return diagnostics.slice(0, 100);
}
