import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { ProjectContextEngine, redactProjectSecrets } from "./project-context.ts";
import { removeOptionalContextItem, requiresCompleteFileConfirmation, validateProjectContextPackage, type ProjectContextSeed } from "../shared/project-context.ts";
import type { ObserverMode } from "../shared/observer.ts";

let root = "";
const activeContent = `import { helper } from "./helper";

export function calculate(value: number) {
  const doubled = helper(value);
  return doubled + 1;
}
`;

const seed = (mode: ObserverMode, overrides: Partial<ProjectContextSeed> = {}): ProjectContextSeed => ({
  mode, kind: "code", activeRelativePath: "src/calculate.ts", fileName: "calculate.ts", language: "typescript", content: activeContent,
  cursorLine: 4, cursorColumn: 10, nearbyCode: activeContent, exclusions: [], maximumTotalCharacters: 20_000, maximumRelatedFiles: 4, maximumCharactersPerFile: 8_000,
  ...overrides,
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "proactive-context-test-"));
  await mkdir(join(root, "src")); await mkdir(join(root, ".proactive")); await mkdir(join(root, "tests"));
  await Promise.all([
    writeFile(join(root, "src", "calculate.ts"), activeContent),
    writeFile(join(root, "src", "helper.ts"), "export const helper = (value: number) => value * 2;\n"),
    writeFile(join(root, "src", "calculate.test.ts"), "import { calculate } from './calculate';\ntest('calculate', () => expect(calculate(2)).toBe(5));\n"),
    writeFile(join(root, "AGENTS.md"), "Use small pure functions and explicit return types.\n"),
    writeFile(join(root, ".proactive", "rules.md"), "Never mutate function inputs.\n"),
    writeFile(join(root, "README.md"), "# Context fixture\n"),
    writeFile(join(root, "package.json"), '{"devDependencies":{"vitest":"latest"}}\n'),
  ]);
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const engine = () => { const value = new ProjectContextEngine(); value.setWorkspace(root); return value; };
const types = (context: Awaited<ReturnType<ProjectContextEngine["build"]>>) => context.items.map((item) => item.type);

test("selects action-specific Explain, Fix Error, Improve, Continue, and Generate Tests context", async () => {
  const service = engine();
  const explain = await service.build(seed("explain", { selectedCode: "helper(value)" }));
  assert.deepEqual(types(explain).slice(0, 4), ["user_instruction", "selected_code", "current_symbol", "related_file"]);
  const fix = await service.build(seed("fix_error", { diagnostic: { fileName: "calculate.ts", line: 4, column: 19, message: "helper is not a function" }, runError: "calculate.ts:4 helper is not a function" }));
  assert.ok(types(fix).includes("diagnostic")); assert.ok(types(fix).includes("terminal_error")); assert.ok(types(fix).includes("related_file"));
  const improve = await service.build(seed("improve_code"));
  assert.ok(types(improve).includes("project_rule"));
  const continuation = await service.build(seed("continue_code"));
  assert.ok(types(continuation).includes("current_symbol")); assert.ok(types(continuation).includes("nearby_code"));
  const tests = await service.build(seed("generate_tests"));
  assert.ok(tests.items.some((item) => item.source.provenance === "nearby_test"));
  assert.ok(tests.items.some((item) => item.source.provenance === "project_configuration"), JSON.stringify(tests.items.map((item) => [item.type, item.source.provenance, item.source.relativePath])));
});

test("documentation actions attach only the active Markdown document and no code files", async () => {
  await writeFile(join(root, "README.md"), "# Project\n\nImportant documentation.\n");
  const service = engine();
  const context = await service.build(seed("summarize", { kind: "doc", activeRelativePath: "README.md", fileName: "README.md", language: "markdown", content: "# Project\n\nImportant documentation.\n", nearbyCode: "Important documentation.", cursorLine: 3 }));
  assert.ok(types(context).includes("attached_markdown"));
  assert.equal(types(context).includes("related_file"), false);
});

