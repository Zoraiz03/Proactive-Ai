import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("manifest uses only the reviewed minimal permissions and no host access", async () => {
  const manifest = JSON.parse(await read("manifest.json")) as Record<string, unknown>;
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage", "contextMenus"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  for (const permission of ["history", "bookmarks", "downloads", "clipboardRead", "cookies", "webRequest", "nativeMessaging"]) {
    assert.equal(JSON.stringify(manifest).includes(permission), false);
  }
});

test("popup renders untrusted content as plain text and keeps transfer disabled", async () => {
  const [html, popup] = await Promise.all([read("popup.html"), read("src/popup.ts")]);
  assert.match(html, /id="send"[^>]*disabled/);
  assert.match(html, /Desktop connection will be added in the next phase\./);
  assert.match(html, /Only explicitly selected text is captured\./);
  assert.doesNotMatch(html, /on(?:click|load|error)\s*=/i);
  assert.doesNotMatch(popup, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(popup, /textContent/);
});

test("extension contains no network, cloud, AI, or desktop transport implementation", async () => {
  const sources = await Promise.all(["src/background.ts", "src/page-capture.ts", "src/pending-storage.ts", "src/popup.ts", "src/web-context.ts"].map(read));
  const code = sources.join("\n");
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|chrome\.runtime\.connectNative/);
  assert.doesNotMatch(code, /supabase|localhost|127\.0\.0\.1|Authorization|Bearer|apiKey/i);
  assert.match(code, /Send selected text to Proactive AI IDE/);
});
