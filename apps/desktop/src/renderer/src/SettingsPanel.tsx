import { useEffect, useMemo, useState } from "react";
import { OBSERVER_MODE_LABELS, OBSERVER_PROVIDER_LABELS, type ObserverProvider } from "../../shared/observer";
import {
  DEFAULT_LOCAL_SETTINGS,
  MANDATORY_SECRET_EXCLUSIONS,
  PROVIDER_MODELS,
  type LocalSettings,
  type ProviderStatus,
  type SyncedSettings,
} from "../../shared/settings";

const sections = ["General", "Editor", "AI Models", "API Keys", "Observer", "Privacy", "Data and History"] as const;
type Section = typeof sections[number];

interface Props {
  open: boolean;
  local: LocalSettings;
  synced: SyncedSettings;
  providers: ProviderStatus[];
  onClose: () => void;
  onSaveLocal: (settings: LocalSettings) => Promise<string | null>;
  onSaveSynced: (settings: SyncedSettings) => Promise<string | null>;
  onSaveKey: (provider: Exclude<ObserverProvider, "demo">, apiKey: string, verify: boolean) => Promise<string | null>;
  onDeleteKey: (provider: Exclude<ObserverProvider, "demo">) => Promise<string | null>;
  onResetLocal: () => Promise<string | null>;
  onClearRecents: () => Promise<string | null>;
  onClearHistory: () => Promise<string | null>;
  onSignOut: () => void;
}

