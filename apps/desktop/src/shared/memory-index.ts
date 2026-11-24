import { detectCurrentSymbolInLines } from './project-symbol.ts';

export interface MemoryChunk { index: number; lineStart: number; lineEnd: number; text: string }
export interface MemorySymbol { name: string; kind: 'function'|'class'|'const'|'def'|'interface'|'type'; lineStart: number; lineEnd: number }

/** Deterministic 40-line windows with five overlapping lines. Hashing is main-only. */
export function memoryChunks(content: string): MemoryChunk[] {
  if (!content.length) return [];
  const lines = content.split(/\r?\n/);
  const chunks: MemoryChunk[] = [];
  for (let start = 0; start < lines.length; start += 35) {
    const end = Math.min(lines.length, start + 40);
    chunks.push({ index: chunks.length, lineStart: start + 1, lineEnd: end, text: lines.slice(start, end).join('\n') });
    if (end === lines.length) break;
  }
  return chunks;
}

/** Heuristic declaration outline, reusing the existing bounded symbol detector.
 * Not a language parser: unsupported declarations are intentionally omitted.
 */
export function memorySymbols(content: string, language: string): MemorySymbol[] {
  if (!['typescript', 'javascript', 'python'].includes(language)) return [];
  const lines = content.split(/\r?\n/);
  const symbols: MemorySymbol[] = [];
  let blockComment = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimStart();
    if (blockComment) { if (line.includes('*/')) blockComment = false; continue; }
    if (line.startsWith('/*')) { blockComment = !line.includes('*/'); continue; }
    const match = /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(function|class|const|def|interface|type)\s+([A-Za-z_$][\w$]*)\b/.exec(line);
    if (!match) continue;
    const detected = match[1] === 'const' && !line.includes('=>') ? null : detectCurrentSymbolInLines(lines, index + 1);
    symbols.push({ name: match[2], kind: match[1] as MemorySymbol['kind'], lineStart: index + 1,
      lineEnd: detected?.lineStart === index + 1 ? detected.lineEnd : index + 1 });
  }
  return symbols;
}
