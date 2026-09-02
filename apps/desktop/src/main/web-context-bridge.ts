import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createWebResearchContextTrayItem, type ContextTrayItem } from "../shared/context-tray.ts";
import type { WebContextBridgeStatus } from "../shared/web-context-bridge.ts";

export const WEB_CONTEXT_PORT = 32145;
const MAX_BODY_BYTES = 16_384;
const MAX_CAPTURE_AGE_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

interface ChromeSelectedTextContext {
  schemaVersion: 1;
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

export interface WebContextBridgeOptions {
  canAccept: () => boolean;
  onContext: (item: ContextTrayItem) => void;
  onStatusChanged?: (status: WebContextBridgeStatus) => void;
  now?: () => number;
}

const json = (response: ServerResponse, status: number, body: object, origin?: string) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.end(JSON.stringify(body));
};

const safeOrigin = (request: IncomingMessage): string | null => {
  const origin = request.headers.origin;
  return typeof origin === "string" && EXTENSION_ORIGIN.test(origin) ? origin : null;
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request is too large.");
    chunks.push(bytes);
  }
  const type = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new Error("JSON content is required.");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key)) && allowed.every((key) => key in value);
const safeUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && Boolean(url.hostname) ? url : null;
  } catch { return null; }
};
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function validateChromeSelectedTextContext(value: unknown, now = Date.now()): ChromeSelectedTextContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const keys = ["schemaVersion", "captureId", "selectedText", "sourceTitle", "sourceUrl", "hostname", "sourceId", "capturedAt", "contentHash", "characterCount", "truncated", "userEdited", "provenance"];
  if (!exactKeys(item, keys)) return null;
  if (item.schemaVersion !== 1 || typeof item.captureId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.captureId)) return null;
  if (typeof item.selectedText !== "string" || !item.selectedText.trim() || item.selectedText.length > 10_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(item.selectedText)) return null;
  if (typeof item.sourceTitle !== "string" || !item.sourceTitle || item.sourceTitle.length > 300 || /[\u0000-\u001F\u007F]/.test(item.sourceTitle) || typeof item.sourceUrl !== "string" || item.sourceUrl.length > 4096 || typeof item.hostname !== "string" || item.hostname.length > 253) return null;
  const url = safeUrl(item.sourceUrl); if (!url || url.hostname !== item.hostname) return null;
  if (typeof item.capturedAt !== "number" || !Number.isInteger(item.capturedAt) || item.capturedAt > now + 60_000 || now - item.capturedAt > MAX_CAPTURE_AGE_MS) return null;
  if (item.characterCount !== item.selectedText.length || typeof item.truncated !== "boolean" || typeof item.userEdited !== "boolean" || item.provenance !== "chrome_selected_text") return null;
  if (item.contentHash !== sha256(item.selectedText) || item.sourceId !== `web-${sha256(url.toString()).slice(0, 16)}`) return null;
  return item as unknown as ChromeSelectedTextContext;
}

