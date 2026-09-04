import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createWebResearchContextTrayItem, redactContextSecrets, type ContextTrayItem } from "../shared/context-tray.ts";
import { WEB_CONTEXT_PROTOCOL_VERSION, type IncomingWebContext, type WebContextBridgeStatus } from "../shared/web-context-bridge.ts";
import type { EncryptedWebContextStore, StoredWebContextPairing } from "./web-context-store.ts";

export const WEB_CONTEXT_PORT = 32145;
const MAX_BODY_BYTES = 16_384, MAX_CAPTURE_AGE_MS = 10 * 60_000, PAIRING_TTL_MS = 2 * 60_000, QUEUE_LIMIT = 5;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export interface ChromeSelectedTextContext { schemaVersion: 1; captureId: string; selectedText: string; sourceTitle: string; sourceUrl: string; hostname: string; sourceId: string; capturedAt: number; contentHash: string; characterCount: number; truncated: boolean; userEdited: boolean; provenance: "chrome_selected_text" }
interface TransferEnvelope { protocolVersion: 1; transferId: string; sentAt: number; idempotencyKey: string; context: ChromeSelectedTextContext }
export interface WebContextBridgeOptions {
  canAccept: () => boolean; store?: EncryptedWebContextStore; expectedOrigin?: string;
  onPendingChanged?: (item: IncomingWebContext | null) => void;
  onStatusChanged?: (status: WebContextBridgeStatus) => void; now?: () => number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const secureEqual = (left: string, right: string) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).length === allowed.length && allowed.every((key) => key in value);
const safeUrl = (value: string): URL | null => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && Boolean(url.hostname) ? url : null; } catch { return null; } };
const responseOrigin = (request: IncomingMessage) => typeof request.headers.origin === "string" && EXTENSION_ORIGIN.test(request.headers.origin) ? request.headers.origin : null;
const json = (response: ServerResponse, status: number, body: object, origin?: string) => { response.statusCode = status; response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("X-Proactive-Bridge", "1"); if (origin) response.setHeader("Access-Control-Allow-Origin", origin); response.end(JSON.stringify(body)); };
const readJson = async (request: IncomingMessage): Promise<unknown> => { const type = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase(); if (type !== "application/json") throw new Error("invalid_request"); const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > MAX_BODY_BYTES) throw new Error("payload_too_large"); chunks.push(bytes); } return JSON.parse(Buffer.concat(chunks).toString("utf8")); };

export function validateChromeSelectedTextContext(value: unknown, now = Date.now()): ChromeSelectedTextContext | null {
  if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>;
  if (!exactKeys(item, ["schemaVersion", "captureId", "selectedText", "sourceTitle", "sourceUrl", "hostname", "sourceId", "capturedAt", "contentHash", "characterCount", "truncated", "userEdited", "provenance"])) return null;
  if (item.schemaVersion !== 1 || typeof item.captureId !== "string" || !uuid.test(item.captureId)) return null;
  if (typeof item.selectedText !== "string" || !item.selectedText.trim() || item.selectedText.length > 10_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(item.selectedText)) return null;
  if (typeof item.sourceTitle !== "string" || !item.sourceTitle || item.sourceTitle.length > 300 || /[\u0000-\u001F\u007F]/.test(item.sourceTitle) || typeof item.sourceUrl !== "string" || item.sourceUrl.length > 4096 || typeof item.hostname !== "string" || item.hostname.length > 253) return null;
  const url = safeUrl(item.sourceUrl); if (!url || url.hostname !== item.hostname) return null;
  if (typeof item.capturedAt !== "number" || !Number.isInteger(item.capturedAt) || item.capturedAt > now + 60_000 || now - item.capturedAt > MAX_CAPTURE_AGE_MS) return null;
  if (item.characterCount !== item.selectedText.length || typeof item.truncated !== "boolean" || typeof item.userEdited !== "boolean" || item.provenance !== "chrome_selected_text") return null;
  if (item.contentHash !== sha256(item.selectedText) || item.sourceId !== `web-${sha256(url.toString()).slice(0, 16)}`) return null;
  return item as unknown as ChromeSelectedTextContext;
}

