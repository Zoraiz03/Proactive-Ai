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
  const unresolved = context.items.filter((item) => item.staleState === "stale" || item.staleState === "unavailable");
  return <div className="dialog-backdrop context-preview-backdrop" role="presentation">
    <section className="context-preview" role="dialog" aria-modal="true" aria-labelledby="context-preview-title" tabIndex={-1}>
      <header className="context-preview-header">
        <div className="context-preview-heading">
          <span className="context-preview-icon" aria-hidden="true">◎</span>
          <div><h2 id="context-preview-title">Context Preview</h2><p>Review exactly what Observer will receive.</p></div>
        </div>
        <button className="context-preview-close" type="button" onClick={onCancel} aria-label="Close Context Preview">×</button>
      </header>
      <div className="context-preview-summary">
        <div className="context-preview-intent"><span>Request</span><strong>{context.intent.instruction}</strong></div>
        <div className="context-preview-metrics" role="group" aria-label="Context package metrics">
          <span><strong>{context.items.length}</strong> items</span>
          <span><strong>{context.totalCharacters.toLocaleString()}</strong> characters</span>
          <span><strong>~{context.estimatedTokens.toLocaleString()}</strong> tokens</span>
        </div>
      </div>
      <div className="context-preview-items">
        {context.items.map((item) => <article key={item.id} className="context-item">
          <div className="context-item-heading">
            <div className="context-item-title">
              <strong>{item.title ?? itemLabel(item.type)}</strong>
              <div className="context-item-source"><code>{item.source.sourceUrl ?? item.source.relativePath ?? "User action"}{item.source.lineStart ? `:${item.source.lineStart}${item.source.lineEnd && item.source.lineEnd !== item.source.lineStart ? `–${item.source.lineEnd}` : ""}` : ""}</code><span>{item.source.provenance.replaceAll("_", " ")}</span></div>
            </div>
            <div className="context-item-badges"><span>{item.attachmentProvenance === "user_attached" ? "Manually attached" : "Automatic"}</span><span>Priority {item.priority}</span>{item.optional && <button type="button" onClick={() => onChange({ ...request, contextPackage: removeOptionalContextItem(context, item.id) })}>Remove</button>}</div>
          </div>
          <p className="context-item-reason">{item.reason}</p>
          <div className="context-item-flags"><span>{item.estimatedCharacters.toLocaleString()} chars · ~{item.estimatedTokens} tokens</span>{item.truncated && <span>Truncated</span>}{item.redacted && <span className="redacted">Secrets redacted</span>}{item.staleState === "stale" && <span className="redacted">Stale — resolve in Context Tray</span>}{item.staleState === "unavailable" && <span className="redacted">Unavailable — remove in Context Tray</span>}{item.staleState === "keep_original" && <span>Original snapshot kept</span>}{item.completeFile && <span>Complete file</span>}{!item.optional && <span>Required</span>}</div>
          <details><summary>Inspect content</summary><pre>{item.content}</pre></details>
        </article>)}
      </div>
      {context.omitted.length > 0 && <details className="context-omitted"><summary>{context.omitted.length} omitted or truncated candidate{context.omitted.length === 1 ? "" : "s"}</summary>{context.omitted.map((item, index) => <p key={`${item.type}-${index}`}><strong>{item.source ?? itemLabel(item.type)}</strong> — {item.reason}</p>)}</details>}
      {unresolved.length > 0 && <p className="context-preview-warning" role="alert">Resolve or remove {unresolved.length} stale/unavailable tray item{unresolved.length === 1 ? "" : "s"} before sending.</p>}
      <footer className="context-preview-footer"><span className="context-preview-limit">Limit: {context.limits.maximumTotalCharacters.toLocaleString()} chars · {context.limits.maximumRelatedFiles} related files · {context.limits.maximumCharactersPerFile.toLocaleString()} chars/file</span><div className="context-preview-actions"><button type="button" data-dialog-dismiss onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onSend} disabled={unresolved.length > 0}>Send to Observer</button></div></footer>
    </section>
  </div>;
}
