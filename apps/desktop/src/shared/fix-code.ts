import { OBSERVER_CONTEXT_CHARACTERS } from "./observer-budget.ts";
import { offsetForPosition, parseStructuredObserverEdit, type TextRange, type StructuredObserverEdit } from './ai-edit.ts';
import type { ObserverRequest, ObserverSuggestion } from './observer.ts';
export const FIX_CODE_LIMITS = { question: 500, clarificationTurns: 4, clarificationCharacters: 4000, codeCharacters: OBSERVER_CONTEXT_CHARACTERS, surroundingCharacters: 2000, evidenceCharacters: 2000, responseCharacters: 20000, outputTokens: 8192, timeoutMs: 120000 } as const;
export interface FixCodeContext {
    scope: 'selection' | 'file';
    range: TextRange;
    clarifications: {
        question: string;
        answer: string;
    }[];
}
export type FixCodeOutcome = 'correction' | 'clarification' | 'no_problem';
export interface FixCodeResult {
    suggestion: ObserverSuggestion;
    request: ObserverRequest;
}
export function validFixContext(value: unknown): value is FixCodeContext {
    if (!value || typeof value !== 'object')
        return false;
    const v = value as FixCodeContext;
    const position = (p: {
        line: number;
        column: number;
    }) => p && Number.isInteger(p.line) && p.line > 0 && Number.isInteger(p.column) && p.column > 0;
    return ['selection', 'file'].includes(v.scope) && Boolean(v.range && position(v.range.start) && position(v.range.end)) && comparePosition(v.range.start, v.range.end) <= 0 && Array.isArray(v.clarifications) && v.clarifications.length <= FIX_CODE_LIMITS.clarificationTurns && v.clarifications.every(t => typeof t?.question === 'string' && t.question.length > 0 && t.question.length <= FIX_CODE_LIMITS.question && typeof t.answer === 'string' && t.answer.trim().length > 0 && t.answer.length <= FIX_CODE_LIMITS.question) && v.clarifications.reduce((n, t) => n + t.question.length + t.answer.length, 0) <= FIX_CODE_LIMITS.clarificationCharacters;
}
function comparePosition(a: {
    line: number;
    column: number;
}, b: {
    line: number;
    column: number;
}) { return a.line - b.line || a.column - b.column; }
export function editWithinFixScope(edit: StructuredObserverEdit, fix: FixCodeContext) { return comparePosition(edit.range.start, fix.range.start) >= 0 && comparePosition(edit.range.end, fix.range.end) <= 0; }
export function fixSelectionRange(content: string, selected: string | undefined, range?: TextRange): TextRange {
    const end = { line: content.split('\n').length, column: content.split('\n').at(-1)!.length + 1 };
    if (!selected)
        return { start: { line: 1, column: 1 }, end };
    if (range) {
        const start = offsetForPosition(content, range.start), finish = offsetForPosition(content, range.end);
        if (start !== null && finish !== null && finish > start && content.slice(start, finish) === selected)
            return range;
        throw new Error('Selection changed. Select the code again before previewing Fix Code.');
    }
    const start = content.indexOf(selected);
    if (start < 0 || content.indexOf(selected, start + 1) !== -1)
        throw new Error('Selection location is ambiguous. Select the code again.');
    const position = (offset: number) => ({ line: content.slice(0, offset).split('\n').length, column: offset - content.lastIndexOf('\n', offset - 1) });
    return { start: position(start), end: position(start + selected.length) };
}
export function fixScopeLabel(request: ObserverRequest) {
    const fix = request.fixCode;
    return `${request.contextPackage?.activeFile.relativePath ?? request.fileName} · ${fix?.scope === 'selection' ? `selection ${fix.range.start.line}:${fix.range.start.column}–${fix.range.end.line}:${fix.range.end.column}; surrounding lines are read-only` : 'entire active file, including unsaved content'} · approved snapshot`;
}
export function validFixSuggestion(value: ObserverSuggestion): boolean {
    return ['correction', 'clarification', 'no_problem'].includes(value.fixOutcome ?? '') && typeof value.explanation === 'string' && value.explanation.trim().length > 0 && value.explanation.length <= FIX_CODE_LIMITS.responseCharacters && value.snippet === '' && typeof value.verification === 'string' && value.verification.length <= 4000 &&
        (value.fixOutcome === 'correction' ? Boolean(parseStructuredObserverEdit(value.edit)) && Boolean(value.verification.trim()) : !value.edit) &&
        (value.fixOutcome === 'clarification' ? typeof value.clarificationQuestion === 'string' && value.clarificationQuestion.trim().length > 0 && value.clarificationQuestion.length <= FIX_CODE_LIMITS.question : !value.clarificationQuestion);
}
export function fixRunVersionMessage(run: {
    status: string;
    sourceHash?: string;
    sourceUnchanged?: boolean;
    snapshotVerified?: boolean;
}, currentHash: string, appliedHash: string) {
    if (!run.sourceHash || run.sourceHash !== appliedHash || currentHash !== appliedHash || run.sourceUnchanged !== true || run.snapshotVerified !== true)
        return 'Unverified: this run does not match the unchanged applied source snapshot.';
    return `Run ${run.status} for saved snapshot ${appliedHash.slice(0, 12)}. One run does not prove overall correctness.`;
}
