import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { parseStructuredObserverEdit, validateAndBuildProposedEdit } from "../shared/ai-edit.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const content = "const answer = 41;\nconsole.log(answer);\n";
const base = { targetRelativePath: "src/app.ts", originalContentHash: hash(content), contentLength: content.length, basedOnUnsavedContent: true };
const replacement = { targetRelativePath: "src/app.ts", originalContentHash: hash(content), editType: "replace" as const,
  range: { start: { line: 1, column: 16 }, end: { line: 1, column: 18 } }, expectedOriginalText: "41", replacementText: "42" };

test("builds a valid replacement diff from dirty in-memory content", () => {
  const result = validateAndBuildProposedEdit(replacement, base, content, hash(content));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.proposedContent, "const answer = 42;\nconsole.log(answer);\n");
  assert.equal(base.basedOnUnsavedContent, true);
});

test("supports bounded insertion and deletion", () => {
  const insertion = { ...replacement, editType: "insert" as const, range: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } }, expectedOriginalText: "", replacementText: "// result\n" };
  const deletion = { ...replacement, editType: "delete" as const, range: { start: { line: 2, column: 1 }, end: { line: 2, column: 21 } }, expectedOriginalText: "console.log(answer);", replacementText: "" };
  assert.equal(validateAndBuildProposedEdit(insertion, base, content, hash(content)).ok, true);
  assert.equal(validateAndBuildProposedEdit(deletion, base, content, hash(content)).ok, true);
});

test("rejects malformed, reversed, traversal, and oversized edits", () => {
  assert.equal(parseStructuredObserverEdit({ ...replacement, extra: true }), null);
  assert.equal(parseStructuredObserverEdit({ ...replacement, targetRelativePath: "../secret" }), null);
  assert.equal(validateAndBuildProposedEdit({ ...replacement, range: { start: { line: 2, column: 2 }, end: { line: 1, column: 1 } } }, base, content, hash(content)).ok, false);
  assert.equal(parseStructuredObserverEdit({ ...replacement, replacementText: "x".repeat(50_001) }), null);
});

test("rejects target, hash, stale-content, and expected-text mismatches", () => {
  for (const edit of [{ ...replacement, targetRelativePath: "src/other.ts" }, { ...replacement, originalContentHash: hash("other") }, { ...replacement, expectedOriginalText: "99" }]) {
    assert.equal(validateAndBuildProposedEdit(edit, base, content, hash(content)).ok, false);
  }
  const stale = validateAndBuildProposedEdit(replacement, base, `${content}// newer`, hash(`${content}// newer`));
  assert.deepEqual(stale.ok ? null : stale.reason, "hash_mismatch");
});

test("single-edit schema makes overlapping edit batches impossible", () => {
  assert.equal(parseStructuredObserverEdit([replacement, replacement]), null);
});
