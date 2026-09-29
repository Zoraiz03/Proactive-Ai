import {useState} from 'react';
import {FixMarkdown} from './FixCodeCard';
import {improveScopeLabel} from '../../shared/improve-code';
import type {FixCodeResult} from '../../shared/fix-code';
import type {ObserverRequest} from '../../shared/observer';
export default function ImproveCodeCard({request,result,busy,error,stale,onClarify,onReview,onClear,onCancel,onRefresh,onFix}:{request:ObserverRequest;result:FixCodeResult|null;busy:boolean;error:string;stale:boolean;onClarify:(answer:string)=>Promise<void>;onReview:()=>void;onClear:()=>void;onCancel:()=>void;onRefresh?:()=>void;onFix:()=>void}) {
 const [answer,setAnswer]=useState('');const suggestion=result?.suggestion;
 const title=suggestion?.improveOutcome==='improvement'?'Improvement proposed':suggestion?.improveOutcome==='no_change'?'No worthwhile improvement found':suggestion?.improveOutcome==='clarification'?'Clarification needed':suggestion?.improveOutcome==='correctness_issue'?'Possible correctness issue':'Reviewing';
 return <section className="observer-suggestion explanation-conversation" aria-label="Improve Code result"><strong>Improve Code · {title}</strong><p>{improveScopeLabel(request)}</p><small>Session only. Proposed changes are unverified; no tests or benchmarks were run.</small>
 {stale&&<p role="alert">Source changed. This review is stale; preview current code before continuing.</p>}
 {busy&&<p role="status">Reviewing the approved scope… <button onClick={onCancel}>Cancel request</button></p>}
 {error&&<p role="alert">{error}</p>}
 {suggestion&&<><FixMarkdown>{suggestion.explanation}</FixMarkdown><strong>Trade-offs and assumptions</strong><FixMarkdown>{suggestion.tradeoffs??''}</FixMarkdown><strong>How to check behavior</strong><FixMarkdown>{suggestion.verification??''}</FixMarkdown>
 {suggestion.improveOutcome==='improvement'&&<button disabled={stale||busy} onClick={onReview}>Review improvement diff</button>}
 {suggestion.improveOutcome==='correctness_issue'&&<button disabled={busy||stale} onClick={onFix}>Review separately with Fix Code</button>}
 {suggestion.improveOutcome==='clarification'&&<form onSubmit={e=>{e.preventDefault();if(answer.trim()&&!busy&&!stale)void onClarify(answer.trim());}}><p>{suggestion.clarificationQuestion}</p><label>Your clarification<textarea aria-label="Your improvement clarification" maxLength={500} value={answer} onChange={e=>setAnswer(e.target.value)}/></label><button disabled={!answer.trim()||busy||stale}>Send clarification</button></form>}</>}
 <div className="observer-actions"><button onClick={onClear}>Clear Improve Code review</button>{onRefresh&&<button onClick={onRefresh}>Refresh Improve Code preview</button>}</div></section>;
}
