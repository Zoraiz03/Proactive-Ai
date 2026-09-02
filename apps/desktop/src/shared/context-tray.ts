import { sha256Text } from "./ai-edit.ts";

export const CONTEXT_TRAY_VERSION = 1 as const;
export const CONTEXT_TRAY_ITEM_LIMIT = 20_000;
export const CONTEXT_TRAY_MAX_ITEMS = 20;

export const CONTEXT_TRAY_TYPES = [
  "selected_code",
  "current_symbol",
  "file_excerpt",
  "complete_file",
  "diagnostic",
  "controlled_run_error",
  "task_failure",
  "selected_output",
  "selected_markdown",
  "markdown_section",
  "project_rule",
  "web_research",
] as const;

export type ContextTrayItemType = typeof CONTEXT_TRAY_TYPES[number];
export type ContextTrayStaleState = "fresh" | "stale" | "keep_original" | "unavailable";

export interface ContextTrayItem {
  version: typeof CONTEXT_TRAY_VERSION;
  id: string;
  type: ContextTrayItemType;
  title: string;
  source?: { relativePath?: string; lineStart?: number; lineEnd?: number };
  content: string;
  contentHash: string;
  sourceContentHash?: string;
  createdAt: number;
  estimatedCharacters: number;
  estimatedTokens: number;
  redacted: boolean;
  truncated: boolean;
  staleState: ContextTrayStaleState;
  provenance: "user_attached";
  reason: string;
  completeFile: boolean;
}

export interface CreateContextTrayItemInput {
  id?: string;
  type: Exclude<ContextTrayItemType, "web_research">;
  title: string;
  content: string;
  relativePath?: string;
  lineStart?: number;
  lineEnd?: number;
  sourceContent?: string;
  createdAt?: number;
  reason: string;
  maximumCharacters?: number;
  completeFile?: boolean;
}

export type ContextTrayDuplicate = "exact" | "overlap" | null;

const safeRelativePath = (value: string | undefined): value is string => Boolean(value && value.length <= 4096 && !value.startsWith("/") && !value.includes("\0") && !value.split(/[\\/]/).includes(".."));
const validRange = (start?: number, end?: number) => start === undefined || (Number.isInteger(start) && start! > 0 && (end === undefined || (Number.isInteger(end) && end! >= start!)));

export function redactContextSecrets(raw: string): { content: string; redacted: boolean } {
  let content = raw;
  let redacted = false;
  const replace = (pattern: RegExp, replacement: string | ((...values: string[]) => string)) => {
    content = content.replace(pattern, (...values) => {
      redacted = true;
      return typeof replacement === "string" ? replacement : replacement(...values);
    });
  };
  replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
  replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED AWS KEY]");
  replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED GITHUB TOKEN]");
  replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED API TOKEN]");
  replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi, "[REDACTED CONNECTION STRING]");
  replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|session[_-]?secret|password|authorization)\b(\s*[:=]\s*["']?)([^\s"']{8,})/gi,
    (_match, name, separator) => `${name}${separator}[REDACTED]`);
  return { content, redacted };
}

export async function createContextTrayItem(input: CreateContextTrayItemInput): Promise<ContextTrayItem> {
  if (!input.content.trim()) throw new Error("Choose non-empty context before attaching it.");
  if (!input.title.trim() || input.title.length > 160 || !input.reason.trim() || input.reason.length > 500) throw new Error("Context item metadata is invalid.");
  if (input.relativePath !== undefined && !safeRelativePath(input.relativePath)) throw new Error("Context source must be inside the workspace.");
  if (!validRange(input.lineStart, input.lineEnd)) throw new Error("Context line range is invalid.");
  const maximum = Math.max(500, Math.min(CONTEXT_TRAY_ITEM_LIMIT, Math.trunc(input.maximumCharacters ?? CONTEXT_TRAY_ITEM_LIMIT)));
  const safe = redactContextSecrets(input.content);
  const content = safe.content.slice(0, maximum);
  const sourceContent = input.sourceContent ?? input.content;
  return {
    version: CONTEXT_TRAY_VERSION,
    id: input.id ?? crypto.randomUUID(),
    type: input.type,
    title: input.title.trim(),
    ...(input.relativePath || input.lineStart ? { source: {
      ...(input.relativePath ? { relativePath: input.relativePath } : {}),
      ...(input.lineStart ? { lineStart: input.lineStart } : {}),
      ...(input.lineEnd ? { lineEnd: input.lineEnd } : {}),
    } } : {}),
    content,
    contentHash: await sha256Text(content),
    ...(input.relativePath ? { sourceContentHash: await sha256Text(sourceContent) } : {}),
    createdAt: input.createdAt ?? Date.now(),
    estimatedCharacters: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    redacted: safe.redacted,
    truncated: content.length < safe.content.length,
    staleState: "fresh",
    provenance: "user_attached",
    reason: input.reason.trim(),
    completeFile: Boolean(input.completeFile && content.length === safe.content.length),
  };
}

