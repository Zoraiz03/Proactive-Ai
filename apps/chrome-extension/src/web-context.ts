export const WEB_CONTEXT_SCHEMA_VERSION = 1 as const;
export const MAX_SELECTED_TEXT_CHARACTERS = 10_000;

export interface ChromeSelectedTextContext {
  schemaVersion: typeof WEB_CONTEXT_SCHEMA_VERSION;
  captureId: string;
  selectedText: string;
  sourceTitle: string;
  sourceUrl: string;
  hostname: string;
  sourceId: string;
  capturedAt: number;
  contentHash: string;
  characterCount: number;
  truncated: boolean;
  userEdited: boolean;
  provenance: "chrome_selected_text";
}

export interface CaptureInput {
  selectedText: string;
  sourceTitle: string;
  sourceUrl: string;
  capturedAt?: number;
  captureId?: string;
  userEdited?: boolean;
}

export function sanitizeSelectedText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function safeWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname) return null;
    return url;
  } catch { return null; }
}

export async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createWebContext(input: CaptureInput): Promise<ChromeSelectedTextContext> {
  const url = safeWebUrl(input.sourceUrl);
  if (!url) throw new Error("Only normal HTTP and HTTPS pages are supported.");
  const sanitized = sanitizeSelectedText(input.selectedText);
  if (!sanitized.trim()) throw new Error("Select non-empty page text first.");
  const selectedText = sanitized.slice(0, MAX_SELECTED_TEXT_CHARACTERS);
  const urlHash = await hashText(url.toString());
  return {
    schemaVersion: WEB_CONTEXT_SCHEMA_VERSION,
    captureId: input.captureId ?? crypto.randomUUID(),
    selectedText,
    sourceTitle: sanitizeSelectedText(input.sourceTitle).trim().slice(0, 300) || url.hostname,
    sourceUrl: url.toString(),
    hostname: url.hostname,
    sourceId: `web-${urlHash.slice(0, 16)}`,
    capturedAt: input.capturedAt ?? Date.now(),
    contentHash: await hashText(selectedText),
    characterCount: selectedText.length,
    truncated: selectedText.length < sanitized.length,
    userEdited: Boolean(input.userEdited),
    provenance: "chrome_selected_text",
  };
}

export async function editWebContext(original: ChromeSelectedTextContext, value: string): Promise<ChromeSelectedTextContext> {
  const selectedText = sanitizeSelectedText(value).slice(0, MAX_SELECTED_TEXT_CHARACTERS);
  if (!selectedText.trim()) throw new Error("The pending selection cannot be empty.");
  return { ...original, selectedText, contentHash: await hashText(selectedText), characterCount: selectedText.length, truncated: original.truncated || value.length > MAX_SELECTED_TEXT_CHARACTERS, userEdited: selectedText !== original.selectedText || original.userEdited };
}

export function validateWebContext(value: unknown): ChromeSelectedTextContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ChromeSelectedTextContext>;
  const keys = Object.keys(item);
  if (keys.some((key) => !["schemaVersion", "captureId", "selectedText", "sourceTitle", "sourceUrl", "hostname", "sourceId", "capturedAt", "contentHash", "characterCount", "truncated", "userEdited", "provenance"].includes(key))) return null;
  const url = typeof item.sourceUrl === "string" ? safeWebUrl(item.sourceUrl) : null;
  if (item.schemaVersion !== WEB_CONTEXT_SCHEMA_VERSION || typeof item.captureId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.captureId) || typeof item.selectedText !== "string" || !item.selectedText.trim() || item.selectedText.length > MAX_SELECTED_TEXT_CHARACTERS) return null;
  if (sanitizeSelectedText(item.selectedText) !== item.selectedText || typeof item.sourceTitle !== "string" || !item.sourceTitle || item.sourceTitle.length > 300 || !url || item.hostname !== url.hostname || typeof item.sourceId !== "string" || !/^web-[a-f0-9]{16}$/.test(item.sourceId)) return null;
  if (!Number.isInteger(item.capturedAt) || item.capturedAt! < 0 || !/^[a-f0-9]{64}$/.test(item.contentHash ?? "") || item.characterCount !== item.selectedText.length || typeof item.truncated !== "boolean" || typeof item.userEdited !== "boolean" || item.provenance !== "chrome_selected_text") return null;
  return item as ChromeSelectedTextContext;
}
