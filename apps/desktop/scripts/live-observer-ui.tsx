// Electron-only deterministic UI fixture. No auth, network provider, or workspace writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import '../src/renderer/src/monaco';
import { EditorPanelHeader, EditorWorkspace, TopBarSettingsButton } from '../src/renderer/src/App';
import * as monaco from 'monaco-editor';
import LiveObserverCard from '../src/renderer/src/LiveObserverCard';
import AutomaticRunCard from '../src/renderer/src/AutomaticRunCard';
import ObserverPanel from '../src/renderer/src/ObserverPanel';
import ObserverEditReview from '../src/renderer/src/ObserverEditReview';
import BottomPanel, { type RunOutputState } from '../src/renderer/src/BottomPanel';
import ContextTray from '../src/renderer/src/ContextTray';
import SearchPanel from '../src/renderer/src/SearchPanel';
import SourceControlPanel from '../src/renderer/src/SourceControlPanel';
import DocumentationImpactPanel from '../src/renderer/src/DocumentationImpactPanel';
import { DEFAULT_LOCAL_SETTINGS } from '../src/shared/settings';
import { LIVE_OFF, type LiveState } from '../src/shared/live-observer';
import { AUTOMATIC_RUN_OFF, type AutomaticRunState } from '../src/shared/automatic-run';
import { CODE_OBSERVER_MODES, type ObserverMode } from '../src/shared/observer';
import { createContextTrayItem, type ContextTrayItem } from '../src/shared/context-tray';
const counters = { configure: 0, review: 0, apply: 0, dismiss: 0, edits: 0, searchOpen: '' };
const searchListeners = new Set<(batch: import('../src/shared/search').WorkspaceSearchBatch) => void>();
Object.assign(window, { counters, monaco, workspaceSearch: {
 search: async (request: import('../src/shared/search').WorkspaceSearchRequest) => {
  queueMicrotask(() => searchListeners.forEach((listener) => listener({ searchId: request.searchId, files: [{ relativePath: 'src/greetings.js', matchIndices: [4, 5, 6, 7, 8] }], matches: [{ relativePath: 'src/greetings.js', line: 3, column: 7, endColumn: 12, preview: 'const greeting = "Hello";', previewMatchStart: 6, previewMatchLength: 5 }] })));
  return { ok: true as const, value: { searchId: request.searchId, matchCount: 1, fileCount: 1, truncated: false, cancelled: false } };
 },
 cancel: async () => ({ ok: true as const, value: undefined }),
 onBatch: (listener: (batch: import('../src/shared/search').WorkspaceSearchBatch) => void) => { searchListeners.add(listener); return () => searchListeners.delete(listener); },
 }, terminal: {
 create: async () => ({ ok: false as const, error: 'Not available in fixture.' }),
 sendInput: async () => ({ ok: true as const, value: undefined }),
 resize: async () => ({ ok: true as const, value: undefined }),
 close: async () => ({ ok: true as const, value: undefined }),
 onData: () => () => {},
 onExit: () => () => {},
}, git: {
 status: async () => ({ ok: true as const, value: { state: 'not_repository' as const } }),
 diff: async () => ({ ok: false as const, error: 'No repository in fixture.' }),
 cancel: async () => ({ ok: true as const, value: undefined }),
}, workspace: {
 readDirectory: async () => ({ ok: true as const, value: [] }),
 readFile: async () => ({ ok: false as const, error: 'No files in fixture.' }),
} });

const outputRun: RunOutputState = { runId: 'run-1', relativePath: 'main.py', language: 'python', status: 'succeeded', stdout: '120\n', stderr: '', exitCode: 0, durationMs: 73, diagnostics: [] };

