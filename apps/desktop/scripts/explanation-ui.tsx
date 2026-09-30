import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import '../src/renderer/src/monaco';
import * as monaco from 'monaco-editor';
import { EditorWorkspace } from '../src/renderer/src/App';
import { LIVE_OFF } from '../src/shared/live-observer';
import { DEFAULT_LOCAL_SETTINGS } from '../src/shared/settings';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ObserverPanel, { type ObserverStatus } from '../src/renderer/src/ObserverPanel';
import ContextPreview from '../src/renderer/src/ContextPreview';
import ExplanationConversation from '../src/renderer/src/ExplanationConversation';
import { useExplanation } from '../src/renderer/src/useExplanation';
import { ExplanationSession } from '../src/main/explanation-session';
import type { ObserverRequest } from '../src/shared/observer';
import type { ProjectContextSeed } from '../src/shared/project-context';
import ExplainScopePicker from '../src/renderer/src/ExplainScopePicker';
import { buildExplainContext, explainFunction } from '../src/main/explain-context';
import { explanationPreviewMatches } from '../src/shared/explanation';
const calls: ObserverRequest[] = [];
let delayed = false, release: (() => void) | null = null, permitted = true, copied = '', aborted = false;
const answer = { ok: true as const, value: { provider: 'demo' as const, suggestion: { explanation: '**Adds inputs.**\n\n```python\nadd(2, 3) # 5\n```\n\n<script>window.unsafe = true</script>\n\n![tracking](https://invalid.example/tracker)\n\n[unsafe](javascript:alert(1))', snippet: '', reason: 'Approved snapshot.' } } };
const session = new ExplanationSession({ policy: async () => ({ enabled: permitted, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000, confirmCompleteFile: false }), confirm: async () => true, ask: async (request, signal) => {
 calls.push(request); signal.addEventListener('abort', () => { aborted = true; });
 return delayed ? new Promise(resolve => { release = () => resolve(answer); }) : answer;
} });
Object.assign(window, { monaco, observer: {
 explainScopes: async (request:{seed:ProjectContextSeed}) => ({ok:true,value:explainFunction(request.seed)}),
 explain: (id: string, request: ObserverRequest) => session.start(id, request), followup: (id: string, question: string) => session.send(id, question),
 cancelExplanation: async () => session.cancel(), clearExplanation: async () => session.clear(), copySnippet: async (text: string) => { copied = text; return { ok: true }; },
}, fixture: { calls, delay: () => { delayed = true; }, release: () => { delayed = false; release?.(); }, deny: () => { permitted = false; }, allow: () => { permitted = true; }, summary: () => ({ copied, aborted }) } });
function Fixture() {
 const [scope,setScope]=useState<"selection"|"function"|"file">("function");
 const [snapshot,setSnapshot]=useState<Parameters<React.ComponentProps<typeof EditorWorkspace>["onObserverContextChange"]>[0]|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [previewSource,setPreviewSource]=useState<{path:string;content:string}|null>(null);
 const [workspace, setWorkspace] = useState('first');
 const [content, setContent] = useState('def add(a, b):\n    return a + b');
 const [question, setQuestion] = useState(''), [status, setStatus] = useState<ObserverStatus>('idle');
 const [preview, setPreview] = useState<ObserverRequest | null>(null);
 const explanation = useExplanation(workspace, setStatus);
 const scopeRequest=useMemo(()=>({provider:'demo' as const,seed:{mode:'explain',kind:'code',activeRelativePath:'main.py',fileName:'main.py',language:'python',content,cursorLine:snapshot?.cursorLine ?? 1,cursorColumn:snapshot?.cursorColumn ?? 1,explainScope:scope,exclusions:[],maximumTotalCharacters:9000,maximumRelatedFiles:4,maximumCharactersPerFile:6000,userRequest:question || undefined,...(snapshot?.selectedCode?{selectedCode:snapshot.selectedCode,selectionRange:snapshot.selectionRange}:{})} as ProjectContextSeed}),[content,scope,question,snapshot]);
 const tabs=[{file:{name:'main.py',relativePath:'main.py',content:'saved source',modifiedAtMs:0},draft:content,saving:false,saveStatus:null,availability:'available' as const,externalConflict:null,externalNotice:null}];
 const prepare = () => {
  explanation.clear();
  setError(null);
  try {
   const contextPackage=buildExplainContext(scopeRequest.seed);
   setPreviewSource({path:'main.py',content});
   setPreview({provider:'demo',mode:'explain',kind:'code',fileName:'main.py',language:'python',source:'cursor',cursorLine:scopeRequest.seed.cursorLine,cursorColumn:scopeRequest.seed.cursorColumn,storeHistory:false,contextPackage});
  } catch(e) {setStatus('error');setError(e instanceof Error?e.message:'Preview failed');}

 };
 return <div style={{height: '100vh', overflow: 'auto', maxWidth: 700, margin: 'auto'}}>
  <label>Source code<textarea aria-label="Source code" value={content} onChange={e => setContent(e.target.value)} /></label>
  <div style={{height:200}}><EditorWorkspace liveState={LIVE_OFF} onLiveReview={()=>{}} tabs={tabs} activePath="main.py" surface={{status:'idle'}} onActivate={()=>{}} onClose={()=>{}} onChange={(_path,value)=>setContent(value)} onSave={()=>{}} onRun={()=>{}} onStop={()=>{}} running={false} focusLocation={null} onReloadExternal={()=>{}} onKeepLocal={()=>{}} onObserverContextChange={setSnapshot} onDiagnosticsChange={()=>{}} onAddContext={()=>{}} markdownViewMode="edit" onMarkdownViewModeChange={()=>{}} editorSettings={DEFAULT_LOCAL_SETTINGS.editor} editorTheme="vs" /></div>
  <button onClick={() => { setWorkspace('second'); setPreview(null); }}>Switch project</button>
  <ObserverPanel mode="explain" modes={['explain']} provider="demo" status={status} contextSummary="Selected code · main.py:1–2" suggestion={null} error={error} copyStatus="idle" canAsk={!explanation.request && !preview}
   explainScopeControl={<ExplainScopePicker request={scopeRequest} value={scope} onChange={setScope} disabled={Boolean(preview || explanation.request)} />}
   explainQuestion={question} onExplainQuestionChange={setQuestion} onAsk={prepare} onModeChange={() => {}} onProviderChange={() => {}} onCopy={() => {}} onDismiss={explanation.clear} onUndo={() => {}} canUndo={false} focusToken={0}
   explanationCard={explanation.request && <ExplanationConversation request={explanation.request} result={explanation.result} busy={explanation.busy} error={explanation.error} stale={content !== explanation.snapshot?.content} onFollowup={explanation.followup} onClear={explanation.clear} onCancel={explanation.cancel} onRefresh={prepare} />}
   automaticRunEnabled={false} automaticRunCard={null} multiFileDescription="" onMultiFileDescriptionChange={() => {}} proactiveNudge={null} onProactiveAction={() => {}} onProactiveNotNow={() => {}} onProactiveMute={() => {}} onDisableProactiveAssist={() => {}} usefulnessPrompt={null} onUsefulness={() => {}} contextTrayItems={[]} webContextStatus={{available:false,enabled:false,paired:false,connected:false,pairingCode:null,pairingExpiresAt:null,pairedDevice:null,port:null,message:'Disabled'}} maximumContextCharacters={9000} onRemoveContextItem={() => {}} onClearContext={() => {}} onMoveContextItem={() => {}} onRefreshContextItem={() => {}} onKeepOriginalContextItem={() => {}} onTruncateContextItem={() => {}} />
  {preview && <ContextPreview request={preview} onChange={setPreview} onCancel={() => setPreview(null)} onSend={() => { const request = preview; setPreview(null); if(!explanationPreviewMatches(previewSource,{path:'main.py',content})){setStatus('error');setError('Source changed after preview. Ask Observer again to refresh; nothing was sent.');return;} void explanation.start(request, previewSource!); }} />}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
