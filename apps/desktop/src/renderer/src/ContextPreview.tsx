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
  return <div className="dialog-backdrop context-preview-backdrop" role="presentation">
    <section className="context-preview" role="dialog" aria-modal="true" aria-labelledby="context-preview-title">
      <header><div><h2 id="context-preview-title">Context Preview</h2><p>Review the exact focused package before it leaves this device.</p></div><button type="button" onClick={onCancel} aria-label="Close Context Preview">×</button></header>
      <div className="context-preview-summary"><strong>{context.intent.instruction}</strong><span>{context.items.length} items · {context.totalCharacters.toLocaleString()} characters · ~{context.estimatedTokens.toLocaleString()} tokens</span></div>
      <div className="context-preview-items">
        {context.items.map((item) => <article key={item.id} className="context-item">
          <div className="context-item-heading"><strong>{itemLabel(item.type)}</strong><span>Priority {item.priority}</span>{item.optional && <button type="button" onClick={() => onChange({ ...request, contextPackage: removeOptionalContextItem(context, item.id) })}>Remove</button>}</div>
          <div className="context-item-source"><code>{item.source.relativePath ?? "User action"}{item.source.lineStart ? `:${item.source.lineStart}${item.source.lineEnd && item.source.lineEnd !== item.source.lineStart ? `–${item.source.lineEnd}` : ""}` : ""}</code><span>{item.source.provenance.replaceAll("_", " ")}</span></div>
          <p>{item.reason}</p>
          <div className="context-item-flags"><span>{item.estimatedCharacters.toLocaleString()} chars · ~{item.estimatedTokens} tokens</span>{item.truncated && <span>Truncated</span>}{item.redacted && <span className="redacted">Secrets redacted</span>}{item.completeFile && <span>Complete file</span>}{!item.optional && <span>Required</span>}</div>
          <details><summary>Inspect content</summary><pre>{item.content}</pre></details>
        </article>)}
      </div>
      {context.omitted.length > 0 && <details className="context-omitted"><summary>{context.omitted.length} omitted or truncated candidate{context.omitted.length === 1 ? "" : "s"}</summary>{context.omitted.map((item, index) => <p key={`${item.type}-${index}`}><strong>{item.source ?? itemLabel(item.type)}</strong> — {item.reason}</p>)}</details>}
      <footer><span>Limit: {context.limits.maximumTotalCharacters.toLocaleString()} chars · {context.limits.maximumRelatedFiles} related files · {context.limits.maximumCharactersPerFile.toLocaleString()} chars/file</span><div><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onSend}>Send to Observer</button></div></footer>
    </section>
  </div>;
}
