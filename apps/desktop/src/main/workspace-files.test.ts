import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  isSupportedWorkspaceTextFile,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  normalizeWorkspaceRelativePath,
  readWorkspaceDirectory,
  readWorkspaceTextFile,
  renameWorkspaceEntry,
  resolveWorkspacePath,
  WorkspaceFileError,
  WorkspaceFileWriteError,
  WorkspaceMutationError,
  validateWorkspaceEntryName,
  writeWorkspaceTextFile,
} from "./workspace-files.ts";
import { monacoLanguageForFile } from "../shared/languages.ts";
import {
  extractMarkdownHeadings,
  isMarkdownFile,
  safeMarkdownUrl,
} from "../shared/markdown.ts";
import {
  replaceWorkspaceEntryPath,
  workspaceEntryContainsPath,
} from "../shared/workspace-paths.ts";
import {
  batchChangesFile,
  batchDeletesPath,
  resolveExternalFileUpdate,
} from "../shared/external-sync.ts";
import {
  shouldIgnoreWorkspaceWatchPath,
  WorkspaceWatcher,
} from "./workspace-watcher.ts";
import {
  TerminalSessionController,
  type PseudoTerminal,
  type SpawnTerminalOptions,
} from "./terminal-session.ts";
import {
  createTerminalEnvironment,
  selectTerminalShell,
} from "./terminal-environment.ts";
import { commandForRunFile, RunSessionController } from "./run-session.ts";
import { parseRunDiagnostics } from "./run-diagnostics.ts";
import {
  EncryptedAuthSessionStore,
  type SessionEncryption,
  type StoredAuthSession,
} from "./auth-session-store.ts";
import {
  DesktopAuthController,
  parseSignInRequest,
  type AuthenticatedSession,
  type DesktopAuthProvider,
} from "./auth-controller.ts";
import {
  CODE_OBSERVER_MODES,
  DOCUMENT_OBSERVER_MODES,
  OBSERVER_MODES,
  copyObserverSnippet,
  createObserverRequest,
  isObserverAskShortcut,
  isObserverDismissShortcut,
  isSensitiveObserverFile,
  observerContextSummary,
  relevantObserverRunError,
  validateObserverRequest,
  type ObserverMode,
} from "../shared/observer.ts";
import { ObserverApiClient } from "./observer-client.ts";
import {
  WorkspaceSearchService,
  buildRipgrepSearchArguments,
  isDefaultSearchSecret,
  searchProcessEnvironment,
} from "./workspace-search.ts";
import {
  searchMatchSelection,
  searchPathMatchesPatterns,
  validateWorkspaceSearchRequest,
  type WorkspaceSearchMatch,
  type WorkspaceSearchRequest,
} from "../shared/search.ts";

let temporaryDirectory = "";
let workspaceRoot = "";
let outsideDirectory = "";

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-explorer-"));
  workspaceRoot = join(temporaryDirectory, "workspace");
  outsideDirectory = join(temporaryDirectory, "outside");

  await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
  await mkdir(join(workspaceRoot, "folder.txt"));
  await mkdir(join(workspaceRoot, "operations", "non-empty"), { recursive: true });
  await mkdir(join(workspaceRoot, "operations", "empty-folder"));
  await mkdir(join(workspaceRoot, "operations", "rename-folder", "nested"), {
    recursive: true,
  });
  await mkdir(join(workspaceRoot, "node_modules"));
  await mkdir(join(workspaceRoot, ".git"));
  await mkdir(join(workspaceRoot, "dist"));
  await mkdir(join(workspaceRoot, "build"));
  await mkdir(join(workspaceRoot, ".next"));
  await mkdir(join(workspaceRoot, "coverage"));
  await mkdir(join(workspaceRoot, "search"));
  await mkdir(outsideDirectory);
  await writeFile(join(workspaceRoot, "README.md"), "workspace");
  await writeFile(join(workspaceRoot, "src", "index.ts"), "export {};");
  await writeFile(join(workspaceRoot, "src", "run.js"), "console.log(process.cwd());\n");
  await writeFile(join(workspaceRoot, "src", "module.mjs"), "export {};\n");
  await writeFile(join(workspaceRoot, "src", "run.py"), "import os\nprint(os.getcwd())\n");
  await writeFile(join(workspaceRoot, "src", "broken.py"), "raise RuntimeError('runner smoke error')\n");
  await writeFile(join(workspaceRoot, "src", "slow.js"), "setInterval(() => {}, 1000);\n");
  await writeFile(join(workspaceRoot, "empty.txt"), "");
  await writeFile(join(workspaceRoot, "editable.ts"), "const value = 1;\n");
  await writeFile(join(workspaceRoot, "stale.ts"), "const stale = false;\n");
  await writeFile(join(workspaceRoot, ".gitignore"), "search/gitignored.ts\n");
  await writeFile(join(workspaceRoot, "search", "normal.ts"), [
    "const title = 'Needle';",
    "const partial = 'needlework';",
    "const exact = 'needle';",
  ].join("\n"));
  await writeFile(join(workspaceRoot, "search", "include.ts"), "const sharedPattern = true;\n");
  await writeFile(join(workspaceRoot, "search", "include.js"), "const sharedPattern = false;\n");
  await writeFile(join(workspaceRoot, "search", "excluded.ts"), "const sharedPattern = 'excluded';\n");
  await writeFile(join(workspaceRoot, "search", "gitignored.ts"), "const hiddenNeedle = true;\n");
  await writeFile(join(workspaceRoot, "search", "many.ts"), "limitNeedle\n".repeat(20));
  await writeFile(join(workspaceRoot, "search", "credentials.json"), "{\"secretNeedle\":true}\n");
  await writeFile(join(workspaceRoot, "search", ".env.local"), "secretNeedle=true\n");
  await writeFile(join(workspaceRoot, "search", "binary.txt"), Buffer.from("binaryNeedle\0hidden"));
  await writeFile(join(workspaceRoot, "search", "oversized.ts"), Buffer.concat([
    Buffer.from("oversizedNeedle\n"),
    Buffer.alloc(1024 * 1024, 0x61),
  ]));
  await writeFile(join(workspaceRoot, "coverage", "covered.ts"), "const secretNeedle = true;\n");
  await writeFile(join(workspaceRoot, "node_modules", "dependency.ts"), "const secretNeedle = true;\n");
  await writeFile(join(workspaceRoot, "operations", "delete-me.ts"), "delete me\n");
  await writeFile(join(workspaceRoot, "operations", "rename-me.ts"), "rename me\n");
  await writeFile(join(workspaceRoot, "operations", "duplicate.ts"), "duplicate\n");
  await writeFile(join(workspaceRoot, "operations", "non-empty", "child.txt"), "child\n");
  await writeFile(
    join(workspaceRoot, "operations", "rename-folder", "nested", "kept.txt"),
    "kept\n"
  );
  await writeFile(join(workspaceRoot, "unsupported.png"), "not an image");
  await writeFile(join(workspaceRoot, "binary.txt"), Buffer.from([0x41, 0x00, 0x42]));
  await writeFile(join(workspaceRoot, "invalid.txt"), Buffer.from([0xc3, 0x28]));
  await writeFile(
    join(workspaceRoot, "large.txt"),
    Buffer.alloc(2 * 1024 * 1024 + 1, 0x61)
  );
  await writeFile(join(outsideDirectory, "secret.txt"), "outside");

  const directorySymlinkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(join(workspaceRoot, "src"), join(workspaceRoot, "safe-link"), directorySymlinkType);
  await symlink(outsideDirectory, join(workspaceRoot, "outside-link"), directorySymlinkType);
});

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