export function validateContextTrayItem(value: unknown): ContextTrayItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ContextTrayItem>;
  const keys = Object.keys(item);
  if (keys.some((key) => !["version", "id", "type", "title", "source", "content", "contentHash", "sourceContentHash", "createdAt", "estimatedCharacters", "estimatedTokens", "redacted", "truncated", "staleState", "provenance", "reason", "completeFile"].includes(key))) return null;
  if (item.version !== CONTEXT_TRAY_VERSION || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/i.test(item.id) || !CONTEXT_TRAY_TYPES.includes(item.type as ContextTrayItemType) || item.type === "web_research") return null;
  if (typeof item.title !== "string" || !item.title || item.title.length > 160 || typeof item.reason !== "string" || !item.reason || item.reason.length > 500) return null;
  if (typeof item.content !== "string" || !item.content || item.content.length > CONTEXT_TRAY_ITEM_LIMIT || !/^[a-f0-9]{64}$/.test(item.contentHash ?? "")) return null;
  if (item.sourceContentHash !== undefined && !/^[a-f0-9]{64}$/.test(item.sourceContentHash)) return null;
  if (!Number.isInteger(item.createdAt) || item.createdAt! < 0 || item.estimatedCharacters !== item.content.length || item.estimatedTokens !== Math.ceil(item.content.length / 4)) return null;
  if (typeof item.redacted !== "boolean" || typeof item.truncated !== "boolean" || typeof item.completeFile !== "boolean" || item.provenance !== "user_attached" || !["fresh", "stale", "keep_original", "unavailable"].includes(item.staleState ?? "")) return null;
  if (item.source !== undefined) {
    const sourceKeys = Object.keys(item.source);
    if (sourceKeys.some((key) => !["relativePath", "lineStart", "lineEnd"].includes(key)) || (item.source.relativePath !== undefined && !safeRelativePath(item.source.relativePath)) || !validRange(item.source.lineStart, item.source.lineEnd)) return null;
    if (item.source.relativePath && !item.sourceContentHash) return null;
  }
  if (redactContextSecrets(item.content).redacted) return null;
  return item as ContextTrayItem;
}

export function findContextTrayDuplicate(items: readonly ContextTrayItem[], candidate: ContextTrayItem): ContextTrayDuplicate {
  for (const item of items) {
    if (item.contentHash === candidate.contentHash && item.source?.relativePath === candidate.source?.relativePath) return "exact";
    if (!item.source?.relativePath || item.source.relativePath !== candidate.source?.relativePath) continue;
    if (item.completeFile || candidate.completeFile) return "overlap";
    const leftStart = item.source.lineStart; const leftEnd = item.source.lineEnd ?? leftStart;
    const rightStart = candidate.source.lineStart; const rightEnd = candidate.source.lineEnd ?? rightStart;
    if (leftStart && leftEnd && rightStart && rightEnd && leftStart <= rightEnd && rightStart <= leftEnd) return "overlap";
  }
  return null;
}

export function reorderContextTray(items: readonly ContextTrayItem[], id: string, direction: -1 | 1): ContextTrayItem[] {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return [...items];
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function markContextTrayPathStale(items: readonly ContextTrayItem[], relativePath: string, unavailable = false): ContextTrayItem[] {
  return items.map((item) => item.source?.relativePath === relativePath && item.staleState === "fresh"
    ? { ...item, staleState: unavailable ? "unavailable" : "stale" }
    : item);
}

export function keepOriginalContextTrayItem(item: ContextTrayItem): ContextTrayItem {
  return item.staleState === "stale" ? { ...item, staleState: "keep_original" } : item;
}

export async function refreshContextTrayItem(item: ContextTrayItem, content: string, sourceContent = content): Promise<ContextTrayItem> {
  return createContextTrayItem({
    id: item.id,
    type: item.type as Exclude<ContextTrayItemType, "web_research">,
    title: item.title,
    content,
    ...(item.source?.relativePath ? { relativePath: item.source.relativePath } : {}),
    ...(item.source?.lineStart ? { lineStart: item.source.lineStart } : {}),
    ...(item.source?.lineEnd ? { lineEnd: item.source.lineEnd } : {}),
    sourceContent,
    createdAt: item.createdAt,
    reason: item.reason,
    maximumCharacters: Math.max(500, item.estimatedCharacters),
    completeFile: item.completeFile,
  });
}

export async function truncateContextTrayItem(item: ContextTrayItem, maximumCharacters: number): Promise<ContextTrayItem> {
  const content = item.content.slice(0, Math.max(500, Math.min(maximumCharacters, item.content.length)));
  return { ...item, content, contentHash: await sha256Text(content), estimatedCharacters: content.length, estimatedTokens: Math.ceil(content.length / 4), truncated: true, completeFile: false };
}

export const contextTrayTotal = (items: readonly ContextTrayItem[]) => ({
  characters: items.reduce((sum, item) => sum + item.estimatedCharacters, 0),
  tokens: Math.ceil(items.reduce((sum, item) => sum + item.estimatedCharacters, 0) / 4),
});