test("orders context by the documented priorities and trims lower-priority items deterministically", async () => {
  const context = await engine().build(seed("fix_error", { selectedCode: "helper(value)", diagnostic: { fileName: "calculate.ts", line: 4, column: 1, message: "failure" }, runError: "failure", maximumTotalCharacters: 1_000, maximumCharactersPerFile: 500 }));
  assert.deepEqual(context.items.map((item) => item.priority), [...context.items.map((item) => item.priority)].sort((a, b) => a - b));
  assert.ok(context.totalCharacters <= 1_000);
  assert.ok(context.omitted.length > 0);
  assert.equal(validateProjectContextPackage(context)?.totalCharacters, context.totalCharacters);
});

test("prefers direct imports, limits related files, and truncates per-file content", async () => {
  await writeFile(join(root, "src", "helper.ts"), "export const helper = 1;\n".repeat(1_000));
  const context = await engine().build(seed("generate_tests", { maximumRelatedFiles: 1, maximumCharactersPerFile: 500 }));
  const related = context.items.filter((item) => item.type === "related_file");
  assert.equal(related.length, 1); assert.equal(related[0].source.relativePath, "src/helper.ts"); assert.equal(related[0].content.length, 500); assert.equal(related[0].truncated, true);
  assert.ok(context.omitted.some((item) => item.reason.includes("Maximum related-file")));
});

test("blocks ignored, generated, secret, user-excluded, and escaping symlink candidates", async () => {
  await mkdir(join(root, "node_modules", "hidden"), { recursive: true });
  await writeFile(join(root, "node_modules", "hidden", "index.ts"), "secret dependency");
  await writeFile(join(root, ".env"), "PASSWORD=fixture-secret-value");
  await writeFile(join(root, ".gitignore"), "src/ignored.ts\n");
  await writeFile(join(root, "src", "ignored.ts"), "ignored content\n");
  const outside = join(tmpdir(), `outside-context-${Date.now()}.ts`); await writeFile(outside, "outside");
  await symlink(outside, join(root, "src", "outside.ts"));
  const content = 'import "./helper";\nimport "./outside";\nimport "./ignored";\nimport "../node_modules/hidden";\n';
  const context = await engine().build(seed("explain", { content, nearbyCode: content, exclusions: ["src/helper.ts"] }));
  assert.equal(context.items.some((item) => ["src/helper.ts", "src/outside.ts", "src/ignored.ts", ".env"].includes(item.source.relativePath ?? "")), false);
  await rm(outside, { force: true });
});

test("redacts common credential content before it enters the package", async () => {
  await writeFile(join(root, "src", "helper.ts"), "const api_key = 'fixture-secret-value-12345';\nexport const helper = 1;\n");
  const context = await engine().build(seed("explain"));
  const related = context.items.find((item) => item.source.relativePath === "src/helper.ts");
  assert.equal(related?.redacted, true); assert.match(related?.content ?? "", /\[REDACTED\]/); assert.doesNotMatch(related?.content ?? "", /fixture-secret-value/);
  assert.equal(redactProjectSecrets("password=fixture-secret-value-12345").redacted, true);
});

test("invalidates cached candidate metadata on workspace changes", async () => {
  const service = engine(); const before = service.cacheGeneration();
  await service.build(seed("explain")); service.invalidate();
  assert.equal(service.cacheGeneration(), before + 1);
  const context = await service.build(seed("explain")); assert.ok(context.items.length > 0);
});

test("preview removal permits optional items only and complete-file confirmation is explicit", async () => {
  const context = await engine().build(seed("generate_tests"));
  const optional = context.items.find((item) => item.optional); assert.ok(optional);
  const removed = removeOptionalContextItem(context, optional!.id); assert.equal(removed.items.some((item) => item.id === optional!.id), false);
  const required = context.items.find((item) => !item.optional)!; assert.equal(removeOptionalContextItem(context, required.id), context);
  assert.equal(requiresCompleteFileConfirmation(context, true), context.containsCompleteFile);
  assert.equal(requiresCompleteFileConfirmation(context, false), false);
});
