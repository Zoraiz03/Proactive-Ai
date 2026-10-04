import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import ObserverPanel, { type ObserverStatus } from '../src/renderer/src/ObserverPanel';
import ContextPreview from '../src/renderer/src/ContextPreview';
import ExplanationConversation from '../src/renderer/src/ExplanationConversation';
import { useExplanation } from '../src/renderer/src/useExplanation';
import { ExplanationSession } from '../src/main/explanation-session';
import type { ObserverRequest } from '../src/shared/observer';
import { projectContextCost } from '../src/shared/project-context';
const calls: ObserverRequest[] = [];
let delayed = false, release: (() => void) | null = null, permitted = true, copied = '', aborted = false;
const answer = { ok: true as const, value: { provider: 'demo' as const, suggestion: { explanation: '**Adds inputs.**\n\n```python\nadd(2, 3) # 5\n```\n\n<script>window.unsafe = true</script>\n\n![tracking](https://invalid.example/tracker)\n\n[unsafe](javascript:alert(1))', snippet: '', reason: 'Approved snapshot.' } } };
const session = new ExplanationSession({ policy: async () => ({ enabled: permitted, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000, confirmCompleteFile: false }), confirm: async () => true, ask: async (request, signal) => {
 calls.push(request); signal.addEventListener('abort', () => { aborted = true; });
 return delayed ? new Promise(resolve => { release = () => resolve(answer); }) : answer;
} });
Object.assign(window, { observer: {
 explain: (id: string, request: ObserverRequest) => session.start(id, request), followup: (id: string, question: string) => session.send(id, question),
 cancelExplanation: async () => session.cancel(), clearExplanation: async () => session.clear(), copySnippet: async (text: string) => { copied = text; return { ok: true }; },
}, fixture: { calls, delay: () => { delayed = true; }, release: () => { delayed = false; release?.(); }, deny: () => { permitted = false; }, allow: () => { permitted = true; }, summary: () => ({ copied, aborted }) } });
function Fixture() {
 const [workspace, setWorkspace] = useState('first');
 const [content, setContent] = useState('def add(a, b):\n    return a + b');
 const [question, setQuestion] = useState(''), [status, setStatus] = useState<ObserverStatus>('idle');
 const [preview, setPreview] = useState<ObserverRequest | null>(null);
 const explanation = useExplanation(workspace, setStatus);
 const prepare = () => {
  explanation.clear();
  const instruction = question ? `Explain: ${question}` : 'Explain';
  const items = [{ id: 'intent', type: 'user_instruction' as const, content: instruction, source: { provenance: 'user' as const }, priority: 1, reason: 'Action', optional: false, completeFile: false, truncated: false, redacted: false, ...projectContextCost(instruction) }, { id: 'code', type: 'selected_code' as const, content, source: { provenance: 'editor_selection' as const, relativePath: 'main.py', lineStart: 1, lineEnd: 2 }, priority: 2, reason: 'Selected code', optional: false, completeFile: true, truncated: false, redacted: false, ...projectContextCost(content) }];
  setPreview({ provider: 'demo', mode: 'explain', kind: 'code', fileName: 'main.py', language: 'python', source: 'selection', cursorLine: 1, cursorColumn: 1, storeHistory: false, contextPackage: { version: 1, intent: { mode: 'explain', instruction }, activeFile: { relativePath: 'main.py', fileName: 'main.py', language: 'python', kind: 'code' }, cursor: { line: 1, column: 1 }, items, omitted: [], totalCharacters: content.length + instruction.length, estimatedTokens: 30, containsCompleteFile: true, limits: { maximumTotalCharacters: 9000, maximumRelatedFiles: 0, maximumCharactersPerFile: 6000 } } });
 };
 return <div style={{height: '100vh', overflow: 'auto', maxWidth: 700, margin: 'auto'}}>
  <label>Source code<textarea aria-label="Source code" value={content} onChange={e => setContent(e.target.value)} /></label>
  <button onClick={() => { setWorkspace('second'); setPreview(null); }}>Switch project</button>
  <ObserverPanel mode="explain" modes={['explain']} provider="demo" status={status} contextSummary="Selected code · main.py:1–2" suggestion={null} error={null} copyStatus="idle" canAsk={!explanation.request && !preview}
   explainQuestion={question} onExplainQuestionChange={setQuestion} onAsk={prepare} onModeChange={() => {}} onProviderChange={() => {}} onCopy={() => {}} onDismiss={explanation.clear} onUndo={() => {}} canUndo={false} focusToken={0}
   explanationCard={explanation.request && <ExplanationConversation request={explanation.request} result={explanation.result} busy={explanation.busy} error={explanation.error} stale={content !== explanation.snapshot?.content} onFollowup={explanation.followup} onClear={explanation.clear} onCancel={explanation.cancel} onRefresh={prepare} />}
   automaticRunEnabled={false} liveObserverCard={null} automaticRunCard={null} multiFileDescription="" onMultiFileDescriptionChange={() => {}} proactiveNudge={null} onProactiveAction={() => {}} onProactiveNotNow={() => {}} onProactiveMute={() => {}} onDisableProactiveAssist={() => {}} usefulnessPrompt={null} onUsefulness={() => {}} contextTrayItems={[]} webContextStatus={{available:false,enabled:false,paired:false,connected:false,pairingCode:null,pairingExpiresAt:null,pairedDevice:null,port:null,message:'Disabled'}} maximumContextCharacters={9000} onRemoveContextItem={() => {}} onClearContext={() => {}} onMoveContextItem={() => {}} onRefreshContextItem={() => {}} onKeepOriginalContextItem={() => {}} onTruncateContextItem={() => {}} />
  {preview && <ContextPreview request={preview} onChange={setPreview} onCancel={() => setPreview(null)} onSend={() => { const request = preview; setPreview(null); void explanation.start(request, { path: 'main.py', content }); }} />}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
