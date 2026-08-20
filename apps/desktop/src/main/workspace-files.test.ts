import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  normalizeWorkspaceRelativePath,
  readWorkspaceDirectory,
  resolveWorkspacePath,
} from "./workspace-files.ts";

let temporaryDirectory = "";
let workspaceRoot = "";
let outsideDirectory = "";

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-explorer-"));
  workspaceRoot = join(temporaryDirectory, "workspace");
  outsideDirectory = join(temporaryDirectory, "outside");

  await mkdir(join(workspaceRoot, "src", "nested"), { recursive: true });
  await mkdir(join(workspaceRoot, "node_modules"));
  await mkdir(join(workspaceRoot, ".git"));
  await mkdir(join(workspaceRoot, "dist"));
  await mkdir(join(workspaceRoot, "build"));
  await mkdir(join(workspaceRoot, ".next"));
  await mkdir(outsideDirectory);
  await writeFile(join(workspaceRoot, "README.md"), "workspace");
  await writeFile(join(workspaceRoot, "src", "index.ts"), "export {};");
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

  assert.deepEqual(names, ["safe-link", "src", "README.md"]);
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
