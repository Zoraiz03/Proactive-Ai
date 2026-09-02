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

export default function ContextTray({ items, maximumCharacters, webContextStatus, onRemove, onClear, onMove, onRefresh, onKeepOriginal, onTruncate }: Props) {
  const [expanded, setExpanded] = useState(true);
  const total = contextTrayTotal(items);
  return <section className="context-tray" aria-label="Observer Context Tray">
    <header>
      <button type="button" className="context-tray-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span aria-hidden="true">{expanded ? "⌄" : "›"}</span>
        <strong>Context Tray</strong>
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
      </button>
      {items.length > 0 && <button type="button" onClick={onClear}>Clear all</button>}
    </header>
    {expanded && <div className="context-tray-body">
      <div className="chrome-context-pairing">
        <strong>Chrome research</strong>
        <span>{webContextStatus.message}</span>
        {webContextStatus.pairingCode && <code aria-label="Chrome extension pairing code">{webContextStatus.pairingCode}</code>}
        {webContextStatus.port && <small>Local bridge port {webContextStatus.port}. The code changes after pairing.</small>}
      </div>
      <p className={total.characters > maximumCharacters ? "context-tray-budget over" : "context-tray-budget"}>{total.characters.toLocaleString()} / {maximumCharacters.toLocaleString()} chars · ~{total.tokens.toLocaleString()} tokens</p>
      {items.length === 0 ? <div className="context-tray-empty">Nothing attached. Add only the project information you want Observer to review.</div> : <ol>
        {items.map((item, index) => <li key={item.id} className={`context-tray-item ${item.staleState}`}>
          <div className="context-tray-item-heading"><strong>{item.title}</strong><span>{label(item.type)}</span></div>
          <code>{item.webSource?.hostname ?? item.source?.relativePath ?? "User-selected output"}{item.source?.lineStart ? `:${item.source.lineStart}${item.source.lineEnd && item.source.lineEnd !== item.source.lineStart ? `–${item.source.lineEnd}` : ""}` : ""}</code>
          {item.webSource && <details><summary>Source URL</summary><code>{item.webSource.sourceUrl}</code></details>}
          <p>{item.content.slice(0, 180)}{item.content.length > 180 ? "…" : ""}</p>
          <div className="context-tray-flags"><span>{item.estimatedCharacters.toLocaleString()} chars</span>{item.redacted && <span>Redacted</span>}{item.truncated && <span>Truncated</span>}{item.staleState !== "fresh" && <span>{item.staleState.replaceAll("_", " ")}</span>}</div>
          <div className="context-tray-actions">
            <button type="button" onClick={() => onMove(item.id, -1)} disabled={index === 0} aria-label={`Move ${item.title} up`}>↑</button>
            <button type="button" onClick={() => onMove(item.id, 1)} disabled={index === items.length - 1} aria-label={`Move ${item.title} down`}>↓</button>
            {(item.staleState === "stale" || item.staleState === "unavailable") && item.source?.relativePath && <button type="button" onClick={() => onRefresh(item.id)}>Refresh</button>}
            {item.staleState === "stale" && <button type="button" onClick={() => onKeepOriginal(item.id)}>Keep original</button>}
            {item.estimatedCharacters > 1_000 && <button type="button" onClick={() => onTruncate(item.id)}>Truncate</button>}
            <button type="button" onClick={() => onRemove(item.id)}>Remove</button>
          </div>
        </li>)}
      </ol>}
      <small>Local and session-only. Adding context never calls AI.</small>
    </div>}
  </section>;
}
