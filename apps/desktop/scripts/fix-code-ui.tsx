import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import '../src/renderer/src/monaco';
import * as monaco from 'monaco-editor';
import { EditorWorkspace } from '../src/renderer/src/App';
import ObserverPanel, { type ObserverStatus } from '../src/renderer/src/ObserverPanel';
import ContextPreview from '../src/renderer/src/ContextPreview';
import ObserverEditReview, { type ObserverEditReviewState } from '../src/renderer/src/ObserverEditReview';
import FixCodeCard from '../src/renderer/src/FixCodeCard';
import { useFixCode } from '../src/renderer/src/useFixCode';
import { LIVE_OFF } from '../src/shared/live-observer';
import { DEFAULT_LOCAL_SETTINGS } from '../src/shared/settings';
import { sha256Text, validateAndBuildProposedEdit } from '../src/shared/ai-edit';
import type { ObserverRequest } from '../src/shared/observer';
const initial = 'function add(a,b) { return a - b; }\n// unsaved comment preserved';
function Fixture() {
    const [workspace, setWorkspace] = useState('first'), [content, setContent] = useState(initial), [question, setQuestion] = useState(''), [status, setStatus] = useState<ObserverStatus>('idle'), [error, setError] = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<any>(null), [preview, setPreview] = useState<ObserverRequest | null>(null), [review, setReview] = useState<ObserverEditReviewState | null>(null), [applied, setApplied] = useState(false);
    const tabs = [{ file: { name: 'main.js', relativePath: 'main.js', content: initial.split("\n")[0], modifiedAtMs: 0 }, draft: content, saving: false, saveStatus: null, availability: 'available' as const, externalConflict: null, externalNotice: null }];
    const fix = useFixCode(workspace, tabs, setStatus);
    Object.assign(window, { monaco, fixtureState: { content, applied }, setSource: setContent });
    const prepare = async () => { fix.clear(); setReview(null); setError(null); const result = await window.observer.prepare({ provider: 'demo', storeHistory: false, seed: { mode: 'fix_error', kind: 'code', activeRelativePath: 'main.js', fileName: 'main.js', language: 'javascript', content, activeContentDirty: true, cursorLine: snapshot?.cursorLine ?? 1, cursorColumn: snapshot?.cursorColumn ?? 1, selectedCode: snapshot?.selectedCode, selectionRange: snapshot?.selectionRange, userRequest: question, exclusions: [], maximumTotalCharacters: 9000, maximumCharactersPerFile: 6000, maximumRelatedFiles: 0 } }); if (result.ok)
        setPreview(result.value);
    else
        setError(result.error); };
    const reviewCorrection = async () => { if (!fix.result?.suggestion.edit || !fix.request?.editBase)
        return; const v = validateAndBuildProposedEdit(fix.result.suggestion.edit, fix.request.editBase, content, await sha256Text(content)); if (v.ok)
        setReview({ request: fix.request, suggestion: fix.result.suggestion, originalContent: content, proposedContent: v.value.proposedContent, contextSummary: 'Fix Code approved snapshot' }); };
    const apply = async () => { if (!review || fix.stale)
        return; const v = validateAndBuildProposedEdit(review.suggestion.edit, review.request.editBase!, content, await sha256Text(content)); if (!v.ok)
        return; await (window as any).fixture.checkpoint(content, v.value.proposedContent); setContent(v.value.proposedContent); setApplied(true); setReview(null); fix.clear(); };
    return <div style={{ height: '100vh', overflow: 'auto' }}><div style={{ height: 260 }}><EditorWorkspace liveState={LIVE_OFF} onLiveReview={()=>{}} tabs={tabs} activePath="main.js" surface={{ status: 'idle' }} onActivate={() => { }} onClose={() => { }} onChange={(_path, value) => setContent(value)} onSave={() => { }} onRun={() => { }} onStop={() => { }} running={false} focusLocation={null} onReloadExternal={() => { }} onKeepLocal={() => { }} onObserverContextChange={setSnapshot} onDiagnosticsChange={() => { }} onAddContext={() => { }} markdownViewMode="edit" onMarkdownViewModeChange={() => { }} editorSettings={DEFAULT_LOCAL_SETTINGS.editor} editorTheme="vs"/></div>
 <button onClick={() => { setWorkspace('second'); setPreview(null); setReview(null); }}>Switch project</button>
 {applied && <section aria-label="Applied verification"><p>Applied in memory — unverified. Not saved or executed.</p><button onClick={async () => { setContent(await (window as any).fixture.undo(content)); setApplied(false); }}>Undo Fix Code change</button></section>}
 <ObserverPanel mode="fix_error" modes={['fix_error']} provider="demo" status={status} contextSummary={snapshot?.selectedCode ? 'Fix Code selection; surroundings are read-only' : 'Fix Code entire active file including unsaved content'} suggestion={null} error={error} copyStatus="idle" canAsk={!fix.request && !preview && !review} fixProblem={question} onFixProblemChange={setQuestion} onAsk={() => void prepare()} onModeChange={() => { }} onProviderChange={() => { }} onCopy={() => { }} onDismiss={fix.clear} onUndo={() => { }} canUndo={false} focusToken={0} fixCard={fix.request && <FixCodeCard request={fix.request} result={fix.result} busy={fix.busy} error={fix.error} stale={fix.stale} onClarify={fix.clarify} onReview={() => void reviewCorrection()} onClear={fix.clear} onCancel={fix.cancel} onRefresh={() => void prepare()}/>} automaticRunEnabled={false} automaticRunCard={null} multiFileDescription="" onMultiFileDescriptionChange={() => { }} proactiveNudge={null} onProactiveAction={() => { }} onProactiveNotNow={() => { }} onProactiveMute={() => { }} onDisableProactiveAssist={() => { }} usefulnessPrompt={null} onUsefulness={() => { }} contextTrayItems={[]} webContextStatus={{ available: false, enabled: false, paired: false, connected: false, pairingCode: null, pairingExpiresAt: null, pairedDevice: null, port: null, message: 'Disabled' }} maximumContextCharacters={9000} onRemoveContextItem={() => { }} onClearContext={() => { }} onMoveContextItem={() => { }} onRefreshContextItem={() => { }} onKeepOriginalContextItem={() => { }} onTruncateContextItem={() => { }}/>
 {preview && <ContextPreview request={preview} onChange={setPreview} onCancel={() => setPreview(null)} onSend={() => { const approved = preview; setPreview(null); void fix.start(approved, content); }}/>}
 {review && <ObserverEditReview review={{ ...review, ...(fix.stale ? { staleMessage: 'Source changed. Refresh the preview.' } : {}) }} settings={DEFAULT_LOCAL_SETTINGS.editor} theme="vs" applying={false} onAccept={() => void apply()} onReject={() => setReview(null)} onRegenerate={() => void prepare()} onCopy={() => { }}/>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
