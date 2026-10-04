import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectDocumentationRelationships,
  visibleDocumentationRelationships,
  type ChangedCodeSource,
  type DocumentationRelationship,
  type DocumentationSource,
  type RelationshipDecision,
} from "../../shared/documentation-impact";
import { isExcludedFromAiContext, isMandatorySecretFile, type LocalSettings } from "../../shared/settings";
import type { WorkspaceEntry } from "../../shared/workspace";

interface Props {
  active: boolean;
  workspaceOpen: boolean;
  workspaceVersion: number;
  settings: LocalSettings;
  sessionChanges: ChangedCodeSource[];
  onOpen: (relativePath: string, line?: number) => void;
  onDecision: (relationship: DocumentationRelationship, decision: RelationshipDecision["decision"]) => void;
  onAddBoth: (relationship: DocumentationRelationship) => void;
  observerEnabled: boolean;
  onDraftUpdate: (relationship: DocumentationRelationship) => void;
}

const ignoredDirectory = /^(?:\.git|node_modules|dist|build|out|coverage|\.next|target|vendor)$/i;
const generatedFile = /(?:\.min\.(?:js|css)|(?:^|\/)package-lock\.json|(?:^|\/)pnpm-lock\.yaml|(?:^|\/)yarn\.lock)$/i;
const standardDocument = (path: string) => /\.(?:md|mdown|mdx)$/i.test(path);
const matchesDocumentPath = (path: string, paths: readonly string[]) => standardDocument(path) || paths.some((raw) => {
  const prefix = raw.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  return prefix && (path === prefix || path.startsWith(`${prefix}/`));
});

async function discoverDocuments(settings: LocalSettings): Promise<DocumentationSource[]> {
  const documents: DocumentationSource[] = [];
  const queue = [""];
  let visited = 0;
  while (queue.length && visited < 2_000 && documents.length < 250) {
    const directory = queue.shift()!;
    const result = await window.workspace.readDirectory(directory);
    if (!result.ok) continue;
    for (const entry of result.value) {
      if (++visited > 2_000) break;
      if (entry.isSymbolicLink || isExcludedFromAiContext(entry.relativePath, settings.aiContextExclusions)) continue;
      if (entry.kind === "directory") {
        if (!ignoredDirectory.test(entry.name)) queue.push(entry.relativePath);
        continue;
      }
      if (!/\.(?:md|mdown|mdx)$/i.test(entry.name) || isMandatorySecretFile(entry.relativePath) || !matchesDocumentPath(entry.relativePath, settings.documentationPaths)) continue;
      const file = await window.workspace.readFile(entry.relativePath);
      if (file.ok) documents.push({ relativePath: entry.relativePath, content: file.value.content });
    }
  }
  return documents;
}

async function discoverChanges(settings: LocalSettings, sessionChanges: ChangedCodeSource[]) {
  const changes: ChangedCodeSource[] = [];
  let gitState: "repository" | "not_repository" | "missing_git" | "error" = "error";
  if (settings.documentationUseGit) {
    const status = await window.git.status();
    if (status.ok) {
      gitState = status.value.state;
      if (status.value.state === "repository") for (const file of status.value.files) {
        if (/\.(?:md|mdown|mdx)$/i.test(file.relativePath) || generatedFile.test(file.relativePath) || isExcludedFromAiContext(file.relativePath, settings.aiContextExclusions)) continue;
        const diff = await window.git.diff({ relativePath: file.relativePath });
        if (diff.ok && diff.value.state === "text") changes.push({ relativePath: diff.value.relativePath, ...(diff.value.originalPath ? { originalPath: diff.value.originalPath } : {}), currentContent: diff.value.currentContent, originalContent: diff.value.originalContent, kind: diff.value.changeKind });
      }
    }
  }
  if (settings.documentationUseSessionFallback) for (const change of sessionChanges) {
    if (!changes.some((item) => item.relativePath === change.relativePath) && !isExcludedFromAiContext(change.relativePath, settings.aiContextExclusions)) changes.push(change);
  }
  return { changes, gitState };
}

