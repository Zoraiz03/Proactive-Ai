import type { ContextManifest } from './observer-engine.ts';
import { redactContextSecrets } from './context-tray.ts';

export type SuggestionOutcome = 'shown'|'accepted'|'dismissed'|'ignored'|'failed';
export interface MemorySuggestion {
  workspaceId: string; id: string; path: string; kind: 'continuation'|'correction'|'next_step'|'create_file'|'doc_sync';
  triggerReason: 'pause'|'manual'; manifest: ContextManifest;
  explanation: string; reason: string; proposedText?: string;
}
export interface FeedbackEntry { id: string; outcome: SuggestionOutcome; ts: number; explanation: string; style: string }
export function acceptedStyle(text: string): string {
  const indents = text.split('\n').map(line=>/^(\s+)\S/.exec(line)?.[1]).filter((value): value is string=>!!value);
  const indent = indents.some(value=>value.includes('\t')) ? 'tabs' : indents.length ? `${Math.min(...indents.map(value=>value.length))}-space indentation` : '';
  const single = (text.match(/'[^'\n]*'/g) ?? []).length, double = (text.match(/"[^"\n]*"/g) ?? []).length;
  return [indent,single>double?'single quotes':double>single?'double quotes':''].filter(Boolean).join('; ');
}
export function feedbackText(entries: readonly FeedbackEntry[]): string {
  const safe = [...entries].filter(entry=>!redactContextSecrets(entry.explanation+'\n'+entry.style).redacted).sort((a,b)=>b.ts-a.ts);
  const dismissed = safe.filter(entry=>entry.outcome==='dismissed').slice(0,5);
  const accepted = safe.find(entry=>entry.outcome==='accepted' && entry.style);
  return [...dismissed.map(entry=>`Previously dismissed: ${entry.explanation.slice(0,80)}`),...(accepted?[`Last accepted edit style: ${accepted.style.slice(0,100)}`]:[])].join('\n').slice(0,600);
}
const exact = (value: unknown, required: string[], optional: string[] = []): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value) && required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
export function validManifest(value: unknown): value is ContextManifest {
  if (!exact(value,['totalChars','estTokens','blocks','omitted']) || !Number.isInteger(value.totalChars) || Number(value.totalChars)<0 || Number(value.totalChars)>24000 ||
    value.estTokens!==Math.ceil(Number(value.totalChars)/4) || !Array.isArray(value.blocks) || value.blocks.length>24 || !Array.isArray(value.omitted) || value.omitted.length>200) return false;
  let total = 0;
  for (const block of value.blocks) {
    if (!exact(block,['id','type','source','chars','hash','redacted','truncated'],['lineStart','lineEnd']) || !/^[A-J]$/.test(String(block.id)) ||
      typeof block.type!=='string' || block.type.length>64 || typeof block.source!=='string' || block.source.length>4096 ||
      !Number.isInteger(block.chars) || Number(block.chars)<1 || typeof block.hash!=='string' || !/^[a-f0-9]{64}$/.test(block.hash) ||
      typeof block.redacted!=='boolean' || typeof block.truncated!=='boolean') return false;
    if (block.lineStart!==undefined && (!Number.isInteger(block.lineStart) || Number(block.lineStart)<1 || !Number.isInteger(block.lineEnd) || Number(block.lineEnd)<Number(block.lineStart))) return false;
    total+=Number(block.chars);
  }
  return total===value.totalChars && value.omitted.every(item=>exact(item,['id','reason']) && /^[A-J]$/.test(String(item.id)) && ['budget','excluded','secret','stale','none_found'].includes(String(item.reason))) && !redactContextSecrets(JSON.stringify(value)).redacted;
}
