import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveObserverController, buildLiveRequest, type LivePolicy } from './live-observer.ts';
import { LIVE_CONFIG, type LiveEdit } from '../shared/live-observer.ts';
import type { ObserverAskResult, ObserverRequest } from '../shared/observer.ts';
import type { IpcResult } from '../shared/workspace.ts';
const policy: LivePolicy = { observerEnabled: true, includeDiagnostics: true, confirmCompleteFile: false, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000 };
const edit = (n = 1): LiveEdit => ({ relativePath: 'main.py', previousContent: 'value = 0', content: `value = ${n}\nprint(1 / value)`, line: 2, column: 1, diagnostics: [{ line: 2, column: 1, message: 'Possible zero divisor' }] });
const answer: IpcResult<ObserverAskResult> = { ok: true, value: { provider: 'demo', suggestion: { explanation: 'Check the divisor.', snippet: '', reason: 'Division uses value.' } } };
function fixture() {
 let now = 100000, currentPolicy = policy;
 let ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>> = async () => answer;
 const calls: ObserverRequest[] = [], signals: AbortSignal[] = [];
 const controller = new LiveObserverController({ now: () => now, policy: async () => currentPolicy, ask: async (r, s) => { calls.push(r); signals.push(s); return ask(r, s); }, publish: () => {} });
 const activity = (overrides = {}) => controller.observeActivity({ relativePath: 'main.py', focused: true, blocked: false, ...overrides });
 const advance = (ms: number = LIVE_CONFIG.pauseMs) => { now += ms; activity(); };
 activity();
 return { controller, calls, signals, activity, advance, setAsk: (value: typeof ask) => { ask = value; }, setPolicy: (value: LivePolicy) => { currentPolicy = value; } };
}
test('off, opening, cursor activity and pause without edits never request', async () => {
 const f = fixture(); f.controller.edit(edit()); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
 f.controller.configure(true, 'demo'); for (let n = 0; n < 5; n++) { f.advance(); await f.controller.tick(); } assert.equal(f.calls.length, 0);
});
test('meaningful edits debounce; whitespace-only changes do not request; Python indentation counts', async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(3999); await f.controller.tick(); assert.equal(f.calls.length, 0);
 f.controller.edit(edit(2)); f.advance(3999); await f.controller.tick(); assert.equal(f.calls.length, 0); f.advance(1); await f.controller.tick(); assert.equal(f.calls.length, 1);
 f.advance(30000); f.controller.edit({ ...edit(), previousContent: 'x = 1', content: 'x = 1  \n' }); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
 f.advance(30000); f.controller.edit({ ...edit(), previousContent: 'if True:\n print(1)', content: 'if True:\n  print(1)' }); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 2);
});
test('cooldown, hourly cap and toggling preserve request budgets', async () => {
 const f = fixture(); f.controller.configure(true, 'demo');
 for (let n = 1; n <= 11; n++) { f.controller.configure(false, 'demo'); f.controller.configure(true, 'demo'); f.activity(); f.controller.edit(edit(n)); f.advance(); await f.controller.tick(); f.advance(30000); }
 assert.equal(f.calls.length, 10);
 f.advance(3600000); f.controller.edit(edit(20)); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 11);
 const g = fixture(); g.controller.configure(true, 'demo'); g.controller.edit(edit()); g.advance(); await g.controller.tick(); g.controller.edit(edit(2)); g.advance(); await g.controller.tick(); assert.equal(g.calls.length, 1);
});
for (const reason of ['typing', 'file', 'blur', 'manual', 'off', 'project'] as const) test(`cancellation and late responses: ${reason}`, async () => {
 const f = fixture(); let resolve!: (r: IpcResult<ObserverAskResult>) => void;
 f.setAsk(() => new Promise(r => { resolve = r; })); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(); const pending = f.controller.tick(); await Promise.resolve(); await Promise.resolve();
 assert.equal(f.calls.length, 1);
 if (reason === 'typing') f.controller.edit(edit(2));
 else if (reason === 'file') f.activity({ relativePath: 'other.js' });
 else if (reason === 'blur') f.activity({ focused: false });
 else if (reason === 'manual') f.activity({ blocked: true });
 else f.controller.configure(false, 'demo');
 assert.equal(f.signals[0].aborted, true); resolve(answer); await pending; assert.notEqual(f.controller.getState().status, 'ready');
});
test('no suggestion and dismissed unchanged contexts do not repeat', async () => {
 const f = fixture(); f.setAsk(async () => ({ ok: true, value: { provider: 'demo', suggestion: { explanation: 'NO_SUGGESTION', snippet: '', reason: '' } } }));
 f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(); await f.controller.tick(); assert.equal(f.controller.getState().suggestion, undefined);
 f.advance(30000); f.controller.edit(edit()); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
 f.controller.edit(edit(2)); f.controller.dismiss(); f.advance(30000); f.controller.edit(edit(2)); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
});
test('privacy, bounded unsaved text, diagnostics, line numbers and secrets fail closed', () => {
 const r = buildLiveRequest(edit(), 'demo', policy); assert.equal(r.storeHistory, false); assert.equal(r.editBase?.basedOnUnsavedContent, true); assert.equal(r.contextPackage?.items[0].source.lineStart, 1);
 assert.equal(buildLiveRequest(edit(), 'demo', { ...policy, includeDiagnostics: false }).contextPackage?.items.length, 2);
 for (const e of [{ ...edit(), relativePath: '.env' }, { ...edit(), relativePath: 'notes.md' }, { ...edit(), relativePath: '../main.py' }, { ...edit(), content: 'api_key = "abcdefghijklmnop123456"' }]) assert.throws(() => buildLiveRequest(e, 'demo', policy));
 for (const p of [{ ...policy, observerEnabled: false }, { ...policy, exclusions: ['main.py'] }, { ...policy, confirmCompleteFile: true }, { ...policy, maximumCharacters: 100 }]) assert.throws(() => buildLiveRequest(edit(), 'demo', p));
});
test('policy changes before sending block request and edits are returned only for explicit review', async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.setPolicy({ ...policy, observerEnabled: false }); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
 const g = fixture(); g.setAsk(async (r) => ({ ok: true, value: { provider: 'demo', suggestion: { ...answer.value.suggestion, edit: { targetRelativePath: 'main.py', originalContentHash: r.editBase!.originalContentHash, editType: 'replace', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }, expectedOriginalText: 'value = 1', replacementText: 'value = 2' } } } }));
 g.controller.configure(true, 'demo'); g.controller.edit(edit()); g.advance(); await g.controller.tick(); assert.ok(g.controller.getState().suggestion?.edit); assert.equal(edit().content, 'value = 1\nprint(1 / value)');
});

