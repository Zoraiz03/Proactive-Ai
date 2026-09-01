import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { recentProjectId } from "./recent-projects.ts";
import { MultiFileChangeService } from "./multi-file-service.ts";
import { MultiFileApiClient } from "./multi-file-client.ts";
import { isSafeChangeSetPath, parseMultiFilePlan, validateMultiFileChangeSet, type MultiFileBase, type MultiFileChangeSet, type MultiFileLimits, type MultiFilePlan } from "../shared/multi-file-change.ts";

const limits: MultiFileLimits = { maximumFiles: 5, maximumChangedLines: 500, maximumGeneratedBytes: 200_000 };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
let root = ""; let data = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "proactive-multi-root-")); data = await mkdtemp(join(tmpdir(), "proactive-multi-data-"));
  await mkdir(join(root, "src")); await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n"); await writeFile(join(root, "src", "b.ts"), "export const b = 2;\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); await rm(data, { recursive: true, force: true }); });

const plan = (files: MultiFilePlan["files"] = [{ operation: "update", relativePath: "src/a.ts", reason: "Update A" }, { operation: "create", relativePath: "src/new.ts", reason: "Add helper" }]): MultiFilePlan => ({ planId: randomUUID(), summary: "Coordinated change", files, risks: ["Compile risk"], verificationSuggestions: ["npm test"] });
const set = (approved: MultiFilePlan, bases: MultiFileBase[], proposed = "export const a = 3;\n"): MultiFileChangeSet => ({ changeSetId: randomUUID(), planId: approved.planId, summary: "Implement plan", explanation: "Updates the coordinated behavior.", warnings: [], verificationSuggestions: ["npm test"], changes: bases.map((base) => base.operation === "update" ? { ...base, proposedContent: proposed, explanation: "Update implementation" } : { ...base, proposedContent: "export const created = true;\n", explanation: "Create helper" }) });
const request = (approved: MultiFilePlan, changeSet: MultiFileChangeSet, dirtyPaths: string[] = []) => ({ workspaceId: recentProjectId(root), plan: approved, changeSet, dirtyPaths, limits, checkpointRetentionLimit: 5 });

test("strict plan and change-set validation rejects duplicates, unsafe paths, and limits", async () => {
  const approved = plan(); const service = new MultiFileChangeService(data); const bases = await service.prepare(root, approved, limits); const valid = set(approved, bases);
  assert.ok(parseMultiFilePlan(approved, limits)); assert.ok(validateMultiFileChangeSet(valid, approved, bases, limits));
  assert.equal(parseMultiFilePlan({ ...approved, files: [approved.files[0], approved.files[0]] }, limits), null);
  assert.equal(isSafeChangeSetPath("../outside.ts"), false); assert.equal(isSafeChangeSetPath("/tmp/outside.ts"), false); assert.equal(isSafeChangeSetPath(".env"), false); assert.equal(isSafeChangeSetPath(".git/config"), false); assert.equal(isSafeChangeSetPath("image.png"), false);
  assert.equal(validateMultiFileChangeSet({ ...valid, changes: [...valid.changes, valid.changes[0]] }, approved, bases, limits), null);
  const oversized = { ...valid, changes: valid.changes.map((change) => change.operation === "create" ? { ...change, proposedContent: "export const line = 1;\n".repeat(30) } : change) };
  assert.equal(validateMultiFileChangeSet(oversized, approved, bases, { ...limits, maximumChangedLines: 25 }), null);
});

test("applies updates and creates as one checkpointed transaction, then rolls back the whole set", async () => {
  const service = new MultiFileChangeService(data); const approved = plan(); const bases = await service.prepare(root, approved, limits); const changeSet = set(approved, bases);
  const applied = await service.apply(root, request(approved, changeSet)); assert.equal(applied.files.length, 2); assert.equal(await readFile(join(root, "src", "a.ts"), "utf8"), "export const a = 3;\n");
  assert.equal(await readFile(join(root, "src", "new.ts"), "utf8"), "export const created = true;\n");
  const undone = await service.undo(root, recentProjectId(root)); assert.deepEqual(undone.removedPaths, ["src/new.ts"]); assert.equal(await readFile(join(root, "src", "a.ts"), "utf8"), "export const a = 1;\n"); await assert.rejects(readFile(join(root, "src", "new.ts")), /ENOENT/);
});

test("preflight rejects stale content, dirty tabs, and new-file collisions without partial writes", async () => {
  const service = new MultiFileChangeService(data); const approved = plan(); const bases = await service.prepare(root, approved, limits); const changeSet = set(approved, bases);
  await assert.rejects(() => service.apply(root, request(approved, changeSet, ["src/a.ts"])), /unsaved changes/);
  await writeFile(join(root, "src", "a.ts"), "externally changed\n"); await assert.rejects(() => service.apply(root, request(approved, changeSet)), /stale|inconsistent/);
  await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n"); await writeFile(join(root, "src", "new.ts"), "collision\n"); await assert.rejects(() => service.apply(root, request(approved, changeSet)), /collision/);
  assert.equal(await readFile(join(root, "src", "a.ts"), "utf8"), "export const a = 1;\n");
});

