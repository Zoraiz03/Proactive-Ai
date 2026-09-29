import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPrompt, parseFixCode, getSuggestion, type SuggestContext } from '../src/lib/server/providers.ts';
import { buildFixCodeContext } from '../apps/desktop/src/main/fix-code-context.ts';
import { FIX_CODE_LIMITS, fixSelectionRange } from '../apps/desktop/src/shared/fix-code.ts';
const code = 'function add(a,b) { return a - b; }';
const hash = createHash('sha256').update(code).digest('hex');
const projectContext = buildFixCodeContext({ mode: 'fix_error', kind: 'code', activeRelativePath: 'main.js', fileName: 'main.js', language: 'javascript', content: code, userRequest: 'Return the sum.', cursorLine: 1, cursorColumn: 1, maximumTotalCharacters: 9000, maximumCharactersPerFile: 6000, maximumRelatedFiles: 0, exclusions: [] });
const ctx: SuggestContext = { kind: 'code', fileName: 'main.js', content: code, context: { mode: 'fix_error' }, projectContext, fixCode: { scope: 'selection', range: fixSelectionRange(code, 'a - b'), clarifications: [{ question: 'Should this add?', answer: 'Yes, return the sum.' }] }, editBase: { targetRelativePath: 'main.js', originalContentHash: hash, contentLength: code.length, basedOnUnsavedContent: true } };
const prompt = buildPrompt(ctx);
for (const pattern of [/syntax/, /runtime failures/, /incomplete code ONLY/, /logic relative/, /Do not invent/, /Never suppress exceptions/, /no_problem/, /one focused question/, /UNTRUSTED DATA/, /previous model questions/, /Stale\/version-unconfirmed/, /Yes, return the sum/, /never return a partial fix/, /Improve Code/])
    assert.match(prompt, pattern);
assert.doesNotMatch(prompt, /1-3 sentences/);
const base = { explanation: 'Evidence and limits.\n\n```js\nadd(2, 3)\n```', snippet: '', verification: 'Check the stated inputs; not executed.', reason: '' };
const edit = { targetRelativePath: 'main.js', originalContentHash: hash, editType: 'replace', range: fixSelectionRange(code, 'a - b'), expectedOriginalText: 'a - b', replacementText: 'a + b' };
for (const result of [{ ...base, fixOutcome: 'correction', edit }, { ...base, fixOutcome: 'clarification', clarificationQuestion: 'Should this add?' }, { ...base, fixOutcome: 'no_problem' }])
    assert.equal(parseFixCode(JSON.stringify(result), ctx).fixOutcome, result.fixOutcome);
for (const result of [{ ...base, fixOutcome: 'correction' }, { ...base, fixOutcome: 'no_problem', edit }, { ...base, fixOutcome: 'clarification' }, { ...base, fixOutcome: 'correction', edit: { ...edit, range: fixSelectionRange(code) } }, { ...base, fixOutcome: 'no_problem', snippet: 'code' }, { ...base, fixOutcome: 'no_problem', extra: 'unsafe' }])
    assert.throws(() => parseFixCode(JSON.stringify(result), ctx));
const body = JSON.stringify({ ...base, fixOutcome: 'no_problem' });
for (const stop of ['length', 'max_tokens', 'MAX_TOKENS'])
    assert.throws(() => parseFixCode(body, ctx, stop), /output limit/);
assert.throws(() => parseFixCode('{"explanation":', ctx));
const originalFetch = globalThis.fetch;
try {
    for (const provider of ['gemini', 'openai', 'deepseek', 'anthropic'] as const) {
        let sent: Record<string, unknown> = {};
        globalThis.fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); return Response.json(provider === 'gemini' ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: body }] } }] } : provider === 'anthropic' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: body }] } : { choices: [{ finish_reason: 'stop', message: { content: body } }] }); };
        const result = await getSuggestion(provider, 'mock-never-sent', ctx);
        assert.equal(result.fixOutcome, 'no_problem');
        assert.equal(provider === 'gemini' ? (sent.generationConfig as {
            maxOutputTokens: number;
        }).maxOutputTokens : provider === 'openai' ? sent.max_completion_tokens : sent.max_tokens, FIX_CODE_LIMITS.outputTokens);
    }
}
finally {
    globalThis.fetch = originalFetch;
}
for (const mode of ['improve_code', 'continue_code', 'generate_tests'] as const) {
    assert.match(buildPrompt({ ...ctx, fixCode: undefined, context: { mode } }), /1-3 sentences/);
}
console.log('PASS Fix Code: dedicated prompts, all outcomes, invalid/partial/out-of-scope rejection, output budgets, other-mode contracts (mocked providers only)');
