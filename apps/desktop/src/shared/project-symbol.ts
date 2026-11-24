export function detectCurrentSymbol(content: string, cursorLine: number): { content: string; lineStart: number; lineEnd: number; name: string } | null {
  const lines = content.split(/\r?\n/);
  return detectCurrentSymbolInLines(lines, cursorLine);
}

export function detectCurrentSymbolInLines(lines: string[], cursorLine: number): { content: string; lineStart: number; lineEnd: number; name: string } | null {
  const cursor = Math.min(lines.length, Math.max(1, cursorLine));
  const pattern = /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|def)\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/;
  let start = -1; let name = "";
  for (let index = cursor - 1; index >= 0; index -= 1) {
    const match = pattern.exec(lines[index]);
    if (match) { start = index; name = match[1] ?? match[2]; break; }
  }
  if (start < 0) return null;
  let end = Math.min(lines.length, start + 80);
  for (let index = start + 1; index < end; index += 1) {
    if (pattern.test(lines[index]) && /^\S/.test(lines[index])) { end = index; break; }
  }
  return { content: lines.slice(start, end).join("\n"), lineStart: start + 1, lineEnd: end, name };
}
