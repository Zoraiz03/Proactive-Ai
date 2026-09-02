import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("manifest keeps site access optional and limits privileged APIs", async () => {
  const manifest = JSON.parse(await read("manifest.json")) as Record<string, unknown>;
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
  for (const permission of ["history", "bookmarks", "downloads", "clipboardRead", "cookies", "webRequest", "nativeMessaging", "<all_urls>"]) assert.equal(JSON.stringify(manifest).includes(permission), false);
});

test("popup exposes explicit per-site toggle and pairing without rendering page content", async () => {
  const [html, popup] = await Promise.all([read("popup.html"), read("src/popup.ts")]);
  assert.match(html, /Turn on for this website/);
  assert.match(html, /Pairing code from the IDE/);
  assert.match(html, /Text stays on the page until you click the icon/);
  assert.doesNotMatch(html, /on(?:click|load|error)\s*=/i);
  assert.doesNotMatch(popup, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(popup, /textContent/);
});

test("selection UI is isolated, explicit, dismissible, and blocks editable fields", async () => {
  const overlay = await read("src/selection-overlay.ts");
  assert.match(overlay, /attachShadow\(\{ mode: "closed" \}\)/);
  assert.match(overlay, /input,textarea,select,\[contenteditable\]/);
  assert.match(overlay, /Send to IDE/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /window\.addEventListener\("scroll", hide/);
  assert.match(overlay, /proactive:send-selection/);
  assert.doesNotMatch(overlay, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("desktop transport is confined to paired loopback requests", async () => {
  const [bridge, background] = await Promise.all([read("src/bridge-client.ts"), read("src/background.ts")]);
  assert.match(bridge, /http:\/\/127\.0\.0\.1/);
  assert.match(bridge, /Authorization: `Bearer/);
  assert.match(bridge, /chrome\.storage\.session/);
  assert.doesNotMatch(bridge + background, /supabase|openai|anthropic|gemini|WebSocket|sendBeacon|connectNative/i);
  for (const source of ["src/background.ts", "src/popup.ts", "src/selection-overlay.ts", "src/site-access.ts", "src/web-context.ts"]) assert.doesNotMatch(await read(source), /\bfetch\s*\(/);
});