const Toggle = ({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
  <label className="setting-row toggle-row"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>
);

export default function SettingsPanel(props: Props) {
  const [active, setActive] = useState<Section>("General");
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState(props.local);
  const [synced, setSynced] = useState(props.synced);
  const [message, setMessage] = useState<string | null>(null);
  const [keys, setKeys] = useState<Partial<Record<ObserverProvider, string>>>({});
  const [verify, setVerify] = useState(true);
  useEffect(() => setLocal(props.local), [props.local]);
  useEffect(() => setSynced(props.synced), [props.synced]);
  useEffect(() => {
    if (!props.open) return;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [props.open, props.onClose]);
  const visibleSections = useMemo(() => sections.filter((section) => section.toLowerCase().includes(query.toLowerCase()) || !query), [query]);
  if (!props.open) return null;

  const saveLocal = async () => setMessage(await props.onSaveLocal(local) ?? "Local settings saved.");
  const saveSynced = async () => setMessage(await props.onSaveSynced(synced) ?? "Synced settings saved.");
  const destructive = async (prompt: string, action: () => Promise<string | null>, success: string) => {
    if (!window.confirm(prompt)) return;
    setMessage(await action() ?? success);
  };
  return <div className="settings-backdrop" role="presentation">
    <section className="settings-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><div><h2 id="settings-title">Settings and Privacy</h2><p>Device preferences, synced Observer choices, and secure provider access.</p></div><button type="button" aria-label="Close settings" onClick={props.onClose}>×</button></header>
      <div className="settings-body">
        <nav aria-label="Settings sections">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter settings" aria-label="Filter settings" autoFocus />
          {visibleSections.map((section) => <button key={section} className={active === section ? "active" : ""} onClick={() => setActive(section)}>{section}</button>)}
        </nav>
        <main>
          <div className="storage-badge">{["General", "Editor"].includes(active) ? "Stored on this device" : "Stored per account in Supabase, except local exclusions"}</div>
          {active === "General" && <>
            <h3>General</h3>
            <label className="setting-row"><span>Theme</span><select value={local.theme} onChange={(e) => setLocal({ ...local, theme: e.target.value as LocalSettings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <label className="setting-row"><span>Startup behavior</span><select value={local.startupBehavior} onChange={(e) => setLocal({ ...local, startupBehavior: e.target.value as LocalSettings["startupBehavior"] })}><option value="welcome">Show Welcome screen</option><option value="reopen_last">Reopen last project</option></select></label>
            <Toggle label="Confirm before deleting files" checked={local.confirmBeforeDelete} onChange={(value) => setLocal({ ...local, confirmBeforeDelete: value })} />
            <Toggle label="Restore open tabs when reopening a project" checked={local.restoreOpenTabs} onChange={(value) => setLocal({ ...local, restoreOpenTabs: value })} />
            <button className="primary" onClick={() => void saveLocal()}>Save local settings</button>
          </>}
          {active === "Editor" && <>
            <h3>Editor</h3>
            <label className="setting-row"><span>Font size</span><input type="number" min="10" max="28" value={local.editor.fontSize} onChange={(e) => setLocal({ ...local, editor: { ...local.editor, fontSize: Number(e.target.value) } })} /></label>
            <label className="setting-row"><span>Tab size</span><input type="number" min="1" max="8" value={local.editor.tabSize} onChange={(e) => setLocal({ ...local, editor: { ...local.editor, tabSize: Number(e.target.value) } })} /></label>
            <Toggle label="Word wrap" checked={local.editor.wordWrap} onChange={(value) => setLocal({ ...local, editor: { ...local.editor, wordWrap: value } })} />
            <Toggle label="Minimap" checked={local.editor.minimap} onChange={(value) => setLocal({ ...local, editor: { ...local.editor, minimap: value } })} />
            <label className="setting-row"><span>Auto-save</span><select value={local.editor.autoSave} onChange={(e) => setLocal({ ...local, editor: { ...local.editor, autoSave: e.target.value as LocalSettings["editor"]["autoSave"] } })}><option value="off">Off</option><option value="after_delay">After delay</option></select></label>
            {local.editor.autoSave === "after_delay" && <label className="setting-row"><span>Auto-save delay (ms)</span><input type="number" min="250" max="30000" value={local.editor.autoSaveDelayMs} onChange={(e) => setLocal({ ...local, editor: { ...local.editor, autoSaveDelayMs: Number(e.target.value) } })} /></label>}
            <div className="settings-actions"><button className="primary" onClick={() => void saveLocal()}>Apply editor settings</button><button onClick={() => setLocal({ ...local, editor: { ...DEFAULT_LOCAL_SETTINGS.editor } })}>Reset editor defaults</button></div>
          </>}
          {active === "AI Models" && <>
            <h3>AI Models</h3><p>Availability is reported by the server. Key values never return to this app.</p>
            {props.providers.map((provider) => <div className="provider-card" key={provider.provider}><strong>{provider.label}</strong><span>{provider.systemProvided ? "System key available" : "No system key"} · {provider.userKeyConfigured ? "User key configured" : "No user key"} · {provider.available ? "Available" : "Unavailable"}</span></div>)}
            <label className="setting-row"><span>Default provider</span><select value={synced.preferredProvider} onChange={(e) => { const provider = e.target.value as ObserverProvider; setSynced({ ...synced, preferredProvider: provider, preferredModel: PROVIDER_MODELS[provider][0] }); }}>{props.providers.map((p) => <option key={p.provider} value={p.provider} disabled={!p.available}>{OBSERVER_PROVIDER_LABELS[p.provider]}</option>)}</select></label>
            <label className="setting-row"><span>Default model</span><select value={synced.preferredModel} onChange={(e) => setSynced({ ...synced, preferredModel: e.target.value })}>{PROVIDER_MODELS[synced.preferredProvider].map((model) => <option key={model}>{model}</option>)}</select></label>
            <button className="primary" onClick={() => void saveSynced()}>Save model preference</button>
          </>}
          {active === "API Keys" && <>
            <h3>API Keys</h3><p>Keys are encrypted and used only by the server. Stored values cannot be read back.</p>
            <Toggle label="Verify key before saving" checked={verify} onChange={setVerify} />
            {props.providers.filter((p) => p.provider !== "demo").map((provider) => <div className="api-key-row" key={provider.provider}>
              <div><strong>{provider.label}</strong><small>{provider.userKeyConfigured ? "User key configured" : "No user key saved"}</small></div>
              <input type="password" autoComplete="off" value={keys[provider.provider] ?? ""} placeholder="Enter replacement key" onChange={(e) => setKeys({ ...keys, [provider.provider]: e.target.value })} />
              <button className="primary" onClick={async () => { const value = keys[provider.provider]?.trim(); if (!value) return; const error = await props.onSaveKey(provider.provider as Exclude<ObserverProvider, "demo">, value, verify); if (!error) setKeys((current) => ({ ...current, [provider.provider]: "" })); setMessage(error ?? "Key saved. Input cleared."); }}>Save</button>
              <button onClick={() => void destructive(`Delete your ${provider.label} API key?`, () => props.onDeleteKey(provider.provider as Exclude<ObserverProvider, "demo">), "Key deleted.")}>Delete</button>
            </div>)}
          </>}
          {active === "Observer" && <>
            <h3>Observer</h3>
            <Toggle label="Observer enabled" checked={synced.observerEnabled} onChange={(value) => setSynced({ ...synced, observerEnabled: value })} />
            <label className="setting-row"><span>Preferred manual action</span><select value={synced.defaultObserverAction} onChange={(e) => setSynced({ ...synced, defaultObserverAction: e.target.value as SyncedSettings["defaultObserverAction"] })}>{(["explain", "fix_error", "improve_code", "continue_code", "generate_tests"] as const).map((mode) => <option key={mode} value={mode}>{OBSERVER_MODE_LABELS[mode]}</option>)}</select></label>
            <Toggle label="Show context preview before sending" checked={synced.showContextPreview} onChange={(value) => setSynced({ ...synced, showContextPreview: value })} />
            <Toggle label="Include diagnostics when relevant" checked={synced.includeDiagnostics} onChange={(value) => setSynced({ ...synced, includeDiagnostics: value })} />
            <Toggle label="Include terminal error output when relevant" checked={synced.includeTerminalError} onChange={(value) => setSynced({ ...synced, includeTerminalError: value })} />
            <Toggle label="Assist Mode — Coming in a later phase" checked={false} onChange={() => undefined} disabled />
            <button className="primary" onClick={() => void saveSynced()}>Save Observer settings</button>
          </>}
          {active === "Privacy" && <>
            <h3>Privacy</h3><p>Local project files are never uploaded automatically. Observer sends focused context only after you ask.</p>
            <Toggle label="Never send .env files" checked disabled onChange={() => undefined} />
            <Toggle label="Never send credentials, private keys, tokens, or secret files" checked disabled onChange={() => undefined} />
            <div className="mandatory-exclusions"><strong>Permanent secret exclusions</strong><code>{MANDATORY_SECRET_EXCLUSIONS.join(", ")}</code></div>
            <label className="setting-column"><span>Additional files/folders excluded from AI context (one per line)</span><textarea value={local.aiContextExclusions.join("\n")} onChange={(e) => setLocal({ ...local, aiContextExclusions: e.target.value.split(/\r?\n/).filter(Boolean) })} /></label>
            <label className="setting-row"><span>Maximum context size (characters)</span><input type="number" min="1000" max="50000" value={synced.maximumContextChars} onChange={(e) => setSynced({ ...synced, maximumContextChars: Number(e.target.value) })} /></label>
            <Toggle label="Require confirmation before attaching a complete file" checked={synced.confirmCompleteFile} onChange={(value) => setSynced({ ...synced, confirmCompleteFile: value })} />
            <Toggle label="Store suggestion history" checked={synced.storeSuggestionHistory} onChange={(value) => setSynced({ ...synced, storeSuggestionHistory: value })} />
            <div className="settings-actions"><button className="primary" onClick={() => void saveSynced()}>Save privacy settings</button><button onClick={() => void saveLocal()}>Save local exclusions</button></div>
          </>}
          {active === "Data and History" && <>
            <h3>Data and History</h3><p>Theme, editor choices, exclusions, and recent project paths are local. Provider preferences and Observer history choices are stored in Supabase. Account deletion is not available yet.</p>
            <div className="danger-actions"><button onClick={() => void destructive("Reset all local settings to defaults?", props.onResetLocal, "Local settings reset.")}>Reset local settings</button><button onClick={() => void destructive("Clear recent-project history from this device?", props.onClearRecents, "Recent projects cleared.")}>Clear recent-project history</button><button onClick={() => void destructive("Clear local Observer/context history from this device? This does not delete existing Supabase suggestion records.", props.onClearHistory, "Local Observer/context history cleared.")}>Clear local Observer/context history</button><button onClick={() => { if (window.confirm("Sign out of Proactive AI IDE?")) props.onSignOut(); }}>Sign out</button></div>
          </>}
          {message && <p className="settings-message" role="status">{message}</p>}
        </main>
      </div>
    </section>
  </div>;
}
