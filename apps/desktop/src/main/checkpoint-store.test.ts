import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CheckpointStore } from "./checkpoint-store.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const workspaceId = hash("workspace");
async function fixture() { const directory = await mkdtemp(join(tmpdir(), "observer-checkpoint-")); return { directory, store: new CheckpointStore(directory) }; }

test("creates and safely restores a local checkpoint", async () => {
  const { directory, store } = await fixture();
  try {
    await store.create({ workspaceId, relativePath: "src/app.ts", previousContent: "before", previousContentHash: hash("before"), appliedContentHash: hash("after"), suggestionId: "suggestion" }, 20);
    const restored = await store.restore(workspaceId, "src/app.ts", hash("after"));
    assert.equal(restored.previousContent, "before");
    await assert.rejects(() => store.restore(workspaceId, "src/app.ts", hash("after")), /No Observer checkpoint/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("refuses restoration after newer editor changes", async () => {
  const { directory, store } = await fixture();
  try {
    await store.create({ workspaceId, relativePath: "src/app.ts", previousContent: "before", previousContentHash: hash("before"), appliedContentHash: hash("after") }, 20);
    await assert.rejects(() => store.restore(workspaceId, "src/app.ts", hash("newer")), /changed after/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("enforces retention and clears checkpoint data", async () => {
  const { directory, store } = await fixture();
  try {
    await store.create({ workspaceId, relativePath: "one.ts", previousContent: "1", previousContentHash: hash("1"), appliedContentHash: hash("1a") }, 2);
    await store.create({ workspaceId, relativePath: "two.ts", previousContent: "2", previousContentHash: hash("2"), appliedContentHash: hash("2a") }, 2);
    await store.create({ workspaceId, relativePath: "three.ts", previousContent: "3", previousContentHash: hash("3"), appliedContentHash: hash("3a") }, 2);
    await assert.rejects(() => store.restore(workspaceId, "one.ts", hash("1a")), /No Observer checkpoint/);
    await store.clear();
    await assert.rejects(() => store.restore(workspaceId, "three.ts", hash("3a")), /No Observer checkpoint/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
