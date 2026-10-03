import type { ContextManifest } from './observer-engine.ts';
import { redactContextSecrets } from './context-tray.ts';
import { projectContextCost } from './project-context.ts';
import { journalHash } from './edit-journal.ts';

export type BlockId = ContextManifest['blocks'][number]['id'];
export interface ContextBlock {
  id: BlockId; type: string; source: string; content: string;
  lineStart?: number; lineEnd?: number; score?: number; webCaptureId?: string;
  cursorOffset?: number;
  redacted?: boolean; truncated?: boolean;
}
export interface AssembledContext {
  workspaceId: string;
  request: { items: ContextBlock[]; totalCharacters: number; estimatedTokens: number };
  manifest: ContextManifest;
}
export interface ContextSeed {
  workspaceId: string; path: string; content: string; cursorLine: number; cursorColumn: number;
  maximumCharacters?: number;
  diagnostics?: { line: number; message: string }[];
}
export interface EditBurst {
  path: string; startTs: number; endTs: number; addedLines: [number, number];
  removedChars: number; addedChars: number; preview: string;
}
export interface ChunkHit { path: string; text: string; lineStart: number; lineEnd: number; score: number }
export interface WebHit { id: string; text: string; title: string; hostname: string; url: string; capturedAt: number; pinned: boolean; score: number }
export const BLOCK_CAPS: Record<BlockId, number> = { A: 3000, B: 2500, C: 600, D: 1800, E: 1200, F: 1200, G: 1000, H: 900, I: 1200, J: 600 };
const DROP: BlockId[] = ['J','C','G','I','E','D','F','B','H'];
export function aroundCursor(text: string, cap: number, marker = text.indexOf('<<CURSOR>>')): string {
  if (text.length <= cap) return text;
  const center = marker < 0 ? 0 : marker + 5;
  const start = Math.max(0, Math.min(text.length - cap, center - Math.floor(cap / 2)));
  return text.slice(start, start + cap);
}
/** Manifest is derived from the final request, after screening and budget removal. */
export function finalizeContext(workspaceId: string, candidates: ContextBlock[], maximum = 16000,
  omitted: ContextManifest['omitted'] = []): AssembledContext {
  const cap = Number.isFinite(maximum) ? Math.max(64, Math.min(24000, Math.floor(maximum))) : 16000;
  const omissions = [...omitted];
  let items = candidates.flatMap(block => {
    if (redactContextSecrets(block.content).redacted || redactContextSecrets(block.source).redacted) {
      omissions.push({ id: block.id, reason: 'secret' }); return [];
    }
    if (!block.content) return [];
    const limit = BLOCK_CAPS[block.id];
    const marker=block.cursorOffset ?? block.content.indexOf('<<CURSOR>>');
    const content = block.id === 'A' ? aroundCursor(block.content, Math.min(cap, limit),marker) : block.content.slice(0, limit);
    const startOffset = block.id==='A' && content.length<block.content.length ? Math.max(0,Math.min(block.content.length-content.length,marker+5-Math.floor(content.length/2))) : 0;
    const lineStart = block.lineStart===undefined ? undefined : block.lineStart + (block.content.slice(0,startOffset).match(/\n/g)?.length ?? 0);
    const range = lineStart===undefined ? {} : {lineStart,lineEnd:lineStart+(content.match(/\n/g)?.length ?? 0)};
    return [{ ...block, ...range, content, redacted: block.redacted ?? false, truncated: !!block.truncated || content.length < block.content.length }];
  });
  if (!items.some(block => block.id === 'A')) throw new Error('engine_context_active_unavailable');
  const total = () => items.reduce((sum, item) => sum + item.content.length, 0);
  for (const id of DROP) {
    while (total() > cap) {
      const matches = items.filter(item => item.id === id).sort((a,b) => (a.score ?? 0) - (b.score ?? 0));
      if (!matches.length) break;
      items = items.filter(item => item !== matches[0]); omissions.push({ id, reason: 'budget' });
    }
  }
  items.sort((a,b) => a.id.localeCompare(b.id) || (b.score ?? 0) - (a.score ?? 0));
  const {estimatedCharacters:totalCharacters,estimatedTokens}=projectContextCost(items.map(item=>item.content).join(''));
  return { workspaceId, request: { items, totalCharacters, estimatedTokens }, manifest: {
    totalChars: totalCharacters, estTokens: estimatedTokens,
    blocks: items.map(item => ({ id: item.id, type: item.type, source: item.source,
      ...(item.lineStart === undefined ? {} : { lineStart: item.lineStart, lineEnd: item.lineEnd }),
      chars: item.content.length, hash: journalHash(item.content), redacted: item.redacted, truncated: item.truncated })), omitted: omissions,
  } };
}
const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** Context remains data, including rules and web text; never becomes system instructions. */
export function formatEngineContext(context: AssembledContext): string {
  return context.request.items.map(item => `<untrusted-context type="${escape(item.type)}" source="${escape(item.source)}">\n${escape(item.content)}\n</untrusted-context>`).join('\n');
}