let searchSequence = 0;
function searchRequest(overrides: Partial<WorkspaceSearchRequest> = {}): WorkspaceSearchRequest {
  return {
    searchId: `search-${++searchSequence}`,
    query: "needle",
    caseSensitive: false,
    wholeWord: false,
    regularExpression: false,
    resultLimit: 500,
    ...overrides,
  };
}

async function collectSearch(request: WorkspaceSearchRequest) {
  const matches: WorkspaceSearchMatch[] = [];
  const completion = await new WorkspaceSearchService().search(
    workspaceRoot,
    request,
    (batch) => matches.push(...batch.matches)
  );
  return { matches, completion };
}

test("normalizes safe paths and rejects traversal and absolute paths", () => {
  assert.deepEqual(normalizeWorkspaceRelativePath("src/nested"), {
    relativePath: "src/nested",
    segments: ["src", "nested"],
  });
  assert.throws(() => normalizeWorkspaceRelativePath("../outside"));
  assert.throws(() => normalizeWorkspaceRelativePath("..\\outside"));
  assert.throws(() => normalizeWorkspaceRelativePath("/etc"));
  assert.throws(() => normalizeWorkspaceRelativePath("C:\\Windows"));
});

test("lists only immediate entries and ignores generated directories", async () => {
  const entries = await readWorkspaceDirectory(workspaceRoot, "");
  const names = entries.map((entry) => entry.name);

  assert.equal(names.includes("safe-link"), true);
  assert.equal(names.includes("src"), true);
  assert.equal(names.includes("README.md"), true);
  assert.equal(entries.find((entry) => entry.name === "safe-link")?.isSymbolicLink, true);
  assert.equal(names.includes("nested"), false);
  assert.equal(names.includes("node_modules"), false);
  assert.equal(names.includes(".git"), false);
  assert.equal(names.includes("dist"), false);
  assert.equal(names.includes("build"), false);
  assert.equal(names.includes(".next"), false);
});

test("loads child folders independently", async () => {
  const entries = await readWorkspaceDirectory(workspaceRoot, "src");
  assert.deepEqual(
    entries.map((entry) => [entry.name, entry.kind]),
    [
      ["nested", "directory"],
      ["broken.py", "file"],
      ["index.ts", "file"],
      ["module.mjs", "file"],
      ["run.js", "file"],
      ["run.py", "file"],
      ["slow.js", "file"],
    ]
  );
});

test("rejects paths and symlinks that resolve outside the workspace", async () => {
  await assert.rejects(resolveWorkspacePath(workspaceRoot, "../outside"));
  await assert.rejects(resolveWorkspacePath(workspaceRoot, "outside-link"));

  const entries = await readWorkspaceDirectory(workspaceRoot, "");
  assert.equal(entries.some((entry) => entry.name === "outside-link"), false);
});

test("recognizes every supported text and code extension", () => {
  for (const name of [
    "file.js",
    "file.mjs",
    "file.jsx",
    "file.ts",
    "file.tsx",
    "file.py",
    "file.java",
    "file.c",
    "file.cpp",
    "file.h",
    "file.html",
    "file.css",
    "file.json",
    "file.md",
    "file.mdx",
    "file.txt",
    "file.yml",
    "file.yaml",
    "FILE.TS",
  ]) {
    assert.equal(isSupportedWorkspaceTextFile(name), true, name);
  }
  assert.equal(isSupportedWorkspaceTextFile("file.png"), false);
  assert.equal(isSupportedWorkspaceTextFile("Makefile"), false);
});

test("reads supported root, nested, and empty UTF-8 files", async () => {
  const readme = await readWorkspaceTextFile(workspaceRoot, "README.md");
  assert.equal(readme.name, "README.md");
  assert.equal(readme.relativePath, "README.md");
  assert.equal(readme.content, "workspace");
  assert.equal(Number.isFinite(readme.modifiedAtMs), true);
  assert.equal(
    (await readWorkspaceTextFile(workspaceRoot, "src/index.ts")).content,
    "export {};"
  );
  assert.equal((await readWorkspaceTextFile(workspaceRoot, "empty.txt")).content, "");
});

test("rejects unsupported, binary, invalid UTF-8, oversized, and directory reads", async () => {
  const rejectsWithCode = async (
    path: string,
    code: WorkspaceFileError["code"]
  ) => {
    await assert.rejects(
      readWorkspaceTextFile(workspaceRoot, path),
      (error: unknown) => error instanceof WorkspaceFileError && error.code === code
    );
  };

  await rejectsWithCode("unsupported.png", "unsupported");
  await rejectsWithCode("binary.txt", "binary");
  await rejectsWithCode("invalid.txt", "binary");
  await rejectsWithCode("large.txt", "too_large");
  await rejectsWithCode("folder.txt", "not_file");
});

test("rejects file reads outside the workspace", async () => {
  await assert.rejects(readWorkspaceTextFile(workspaceRoot, "../outside/secret.txt"));
  await assert.rejects(readWorkspaceTextFile(workspaceRoot, "outside-link/secret.txt"));
});

test("maps supported extensions to Monaco languages", () => {
  assert.equal(monacoLanguageForFile("module.mjs"), "javascript");
  assert.equal(monacoLanguageForFile("component.tsx"), "typescript");
  assert.equal(monacoLanguageForFile("script.py"), "python");
  assert.equal(monacoLanguageForFile("README.md"), "markdown");
  assert.equal(monacoLanguageForFile("guide.mdx"), "markdown");
  assert.equal(monacoLanguageForFile("config.YAML"), "yaml");
  assert.equal(monacoLanguageForFile("unknown"), "plaintext");
});

test("detects Markdown files and extracts a navigable outline outside code fences", () => {
  assert.equal(isMarkdownFile("README.md"), true);
  assert.equal(isMarkdownFile("guide.MDX"), true);
  assert.equal(isMarkdownFile("notes.txt"), false);
  assert.deepEqual(extractMarkdownHeadings([
    "# Product **Vision**",
    "",
    "Overview",
    "--------",
    "",
    "```md",
    "# Not an outline heading",
    "```",
    "",
    "### [Safety](#safety)",
  ].join("\n")), [
    { id: "markdown-heading-1", level: 1, line: 1, text: "Product Vision" },
    { id: "markdown-heading-3", level: 2, line: 3, text: "Overview" },
    { id: "markdown-heading-10", level: 3, line: 10, text: "Safety" },
  ]);
});

