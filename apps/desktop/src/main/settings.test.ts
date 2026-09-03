import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, test } from "node:test";
import { SettingsApiClient } from "./settings-client.ts";
import { clearLocalObserverHistory, LocalSettingsStore, WorkspaceTabStore } from "./settings-store.ts";
import {
  DEFAULT_LOCAL_SETTINGS,
  isExcludedFromAiContext,
  normalizeLocalSettings,
  normalizeSyncedSettings,
  monacoOptionsFromSettings,
} from "../shared/settings.ts";
import { containsLikelySecret } from "../shared/observer.ts";

let temporaryDirectory = "";
beforeEach(async () => { temporaryDirectory = await mkdtemp(join(tmpdir(), "proactive-settings-")); });
afterEach(async () => { await rm(temporaryDirectory, { recursive: true, force: true }); });

test("uses restrictive defaults and recovers corrupted or old local settings", async () => {
  const store = new LocalSettingsStore(temporaryDirectory);
  assert.deepEqual(await store.get(), normalizeLocalSettings(DEFAULT_LOCAL_SETTINGS));
  await mkdir(temporaryDirectory, { recursive: true });
  await writeFile(store.filePath, "not json", "utf8");
  assert.deepEqual(await store.get(), normalizeLocalSettings(DEFAULT_LOCAL_SETTINGS));
  await writeFile(store.filePath, JSON.stringify({ version: 0, theme: "light", editor: { fontSize: 999 }, unexpected: "ignored" }));
  const recovered = await store.get();
  assert.equal(recovered.theme, "light");
  assert.equal(recovered.editor.fontSize, 14);
  assert.equal(recovered.contextMaximumRelatedFiles, 4);
  assert.equal(recovered.contextMaximumFileCharacters, 8_000);
  assert.equal(recovered.checkpointRetentionLimit, 20);
  assert.equal(recovered.multiFileMaximumFiles, 5);
  assert.equal(recovered.multiFileMaximumChangedLines, 500);
  assert.equal(recovered.multiFileMaximumGeneratedBytes, 200_000);
  assert.equal(recovered.proactiveObserverMode, "manual");
  assert.equal(recovered.proactivePersistentDiagnostics, true);
  assert.equal(recovered.proactiveCooldownMinutes, 10);
  assert.equal(recovered.proactivePreset, "balanced");
  assert.equal(recovered.proactiveMetricsCollection, true);
  assert.equal(recovered.proactiveFeedbackPrompts, true);
  assert.equal(recovered.proactiveRetentionDays, 30);
  assert.equal(recovered.documentationImpactEnabled, true);
  assert.equal(recovered.documentationMinimumConfidence, "medium");
  assert.equal(recovered.documentationIncludeLowConfidence, false);
  assert.deepEqual(recovered.documentationRelationshipDecisions, []);
  assert.equal(recovered.documentationUpdateMaximumFiles, 1);
  assert.equal("unexpected" in recovered, false);
  const bounded = normalizeLocalSettings({ contextMaximumRelatedFiles: 99, contextMaximumFileCharacters: 100 });
  assert.equal(bounded.contextMaximumRelatedFiles, 4);
  assert.equal(bounded.contextMaximumFileCharacters, 8_000);
  assert.equal(normalizeLocalSettings({ checkpointRetentionLimit: 500 }).checkpointRetentionLimit, 20);
  assert.equal(normalizeLocalSettings({ multiFileMaximumFiles: 50 }).multiFileMaximumFiles, 5);
  assert.equal(normalizeLocalSettings({ proactiveDiagnosticCycles: 1 }).proactiveDiagnosticCycles, 2);
  assert.equal(normalizeLocalSettings({ proactiveRetentionDays: 1 }).proactiveRetentionDays, 30);
  assert.equal(normalizeLocalSettings({ proactiveDetectorCooldownMinutes: { failed_run: 1 } }).proactiveDetectorCooldownMinutes.failed_run, 10);
  assert.equal(normalizeLocalSettings({ proactiveDetectorMaximumPerHour: { failed_test: 99 } }).proactiveDetectorMaximumPerHour.failed_test, 3);
  assert.deepEqual(normalizeLocalSettings({ documentationPaths: ["docs", "../private"], documentationRelationshipDecisions: [{ relationshipId: "a".repeat(24), evidenceHash: "b".repeat(64), decision: "rejected" }, { relationshipId: "bad", evidenceHash: "bad", decision: "confirmed" }] }).documentationRelationshipDecisions, [{ relationshipId: "a".repeat(24), evidenceHash: "b".repeat(64), decision: "rejected" }]);
  assert.deepEqual(normalizeLocalSettings({ documentationPaths: ["docs", "../private", "/absolute"] }).documentationPaths, ["docs"]);
});