test('history outage warning survives desktop transport without a fake suggestion ID', async () => {
 const { ObserverApiClient } = await import('./observer-client.ts');
 const client = new ObserverApiClient('http://localhost:3000', async () => 'fixture', async () => Response.json({ provider: 'demo', suggestion: { explanation: 'This prints the value.', reason: 'Manual Explain', snippet: '', historyWarning: 'Not saved to history.' } }));
 const result = await client.ask(buildLiveRequest(edit(), 'demo', policy));
 assert.equal(result.ok, true);
 if (result.ok) { assert.equal(result.value.suggestion.id, undefined); assert.equal(result.value.suggestion.historyWarning, 'Not saved to history.'); }
});

for (const suffix of ['\n', '   ', '\n  ']) test(`meaningful edit survives continued whitespace ${JSON.stringify(suffix)} with latest cursor`, async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); const first = edit();
 f.controller.edit(first); f.advance(3000);
 const latest = { ...first, previousContent: first.content, content: first.content + suffix, line: suffix.includes('\n') ? 3 : 2, column: 2 };
 f.controller.edit(latest); f.advance(3999); await f.controller.tick(); assert.equal(f.calls.length, 0);
 assert.match(f.controller.getState().message, /Typing pause/);
 f.advance(1); await f.controller.tick(); assert.equal(f.calls.length, 1);
 assert.equal(f.calls[0].contextPackage?.items[0].content, latest.content);
 assert.equal(f.calls[0].cursorLine, latest.line); assert.equal(f.calls[0].cursorColumn, 2);
 f.advance(30000); await f.controller.tick(); assert.equal(f.calls.length, 1);
});

test('Enter/trailing whitespace alone never queue; Python code indentation does', async () => {
 const f = fixture(); f.controller.configure(true, 'demo');
 for (const content of ['x = 1\n', 'x = 1  ', 'x = 1\n    ']) {
  f.controller.edit({ ...edit(), previousContent: 'x = 1', content, line: 1 }); f.advance(); await f.controller.tick();
 }
 assert.equal(f.calls.length, 0);
 f.controller.edit({ ...edit(), previousContent: 'print(1)', content: '  print(1)', line: 1 }); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
});

