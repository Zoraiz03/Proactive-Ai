import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, test } from "node:test";
import {
  prepareRecentWorkspace,
  recentProjectId,
  RECENT_PROJECT_LIMIT,
  RecentProjectsStore,
} from "./recent-projects.ts";

let temporaryDirectory = "";
let store: RecentProjectsStore;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-recent-projects-"));
  store = new RecentProjectsStore(join(temporaryDirectory, "app-data"));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("adds a recent workspace using only safe metadata", async () => {
  const workspace = join(temporaryDirectory, "alpha");
  await mkdir(workspace);
  const projects = await store.add(workspace, "alpha", 100);
  assert.deepEqual(projects, [{ path: workspace, displayName: "alpha", lastOpenedAt: 100 }]);
  const stored = JSON.parse(await readFile(store.filePath, "utf8"));
  assert.deepEqual(Object.keys(stored.projects[0]).sort(), ["displayName", "lastOpenedAt", "path"]);
  const publicProjects = await store.listPublic();
  assert.deepEqual(Object.keys(publicProjects[0]).sort(), [
    "displayName",
    "displayPath",
    "id",
    "lastOpenedAt",
  ]);
  assert.equal("path" in publicProjects[0], false);
});

test("deduplicates reopened projects and moves the newest entry to the top", async () => {
  const alpha = join(temporaryDirectory, "alpha");
  const beta = join(temporaryDirectory, "beta");
  await store.add(alpha, "alpha", 100);
  await store.add(beta, "beta", 200);
  const projects = await store.add(alpha, "alpha renamed", 300);
  assert.deepEqual(projects.map((project) => project.path), [alpha, beta]);
  assert.equal(projects[0].displayName, "alpha renamed");
  assert.equal(projects[0].lastOpenedAt, 300);
});

test("orders by last-opened time and enforces the maximum list size", async () => {
  for (let index = 0; index < RECENT_PROJECT_LIMIT + 3; index += 1) {
    await store.add(join(temporaryDirectory, `project-${index}`), `project-${index}`, index + 1);
  }
  const projects = await store.list();
  assert.equal(projects.length, RECENT_PROJECT_LIMIT);
  assert.equal(projects[0].displayName, `project-${RECENT_PROJECT_LIMIT + 2}`);
  assert.equal(projects.at(-1)?.displayName, "project-3");
});

test("removes a recent workspace without affecting other entries", async () => {
  const alpha = join(temporaryDirectory, "alpha");
  const beta = join(temporaryDirectory, "beta");
  await store.add(alpha, "alpha", 100);
  await store.add(beta, "beta", 200);
  const projects = await store.remove(recentProjectId(beta));
  assert.deepEqual(projects.map((project) => project.displayName), ["alpha"]);
});

test("clears recent-project history without retaining paths", async () => {
  await store.add(join(temporaryDirectory, "alpha"), "alpha", 100);
  await store.clear();
  assert.deepEqual(await store.list(), []);
});

test("rejects missing, non-directory, and unlisted workspaces on reopen", async () => {
  const missing = join(temporaryDirectory, "missing");
  await store.add(missing, "missing", 100);
  await assert.rejects(prepareRecentWorkspace(store, recentProjectId(missing)));

  const file = join(temporaryDirectory, "not-a-folder");
  await writeFile(file, "content");
  await store.add(file, "not-a-folder", 200);
  await assert.rejects(prepareRecentWorkspace(store, recentProjectId(file)));

  const unlisted = join(temporaryDirectory, "unlisted");
  await mkdir(unlisted);
  await assert.rejects(prepareRecentWorkspace(store, recentProjectId(unlisted)));
});

test("reopen uses secure workspace validation and refuses a replaced symlink", async () => {
  const workspace = join(temporaryDirectory, "workspace");
  const outside = join(temporaryDirectory, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  const canonicalWorkspace = await realpath(workspace);
  await store.add(canonicalWorkspace, "workspace", 100);

  const workspaceId = recentProjectId(canonicalWorkspace);
  const selected = await prepareRecentWorkspace(store, workspaceId);
  assert.equal(selected.rootPath, canonicalWorkspace);

  await rm(workspace, { recursive: true });
  await symlink(outside, workspace, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(prepareRecentWorkspace(store, workspaceId));
});