export default function DocumentationImpactPanel(props: Props) {
  const [items, setItems] = useState<DocumentationRelationship[]>([]);
  const [state, setState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [gitState, setGitState] = useState<string>("error");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const previousItems = useRef<DocumentationRelationship[]>([]);
  useEffect(() => {
    if (!props.active || !props.workspaceOpen || !props.settings.documentationImpactEnabled) return;
    let cancelled = false;
    setState("scanning");
    const timer = window.setTimeout(() => void Promise.all([discoverDocuments(props.settings), discoverChanges(props.settings, props.sessionChanges)]).then(async ([documents, result]) => {
      if (cancelled) return;
      const relationships = await detectDocumentationRelationships(result.changes, documents, props.settings.documentationRelationshipDecisions, Date.now(), previousItems.current);
      if (cancelled) return;
      previousItems.current = relationships; setItems(relationships); setGitState(result.gitState); setState("ready");
    }).catch(() => { if (!cancelled) setState("error"); }), 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [props.active, props.workspaceOpen, props.workspaceVersion, props.settings, props.sessionChanges]);
  const visible = useMemo(() => visibleDocumentationRelationships(items, props.settings.documentationMinimumConfidence, props.settings.documentationIncludeLowConfidence).filter((item) => !ignored.has(item.id)), [ignored, items, props.settings.documentationIncludeLowConfidence, props.settings.documentationMinimumConfidence]);
  if (!props.settings.documentationImpactEnabled) return <div className="documentation-impact-state">Documentation Impact is disabled in Settings.</div>;
  if (!props.workspaceOpen) return <div className="documentation-impact-state">Open a workspace to detect documentation relationships.</div>;
  return <section className="documentation-impact-panel" aria-label="Documentation Impact">
    <header>
      <div className="sidebar-toolbar-title"><span className="sidebar-toolbar-icon" aria-hidden="true">¶</span><strong>Documentation Impact</strong></div>
      <span className="documentation-scan-badge">Local scan</span>
    </header>
    {state === "scanning" && <div className="documentation-impact-state">Scanning changed code and local documentation…</div>}
    {state === "error" && <div className="documentation-impact-state error">The scan failed safely. No files were sent anywhere.</div>}
    {state === "ready" && gitState !== "repository" && <div className="documentation-impact-notice">
      <span aria-hidden="true">ⓘ</span>
      <div><strong>Git is unavailable</strong><p>Results are limited to changes saved or open in this IDE session.</p></div>
    </div>}
    {state === "ready" && visible.length === 0 && <div className="documentation-impact-state sidebar-empty-state">
      <span className="sidebar-empty-icon" aria-hidden="true">✓</span>
      <strong>No documentation updates found</strong>
      <p>No relationships need review at the current confidence level.</p>
    </div>}
    {visible.map((item) => <article className="documentation-impact-card" key={item.id}>
      <div className="documentation-impact-heading"><strong>{item.status === "current" ? "Current" : "May need review"}</strong><span className={`confidence ${item.confidence}`}>{item.confidence}</span></div>
      <small className="relationship-state">State: {item.status}</small>
      <button className="path" onClick={() => props.onOpen(item.codePath, item.codeLineStart)}>{item.codePath}</button>
      <span className="relationship-arrow">↔ {item.type.replaceAll("_", " ")}</span>
      <button className="path" onClick={() => props.onOpen(item.documentationPath, item.documentationLineStart)}>{item.documentationPath}</button>
      <button className="evidence-toggle" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>View Evidence {expanded === item.id ? "▴" : "▾"}</button>
      {expanded === item.id && <div className="documentation-evidence"><code>{item.reference}</code><p>{item.evidence}</p><small>Code {item.codeLineStart ? `line ${item.codeLineStart}` : "file"}; documentation line {item.documentationLineStart}. Local hashes identify this evidence version.</small></div>}
      <div className="documentation-actions">
        <button onClick={() => props.onOpen(item.codePath, item.codeLineStart)}>Open Code</button><button onClick={() => props.onOpen(item.documentationPath, item.documentationLineStart)}>Open Documentation</button>
        <button onClick={() => props.onDecision(item, "confirmed")}>Confirm Relationship</button><button onClick={() => props.onDecision(item, "rejected")}>Not Related</button>
        <button onClick={() => setIgnored((current) => new Set(current).add(item.id))}>Ignore for This Session</button><button onClick={() => props.onAddBoth(item)}>Add Both to Context Tray</button>
        <button className="primary" disabled={!props.observerEnabled || !/\.md$/i.test(item.documentationPath) || (item.decision !== "confirmed" && item.confidence !== "high")} title={item.decision !== "confirmed" && item.confidence !== "high" ? "Confirm this relationship before drafting an update." : "Prepare an explicit documentation update request."} onClick={() => props.onDraftUpdate(item)}>Draft Documentation Update</button>
      </div>
    </article>)}
  </section>;
}
