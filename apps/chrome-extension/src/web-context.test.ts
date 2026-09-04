import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SELECTED_TEXT_CHARACTERS,
  createWebContext,
  editWebContext,
  hashText,
  safeWebUrl,
  sanitizeSelectedText,
  validateWebContext,
} from "./web-context.ts";

test("creates the versioned selected-text contract with deterministic hashes", async () => {
  const capture = await createWebContext({
    selectedText: "const answer = 42;",
    sourceTitle: "Example documentation",
    sourceUrl: "https://docs.example.test/guide?q=1",
    capturedAt: 1_750_000_000_000,
    captureId: "123e4567-e89b-12d3-a456-426614174000",
  });

  assert.equal(capture.schemaVersion, 1);
  assert.equal(capture.provenance, "chrome_selected_text");
  assert.equal(capture.hostname, "docs.example.test");
  assert.equal(capture.characterCount, 18);
  assert.equal(capture.contentHash, await hashText(capture.selectedText));
  assert.equal(capture.sourceId, `web-${(await hashText(capture.sourceUrl)).slice(0, 16)}`);
  assert.deepEqual(validateWebContext(capture), capture);
});

test("rejects empty selection and unsupported or credential-bearing URLs", async () => {
  await assert.rejects(() => createWebContext({ selectedText: " \n ", sourceTitle: "Empty", sourceUrl: "https://example.test" }), /non-empty/);
  for (const sourceUrl of ["chrome://settings", "file:///tmp/private", "javascript:alert(1)", "not a URL", "https://user:password@example.test/"]) {
    assert.equal(safeWebUrl(sourceUrl), null);
    await assert.rejects(() => createWebContext({ selectedText: "safe", sourceTitle: "Page", sourceUrl }), /HTTP and HTTPS/);
  }
});

test("normalizes line endings, removes controls, and truncates oversized selections", async () => {
  assert.equal(sanitizeSelectedText("one\r\ntwo\rthree\u0000\u0007\ttab"), "one\ntwo\nthree\ttab");
  const capture = await createWebContext({ selectedText: "x".repeat(MAX_SELECTED_TEXT_CHARACTERS + 50), sourceTitle: "Big", sourceUrl: "http://example.test" });
  assert.equal(capture.selectedText.length, MAX_SELECTED_TEXT_CHARACTERS);
  assert.equal(capture.characterCount, MAX_SELECTED_TEXT_CHARACTERS);
  assert.equal(capture.truncated, true);
});

test("local editing preserves provenance while updating content metadata", async () => {
  const original = await createWebContext({
    selectedText: "Original",
    sourceTitle: "Page",
    sourceUrl: "https://example.test/article",
    capturedAt: 1234,
    captureId: "123e4567-e89b-12d3-a456-426614174000",
  });
  const edited = await editWebContext(original, "Edited\r\ntext");

  assert.equal(edited.selectedText, "Edited\ntext");
  assert.equal(edited.userEdited, true);
  assert.equal(edited.captureId, original.captureId);
  assert.equal(edited.sourceUrl, original.sourceUrl);
  assert.equal(edited.contentHash, await hashText(edited.selectedText));
  await assert.rejects(() => editWebContext(original, "   "), /cannot be empty/);
});

test("strict validation rejects malformed, oversized, unsafe, and augmented records", async () => {
  const capture = await createWebContext({ selectedText: "Safe", sourceTitle: "Page", sourceUrl: "https://example.test" });
  assert.equal(validateWebContext({ ...capture, unexpected: true }), null);
  assert.equal(validateWebContext({ ...capture, schemaVersion: 2 }), null);
  assert.equal(validateWebContext({ ...capture, selectedText: "x".repeat(MAX_SELECTED_TEXT_CHARACTERS + 1) }), null);
  assert.equal(validateWebContext({ ...capture, selectedText: "bad\u0000text", characterCount: 8 }), null);
  assert.equal(validateWebContext({ ...capture, sourceUrl: "chrome://settings" }), null);
});
