import { createHash } from 'node:crypto';
import { FIX_CODE_LIMITS, editWithinFixScope, validFixContext, validFixSuggestion, type FixCodeResult } from '../shared/fix-code.ts';
import { offsetForPosition, validateAndBuildProposedEdit } from '../shared/ai-edit.ts';
import { redactContextSecrets } from '../shared/context-tray.ts';
import { isExcludedFromAiContext } from '../shared/settings.ts';
import type { ObserverRequest, ObserverAskResult } from '../shared/observer.ts';
import type { IpcResult } from '../shared/workspace.ts';
export class FixCodeSession {
    private session: {
        id: string;
        request: ObserverRequest;
        content: string;
        question?: string;
        consent: boolean;
    } | null = null;
    private abort: AbortController | null = null;
    private generation = 0;
    private deps: {
        policy: () => Promise<{
            enabled: boolean;
            exclusions: string[];
            maximumCharacters: number;
            maximumFileCharacters: number;
            confirmCompleteFile: boolean;
            includeDiagnostics: boolean;
            includeTerminalError: boolean;
        }>;
        confirm: () => Promise<boolean>;
        ask: (r: ObserverRequest, s: AbortSignal) => Promise<IpcResult<ObserverAskResult>>;
    };
    constructor(deps: FixCodeSession['deps']) { this.deps = deps; }
    clear() { this.generation++; this.abort?.abort(); this.abort = null; this.session = null; }
    async start(id: string, request: ObserverRequest, content: string): Promise<IpcResult<FixCodeResult>> {
        if (this.abort)
            return { ok: false, error: 'Fix Code is already reviewing. Cancel before starting again.' };
        if (typeof id !== 'string' || !id || id.length > 100 || !request.fixCode || request.mode !== 'fix_error' || !request.editBase || request.editBase.originalContentHash !== createHash('sha256').update(content).digest('hex'))
            return { ok: false, error: 'Fix Code snapshot is invalid. Build a new preview.' };
        const context = request.contextPackage;
        const fix = request.fixCode;
        if (!context || !validFixContext(fix) || request.editBase.contentLength !== content.length || request.editBase.targetRelativePath !== context.activeFile.relativePath || context.items.some(item => !['user_instruction', 'selected_code', 'complete_file', 'nearby_code', 'diagnostic', 'terminal_error'].includes(item.type) || (item.source.relativePath && item.source.relativePath !== context.activeFile.relativePath)))
            return {ok:false,error:'Fix Code context does not match the approved active file. Build a new preview.'};
        const start = offsetForPosition(content, fix.range.start), end = offsetForPosition(content, fix.range.end);
        const supplied = context.items.filter(item => item.type === (fix.scope === 'file' ? 'complete_file' : 'selected_code'));
        if (start === null || end === null || end <= start || (fix.scope === 'file' && (start !== 0 || end !== content.length)) || supplied.length !== 1 || supplied[0].content !== content.slice(start,end) || supplied[0].optional || supplied[0].truncated || supplied[0].redacted || supplied[0].content.length > FIX_CODE_LIMITS.codeCharacters)
            return {ok:false,error:'Fix Code scope is incomplete or changed. Select a smaller section and preview it again.'};
        this.clear();
        this.session = { id, request: structuredClone({ ...request, storeHistory: false }), content, consent: false };
        return this.send(id, undefined, request.editBase.originalContentHash, true);
    }
    async send(id: string, answer: string | undefined, currentHash: string, initial = false): Promise<IpcResult<FixCodeResult>> {
        const session = this.session;
        if (!session || session.id !== id)
            return { ok: false, error: 'Fix Code session expired. Build a new preview.' };
        if (this.abort)
            return { ok: false, error: 'A Fix Code request is already in progress.' };
        if (currentHash !== session.request.editBase!.originalContentHash)
            return { ok: false, error: 'The source changed. Review a fresh context before continuing.' };
        const clarifications = [...session.request.fixCode!.clarifications];
        if (!initial) {
            if (!session.question || typeof answer !== 'string' || !answer.trim() || answer.length > FIX_CODE_LIMITS.question || redactContextSecrets(answer).redacted || redactContextSecrets(session.question).redacted)
                return { ok: false, error: 'Answer the current clarification in 1–500 characters without secrets.' };
            if (clarifications.length >= FIX_CODE_LIMITS.clarificationTurns)
                return { ok: false, error: 'Clarification limit reached. Start a fresh Fix Code review with the clarified behavior.' };
            clarifications.push({ question: session.question, answer: answer.trim() });
        }
        const request = { ...session.request, fixCode: { ...session.request.fixCode!, clarifications } };
        const token = ++this.generation, abort = new AbortController();
        this.abort = abort;
        const current = () => token === this.generation && this.session === session;
        try {
            const p = await this.deps.policy();
            if (!current())
                throw new Error('Fix Code cancelled.');
            const context = request.contextPackage!;
            if (!p.enabled)
                throw new Error('Observer is disabled in Privacy settings. Nothing was sent.');
            if (context.items.some(i => (i.source.relativePath && isExcludedFromAiContext(i.source.relativePath, p.exclusions)) || redactContextSecrets(i.content).redacted))
                throw new Error('Approved context is now excluded or contains suspected secrets. Review a new context.');
            if ((!p.includeDiagnostics && context.items.some(i => i.type === 'diagnostic')) || (!p.includeTerminalError && context.items.some(i => i.type === 'terminal_error')))
                throw new Error('Diagnostic/run evidence permission changed. Build a new context preview.');
            const total = context.totalCharacters + clarifications.reduce((n, t) => n + t.question.length + t.answer.length, 0);
            if (total > Math.min(p.maximumCharacters, context.limits.maximumTotalCharacters) || context.items.some(i => ['complete_file', 'selected_code', 'nearby_code'].includes(i.type) && i.content.length > p.maximumFileCharacters))
                throw new Error('Approved context and clarification exceed current privacy limits. Select a smaller section.');
            if (p.confirmCompleteFile && context.containsCompleteFile && !session.consent) {
                if (!initial)
                    throw new Error('Complete-file consent is now required. Review a new preview.');
                if (!await this.deps.confirm())
                    throw new Error('Complete-file sending cancelled.');
                if (!current())
                    throw new Error('Fix Code cancelled.');
                session.consent = true;
            }
            const result = await this.deps.ask(request, abort.signal);
            if (!current())
                throw new Error('Fix Code cancelled.');
            if (!result.ok)
                return result;
            const suggestion = result.value.suggestion;
            if (!validFixSuggestion(suggestion))
                throw new Error('Invalid Fix Code outcome. Nothing was applied. Try a more focused review.');
            if (suggestion.edit) {
                if (!editWithinFixScope(suggestion.edit, request.fixCode))
                    throw new Error('The proposed correction extends outside the approved scope. Select a broader scope and preview it explicitly.');
                const valid = validateAndBuildProposedEdit(suggestion.edit, request.editBase!, session.content, currentHash);
                if (!valid.ok)
                    throw new Error(valid.message);
            }
            session.request = request;
            session.question = suggestion.fixOutcome === 'clarification' ? suggestion.clarificationQuestion : undefined;
            return { ok: true, value: { request, suggestion } };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : 'Fix Code failed. Try again.' };
        }
        finally {
            if (current())
                this.abort = null;
        }
    }
}
