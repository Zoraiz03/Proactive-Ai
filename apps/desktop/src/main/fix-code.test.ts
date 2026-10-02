import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildFixCodeContext } from './fix-code-context.ts';
import { FixCodeSession } from './fix-code-session.ts';
import { ProjectContextEngine } from './project-context.ts';
import { CheckpointStore } from './checkpoint-store.ts';
import { guardedRunArgs } from './fix-code-run.ts';
import { fixSelectionRange, fixRunVersionMessage, validFixSuggestion, FIX_CODE_LIMITS } from '../shared/fix-code.ts';
import { validateAndBuildProposedEdit } from '../shared/ai-edit.ts';
import { validateObserverRequest, type ObserverRequest, type ObserverAskResult } from '../shared/observer.ts';
import type { ProjectContextSeed } from '../shared/project-context.ts';
import type { IpcResult } from '../shared/workspace.ts';
const content = 'const untouched = 42;\nfunction sum(a, b) { return a - b; }\n';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function seed(overrides: Partial<ProjectContextSeed> = {}): ProjectContextSeed { return { mode: 'fix_error', kind: 'code', activeRelativePath: 'main.js', fileName: 'main.js', language: 'javascript', content, cursorLine: 2, cursorColumn: 30, maximumTotalCharacters: 9000, maximumCharactersPerFile: 6000, maximumRelatedFiles: 0, exclusions: [], ...overrides }; }
function request(selected?: string): ObserverRequest { return { provider: 'demo', mode: 'fix_error', kind: 'code', fileName: 'main.js', language: 'javascript', source: selected ? 'selection' : 'cursor', cursorLine: 2, cursorColumn: 30, storeHistory: false, contextPackage: buildFixCodeContext(seed({ selectedCode: selected, userRequest: 'Return the sum.' })), editBase: { targetRelativePath: 'main.js', originalContentHash: hash(content), contentLength: content.length, basedOnUnsavedContent: true }, fixCode: { scope: selected ? 'selection' : 'file', range: fixSelectionRange(content, selected), clarifications: [] } }; }
const noProblem: IpcResult<ObserverAskResult> = { ok: true, value: { provider: 'demo', suggestion: { fixOutcome: 'no_problem', explanation: 'No clear problem established from supplied code. Intent may be missing.', verification: 'Review expected behavior.', snippet: '', reason: '' } } };
const clarification: IpcResult<ObserverAskResult> = { ok: true, value: { provider: 'demo', suggestion: { fixOutcome: 'clarification', explanation: 'The intended operator is not established.', clarificationQuestion: 'Should this add or subtract?', verification: '', snippet: '', reason: '' } } };
function correction(): IpcResult<ObserverAskResult> { return { ok: true, value: { provider: 'demo', suggestion: { fixOutcome: 'correction', explanation: 'The stated sum uses subtraction; addition matches that stated intent.', verification: 'Check sum(2,3) against the stated expected 5; not executed.', snippet: '', reason: '', edit: { targetRelativePath: 'main.js', originalContentHash: hash(content), editType: 'replace', range: fixSelectionRange(content, 'a - b'), expectedOriginalText: 'a - b', replacementText: 'a + b' } } } }; }
function fixture() { let policy = { enabled: true, exclusions: [] as string[], maximumCharacters: 9000, maximumFileCharacters: 6000, confirmCompleteFile: false, includeDiagnostics: true, includeTerminalError: true }; let consent = true, confirmations = 0; let ask: (r: ObserverRequest, s: AbortSignal) => Promise<IpcResult<ObserverAskResult>> = async () => clarification; const requests: ObserverRequest[] = [], signals: AbortSignal[] = []; const session = new FixCodeSession({ policy: async () => policy, confirm: async () => { confirmations++; return consent; }, ask: (r, s) => { requests.push(r); signals.push(s); return ask(r, s); } }); return { session, requests, signals, setAsk: (a: typeof ask) => { ask = a; }, setPolicy: (p: Partial<typeof policy>) => { policy = { ...policy, ...p }; }, setConsent: (v: boolean) => { consent = v; }, confirmations: () => confirmations }; }
test('full unsaved buffer without diagnostics, exact selection with read-only surroundings and columns', () => { const full = request(); assert.ok(validateObserverRequest(full)); assert.equal(full.contextPackage!.items.find(i => i.type === 'complete_file')!.content, content); assert.equal(full.contextPackage!.containsCompleteFile, true); const selection = request('a - b'); assert.ok(validateObserverRequest(selection)); assert.equal(selection.contextPackage!.items.find(i => i.type === 'selected_code')!.content, 'a - b'); assert.match(selection.contextPackage!.items.find(i => i.type === 'nearby_code')!.reason, /read-only/); assert.equal(selection.fixCode!.range.start.column, 29); assert.throws(() => fixSelectionRange('x x', 'x'), /ambiguous/); assert.throws(() => fixSelectionRange(content, 'a - b', { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }), /Selection changed/); });
test('oversized full file fails closed; smaller exact selection succeeds without silent truncation', () => { assert.throws(() => buildFixCodeContext(seed({ content: 'x'.repeat(6001) })), /Select a smaller section.*no code was sent or truncated/); const c = buildFixCodeContext(seed({ content: 'x'.repeat(7000) + '\nreturn 1;', selectedCode: 'return 1;' })); assert.equal(c.items.find(i => i.type === 'selected_code')!.content, 'return 1;'); assert.ok(c.omitted.length); assert.ok(c.items.every(i => !i.truncated)); });
test('stale run evidence is explicitly separated from current-version evidence', () => { for (const sourceHash of [undefined, hash('old'), hash(content)]) {
    const c = buildFixCodeContext(seed({ fixRunEvidence: { sourceHash, sourceUnchanged: true, output: 'ReferenceError: value' } }));
    assert.equal(c.items.at(-1)!.content.includes('STALE'), sourceHash !== hash(content));
} assert.match(buildFixCodeContext(seed({ runError: 'old error' })).items.at(-1)!.content, /STALE/); });
test('exclusions and suspected secrets block code; sensitive optional evidence is omitted', async () => { const root = await mkdtemp(join(tmpdir(), 'fix-privacy-')); try {
    await writeFile(join(root, 'main.js'), content);
    const engine = new ProjectContextEngine();
    engine.setWorkspace(root);
    await assert.rejects(() => engine.build(seed({ exclusions: ['main.js'] })), /excluded/i);
    assert.throws(() => buildFixCodeContext(seed({ content: 'const password="fixture-sensitive-password";' })), /suspected secrets/);
    const c = buildFixCodeContext(seed({ runError: 'api_key="fixture-sensitive-secret"' }));
    assert.ok(c.omitted.some(i => /secrets/.test(i.reason)));
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('clarification reuses exact context, no persisted history, honest no-problem and bounded turns', async () => { const f = fixture(), r = request(); assert.equal((await f.session.start('one', r, content)).ok, true); for (let n = 0; n < FIX_CODE_LIMITS.clarificationTurns; n++)
    assert.equal((await f.session.send('one', 'Add inputs.', hash(content))).ok, true); assert.equal((await f.session.send('one', 'More', hash(content))).ok, false); assert.deepEqual(f.requests.at(-1)!.contextPackage, r.contextPackage); assert.equal(f.requests.at(-1)!.fixCode!.clarifications.length, 4); assert.equal(f.requests.every(r => r.storeHistory === false), true); f.setAsk(async () => noProblem); const result = await f.session.start('two', r, content); assert.ok(result.ok); assert.equal(result.value.suggestion.edit, undefined); assert.equal((await f.session.send('two', 'Another', hash(content))).ok, false); });
for (const change of [{ enabled: false }, { exclusions: ['main.js'] }, { maximumCharacters: 20 }, { maximumFileCharacters: 1 }, { confirmCompleteFile: true }])
    test(`clarification rechecks privacy ${JSON.stringify(change)}`, async () => { const f = fixture(); await f.session.start('one', request(), content); f.setPolicy(change); assert.equal((await f.session.send('one', 'Add inputs', hash(content))).ok, false); assert.equal(f.requests.length, 1); });
test('complete-file consent, diagnostics/run permissions, secret answers and stale source are checked', async () => { const f = fixture(); f.setPolicy({ confirmCompleteFile: true }); f.setConsent(false); assert.equal((await f.session.start('one', request(), content)).ok, false); assert.equal(f.requests.length, 0); f.setConsent(true); await f.session.start('two', request(), content); await f.session.send('two', 'Add inputs', hash(content)); assert.equal(f.confirmations(), 2); assert.equal((await f.session.send('two', 'Add', hash('changed'))).ok, false); assert.equal((await f.session.send('two', 'password="fixture-sensitive-password"', hash(content))).ok, false); for (const type of ['diagnostic', 'terminal_error'] as const) {
    const r = request();
    r.contextPackage = buildFixCodeContext(seed({ diagnostic: { fileName: 'main.js', line: 2, column: 1, message: 'error' }, runError: 'old failure' }));
    const g = fixture();
    await g.session.start('one', r, content);
    g.setPolicy(type === 'diagnostic' ? { includeDiagnostics: false } : { includeTerminalError: false });
    assert.equal((await g.session.send('one', 'Add', hash(content))).ok, false);
    assert.equal(g.requests.length, 1);
} });
test('cancel/project reset aborts duplicate and late requests', async () => { const f = fixture(); let release!: (r: IpcResult<ObserverAskResult>) => void; f.setAsk(async () => new Promise(r => { release = r; })); const pending = f.session.start('one', request(), content); await Promise.resolve(); await Promise.resolve(); assert.equal((await f.session.start('two', request(), content)).ok, false); f.session.clear(); assert.equal(f.signals[0].aborted, true); release(noProblem); assert.equal((await pending).ok, false); assert.equal((await f.session.send('one', 'Old project', hash(content))).ok, false); });
test('valid minimal correction preserves unrelated unsaved code; explicit checkpoint/Undo round trip', async () => { const f = fixture(); f.setAsk(async () => correction()); const result = await f.session.start('one', request('a - b'), content); assert.ok(result.ok); const proposal = validateAndBuildProposedEdit(result.value.suggestion.edit, request().editBase!, content, hash(content)); assert.ok(proposal.ok); assert.equal(content.includes('a - b'), true); assert.equal(proposal.value.proposedContent, 'const untouched = 42;\nfunction sum(a, b) { return a + b; }\n'); const dir = await mkdtemp(join(tmpdir(), 'fix-undo-')); try {
    const store = new CheckpointStore(dir);
    await store.create({ workspaceId: hash('project'), relativePath: 'main.js', previousContent: content, previousContentHash: hash(content), appliedContentHash: hash(proposal.value.proposedContent) }, 20);
    await assert.rejects(() => store.restore(hash('project'), 'main.js', hash('newer user change')), /changed after/);
    assert.equal((await store.restore(hash('project'), 'main.js', hash(proposal.value.proposedContent))).previousContent, content);
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
for (const fault of ['outside', 'text', 'hash', 'other-file', 'invalid-range'] as const)
    test(`invalid correction rejected: ${fault}`, async () => { const f = fixture(), result = correction(); assert.ok(result.ok); const edit = result.value.suggestion.edit!; if (fault === 'outside')
        edit.range = fixSelectionRange(content, 'const untouched'); if (fault === 'text')
        edit.expectedOriginalText = 'wrong'; if (fault === 'hash')
        edit.originalContentHash = hash('old'); if (fault === 'other-file')
        edit.targetRelativePath = 'other.js'; if (fault === 'invalid-range')
        edit.range.end.column = 999; f.setAsk(async () => result); assert.equal((await f.session.start('one', request('a - b'), content)).ok, false); });
test('outcome contract rejects partial fixes and unrelated snippets', () => { assert.ok(noProblem.ok); assert.ok(validFixSuggestion(noProblem.value.suggestion)); assert.equal(validFixSuggestion({ ...noProblem.value.suggestion, fixOutcome: 'correction' }), false); assert.equal(validFixSuggestion({ ...noProblem.value.suggestion, snippet: 'x=1' }), false); });
test('verification is tied to unchanged executed applied source, never overall correctness', () => { const h = hash(content); assert.match(fixRunVersionMessage({ status: 'succeeded', sourceHash: h, sourceUnchanged: true, snapshotVerified: true }, h, h), /One run does not prove/); for (const run of [{ status: 'succeeded' }, { status: 'succeeded', sourceHash: h, sourceUnchanged: false, snapshotVerified: true }, { status: 'succeeded', sourceHash: h, sourceUnchanged: true, snapshotVerified: false }])
    assert.match(fixRunVersionMessage(run, h, h), /Unverified/); assert.match(fixRunVersionMessage({ status: 'succeeded', sourceHash: h, sourceUnchanged: true, snapshotVerified: true }, hash('new'), h), /Unverified/); });
for (const [language, name, code] of [['python', 'main.py', 'print("fixture-ok")\n'], ['javascript', 'main.cjs', 'console.log("fixture-ok");\n'], ['javascript', 'main.mjs', 'export const x = 1; console.log("fixture-ok");\n']] as const)
    test(`guarded explicit runner ${name} hashes executed bytes and rejects source races`, async () => { const dir = await mkdtemp(join(tmpdir(), 'fix-run-')); try {
        const file = join(dir, name);
        await writeFile(file, code);
        const run = async (expected: string) => new Promise<{
            status: number | null;
            out: string;
            err: string;
            ack: string;
        }>((resolve, reject) => { const child = spawn(language === 'python' ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath, guardedRunArgs(language, file, expected), { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] }); let out = '', err = '', ack = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d); child.stdio[3]!.on('data', d => ack += d); child.on('error', reject); child.on('close', status => resolve({ status, out, err, ack })); });
        const good = await run(hash(code));
        assert.equal(good.status, 0, good.err);
        assert.equal(good.ack, hash(code));
        assert.match(good.out, /fixture-ok/);
        const bad = await run(hash('old'));
        assert.notEqual(bad.status, 0);
        assert.equal(bad.ack, '');
        assert.equal(bad.out, '');
        assert.match(bad.err, /Source changed/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    } });
test('approved source cannot be relabeled, truncated, or expanded across files',async()=>{
 for(const change of ['source','path','range']as const){const r=request(),f=fixture();if(change==='source')r.contextPackage!.items.find(i=>i.type==='complete_file')!.content='invented';if(change==='path')r.contextPackage!.items[1].source.relativePath='other.js';if(change==='range')r.fixCode!.range=fixSelectionRange(content,'a - b');assert.equal((await f.session.start('one',r,content)).ok,false);assert.equal(f.requests.length,0);}
});
