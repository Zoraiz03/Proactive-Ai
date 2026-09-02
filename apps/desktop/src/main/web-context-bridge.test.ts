import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { LocalWebContextBridge, validateChromeSelectedTextContext } from "./web-context-bridge.ts";
import { EncryptedWebContextStore } from "./web-context-store.ts";

const origin = `chrome-extension://${"a".repeat(32)}`;
const capture = (overrides: Record<string, unknown> = {}) => { const selectedText = "Selected browser documentation", sourceUrl = "https://docs.example.test/guide?secret=no#part"; return { schemaVersion: 1, captureId: randomUUID(), selectedText, sourceTitle: "Reference", sourceUrl, hostname: "docs.example.test", sourceId: `web-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16)}`, capturedAt: Date.now(), contentHash: createHash("sha256").update(selectedText).digest("hex"), characterCount: selectedText.length, truncated: false, userEdited: false, provenance: "chrome_selected_text", ...overrides }; };
const envelope = (value = capture()) => ({ protocolVersion: 1, transferId: randomUUID(), sentAt: Date.now(), idempotencyKey: value.contentHash, context: value });
const post = (endpoint: string, path: string, body: unknown, token?: string, requestOrigin = origin) => fetch(`${endpoint}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close", Origin: requestOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test("strictly validates browser payload hashes, source, age, and exact schema", () => { const valid = capture(); assert.ok(validateChromeSelectedTextContext(valid)); assert.equal(validateChromeSelectedTextContext({ ...valid, contentHash: "0".repeat(64) }), null); assert.equal(validateChromeSelectedTextContext({ ...valid, sourceUrl: "file:///tmp/private" }), null); assert.equal(validateChromeSelectedTextContext({ ...valid, unexpected: true }), null); assert.equal(validateChromeSelectedTextContext({ ...valid, capturedAt: Date.now() - 11 * 60_000 }), null); });

test("requires user-started pairing, authenticated health, review, and explicit acceptance", async (context) => {
  let pending: unknown = null; const bridge = new LocalWebContextBridge({ canAccept: () => true, onPendingChanged: (item) => { pending = item; } });
  await bridge.initialize(); await bridge.setEnabled(true); context.after(() => bridge.stop());
  const initial = bridge.status(); assert.ok(initial.port); assert.equal(initial.pairingCode, null); bridge.startPairing(); const pairingCode = bridge.status().pairingCode; assert.match(pairingCode ?? "", /^\d{8}$/);
  const endpoint = `http://127.0.0.1:${initial.port}`;
  assert.equal((await post(endpoint, "/v1/pair", { code: pairingCode, deviceName: "Chrome test", protocolVersion: 1 }, undefined, "https://example.test")).status, 403);
  const paired = await post(endpoint, "/v1/pair", { code: pairingCode, deviceName: "Chrome test", protocolVersion: 1 }); const pairedBody = await paired.json() as { token: string }; assert.equal(paired.status, 200); assert.equal(bridge.status().paired, true);
  assert.equal((await post(endpoint, "/v1/status", { protocolVersion: 1 })).status, 401);
  assert.equal((await post(endpoint, "/v1/status", { protocolVersion: 1 }, pairedBody.token)).status, 200);
  const selectedText = "password=fixture-password-12345"; const itemCapture = capture({ selectedText, characterCount: selectedText.length, contentHash: createHash("sha256").update(selectedText).digest("hex") }); const transfer = envelope(itemCapture);
  const sent = await post(endpoint, "/v1/context", transfer, pairedBody.token); assert.equal(sent.status, 202); assert.doesNotMatch(JSON.stringify(pending), /fixture-password/); assert.equal((pending as { sourceUrl: string }).sourceUrl.includes("?"), false);
  const accepted = await bridge.accept(transfer.transferId); assert.equal(accepted.type, "web_research"); assert.doesNotMatch(accepted.content, /fixture-password/);
  assert.equal((await post(endpoint, "/v1/context", transfer, pairedBody.token)).status, 409);
  const queued: Array<ReturnType<typeof envelope>> = []; for (let index = 0; index < 5; index += 1) { const value = capture({ selectedText: `queue item ${index}`, characterCount: 12, contentHash: createHash("sha256").update(`queue item ${index}`).digest("hex") }); const next = envelope(value); queued.push(next); assert.equal((await post(endpoint, "/v1/context", next, pairedBody.token)).status, 202); }
  const overflowText = "queue overflow", overflow = envelope(capture({ selectedText: overflowText, characterCount: overflowText.length, contentHash: createHash("sha256").update(overflowText).digest("hex") })); assert.equal((await post(endpoint, "/v1/context", overflow, pairedBody.token)).status, 429);
  bridge.reject(queued[0].transferId); assert.equal((await post(endpoint, "/v1/context", queued[0], pairedBody.token)).status, 409);
  await bridge.revoke(); assert.equal((await post(endpoint, "/v1/status", { protocolVersion: 1 }, pairedBody.token)).status, 401);
});

test("pairing expires, queue is bounded, and disable stops the receiver", async (context) => {
  let now = Date.now(); const bridge = new LocalWebContextBridge({ canAccept: () => true, now: () => now }); await bridge.initialize(); await bridge.setEnabled(true); context.after(() => bridge.stop()); bridge.startPairing(); const code = bridge.status().pairingCode; now += 121_000;
  const endpoint = `http://127.0.0.1:${bridge.status().port}`; const expired = await post(endpoint, "/v1/pair", { code, deviceName: "Chrome", protocolVersion: 1 }); assert.equal(expired.status, 410);
  await bridge.setEnabled(false); assert.equal(bridge.status().port, null); assert.equal(bridge.status().enabled, false);
});

test("desktop pairing persistence is encrypted, owner-scoped, revocable, and corruption-safe", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "proactive-web-pairing-")); context.after(() => rm(directory, { recursive: true, force: true })); const path = join(directory, "pairing.enc");
  const encryption = { isAvailable: async () => true, encrypt: async (value: string) => Buffer.from(`encrypted:${value}`, "utf8"), decrypt: async (value: Buffer) => ({ value: value.toString("utf8").replace(/^encrypted:/, ""), shouldReEncrypt: false }) };
  const store = new EncryptedWebContextStore(path, encryption); const value = { version: 1 as const, enabled: true, token: "a".repeat(43), origin, deviceName: "Chrome test", createdAt: Date.now() };
  await store.save(value); assert.doesNotMatch((await readFile(path)).toString("utf8"), /^\{/); assert.deepEqual(await store.load(), value); await store.clear(); assert.equal(await store.load(), null);
  await writeFile(path, "corrupted", { mode: 0o600 }); assert.equal(await store.load(), null);
});