test("stores only typed local preferences in owner-only app data", async () => {
  const store = new LocalSettingsStore(temporaryDirectory);
  const settings = await store.set({ ...DEFAULT_LOCAL_SETTINGS, theme: "dark", aiContextExclusions: ["private/**"] });
  assert.equal(settings.theme, "dark");
  const raw = await readFile(store.filePath, "utf8");
  assert.equal(raw.includes("access_token"), false);
  assert.equal(raw.includes("apiKey"), false);
});

test("stores bounded relative tab metadata without file content", async () => {
  const store = new WorkspaceTabStore(temporaryDirectory);
  const id = "a".repeat(64);
  await store.set(id, ["src/app.ts", "../escape", "/absolute", "src/app.ts"]);
  assert.deepEqual(await store.get(id), ["src/app.ts"]);
  assert.equal((await readFile(store.filePath, "utf8")).includes("file content"), false);
});

test("clears local Observer context history idempotently", async () => {
  const path = join(temporaryDirectory, "observer-context-history.json");
  const feedbackPath = join(temporaryDirectory, "proactive-observer-feedback.json");
  const insightsPath = join(temporaryDirectory, "proactive-observer-insights-v2.json");
  await writeFile(path, "local metadata");
  await writeFile(feedbackPath, "local metadata");
  await writeFile(insightsPath, "local metadata");
  await clearLocalObserverHistory(temporaryDirectory);
  await clearLocalObserverHistory(temporaryDirectory);
  await assert.rejects(readFile(path, "utf8"));
  await assert.rejects(readFile(feedbackPath, "utf8"));
  await assert.rejects(readFile(insightsPath, "utf8"));
});

test("keeps local and synced schemas separate", () => {
  const local = normalizeLocalSettings({ theme: "light", preferredProvider: "openai" });
  const synced = normalizeSyncedSettings({ preferredProvider: "openai", preferredModel: "gpt-4o-mini", theme: "dark" });
  assert.equal(local.theme, "light");
  assert.equal("preferredProvider" in local, false);
  assert.equal(synced.preferredProvider, "openai");
  assert.equal(normalizeSyncedSettings({ showContextPreview: false }).showContextPreview, true);
  assert.equal("theme" in synced, false);
});

test("maps runtime editor updates directly to Monaco options", () => {
  assert.deepEqual(monacoOptionsFromSettings({ ...DEFAULT_LOCAL_SETTINGS.editor, fontSize: 18, tabSize: 4, wordWrap: true, minimap: false }), {
    fontSize: 18, tabSize: 4, wordWrap: "on", minimap: { enabled: false },
  });
});

test("permanent secret rules cannot be removed by user exclusions", () => {
  assert.equal(isExcludedFromAiContext(".env.production", []), true);
  assert.equal(isExcludedFromAiContext("keys/signing.pem", []), true);
  assert.equal(isExcludedFromAiContext("src/private/config.ts", ["src/private"]), true);
  assert.equal(isExcludedFromAiContext("src/public.ts", ["src/private"]), false);
  assert.equal(containsLikelySecret('api_key = "1234567890abcdef"'), true);
  assert.equal(containsLikelySecret("const label = 'not secret';"), false);
});

test("signed-out settings and API-key calls never reach the network", async () => {
  let fetches = 0;
  const client = new SettingsApiClient("https://example.test", async () => null, async () => {
    fetches += 1;
    return new Response();
  });
  assert.equal((await client.getSynced()).ok, false);
  assert.equal((await client.saveApiKey({ provider: "openai", apiKey: "raw-secret", verify: true })).ok, false);
  assert.equal(fetches, 0);
});

test("provider status rejects any response containing raw key material", async () => {
  const client = new SettingsApiClient("https://example.test", async () => "jwt", async () => new Response(JSON.stringify({ providers: [{
    provider: "openai", label: "OpenAI", models: ["gpt-4o-mini"], systemProvided: false,
    userKeyConfigured: true, available: true, apiKey: "must-not-return",
  }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const result = await client.providerStatus();
  assert.equal(result.ok, false);
});

test("API-key save, status, and delete use bearer auth and safe metadata only", async () => {
  const requests: Array<{ url: string; method: string; authorization: string | null; body: string }> = [];
  const client = new SettingsApiClient("https://example.test", async () => "desktop-jwt", async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET", authorization: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") });
    const payload = String(input).endsWith("/providers")
      ? { providers: [{ provider: "openai", label: "OpenAI", models: ["gpt-4o-mini"], systemProvided: false, userKeyConfigured: true, available: true }] }
      : { ok: true };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal((await client.saveApiKey({ provider: "openai", apiKey: "write-only-value", verify: true })).ok, true);
  assert.equal((await client.providerStatus()).ok, true);
  assert.equal((await client.deleteApiKey("openai")).ok, true);
  assert.deepEqual(requests.map((request) => request.method), ["PUT", "GET", "DELETE"]);
  assert.equal(requests.every((request) => request.authorization === "Bearer desktop-jwt"), true);
  assert.equal(requests[0].body.includes("write-only-value"), true);
  assert.equal(requests[1].body.includes("write-only-value"), false);
});