test("renders common Markdown and GFM without raw HTML or executable links", () => {
  const markdown = [
    "# Safe preview",
    "",
    "> A blockquote",
    "",
    "- [x] Complete",
    "",
    "| Feature | State |",
    "| --- | --- |",
    "| Preview | Ready |",
    "",
    "```ts",
    "const safe = true;",
    "```",
    "",
    "[safe](https://example.com) [unsafe](javascript:alert(1))",
    "",
    "<script>alert('x')</script>",
    "<div onclick=\"alert(1)\">unsafe html</div>",
  ].join("\n");
  const rendered = renderToStaticMarkup(createElement(
    ReactMarkdown,
    { remarkPlugins: [remarkGfm], skipHtml: true, urlTransform: safeMarkdownUrl },
    markdown
  ));
  assert.match(rendered, /<h1>Safe preview<\/h1>/);
  assert.match(rendered, /<blockquote>/);
  assert.match(rendered, /type="checkbox"/);
  assert.match(rendered, /<table>/);
  assert.match(rendered, /language-ts/);
  assert.match(rendered, /href="https:\/\/example.com"/);
  assert.doesNotMatch(rendered, /<script|onclick=|javascript:/i);
  assert.equal(safeMarkdownUrl("data:text/html,bad"), "");
  assert.equal(safeMarkdownUrl("vbscript:bad"), "");
  assert.equal(safeMarkdownUrl("#safe-preview"), "#safe-preview");
});

test("renders a bounded large Markdown document within the desktop test budget", () => {
  const source = Array.from({ length: 2_000 }, (_, index) =>
    `## Section ${index + 1}\n\nDocumentation paragraph ${index + 1}.`
  ).join("\n\n");
  const startedAt = performance.now();
  const rendered = renderToStaticMarkup(createElement(
    ReactMarkdown,
    { remarkPlugins: [remarkGfm], skipHtml: true, urlTransform: safeMarkdownUrl },
    source
  ));
  assert.match(rendered, /Section 2000/);
  assert.ok(performance.now() - startedAt < 5_000, "large Markdown render exceeded five seconds");
});

test("validates bounded search requests and builds an argument-only ripgrep command", () => {
  const request = searchRequest({ query: "value; rm -rf", regularExpression: false });
  assert.deepEqual(validateWorkspaceSearchRequest(request), request);
  assert.equal(validateWorkspaceSearchRequest({ ...request, query: "" }), null);
  assert.equal(validateWorkspaceSearchRequest({ ...request, resultLimit: 9 }), null);
  assert.equal(validateWorkspaceSearchRequest({ ...request, includePattern: "!**/.env" }), null);
  const args = buildRipgrepSearchArguments(request);
  assert.equal(args.includes("--fixed-strings"), true);
  assert.equal(args.includes("--no-follow"), true);
  assert.equal(args.includes("--no-config"), true);
  assert.equal(args.at(-2), "value; rm -rf");
  assert.equal(args.at(-1), ".");
  assert.deepEqual(searchProcessEnvironment({
    PATH: "/bin",
    API_SECRET: "must-not-leak",
    LANG: "en_US.UTF-8",
    TMPDIR: "/tmp/search",
  }), { LANG: "en_US.UTF-8", TMPDIR: "/tmp/search" });
});

test("searches supported workspace text normally and reports accurate locations", async () => {
  const { matches, completion } = await collectSearch(searchRequest());
  const normal = matches.filter((match) => match.relativePath === "search/normal.ts");
  assert.equal(completion.cancelled, false);
  assert.equal(normal.length, 3);
  assert.deepEqual(normal.map((match) => match.line), [1, 2, 3]);
  assert.equal(normal[0].column, 16);
  assert.equal(normal[0].preview.slice(normal[0].previewMatchStart, normal[0].previewMatchStart + normal[0].previewMatchLength), "Needle");
});

test("supports case-sensitive, whole-word, and regular-expression workspace search", async () => {
  const caseMatches = (await collectSearch(searchRequest({ query: "Needle", caseSensitive: true }))).matches
    .filter((match) => match.relativePath === "search/normal.ts");
  assert.equal(caseMatches.length, 1);
  const wholeWordMatches = (await collectSearch(searchRequest({ wholeWord: true }))).matches
    .filter((match) => match.relativePath === "search/normal.ts");
  assert.deepEqual(wholeWordMatches.map((match) => match.line), [1, 3]);
  const regexMatches = (await collectSearch(searchRequest({ query: "needle(?:work)?", regularExpression: true }))).matches
    .filter((match) => match.relativePath === "search/normal.ts");
  assert.deepEqual(regexMatches.map((match) => match.line), [1, 2, 3]);
});

test("applies comma-separated include and exclude glob patterns", async () => {
  assert.equal(searchPathMatchesPatterns("src/app.ts", "src/**, tests/**", "**/*.test.ts"), true);
  assert.equal(searchPathMatchesPatterns("src/app.test.ts", "src/**", "**/*.test.ts"), false);
  const { matches } = await collectSearch(searchRequest({
    query: "sharedPattern",
    includePattern: "search/*.ts",
    excludePattern: "**/excluded.ts",
  }));
  assert.deepEqual(matches.map((match) => match.relativePath), ["search/include.ts"]);
});

test("respects gitignore and mandatory folder and secret exclusions", async () => {
  assert.equal(isDefaultSearchSecret("nested/.env.production"), true);
  assert.equal(isDefaultSearchSecret("nested/credentials.json"), true);
  assert.equal(isDefaultSearchSecret("src/app.ts"), false);
  const { matches } = await collectSearch(searchRequest({ query: "secretNeedle" }));
  assert.deepEqual(matches, []);
  const ignored = await collectSearch(searchRequest({ query: "hiddenNeedle" }));
  assert.deepEqual(ignored.matches, []);
  assert.deepEqual((await collectSearch(searchRequest({ query: "binaryNeedle" }))).matches, []);
  assert.deepEqual((await collectSearch(searchRequest({ query: "oversizedNeedle" }))).matches, []);
});

test("truncates at the configured result limit", async () => {
  const { matches, completion } = await collectSearch(searchRequest({ query: "limitNeedle", resultLimit: 10 }));
  assert.equal(matches.length, 10);
  assert.equal(completion.matchCount, 10);
  assert.equal(completion.truncated, true);
});

test("cancels an active workspace search", async () => {
  const service = new WorkspaceSearchService();
  const request = searchRequest({ query: "needle" });
  const pending = service.search(workspaceRoot, request, () => undefined);
  assert.equal(service.cancel(request.searchId), true);
  assert.equal((await pending).cancelled, true);
});

test("does not follow a workspace symlink or return paths outside the authorized root", async () => {
  await writeFile(join(outsideDirectory, "outside.ts"), "outsideNeedle\n");
  const { matches } = await collectSearch(searchRequest({ query: "outsideNeedle" }));
  assert.deepEqual(matches, []);
});

test("maps a search result to the exact Monaco selection without changing its path", () => {
  assert.deepEqual(searchMatchSelection({
    relativePath: "search/normal.ts",
    line: 2,
    column: 18,
    endColumn: 28,
    preview: "const partial = 'needlework';",
    previewMatchStart: 17,
    previewMatchLength: 10,
  }), {
    relativePath: "search/normal.ts",
    line: 2,
    column: 18,
    endColumn: 28,
  });
});

test("maps only approved run extensions to controlled commands", () => {
  assert.deepEqual(commandForRunFile("darwin", "/workspace/script.py"), {
    language: "python",
    command: "python3",
    args: ["/workspace/script.py"],
  });
  assert.deepEqual(commandForRunFile("win32", "C:\\workspace\\script.py"), {
    language: "python",
    command: "python",
    args: ["C:\\workspace\\script.py"],
  });
  assert.deepEqual(commandForRunFile("linux", "/workspace/script.mjs"), {
    language: "javascript",
    command: "node",
    args: ["/workspace/script.mjs"],
  });
  assert.deepEqual(commandForRunFile("linux", "/workspace/script.ts"), {
    error: "TypeScript runner not configured.",
  });
  assert.deepEqual(commandForRunFile("linux", "/workspace/script.cpp"), {
    error: "This file type is not supported by Run Current File.",
  });
});

