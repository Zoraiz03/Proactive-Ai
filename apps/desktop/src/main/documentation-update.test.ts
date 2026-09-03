import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { ObserverApiClient } from "./observer-client.ts";
import { parseDocumentationEdit, validateDocumentationDraftRequest, validateDocumentationEdit, type DocumentationDraftRequest, type DocumentationUpdateContext, type StructuredDocumentationEdit } from "../shared/documentation-update.ts";

const documentText = "# Guide\n\nUse `/api/old` from `getUser`.\n";
const sectionText = documentText.trimEnd();
const context: DocumentationUpdateContext = { userRequest: "Correct the route.", relationshipId: "a".repeat(24), evidenceHash: "b".repeat(64), relationshipType: "api_route", confidence: "high", reference: "/api/old", evidence: "API guide mentions the changed route.", codePath: "src/users.ts", codeHash: "c".repeat(64), codeExcerpt: "export const route = '/api/new';", documentationPath: "README.md", documentationHash: "d".repeat(64), documentationContent: documentText, affectedHeading: "Guide", sectionRange: { start: { line: 1, column: 1 }, end: { line: 3, column: sectionText.split("\n").at(-1)!.length + 1 } }, sectionText, redacted: false, selectedContext: [] };
const edit = (overrides: Partial<StructuredDocumentationEdit> = {}): StructuredDocumentationEdit => ({ suggestionId: "123e4567-e89b-42d3-a456-426614174000", targetRelativePath: "README.md", action: "correct_route", affectedHeading: "Guide", explanation: "Corrects the documented route.", reason: "The verified route changed.", relationshipReferences: [context.relationshipId, context.evidenceHash], originalDocumentHash: context.documentationHash, range: context.sectionRange, expectedOriginalMarkdown: context.sectionText, replacementMarkdown: "# Guide\n\nUse `/api/new` from `getUser`.", warnings: [], verificationNotes: ["No tests were run."], ...overrides });
const request = (overrides: Partial<DocumentationDraftRequest> = {}): DocumentationDraftRequest => { const { documentationContent: _localDocument, ...boundedContext } = context; return { ...boundedContext, provider: "demo", storeHistory: false, ...overrides }; };

test("requires a supported explicit confirmed-relationship request contract", () => {
  assert.ok(validateDocumentationDraftRequest(request()));
  assert.equal(validateDocumentationDraftRequest(request({ userRequest: "" })), null);
  assert.equal(validateDocumentationDraftRequest(request({ documentationPath: "guide.pdf" })), null);
  assert.equal(validateDocumentationDraftRequest(request({ documentationPath: "../README.md" })), null);
  assert.equal(validateDocumentationDraftRequest(request({ codePath: "/Users/private/code.ts" })), null);
  assert.equal(validateDocumentationDraftRequest(request({ codePath: "C:\\private\\code.ts" })), null);
  assert.equal(validateDocumentationDraftRequest(request({ selectedContext: [{ title: "Local", type: "file_excerpt", content: "See /Users/alice/private.ts" }] })), null);
  assert.equal(validateDocumentationDraftRequest(request({ selectedContext: [{ title: "Web", type: "web_research", content: "External claim", source: "https://example.test/article" }] }))?.selectedContext.length, 1);
  assert.equal(validateDocumentationDraftRequest({ ...request(), documentationContent: documentText }), null);
});

test("accepts bounded section updates, insertion, and all supported documentation action types", () => {
  const actions = ["update_section", "add_section", "correct_path", "correct_route", "correct_command", "update_symbol_description", "update_setup_instructions", "update_code_example"] as const;
  for (const action of actions) assert.equal(parseDocumentationEdit(edit({ action }))?.action, action);
  const result = validateDocumentationEdit(edit(), context, documentText, context.documentationHash, context.codeHash);
  assert.equal(result.ok, true); if (result.ok) { assert.match(result.value.proposedContent, /api\/new/); assert.ok(result.value.addedLines > 0); }
  const insertionContext = { ...context, affectedHeading: "", sectionText: "", sectionRange: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } } };
  assert.equal(validateDocumentationEdit(edit({ action: "add_section", affectedHeading: "Usage", range: insertionContext.sectionRange, expectedOriginalMarkdown: "", replacementMarkdown: "\n## Usage\n\nCall `/api/new`.\n" }), insertionContext, documentText, context.documentationHash, context.codeHash).ok, true);
});

test("rejects malformed, mismatched, stale, traversal, and unsupported edits", () => {
  assert.equal(parseDocumentationEdit({ ...edit(), unexpected: true }), null);
  assert.equal(parseDocumentationEdit(edit({ targetRelativePath: "../README.md" })), null);
  assert.equal(parseDocumentationEdit(edit({ targetRelativePath: "guide.docx" })), null);
  assert.match(validateDocumentationEdit(edit({ targetRelativePath: "docs/other.md" }), context, documentText, context.documentationHash, context.codeHash).ok ? "" : "targeted", /targeted/);
  assert.match(validateDocumentationEdit(edit(), context, documentText, "e".repeat(64), context.codeHash).ok ? "" : "Markdown stale", /stale/);
  assert.match(validateDocumentationEdit(edit(), context, documentText, context.documentationHash, "e".repeat(64)).ok ? "" : "code stale", /stale/);
  assert.equal(validateDocumentationEdit(edit({ relationshipReferences: [] }), context, documentText, context.documentationHash, context.codeHash).ok, false);
  assert.equal(validateDocumentationEdit(edit({ range: { start: { line: 2, column: 1 }, end: context.sectionRange.end } }), context, documentText, context.documentationHash, context.codeHash).ok, false);
});

