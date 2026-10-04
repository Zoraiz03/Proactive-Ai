import { observerInputBudget, observerTelemetry } from "../shared/observer-budget.ts";
import { createHash, randomUUID } from 'node:crypto';
import { LIVE_CONFIG, liveLanguage, LIVE_OFF, LIVE_PAUSED_MESSAGES, type LiveEdit, type LiveActivity, type LiveState, type LiveTiming } from '../shared/live-observer.ts';
import { validateAndBuildProposedEdit } from '../shared/ai-edit.ts';
import type { ProjectContextEngine } from './project-context.ts';
import { isExcludedFromAiContext } from '../shared/settings.ts';
import { redactContextSecrets } from '../shared/context-tray.ts';
import { projectContextCost, type ProjectContextItem } from '../shared/project-context.ts';
import type { ObserverRequest, ObserverProvider, ObserverAskResult } from '../shared/observer.ts';
import type { IpcResult } from '../shared/workspace.ts';
export interface LivePolicy { observerEnabled: boolean; includeDiagnostics: boolean; confirmCompleteFile: boolean; exclusions: string[]; maximumCharacters: number; maximumFileCharacters: number; maximumRelatedFiles?: number }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class LiveContextError extends Error {
 readonly reviewWithObserver: boolean;
 constructor(message: string, reviewWithObserver = false) { super(message); this.reviewWithObserver = reviewWithObserver; }
}
const instruction = 'Complete the unfinished code or correct a concrete error near the cursor. Infer intent from the current code and relevant project context. Supply one coherent exact edit preserving existing behavior and style. Ask one focused question only if essential intent is ambiguous. No suggestion is valid for complete code without an evident issue. Never claim tested or fixed.';
export function buildLiveRequest(edit: LiveEdit, provider: ObserverProvider, policy: LivePolicy): ObserverRequest {
 if (!policy.observerEnabled) throw new Error('Observer is disabled in Privacy settings.');
 if (!liveLanguage(edit.relativePath)) throw new Error('Live Observer needs a supported source-code file.');
 if (isExcludedFromAiContext(edit.relativePath, policy.exclusions) || edit.relativePath.split(/[\\/]/).some(p => ['..', '.git', 'node_modules', 'dist', 'out', 'vendor', 'build'].includes(p)) || /^(\/|[a-z]:)/i.test(edit.relativePath)) throw new LiveContextError('Blocked: this file matches AI context exclusions or a protected path. No code was sent.');
 if (redactContextSecrets(edit.content).redacted) throw new LiveContextError('Blocked: suspected secrets in this file. Remove the sensitive material before requesting context. No code was sent.');
 const lines = edit.content.split(/\r?\n/);
 if (edit.line < 1 || edit.line > lines.length) throw new Error('Cursor context is unavailable.');
 const maximum = observerInputBudget(provider, policy.maximumCharacters);
 const codeBudget = Math.min(LIVE_CONFIG.maximumCodeCharacters, maximum - instruction.length - (policy.includeDiagnostics ? Math.min(3, edit.diagnostics.length) * LIVE_CONFIG.maximumDiagnosticCharacters : 0) - 100);
 if (codeBudget < 1) throw new LiveContextError(`Blocked: Live context exceeds your ${maximum}-character Privacy context budget.`, true);
 let start = 0, end = lines.length;
 if (edit.content.length > codeBudget) {
  start = edit.line - 1; end = edit.line;
  let used = lines[start].length;
  while (start > 0 || end < lines.length) {
   let grew = false;
   if (start > 0 && used + lines[start - 1].length + 1 <= codeBudget) { used += lines[--start].length + 1; grew = true; }
   if (end < lines.length && used + lines[end].length + 1 <= codeBudget) { used += lines[end++].length + 1; grew = true; }
   if (!grew) break;
  }
 }
 const code = start === 0 && end === lines.length ? edit.content : lines.slice(start, end).join('\n');
 const complete = start === 0 && end === lines.length;
 if (complete && policy.confirmCompleteFile) throw new LiveContextError('Blocked: the nearby excerpt includes this entire short file, and “Confirm complete files” is enabled in Privacy settings. Review with Ask Observer for an explicit context preview. No code was sent.', true);
 if (!code.trim() || code.length > codeBudget) throw new LiveContextError(`Blocked: nearby code exceeds the ${codeBudget}-character excerpt limit. Review a smaller selection with Ask Observer. No code was sent.`, true);
 const item = (id: string, type: ProjectContextItem['type'], content: string, lineStart: number, lineEnd: number): ProjectContextItem => ({ id, type, content, priority: 1, source: { provenance: type === 'diagnostic' ? 'diagnostics' : 'editor_cursor', relativePath: edit.relativePath, lineStart, lineEnd }, reason: 'Live active-editor context', ...projectContextCost(content), optional: false, completeFile: type === 'nearby_code' && complete, truncated: false, redacted: false });
 const items = [item('live-code', 'nearby_code', code, start + 1, end)];
 if (policy.includeDiagnostics) for (const diagnostic of edit.diagnostics.filter(d => d.line >= start + 1 && d.line <= end).slice(0, 3)) {
  if (redactContextSecrets(diagnostic.message).redacted) throw new LiveContextError('Blocked: suspected secrets in diagnostics. No code was sent.');
  items.push(item(`live-diagnostic-${items.length}`, 'diagnostic', diagnostic.message.slice(0, LIVE_CONFIG.maximumDiagnosticCharacters), diagnostic.line, diagnostic.line));
 }
 items.push({ ...item('live-intent', 'user_instruction', instruction, edit.line, edit.line), source: { provenance: 'user', relativePath: edit.relativePath } });
 const totalCharacters = items.reduce((n, i) => n + i.content.length, 0);

 if (totalCharacters > maximum || maximum < 1000) throw new LiveContextError(`Blocked: Live context exceeds your ${maximum}-character Privacy context budget. Review a smaller selection with Ask Observer. No code was sent.`, true);
 const fileName = edit.relativePath.split('/').at(-1)!;
 const language = liveLanguage(fileName);
 return { traceId: randomUUID(), liveObserver: true, provider, storeHistory: false, mode: 'improve_code', kind: 'code', fileName, language, source: 'cursor', cursorLine: edit.line, cursorColumn: edit.column,
 editBase: { targetRelativePath: edit.relativePath, originalContentHash: hash(edit.content), contentLength: edit.content.length, basedOnUnsavedContent: true },
 contextPackage: { version: 1, intent: { mode: 'improve_code', instruction }, activeFile: { relativePath: edit.relativePath, fileName, language, kind: 'code' }, cursor: { line: edit.line, column: edit.column }, items, omitted: complete ? [] : [{type: "nearby_code", reason: "Active file exceeds Privacy/model budget; only the displayed cursor excerpt is included."}], totalCharacters, estimatedTokens: Math.ceil(totalCharacters / 4), limits: { maximumTotalCharacters: maximum, maximumRelatedFiles: policy.maximumRelatedFiles ?? 4, maximumCharactersPerFile: Math.min(20000, policy.maximumFileCharacters) }, containsCompleteFile: complete } };
}
export async function buildLiveProjectRequest(edit: LiveEdit, provider: ObserverProvider, policy: LivePolicy, engine: ProjectContextEngine): Promise<ObserverRequest> {
 const started = performance.now();
 const request = buildLiveRequest(edit, provider, policy);
 const context = request.contextPackage!;
 const related = await engine.build({ mode: 'improve_code', kind: 'code', activeRelativePath: edit.relativePath, fileName: request.fileName, language: request.language, content: edit.content, cursorLine: edit.line, cursorColumn: edit.column, exclusions: policy.exclusions, maximumTotalCharacters: context.limits.maximumTotalCharacters, maximumRelatedFiles: policy.maximumRelatedFiles ?? 4, maximumCharactersPerFile: policy.maximumFileCharacters, trayItems: edit.trayItems });
 context.omitted.push(...related.omitted);
 for (const item of related.items) {
  if (item.type === 'user_instruction' || (item.source.relativePath === edit.relativePath && item.attachmentProvenance !== 'user_attached')) continue;
  const reason = item.staleState === 'stale' || item.staleState === 'unavailable' ? 'Attached context is stale or unavailable; refresh it.' : policy.confirmCompleteFile && item.completeFile ? 'Complete-file context needs confirmation.' : context.items.length >= 25 || context.totalCharacters + item.content.length > context.limits.maximumTotalCharacters ? 'Active code takes priority within the context budget.' : '';
  if (reason) { context.omitted.push({ type: item.type, source: item.source.relativePath, reason }); continue; }
  context.items.push({ ...item, id: `support-${item.id}` });
  context.totalCharacters += item.content.length;
 }
 context.omitted = context.omitted.slice(0, 100);
 context.estimatedTokens = Math.ceil(context.totalCharacters / 4);
 context.containsCompleteFile = context.items.some(item => item.completeFile);
 observerTelemetry("context_preparation", performance.now() - started, context, request.traceId);
 return request;
}
// Ignore trailing whitespace/blank lines, but preserve indentation on code lines.
const meaningfulText = (content: string, python: boolean) => content.replace(/\r\n/g, '\n').split('\n').map(line => line.replace(/[ \t]+$/, '')).filter(line => line.trim().length > 0).map(line => python ? line : line.trimStart()).join('\n');
export class LiveObserverController {
 private state: LiveState = { ...LIVE_OFF };
 private generation = 0;
 private abort: AbortController | null = null;
 private candidate: { edit: LiveEdit; at: number; key: string } | null = null;
 private activity: LiveActivity | null = null;
 private activityAt = 0;
 private requests: number[] = [];
 private seen = new Set<string>();
 private provider: ObserverProvider = 'demo';
 private timing: LiveTiming;
 private workingGeneration: number | null = null;
 private requestStartedAt: number | null = null;
 private readonly deps: { policy: () => Promise<LivePolicy>; ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>>; publish: (state: LiveState) => void; now?: () => number; timing?: Partial<LiveTiming>; buildRequest?: (edit: LiveEdit, provider: ObserverProvider, policy: LivePolicy) => Promise<ObserverRequest> };
 constructor(deps: LiveObserverController['deps']) {
  this.deps = deps;
  this.timing = { pauseMs: LIVE_CONFIG.pauseMs, cooldownMs: LIVE_CONFIG.cooldownMs, maximumRequestsPerHour: LIVE_CONFIG.maximumRequestsPerHour, ...deps.timing };
 }
 private now() { return this.deps.now?.() ?? Date.now(); }
 getState() { return this.state; }
 private publish(state: LiveState) {
  const next = { ...state, timing: { ...this.timing } };
  if (JSON.stringify(next) === JSON.stringify(this.state)) return;
  this.state = next; this.deps.publish(next);
 }
 private invalidate() {
  this.generation++; this.abort?.abort(); this.abort = null;
  this.workingGeneration = null; this.requestStartedAt = null; this.candidate = null;
 }
 cancel(message = 'Waiting for a meaningful code edit.') {
  this.invalidate();
  this.publish(this.state.enabled ? { enabled: true, status: 'idle', message } : { ...LIVE_OFF });
 }
 pause(reason: string) {
  this.invalidate();
  if (this.state.enabled) this.publish({ enabled: true, status: 'paused', message: reason });
 }
 block(message: string, reviewWithObserver = false) {
  this.invalidate();
  if (this.state.enabled) this.publish({ enabled: true, status: 'blocked', message, relativePath: this.activity?.relativePath ?? undefined, reviewWithObserver });
 }
 dismiss() {
  if (this.candidate) this.seen.add(this.candidate.key);
  this.cancel('Dismissed. No repeat for unchanged context.');
 }
 configure(enabled: boolean, provider: ObserverProvider, pauseMs = this.timing.pauseMs) {
  this.invalidate(); this.provider = provider;
  this.timing.pauseMs = Math.max(LIVE_CONFIG.minimumPauseMs, Math.min(LIVE_CONFIG.maximumPauseMs, pauseMs));
  this.publish(enabled ? { enabled, status: 'idle', message: 'Waiting for a meaningful code edit.' } : { ...LIVE_OFF });
 }
 observeActivity(activity: LiveActivity) {
  const previousPath = this.activity?.relativePath;
  this.activity = activity; this.activityAt = this.now();
  if (!this.state.enabled) return;
  // Specific competing activity takes precedence over focus lost to its dialog.
  if (activity.blocked) { this.pause(LIVE_PAUSED_MESSAGES[activity.reason ?? 'workspace']); return; }
  if (!activity.focused) { this.pause('Paused: the IDE window is not focused. Return and make a new edit.'); return; }
  if (previousPath !== activity.relativePath || (this.state.relativePath && this.state.relativePath !== activity.relativePath)) {
   this.cancel('Active file changed. Waiting for a new meaningful edit.'); return;
  }
  if (this.state.status === 'paused') this.cancel();
 }
 edit(edit: LiveEdit) {
  if (!this.state.enabled || edit.content === edit.previousContent) return;
  const hadPending = this.candidate?.edit.relativePath === edit.relativePath;
  this.invalidate(); // Abort old work even for whitespace; only the latest buffer is valid.
  if (!this.allowed(edit.relativePath)) {
   this.pause(this.activity?.blocked ? LIVE_PAUSED_MESSAGES[this.activity.reason ?? 'workspace'] : 'Paused: the active editor is not focused or current. Make a new edit when ready.'); return;
  }
  if (!hadPending && meaningfulText(edit.content, /\.py$/i.test(edit.relativePath)) === meaningfulText(edit.previousContent, /\.py$/i.test(edit.relativePath))) {
   this.publish({ enabled: true, status: 'idle', message: 'Whitespace-only edit. Waiting for a meaningful code change.' }); return;
  }
  const key = hash(edit.relativePath + '\0' + edit.content);
  if (this.seen.has(key)) { this.publish({ enabled: true, status: 'idle', message: 'This unchanged context was already considered. Waiting for a new code change.' }); return; }
  this.candidate = { edit, key, at: this.now() };
  this.publishWait();
 }
 private allowed(path: string) {
  return this.activity?.focused && !this.activity.blocked && this.activity.relativePath === path && this.now() - this.activityAt <= LIVE_CONFIG.freshnessMs;
 }
 // Returns true only when both the latest typing pause and all rate limits elapsed.
 private publishWait(): boolean {
  if (!this.candidate) return false;
  const now = this.now();
  this.requests = this.requests.filter(at => now - at < 3600000);
  const pauseLeft = Math.max(0, this.candidate.at + this.timing.pauseMs - now);
  const cooldownLeft = Math.max(0, (this.requests.at(-1) ?? -Infinity) + this.timing.cooldownMs - now);
  const seconds = (ms: number) => Math.ceil(ms / 1000);
  const base = { enabled: true, relativePath: this.candidate.edit.relativePath };
  if (this.requests.length >= this.timing.maximumRequestsPerHour) {
   const remaining = this.requests[0] + 3600000 - now;
   this.publish({ ...base, status: 'limited', message: `Hourly limit: ${this.timing.maximumRequestsPerHour} requests used. Latest edit queued; next slot in ${seconds(remaining)}s. Typing pause remaining: ${seconds(pauseLeft)}s.` }); return false;
  }
  if (cooldownLeft > 0) {
   this.publish({ ...base, status: 'cooldown', message: `Request cooldown: ${seconds(cooldownLeft)}s remaining. Latest edit queued. Typing pause remaining: ${seconds(pauseLeft)}s.` }); return false;
  }
  if (pauseLeft > 0) {
   this.publish({ ...base, status: 'waiting', message: `Typing pause: ${seconds(pauseLeft)}s remaining after your latest edit. No request sent yet.` }); return false;
  }
  return true;
 }
 async tick() {
  const candidate = this.candidate;
  if (!candidate || !this.state.enabled) return;
  if (!this.allowed(candidate.edit.relativePath)) {
   this.pause('Paused: editor activity is no longer current. Return to the file and make a new edit.'); return;
  }
  if (this.workingGeneration !== null) {
   if (this.requestStartedAt !== null) this.publish({ enabled: true, status: 'thinking', relativePath: candidate.edit.relativePath, message: `Waiting for ${this.provider} response: ${Math.floor((this.now() - this.requestStartedAt) / 1000)}s elapsed. The typing pause and rate-limit waits are over.` });
   return;
  }
  if (!this.publishWait()) return;
  const generation = this.generation;
  this.workingGeneration = generation;
  this.publish({ enabled: true, status: 'checking', relativePath: candidate.edit.relativePath, message: 'Checking current privacy settings before sending. No code sent yet.' });
  let attempted = false;
  try {
   const policy = await this.deps.policy();
   if (generation !== this.generation) return;
   if (!this.allowed(candidate.edit.relativePath)) { this.pause('Paused: editor activity expired while checking privacy settings. Make a new edit.'); return; }
   const request = this.deps.buildRequest ? await this.deps.buildRequest(candidate.edit, this.provider, policy) : buildLiveRequest(candidate.edit, this.provider, policy);
   if (generation !== this.generation) return;
   if (!this.allowed(candidate.edit.relativePath)) { this.pause('Paused: editor changed while gathering project context.'); return; }
   this.seen.add(candidate.key); this.requests.push(this.now());
   this.abort = new AbortController(); this.requestStartedAt = this.now();
   this.publish({ enabled: true, status: 'thinking', relativePath: candidate.edit.relativePath, message: `Waiting for ${this.provider} response: 0s elapsed. The typing pause and rate-limit waits are over.` });
   attempted = true;
   const result = await this.deps.ask(request, this.abort.signal);
   if (generation !== this.generation) return;
   if (!this.allowed(candidate.edit.relativePath)) { this.pause('Paused: editor activity expired. Waiting for a new edit.'); return; }
   this.candidate = null;
   if (!result.ok) { this.cancel(`Provider request failed: ${result.error} No automatic retry; make a new edit or use Ask Observer.`); return; }
   if (result.value.suggestion.explanation === 'NO_SUGGESTION') { this.cancel('No suggestion for this context. Waiting for a new meaningful edit.'); return; }
   const suggestion = result.value.suggestion;
   const range = suggestion.edit?.range;
   const excerpt = request.contextPackage!.items[0].source;
   if (suggestion.explanation.length > 1200 || suggestion.reason.length > 500 || (range && (range.start.line < excerpt.lineStart! || range.end.line > excerpt.lineEnd!))) { this.cancel('Response exceeded the bounded Live Observer context. Use Ask Observer.'); return; }
   if (suggestion.edit) {
    const checked = validateAndBuildProposedEdit(suggestion.edit, request.editBase!, candidate.edit.content, hash(candidate.edit.content));
    if (!checked.ok) { this.cancel(`Suggestion could not be matched to your code: ${checked.message} Nothing was applied.`); return; }
   }
   this.publish({ enabled: true, status: 'ready', relativePath: candidate.edit.relativePath, message: `${suggestion.edit ? "Suggestion ready" : "Clarification needed"} · ${request.contextPackage!.totalCharacters.toLocaleString()} context characters · ${request.contextPackage!.items.length - 2} supporting items · ${request.contextPackage!.omitted.length} omitted · not tested`, request, suggestion });
  } catch (error) {
   if (generation === this.generation) {
    this.invalidate();
    this.publish({ enabled: true, status: 'blocked', relativePath: candidate.edit.relativePath,
     message: attempted ? 'Request failed after sending was attempted. Nothing was applied.' : `Blocked before sending: ${error instanceof Error ? error.message : 'Live Observer unavailable.'}`,
     reviewWithObserver: error instanceof LiveContextError && error.reviewWithObserver });
   }
  } finally { if (this.workingGeneration === generation) { this.workingGeneration = null; this.abort = null; this.requestStartedAt = null; } }
 }
}