test("parses Python and Node errors only when locations are inside the workspace", () => {
  const pythonFile = join(workspaceRoot, "src", "broken.py");
  const python = parseRunDiagnostics(
    workspaceRoot,
    "python",
    `Traceback (most recent call last):\n  File "${pythonFile}", line 7, in <module>\nNameError: name 'missing' is not defined\n`
  );
  assert.deepEqual(python, [{
    relativePath: "src/broken.py",
    line: 7,
    column: 1,
    message: "NameError: name 'missing' is not defined",
    source: "python",
  }]);

  const nodeFile = join(workspaceRoot, "src", "broken.js");
  const node = parseRunDiagnostics(
    workspaceRoot,
    "javascript",
    `ReferenceError: missing is not defined\n    at ${nodeFile}:4:9\n    at ${join(outsideDirectory, "outside.js")}:1:1\n`
  );
  assert.deepEqual(node, [{
    relativePath: "src/broken.js",
    line: 4,
    column: 9,
    message: "ReferenceError: missing is not defined",
    source: "javascript",
  }]);
});

test("runs one authorized JavaScript file from the workspace and rejects unsafe requests", async () => {
  const output: string[] = [];
  let resolveCompletion!: (event: { status: string; exitCode: number | null }) => void;
  const completion = new Promise<{ status: string; exitCode: number | null }>((resolve) => {
    resolveCompletion = resolve;
  });
  const controller = new RunSessionController({
    output: (_id, event) => output.push(event.data),
    complete: (_id, event) => resolveCompletion(event),
  });
  assert.equal((await controller.start(7, {
    runId: "11111111-1111-4111-8111-111111111111",
    relativePath: "src/run.js",
  })).ok, false);
  controller.setWorkspace(await realpath(workspaceRoot), 7);
  const started = await controller.start(7, {
    runId: "22222222-2222-4222-8222-222222222222",
    relativePath: "src/run.js",
  });
  assert.equal(started.ok, true);
  const result = await completion;
  assert.equal(result.status, "succeeded");
  assert.equal(result.exitCode, 0);
  assert.equal(output.join("").trim(), await realpath(workspaceRoot));

  const rejected = new RunSessionController({ output: () => undefined, complete: () => undefined });
  rejected.setWorkspace(await realpath(workspaceRoot), 7);
  assert.equal((await rejected.start(8, {
    runId: "33333333-3333-4333-8333-333333333333",
    relativePath: "src/run.js",
  })).ok, false);
  assert.equal((await rejected.start(7, {
    runId: "44444444-4444-4444-8444-444444444444",
    relativePath: "../outside/secret.txt",
  })).ok, false);
});

test("runs Python errors into diagnostics and stops an active process", async () => {
  let resolvePython!: (event: { status: string; diagnostics: Array<{ relativePath: string; line: number }> }) => void;
  const pythonCompletion = new Promise<{
    status: string;
    diagnostics: Array<{ relativePath: string; line: number }>;
  }>((resolve) => { resolvePython = resolve; });
  const controller = new RunSessionController({
    output: () => undefined,
    complete: (_id, event) => resolvePython(event),
  });
  controller.setWorkspace(await realpath(workspaceRoot), 7);
  assert.equal((await controller.start(7, {
    runId: "55555555-5555-4555-8555-555555555555",
    relativePath: "src/broken.py",
  })).ok, true);
  const failed = await pythonCompletion;
  assert.equal(failed.status, "failed");
  assert.equal(failed.diagnostics.some((item) => item.relativePath === "src/broken.py" && item.line === 1), true);

  const pythonOutput: string[] = [];
  let resolveSuccess!: (event: { status: string }) => void;
  const successCompletion = new Promise<{ status: string }>((resolve) => { resolveSuccess = resolve; });
  const successController = new RunSessionController({
    output: (_id, event) => pythonOutput.push(event.data),
    complete: (_id, event) => resolveSuccess(event),
  });
  successController.setWorkspace(await realpath(workspaceRoot), 7);
  assert.equal((await successController.start(7, {
    runId: "77777777-7777-4777-8777-777777777777",
    relativePath: "src/run.py",
  })).ok, true);
  assert.equal((await successCompletion).status, "succeeded");
  assert.equal(pythonOutput.join("").trim(), await realpath(workspaceRoot));

  let resolveStopped!: (event: { status: string }) => void;
  const stoppedCompletion = new Promise<{ status: string }>((resolve) => { resolveStopped = resolve; });
  const stopController = new RunSessionController({
    output: () => undefined,
    complete: (_id, event) => resolveStopped(event),
  });
  stopController.setWorkspace(await realpath(workspaceRoot), 7);
  const started = await stopController.start(7, {
    runId: "66666666-6666-4666-8666-666666666666",
    relativePath: "src/slow.js",
  });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(stopController.stop(7, { runId: started.value.runId }).ok, true);
  assert.equal((await stoppedCompletion).status, "stopped");
});

function testSession(id = "user-1"): AuthenticatedSession {
  return {
    tokens: { version: 1, accessToken: `access-${id}`, refreshToken: `refresh-${id}` },
    user: { id, email: `${id}@example.com`, name: "Desktop User" },
  };
}

class FakeDesktopAuthProvider implements DesktopAuthProvider {
  restored: StoredAuthSession[] = [];
  signedIn: Array<{ email: string; password: string }> = [];
  signOutCount = 0;
  failSignIn = false;
  private listeners = new Set<(session: AuthenticatedSession | null) => void>();

  async restore(tokens: StoredAuthSession): Promise<AuthenticatedSession> {
    this.restored.push(tokens);
    return testSession("restored");
  }

  async signIn(email: string, password: string): Promise<AuthenticatedSession> {
    this.signedIn.push({ email, password });
    if (this.failSignIn) throw new Error("Invalid login credentials");
    return testSession();
  }

