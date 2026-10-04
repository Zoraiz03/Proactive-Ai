import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExplanationSession, type ExplanationPolicy } from './explanation-session.ts';
import { EXPLANATION_LIMITS, boundExplanationHistory, validExplanationInput } from '../shared/explanation.ts';
import { buildLiveRequest } from './live-observer.ts';
import { validateObserverRequest, type ObserverAskResult, type ObserverRequest } from '../shared/observer.ts';
import type { IpcResult } from '../shared/workspace.ts';
function request(): ObserverRequest {
 const live = buildLiveRequest({ relativePath: 'main.py', content: 'def add(a, b):\n    return a + b\n', previousContent: '', line: 2, column: 5, diagnostics: [] }, 'demo', { observerEnabled: true, includeDiagnostics: false, confirmCompleteFile: false, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000 });
 const manual = { ...live }; delete manual.editBase;
 delete manual.liveObserver;
 manual.mode = 'explain'; manual.contextPackage!.intent = { mode: 'explain', instruction: 'Explain: Explain for a beginner' };
 return manual;
}
const answer: IpcResult<ObserverAskResult> = { ok: true, value: { provider: 'demo', suggestion: { explanation: 'Adds the two inputs.', snippet: '', reason: 'Approved snapshot.' } } };
function fixture() {
 let policy: ExplanationPolicy = { enabled: true, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000, confirmCompleteFile: false };
 let confirm = true, confirmations = 0;
 let ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>> = async () => answer;
 const requests: ObserverRequest[] = [], signals: AbortSignal[] = [];
 const session = new ExplanationSession({ policy: async () => policy, confirm: async () => { confirmations++; return confirm; }, ask: (r, s) => { requests.push(r); signals.push(s); return ask(r, s); } });
 return { session, requests, signals, setPolicy: (p: Partial<ExplanationPolicy>) => { policy = { ...policy, ...p }; }, setConfirm: (value: boolean) => { confirm = value; }, confirmations: () => confirmations, setAsk: (value: typeof ask) => { ask = value; } };
}
test('Explain reuses the exact approved snapshot, question and previous messages without history persistence', async () => {
 const f = fixture(), original = request();
 const first = await f.session.start('one', original); assert.equal(first.ok, true);
 assert.equal(f.requests[0].storeHistory, false); assert.equal(f.requests[0].explanation?.question, 'Explain for a beginner');
 const next = await f.session.send('one', 'What are the inputs?'); assert.equal(next.ok, true);
 assert.deepEqual(f.requests[1].contextPackage, original.contextPackage);
 assert.deepEqual(f.requests[1].explanation?.messages, [{ role: 'user', content: 'Explain for a beginner' }, { role: 'assistant', content: 'Adds the two inputs.' }]);
 assert.equal(validateObserverRequest(f.requests[1])?.explanation?.question, 'What are the inputs?');
});
test('bounded complete turns and omission counts; question is never silently truncated', async () => {
 const f = fixture(); await f.session.start('one', request());
 let last; for (let n = 0; n < 10; n++) last = await f.session.send('one', `Question ${n}?`);
 assert.ok(last?.ok); assert.equal(last.value.messages.length, EXPLANATION_LIMITS.messages); assert.equal(last.value.omitted, 14);
 assert.equal((await f.session.send('one', 'x'.repeat(501))).ok, false);
 assert.deepEqual(boundExplanationHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b'.repeat(30) }], 10), { messages: [], omitted: 2 });
 assert.equal(validExplanationInput({ question: 'why', messages: [{ role: 'assistant', content: 'orphan' }] }), false);
});
for (const change of [{ enabled: false }, { exclusions: ['main.py'] }, { maximumCharacters: 20 }]) test(`followups recheck current privacy: ${JSON.stringify(change)}`, async () => {
 const f = fixture(); await f.session.start('one', request()); f.setPolicy(change);
 assert.equal((await f.session.send('one', 'Why?')).ok, false); assert.equal(f.requests.length, 1);
});
test('complete-file confirmation is explicit and changed consent settings require a new preview', async () => {
 const f = fixture(); f.setPolicy({ confirmCompleteFile: true }); f.setConfirm(false);
 assert.equal((await f.session.start('one', request())).ok, false); assert.equal(f.requests.length, 0);
 f.setConfirm(true); assert.equal((await f.session.start('two', request())).ok, true);
 await f.session.send('two', 'Why?'); assert.equal(f.confirmations(), 2);
 const g = fixture(); await g.session.start('old', request()); g.setPolicy({ confirmCompleteFile: true });
 const blocked = await g.session.send('old', 'Why?'); assert.ok(!blocked.ok); assert.match(blocked.error, /Refresh through Context Preview/); assert.equal(g.requests.length, 1);
});
test('questions and prior output are screened for secrets', async () => {
 const f = fixture(); await f.session.start('one', request());
 assert.equal((await f.session.send('one', 'password="this-is-a-fixture-secret"')).ok, false);
 f.setAsk(async () => ({ ok: true, value: { provider: 'demo', suggestion: { explanation: 'api_key="fixture-only-sensitive-value"', snippet: '', reason: '' } } }));
 await f.session.send('one', 'What else?');
 assert.equal((await f.session.send('one', 'Explain that')).ok, false); assert.equal(f.requests.length, 2);
});
for (const action of ['cancel', 'clear'] as const) test(`${action} aborts, rejects late results and prevents duplicate requests`, async () => {
 const f = fixture(); let resolve!: (value: IpcResult<ObserverAskResult>) => void;
 f.setAsk(async () => new Promise(r => { resolve = r; }));
 const pending = f.session.start('one', request()); await Promise.resolve(); await Promise.resolve();
 assert.equal((await f.session.send('one', 'Duplicate?')).ok, false); assert.equal(f.requests.length, 1);
 f.session[action](); assert.equal(f.signals[0].aborted, true); resolve(answer); assert.equal((await pending).ok, false);
 if (action === 'clear') assert.equal((await f.session.send('one', 'Old project?')).ok, false);
});
test('rejects edits, unrelated modes and injected additional files', async () => {
 const f = fixture(); assert.equal((await f.session.start('one', { ...request(), mode: 'improve_code' })).ok, false);
 const changed = request(); changed.contextPackage!.items[0].source.relativePath = 'other.py';
 assert.equal((await f.session.start('one', changed)).ok, false); assert.equal(f.requests.length, 0);
 f.setAsk(async () => ({ ok: true, value: { provider: 'demo', suggestion: { explanation: 'replace', snippet: 'new code', reason: '' } } }));
 assert.equal((await f.session.start('two', request())).ok, false);
});
