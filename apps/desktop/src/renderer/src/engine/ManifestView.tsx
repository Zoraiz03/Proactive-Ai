import { useEffect, useRef, useState } from 'react';
import type { ContextManifest } from '../../../shared/observer-engine';
import type { ContextSeed } from '../../../shared/engine-context';
import { flushMemoryCapture } from './edit-capture';

export function ManifestView({ manifest }: { manifest: ContextManifest }) {
  return <section aria-label="Context manifest">
    <p>{manifest.totalChars.toLocaleString()} characters · approximately {manifest.estTokens.toLocaleString()} tokens</p>
    <ul>{manifest.blocks.map((block,index)=><li key={`${block.id}-${index}`}>
      <strong>{block.id} · {block.type.replaceAll('_',' ')}</strong>: {block.source}
      {block.lineStart!==undefined && <> (lines {block.lineStart}–{block.lineEnd})</>}
      {' · '}{block.chars.toLocaleString()} characters{block.redacted && ' · redacted'}{block.truncated && ' · truncated'}
      <details><summary>Content hash</summary><code style={{overflowWrap:'anywhere'}}>{block.hash}</code></details>
    </li>)}</ul>
    {manifest.omitted.length>0 && <details><summary>Omitted context ({manifest.omitted.length})</summary>
      <ul>{manifest.omitted.map((item,index)=><li key={index}>{item.id}: {item.reason.replaceAll('_',' ')}</li>)}</ul>
    </details>}
  </section>;
}

export default function MemoryContextPreview({ seed }: { seed?: ContextSeed }) {
  const [manifest,setManifest]=useState<ContextManifest|null>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const generation=useRef(0);
  const diagnostics=JSON.stringify(seed?.diagnostics);
  useEffect(()=>{
    generation.current++; setManifest(null); setError(''); setBusy(false);
    return ()=>{generation.current++;};
  },[seed?.workspaceId,seed?.path,seed?.content,seed?.cursorLine,seed?.cursorColumn,seed?.maximumCharacters,diagnostics]);
  const preview=async()=>{
    if (!seed) return;
    const epoch=++generation.current; setBusy(true); setError(''); setManifest(null);
    flushMemoryCapture();
    try {
      const result=await window.engine.memoryContext(seed);
      if (epoch!==generation.current) return;
      if (result.ok) setManifest(result.value); else setError(result.error);
    } catch { if (epoch===generation.current) setError('Context preview is unavailable.'); }
    finally { if (epoch===generation.current) setBusy(false); }
  };
  return <section aria-label="Local context preview">
    <h4>Context preview</h4>
    <p className="settings-description">Preview context for the active editor. Nothing is sent to an AI provider.</p>
    <button type="button" disabled={!seed||busy} onClick={()=>void preview()}>{busy?'Preparing preview…':'Preview local context'}</button>
    {!seed && <p>Open a file to preview its context.</p>}
    {error && <p role="alert">{error}</p>}
    {manifest && <ManifestView manifest={manifest}/>}
  </section>;
}