test("blocks secret, binary, and symbolic-link targets", async () => {
  const service = new MultiFileChangeService(data);
  await assert.rejects(() => service.prepare(root, plan([{ operation: "update", relativePath: ".env", reason: "unsafe" }]), limits), /invalid/);
  await writeFile(join(root, "src", "binary.ts"), Buffer.from([0, 1, 2])); await assert.rejects(() => service.prepare(root, plan([{ operation: "update", relativePath: "src/binary.ts", reason: "unsafe" }]), limits), /binary/i);
  const outside = join(tmpdir(), `proactive-outside-${Date.now()}.ts`); await writeFile(outside, "outside\n"); await symlink(outside, join(root, "src", "link.ts"));
  await assert.rejects(() => service.prepare(root, plan([{ operation: "update", relativePath: "src/link.ts", reason: "unsafe" }]), limits), /Symbolic/); await rm(outside, { force: true });
});

test("checkpoint failure prevents writes and simulated mid-apply failure restores every file", async () => {
  const approved = plan(); const first = new MultiFileChangeService(data, { failCheckpoint: true }); const bases = await first.prepare(root, approved, limits); const changeSet = set(approved, bases);
  await assert.rejects(() => first.apply(root, request(approved, changeSet)), /Checkpoint/); assert.equal(await readFile(join(root, "src", "a.ts"), "utf8"), "export const a = 1;\n");
  const failing = new MultiFileChangeService(data, { failAfterWrites: 1 }); await assert.rejects(() => failing.apply(root, request(approved, changeSet)), /restored/); assert.equal(await readFile(join(root, "src", "a.ts"), "utf8"), "export const a = 1;\n"); await assert.rejects(readFile(join(root, "src", "new.ts")), /ENOENT/);
});

test("rollback is hash-gated and refuses dirty affected tabs", async () => {
  const service = new MultiFileChangeService(data); const approved = plan(); const bases = await service.prepare(root, approved, limits); const changeSet = set(approved, bases); await service.apply(root, request(approved, changeSet));
  await assert.rejects(() => service.undo(root, recentProjectId(root), ["src/a.ts"]), /unsaved changes/);
  await writeFile(join(root, "src", "a.ts"), "user changed after apply\n"); await assert.rejects(() => service.undo(root, recentProjectId(root)), /Rollback conflict/); assert.equal(digest(await readFile(join(root, "src", "new.ts"), "utf8")), digest("export const created = true;\n"));
});

test("desktop API calls require a session, send bearer auth, and reject malformed server output", async () => {
  const approved = plan([{ operation: "update", relativePath: "src/a.ts", reason: "Update A" }]);
  const requestBody = { provider: "demo" as const, storeHistory: false, userRequest: "Update the behavior", limits, context: { mode: "plan_multi_file" } } as never;
  let authorization = "";
  const validFetch: typeof fetch = async (_input, init) => { authorization = new Headers(init?.headers).get("Authorization") ?? ""; return new Response(JSON.stringify({ plan: approved, provider: "demo" }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  const client = new MultiFileApiClient("http://localhost:3000", async () => "desktop-token", validFetch);
  const result = await client.plan(requestBody); assert.equal(result.ok, true); assert.equal(authorization, "Bearer desktop-token");
  let called = false; const signedOut = new MultiFileApiClient("http://localhost:3000", async () => null, async () => { called = true; return new Response(); });
  assert.deepEqual(await signedOut.plan(requestBody), { ok: false, error: "Sign in before using multi-file Observer." }); assert.equal(called, false);
  const malformed = new MultiFileApiClient("http://localhost:3000", async () => "token", async () => new Response(JSON.stringify({ plan: { files: [{ relativePath: "../escape.ts" }] }, provider: "demo" }), { status: 200 }));
  assert.deepEqual(await malformed.plan(requestBody), { ok: false, error: "Observer returned an invalid plan." });
});

test("review UI requires whole-set approval and never runs verification automatically", () => {
  const review = readFileSync(new URL("../renderer/src/MultiFileChangeWorkspace.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../renderer/src/App.tsx", import.meta.url), "utf8");
  assert.match(review, /Approve Plan/); assert.match(review, /Approve Entire Change Set/); assert.match(review, /Reject Entire Set/); assert.match(review, /Regenerate Entire Set/);
  assert.match(review, /Nothing runs unless you explicitly choose it/); assert.match(app, /window\.confirm\(`Run these commands/); assert.match(app, /safeVerificationCommands/);
  assert.doesNotMatch(app, /issueBottomCommand\("run-verification"\s*\)/);
});
