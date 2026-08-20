import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  isSupportedWorkspaceTextFile,
  normalizeWorkspaceRelativePath,
  readWorkspaceDirectory,
  readWorkspaceTextFile,
  resolveWorkspacePath,
  WorkspaceFileError,
  WorkspaceFileWriteError,
  writeWorkspaceTextFile,
} from "./workspace-files.ts";
import { monacoLanguageForFile } from "../shared/languages.ts";

let temporaryDirectory = "";
let workspaceRoot = "";
let outsideDirectory = "";

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-explorer-"));
  workspaceRoot = join(temporaryDirectory, "workspace");
  outsideDirectory = join(temporaryDirectory, "outside");

  await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
  await mkdir(join(workspaceRoot, "folder.txt"));
  await mkdir(join(workspaceRoot, "node_modules"));
  await mkdir(join(workspaceRoot, ".git"));
  await mkdir(join(workspaceRoot, "dist"));
  await mkdir(join(workspaceRoot, "build"));
  await mkdir(join(workspaceRoot, ".next"));
  await mkdir(outsideDirectory);
  await writeFile(join(workspaceRoot, "README.md"), "workspace");
  await writeFile(join(workspaceRoot, "src", "index.ts"), "export {};");
  await writeFile(join(workspaceRoot, "empty.txt"), "");
  await writeFile(join(workspaceRoot, "editable.ts"), "const value = 1;\n");
  await writeFile(join(workspaceRoot, "stale.ts"), "const stale = false;\n");
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
      ["index.ts", "file"],
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
  assert.equal(monacoLanguageForFile("component.tsx"), "typescript");
  assert.equal(monacoLanguageForFile("script.py"), "python");
  assert.equal(monacoLanguageForFile("README.md"), "markdown");
  assert.equal(monacoLanguageForFile("config.YAML"), "yaml");
  assert.equal(monacoLanguageForFile("unknown"), "plaintext");
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
