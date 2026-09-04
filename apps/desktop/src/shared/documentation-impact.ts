import { sha256Text } from "./ai-edit.ts";
import type { GitChangeKind } from "./git.ts";

export const DOCUMENTATION_RELATIONSHIP_TYPES = ["file_path", "symbol", "api_route", "package_script", "configuration_key", "project_link", "readme_setup", "test_documentation"] as const;
export type DocumentationRelationshipType = typeof DOCUMENTATION_RELATIONSHIP_TYPES[number];
export type DocumentationConfidence = "high" | "medium" | "low";
export type DocumentationRelationshipStatus = "current" | "stale" | "dismissed";
export interface DocumentationRelationship { version: 1; id: string; codePath: string; documentationPath: string; type: DocumentationRelationshipType; confidence: DocumentationConfidence; evidence: string; reference: string; codeLineStart?: number; codeLineEnd?: number; documentationLineStart: number; documentationLineEnd: number; detectedAt: number; status: DocumentationRelationshipStatus; codeHash: string; documentationHash: string; decision: "unreviewed" | "confirmed" | "rejected"; evidenceHash: string }
export interface DocumentationSource { relativePath: string; content: string }
export interface ChangedCodeSource { relativePath: string; originalPath?: string; currentContent: string; originalContent: string; kind: GitChangeKind | "session" }
export interface RelationshipDecision { relationshipId: string; evidenceHash: string; decision: "confirmed" | "rejected" }

