import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { LocalWebContextBridge, validateChromeSelectedTextContext } from "./web-context-bridge.ts";

const origin = `chrome-extension://${"a".repeat(32)}`;
const capture = (overrides: Record<string, unknown> = {}) => {
  const selectedText = "Selected browser documentation";
  const sourceUrl = "https://docs.example.test/guide";
  return {
    schemaVersion: 1, captureId: randomUUID(), selectedText, sourceTitle: "Reference", sourceUrl, hostname: "docs.example.test",
    sourceId: `web-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16)}`, capturedAt: Date.now(),
    contentHash: createHash("sha256").update(selectedText).digest("hex"), characterCount: selectedText.length,
    truncated: false, userEdited: false, provenance: "chrome_selected_text", ...overrides,
  };
};

test("strictly validates browser payload hashes, source, age, and exact schema", () => {
  const valid = capture(); assert.ok(validateChromeSelectedTextContext(valid));
  assert.equal(validateChromeSelectedTextContext({ ...valid, contentHash: "0".repeat(64) }), null);
  assert.equal(validateChromeSelectedTextContext({ ...valid, sourceUrl: "file:///tmp/private" }), null);
  assert.equal(validateChromeSelectedTextContext({ ...valid, unexpected: true }), null);
  assert.equal(validateChromeSelectedTextContext({ ...valid, capturedAt: Date.now() - 11 * 60 * 1000 }), null);
});

test("pairs one extension origin and delivers one redacted Context Tray item", async (context) => {
  const received: unknown[] = []; let allowed = true;
  const bridge = new LocalWebContextBridge({ canAccept: () => allowed, onContext: (item) => received.push(item) });
  await bridge.start(); context.after(() => bridge.stop());
  const initial = bridge.status(); assert.ok(initial.port); assert.match(initial.pairingCode ?? "", /^\d{8}$/);
  const endpoint = `http://127.0.0.1:${initial.port}`;
  const denied = await fetch(`${endpoint}/v1/pair`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.test" }, body: JSON.stringify({ code: initial.pairingCode }) });
  assert.equal(denied.status, 403);
  const paired = await fetch(`${endpoint}/v1/pair`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ code: initial.pairingCode }) });
  const pairedBody = await paired.json() as { token: string }; assert.equal(paired.status, 200); assert.equal(bridge.status().paired, true);
  const itemCapture = capture({ selectedText: "password=fixture-password-12345", characterCount: 31, contentHash: createHash("sha256").update("password=fixture-password-12345").digest("hex") });
  const sent = await fetch(`${endpoint}/v1/context`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${pairedBody.token}` }, body: JSON.stringify(itemCapture) });
  assert.equal(sent.status, 200); assert.equal(received.length, 1); assert.doesNotMatch(JSON.stringify(received[0]), /fixture-password/);
  const replay = await fetch(`${endpoint}/v1/context`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${pairedBody.token}` }, body: JSON.stringify(itemCapture) });
  assert.equal(replay.status, 409);
  allowed = false;
  const unavailable = await fetch(`${endpoint}/v1/context`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${pairedBody.token}` }, body: JSON.stringify(capture()) });
  assert.equal(unavailable.status, 409);
});