  async signOut(): Promise<void> { this.signOutCount += 1; }
  async getAccessToken(): Promise<string | null> { return "access-user-1"; }
  onSessionChanged(listener: (session: AuthenticatedSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose(): void { this.listeners.clear(); }
}

const testEncryption: SessionEncryption = {
  isAvailable: async () => true,
  encrypt: async (plainText) => Buffer.from([...plainText].reverse().join(""), "utf8"),
  decrypt: async (encrypted) => ({
    value: [...encrypted.toString("utf8")].reverse().join(""),
    shouldReEncrypt: false,
  }),
};

test("validates desktop sign-in requests without logging or returning passwords", () => {
  assert.deepEqual(parseSignInRequest({ email: " User@Example.com ", password: "secret" }), {
    email: "user@example.com",
    password: "secret",
  });
  assert.equal(parseSignInRequest({ email: "invalid", password: "secret" }), null);
  assert.equal(parseSignInRequest({ email: "user@example.com", password: "" }), null);
  assert.equal(parseSignInRequest({ email: "user@example.com", password: "x".repeat(1_025) }), null);
});

test("persists and restores only encrypted desktop session bytes", async () => {
  const sessionPath = join(temporaryDirectory, "auth-store", "session.enc");
  const store = new EncryptedAuthSessionStore(sessionPath, testEncryption);
  const session = testSession().tokens;
  await store.save(session);
  const bytes = await readFile(sessionPath);
  assert.equal(bytes.includes(session.accessToken), false);
  assert.equal(bytes.includes(session.refreshToken), false);
  assert.deepEqual(await store.load(), session);
  await store.clear();
  await assert.rejects(access(sessionPath));
});

test("restores, signs in, rejects invalid credentials, and signs out through auth controller", async () => {
  const sessionPath = join(temporaryDirectory, "auth-controller", "session.enc");
  const store = new EncryptedAuthSessionStore(sessionPath, testEncryption);
  await store.save(testSession("stored").tokens);
  const provider = new FakeDesktopAuthProvider();
  const controller = new DesktopAuthController(provider, store);
  await controller.initialize();
  assert.equal(controller.getState().status, "signed_in");
  assert.equal(provider.restored.length, 1);

  provider.failSignIn = true;
  const invalid = await controller.signIn({ email: "user@example.com", password: "wrong" });
  assert.deepEqual(invalid, { ok: false, error: "Incorrect email or password." });
  assert.equal(controller.getState().status, "signed_out");

  provider.failSignIn = false;
  const valid = await controller.signIn({ email: "USER@example.com", password: "correct" });
  assert.equal(valid.ok, true);
  assert.equal(controller.getState().status, "signed_in");
  assert.equal((await store.load())?.refreshToken, "refresh-user-1");

  assert.equal((await controller.signOut()).ok, true);
  assert.equal(controller.getState().status, "signed_out");
  assert.equal(await store.load(), null);
  controller.dispose();
});

test("blocks desktop authentication when secure OS encryption is unavailable", async () => {
  const unavailable: SessionEncryption = {
    ...testEncryption,
    isAvailable: async () => false,
  };
  const controller = new DesktopAuthController(
    new FakeDesktopAuthProvider(),
    new EncryptedAuthSessionStore(join(temporaryDirectory, "unavailable", "session.enc"), unavailable)
  );
  await controller.initialize();
  const state = controller.getState();
  assert.equal(state.status, "configuration_error");
  if (state.status === "configuration_error") {
    assert.match(state.message, /secure operating-system session storage/i);
  }
  controller.dispose();
});

test("builds focused Observer requests for every code mode", () => {
  for (const mode of CODE_OBSERVER_MODES) {
    const request = createObserverRequest({
      provider: "demo",
      mode,
      kind: "code",
      fileName: "app.ts",
      language: "typescript",
      content: "export function add(a: number, b: number) { return a + b; }",
      cursorLine: 1,
      cursorColumn: 8,
      selectedCode: mode === "fix_error" || mode === "generate_tests" ? undefined : "return a + b;",
      nearbyCode: "export function add(a: number, b: number) { return a + b; }",
      diagnostic: mode === "fix_error"
        ? { fileName: "app.ts", line: 1, column: 8, message: "Cannot find name 'a'." }
        : undefined,
      runError: mode === "fix_error" ? "ReferenceError: a is not defined" : undefined,
    });
    assert.ok(request, mode);
    assert.equal(request.mode, mode);
    assert.equal(request.fileName, "app.ts");
    assert.equal(request.activeFile !== undefined, mode === "generate_tests");
    assert.equal(validateObserverRequest(request)?.mode, mode);
  }
});

test("builds focused, explicit requests for every documentation mode", () => {
  for (const mode of DOCUMENT_OBSERVER_MODES) {
    const request = createObserverRequest({
      provider: "demo",
      mode,
      kind: "doc",
      fileName: "README.md",
      language: "markdown",
      content: "# Product\n\nA focused project description.",
      cursorLine: 3,
      cursorColumn: 4,
      selectedCode: mode === "improve_writing" ? "A focused project description." : undefined,
      nearbyCode: "# Product\n\nA focused project description.",
    });
    assert.ok(request, mode);
    assert.equal(request.kind, "doc");
    assert.equal(validateObserverRequest(request)?.mode, mode);
    assert.equal(
      request.activeFile !== undefined,
      ["explain_document", "summarize", "generate_readme_section"].includes(mode)
    );
  }
  assert.equal(createObserverRequest({
    provider: "demo",
    mode: "summarize",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "export {};",
    cursorLine: 1,
    cursorColumn: 1,
    nearbyCode: "export {};",
  }), null);
});

test("prefers selection, falls back to cursor context, and scopes diagnostics", () => {
  const selected = createObserverRequest({
    provider: "gemini",
    mode: "explain",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "const answer = 42;",
    cursorLine: 1,
    cursorColumn: 7,
    selectedCode: "answer",
    nearbyCode: "const answer = 42;",
  });
  assert.equal(selected?.source, "selection");
  assert.equal(observerContextSummary(selected!), "Sending selected code from app.ts");
  assert.equal("unexpectedProjectContent" in validateObserverRequest({
    ...selected,
    unexpectedProjectContent: "must be stripped",
  })!, false);

  const cursor = createObserverRequest({
    provider: "gemini",
    mode: "continue_code",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "const answer = 42;",
    cursorLine: 1,
    cursorColumn: 19,
    nearbyCode: "const answer = 42;",
  });
  assert.equal(cursor?.source, "cursor");
  assert.match(observerContextSummary(cursor!), /nearby code around line 1/);

  const diagnostic = createObserverRequest({
    provider: "gemini",
    mode: "fix_error",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "missing();",
    cursorLine: 24,
    cursorColumn: 3,
    nearbyCode: "missing();",
    diagnostic: { fileName: "app.ts", line: 24, column: 3, message: "missing is not defined" },
    runError: "ReferenceError: missing is not defined",
  });
  assert.equal(diagnostic?.source, "diagnostic");
  assert.equal(observerContextSummary(diagnostic!), "Sending error on line 24 from app.ts");
  assert.equal(diagnostic?.runError, "ReferenceError: missing is not defined");
  assert.equal(relevantObserverRunError(
    "unrelated output\napp.ts:24\nReferenceError: missing is not defined\nafter\nmore unrelated output",
    diagnostic!.diagnostic
  ), "unrelated output\napp.ts:24\nReferenceError: missing is not defined\nafter");
  assert.equal(relevantObserverRunError("unrelated terminal history", diagnostic!.diagnostic), undefined);
});

test("blocks sensitive files and limits active-file context to test generation", () => {
  assert.equal(isSensitiveObserverFile(".env.local"), true);
  assert.equal(isSensitiveObserverFile("private.pem"), true);
  assert.equal(createObserverRequest({
    provider: "demo",
    mode: "explain",
    kind: "code",
    fileName: ".env",
    language: "plaintext",
    content: "SECRET=value",
    cursorLine: 1,
    cursorColumn: 1,
    nearbyCode: "SECRET=value",
  }), null);
  const improve = createObserverRequest({
    provider: "demo",
    mode: "improve_code",
    kind: "code",
    fileName: "safe.ts",
    language: "typescript",
    content: "const safe = true;",
    cursorLine: 1,
    cursorColumn: 1,
    nearbyCode: "const safe = true;",
  });
  assert.equal(improve?.activeFile, undefined);
});

test("recognizes Observer shortcuts and safe explicit copy actions", async () => {
  assert.equal(isObserverAskShortcut({ key: "Enter", ctrlKey: true, metaKey: false }), true);
  assert.equal(isObserverAskShortcut({ key: "Enter", ctrlKey: false, metaKey: true }), true);
  assert.equal(isObserverAskShortcut({ key: "Enter", ctrlKey: false, metaKey: false }), false);
  assert.equal(isObserverDismissShortcut({ key: "Escape" }), true);
  const suggestion = {
    id: "11111111-1111-4111-8111-111111111111",
    explanation: "Use a constant.",
    snippet: "const value = 1;",
    reason: "Manual improve code request.",
  };
  let copied = "";
  assert.equal(await copyObserverSnippet(suggestion.snippet, async (value) => { copied = value; }), true);
  assert.equal(copied, suggestion.snippet);
  assert.equal(await copyObserverSnippet(suggestion.snippet, async () => { throw new Error("denied"); }), false);
});

test("Observer review actions checkpoint before apply and never save or execute commands", async () => {
  const appSource = await readFile(new URL("../renderer/src/App.tsx", import.meta.url), "utf8");
  const accept = appSource.slice(appSource.indexOf("const acceptObserverEdit"), appSource.indexOf("const undoObserverChange"));
  assert.ok(accept.indexOf("window.checkpoints.create") >= 0);
  assert.ok(accept.indexOf("window.checkpoints.create") < accept.indexOf("setTabs"));
  assert.doesNotMatch(accept, /saveTab|window\.(?:runner|terminal|git)\./);
  assert.match(accept, /autoSaveBlocked: true/);
  const reject = appSource.slice(appSource.indexOf("const rejectObserverEdit"), appSource.indexOf("const acceptObserverEdit"));
  assert.doesNotMatch(reject, /setTabs|window\.checkpoints\.create/);
  assert.match(reject, /recordOutcome/);
  assert.match(reject, /askObserver/);
});

test("sends every Observer mode with a bearer token and handles outcomes and API errors", async () => {
  const sentModes: ObserverMode[] = [];
  const sentOutcomes: string[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer desktop-access-token");
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { mode?: ObserverMode; outcome?: string };
    if (url.endsWith("/outcome")) {
      sentOutcomes.push(body.outcome ?? "");
      return new Response(JSON.stringify({ recorded: true }), { status: 200 });
    }
    sentModes.push(body.mode!);
    return new Response(JSON.stringify({
      provider: "demo",
      suggestion: {
        id: "11111111-1111-4111-8111-111111111111",
        explanation: "Focused explanation.",
        snippet: "const tested = true;",
        reason: "Manual request.",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new ObserverApiClient(
    "https://api.example.com",
    async () => "desktop-access-token",
    fakeFetch
  );
  for (const mode of OBSERVER_MODES) {
    const documentationMode = DOCUMENT_OBSERVER_MODES.includes(mode as typeof DOCUMENT_OBSERVER_MODES[number]);
    const request = createObserverRequest({
      provider: "demo",
      mode,
      kind: documentationMode ? "doc" : "code",
      fileName: documentationMode ? "README.md" : "app.ts",
      language: documentationMode ? "markdown" : "typescript",
      content: documentationMode ? "# Ready\n\nProject notes." : "export const ready = true;",
      cursorLine: 1,
      cursorColumn: 1,
      nearbyCode: documentationMode ? "# Ready\n\nProject notes." : "export const ready = true;",
      diagnostic: mode === "fix_error"
        ? { fileName: "app.ts", line: 1, column: 1, message: "Test error" }
        : undefined,
    });
    const result = await client.ask(request!);
    assert.equal(result.ok, true, mode);
  }
  assert.deepEqual(sentModes, [...OBSERVER_MODES]);
  await client.recordOutcome({ suggestionId: "11111111-1111-4111-8111-111111111111", outcome: "accepted" });
  await client.recordOutcome({ suggestionId: "11111111-1111-4111-8111-111111111111", outcome: "dismissed" });
  assert.deepEqual(sentOutcomes, ["accepted", "dismissed"]);

  const failing = new ObserverApiClient("https://api.example.com", async () => "token", async () =>
    new Response(JSON.stringify({ error: "Provider unavailable." }), { status: 502 })
  );
  const failed = await failing.ask(createObserverRequest({
    provider: "demo",
    mode: "explain",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "const value = 1;",
    cursorLine: 1,
    cursorColumn: 1,
    nearbyCode: "const value = 1;",
  })!);
  assert.deepEqual(failed, { ok: false, error: "Provider unavailable." });
});

test("rejects signed-out Observer calls before making a network request", async () => {
  let requested = false;
  const client = new ObserverApiClient(
    "https://api.example.com",
    async () => null,
    async () => {
      requested = true;
      return new Response(null, { status: 500 });
    }
  );
  const request = createObserverRequest({
    provider: "demo",
    mode: "explain",
    kind: "code",
    fileName: "app.ts",
    language: "typescript",
    content: "const value = 1;",
    cursorLine: 1,
    cursorColumn: 1,
    nearbyCode: "const value = 1;",
  });
  assert.deepEqual(await client.ask(request!), { ok: false, error: "Sign in before asking Observer." });
  assert.equal(requested, false);
});

test("overwrites an existing supported file and returns its new disk version", async () => {
  const opened = await readWorkspaceTextFile(workspaceRoot, "editable.ts");
  const saved = await writeWorkspaceTextFile(workspaceRoot, {
    relativePath: opened.relativePath,
    content: "const value = 2;\n",
    expectedModifiedAtMs: opened.modifiedAtMs,
  });

  assert.equal(await readFile(join(workspaceRoot, "editable.ts"), "utf8"), "const value = 2;\n");
  assert.equal(Number.isFinite(saved.modifiedAtMs), true);
});

test("round-trips MDX as inert Markdown source and preserves external-change conflicts", async () => {
  const path = join(workspaceRoot, "phase6.mdx");
  await writeFile(path, "# Guide\n\n<Component onclick={danger} />\n");
  const opened = await readWorkspaceTextFile(workspaceRoot, "phase6.mdx");
  assert.equal(opened.content, "# Guide\n\n<Component onclick={danger} />\n");
  const saved = await writeWorkspaceTextFile(workspaceRoot, {
    relativePath: opened.relativePath,
    content: "# Guide\n\nEdited source.\n",
    expectedModifiedAtMs: opened.modifiedAtMs,
  });
  await writeFile(path, "# External\n");
  const changed = await readWorkspaceTextFile(workspaceRoot, "phase6.mdx");
  const localDraft = "# Guide\n\nUnsaved local source.\n";
  const conflict = resolveExternalFileUpdate(
    { ...opened, content: "# Guide\n\nEdited source.\n", modifiedAtMs: saved.modifiedAtMs },
    localDraft,
    changed
  );
  assert.equal(conflict.kind, "conflict");
  assert.equal(localDraft, "# Guide\n\nUnsaved local source.\n");
  if (conflict.kind === "conflict") assert.equal(conflict.externalFile.content, "# External\n");
});

test("refuses to overwrite a file that changed after it was opened", async () => {
  const opened = await readWorkspaceTextFile(workspaceRoot, "stale.ts");
  const future = new Date(Date.now() + 10_000);
  await utimes(join(workspaceRoot, "stale.ts"), future, future);

  await assert.rejects(
    writeWorkspaceTextFile(workspaceRoot, {
      relativePath: "stale.ts",
      content: "const stale = true;\n",
      expectedModifiedAtMs: opened.modifiedAtMs,
    }),
    (error: unknown) =>
      error instanceof WorkspaceFileWriteError && error.code === "changed_on_disk"
  );
});

test("rejects invalid, oversized, unsupported, directory, and new-file writes", async () => {
  const rejectsWithCode = async (request: unknown, code: WorkspaceFileWriteError["code"]) => {
    await assert.rejects(
      writeWorkspaceTextFile(workspaceRoot, request),
      (error: unknown) => error instanceof WorkspaceFileWriteError && error.code === code
    );
  };

  await rejectsWithCode({}, "access_denied");
  await rejectsWithCode(
    { relativePath: "unsupported.png", content: "text", expectedModifiedAtMs: 0 },
    "unsupported"
  );
  await rejectsWithCode(
    { relativePath: "large.txt", content: "a".repeat(2 * 1024 * 1024 + 1), expectedModifiedAtMs: 0 },
    "too_large"
  );
  await rejectsWithCode(
    { relativePath: "folder.txt", content: "text", expectedModifiedAtMs: 0 },
    "not_file"
  );
  await assert.rejects(
    writeWorkspaceTextFile(workspaceRoot, {
      relativePath: "new.ts",
      content: "text",
      expectedModifiedAtMs: 0,
    })
  );
  await assert.rejects(access(join(workspaceRoot, "new.ts")));
});

test("rejects file writes outside the selected workspace", async () => {
  await assert.rejects(
    writeWorkspaceTextFile(workspaceRoot, {
      relativePath: "../outside/secret.txt",
      content: "overwrite",
      expectedModifiedAtMs: 0,
    })
  );
  await assert.rejects(
    writeWorkspaceTextFile(workspaceRoot, {
      relativePath: "outside-link/secret.txt",
      content: "overwrite",
      expectedModifiedAtMs: 0,
    })
  );
  assert.equal(await readFile(join(outsideDirectory, "secret.txt"), "utf8"), "outside");
});

test("validates portable single-segment workspace names", () => {
  assert.equal(validateWorkspaceEntryName("safe-name.ts"), "safe-name.ts");
  for (const name of ["", " file.ts", "file.ts ", ".", "..", "a/b.ts", "a\\b.ts", "bad?.ts", "CON", ".git"]) {
    assert.throws(
      () => validateWorkspaceEntryName(name),
      (error: unknown) =>
        error instanceof WorkspaceMutationError && error.code === "invalid_name"
    );
  }
});

test("creates supported files and folders exclusively inside an existing parent", async () => {
  const folder = await createWorkspaceEntry(workspaceRoot, {
    parentRelativePath: "operations",
    name: "created-folder",
    kind: "directory",
  });
  const file = await createWorkspaceEntry(workspaceRoot, {
    parentRelativePath: folder.relativePath,
    name: "created.ts",
    kind: "file",
  });

  assert.deepEqual(folder, {
    name: "created-folder",
    relativePath: "operations/created-folder",
    kind: "directory",
    isSymbolicLink: false,
  });
  assert.equal(file.relativePath, "operations/created-folder/created.ts");
  assert.equal(await readFile(join(workspaceRoot, file.relativePath), "utf8"), "");
});

test("rejects duplicate, unsupported, invalid, and escaping creates", async () => {
  const rejectsWithMutationCode = async (
    request: unknown,
    code: WorkspaceMutationError["code"]
  ) => {
    await assert.rejects(
      createWorkspaceEntry(workspaceRoot, request),
      (error: unknown) => error instanceof WorkspaceMutationError && error.code === code
    );
  };

  await rejectsWithMutationCode(
    { parentRelativePath: "operations", name: "duplicate.ts", kind: "file" },
    "duplicate"
  );
  await rejectsWithMutationCode(
    { parentRelativePath: "operations", name: "image.png", kind: "file" },
    "unsupported"
  );
  await rejectsWithMutationCode(
    { parentRelativePath: "operations", name: "../escape.ts", kind: "file" },
    "invalid_name"
  );
  await assert.rejects(
    createWorkspaceEntry(workspaceRoot, {
      parentRelativePath: "outside-link",
      name: "escape.ts",
      kind: "file",
    })
  );
});

test("renames supported files and folders without replacing duplicates", async () => {
  const file = await renameWorkspaceEntry(workspaceRoot, {
    relativePath: "operations/rename-me.ts",
    newName: "renamed.ts",
  });
  const folder = await renameWorkspaceEntry(workspaceRoot, {
    relativePath: "operations/rename-folder",
    newName: "renamed-folder",
  });

  assert.equal(file.relativePath, "operations/renamed.ts");
  assert.equal(folder.relativePath, "operations/renamed-folder");
  assert.equal(
    await readFile(join(workspaceRoot, "operations", "renamed-folder", "nested", "kept.txt"), "utf8"),
    "kept\n"
  );
  await assert.rejects(
    renameWorkspaceEntry(workspaceRoot, {
      relativePath: "operations/renamed.ts",
      newName: "duplicate.ts",
    }),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "duplicate"
  );
});

test("rejects unsafe, unsupported, root, and symlink renames", async () => {
  await assert.rejects(
    renameWorkspaceEntry(workspaceRoot, {
      relativePath: "operations/renamed.ts",
      newName: "../escape.ts",
    }),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "invalid_name"
  );
  await assert.rejects(
    renameWorkspaceEntry(workspaceRoot, {
      relativePath: "operations/renamed.ts",
      newName: "renamed.png",
    }),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "unsupported"
  );
  await assert.rejects(renameWorkspaceEntry(workspaceRoot, { relativePath: "", newName: "root" }));
  await assert.rejects(
    renameWorkspaceEntry(workspaceRoot, { relativePath: "safe-link", newName: "moved-link" }),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "unsupported"
  );
});

test("deletes files and empty folders but refuses non-empty folders and symlinks", async () => {
  await deleteWorkspaceEntry(workspaceRoot, "operations/delete-me.ts");
  await deleteWorkspaceEntry(workspaceRoot, "operations/empty-folder");
  await assert.rejects(access(join(workspaceRoot, "operations", "delete-me.ts")));
  await assert.rejects(access(join(workspaceRoot, "operations", "empty-folder")));

  await assert.rejects(
    deleteWorkspaceEntry(workspaceRoot, "operations/non-empty"),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "not_empty"
  );
  await assert.rejects(
    deleteWorkspaceEntry(workspaceRoot, "outside-link"),
    (error: unknown) => error instanceof WorkspaceMutationError && error.code === "unsupported"
  );
  assert.equal(
    await readFile(join(workspaceRoot, "operations", "non-empty", "child.txt"), "utf8"),
    "child\n"
  );
});

test("updates only affected open-tab paths after file and folder renames", () => {
  const renamedFolder = {
    name: "lib",
    relativePath: "src/lib",
    kind: "directory" as const,
    isSymbolicLink: false,
  };
  assert.equal(workspaceEntryContainsPath("src/utils/file.ts", "src/utils", "directory"), true);
  assert.equal(workspaceEntryContainsPath("src/utils.ts", "src/utils", "directory"), false);
  assert.equal(
    replaceWorkspaceEntryPath("src/utils/nested/file.ts", "src/utils", renamedFolder),
    "src/lib/nested/file.ts"
  );
  assert.equal(
    replaceWorkspaceEntryPath("src/other.ts", "src/utils", renamedFolder),
    "src/other.ts"
  );
});

test("watches, batches, ignores, suppresses, and stops workspace changes", async () => {
  const watchRoot = join(temporaryDirectory, "watcher-workspace");
  await mkdir(join(watchRoot, "src"), { recursive: true });
  await mkdir(join(watchRoot, "node_modules"), { recursive: true });

  assert.equal(shouldIgnoreWorkspaceWatchPath(watchRoot, join(watchRoot, "src")), false);
  assert.equal(
    shouldIgnoreWorkspaceWatchPath(watchRoot, join(watchRoot, "node_modules", "package.js")),
    true
  );
  assert.equal(shouldIgnoreWorkspaceWatchPath(watchRoot, outsideDirectory), true);

  const batches: Array<Array<{ relativePath: string; type: string }>> = [];
  let resolveNextBatch: (() => void) | null = null;
  const watcher = new WorkspaceWatcher(
    (batch) => {
      batches.push(batch.changes.map(({ relativePath, type }) => ({ relativePath, type })));
      resolveNextBatch?.();
      resolveNextBatch = null;
    },
    { batchDelayMs: 80, suppressionMs: 600, usePolling: true }
  );
  await watcher.start(watchRoot);

  const waitForBatch = () => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for workspace batch")), 3_000);
    resolveNextBatch = () => {
      clearTimeout(timeout);
      resolve();
    };
  });

  const firstBatch = waitForBatch();
  await Promise.all([
    writeFile(join(watchRoot, "src", "one.ts"), "one"),
    writeFile(join(watchRoot, "src", "two.ts"), "two"),
  ]);
  await firstBatch;
  assert.equal(batches.length, 1);
  assert.deepEqual(
    new Set(batches[0].map((change) => change.relativePath)),
    new Set(["src/one.ts", "src/two.ts"])
  );

  watcher.suppress(["src/internal.ts"]);
  await writeFile(join(watchRoot, "src", "internal.ts"), "internal");
  await writeFile(join(watchRoot, "node_modules", "ignored.ts"), "ignored");
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(batches.length, 1);

  await watcher.stop();
  await writeFile(join(watchRoot, "src", "after-stop.ts"), "stopped");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(batches.length, 1);
});

test("resolves external file updates without overwriting dirty buffers", () => {
  const opened = {
    name: "file.ts",
    relativePath: "src/file.ts",
    content: "const value = 1;",
    modifiedAtMs: 1,
  };
  const external = { ...opened, content: "const value = 2;", modifiedAtMs: 2 };

  assert.deepEqual(resolveExternalFileUpdate(opened, opened.content, external), {
    kind: "reload",
    file: external,
    draft: external.content,
  });
  assert.deepEqual(resolveExternalFileUpdate(opened, "const local = true;", external), {
    kind: "conflict",
    externalFile: external,
  });
});

test("matches exact file changes and parent-directory deletion events", () => {
  const batch = {
    timestamp: 1,
    changes: [
      { relativePath: "src/file.ts", type: "changed" as const, kind: "file" as const },
      { relativePath: "removed", type: "deleted" as const, kind: "directory" as const },
    ],
  };

  assert.equal(batchChangesFile(batch, "src/file.ts"), true);
  assert.equal(batchChangesFile(batch, "src/other.ts"), false);
  assert.equal(batchDeletesPath(batch, "removed/nested/file.ts"), true);
  assert.equal(batchDeletesPath(batch, "removed-name/file.ts"), false);
});

class FakePseudoTerminal implements PseudoTerminal {
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  killed = false;
  private dataListeners = new Set<(data: string) => void>();
  private exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push([cols, rows]);
  }

  kill(): void {
    this.killed = true;
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  emitData(data: string): void {
    this.dataListeners.forEach((listener) => listener(data));
  }

  emitExit(exitCode: number): void {
    this.exitListeners.forEach((listener) => listener({ exitCode }));
  }
}

test("starts one authorized terminal and validates input and resize operations", () => {
  const processes: FakePseudoTerminal[] = [];
  const spawnOptions: SpawnTerminalOptions[] = [];
  const dataEvents: string[] = [];
  const exitReasons: string[] = [];
  const controller = new TerminalSessionController(
    (options) => {
      spawnOptions.push(options);
      const process = new FakePseudoTerminal();
      processes.push(process);
      return process;
    },
    {
      data: (_webContentsId, event) => dataEvents.push(event.data),
      exit: (_webContentsId, event) => exitReasons.push(event.reason),
    }
  );

  assert.equal(controller.create(7, { cols: 80, rows: 24 }).ok, false);
  controller.setWorkspace(workspaceRoot, 7);
  const created = controller.create(7, { cols: 80, rows: 24 });
  assert.equal(created.ok, true);
  assert.deepEqual(spawnOptions, [{ cwd: workspaceRoot, cols: 80, rows: 24 }]);
  assert.equal(controller.create(7, { cols: 80, rows: 24 }).ok, false);
  if (!created.ok) return;

  assert.equal(controller.input(8, { sessionId: created.value.sessionId, data: "pwd\r" }).ok, false);
  assert.equal(controller.input(7, { sessionId: created.value.sessionId, data: "pwd\r" }).ok, true);
  assert.deepEqual(processes[0].writes, ["pwd\r"]);
  assert.equal(
    controller.resize(7, { sessionId: created.value.sessionId, cols: 120, rows: 35 }).ok,
    true
  );
  assert.deepEqual(processes[0].resizes, [[120, 35]]);
  processes[0].emitData("workspace output");
  assert.deepEqual(dataEvents, ["workspace output"]);

  assert.equal(controller.close(7, { sessionId: created.value.sessionId }).ok, true);
  assert.equal(processes[0].killed, true);
  assert.deepEqual(exitReasons, ["closed"]);
});

test("kills an active terminal on workspace replacement and renderer cleanup", () => {
  const processes: FakePseudoTerminal[] = [];
  const reasons: string[] = [];
  const controller = new TerminalSessionController(
    () => {
      const process = new FakePseudoTerminal();
      processes.push(process);
      return process;
    },
    {
      data: () => undefined,
      exit: (_webContentsId, event) => reasons.push(event.reason),
    }
  );

  controller.setWorkspace(workspaceRoot, 11);
  assert.equal(controller.create(11, { cols: 80, rows: 24 }).ok, true);
  controller.setWorkspace(outsideDirectory, 11);
  assert.equal(processes[0].killed, true);
  assert.deepEqual(reasons, ["workspace_changed"]);

  assert.equal(controller.create(11, { cols: 80, rows: 24 }).ok, true);
  controller.rendererClosed(11);
  assert.equal(processes[1].killed, true);
  assert.deepEqual(reasons, ["workspace_changed"]);
});

test("filters inherited secrets and selects a platform shell deterministically", () => {
  const environment = createTerminalEnvironment({
    PATH: "/usr/bin",
    HOME: "/tmp/home",
    SHELL: "/bin/fish",
    OPENAI_API_KEY: "must-not-leak",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
  });
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.TERM, "xterm-256color");
  assert.equal("OPENAI_API_KEY" in environment, false);
  assert.equal("SUPABASE_SERVICE_ROLE_KEY" in environment, false);
  assert.equal(selectTerminalShell("darwin", { SHELL: "/bin/fish" }), "/bin/fish");
  assert.equal(selectTerminalShell("linux", {}), "/bin/bash");
  assert.equal(selectTerminalShell("win32", { COMSPEC: "cmd.exe" }), "cmd.exe");
});
