import type { ObserverKind, ObserverMode } from "./observer";
import type { ContextTrayItem, ContextTrayStaleState } from "./context-tray";

export const PROJECT_CONTEXT_VERSION = 1 as const;

export type ProjectContextItemType =
  | "user_instruction"
  | "selected_code"
  | "diagnostic"
  | "current_symbol"
  | "nearby_code"
  | "related_file"
  | "project_rule"
  | "attached_markdown"
  | "terminal_error"
  | "file_excerpt"
  | "complete_file"
  | "controlled_run_error"
  | "task_failure"
  | "selected_output"
  | "selected_markdown"
  | "markdown_section";

export type ProjectContextProvenance =
  | "user"
  | "editor_selection"
  | "editor_cursor"
  | "diagnostics"
  | "run_output"
  | "local_import"
  | "nearby_test"
  | "project_configuration"
  | "project_instruction"
  | "user_attached";

export interface ProjectContextItem {
  id: string;
  type: ProjectContextItemType;
  priority: number;
  content: string;
  source: {
    provenance: ProjectContextProvenance;
    relativePath?: string;
    lineStart?: number;
    lineEnd?: number;
  };
  reason: string;
  estimatedCharacters: number;
  estimatedTokens: number;
  optional: boolean;
  completeFile: boolean;
  truncated: boolean;
  redacted: boolean;
  title?: string;
  contentHash?: string;
  createdAt?: number;
  attachmentProvenance?: "automatic" | "user_attached";
  staleState?: ContextTrayStaleState;
  relevanceScore?: number;
}

export interface OmittedProjectContextItem {
  type: ProjectContextItemType;
  source?: string;
  reason: string;
}

export interface ProjectContextPackage {
  version: typeof PROJECT_CONTEXT_VERSION;
  intent: { mode: ObserverMode; instruction: string };
  activeFile: { relativePath: string; fileName: string; language: string; kind: ObserverKind };
  cursor: { line: number; column: number };
  items: ProjectContextItem[];
  omitted: OmittedProjectContextItem[];
  totalCharacters: number;
  estimatedTokens: number;
  limits: { maximumTotalCharacters: number; maximumRelatedFiles: number; maximumCharactersPerFile: number };
  containsCompleteFile: boolean;
}

export interface ProjectContextSeed {
  mode: ObserverMode;
  kind: ObserverKind;
  activeRelativePath: string;
  fileName: string;
  language: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  selectedLineStart?: number;
  selectedLineEnd?: number;
  nearbyCode?: string;
  diagnostic?: { fileName: string; line: number; column: number; message: string };
  runError?: string;
  exclusions: string[];
  maximumTotalCharacters: number;
  maximumRelatedFiles: number;
  maximumCharactersPerFile: number;
  activeContentDirty?: boolean;
  userRequest?: string;
  trayItems?: ContextTrayItem[];
}

export const projectContextCost = (content: string) => ({
  estimatedCharacters: content.length,
  estimatedTokens: Math.ceil(content.length / 4),
});

export const requiresCompleteFileConfirmation = (context: ProjectContextPackage, enabled: boolean) => enabled && context.containsCompleteFile;

export function removeOptionalContextItem(context: ProjectContextPackage, id: string): ProjectContextPackage {
  const target = context.items.find((item) => item.id === id);
  if (!target?.optional) return context;
  const items = context.items.filter((item) => item.id !== id);
  const totalCharacters = items.reduce((sum, item) => sum + item.estimatedCharacters, 0);
  return {
    ...context,
    items,
    omitted: [...context.omitted, { type: target.type, source: target.source.relativePath, reason: "Removed by user in Context Preview." }],
    totalCharacters,
    estimatedTokens: Math.ceil(totalCharacters / 4),
    containsCompleteFile: items.some((item) => item.completeFile),
  };
}

export function validateProjectContextPackage(value: unknown): ProjectContextPackage | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Partial<ProjectContextPackage>;
  if (context.version !== PROJECT_CONTEXT_VERSION || !context.intent || !context.activeFile || !context.cursor || !context.limits || !Array.isArray(context.items) || !Array.isArray(context.omitted)) return null;
  if (typeof context.intent.instruction !== "string" || context.intent.instruction.length < 1 || context.intent.instruction.length > 500) return null;
  if (typeof context.activeFile.relativePath !== "string" || !context.activeFile.relativePath || context.activeFile.relativePath.length > 4096 || typeof context.activeFile.fileName !== "string" || typeof context.activeFile.language !== "string") return null;
  if (!Number.isInteger(context.cursor.line) || context.cursor.line < 1 || !Number.isInteger(context.cursor.column) || context.cursor.column < 1) return null;
  if (!Number.isInteger(context.limits.maximumTotalCharacters) || context.limits.maximumTotalCharacters < 1_000 || context.limits.maximumTotalCharacters > 50_000) return null;
  if (!Number.isInteger(context.limits.maximumRelatedFiles) || context.limits.maximumRelatedFiles < 0 || context.limits.maximumRelatedFiles > 10) return null;
  if (!Number.isInteger(context.limits.maximumCharactersPerFile) || context.limits.maximumCharactersPerFile < 500 || context.limits.maximumCharactersPerFile > 20_000) return null;
  const ids = new Set<string>();
  let total = 0;
  for (const item of context.items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.content !== "string" || !item.content || item.content.length > 50_000) return null;
    if (!Number.isInteger(item.priority) || item.priority < 1 || item.priority > 8 || typeof item.reason !== "string" || item.reason.length > 500) return null;
    if (item.estimatedCharacters !== item.content.length || item.estimatedTokens !== Math.ceil(item.content.length / 4)) return null;
    if (item.source.relativePath?.startsWith("/") || item.source.relativePath?.split(/[\\/]/).includes("..")) return null;
    if (item.attachmentProvenance !== undefined && !["automatic", "user_attached"].includes(item.attachmentProvenance)) return null;
    if (item.staleState !== undefined && !["fresh", "stale", "keep_original", "unavailable"].includes(item.staleState)) return null;
    if (item.title !== undefined && (typeof item.title !== "string" || !item.title || item.title.length > 160)) return null;
    if (item.contentHash !== undefined && !/^[a-f0-9]{64}$/.test(item.contentHash)) return null;
    if (item.createdAt !== undefined && (!Number.isInteger(item.createdAt) || item.createdAt < 0)) return null;
    ids.add(item.id); total += item.content.length;
  }
  if (total !== context.totalCharacters || context.totalCharacters > context.limits.maximumTotalCharacters || context.estimatedTokens !== Math.ceil(total / 4) || context.containsCompleteFile !== context.items.some((item) => item.completeFile)) return null;
  return context as ProjectContextPackage;
}
