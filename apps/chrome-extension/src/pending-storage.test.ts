import assert from "node:assert/strict";
import { test } from "node:test";
import { clearPendingCapture, loadPendingCapture, PENDING_CAPTURE_KEY, PENDING_CAPTURE_RETENTION_MS, savePendingCapture, type LocalStorageArea } from "./pending-storage.ts";
import { createWebContext } from "./web-context.ts";

class MemoryStorage implements LocalStorageArea {
  readonly values: Record<string, unknown> = {};
  async get(key: string) { return { [key]: this.values[key] }; }
  async set(items: Record<string, unknown>) { Object.assign(this.values, items); }
  async remove(key: string) { delete this.values[key]; }
}

test("stores only the latest valid pending capture and clears immediately", async () => {
  const storage = new MemoryStorage();
  const first = await createWebContext({ selectedText: "first", sourceTitle: "One", sourceUrl: "https://one.example", capturedAt: 1000 });
  const latest = await createWebContext({ selectedText: "latest", sourceTitle: "Two", sourceUrl: "https://two.example", capturedAt: 2000 });
  await savePendingCapture(storage, first);
  await savePendingCapture(storage, latest);
  assert.deepEqual(Object.keys(storage.values), [PENDING_CAPTURE_KEY]);
  assert.equal((await loadPendingCapture(storage, 2000))?.selectedText, "latest");
  await clearPendingCapture(storage);
  assert.deepEqual(storage.values, {});
});

test("removes expired, future, and malformed pending data", async () => {
  const storage = new MemoryStorage();
  const capture = await createWebContext({ selectedText: "temporary", sourceTitle: "Page", sourceUrl: "https://example.test", capturedAt: 1000 });
  await savePendingCapture(storage, capture);
  assert.equal(await loadPendingCapture(storage, 1000 + PENDING_CAPTURE_RETENTION_MS + 1), null);
  storage.values[PENDING_CAPTURE_KEY] = { unsafe: true };
  assert.equal(await loadPendingCapture(storage, 1000), null);
  storage.values[PENDING_CAPTURE_KEY] = { ...capture, capturedAt: 70_001 };
  assert.equal(await loadPendingCapture(storage, 1000), null);
  assert.deepEqual(storage.values, {});
});