test('cooldown retains the latest candidate and waits for BOTH cooldown and fresh pause', async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(); await f.controller.tick();
 f.controller.edit(edit(2)); f.advance(26000); await f.controller.tick();
 assert.equal(f.controller.getState().status, 'cooldown'); assert.equal(f.calls.length, 1);
 f.advance(3000); const latest = { ...edit(3), previousContent: edit(2).content };
 f.controller.edit(latest); f.advance(1000); await f.controller.tick();
 assert.equal(f.controller.getState().status, 'waiting'); assert.equal(f.calls.length, 1);
 f.advance(3000); await f.controller.tick(); assert.equal(f.calls.length, 2);
 assert.equal(f.calls[1].contextPackage?.items[0].content, latest.content);
 for (let n = 0; n < 10; n++) { f.advance(30000); await f.controller.tick(); }
 assert.equal(f.calls.length, 2);
});

test('hourly limit has its own queued status and does not poll the provider', async () => {
 const f = fixture(); f.controller.configure(true, 'demo');
 for (let i = 1; i <= 10; i++) { f.controller.edit(edit(i)); f.advance(30000); await f.controller.tick(); }
 f.controller.edit(edit(11)); f.advance(); await f.controller.tick();
 assert.equal(f.controller.getState().status, 'limited'); assert.match(f.controller.getState().message, /Hourly limit: 10/);
 for (let i = 0; i < 5; i++) { f.advance(1000); await f.controller.tick(); }
 assert.equal(f.calls.length, 10);
 f.advance(3600000); await f.controller.tick(); assert.equal(f.calls.length, 11);
 await f.controller.tick(); assert.equal(f.calls.length, 11);
});

for (const reason of ['manual', 'automatic', 'review', 'dialog'] as const) test(`competing ${reason} shows paused status and cancels queue without replay`, async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit(edit());
 f.activity({ blocked: true, reason }); assert.equal(f.controller.getState().status, 'paused'); assert.match(f.controller.getState().message, new RegExp(reason === 'automatic' ? 'automatic error' : reason));
 f.advance(10000); await f.controller.tick(); assert.equal(f.calls.length, 0);
 f.controller.edit(edit(2)); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
});

for (const reason of ['disable', 'file', 'blur']) test(`cooldown queue is cancelled on ${reason}`, async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(); await f.controller.tick(); f.controller.edit(edit(2));
 if (reason === 'disable') f.controller.configure(false, 'demo');
 if (reason === 'file') f.activity({ relativePath: 'other.py' });
 if (reason === 'blur') f.activity({ focused: false });
 f.advance(30000); await f.controller.tick(); assert.equal(f.calls.length, 1);
});

test('provider time is separate; whitespace cancels the flight and late result cannot replace latest buffer', async () => {
 const f = fixture(); let resolve!: (r: IpcResult<ObserverAskResult>) => void;
 f.setAsk(() => new Promise(r => { resolve = r; })); f.controller.configure(true, 'demo'); const first = edit(); f.controller.edit(first); f.advance();
 const old = f.controller.tick(); await Promise.resolve(); await Promise.resolve();
 f.advance(2000); await f.controller.tick(); assert.match(f.controller.getState().message, /response: 2s elapsed/);
 f.controller.edit({ ...first, previousContent: first.content, content: first.content + '\n', line: 3 });
 assert.equal(f.signals[0].aborted, true); assert.equal(f.controller.getState().status, 'cooldown');
 resolve(answer); await old; assert.equal(f.controller.getState().suggestion, undefined);
 f.setAsk(async () => answer); f.advance(30000); await f.controller.tick(); assert.equal(f.calls.length, 2);
 assert.equal(f.calls[1].cursorLine, 3);
});

