function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="panel-title">{children}</h2>;
}

function Placeholder({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="placeholder">
      <span className="placeholder-icon" aria-hidden="true">
        {icon}
      </span>
      <p>{children}</p>
    </div>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-mark" aria-hidden="true">
          P
        </div>
        <h1>Proactive AI IDE</h1>
        <span className="phase-label">Desktop shell</span>
      </header>

      <div className="ide-layout">
        <aside className="panel explorer-panel">
          <PanelTitle>Explorer</PanelTitle>
          <Placeholder icon="◇">Project files will appear here.</Placeholder>
        </aside>

        <main className="panel editor-panel">
          <PanelTitle>Editor</PanelTitle>
          <Placeholder icon="⌘">Open files will appear here.</Placeholder>
        </main>

        <aside className="panel observer-panel">
          <PanelTitle>Observer</PanelTitle>
          <div className="observer-content">
            <div className="observer-orb" aria-hidden="true" />
            <p>AI assistance will be added in a later phase.</p>
            <button type="button" disabled>
              Ask Observer
            </button>
          </div>
        </aside>

        <section className="panel output-panel">
          <PanelTitle>Output</PanelTitle>
          <div className="output-line">
            <span aria-hidden="true">›</span> Output and diagnostics will appear here.
          </div>
        </section>
      </div>

      <footer className="status-bar">
        <span>Phase 1</span>
        <span>Secure shell ready</span>
      </footer>
    </div>
  );
}
