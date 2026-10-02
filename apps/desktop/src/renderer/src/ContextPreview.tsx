import { explanationBudget, estimateExplainTokens } from "../../shared/explanation-budget";
import { explanationScope } from "../../shared/explanation";
import {improveScopeLabel} from "../../shared/improve-code";
import type { ObserverRequest } from "../../shared/observer";
import { removeOptionalContextItem } from "../../shared/project-context";

interface Props {
  request: ObserverRequest;
  onChange: (request: ObserverRequest) => void;
  onCancel: () => void;
  onSend: () => void;
}

const itemLabel = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export default function ContextPreview({ request, onChange, onCancel, onSend }: Props) {
  const context = request.contextPackage;
  if (!context) return null;
  const explain=request.mode === "explain" && request.kind === "code" && !request.automaticRun && !request.liveObserver;
  const budget=explain?explanationBudget(context,undefined,request.provider,request.model):null;
  const unresolved = context.items.filter((item) => item.staleState === "stale" || item.staleState === "unavailable");
  return <div className="dialog-backdrop context-preview-backdrop" role="presentation">
    <section className="context-preview" role="dialog" aria-modal="true" aria-labelledby="context-preview-title" tabIndex={-1}>
      <header><div><h2 id="context-preview-title">Context Preview</h2><p>Review the exact focused package before it leaves this device.</p></div><button type="button" onClick={onCancel} aria-label="Close Context Preview">×</button></header>
      <div className="context-preview-summary"><strong>{context.intent.instruction}</strong><span>{context.items.length} items · {context.totalCharacters.toLocaleString()} characters · {budget ? `${budget.totalTokens.toLocaleString()} conservative estimated tokens including framing + response reserve` : `~${context.estimatedTokens.toLocaleString()} tokens`}</span></div>
      {budget && <p className="context-preview-summary" aria-label="Approved explanation scope">{explanationScope(request)}. Code ceiling {budget.codeLimit.toLocaleString()} chars; context + question {budget.characters.toLocaleString()}/{budget.characterLimit.toLocaleString()} chars; application/model ceiling {budget.tokenLimit.toLocaleString()} tokens, including 6,000 response tokens.</p>}
      {budget?.error && <p role="alert">{budget.error}</p>}
      {request.improveCode && <p className="context-preview-summary" aria-label="Approved improvement scope">{improveScopeLabel(request)}</p>}
      <div className="context-preview-items">
        {context.items.map((item) => <article key={item.id} className="context-item">
          <div className="context-item-heading"><strong>{item.title ?? itemLabel(item.type)}</strong><span>{item.attachmentProvenance === "user_attached" ? "Manually attached" : "Automatic"}</span><span>Priority {item.priority}</span>{item.optional && <button type="button" onClick={() => onChange({ ...request, contextPackage: removeOptionalContextItem(context, item.id) })}>Remove</button>}</div>
          <div className="context-item-source"><code>{item.source.sourceUrl ?? item.source.relativePath ?? "User action"}{item.source.lineStart ? `:${item.source.lineStart}${item.source.lineEnd && item.source.lineEnd !== item.source.lineStart ? `–${item.source.lineEnd}` : ""}` : ""}</code><span>{item.source.provenance.replaceAll("_", " ")}</span></div>
          <p>{item.reason}</p>
          <div className="context-item-flags"><span>{item.estimatedCharacters.toLocaleString()} chars · {budget ? `${estimateExplainTokens(item.content)} conservative estimated tokens` : `~${item.estimatedTokens} tokens`}</span>{item.truncated && <span>Truncated</span>}{item.redacted && <span className="redacted">Secrets redacted</span>}{item.staleState === "stale" && <span className="redacted">Stale — resolve in Context Tray</span>}{item.staleState === "unavailable" && <span className="redacted">Unavailable — remove in Context Tray</span>}{item.staleState === "keep_original" && <span>Original snapshot kept</span>}{item.completeFile && <span>Complete file</span>}{!item.optional && <span>Required</span>}</div>
          <details><summary>Inspect content</summary><pre>{item.content}</pre></details>
        </article>)}
      </div>
      {context.omitted.length > 0 && <details className="context-omitted"><summary>{context.omitted.length} omitted or truncated candidate{context.omitted.length === 1 ? "" : "s"}</summary>{context.omitted.map((item, index) => <p key={`${item.type}-${index}`}><strong>{item.source ?? itemLabel(item.type)}</strong> — {item.reason}</p>)}</details>}
      {unresolved.length > 0 && <p className="context-preview-warning" role="alert">Resolve or remove {unresolved.length} stale/unavailable tray item{unresolved.length === 1 ? "" : "s"} before sending.</p>}
      <footer><span>Limit: {context.limits.maximumTotalCharacters.toLocaleString()} chars · {budget ? `manual Explain code ceiling ${budget.codeLimit.toLocaleString()} chars` : `${context.limits.maximumRelatedFiles} related files · ${context.limits.maximumCharactersPerFile.toLocaleString()} chars/file`}</span><div><button type="button" data-dialog-dismiss onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onSend} disabled={unresolved.length > 0 || Boolean(budget?.error)}>Send to Observer</button></div></footer>
    </section>
  </div>;
}
