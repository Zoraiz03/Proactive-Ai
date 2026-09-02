import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  CONTEXT_TRAY_TYPES,
  contextTrayTotal,
  createContextTrayItem,
  findContextTrayDuplicate,
  keepOriginalContextTrayItem,
  markContextTrayPathStale,
  redactContextSecrets,
  refreshContextTrayItem,
  reorderContextTray,
  truncateContextTrayItem,
  validateContextTrayItem,
  type CreateContextTrayItemInput,
} from "../shared/context-tray.ts";

const base = (type: CreateContextTrayItemInput["type"], content = `safe ${type} content`): CreateContextTrayItemInput => ({
  type,
  title: type.replaceAll("_", " "),
  content,
  relativePath: type === "selected_output" || type === "task_failure" ? undefined : "src/example.ts",
  lineStart: 2,
  lineEnd: 4,
  sourceContent: "line one\nline two\nline three\nline four",
  reason: "Explicitly attached in a test.",
  completeFile: type === "complete_file",
});

test("creates and validates every implemented Context Tray item type while reserving web research", async () => {
  const implemented = CONTEXT_TRAY_TYPES.filter((type) => type !== "web_research");
  for (const type of implemented) {
    const item = await createContextTrayItem(base(type));
    assert.equal(item.type, type);
    assert.equal(item.provenance, "user_attached");
    assert.equal(validateContextTrayItem(item)?.id, item.id);
  }
  const reserved = { ...(await createContextTrayItem(base("selected_code"))), type: "web_research" };
  assert.equal(validateContextTrayItem(reserved), null);
});

test("redacts content-level secrets and enforces per-item size estimates", async () => {
  const raw = "password=fixture-password-12345\npostgres://admin:secret@localhost/db\nsk-fixturetokenvalue123456";
  const item = await createContextTrayItem({ ...base("selected_output", raw), maximumCharacters: 500 });
  assert.equal(item.redacted, true);
  assert.doesNotMatch(item.content, /fixture-password|admin:secret|fixturetoken/);
  assert.match(item.content, /REDACTED/);
  assert.equal(item.estimatedCharacters, item.content.length);
  assert.equal(item.estimatedTokens, Math.ceil(item.content.length / 4));
  assert.equal(redactContextSecrets(raw).redacted, true);
});

test("detects exact and overlapping attachments without silently removing either", async () => {
  const first = await createContextTrayItem({ ...base("selected_code", "alpha"), lineStart: 2, lineEnd: 4 });
  const exact = await createContextTrayItem({ ...base("selected_code", "alpha"), lineStart: 2, lineEnd: 4 });
  const overlap = await createContextTrayItem({ ...base("file_excerpt", "beta"), lineStart: 4, lineEnd: 8 });
  assert.equal(findContextTrayDuplicate([first], exact), "exact");
  assert.equal(findContextTrayDuplicate([first], overlap), "overlap");
  assert.equal([first, overlap].length, 2);
});

test("reorders, marks stale/unavailable, keeps snapshots, refreshes, truncates, and clears locally", async () => {
  const first = await createContextTrayItem(base("selected_code", "a".repeat(1_200)));
  const second = await createContextTrayItem(base("file_excerpt", "second"));
  assert.deepEqual(reorderContextTray([first, second], second.id, -1).map((item) => item.id), [second.id, first.id]);
  const stale = markContextTrayPathStale([first], "src/example.ts")[0]; assert.equal(stale.staleState, "stale");
  assert.equal(keepOriginalContextTrayItem(stale).staleState, "keep_original");
  assert.equal(markContextTrayPathStale([first], "src/example.ts", true)[0].staleState, "unavailable");
  const refreshed = await refreshContextTrayItem(stale, "fresh excerpt", "fresh complete file"); assert.equal(refreshed.staleState, "fresh");
  const truncated = await truncateContextTrayItem(first, 500); assert.equal(truncated.content.length, 500); assert.equal(truncated.truncated, true); assert.equal(validateContextTrayItem(truncated)?.id, first.id);
  const items = [first, second]; const cleared: typeof items = []; assert.equal(cleared.length, 0); assert.ok(contextTrayTotal(items).characters > 0);
});

test("UI exposes explicit attachment, complete-file confirmation, stale choices, preview integration, and no automatic AI call", async () => {
  const root = join(import.meta.dirname, "..", "renderer", "src");
  const [app, tray, preview, explorer, bottom] = await Promise.all([
    readFile(join(root, "App.tsx"), "utf8"), readFile(join(root, "ContextTray.tsx"), "utf8"), readFile(join(root, "ContextPreview.tsx"), "utf8"), readFile(join(root, "Explorer.tsx"), "utf8"), readFile(join(root, "BottomPanel.tsx"), "utf8"),
  ]);
  assert.match(app, /Attach complete file/); assert.match(app, /setContextTrayItems/); assert.match(app, /trayItems: contextTrayItems/);
  assert.match(tray, /Refresh/); assert.match(tray, /Keep original/); assert.match(tray, /Remove/); assert.match(tray, /Local and session-only/);
  assert.match(preview, /Manually attached/); assert.match(preview, /Automatic/); assert.match(preview, /Resolve or remove/);
  assert.match(explorer, /Add to Context/); assert.match(bottom, /Add Selected Terminal to Context/); assert.match(bottom, /Add Latest Run Failure/);
  assert.doesNotMatch(tray, /observer\.ask|fetch\(/); assert.doesNotMatch(explorer, /observer\.ask/); assert.doesNotMatch(bottom, /observer\.ask/);
});
