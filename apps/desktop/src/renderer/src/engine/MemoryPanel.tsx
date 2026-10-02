import { useEffect, useState } from 'react';
import { observeMemory, memoryStateLabel, type MemoryView } from './memory-view';

export default function MemoryPanel({ workspaceId }: { workspaceId?: string }) {
  const [view, setView] = useState<MemoryView>({ status: null, error: null, loading: true });
  useEffect(() => {
    if (!workspaceId) { setView({ status: null, error: null, loading: false }); return; }
    return observeMemory(window.engine, workspaceId, setView);
  }, [workspaceId]);
  const status = view.status?.workspaceId === workspaceId ? view.status : null;
  return <section aria-labelledby="memory-panel-title" className="memory-panel">
    <h3 id="memory-panel-title">Project memory</h3>
    <p className="settings-description">Local saved-file index. This panel is read-only. Secret files and excluded content are not indexed. No AI request is made by this panel.</p>
    {!workspaceId ? <p>Open a project to view its memory.</p> : view.error ? <p role="alert">{view.error}</p> : view.loading ? <p role="status">Loading memory status…</p> : !status ? <p>No memory database open.</p> : <>
      <p role="status" aria-live="polite">{memoryStateLabel(status)}</p>
      <dl>
        {Object.entries({ 'Files indexed': status.indexedFiles, 'Excluded entries': status.excludedFiles,
          Chunks: status.chunks, Symbols: status.symbols, 'Database bytes': status.databaseBytes,
          'Journal rows': status.journalRows, 'Journal text bytes': status.journalBytes,
          'Web captures': status.webCaptures }).map(([label, value]) => <div className="setting-row" key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}
        <div className="setting-row"><dt>Last scan</dt><dd>{status.lastScanAt === null ? 'Not scanned' : new Date(status.lastScanAt).toLocaleString()}</dd></div>
        <div className="setting-row"><dt>Search</dt><dd>{status.searchMode === 'fts5' ? 'FTS5' : 'Token fallback'}</dd></div>
      </dl>
      {status.overSizeCap && <p role="status">Local memory has reached its configured size warning threshold.</p>}
      <p className="settings-description">Edit journaling and web ingestion are not connected in this phase. Counts reflect the stored database, not continuous capture.</p>
    </>}
  </section>;
}
