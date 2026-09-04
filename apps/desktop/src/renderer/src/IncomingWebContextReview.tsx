import { useState } from "react";
import type { IncomingWebContext } from "../../shared/web-context-bridge";

export default function IncomingWebContextReview({ item, canAdd, onAdd, onReject }: { item: IncomingWebContext; canAdd: boolean; onAdd: () => void; onReject: () => void }) {
  const [full, setFull] = useState(false);
  return <aside className="incoming-web-context" aria-label="Incoming browser context" aria-live="polite">
    <header><strong>Incoming browser selection</strong><span>{item.queueDepth} waiting</span></header>
    <b>{item.sourceTitle}</b><code>{item.hostname}</code><small>{item.sourceUrl}</small>
    <p>{full ? item.selectedText : `${item.selectedText.slice(0, 320)}${item.selectedText.length > 320 ? "…" : ""}`}</p>
    <div className="context-tray-flags"><span>{item.characterCount.toLocaleString()} chars</span>{item.userEdited && <span>Edited</span>}{item.redacted && <span>Redacted</span>}{item.truncated && <span>Truncated</span>}</div>
    <div className="settings-actions"><button className="primary" type="button" disabled={!canAdd} title={canAdd ? "" : "Remove or truncate tray context first."} onClick={onAdd}>Add to Context Tray</button><button type="button" onClick={onReject}>Reject</button><button type="button" onClick={() => setFull((value) => !value)}>{full ? "Collapse" : "View Full"}</button></div>
    <small>Untrusted webpage text. Adding it does not call AI; Context Preview still applies before any AI request.</small>
  </aside>;
}