const validateEnvelope = (value: unknown, now: number): TransferEnvelope | null => {
  if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>;
  if (!exactKeys(item, ["protocolVersion", "transferId", "sentAt", "idempotencyKey", "context"]) || item.protocolVersion !== WEB_CONTEXT_PROTOCOL_VERSION || typeof item.transferId !== "string" || !uuid.test(item.transferId) || typeof item.idempotencyKey !== "string" || !/^[a-f0-9]{64}$/.test(item.idempotencyKey) || !Number.isInteger(item.sentAt) || Math.abs(now - Number(item.sentAt)) > MAX_CAPTURE_AGE_MS) return null;
  const context = validateChromeSelectedTextContext(item.context, now); return context && item.idempotencyKey === context.contentHash ? { protocolVersion: 1, transferId: item.transferId, sentAt: Number(item.sentAt), idempotencyKey: item.idempotencyKey, context } : null;
};

export class LocalWebContextBridge {
  private server: Server | null = null; private pairing: { code: string; expiresAt: number } | null = null;
  private paired: StoredWebContextPairing | null = null; private enabled = false; private secureStorage = false;
  private pairingTimer: ReturnType<typeof setTimeout> | null = null; private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeenAt = 0; private readonly queue: IncomingWebContext[] = []; private readonly outcomes = new Map<string, "accepted" | "rejected">();
  private readonly attempts = new Map<string, number[]>(); private readonly options: WebContextBridgeOptions;
  constructor(options: WebContextBridgeOptions) { this.options = options; }
  private now() { return this.options.now?.() ?? Date.now(); }
  async initialize() { this.secureStorage = await (this.options.store?.available() ?? Promise.resolve(true)); this.paired = await (this.options.store?.load() ?? Promise.resolve(null)); this.enabled = Boolean(this.paired); if (this.enabled) await this.start(); else this.emitStatus(); }
  status(): WebContextBridgeStatus {
    if (this.pairing && this.pairing.expiresAt <= this.now()) this.pairing = null;
    const available = this.secureStorage && (!this.enabled || this.server !== null), connected = Boolean(this.paired && this.now() - this.lastSeenAt < 30_000);
    const message = !this.secureStorage ? "Secure operating-system storage is unavailable." : !this.enabled ? "Browser integration is disabled." : !available ? "Local browser bridge could not start." : !this.paired ? "Not Paired" : connected ? "Connected" : "Disconnected";
    return { available, enabled: this.enabled, paired: Boolean(this.paired), connected, pairingCode: this.pairing?.code ?? null, pairingExpiresAt: this.pairing?.expiresAt ?? null, pairedDevice: this.paired?.deviceName ?? null, port: this.server ? WEB_CONTEXT_PORT : null, message };
  }
  async setEnabled(enabled: boolean) { if (!enabled) { await this.revoke(); this.enabled = false; await this.stop(); return; } if (!this.secureStorage) throw new Error("Secure operating-system storage is unavailable."); this.enabled = true; await this.start(); }
  startPairing() { if (!this.enabled || !this.server) throw new Error("Enable browser integration first."); this.cancelPairingTimer(); this.pairing = { code: randomInt(10_000_000, 100_000_000).toString(), expiresAt: this.now() + PAIRING_TTL_MS }; this.pairingTimer = setTimeout(() => { this.pairing = null; this.pairingTimer = null; this.emitStatus(); }, PAIRING_TTL_MS); this.emitStatus(); }
  cancelPairing() { this.cancelPairingTimer(); this.pairing = null; this.emitStatus(); }
  async revoke() { this.cancelPairingTimer(); if (this.connectionTimer) clearTimeout(this.connectionTimer); this.connectionTimer = null; this.pairing = null; this.paired = null; this.lastSeenAt = 0; this.queue.splice(0); this.outcomes.clear(); await this.options.store?.clear(); this.emitPending(); this.emitStatus(); }
  async accept(transferId: string): Promise<ContextTrayItem> { const index = this.queue.findIndex((item) => item.transferId === transferId); if (index < 0) throw new Error("Incoming selection is no longer available."); const pending = this.queue.splice(index, 1)[0]; const item = await createWebResearchContextTrayItem({ captureId: pending.captureId, selectedText: pending.selectedText, sourceTitle: pending.sourceTitle, sourceUrl: pending.sourceUrl, hostname: pending.hostname, capturedAt: pending.capturedAt }); this.outcomes.set(pending.idempotencyKey, "accepted"); this.emitPending(); return item; }
  reject(transferId: string) { const index = this.queue.findIndex((item) => item.transferId === transferId); if (index < 0) throw new Error("Incoming selection is no longer available."); const [pending] = this.queue.splice(index, 1); this.outcomes.set(pending.idempotencyKey, "rejected"); this.emitPending(); }
  async start() { if (this.server) return; try { await new Promise<void>((resolve, reject) => { const server = createServer((request, response) => void this.handle(request, response)); server.requestTimeout = 5_000; server.headersTimeout = 5_000; server.once("error", reject); server.listen(WEB_CONTEXT_PORT, "127.0.0.1", () => { server.removeListener("error", reject); this.server = server; resolve(); }); }); } catch { this.server = null; } this.emitStatus(); }
  async stop() { const server = this.server; this.server = null; this.cancelPairingTimer(); this.pairing = null; if (this.connectionTimer) clearTimeout(this.connectionTimer); this.connectionTimer = null; if (server) await new Promise<void>((resolve) => server.close(() => resolve())); this.emitStatus(); }
  private cancelPairingTimer() { if (this.pairingTimer) clearTimeout(this.pairingTimer); this.pairingTimer = null; }
  private markConnected() { this.lastSeenAt = this.now(); if (this.connectionTimer) clearTimeout(this.connectionTimer); this.connectionTimer = setTimeout(() => { this.connectionTimer = null; this.emitStatus(); }, 30_001); this.emitStatus(); }
  private emitStatus() { this.options.onStatusChanged?.(this.status()); }
  private emitPending() { this.options.onPendingChanged?.(this.queue[0] ? { ...this.queue[0], queueDepth: this.queue.length } : null); }
  private allowedOrigin(origin: string) { return (!this.options.expectedOrigin || origin === this.options.expectedOrigin) && (!this.paired || origin === this.paired.origin); }
  private limited(key: string, maximum: number) { const cutoff = this.now() - 60_000, values = (this.attempts.get(key) ?? []).filter((value) => value > cutoff); values.push(this.now()); this.attempts.set(key, values); return values.length > maximum; }
  private authorized(request: IncomingMessage, origin: string) { const header = request.headers.authorization; return Boolean(this.paired && origin === this.paired.origin && typeof header === "string" && header.startsWith("Bearer ") && secureEqual(header.slice(7), this.paired.token)); }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    const origin = responseOrigin(request); if (!origin || !this.allowedOrigin(origin)) { json(response, 403, { ok: false, error: "origin_rejected" }); return; }
    if (request.method === "OPTIONS") { response.statusCode = 204; response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Access-Control-Allow-Methods", "POST"); response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type"); response.setHeader("Access-Control-Max-Age", "600"); response.setHeader("X-Proactive-Bridge", "1"); response.end(); return; }
    const path = request.url ?? ""; if (request.method !== "POST" || !["/v1/pair", "/v1/status", "/v1/context", "/v1/disconnect"].includes(path)) { json(response, 404, { ok: false, error: "not_found" }, origin); return; }
    try {
      if (!this.options.canAccept()) { json(response, 409, { ok: false, error: "desktop_unavailable" }, origin); return; }
      if (this.limited(`${origin}:${path}`, path === "/v1/pair" ? 5 : 60)) { json(response, 429, { ok: false, error: "rate_limited" }, origin); return; }
      const body = await readJson(request);
      if (path === "/v1/pair") { await this.pair(body, origin, response); return; }
      if (!this.authorized(request, origin)) { json(response, 401, { ok: false, error: "pairing_required" }, origin); return; }
      this.markConnected();
      if (path === "/v1/disconnect") { if (!body || typeof body !== "object" || !exactKeys(body as Record<string, unknown>, ["protocolVersion"]) || (body as { protocolVersion?: unknown }).protocolVersion !== 1) { json(response, 422, { ok: false, error: "protocol_mismatch" }, origin); return; } json(response, 200, { ok: true, protocolVersion: 1 }, origin); await this.revoke(); return; }
      if (path === "/v1/status") { if (!body || typeof body !== "object" || !exactKeys(body as Record<string, unknown>, ["protocolVersion"]) || (body as { protocolVersion?: unknown }).protocolVersion !== 1) { json(response, 422, { ok: false, error: "protocol_mismatch" }, origin); return; } json(response, 200, { ok: true, protocolVersion: 1, status: "connected" }, origin); return; }
      this.receive(body, origin, response);
    } catch (error) { const kind = error instanceof Error ? error.message : "invalid_request"; json(response, kind === "payload_too_large" ? 413 : 400, { ok: false, error: ["payload_too_large", "invalid_request"].includes(kind) ? kind : "invalid_request" }, origin); }
  }
  private async pair(body: unknown, origin: string, response: ServerResponse) {
    const pair = this.pairing; const code = body && typeof body === "object" && exactKeys(body as Record<string, unknown>, ["code", "deviceName", "protocolVersion"]) ? (body as { code?: unknown; deviceName?: unknown; protocolVersion?: unknown }) : null;
    if (!pair || pair.expiresAt <= this.now()) { this.pairing = null; json(response, 410, { ok: false, error: "pairing_expired" }, origin); this.emitStatus(); return; }
    if (!code || code.protocolVersion !== 1 || typeof code.deviceName !== "string" || !code.deviceName.trim() || code.deviceName.length > 80 || typeof code.code !== "string" || !secureEqual(code.code, pair.code)) { json(response, 401, { ok: false, error: "invalid_pairing_code" }, origin); return; }
    const paired: StoredWebContextPairing = { version: 1, enabled: true, token: randomBytes(32).toString("base64url"), origin, deviceName: code.deviceName.trim(), createdAt: this.now() };
    await this.options.store?.save(paired); this.paired = paired; this.cancelPairingTimer(); this.pairing = null; this.markConnected(); json(response, 200, { ok: true, token: paired.token, protocolVersion: 1 }, origin);
  }
  private receive(body: unknown, origin: string, response: ServerResponse) {
    const transfer = validateEnvelope(body, this.now()); if (!transfer) { json(response, 422, { ok: false, error: "invalid_transfer" }, origin); return; }
    const prior = this.outcomes.get(transfer.idempotencyKey); if (prior) { json(response, 409, { ok: false, error: prior === "accepted" ? "duplicate_transfer" : "transfer_rejected" }, origin); return; }
    if (this.queue.some((item) => item.idempotencyKey === transfer.idempotencyKey || item.captureId === transfer.context.captureId)) { json(response, 409, { ok: false, error: "duplicate_transfer" }, origin); return; }
    if (this.queue.length >= QUEUE_LIMIT) { json(response, 429, { ok: false, error: "review_queue_full" }, origin); return; }
    const redacted = redactContextSecrets(transfer.context.selectedText); const text = redacted.content.slice(0, 10_000); const clean = new URL(transfer.context.sourceUrl); clean.search = ""; clean.hash = "";
    this.queue.push({ transferId: transfer.transferId, idempotencyKey: transfer.idempotencyKey, captureId: transfer.context.captureId, selectedText: text, sourceTitle: transfer.context.sourceTitle, sourceUrl: clean.toString(), hostname: transfer.context.hostname, capturedAt: transfer.context.capturedAt, characterCount: text.length, redacted: redacted.redacted, truncated: transfer.context.truncated || text.length < redacted.content.length, userEdited: transfer.context.userEdited, receivedAt: this.now(), queueDepth: this.queue.length + 1 });
    this.emitPending(); json(response, 202, { ok: true, status: "queued", protocolVersion: 1 }, origin);
  }
}