function OutputContextFixture() {
 const [items, setItems] = useState<ContextTrayItem[]>([]);
 const [status, setStatus] = useState('');
 return <section data-fixture-output-context style={{width: 340}}>
  <div style={{height: 220}}><BottomPanel workspaceOpen workspaceVersion={1} messages={[]} run={outputRun} outputFocusToken={1} onDiagnosticClick={() => {}} onStatus={setStatus} commandRequest={null} onTerminalStateChange={() => {}} onAddDiagnostic={() => {}} onAddSelectedOutput={(content, source) => { void createContextTrayItem({ type: 'selected_output', title: `Selected ${source} text`, content, reason: 'Explicitly attached in the fixture.' }).then((item) => setItems((current) => [...current, item])); }} onAddRunFailure={() => {}} onAddTaskFailure={() => {}} hasTaskFailure={false} /></div>
  <p data-fixture-output-status>{status}</p>
  <ContextTray items={items} maximumCharacters={20_000} webContextStatus={{available:false,enabled:false,paired:false,connected:false,pairingCode:null,pairingExpiresAt:null,pairedDevice:null,port:null,message:'Disabled'}} onRemove={() => {}} onClear={() => {}} onMove={() => {}} onRefresh={() => {}} onKeepOriginal={() => {}} onTruncate={() => {}} />
 </section>;
}
function SearchFixture() {
 return <section data-fixture-search style={{width: 340, height: 560}}><SearchPanel active workspaceOpen workspaceVersion={1} focusToken={1} onOpenMatch={(match) => { counters.searchOpen = `${match.relativePath}:${match.line}`; }} /></section>;
}
function SidebarChromeFixture() {
 return <section data-fixture-sidebar-chrome style={{display:'flex',gap:16}}>
  <div style={{width:340,height:360}}><SourceControlPanel active workspaceOpen workspaceVersion={1} refreshToken={0} onOpenDiff={() => {}} /></div>
  <div style={{width:340,height:360}}><DocumentationImpactPanel active workspaceOpen workspaceVersion={1} settings={DEFAULT_LOCAL_SETTINGS} sessionChanges={[]} onOpen={() => {}} onDecision={() => {}} onAddBoth={() => {}} observerEnabled onDraftUpdate={() => {}} /></div>
  <div data-fixture-settings><TopBarSettingsButton onClick={() => {}} /></div>
 </section>;
}
function Fixture() {
 const [manual, setManual] = useState(false);
 const [manualStatus, setManualStatus] = useState<'idle' | 'ready'>('ready');
 const [manualMode, setManualMode] = useState<ObserverMode>('explain');
 const [draft, setDraft] = useState('x = 0');
 const [automaticState, setAutomaticState] = useState<AutomaticRunState>(AUTOMATIC_RUN_OFF);
 const [state, setState] = useState<LiveState>(LIVE_OFF), [review, setReview] = useState(false), [stale, setStale] = useState(false);
 Object.assign(window, { showManual: (nextStatus: 'idle' | 'ready' = 'ready') => { setManualStatus(nextStatus); setManual(true); }, showSuggestion: () => setState({ enabled: true, status: 'ready', message: 'Not tested', request: { provider: 'demo', mode: 'improve_code', kind: 'code', fileName: 'main.py', language: 'python', source: 'cursor', cursorLine: 1, cursorColumn: 1, editBase: { targetRelativePath: 'main.py', originalContentHash: 'a'.repeat(64), contentLength: 5, basedOnUnsavedContent: true } }, suggestion: { explanation: 'Check this value.', snippet: '', reason: 'The nearby expression divides by this value.', edit: { targetRelativePath: 'main.py', originalContentHash: 'a'.repeat(64), editType: 'replace', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, expectedOriginalText: 'x = 0', replacementText: 'x = 1' } } }), setStale,
 liveObserver: { configure: async (enabled: boolean) => { counters.configure++; return { ok: true, value: enabled ? { enabled, status: 'idle', message: 'Waiting for an edit.' } : LIVE_OFF }; }, cancel: () => { counters.dismiss++; setState({ enabled: true, status: 'idle', message: 'Dismissed' }); } },
 automaticRun: { configure: async (enabled: boolean, provider: 'demo') => ({ ok: true, value: enabled ? { enabled, provider, status: 'armed', message: 'Watching failed runs.' } : AUTOMATIC_RUN_OFF }), dismiss: () => {} } });
 if (manual) return <div id="manual-answer"><ObserverPanel automaticRunEnabled={automaticState.enabled} liveObserverCard={<section data-fixture-panel="live">Live Observer fixture</section>} automaticRunCard={<AutomaticRunCard state={automaticState} provider="demo" available onState={setAutomaticState} />} mode={manualMode} modes={CODE_OBSERVER_MODES} provider="demo" status={manualStatus} contextSummary="Fixture" suggestion={manualStatus === 'ready' ? { explanation: 'This code prints the value.', snippet: '', reason: 'Manual Explain', historyWarning: 'This suggestion was not saved to history.' } : null} error={null} copyStatus="idle" canAsk={false} onModeChange={setManualMode} onProviderChange={() => {}} onAsk={() => {}} onCopy={() => {}} onDismiss={() => setManual(false)} onUndo={() => {}} canUndo={false} focusToken={0} explainQuestion="" onExplainQuestionChange={() => {}} multiFileDescription="" onMultiFileDescriptionChange={() => {}} proactiveNudge={null} onProactiveAction={() => {}} onProactiveNotNow={() => {}} onProactiveMute={() => {}} onDisableProactiveAssist={() => {}} usefulnessPrompt={null} onUsefulness={() => {}} contextTrayItems={[]} webContextStatus={{available:false, enabled:false, paired:false, connected:false, pairingCode:null, pairingExpiresAt:null, pairedDevice:null, port:null, message:''}} maximumContextCharacters={6000} onRemoveContextItem={() => {}} onClearContext={() => {}} onMoveContextItem={() => {}} onRefreshContextItem={() => {}} onKeepOriginalContextItem={() => {}} onTruncateContextItem={() => {}} /></div>;
 return <><div className="panel editor-panel" data-fixture-editor style={{height: 300}}><EditorPanelHeader openFileCount={1} /><EditorWorkspace tabs={[{ file: {name: 'main.py', relativePath: 'main.py', content: 'x = 0', modifiedAtMs: 0}, draft, saving: false, saveStatus: null, availability: 'available', externalConflict: null, externalNotice: null }]} activePath="main.py" surface={{status: 'idle'}} liveState={state} onLiveReview={() => { counters.review++; setReview(true); }} onActivate={() => {}} onClose={() => {}} onChange={(_path, content) => { counters.edits++; setDraft(content); }} onSave={() => {}} onRun={() => {}} onStop={() => {}} running={false} focusLocation={null} onReloadExternal={() => {}} onKeepLocal={() => {}} onObserverContextChange={() => {}} onDiagnosticsChange={() => {}} onAddContext={() => {}} markdownViewMode="edit" onMarkdownViewModeChange={() => {}} editorSettings={DEFAULT_LOCAL_SETTINGS.editor} editorTheme="vs" /></div><textarea aria-label="Typing target" defaultValue="keep typing" /><LiveObserverCard state={state} provider="demo" available onState={setState} onReview={() => { counters.review++; setReview(true); }} /><OutputContextFixture /><SearchFixture /><SidebarChromeFixture />
 {review && state.request && state.suggestion && <ObserverEditReview review={{ request: state.request, suggestion: state.suggestion, originalContent: 'x = 0', proposedContent: 'x = 1', contextSummary: 'Live fixture', ...(stale ? { staleMessage: 'File changed after suggestion.' } : {}) }} settings={DEFAULT_LOCAL_SETTINGS.editor} theme="vs" applying={false} onAccept={() => { counters.apply++; setReview(false); }} onReject={() => setReview(false)} onCopy={() => {}} onRegenerate={() => {}} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
