import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EXPLANATION_LIMITS, explanationScope, type ExplanationResult } from '../../shared/explanation';
import { OBSERVER_PROVIDER_LABELS, type ObserverRequest } from '../../shared/observer';

export default function ExplanationConversation({ request, result, busy, error, stale, onFollowup, onClear, onCancel, onRefresh }: {
 request: ObserverRequest; result: ExplanationResult | null; busy: boolean; error: string; stale: boolean;
 onFollowup: (question: string) => Promise<void>; onClear: () => void; onCancel: () => void; onRefresh?: () => void;
}) {
 const [question, setQuestion] = useState(''), [copy, setCopy] = useState('Copy answer');
 return <section className="observer-suggestion explanation-conversation" aria-label="Explanation conversation">
  <strong>Code explanation</strong><p className="observer-reason">{explanationScope(request)}</p>
  <small>{OBSERVER_PROVIDER_LABELS[request.provider]} · Session only · up to {EXPLANATION_LIMITS.messages} history messages / {EXPLANATION_LIMITS.historyCharacters.toLocaleString()} history characters. Follow-ups reuse only this approved code. Clear the conversation to change mode or provider.</small>
  {stale && <p role="status">Based on an older source snapshot. Your current code has changed or is unavailable.</p>}
  <div className="observer-actions"><button type="button" onClick={onClear}>New explanation / Clear conversation</button>{onRefresh && <button type="button" onClick={onRefresh}>Refresh through context preview</button>}</div>
  {Boolean(result?.omitted) && <p role="status">{result!.omitted} older messages omitted to fit the conversation budget. The approved code snapshot is retained.</p>}
  <div className="explanation-messages" tabIndex={0} aria-label="Conversation messages">
   {result?.messages.map((message, i) => <article key={i} aria-label={message.role === 'user' ? 'Your question' : 'Observer answer'}>
    <strong>{message.role === 'user' ? 'You' : 'Observer'}</strong>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt}</span>, pre: ({ children }) => <pre tabIndex={0}>{children}</pre> }}>{message.content}</ReactMarkdown>
   </article>)}
  </div>
  {result && <button type="button" onClick={async () => { try { const copied = await window.observer.copySnippet(result.suggestion.explanation); setCopy(copied.ok ? 'Copied' : 'Copy failed — try again'); } catch { setCopy('Copy failed — try again'); } }}>{copy}</button>}
  {busy && <p role="status">Waiting for the provider… <button type="button" onClick={onCancel}>Cancel request</button><small> Cancellation stops waiting; a provider may still finish an already-sent request.</small></p>}
  {error && <p role="alert">{error} You can retry a question below or refresh the context.</p>}
  <form onSubmit={event => { event.preventDefault(); if (!busy && question.trim()) void onFollowup(question.trim()); }}>
   <label>Follow-up question<textarea aria-label="Follow-up question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={EXPLANATION_LIMITS.questionCharacters} rows={3} placeholder="Why does this return undefined?" /></label>
   <button type="submit" disabled={busy || !question.trim()}>Ask follow-up</button>
  </form>
 </section>;
}