for (const [change, message, review] of [
 [{ confirmCompleteFile: true }, /Confirm complete files/, true],
 [{ exclusions: ['main.py'] }, /AI context exclusions/, false],
 [{ maximumFileCharacters: 5 }, /5-character excerpt limit/, true],
 [{ maximumCharacters: 100 }, /100-character Privacy context budget/, true],
] as const) test(`privacy blocker is persistent and specific: ${String(message)}`, async () => {
 const f = fixture(); f.setPolicy({ ...policy, ...change, exclusions: 'exclusions' in change ? [...change.exclusions] : [] });
 f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance(); await f.controller.tick();
 assert.equal(f.calls.length, 0); assert.equal(f.controller.getState().status, 'blocked'); assert.match(f.controller.getState().message, message); assert.equal(Boolean(f.controller.getState().reviewWithObserver), review);
 for (let i = 0; i < 5; i++) { f.advance(30000); await f.controller.tick(); }
 assert.equal(f.controller.getState().status, 'blocked'); assert.equal(f.calls.length, 0);
});

test('suspected secrets block with no manual shortcut bypass', async () => {
 const f = fixture(); f.controller.configure(true, 'demo'); f.controller.edit({ ...edit(), content: 'api_key = "abcdefghijklmnop123456"', line: 1 }); f.advance(); await f.controller.tick();
 assert.equal(f.calls.length, 0); assert.equal(f.controller.getState().status, 'blocked'); assert.match(f.controller.getState().message, /suspected secrets/); assert.equal(Boolean(f.controller.getState().reviewWithObserver), false);
});

test('blank-line-only edits and JavaScript indentation alone do not initiate requests', async () => {
 const f = fixture(); f.controller.configure(true, 'demo');
 f.controller.edit({ ...edit(), previousContent: 'x = 1\nprint(x)', content: 'x = 1\n\nprint(x)' });
 f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
 f.activity({ relativePath: 'main.js' });
 f.controller.edit({ ...edit(), relativePath: 'main.js', previousContent: 'log(1)', content: '  log(1)', line: 1 });
 f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
});

test('aborted provider that resolves late cannot block or overwrite a newer request', async () => {
 const f = fixture(); let release!: (r: IpcResult<ObserverAskResult>) => void;
 f.setAsk(() => new Promise(resolve => { release = resolve; })); f.controller.configure(true, 'demo'); f.controller.edit(edit()); f.advance();
 const old = f.controller.tick(); await Promise.resolve(); await Promise.resolve();
 f.controller.edit(edit(2)); f.setAsk(async () => ({ ok: true, value: { provider: 'demo', suggestion: { explanation: 'New context', snippet: '', reason: 'Latest buffer' } } }));
 f.advance(30000); await f.controller.tick(); assert.equal(f.calls.length, 2); assert.equal(f.controller.getState().suggestion?.explanation, 'New context');
 release(answer); await old; assert.equal(f.controller.getState().suggestion?.explanation, 'New context');
});

test('renderer reporter coalesces a typing burst after cursor settles; model changes discard it', async () => {
 const { createLiveEditReporter } = await import('../renderer/src/live-editor-events.ts');
 const deferred: (() => void)[] = [], emitted: LiveEdit[] = [];
 let latest = edit();
 const reporter = createLiveEditReporter(() => latest, value => emitted.push(value), fn => deferred.push(fn));
 reporter.changed('main.py', 'x = 0');
 latest = { ...edit(), content: 'x = 1\n', line: 2, column: 1 };
 reporter.changed('main.py', 'x = 1'); deferred.shift()!();
 assert.equal(emitted.length, 1); assert.equal(emitted[0].previousContent, 'x = 0'); assert.equal(emitted[0].line, 2); assert.equal(emitted[0].content, 'x = 1\n');
 reporter.changed('main.py', 'x = 1\n'); reporter.cancel(); deferred.shift()!(); assert.equal(emitted.length, 1);
});

test('renderer activity routing reports reviews/dialogs and gives explicit manual work priority', async () => {
 const { liveBlockReason } = await import('../renderer/src/live-editor-events.ts');
 const flags = { settingsLoaded:true, observerEnabled:true, workspaceUnavailable:false, reviewOpen:false, dialogOpen:false, manualBusy:false, automaticBusy:false, fileUnavailable:false };
 assert.equal(liveBlockReason(flags), undefined);
 assert.equal(liveBlockReason({ ...flags, reviewOpen:true, dialogOpen:true }), 'review');
 assert.equal(liveBlockReason({ ...flags, dialogOpen:true }), 'dialog');
 assert.equal(liveBlockReason({ ...flags, manualBusy:true, automaticBusy:true }), 'manual');
 assert.equal(liveBlockReason({ ...flags, automaticBusy:true }), 'automatic');
 assert.equal(liveBlockReason({ ...flags, observerEnabled:false }), 'privacy');
});