test("enforces Markdown safety, scope, headings, fences, links, secrets, paths, and claim warnings", () => {
  assert.equal(validateDocumentationEdit(edit({ replacementMarkdown: "# Guide\n\n<script>alert(1)</script>" }), context, documentText, context.documentationHash, context.codeHash).ok, false);
  assert.equal(validateDocumentationEdit(edit({ replacementMarkdown: "# Guide\n\n```ts\nconst x = 1;" }), context, documentText, context.documentationHash, context.codeHash).ok, false);
  assert.equal(validateDocumentationEdit(edit({ replacementMarkdown: "# Different\n\nText" }), context, documentText, context.documentationHash, context.codeHash).ok, false);
  assert.equal(validateDocumentationEdit(edit({ replacementMarkdown: `# Guide\n${Array.from({ length: 201 }, () => "line").join("\n")}` }), context, documentText, context.documentationHash, context.codeHash).ok, false);
  const safe = validateDocumentationEdit(edit({ replacementMarkdown: "# Guide\n\npassword=fixture-password-12345\nSee /Users/alice/private/file.ts.\nAll tests passed." }), context, documentText, context.documentationHash, context.codeHash);
  assert.equal(safe.ok, true); if (safe.ok) { assert.doesNotMatch(safe.value.proposedContent, /fixture-password|\/Users\/alice/); assert.match(safe.value.edit.warnings.join(" "), /redacted/); assert.match(safe.value.edit.warnings.join(" "), /tests or builds passed/); }
  const linkedText = "# Guide\n\nSee [old](docs/old.md)."; const linkedContext = { ...context, documentationContent: linkedText, sectionText: linkedText, sectionRange: { start: { line: 1, column: 1 }, end: { line: 3, column: linkedText.split("\n").at(-1)!.length + 1 } } };
  const links = validateDocumentationEdit(edit({ expectedOriginalMarkdown: linkedContext.sectionText, range: linkedContext.sectionRange, replacementMarkdown: "# Guide\n\nNo link." }), linkedContext, linkedContext.documentationContent, context.documentationHash, context.codeHash);
  assert.equal(links.ok, true); if (links.ok) assert.match(links.value.edit.warnings.join(" "), /Markdown link/);
});

test("documentation generation is an explicit authenticated call with strict response validation", async () => {
  let calls = 0;
  const client = new ObserverApiClient("https://example.test", async () => "token", async (input, init) => { calls += 1; assert.match(String(input), /api\/documentation-update$/); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer token"); return new Response(JSON.stringify({ edit: edit(), provider: "demo" }), { status: 200, headers: { "Content-Type": "application/json" } }); });
  assert.equal(calls, 0); const result = await client.documentationDraft(request()); assert.equal(result.ok, true); assert.equal(calls, 1);
  const signedOut = new ObserverApiClient("https://example.test", async () => null, async () => { throw new Error("must not call"); }); assert.equal((await signedOut.documentationDraft(request())).ok, false);
});

test("UI exposes preparation, review, rendered preview, stale choices, application, and no automatic calls", async () => {
  const renderer = join(import.meta.dirname, "..", "renderer", "src");
  const [panel, workspace, app, route] = await Promise.all([readFile(join(renderer, "DocumentationImpactPanel.tsx"), "utf8"), readFile(join(renderer, "DocumentationUpdateWorkspace.tsx"), "utf8"), readFile(join(renderer, "App.tsx"), "utf8"), readFile(join(import.meta.dirname, "..", "..", "..", "..", "src", "app", "api", "documentation-update", "route.ts"), "utf8")]);
  assert.match(panel, /Draft Documentation Update/); assert.match(workspace, /Review Context/); assert.match(workspace, /Generate Draft/); assert.match(workspace, /Accept Documentation Update/); assert.match(workspace, /Rendered Preview/); assert.match(workspace, /Edit proposed Markdown/); assert.match(workspace, /Undo Documentation Update/); assert.match(workspace, /Open Git Diff/); assert.match(workspace, /Refresh Context/);
  assert.match(app, /Checkpoint creation failed/); assert.match(app, /became stale/); assert.match(app, /relationship disappeared/); assert.match(app, /writeFile/); assert.match(app, /canWriteFile/); assert.doesNotMatch(panel, /documentationDraft|observer\.ask/);
  assert.doesNotMatch(route, /codeExcerpt\s*[:,]|documentationContent\s*[:,]|replacementMarkdown\s*[:,]/); assert.match(route, /detector_metadata/); assert.match(route, /snippet: ""/);
});
