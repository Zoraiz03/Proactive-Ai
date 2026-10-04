import { OBSERVER_CONTEXT_CHARACTERS } from "./observer-budget.ts";
import type { ObserverRequest, ObserverSuggestion } from './observer.ts';

export const EXPLANATION_LIMITS = {
 questionCharacters: 500, messages: 8, historyCharacters: 24000,
 contextCharacters: OBSERVER_CONTEXT_CHARACTERS, responseCharacters: 20000, outputTokens: 6000, requestTimeoutMs: 120000,
} as const;
export interface ExplanationMessage { role: 'user' | 'assistant'; content: string }
export interface ExplanationInput { question: string; messages: ExplanationMessage[] }
export interface ExplanationResult { suggestion: ObserverSuggestion; messages: ExplanationMessage[]; omitted: number }
export function boundExplanationHistory(messages: ExplanationMessage[], budget: number = EXPLANATION_LIMITS.historyCharacters) {
 const kept = [...messages]; let omitted = 0;
 while (kept.length > EXPLANATION_LIMITS.messages || kept.reduce((sum, m) => sum + m.content.length, 0) > budget) {
  // Remove complete turns so retained history never starts with an orphaned answer.
  kept.splice(0, 2); omitted += 2;
 }
 return { messages: kept, omitted };
}
export function validExplanationInput(value: unknown): value is ExplanationInput {
 if (!value || typeof value !== 'object') return false;
 const input = value as ExplanationInput;
 return typeof input.question === 'string' && input.question.trim().length > 0 && input.question.length <= EXPLANATION_LIMITS.questionCharacters &&
 Array.isArray(input.messages) && input.messages.length <= EXPLANATION_LIMITS.messages && input.messages.length % 2 === 0 &&
 input.messages.every((m, i) => m && m.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= (m.role === 'user' ? EXPLANATION_LIMITS.questionCharacters : EXPLANATION_LIMITS.responseCharacters)) &&
 input.messages.reduce((sum, m) => sum + m.content.length, 0) <= EXPLANATION_LIMITS.historyCharacters;
}
export function explanationScope(request: ObserverRequest) {
 const context = request.contextPackage;
 const code = context?.items.find(i => ['selected_code', 'current_symbol', 'nearby_code'].includes(i.type));
 return `${context?.activeFile.relativePath ?? request.fileName}${code?.source.lineStart ? `:${code.source.lineStart}–${code.source.lineEnd ?? code.source.lineStart}` : ''} · ${code?.type.replaceAll('_', ' ') ?? 'approved excerpt'} · approved snapshot only`;
}
