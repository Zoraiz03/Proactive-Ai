import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
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
  await mkdir(outsideDirectory);
  await writeFile(join(workspaceRoot, "README.md"), "workspace");
  await writeFile(join(workspaceRoot, "src", "index.ts"), "export {};");
  await writeFile(join(workspaceRoot, "empty.txt"), "");
  await writeFile(join(workspaceRoot, "editable.ts"), "const value = 1;\n");
  await writeFile(join(workspaceRoot, "stale.ts"), "const stale = false;\n");
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
