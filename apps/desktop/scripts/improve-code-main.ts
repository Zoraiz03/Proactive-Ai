import {resolveImproveScope} from '../src/main/improve-scope';
// Isolated Electron fixture: real context builder, session, and checkpoint store; mocked provider.
import { ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImproveCodeSession } from '../src/main/improve-code-session';
import { ProjectContextEngine } from '../src/main/project-context';
import { CheckpointStore } from '../src/main/checkpoint-store';
import { fixSelectionRange } from '../src/shared/fix-code';
import type { ObserverRequest, ObserverPrepareRequest, ObserverAskResult } from '../src/shared/observer';
import type { IpcResult } from '../src/shared/workspace';
export async function install(temp: string) {
    const path = 'main.js', hash = (s: string) => createHash('sha256').update(s).digest('hex');
    await writeFile(join(temp, path), 'function add(a,b) { const sum = a + b; return sum; }');
    const engine = new ProjectContextEngine();
    engine.setWorkspace(temp);
    const checkpoints = new CheckpointStore(join(temp, 'checkpoints'));
    let content = '', mode = 'clarification', delayed = false, release: (() => void) | undefined, permitted = true, aborted = false, confirmations = 0, consent = true;
    const calls: ObserverRequest[] = [];
    const session = new ImproveCodeSession({ policy: async () => ({ enabled: permitted, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000, confirmCompleteFile: true, includeDiagnostics: true, includeTerminalError: true }), confirm: async () => { confirmations++; return consent; }, ask: async (request, signal) => {
            calls.push(request);
            signal.addEventListener('abort', () => { aborted = true; });
            const outcome = mode === 'clarification' && request.improveCode!.clarifications.length ? 'improvement' : mode;
            const answer: IpcResult<ObserverAskResult> = { ok: true, value: { provider: 'demo', suggestion: { improveOutcome: outcome === 'invalid' ? 'improvement' : outcome as 'improvement' | 'clarification' | 'no_change' | 'correctness_issue', explanation: '**Mock diagnosis.**\n\n```js\nadd(2, 3)\n```\n\n<script>window.unsafe=true</script>\n![tracking](https://invalid.example/image)', snippet: '', reason: 'Approved scope only.', tradeoffs:'Removes an unnecessary local variable; no speedup was measured.', verification: 'Compare the output to your stated expectation; not executed.', ...(outcome === 'clarification' ? { clarificationQuestion: 'Must the public API remain unchanged?' } : {}), ...(['improvement', 'invalid'].includes(outcome) ? { edit: { targetRelativePath: path, originalContentHash: hash(content), editType: 'replace' as const, range: fixSelectionRange(content, 'const sum = a + b; return sum;'), expectedOriginalText: outcome === 'invalid' ? 'wrong text' : 'const sum = a + b; return sum;', replacementText: 'return a + b;' } } : {}) } } };
            return delayed ? new Promise(resolve => { release = () => resolve(answer); }) : answer;
        } });
    const handlers = {
        prepare: async (r: ObserverPrepareRequest) => { try {
            content = r.seed.content;
            const contextPackage = await engine.build(r.seed);
            return { ok: true, value: { provider: r.provider, mode: 'improve_code', kind: 'code', fileName: path, language: 'javascript', source: r.seed.selectedCode ? 'selection' : 'cursor', cursorLine: r.seed.cursorLine, cursorColumn: r.seed.cursorColumn, storeHistory: false, contextPackage, improveCode: {...resolveImproveScope(r.seed),goal:r.seed.improveGoal??'readability',clarifications:[]}, editBase: { targetRelativePath: path, originalContentHash: hash(content), contentLength: content.length, basedOnUnsavedContent: true } } };
        }
        catch (e) {
            return { ok: false, error: (e as Error).message };
        } },
        improveStart: (id: string, r: ObserverRequest) => session.start(id, r, content), improveClarify: (id: string, a: string, h: string) => session.send(id, a, h), improveClear: () => session.clear(),
        checkpoint: async (before: string, after: string) => checkpoints.create({ workspaceId: hash('fixture'), relativePath: path, previousContent: before, previousContentHash: hash(before), appliedContentHash: hash(after) }, 20),
        undo: async (current: string) => (await checkpoints.restore(hash('fixture'), path, hash(current))).previousContent,
        summary: async () => ({ calls, aborted, confirmations, savedContent:await readFile(join(temp,path),"utf8") }), mode: (m: string) => { mode = m; }, delay: () => { delayed = true; aborted = false; }, release: () => { delayed = false; release?.(); }, permit: (v: boolean) => { permitted = v; }, consent: (v: boolean) => { consent = v; },
    };
    for (const [name, fn] of Object.entries(handlers))
        ipcMain.handle(`improve-fixture-${name}`, (_event, ...args) => (fn as (...values:unknown[])=>unknown)(...args));
}
