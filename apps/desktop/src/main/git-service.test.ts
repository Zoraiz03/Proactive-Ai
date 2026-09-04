import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, test } from "node:test";
import { gitBaseArguments, gitStatusArguments, GitExecutionError, GitRepositoryService } from "./git-service.ts";
import { validateGitDiffRequest } from "../shared/git.ts";

const execute = promisify(execFile);
let temporaryDirectory = "";
let repository = "";

async function git(args: string[], cwd = repository) {
  return execute("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

async function createRepository() {
  repository = join(temporaryDirectory, "repository with spaces");
  await mkdir(repository);
  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@example.invalid"]);
  await git(["config", "user.name", "Desktop Git Test"]);
  await Promise.all([
    writeFile(join(repository, "tracked.txt"), "tracked base\n"),
    writeFile(join(repository, "staged.txt"), "staged base\n"),
    writeFile(join(repository, "delete.txt"), "delete base\n"),
    writeFile(join(repository, "old name.txt"), "rename base\n"),
    writeFile(join(repository, "space name.txt"), "space base\n"),
    writeFile(join(repository, "binary.dat"), Buffer.from([0, 1, 2, 3])),
  ]);
  await git(["add", "--", "."]);
  await git(["commit", "-m", "test base"]);
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-git-test-"));
  await createRepository();
});

afterEach(async () => { await rm(temporaryDirectory, { recursive: true, force: true }); });

test("detects repositories, parses the branch, and separates staged and unstaged changes", async () => {
  await writeFile(join(repository, "tracked.txt"), "tracked current\n");
  await writeFile(join(repository, "staged.txt"), "staged current\n");
  await git(["add", "--", "staged.txt"]);
  const status = await new GitRepositoryService().status(repository);
  assert.equal(status.state, "repository");
  if (status.state !== "repository") return;
  assert.equal(status.branch, "main");
  assert.equal(status.repositoryName, "repository with spaces");
  assert.equal(status.files.find((file) => file.relativePath === "staged.txt")?.staged, true);
  assert.equal(status.files.find((file) => file.relativePath === "tracked.txt")?.unstaged, true);
});

test("parses untracked, deleted, renamed, binary, and space-containing paths", async () => {
  await writeFile(join(repository, "untracked file.txt"), "new\n");
  await writeFile(join(repository, "space name.txt"), "changed space\n");
  await writeFile(join(repository, "binary.dat"), Buffer.from([0, 8, 9]));
  await unlink(join(repository, "delete.txt"));
  await git(["mv", "--", "old name.txt", "renamed name.txt"]);
  const status = await new GitRepositoryService().status(repository);
  assert.equal(status.state, "repository");
  if (status.state !== "repository") return;
  assert.equal(status.files.find((file) => file.relativePath === "untracked file.txt")?.kind, "untracked");
  assert.equal(status.files.find((file) => file.relativePath === "delete.txt")?.kind, "deleted");
  assert.equal(status.files.find((file) => file.relativePath === "space name.txt")?.kind, "modified");
  const renamed = status.files.find((file) => file.relativePath === "renamed name.txt");
  assert.equal(renamed?.kind, "renamed");
  assert.equal(renamed?.originalPath, "old name.txt");
  assert.equal(status.files.find((file) => file.relativePath === "binary.dat")?.kind, "modified");
});

test("returns correct original/current content for modified, untracked, deleted, and renamed files", async () => {
  await writeFile(join(repository, "tracked.txt"), "tracked current\n");
  await writeFile(join(repository, "new file.txt"), "new current\n");
  await unlink(join(repository, "delete.txt"));
  await git(["mv", "--", "old name.txt", "renamed name.txt"]);
  await writeFile(join(repository, "renamed name.txt"), "rename current\n");
  const service = new GitRepositoryService();
  await service.status(repository);
  const modified = await service.diff(repository, "tracked.txt");
  assert.deepEqual(modified.state === "text" && [modified.originalContent, modified.currentContent], ["tracked base\n", "tracked current\n"]);
  const untracked = await service.diff(repository, "new file.txt");
  assert.deepEqual(untracked.state === "text" && [untracked.originalContent, untracked.currentContent], ["", "new current\n"]);
  const deleted = await service.diff(repository, "delete.txt");
  assert.deepEqual(deleted.state === "text" && [deleted.originalContent, deleted.currentContent], ["delete base\n", ""]);
  const renamed = await service.diff(repository, "renamed name.txt");
  assert.equal(renamed.originalPath, "old name.txt");
  assert.deepEqual(renamed.state === "text" && [renamed.originalContent, renamed.currentContent], ["rename base\n", "rename current\n"]);
});

test("reports binary diffs without decoding executable content", async () => {
  await writeFile(join(repository, "binary.dat"), Buffer.from([0, 9, 8, 7]));
  const service = new GitRepositoryService();
  await service.status(repository);
  assert.equal((await service.diff(repository, "binary.dat")).state, "binary");
});

test("detects non-Git workspaces and a missing Git executable", async () => {
  const plain = join(temporaryDirectory, "plain");
  await mkdir(plain);
  assert.deepEqual(await new GitRepositoryService().status(plain), { state: "not_repository" });
  assert.deepEqual(await new GitRepositoryService({ binaryPath: join(temporaryDirectory, "missing-git") }).status(plain), { state: "missing_git" });
});

test("enforces changed-file limits without losing the total", async () => {
  await Promise.all(Array.from({ length: 5 }, (_, index) => writeFile(join(repository, `new-${index}.txt`), "new\n")));
  const status = await new GitRepositoryService({ resultLimit: 2 }).status(repository);
  assert.equal(status.state, "repository");
  if (status.state !== "repository") return;
  assert.equal(status.files.length, 2);
  assert.equal(status.totalFiles, 5);
  assert.equal(status.truncated, true);
});

test("times out and cancels long-running Git processes", async (context) => {
  if (process.platform === "win32") { context.skip("Executable fixture uses a POSIX shebang."); return; }
  const fakeGit = join(temporaryDirectory, "fake-git");
  await writeFile(fakeGit, "#!/bin/sh\nexec sleep 5\n", "utf8");
  await chmod(fakeGit, 0o700);
  await assert.rejects(new GitRepositoryService({ binaryPath: fakeGit, timeoutMs: 30 }).status(repository), (error) => error instanceof GitExecutionError && error.code === "timeout");
  const service = new GitRepositoryService({ binaryPath: fakeGit, timeoutMs: 5_000 });
  const pending = service.status(repository);
  setTimeout(() => service.cancel(), 30);
  await assert.rejects(pending, (error) => error instanceof GitExecutionError && error.code === "cancelled");
});

test("renderer requests cannot provide arbitrary Git commands or unsafe paths", () => {
  assert.deepEqual(validateGitDiffRequest({ relativePath: "folder/file with spaces.txt" }), { relativePath: "folder/file with spaces.txt" });
  assert.equal(validateGitDiffRequest({ relativePath: "file.txt", command: "push" }), null);
  assert.deepEqual(gitStatusArguments(), ["-c", "core.quotepath=false", "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
  assert.deepEqual(gitBaseArguments("folder/file.txt"), ["cat-file", "blob", "HEAD:folder/file.txt"]);
  assert.throws(() => gitBaseArguments("../outside"));
});