const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export class LocalWebContextBridge {
  private server: Server | null = null;
  private port: number | null = null;
  private pairingCode = this.newPairingCode();
  private failedPairings = 0;
  private token: { value: string; origin: string; expiresAt: number } | null = null;
  private readonly captures = new Map<string, number>();
  private readonly options: WebContextBridgeOptions;
  constructor(options: WebContextBridgeOptions) { this.options = options; }

  status(): WebContextBridgeStatus {
    const available = this.port !== null;
    return { available, paired: Boolean(this.validToken()), pairingCode: available && !this.validToken() ? this.pairingCode : null, port: this.port, message: available ? (this.validToken() ? "Chrome is paired for this desktop session." : "Enter this one-time code in the Chrome extension.") : "Chrome bridge is unavailable." };
  }

  async start(): Promise<void> {
    if (this.server) return;
    try { await this.listen(WEB_CONTEXT_PORT); this.port = WEB_CONTEXT_PORT; } catch { this.server = null; }
    this.emitStatus();
  }

  async stop(): Promise<void> {
    const server = this.server; this.server = null; this.port = null; this.token = null; this.captures.clear();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    this.emitStatus();
  }

  private newPairingCode() { return randomInt(10_000_000, 100_000_000).toString(); }
  private validToken() { if (this.token && this.token.expiresAt > (this.options.now?.() ?? Date.now())) return this.token; this.token = null; return null; }
  private emitStatus() { this.options.onStatusChanged?.(this.status()); }
  private listen(port: number) {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => void this.handle(request, response));
      server.requestTimeout = 5_000; server.headersTimeout = 5_000;
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); this.server = server; resolve(); });
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const origin = safeOrigin(request);
    if (!origin) { json(response, 403, { ok: false, error: "Extension origin rejected." }); return; }
    if (request.method === "OPTIONS") {
      response.statusCode = 204; response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Access-Control-Allow-Methods", "POST"); response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type"); response.setHeader("Access-Control-Max-Age", "600"); response.end(); return;
    }
    if (request.method !== "POST" || !["/v1/pair", "/v1/context"].includes(request.url ?? "")) { json(response, 404, { ok: false, error: "Not found." }, origin); return; }
    try {
      if (!this.options.canAccept()) { json(response, 409, { ok: false, error: "Open and sign in to Proactive AI IDE with a workspace first." }, origin); return; }
      const body = await readJson(request);
      if (request.url === "/v1/pair") { this.pair(body, origin, response); return; }
      await this.receive(body, request, origin, response);
    } catch (error) { json(response, 400, { ok: false, error: error instanceof Error ? error.message : "Invalid request." }, origin); }
  }

  private pair(body: unknown, origin: string, response: ServerResponse) {
    const code = body && typeof body === "object" && Object.keys(body).length === 1 ? (body as { code?: unknown }).code : null;
    if (typeof code !== "string" || !secureEqual(code, this.pairingCode)) {
      this.failedPairings += 1;
      if (this.failedPairings >= 5) { this.pairingCode = this.newPairingCode(); this.failedPairings = 0; this.emitStatus(); }
      json(response, 401, { ok: false, error: "Pairing code is invalid." }, origin); return;
    }
    const value = randomBytes(32).toString("base64url");
    this.token = { value, origin, expiresAt: (this.options.now?.() ?? Date.now()) + TOKEN_TTL_MS };
    this.pairingCode = this.newPairingCode(); this.failedPairings = 0; this.emitStatus();
    json(response, 200, { ok: true, token: value, expiresAt: this.token.expiresAt }, origin);
  }

  private async receive(body: unknown, request: IncomingMessage, origin: string, response: ServerResponse) {
    const token = this.validToken();
    const authorization = request.headers.authorization;
    if (!token || token.origin !== origin || typeof authorization !== "string" || !authorization.startsWith("Bearer ") || !secureEqual(authorization.slice(7), token.value)) { json(response, 401, { ok: false, error: "Pair the extension with the IDE again." }, origin); return; }
    const capture = validateChromeSelectedTextContext(body, this.options.now?.() ?? Date.now());
    if (!capture) { json(response, 422, { ok: false, error: "Selected-text payload failed desktop validation." }, origin); return; }
    if (this.captures.has(capture.captureId)) { json(response, 409, { ok: false, error: "This selection was already sent." }, origin); return; }
    const item = await createWebResearchContextTrayItem({ captureId: capture.captureId, selectedText: capture.selectedText, sourceTitle: capture.sourceTitle, sourceUrl: capture.sourceUrl, hostname: capture.hostname, capturedAt: capture.capturedAt });
    this.captures.set(capture.captureId, capture.capturedAt);
    const currentTime = this.options.now?.() ?? Date.now();
    this.captures.forEach((capturedAt, id) => { if (currentTime - capturedAt > MAX_CAPTURE_AGE_MS) this.captures.delete(id); });
    this.options.onContext(item);
    json(response, 200, { ok: true, itemId: item.id, redacted: item.redacted, truncated: item.truncated }, origin);
  }
}
