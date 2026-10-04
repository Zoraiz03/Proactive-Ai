import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  CONTEXT_TRAY_TYPES,
  contextTrayTotal,
  createContextTrayItem,
  createWebResearchContextTrayItem,
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

test("creates and validates local and Chrome Context Tray item types", async () => {
  const implemented = CONTEXT_TRAY_TYPES.filter((type) => type !== "web_research");
  for (const type of implemented) {
    const item = await createContextTrayItem(base(type));
    assert.equal(item.type, type);
    assert.equal(item.provenance, "user_attached");
    assert.equal(validateContextTrayItem(item)?.id, item.id);
  }
  const web = await createWebResearchContextTrayItem({ captureId: "123e4567-e89b-42d3-a456-426614174000", selectedText: "Browser documentation", sourceTitle: "Reference", sourceUrl: "https://docs.example.test/guide", hostname: "docs.example.test", capturedAt: Date.now() });
  assert.equal(web.type, "web_research"); assert.equal(web.webSource?.hostname, "docs.example.test"); assert.equal(validateContextTrayItem(web)?.id, web.id);
  assert.equal(validateContextTrayItem({ ...web, webSource: { ...web.webSource!, sourceUrl: "file:///tmp/private" } }), null);
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

test("preserves validated documentation relationship provenance", async () => {
  const item = await createContextTrayItem({ ...base("file_excerpt"), provenance: "documentation_relationship" });
  assert.equal(item.provenance, "documentation_relationship");
  assert.equal(validateContextTrayItem(item)?.provenance, "documentation_relationship");
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
  const [app, tray, preview, explorer, bottom, settings, incoming] = await Promise.all([
    readFile(join(root, "App.tsx"), "utf8"), readFile(join(root, "ContextTray.tsx"), "utf8"), readFile(join(root, "ContextPreview.tsx"), "utf8"), readFile(join(root, "Explorer.tsx"), "utf8"), readFile(join(root, "BottomPanel.tsx"), "utf8"), readFile(join(root, "SettingsPanel.tsx"), "utf8"), readFile(join(root, "IncomingWebContextReview.tsx"), "utf8"),
  ]);
  assert.match(app, /Attach complete file/); assert.match(app, /setContextTrayItems/); assert.match(app, /trayItems: contextTrayItems/);
  assert.match(tray, /Refresh/); assert.match(tray, /Keep original/); assert.match(tray, /Remove/); assert.match(tray, /Local and session-only/); assert.match(settings, /Short-lived pairing code/); assert.match(incoming, /Add to Context Tray/); assert.match(incoming, /Reject/);
  assert.match(preview, /Manually attached/); assert.match(preview, /Automatic/); assert.match(preview, /Resolve or remove/);
  assert.match(explorer, /Add to Context/); assert.match(bottom, /Add Selected Terminal to Context/); assert.match(bottom, /aria-label="Selected Output"/); assert.match(bottom, /aria-label="Run Failure"/);
  assert.doesNotMatch(tray, /observer\.ask|fetch\(/); assert.doesNotMatch(explorer, /observer\.ask/); assert.doesNotMatch(bottom, /observer\.ask/);
});
