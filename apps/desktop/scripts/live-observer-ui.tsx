// Electron-only deterministic UI fixture. No auth, network provider, or workspace writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import '../src/renderer/src/monaco';
import { EditorWorkspace } from '../src/renderer/src/App';
import * as monaco from 'monaco-editor';
import LiveObserverCard from '../src/renderer/src/LiveObserverCard';
import ObserverPanel from '../src/renderer/src/ObserverPanel';
import ObserverEditReview from '../src/renderer/src/ObserverEditReview';
import { DEFAULT_LOCAL_SETTINGS } from '../src/shared/settings';
import { LIVE_OFF, type LiveState } from '../src/shared/live-observer';
const counters = { configure: 0, review: 0, apply: 0, dismiss: 0, edits: 0 };
Object.assign(window, { counters, monaco });
function Fixture() {
 const [manual, setManual] = useState(false);
 const [draft, setDraft] = useState('x = 0');
 const [state, setState] = useState<LiveState>(LIVE_OFF), [review, setReview] = useState(false), [stale, setStale] = useState(false);
 Object.assign(window, { showManual: () => setManual(true), showSuggestion: () => setState({ enabled: true, status: 'ready', message: 'Not tested', request: { provider: 'demo', mode: 'improve_code', kind: 'code', fileName: 'main.py', language: 'python', source: 'cursor', cursorLine: 1, cursorColumn: 1, editBase: { targetRelativePath: 'main.py', originalContentHash: 'a'.repeat(64), contentLength: 5, basedOnUnsavedContent: true } }, suggestion: { explanation: 'Check this value.', snippet: '', reason: 'The nearby expression divides by this value.', edit: { targetRelativePath: 'main.py', originalContentHash: 'a'.repeat(64), editType: 'replace', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, expectedOriginalText: 'x = 0', replacementText: 'x = 1' } } }), setStale,
 liveObserver: { configure: async (enabled: boolean) => { counters.configure++; return { ok: true, value: enabled ? { enabled, status: 'idle', message: 'Waiting for an edit.' } : LIVE_OFF }; }, cancel: () => { counters.dismiss++; setState({ enabled: true, status: 'idle', message: 'Dismissed' }); } } });
 if (manual) return <div id="manual-answer"><ObserverPanel automaticRunEnabled={false} automaticRunCard={null} mode="explain" modes={['explain']} provider="demo" status="ready" contextSummary="Fixture" suggestion={{ explanation: 'This code prints the value.', snippet: '', reason: 'Manual Explain', historyWarning: 'This suggestion was not saved to history.' }} error={null} copyStatus="idle" canAsk={false} onModeChange={() => {}} onProviderChange={() => {}} onAsk={() => {}} onCopy={() => {}} onDismiss={() => setManual(false)} onUndo={() => {}} canUndo={false} focusToken={0} multiFileDescription="" onMultiFileDescriptionChange={() => {}} proactiveNudge={null} onProactiveAction={() => {}} onProactiveNotNow={() => {}} onProactiveMute={() => {}} onDisableProactiveAssist={() => {}} usefulnessPrompt={null} onUsefulness={() => {}} contextTrayItems={[]} webContextStatus={{available:false, enabled:false, paired:false, connected:false, pairingCode:null, pairingExpiresAt:null, pairedDevice:null, port:null, message:''}} maximumContextCharacters={6000} onRemoveContextItem={() => {}} onClearContext={() => {}} onMoveContextItem={() => {}} onRefreshContextItem={() => {}} onKeepOriginalContextItem={() => {}} onTruncateContextItem={() => {}} /></div>;
 return <><div style={{height: 300}}><EditorWorkspace tabs={[{ file: {name: 'main.py', relativePath: 'main.py', content: 'x = 0', modifiedAtMs: 0}, draft, saving: false, saveStatus: null, availability: 'available', externalConflict: null, externalNotice: null }]} activePath="main.py" surface={{status: 'idle'}} liveState={state} onLiveReview={() => { counters.review++; setReview(true); }} onActivate={() => {}} onClose={() => {}} onChange={(_path, content) => { counters.edits++; setDraft(content); }} onSave={() => {}} onRun={() => {}} onStop={() => {}} running={false} focusLocation={null} onReloadExternal={() => {}} onKeepLocal={() => {}} onObserverContextChange={() => {}} onDiagnosticsChange={() => {}} onAddContext={() => {}} markdownViewMode="edit" onMarkdownViewModeChange={() => {}} editorSettings={DEFAULT_LOCAL_SETTINGS.editor} editorTheme="vs" /></div><textarea aria-label="Typing target" defaultValue="keep typing" /><LiveObserverCard state={state} provider="demo" available onState={setState} onReview={() => { counters.review++; setReview(true); }} />
 {review && state.request && state.suggestion && <ObserverEditReview review={{ request: state.request, suggestion: state.suggestion, originalContent: 'x = 0', proposedContent: 'x = 1', contextSummary: 'Live fixture', ...(stale ? { staleMessage: 'File changed after suggestion.' } : {}) }} settings={DEFAULT_LOCAL_SETTINGS.editor} theme="vs" applying={false} onAccept={() => { counters.apply++; setReview(false); }} onReject={() => setReview(false)} onCopy={() => {}} onRegenerate={() => {}} />}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
