import { explanationBudget, initialExplanationInput } from '../shared/explanation-budget.ts';
import { boundExplanationHistory, EXPLANATION_LIMITS, type ExplanationMessage, type ExplanationResult } from '../shared/explanation.ts';
import { containsLikelySecret, type ObserverRequest, type ObserverAskResult } from '../shared/observer.ts';
import { redactContextSecrets } from '../shared/context-tray.ts';
import { isExcludedFromAiContext } from '../shared/settings.ts';
import type { IpcResult } from '../shared/workspace.ts';

export interface ExplanationPolicy { enabled: boolean; exclusions: string[]; maximumCharacters: number; maximumFileCharacters: number; explainMaximumCodeCharacters?: number; confirmCompleteFile: boolean }
export class ExplanationSession {
 private generation = 0;
 private abort: AbortController | null = null;
 private session: { id: string; request: ObserverRequest; messages: ExplanationMessage[]; omitted: number; completeConsent: boolean } | null = null;
 private deps: {
  policy: () => Promise<ExplanationPolicy>;
  confirm: () => Promise<boolean>;
  ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>>;
 };
 constructor(deps: ExplanationSession["deps"]) { this.deps = deps; }
 cancel() { this.generation++; this.abort?.abort(); this.abort = null; }
 clear() { this.cancel(); this.session = null; }
 async start(id: string, request: ObserverRequest): Promise<IpcResult<ExplanationResult>> {
  if (this.abort) return { ok: false, error: 'An explanation is already in progress.' };
  if (!/^[\w-]{1,100}$/.test(id) || request.mode !== 'explain' || request.kind !== 'code' || !request.contextPackage || request.editBase || request.liveObserver || request.automaticRun) return { ok: false, error: 'Explain requires a reviewed code context.' };
  this.clear();
  this.session = { id, request: { ...request, storeHistory: false }, messages: [], omitted: 0, completeConsent: false };
  return this.send(id, initialExplanationInput(request.contextPackage).question, true);
 }
 async send(id: string, question: string, initial = false): Promise<IpcResult<ExplanationResult>> {
  const session = this.session;
  if (!session || session.id !== id) return { ok: false, error: 'Conversation expired. Start a new explanation through Context Preview.' };
  if (this.abort) return { ok: false, error: 'An explanation is already in progress.' };
  if (typeof question !== 'string' || !question.trim() || question.length > EXPLANATION_LIMITS.questionCharacters || containsLikelySecret(question) || redactContextSecrets(question).redacted) return { ok: false, error: 'Use a question of 1–500 characters without secrets.' };
  const token = ++this.generation;
  const abort = new AbortController(); this.abort = abort;
  const current = () => token === this.generation && this.session === session;
  try {
   const policy = await this.deps.policy();
   if (!current()) throw new Error('Explanation cancelled.');
   const context = session.request.contextPackage!;
   if (!policy.enabled) throw new Error('Observer is disabled in Privacy settings.');
   if (context.items.some(item => !['user_instruction', 'selected_code', 'current_symbol', 'nearby_code', 'complete_file'].includes(item.type) || (item.source.relativePath && item.source.relativePath !== context.activeFile.relativePath))) throw new Error('Explain uses only the approved active-file excerpt. Build a fresh preview.');
   if (context.items.some(item => (item.source.relativePath && isExcludedFromAiContext(item.source.relativePath, policy.exclusions)) || redactContextSecrets(item.content).redacted)) throw new Error('Approved context is excluded or contains suspected secrets. Review a new context.');
   const effectiveContext = {...context, limits:{...context.limits,
    maximumTotalCharacters:Math.min(context.limits.maximumTotalCharacters,policy.maximumCharacters),
    maximumCharactersPerFile:Math.min(context.limits.maximumCharactersPerFile,policy.explainMaximumCodeCharacters ?? policy.maximumFileCharacters),
   }};
   const baseBudget=explanationBudget(effectiveContext,{question:question.trim(),messages:[]},session.request.provider,session.request.model);
   if(baseBudget.error)throw new Error(baseBudget.error);
   if (policy.confirmCompleteFile && context.containsCompleteFile && !session.completeConsent) {
    if (!initial) throw new Error('Confirm complete files now requires consent. Refresh through Context Preview.');
    if (!await this.deps.confirm()) throw new Error('Complete-file sending cancelled. Review context to try again.');
    if (!current()) throw new Error('Explanation cancelled.');
    session.completeConsent = true;
   }
   const budget = Math.min(EXPLANATION_LIMITS.historyCharacters, Math.min(policy.maximumCharacters, context.limits.maximumTotalCharacters) - context.totalCharacters - question.length);
   const prior = boundExplanationHistory(session.messages, budget);
   let checked = explanationBudget(effectiveContext,{question:question.trim(),messages:prior.messages},session.request.provider,session.request.model);
   while(checked.error && prior.messages.length) {
    prior.messages.splice(0,2); prior.omitted+=2;
    checked=explanationBudget(effectiveContext,{question:question.trim(),messages:prior.messages},session.request.provider,session.request.model);
   }
   if(checked.error)throw new Error(checked.error);
   if (prior.messages.some(m => redactContextSecrets(m.content).redacted)) throw new Error('Conversation contains suspected secrets. Clear it and review new context.');
   const result = await this.deps.ask({ ...session.request, explanation: { question: question.trim(), messages: prior.messages }, storeHistory: false }, abort.signal);
   if (!current()) throw new Error('Explanation cancelled.');
   if (!result.ok) return result;
   if (result.value.suggestion.edit || result.value.suggestion.snippet || result.value.suggestion.explanation.length > EXPLANATION_LIMITS.responseCharacters) throw new Error('Explain returned an invalid read-only response. Try a more focused question.');
   const next = boundExplanationHistory([...prior.messages, { role: 'user', content: question.trim() }, { role: 'assistant', content: result.value.suggestion.explanation }]);
   session.messages = next.messages; session.omitted += prior.omitted + next.omitted;
   return { ok: true, value: { suggestion: result.value.suggestion, messages: next.messages, omitted: session.omitted } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Explanation failed. Try again.' }; }
  finally { if (current()) this.abort = null; }
 }
}
