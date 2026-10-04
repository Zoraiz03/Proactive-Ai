import { useState } from "react";
import { contextTrayTotal, type ContextTrayItem } from "../../shared/context-tray";
import type { WebContextBridgeStatus } from "../../shared/web-context-bridge";

interface Props {
  items: readonly ContextTrayItem[];
  maximumCharacters: number;
  webContextStatus: WebContextBridgeStatus;
  onRemove: (id: string) => void;
  onClear: () => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRefresh: (id: string) => void;
  onKeepOriginal: (id: string) => void;
  onTruncate: (id: string) => void;
}

const label = (type: string) => type.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());

function bridgePresentation(status: WebContextBridgeStatus): { label: string; tone: string } {
  if (status.connected) return { label: "Connected", tone: "connected" };
  if (status.paired) return { label: "Paired", tone: "paired" };
  if (!status.available || /denied|error|failed|unavailable/i.test(status.message)) return { label: "Unavailable", tone: "error" };
  if (status.enabled) return { label: "Waiting", tone: "waiting" };
  return { label: "Off", tone: "disabled" };
}

export default function ContextTray({ items, maximumCharacters, webContextStatus, onRemove, onClear, onMove, onRefresh, onKeepOriginal, onTruncate }: Props) {
  const [expanded, setExpanded] = useState(true);
  const total = contextTrayTotal(items);
  const bridge = bridgePresentation(webContextStatus);
  const budgetPercentage = maximumCharacters > 0 ? Math.min(100, (total.characters / maximumCharacters) * 100) : 0;
  return <section className={expanded ? "context-tray expanded" : "context-tray"} aria-label="Observer Context Tray">
    <header>
      <button type="button" className="context-tray-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="context-tray-chevron" aria-hidden="true">›</span>
        <span className="context-tray-title">
          <strong>Context Tray</strong>
          <span>Sources sent with your next request</span>
        </span>
        <span className="context-tray-count">{items.length}</span>
      </button>
      {items.length > 0 && <button type="button" className="context-tray-clear" onClick={onClear}>Clear all</button>}
    </header>
    {expanded && <div className="context-tray-body">
      <div className={`chrome-context-pairing chrome-context-${bridge.tone}`}>
        <div className="chrome-context-heading">
          <div className="chrome-context-copy"><strong>Browser extension</strong><span title={webContextStatus.message}>{webContextStatus.message}</span></div>
          <span className="chrome-context-status"><span aria-hidden="true" />{bridge.label}</span>
        </div>
      </div>
      <div className={total.characters > maximumCharacters ? "context-tray-budget over" : "context-tray-budget"}>
        <div className="context-tray-budget-heading"><span>Request usage</span><strong>{total.characters.toLocaleString()} / {maximumCharacters.toLocaleString()} chars</strong></div>
        <div className="context-tray-budget-meter" role="progressbar" aria-label="Context character usage" aria-valuemin={0} aria-valuemax={maximumCharacters} aria-valuenow={total.characters}><span style={{ width: `${budgetPercentage}%` }} /></div>
        <small>About {total.tokens.toLocaleString()} tokens · {budgetPercentage < 1 && budgetPercentage > 0 ? "<1" : Math.round(budgetPercentage)}% used</small>
      </div>
      {items.length === 0 ? <div className="context-tray-empty"><strong>No context attached</strong><span>Add only the project information you want Observer to review.</span></div> : <ol>
        {items.map((item, index) => <li key={item.id} className={`context-tray-item ${item.staleState}`}>
          <div className="context-tray-item-heading">
            <div><strong>{item.title}</strong><code>{item.webSource?.hostname ?? item.source?.relativePath ?? "User-selected output"}{item.source?.lineStart ? `:${item.source.lineStart}${item.source.lineEnd && item.source.lineEnd !== item.source.lineStart ? `–${item.source.lineEnd}` : ""}` : ""}</code></div>
            <span>{item.provenance === "documentation_relationship" ? "Documentation relationship" : label(item.type)}</span>
          </div>
          {item.webSource && <details className="context-tray-source"><summary>Source URL</summary><code>{item.webSource.sourceUrl}</code></details>}
          <p className="context-tray-preview">{item.content.slice(0, 180)}{item.content.length > 180 ? "…" : ""}</p>
          <div className="context-tray-item-footer">
            <div className="context-tray-flags"><span>{item.estimatedCharacters.toLocaleString()} chars</span>{item.redacted && <span>Redacted</span>}{item.truncated && <span>Truncated</span>}{item.staleState !== "fresh" && <span className="warning">{item.staleState.replaceAll("_", " ")}</span>}</div>
            <div className="context-tray-actions">
              <button type="button" className="context-tray-move" onClick={() => onMove(item.id, -1)} disabled={index === 0} aria-label={`Move ${item.title} up`} title="Move up">↑</button>
              <button type="button" className="context-tray-move" onClick={() => onMove(item.id, 1)} disabled={index === items.length - 1} aria-label={`Move ${item.title} down`} title="Move down">↓</button>
              {(item.staleState === "stale" || item.staleState === "unavailable") && item.source?.relativePath && <button type="button" onClick={() => onRefresh(item.id)}>Refresh</button>}
              {item.staleState === "stale" && <button type="button" onClick={() => onKeepOriginal(item.id)}>Keep original</button>}
              {item.estimatedCharacters > 1_000 && <button type="button" onClick={() => onTruncate(item.id)}>Truncate</button>}
              <button type="button" className="context-tray-remove" onClick={() => onRemove(item.id)}>Remove</button>
            </div>
          </div>
        </li>)}
      </ol>}
      <small className="context-tray-privacy"><span aria-hidden="true">●</span>Local and session-only · Adding context never calls AI</small>
    </div>}
  </section>;
}
