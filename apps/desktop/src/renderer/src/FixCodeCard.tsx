import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fixScopeLabel, type FixCodeResult } from '../../shared/fix-code';
import type { ObserverRequest } from '../../shared/observer';
export function FixMarkdown({ children }: {
    children: string;
}) { return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt}</span>, pre: ({ children }) => <pre tabIndex={0}>{children}</pre> }}>{children}</ReactMarkdown>; }
export default function FixCodeCard({ request, result, busy, error, stale, onClarify, onReview, onClear, onCancel, onRefresh }: {
    request: ObserverRequest;
    result: FixCodeResult | null;
    busy: boolean;
    error: string;
    stale: boolean;
    onClarify: (answer: string) => Promise<void>;
    onReview: () => void;
    onClear: () => void;
    onCancel: () => void;
    onRefresh?: () => void;
}) {
    const [answer, setAnswer] = useState('');
    const suggestion = result?.suggestion;
    return <section className="observer-suggestion explanation-conversation" aria-label="Fix Code result">
  <strong>Fix Code · {suggestion?.fixOutcome === 'correction' ? 'Correction proposed' : suggestion?.fixOutcome === 'clarification' ? 'Clarification needed' : suggestion?.fixOutcome === 'no_problem' ? 'No clear problem found' : 'Reviewing'}</strong>
  <p>{fixScopeLabel(request)}</p><small>Session only. Code has not been executed or tested by Observer. Clear this review to change mode/provider.</small>
  {stale && <p role="alert">Source changed. This review is stale; preview current code before continuing.</p>}
  {busy && <p role="status">Diagnosing the approved code… <button onClick={onCancel}>Cancel request</button></p>}
  {error && <p role="alert">{error}</p>}
  {suggestion && <><FixMarkdown>{suggestion.explanation}</FixMarkdown>{suggestion.verification && <><strong>How to verify</strong><FixMarkdown>{suggestion.verification}</FixMarkdown></>}
   {suggestion.fixOutcome === 'correction' && <button disabled={stale || busy} onClick={onReview}>Review correction diff</button>}
   {suggestion.fixOutcome === 'clarification' && <form onSubmit={e => { e.preventDefault(); if (answer.trim() && !busy && !stale)
            void onClarify(answer.trim()); }}><p>{suggestion.clarificationQuestion}</p><label>Your clarification<textarea aria-label="Your clarification" value={answer} maxLength={500} onChange={e => setAnswer(e.target.value)}/></label><button disabled={!answer.trim() || busy || stale}>Send clarification</button></form>}
  </>}
  <div className="observer-actions"><button onClick={onClear}>Clear Fix Code review</button>{onRefresh && <button onClick={onRefresh}>Refresh Fix Code preview</button>}</div>
 </section>;
}
