import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/renderer/src/theme.css';
import '../src/renderer/src/styles.css';
import '../src/renderer/src/monaco';
import * as monaco from 'monaco-editor';
import { EditorWorkspace } from '../src/renderer/src/App';
import LiveObserverCard from '../src/renderer/src/LiveObserverCard';
import ContextPreview from '../src/renderer/src/ContextPreview';
import { DEFAULT_LOCAL_SETTINGS } from '../src/shared/settings';
import { LIVE_OFF, type LiveState } from '../src/shared/live-observer';
import type { ObserverRequest } from '../src/shared/observer';
Object.assign(window, { monaco });
function Fixture() {
 const [draft, setDraft] = useState('x = 0'), [state, setState] = useState<LiveState>(LIVE_OFF);
 const [preview, setPreview] = useState<ObserverRequest | null>(null);
 useEffect(() => window.liveObserver.onState(setState), []);
 return <><div style={{height: 300}}><EditorWorkspace
  tabs={[{file:{name:'main.py',relativePath:'main.py',content:'x = 0',modifiedAtMs:0},draft,saving:false,saveStatus:null,availability:'available',externalConflict:null,externalNotice:null}]}
  activePath="main.py" surface={{status:'idle'}} liveState={state} onLiveReview={() => {}}
  onLiveEdit={edit => window.liveObserver.edit(edit)}
  onActivate={() => {}} onClose={() => {}} onChange={(_path, content) => setDraft(content)}
  onSave={() => {}} onRun={() => {}} onStop={() => {}} running={false} focusLocation={null}
  onReloadExternal={() => {}} onKeepLocal={() => {}} onObserverContextChange={() => {}} onDiagnosticsChange={() => {}}
  onAddContext={() => {}} markdownViewMode="edit" onMarkdownViewModeChange={() => {}}
  editorSettings={DEFAULT_LOCAL_SETTINGS.editor} editorTheme="proactive-cream" /></div>
  <LiveObserverCard state={state} provider="demo" available onState={setState} onReview={() => {}} canAsk={!preview}
   onAsk={async () => { window.liveObserver.cancel(); const result = await window.observer.prepare({ provider:'demo', seed:{ mode:'explain', kind:'code', activeRelativePath:'main.py', fileName:'main.py', language:'python', content:draft, cursorLine:1, cursorColumn:1, exclusions:[], maximumTotalCharacters:6000, maximumRelatedFiles:1, maximumCharactersPerFile:6000 } }); if(result.ok) setPreview(result.value); }} />
  {preview && <ContextPreview request={preview} onChange={setPreview} onCancel={() => setPreview(null)} onSend={() => { void window.observer.ask(preview); }} />}
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
