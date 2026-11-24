import { FIX_CODE_LIMITS, validFixContext } from './fix-code.ts';
import { parseStructuredObserverEdit } from './ai-edit.ts';
import type { FixCodeContext } from './fix-code.ts';
import type { ObserverRequest, ObserverSuggestion } from './observer.ts';
export const IMPROVE_CODE_LIMITS = { ...FIX_CODE_LIMITS };
export type ImprovementGoal = 'readability' | 'performance';
export interface ImproveCodeContext extends Omit<FixCodeContext, 'scope'> {
  scope: 'selection' | 'function' | 'file';
  goal: ImprovementGoal;
}
export type ImproveOutcome = 'improvement' | 'clarification' | 'no_change' | 'correctness_issue';
export function validImproveContext(value: unknown): value is ImproveCodeContext {
  if (!value || typeof value !== 'object') return false;
  const v = value as ImproveCodeContext;
  return ['readability','performance'].includes(v.goal) && ['selection','function','file'].includes(v.scope) && validFixContext({...v,scope:v.scope==='file'?'file':'selection'});
}
export function validImproveSuggestion(value: ObserverSuggestion): boolean {
  return ['improvement','clarification','no_change','correctness_issue'].includes(value.improveOutcome ?? '') &&
    typeof value.explanation === 'string' && Boolean(value.explanation.trim()) && value.explanation.length <= IMPROVE_CODE_LIMITS.responseCharacters && value.snippet === '' &&
    typeof value.tradeoffs === 'string' && Boolean(value.tradeoffs.trim()) && value.tradeoffs.length <= 4000 &&
    typeof value.verification === 'string' && Boolean(value.verification.trim()) && value.verification.length <= 4000 &&
    (value.improveOutcome === 'improvement' ? Boolean(parseStructuredObserverEdit(value.edit)) : !value.edit) &&
    (value.improveOutcome === 'clarification' ? typeof value.clarificationQuestion === 'string' && Boolean(value.clarificationQuestion.trim()) && value.clarificationQuestion.length <= IMPROVE_CODE_LIMITS.question : !value.clarificationQuestion) && !value.fixOutcome;
}
export function improveScopeLabel(request: ObserverRequest) {
  const c=request.improveCode;
  return `${request.contextPackage?.activeFile.relativePath ?? request.fileName} · ${c?.scope ?? 'approved'} ${c?.range.start.line}:${c?.range.start.column}–${c?.range.end.line}:${c?.range.end.column} · ${c?.goal==='performance'?'Performance':'Readability & maintainability'} · approved unsaved-buffer snapshot; surrounding code is read-only`;
}
