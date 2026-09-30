import { useEffect, useState } from 'react';
import type { ObserverPrepareRequest } from '../../shared/observer';
import type { ProjectContextSeed } from '../../shared/project-context';
import type { TextRange } from '../../shared/ai-edit';
export default function ExplainScopePicker({request,value,onChange,disabled}:{request:ObserverPrepareRequest|null;value:NonNullable<ProjectContextSeed['explainScope']>;onChange:(value:NonNullable<ProjectContextSeed['explainScope']>)=>void;disabled:boolean}) {
 const [detected,setDetected]=useState<{request:ObserverPrepareRequest;range:TextRange|null;reason:string}|null>(null);
 useEffect(()=>{
  if(!request)return;
  let current=true;
  const timer=setTimeout(()=>{void window.observer.explainScopes(request).then(result=>{
   if(current)setDetected({request,range:result.ok?result.value.range:null,reason:result.ok?result.value.reason:result.error});
  }).catch(()=>{if(current)setDetected({request,range:null,reason:'Function detection unavailable. Select code or choose Entire active file.'});});},200);
  return ()=>{current=false;clearTimeout(timer);};
 },[request]);
 const seed=request?.seed, found=detected?.request===request?detected:null;
 const selection=seed?.selectionRange;
 const selected=Boolean(seed?.selectedCode);
 const reason=!selected?'Select text in the editor to enable Selected code.':'';
 const functionReason=!request ? 'Open a permitted code file and enable Observer to choose a scope.' : found?.reason ?? 'Checking function boundaries locally…';
 const range=value==='selection'?selection:value==='function'?found?.range:seed?{start:{line:1,column:1},end:{line:seed.content.split('\n').length,column:(seed.content.split('\n').at(-1)?.length??0)+1}}:null;
 return <div className="observer-multi-file-request">
  <label><span>Explanation scope</span><select aria-label="Explanation scope" value={value} disabled={disabled||!request} onChange={e=>onChange(e.target.value as NonNullable<ProjectContextSeed['explainScope']>)}>
   <option value="selection" disabled={!selected}>Selected code{!selected?' — select text first':''}</option>
   <option value="function" disabled={!found?.range}>Current function{!found?.range?' — unavailable':''}</option>
   <option value="file" disabled={!seed?.content.trim()}>Entire active file</option>
  </select></label>
  <small aria-live="polite">{range?`${seed?.activeRelativePath} · ${range.start.line}:${range.start.column}–${range.end.line}:${range.end.column} · current buffer, including unsaved changes`:'Choose an available scope.'}</small>
  {seed && !seed.content.trim() && <small>Entire active file is unavailable because the buffer is empty.</small>}
  {!selected&&<small>{reason}</small>}{!found?.range&&<small>{functionReason}</small>}
  <small>Preview the exact scope before sending. No automatic fallback or truncation. Context Tray and other files are not included.</small>
 </div>;
}
