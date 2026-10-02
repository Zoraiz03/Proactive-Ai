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
import ObserverInsightsSettings from "./ObserverInsightsSettings";
import MemoryPanel from './engine/MemoryPanel';
import type { WebContextBridgeStatus } from "../../shared/web-context-bridge";

const sections = ["General", "Editor", "AI Models", "API Keys", "Observer", "Observer Insights", "Documentation Impact", "Browser Extension", "Privacy", "Data and History"] as const;
type Section = typeof sections[number];

interface Props {
  memoryWorkspaceId?: string;
  open: boolean;
  local: LocalSettings;
  synced: SyncedSettings;
  providers: ProviderStatus[];
  webContextStatus: WebContextBridgeStatus;
  onClose: () => void;
  onSaveLocal: (settings: LocalSettings) => Promise<string | null>;
  onSaveSynced: (settings: SyncedSettings) => Promise<string | null>;
  onSaveKey: (provider: Exclude<ObserverProvider, "demo">, apiKey: string, verify: boolean) => Promise<string | null>;
  onDeleteKey: (provider: Exclude<ObserverProvider, "demo">) => Promise<string | null>;
  onResetLocal: () => Promise<string | null>;
  onClearRecents: () => Promise<string | null>;
  onClearHistory: () => Promise<string | null>;
  onClearCheckpoints: () => Promise<string | null>;
  onSetBrowserIntegration: (enabled: boolean) => Promise<string | null>;
  onStartBrowserPairing: () => Promise<string | null>;
  onCancelBrowserPairing: () => Promise<string | null>;
  onRevokeBrowserPairing: () => Promise<string | null>;
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
  const setProactiveMode = (mode: LocalSettings["proactiveObserverMode"]) => {
    if (mode === "assist" && local.proactiveObserverMode !== "assist" && !window.confirm("Enable Assist Mode? Detection is local and limited to persistent error diagnostics and failed controlled run, test, or build actions. No AI request occurs until you choose an action, review Context Preview, and confirm Send.")) return;
    setLocal({ ...local, proactiveObserverMode: mode });
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
          <div className="storage-badge">{["General", "Editor", "Observer Insights", "Documentation Impact", "Browser Extension"].includes(active) ? "Stored securely on this device" : active === "Observer" ? "Manual preferences sync; Assist controls and mutes stay on this device" : "Stored per account in Supabase, except local exclusions"}</div>
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
            <label className="setting-row"><span>Observer mode</span><select value={local.proactiveObserverMode} onChange={(e) => setProactiveMode(e.target.value as LocalSettings["proactiveObserverMode"])}><option value="off">Off</option><option value="manual">Manual (default)</option><option value="assist">Assist — local high-confidence signals</option></select></label>
            <p>Assist detects only persistent error-level diagnostics and failed controlled run, test, or build actions. Detection is local. It never calls AI automatically.</p>
            <label className="setting-row"><span>Preferred manual action</span><select value={synced.defaultObserverAction} onChange={(e) => setSynced({ ...synced, defaultObserverAction: e.target.value as SyncedSettings["defaultObserverAction"] })}>{(["explain", "fix_error", "improve_code", "continue_code", "generate_tests"] as const).map((mode) => <option key={mode} value={mode}>{OBSERVER_MODE_LABELS[mode]}</option>)}</select></label>
            <Toggle label="Context Preview required before sending" checked onChange={() => undefined} disabled />
            <Toggle label="Include diagnostics when relevant" checked={synced.includeDiagnostics} onChange={(value) => setSynced({ ...synced, includeDiagnostics: value })} />
            <Toggle label="Include terminal error output when relevant" checked={synced.includeTerminalError} onChange={(value) => setSynced({ ...synced, includeTerminalError: value })} />
            <h4>Assist detectors</h4>
            <Toggle label="Persistent error diagnostics after two save cycles" checked={local.proactivePersistentDiagnostics} onChange={(value) => setLocal({ ...local, proactivePersistentDiagnostics: value })} />
            <Toggle label="Failed Run Current File actions" checked={local.proactiveFailedRuns} onChange={(value) => setLocal({ ...local, proactiveFailedRuns: value })} />
            <Toggle label="Failed explicit test actions" checked={local.proactiveFailedTests} onChange={(value) => setLocal({ ...local, proactiveFailedTests: value })} />
            <Toggle label="Failed explicit build actions" checked={local.proactiveFailedBuilds} onChange={(value) => setLocal({ ...local, proactiveFailedBuilds: value })} />
            <label className="setting-row"><span>Global nudge cooldown (minutes)</span><input type="number" min="1" max="1440" value={local.proactiveCooldownMinutes} onChange={(e) => setLocal({ ...local, proactiveCooldownMinutes: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Maximum nudges per project/hour</span><input type="number" min="1" max="10" value={local.proactiveMaximumNudgesPerHour} onChange={(e) => setLocal({ ...local, proactiveMaximumNudgesPerHour: Number(e.target.value) })} /></label>
            <h4>Muted proactive signals</h4>
            {!local.proactiveMutedErrors.length && !local.proactiveMutedFiles.length && !local.proactiveMutedProjects.length ? <p>No proactive signals are muted.</p> : <div className="proactive-mute-list">
              {local.proactiveMutedErrors.map((value) => <div key={`error-${value}`}><code>Error {value}</code><button onClick={() => setLocal({ ...local, proactiveMutedErrors: local.proactiveMutedErrors.filter((item) => item !== value) })}>Unmute</button></div>)}
              {local.proactiveMutedFiles.map((value) => <div key={`file-${value}`}><code>File {value}</code><button onClick={() => setLocal({ ...local, proactiveMutedFiles: local.proactiveMutedFiles.filter((item) => item !== value) })}>Unmute</button></div>)}
              {local.proactiveMutedProjects.map((value) => <div key={`project-${value}`}><code>Project {value.slice(0, 12)}…</code><button onClick={() => setLocal({ ...local, proactiveMutedProjects: local.proactiveMutedProjects.filter((item) => item !== value) })}>Unmute</button></div>)}
            </div>}
            <div className="settings-actions"><button className="primary" onClick={() => void saveLocal()}>Save Assist settings</button><button onClick={() => setLocal({ ...local, proactiveObserverMode: "manual", proactivePersistentDiagnostics: true, proactiveFailedRuns: true, proactiveFailedTests: true, proactiveFailedBuilds: true, proactiveCooldownMinutes: 10, proactiveMaximumNudgesPerHour: 3, proactiveMutedErrors: [], proactiveMutedFiles: [], proactiveMutedProjects: [] })}>Reset Assist settings</button></div>
            <h4>Multi-file change safety</h4>
            <label className="setting-row"><span>Maximum affected files</span><input type="number" min="1" max="10" value={local.multiFileMaximumFiles} onChange={(e) => setLocal({ ...local, multiFileMaximumFiles: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Maximum changed lines</span><input type="number" min="25" max="5000" value={local.multiFileMaximumChangedLines} onChange={(e) => setLocal({ ...local, multiFileMaximumChangedLines: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Maximum generated size (bytes)</span><input type="number" min="10000" max="1000000" value={local.multiFileMaximumGeneratedBytes} onChange={(e) => setLocal({ ...local, multiFileMaximumGeneratedBytes: Number(e.target.value) })} /></label>
            <Toggle label="Require plan review" checked onChange={() => undefined} disabled />
            <Toggle label="Require complete diff review" checked onChange={() => undefined} disabled />
            <Toggle label="Allow automatic command execution" checked={false} onChange={() => undefined} disabled />
            <p>Multi-file changes are all-or-nothing and always create one local rollback bundle before writing.</p>
            <button onClick={() => void saveLocal()}>Save local Observer settings</button>
            <button className="primary" onClick={() => void saveSynced()}>Save Observer settings</button>
          </>}
          {active === "Observer Insights" && <ObserverInsightsSettings local={local} onChange={setLocal} onSave={props.onSaveLocal} />}
          {active === "Documentation Impact" && <>
            <h3>Documentation Impact</h3>
            <p>Detects local relationships between changed code and project documentation using deterministic paths, links, routes, commands, symbols, and configuration keys. It never calls AI.</p>
            <Toggle label="Enable documentation relationship detection" checked={local.documentationImpactEnabled} onChange={(value) => setLocal({ ...local, documentationImpactEnabled: value })} />
            <Toggle label="Use Git modified, staged, untracked, renamed, and deleted files" checked={local.documentationUseGit} onChange={(value) => setLocal({ ...local, documentationUseGit: value })} />
            <Toggle label="Use changes saved or open in this IDE session as fallback" checked={local.documentationUseSessionFallback} onChange={(value) => setLocal({ ...local, documentationUseSessionFallback: value })} />
            <label className="setting-row"><span>Minimum confidence</span><select value={local.documentationMinimumConfidence} onChange={(event) => setLocal({ ...local, documentationMinimumConfidence: event.target.value as LocalSettings["documentationMinimumConfidence"] })}><option value="high">High</option><option value="medium">Medium (default)</option><option value="low">Low</option></select></label>
            <Toggle label="Include low-confidence relationships" checked={local.documentationIncludeLowConfidence} onChange={(value) => setLocal({ ...local, documentationIncludeLowConfidence: value })} />
            <label className="setting-row"><span>Maximum Markdown files per update request</span><input type="number" min="1" max="5" value={local.documentationUpdateMaximumFiles} onChange={(event) => setLocal({ ...local, documentationUpdateMaximumFiles: Number(event.target.value) })} /></label>
            <label className="setting-column"><span>Additional documentation files/folders (one relative path per line)</span><textarea value={local.documentationPaths.join("\n")} placeholder="handbook\narchitecture/decisions" onChange={(event) => setLocal({ ...local, documentationPaths: event.target.value.split(/\r?\n/).filter(Boolean) })} /></label>
            <p>README variants, docs/, Markdown setup/API/contribution files, and ADRs are discovered automatically. Symlinks, generated output, binaries, oversized files, secrets, and ignored paths are excluded.</p>
            <div className="settings-actions"><button className="primary" onClick={() => void saveLocal()}>Save Documentation Impact settings</button><button disabled={!local.documentationRelationshipDecisions.length} onClick={() => { const next = { ...local, documentationRelationshipDecisions: [] }; setLocal(next); void props.onSaveLocal(next).then((error) => setMessage(error ?? "Documentation relationship decisions cleared.")); }}>Clear saved decisions ({local.documentationRelationshipDecisions.length})</button></div>
          </>}
          {active === "Browser Extension" && <>
            <h3>Browser Extension</h3>
            <p>Transfers use an authenticated service bound only to 127.0.0.1:{props.webContextStatus.port ?? 32145}. Nothing is uploaded and incoming text requires review before it enters the Context Tray.</p>
            <div className="provider-card"><strong>Status</strong><span>{props.webContextStatus.message}</span></div>
            <Toggle label="Enable local browser integration" checked={props.webContextStatus.enabled} disabled={!props.webContextStatus.available && !props.webContextStatus.enabled} onChange={(enabled) => void props.onSetBrowserIntegration(enabled).then((value) => value && setMessage(value))} />
            {props.webContextStatus.pairingCode && <div className="provider-card"><strong>Short-lived pairing code</strong><code>{props.webContextStatus.pairingCode}</code><span>Expires {props.webContextStatus.pairingExpiresAt ? new Date(props.webContextStatus.pairingExpiresAt).toLocaleTimeString() : "soon"}. The secret credential is never displayed.</span></div>}
            {props.webContextStatus.pairedDevice && <div className="provider-card"><strong>Paired device</strong><span>{props.webContextStatus.pairedDevice}</span></div>}
            <div className="settings-actions">
              {!props.webContextStatus.paired && !props.webContextStatus.pairingCode && <button className="primary" disabled={!props.webContextStatus.enabled} onClick={() => void props.onStartBrowserPairing().then((value) => value && setMessage(value))}>Start Pairing</button>}
              {props.webContextStatus.pairingCode && <button onClick={() => void props.onCancelBrowserPairing().then((value) => value && setMessage(value))}>Cancel Pairing</button>}
              {props.webContextStatus.paired && <button onClick={() => void destructive("Revoke this browser pairing? The extension must pair again.", props.onRevokeBrowserPairing, "Browser pairing revoked.")}>Revoke</button>}
            </div>
          </>}
          {active === "Privacy" && <>
            <MemoryPanel workspaceId={props.memoryWorkspaceId} />
            <h3>Privacy</h3><p>Manual Observer requests show focused context before sending. The separate, session-only Auto-explain switch in Observer can send bounded failed-run code and errors automatically after explicit consent. It never includes Context Tray items or edits files.</p>
            <Toggle label="Never send .env files" checked disabled onChange={() => undefined} />
            <Toggle label="Never send credentials, private keys, tokens, or secret files" checked disabled onChange={() => undefined} />
            <div className="mandatory-exclusions"><strong>Permanent secret exclusions</strong><code>{MANDATORY_SECRET_EXCLUSIONS.join(", ")}</code></div>
            <label className="setting-column"><span>Additional files/folders excluded from AI context (one per line)</span><textarea value={local.aiContextExclusions.join("\n")} onChange={(e) => setLocal({ ...local, aiContextExclusions: e.target.value.split(/\r?\n/).filter(Boolean) })} /></label>
            <label className="setting-row"><span>Total AI context (characters)</span><input type="number" min="1000" max="50000" value={synced.maximumContextChars} onChange={(e) => setSynced({ ...synced, maximumContextChars: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Maximum related files</span><input type="number" min="1" max="10" value={local.contextMaximumRelatedFiles} onChange={(e) => setLocal({ ...local, contextMaximumRelatedFiles: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Other actions / related-file limit (characters)</span><input type="number" min="500" max="20000" value={local.contextMaximumFileCharacters} onChange={(e) => setLocal({ ...local, contextMaximumFileCharacters: Number(e.target.value) })} /></label>
            <label className="setting-row"><span>Manual Explain code limit (characters)</span><input type="number" min="500" max="20000" value={local.explainMaximumCodeCharacters} onChange={e=>setLocal({...local,explainMaximumCodeCharacters:Number(e.target.value)})} /></label>
            <p className="settings-description">Manual Explain uses its own code ceiling for selections, complete functions and explicitly approved files. Total AI context also includes the instruction, question and retained history. Conservative model/token and response reserves may lower the effective budget. Other actions and related files retain their existing limits; Live Observer remains separately bounded. Settings never raise limits automatically.</p>
            <Toggle label="Require confirmation before attaching a complete file" checked={synced.confirmCompleteFile} onChange={(value) => setSynced({ ...synced, confirmCompleteFile: value })} />
            <Toggle label="Store suggestion history" checked={synced.storeSuggestionHistory} onChange={(value) => setSynced({ ...synced, storeSuggestionHistory: value })} />
            <div className="settings-actions"><button className="primary" onClick={() => void saveSynced()}>Save privacy settings</button><button onClick={() => void saveLocal()}>Save local context settings</button></div>
          </>}
          {active === "Data and History" && <>
            <h3>Data and History</h3><p>Theme, editor choices, exclusions, and recent project paths are local. Provider preferences and Observer history choices are stored in Supabase. Account deletion is not available yet.</p>
            <label className="setting-row"><span>Observer checkpoint retention</span><input type="number" min="1" max="100" value={local.checkpointRetentionLimit} onChange={(e) => setLocal({ ...local, checkpointRetentionLimit: Number(e.target.value) })} /></label>
            <button className="primary" onClick={() => void saveLocal()}>Save retention setting</button>
            <div className="danger-actions"><button onClick={() => void destructive("Reset all local settings to defaults?", props.onResetLocal, "Local settings reset.")}>Reset local settings</button><button onClick={() => void destructive("Clear recent-project history from this device?", props.onClearRecents, "Recent projects cleared.")}>Clear recent-project history</button><button onClick={() => void destructive("Clear local Observer/context history from this device? This does not delete existing Supabase suggestion records.", props.onClearHistory, "Local Observer/context history cleared.")}>Clear local Observer/context history</button><button onClick={() => void destructive("Clear all local Observer rollback checkpoints?", props.onClearCheckpoints, "Local checkpoints cleared.")}>Clear Local Checkpoints</button><button onClick={() => { if (window.confirm("Sign out of Proactive AI IDE?")) props.onSignOut(); }}>Sign out</button></div>
          </>}
          {message && <p className="settings-message" role="status">{message}</p>}
        </main>
      </div>
    </section>
  </div>;
}
