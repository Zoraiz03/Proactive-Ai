import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { detectDocumentationRelationships, visibleDocumentationRelationships, type ChangedCodeSource, type DocumentationSource } from "../shared/documentation-impact.ts";

const change = (overrides: Partial<ChangedCodeSource> = {}): ChangedCodeSource => ({
  relativePath: "src/users.ts", originalContent: "export const oldValue = 1;", currentContent: "export function getUser() { return fetch('/api/users/:id'); }\nconst API_TOKEN = process.env.API_TOKEN;", kind: "modified", ...overrides,
});
const docs: DocumentationSource[] = [{ relativePath: "docs/API.md", content: "Use [`getUser`](../src/users.ts) with `/api/users/:id`. Configure `API_TOKEN`." }];

test("detects deterministic file, Markdown link, symbol, API route, and configuration relationships", async () => {
  const items = await detectDocumentationRelationships([change()], docs, [], 123);
  assert.ok(items.some((item) => item.type === "file_path" && item.confidence === "high"));
  assert.ok(items.some((item) => item.type === "project_link" && item.confidence === "high"));
  assert.ok(items.some((item) => item.type === "symbol" && item.reference === "getUser"));
  assert.ok(items.some((item) => item.type === "api_route" && item.reference === "/api/users/:id"));
  assert.ok(items.some((item) => item.type === "configuration_key" && item.reference === "API_TOKEN"));
  assert.ok(items.every((item) => item.detectedAt === 123 && item.status === "stale" && /^[a-f0-9]{64}$/.test(item.codeHash) && /^[a-f0-9]{64}$/.test(item.documentationHash)));
});

test("detects package scripts, README setup, test documentation, and renames", async () => {
  const packageItems = await detectDocumentationRelationships([{ relativePath: "package.json", originalContent: "{}", currentContent: '{"scripts":{"verify":"node --test"}}', kind: "modified" }], [{ relativePath: "README.md", content: "## Setup\nRun `npm run verify` after install." }]);
  assert.ok(packageItems.some((item) => item.type === "package_script" && item.confidence === "high"));
  assert.ok(packageItems.some((item) => item.type === "package_script" && item.reference === "verify"));
  assert.ok(packageItems.some((item) => item.type === "readme_setup"));
  const testItems = await detectDocumentationRelationships([change({ relativePath: "src/users.test.ts", originalPath: "src/user.test.ts", kind: "renamed", originalContent: "", currentContent: "test('user', () => {})" })], [{ relativePath: "docs/testing.md", content: "Tests live in `src/users.test.ts` and previously src/user.test.ts." }]);
  assert.ok(testItems.some((item) => item.type === "test_documentation"));
  assert.ok(testItems.some((item) => item.type === "test_documentation" && item.confidence === "high"));
  assert.ok(testItems.some((item) => item.reference === "src/user.test.ts"));
});

test("removed routes, symbols, scripts, and configuration keys remain actionable evidence", async () => {
  const removed = await detectDocumentationRelationships([change({ originalContent: "export function legacyUser() { return fetch('/api/legacy'); }\nconst OLD_TOKEN = process.env.OLD_TOKEN;", currentContent: "export const replacement = true;" })], [{ relativePath: "guide.mdx", content: "Use `legacyUser`, `/api/legacy`, and `OLD_TOKEN`." }]);
  assert.ok(removed.some((item) => item.reference === "legacyUser")); assert.ok(removed.some((item) => item.reference === "/api/legacy")); assert.ok(removed.some((item) => item.reference === "OLD_TOKEN"));
  const scripts = await detectDocumentationRelationships([{ relativePath: "package.json", originalContent: '{"scripts":{"test":"node --test"}}', currentContent: '{"scripts":{}}', kind: "modified" }], [{ relativePath: "testing.md", content: "Run `npm test`." }]);
  assert.ok(scripts.some((item) => item.type === "package_script" && item.reference === "test"));
});

test("suppresses comment-only and formatting-only edits", async () => {
  const comments = await detectDocumentationRelationships([change({ originalContent: "const value = 1;", currentContent: "  const value=1; // explanatory comment", kind: "modified" })], docs);
  assert.deepEqual(comments, []);
});

test("applies confidence visibility and relationship decisions per evidence version", async () => {
  const initial = await detectDocumentationRelationships([change()], docs);
  const target = initial.find((item) => item.type === "symbol")!;
  assert.equal(visibleDocumentationRelationships(initial, "medium", false).some((item) => item.confidence === "low"), false);
  const rejected = await detectDocumentationRelationships([change()], docs, [{ relationshipId: target.id, evidenceHash: target.evidenceHash, decision: "rejected" }]);
  assert.equal(rejected.find((item) => item.id === target.id)?.status, "dismissed");
  const changedEvidence = await detectDocumentationRelationships([change({ currentContent: `${change().currentContent}\nexport const newerEvidence = true;` })], docs, [{ relationshipId: target.id, evidenceHash: target.evidenceHash, decision: "rejected" }]);
  assert.equal(changedEvidence.find((item) => item.id === target.id)?.decision, "unreviewed");
  assert.notEqual(changedEvidence.find((item) => item.id === target.id)?.evidenceHash, target.evidenceHash);
  const updatedDocs = [{ ...docs[0], content: `## Updated\n${docs[0].content}` }];
  const current = await detectDocumentationRelationships([change()], updatedDocs, [], Date.now(), initial);
  assert.equal(current.find((item) => item.id === target.id)?.status, "current");
  const resolved = await detectDocumentationRelationships([change()], [{ relativePath: "docs/API.md", content: "The obsolete reference was removed." }], [], Date.now(), current);
  assert.equal(resolved.some((item) => item.id === target.id), false);
});

test("Documentation Impact UI is explicit, local, bounded, and never invokes AI", async () => {
  const root = join(import.meta.dirname, "..", "renderer", "src");
  const [panel, app, settings] = await Promise.all([readFile(join(root, "DocumentationImpactPanel.tsx"), "utf8"), readFile(join(root, "App.tsx"), "utf8"), readFile(join(root, "SettingsPanel.tsx"), "utf8")]);
  assert.match(panel, /May need review/); assert.match(panel, /Open Code/); assert.match(panel, /Open Documentation/); assert.match(panel, /View Evidence/); assert.match(panel, /Confirm Relationship/); assert.match(panel, /Not Related/); assert.match(panel, /Ignore for This Session/); assert.match(panel, /Add Both to Context Tray/);
  assert.match(panel, /2_000/); assert.match(panel, /300/); assert.match(panel, /Git is unavailable/); assert.match(app, /documentation_relationship/); assert.match(settings, /Include low-confidence relationships/);
  assert.doesNotMatch(panel, /observer\.ask|fetch\(|supabase/i);
});