const safePath = (value: string) => value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !value.includes("\0") && !value.split(/[\\/]/).includes("..");
const lineOf = (content: string, index: number) => content.slice(0, index).split(/\r?\n/).length;
const semanticText = (content: string) => content
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .map((line) => line.replace(/\s*(?:\/\/|#).*$/, "").replace(/\s+/g, ""))
  .filter(Boolean)
  .join("\n");
const hasRelevantChange = (source: ChangedCodeSource) => source.kind === "added" || source.kind === "deleted" || source.kind === "renamed" || source.kind === "untracked" || semanticText(source.originalContent) !== semanticText(source.currentContent);
const changedLines = (before: string, after: string) => {
  if (!before) return after.split(/\r?\n/).map((text, index) => ({ text, line: index + 1 }));
  const old = new Set(before.split(/\r?\n/).map((line) => line.trim()));
  return after.split(/\r?\n/).map((text, index) => ({ text, line: index + 1 })).filter(({ text }) => text.trim() && !old.has(text.trim()) && !/^\s*(?:\/\/|\/\*|\*|#)/.test(text));
};
const symbols = (lines: Array<{ text: string; line: number }>) => lines.flatMap(({ text, line }) => Array.from(text.matchAll(/\b(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g), (match) => ({ value: match[1], line })));
const allLines = (content: string) => content.split(/\r?\n/).map((text, index) => ({ text, line: index + 1 }));
const routes = (lines: Array<{ text: string; line: number }>) => lines.flatMap((item) => Array.from(item.text.matchAll(/["'`]((?:\/api\/|https?:\/\/[^/\s]+\/)[A-Za-z0-9_./:{}-]+)["'`]/g), (match) => ({ value: match[1], line: item.line })));
const configurationKeys = (lines: Array<{ text: string; line: number }>) => lines.flatMap((item) => Array.from(item.text.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g), (match) => ({ value: match[0], line: item.line })));
const refs = (source: ChangedCodeSource) => {
  const lines = changedLines(source.originalContent, source.currentContent), values: Array<{ type: DocumentationRelationshipType; value: string; confidence: DocumentationConfidence; line?: number }> = [];
  for (const value of [source.relativePath, source.originalPath].filter((item): item is string => Boolean(item))) values.push({ type: "file_path", value, confidence: "high" }, { type: "project_link", value, confidence: "high" });
  for (const item of symbols(lines)) values.push({ type: "symbol", value: item.value, confidence: "medium", line: item.line });
  for (const item of routes(lines)) values.push({ type: "api_route", value: item.value, confidence: "high", line: item.line });
  for (const item of configurationKeys(lines)) values.push({ type: "configuration_key", value: item.value, confidence: "medium", line: item.line });
  const removed = <T extends { value: string; line: number }>(before: T[], after: T[]) => before.filter((item) => !after.some((candidate) => candidate.value === item.value));
  for (const item of removed(symbols(allLines(source.originalContent)), symbols(allLines(source.currentContent)))) values.push({ type: "symbol", value: item.value, confidence: "medium" });
  for (const item of removed(routes(allLines(source.originalContent)), routes(allLines(source.currentContent)))) values.push({ type: "api_route", value: item.value, confidence: "high" });
  for (const item of removed(configurationKeys(allLines(source.originalContent)), configurationKeys(allLines(source.currentContent)))) values.push({ type: "configuration_key", value: item.value, confidence: "medium" });
  if (/(^|\/)package\.json$/.test(source.relativePath)) try { const current = JSON.parse(source.currentContent || "{}") as { scripts?: Record<string, unknown> }; const original = JSON.parse(source.originalContent || "{}") as { scripts?: Record<string, unknown> }; for (const name of Array.from(new Set([...Object.keys(current.scripts ?? {}), ...Object.keys(original.scripts ?? {})]))) values.push({ type: "package_script", value: name, confidence: "high" }); } catch { /* invalid package files are ignored */ }
  const base = source.relativePath.split("/").at(-1) ?? source.relativePath;
  const isTest = /(?:^|\.)test\.|(?:^|\.)spec\./i.test(base);
  if (isTest) values.push({ type: "test_documentation", value: source.relativePath, confidence: "high" });
  values.push({ type: isTest ? "test_documentation" : "file_path", value: base, confidence: "low" });
  return values.filter((item, index) => item.value.length >= 3 && values.findIndex((candidate) => candidate.type === item.type && candidate.value === item.value) === index);
};
const mentioned = (doc: string, type: DocumentationRelationshipType, value: string) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (type === "readme_setup") return /\b(?:install|setup|getting started|npm|pnpm|yarn)\b/i.exec(doc);
  if (type === "project_link") return new RegExp(`\\[[^\\]]+\\]\\([^)]*${escaped}(?:#[^)]*)?\\)`, "i").exec(doc);
  if (type === "package_script") return new RegExp(`(?:npm|pnpm|yarn)\\s+(?:run\\s+)?${escaped}\\b`, "i").exec(doc);
  return new RegExp(type === "symbol" || type === "configuration_key" ? "(?:`" + escaped + "`|\\b" + escaped + "\\b)" : escaped, "i").exec(doc);
};

export async function detectDocumentationRelationships(changes: readonly ChangedCodeSource[], documents: readonly DocumentationSource[], decisions: readonly RelationshipDecision[] = [], now = Date.now(), previousRelationships: readonly DocumentationRelationship[] = []): Promise<DocumentationRelationship[]> {
  const output: DocumentationRelationship[] = [];
  for (const change of changes) {
    if (!safePath(change.relativePath) || !hasRelevantChange(change)) continue;
    const codeHash = await sha256Text(change.currentContent), candidates = refs(change);
    for (const document of documents) {
      if (!safePath(document.relativePath) || !/\.(?:md|mdown|mdx)$/i.test(document.relativePath)) continue;
      const documentationHash = await sha256Text(document.content);
      const readmeSetup = /(?:^|\/)readme(?:\.[^.]+)?\.md(?:own)?$/i.test(document.relativePath) && /(?:^|\/)package\.json$/i.test(change.relativePath) && /\b(?:install|setup|getting started|npm|pnpm|yarn)\b/i.exec(document.content);
      const documentCandidates = readmeSetup ? [{ type: "readme_setup" as const, value: "package.json", confidence: "medium" as const }, ...candidates] : candidates;
      for (const candidate of documentCandidates) {
        const match = mentioned(document.content, candidate.type, candidate.value); if (!match) continue;
        const documentationLineStart = lineOf(document.content, match.index), evidence = document.content.split(/\r?\n/).slice(Math.max(0, documentationLineStart - 2), documentationLineStart + 1).join(" ").trim().slice(0, 300);
        const id = (await sha256Text(`${change.relativePath}\0${document.relativePath}\0${candidate.type}\0${candidate.value}`)).slice(0, 24);
        const evidenceHash = await sha256Text(`${id}\0${codeHash}\0${documentationHash}\0${evidence}`);
        const previous = decisions.find((item) => item.relationshipId === id && item.evidenceHash === evidenceHash);
        const prior = previousRelationships.find((item) => item.id === id);
        const status: DocumentationRelationshipStatus = previous?.decision === "rejected" ? "dismissed" : prior && (prior.documentationHash !== documentationHash || (prior.status === "current" && prior.codeHash === codeHash)) ? "current" : "stale";
        output.push({ version: 1, id, codePath: change.relativePath, documentationPath: document.relativePath, type: candidate.type, confidence: candidate.confidence, evidence, reference: candidate.value, ...(candidate.line ? { codeLineStart: candidate.line, codeLineEnd: candidate.line } : {}), documentationLineStart, documentationLineEnd: documentationLineStart, detectedAt: now, status, codeHash, documentationHash, decision: previous?.decision ?? "unreviewed", evidenceHash });
      }
    }
  }
  return output.filter((item, index) => output.findIndex((candidate) => candidate.id === item.id) === index).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.confidence] - ({ high: 0, medium: 1, low: 2 })[b.confidence]);
}

export const visibleDocumentationRelationships = (items: readonly DocumentationRelationship[], minimum: DocumentationConfidence, includeLow: boolean) => items.filter((item) => item.status !== "dismissed" && (includeLow || item.confidence !== "low") && ({ high: 3, medium: 2, low: 1 })[item.confidence] >= ({ high: 3, medium: 2, low: 1 })[minimum]);
