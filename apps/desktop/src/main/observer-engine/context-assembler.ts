import { detectCurrentSymbol, RULE_FILES, importSpecifiers, candidatePathsForImport, testNameCandidates } from '../project-context.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';
import { finalizeContext, type ContextSeed, type ContextBlock, type ChunkHit, type WebHit, type EditBurst } from '../../shared/engine-context.ts';
import type { ContextManifest } from '../../shared/observer-engine.ts';

export interface ContextSource {
  workspaceId: string;
  read(path: string): { text: string | null; reason?: 'excluded'|'secret'|'stale'|'none_found' };
  screen(path: string, text: string): boolean;
  outline(path: string): string;
  brief(): string | null;
  chunks(terms: string[], excludePath: string): ChunkHit[];
  web(terms: string[]): WebHit[];
  edits(path: string): EditBurst[];
  feedback(path: string): string;
}
export function assembleContext(seed: ContextSeed, source: ContextSource) {
  if (seed.workspaceId !== source.workspaceId || !Number.isInteger(seed.cursorLine) || seed.cursorLine < 1 ||
    !Number.isInteger(seed.cursorColumn) || seed.cursorColumn < 1 || !source.screen(seed.path, seed.content)) throw new Error('engine_context_denied');
  const blocks: ContextBlock[] = [], omitted: ContextManifest['omitted'] = [];
  const add = (id: ContextBlock['id'], type: string, path: string, content: string, extra: Partial<ContextBlock> = {}) => {
    if (content) blocks.push({ id, type, source: path, content, ...extra });
    else omitted.push({ id, reason: 'none_found' });
  };
  const lines = seed.content.split('\n'), cursor = Math.min(seed.cursorLine, lines.length), start = Math.max(0, cursor - 26), end = Math.min(lines.length, cursor + 25);
  const window = lines.slice(start, end); const index = cursor - 1 - start, column = Math.min(seed.cursorColumn - 1, window[index].length);
  window[index] = window[index].slice(0,column) + '<<CURSOR>>' + window[index].slice(column);
  add('A','nearby_code',seed.path,window.join('\n'),{ lineStart: start + 1, lineEnd: end });
  const symbol = detectCurrentSymbol(seed.content, cursor);
  add('B','current_symbol',seed.path,symbol?.content ?? '',symbol ? { lineStart: symbol.lineStart, lineEnd: symbol.lineEnd } : {});
  add('C','file_outline',seed.path,source.outline(seed.path));
  add('D','edit_trail',seed.path,source.edits(seed.path).slice(-6).map(burst => `added lines ${burst.addedLines.join('-')}; +${burst.addedChars} chars, -${burst.removedChars} chars: ${burst.preview}`).join('\n'));
  const brief = source.brief();
  const imports = importSpecifiers(seed.content);
  const terms = retrievalTerms([lines.slice(Math.max(0,cursor-16),cursor+15).join('\n'), ...imports, seed.path.split('/').at(-1) ?? '', brief ?? '', seed.diagnostics?.at(-1)?.message ?? '']);
  const related = new Set<string>();
  const offer = (path: string, score: number) => {
    if (path === seed.path || related.has(path) || related.size >= 4) return false;
    const file = source.read(path);
    if (file.text === null) { if (file.reason !== 'none_found') omitted.push({ id: 'E', reason: file.reason ?? 'none_found' }); return false; }
    related.add(path); add('E','related_file',path,file.text,{ score, lineStart: 1, lineEnd: file.text.split('\n').length }); return true;
  };
  for (const specifier of imports) for (const path of candidatePathsForImport(seed.path,specifier)) if (offer(path,100)) break;
  for (const path of testNameCandidates(seed.path)) if (offer(path,90)) break;
  for (const hit of source.chunks(terms, seed.path)) {
    if (related.size >= 4 || related.has(hit.path)) continue;
    related.add(hit.path); add('E','related_file',hit.path,hit.text,{ score: hit.score, lineStart: hit.lineStart, lineEnd: hit.lineEnd });
  }
  if (!related.size) omitted.push({ id: 'E', reason: 'none_found' });
  add('F','project_brief','.proactive/project.json',brief ?? '');
  let rules = 0;
  for (const path of RULE_FILES) {
    const file = source.read(path);
    if (file.text !== null) { add('G','project_rule',path,file.text.slice(0,Math.max(0,1000-rules)),{ truncated: file.text.length > 1000-rules }); rules += Math.min(file.text.length,1000-rules); }
    else omitted.push({ id: 'G', reason: file.reason ?? 'none_found' });
  }
  const diagnostics = [...(seed.diagnostics ?? [])].filter(d => Math.abs(d.line-cursor)<=25).sort((a,b)=>Math.abs(a.line-cursor)-Math.abs(b.line-cursor)).slice(0,3);
  add('H','diagnostic',seed.path,diagnostics.map(d=>`line ${d.line}: ${d.message}`).join('\n'));
  const web = source.web(terms).slice(0,3);
  for (const hit of web) add('I','web_research',hit.hostname,`${hit.title}\n${hit.hostname}\n${hit.text}`,{ score: hit.score, webCaptureId: hit.id });
  if (!web.length) omitted.push({ id: 'I', reason: 'none_found' });
  add('J','feedback_memory',seed.path,source.feedback(seed.path));
  return finalizeContext(seed.workspaceId, blocks, seed.maximumCharacters, omitted);
}
const STOP = new Set(['the','and','for','with','from','this','that','return','const','let','var','function','class','import','export','true','false','null','undefined']);
export function retrievalTerms(values: readonly string[]): string[] {
  return [...new Set(values.flatMap(value => redactContextSecrets(value).redacted ? [] : value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []))].filter(term=>!STOP.has(term)).slice(0,24);
}
