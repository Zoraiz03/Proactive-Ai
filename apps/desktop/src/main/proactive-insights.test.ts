import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { ASSIST_PRESETS, INSIGHTS_VERSION, calculateInsights, recommendTuning, sanitizedCsv, type InsightMutation, type ProactiveInsightRecord } from "../shared/proactive-insights.ts";
import { ProactiveInsightsStore, parseInsightRecord, validateInsightMutation } from "./proactive-insights-store.ts";

let directory = "";
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "observer-insights-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const now = Date.now();
const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const query = { retentionDays: 30, metricsCollectionEnabled: true, mutedErrors: 2, mutedFiles: 1, mutedProjects: 1 };
const record = (overrides: Partial<ProactiveInsightRecord> = {}): ProactiveInsightRecord => ({ version: INSIGHTS_VERSION, eventId: id(1), detectorType: "failed_run", severity: "error", eligibleAt: now - 10_000, nudgeShownAt: now - 9_000, preset: "balanced", ...overrides });

test("calculates truthful aggregate and detector metrics, times, and usefulness", () => {
  const records = [
    record({ action: "investigate", actionAt: now - 8_000, usefulness: "yes", resolvedAt: now - 4_000 }),
    record({ eventId: id(2), action: "not_now", actionAt: now - 7_000, usefulness: "no" }),
    record({ eventId: id(3), detectorType: "failed_test", usefulness: "skip" }),
    record({ eventId: id(4), detectorType: "failed_build", nudgeShownAt: undefined }),
    record({ eventId: id(5), detectorType: "repeated_objective_failure", action: "suggest_fix", actionAt: now - 8_500 }),
  ];
  const report = calculateInsights(records, [], query, now);
  assert.equal(report.aggregate.eligibleEvents, 5);
  assert.equal(report.aggregate.nudgesShown, 4);
  assert.equal(report.aggregate.resolved, 1);
  assert.equal(report.aggregate.unresolved, 4);
  assert.equal(report.aggregate.averageTimeToActionMs, 1_167);
  assert.equal(report.aggregate.averageTimeToResolutionMs, 5_000);
  assert.equal(report.aggregate.actionRate, 3 / 4);
  assert.equal(report.aggregate.dismissalRate, 1 / 4);
  assert.equal(report.aggregate.usefulFeedbackRate, 1 / 2, "Skip is excluded from useful/not-useful rate");
  assert.equal(report.aggregate.skipped, 1);
  assert.equal(report.byDetector.find((item) => item.detectorType === "failed_test")?.eligibleEvents, 1);
  assert.equal(report.byDetector.find((item) => item.detectorType === "repeated_objective_failure")?.suggestFix, 1);
  assert.deepEqual([report.mutedErrors, report.mutedFiles, report.mutedProjects], [2, 1, 1]);
});

test("Low, Balanced, and High presets stay inside safe ranges", () => {
  assert.deepEqual(Object.keys(ASSIST_PRESETS), ["low", "balanced", "high"]);
  assert.equal(ASSIST_PRESETS.balanced.cooldownMinutes, 10);
  assert.equal(ASSIST_PRESETS.balanced.maximumPerHour, 3);
  assert.ok(ASSIST_PRESETS.low.cooldownMinutes > ASSIST_PRESETS.balanced.cooldownMinutes);
  assert.ok(ASSIST_PRESETS.low.maximumPerHour < ASSIST_PRESETS.balanced.maximumPerHour);
  assert.ok(ASSIST_PRESETS.high.cooldownMinutes >= 5);
  for (const item of Object.values(ASSIST_PRESETS)) { assert.ok(item.diagnosticCycles >= 2 && item.diagnosticCycles <= 5); assert.ok(item.maximumPerHour >= 1 && item.maximumPerHour <= 10); }
});

test("recommendations require strong local evidence and never apply themselves", () => {
  const records = Array.from({ length: 5 }, (_, index) => record({ eventId: id(index + 10), action: index < 4 ? "not_now" : "explain", actionAt: now - 5_000 }));
  const report = calculateInsights(records, [], query, now);
  const recommendation = recommendTuning(report, []);
  assert.equal(recommendation?.setting, "proactiveFailedRuns");
  assert.equal(recommendation?.nextValue, false);
  assert.equal(recommendTuning(report, [recommendation!.id]), null);
  assert.equal(recommendTuning(calculateInsights(records.slice(0, 4), [], query, now), []), null);
});

test("strict records and mutations reject prohibited content fields", () => {
  assert.deepEqual(parseInsightRecord(record()), record());
  for (const prohibited of ["code", "absolutePath", "filename", "prompt", "rawError", "terminalOutput", "modelResponse", "apiKey"] as const) {
    assert.equal(parseInsightRecord({ ...record(), [prohibited]: "private" }), null);
    const mutation = { kind: "eligible", eventId: id(1), detectorType: "failed_run", severity: "error", timestamp: now, preset: "balanced", collectionEnabled: true, [prohibited]: "private" };
    assert.equal(validateInsightMutation(mutation), null);
  }
  assert.equal(parseInsightRecord({ ...record(), eventId: "/Users/person/project.ts" }), null);
});

test("store supports lifecycle updates, explicit feedback, disabled collection, retention, and clearing", async () => {
  const store = new ProactiveInsightsStore(directory);
  const mutation = (value: Partial<InsightMutation>): InsightMutation => ({ kind: "eligible", eventId: id(1), detectorType: "failed_run", severity: "error", timestamp: now, preset: "balanced", collectionEnabled: true, ...value });
  await store.mutate(mutation({}), 30);
  await store.mutate(mutation({ kind: "shown", timestamp: now + 100 }), 30);
  await store.mutate(mutation({ kind: "action", action: "explain", timestamp: now + 200 }), 30);
  await store.mutate(mutation({ kind: "feedback", usefulness: "skip", timestamp: now + 300 }), 30);
  await store.mutate(mutation({ kind: "resolved", timestamp: now + 500 }), 30);
  await store.mutate(mutation({ eventId: id(2), collectionEnabled: false }), 30);
  let report = await store.report(query);
  assert.equal(report.records.length, 1); assert.equal(report.records[0].action, "explain"); assert.equal(report.records[0].usefulness, "skip"); assert.equal(report.records[0].resolvedAt, now + 500);
  await writeFile(store.filePath, JSON.stringify({ version: INSIGHTS_VERSION, records: [record({ eventId: id(3), eligibleAt: now - 40 * 86_400_000 }), record({ eventId: id(4), eligibleAt: now })], sessions: [] }));
  report = await store.report(query); assert.deepEqual(report.records.map((item) => item.eventId), [id(4)]);
  await store.clear(); assert.equal((await store.report(query)).records.length, 0);
});

test("evaluation sessions require pseudonymous consent data and can stop", async () => {
  const store = new ProactiveInsightsStore(directory);
  await assert.rejects(store.session({ action: "start", participantId: "/Users/alice", preset: "balanced", timestamp: now }));
  const started = await store.session({ action: "start", participantId: "classmate_07", preset: "low", timestamp: now });
  assert.equal(started?.participantId, "classmate_07");
  await assert.rejects(store.session({ action: "start", participantId: "other", preset: "high", timestamp: now }));
  const stopped = await store.session({ action: "stop", timestamp: now + 1_000 }); assert.equal(stopped?.endedAt, now + 1_000);
  const report = await store.report(query); assert.equal(report.sessions.length, 1); assert.equal(report.activeSession, null);
});

test("sanitized JSON and CSV exports contain evaluation data but no prohibited project fields", async () => {
  const store = new ProactiveInsightsStore(directory);
  await store.mutate({ kind: "eligible", eventId: id(1), detectorType: "failed_build", severity: "error", timestamp: now, preset: "high", collectionEnabled: true }, 30);
  await store.session({ action: "start", participantId: "participant_1", preset: "high", timestamp: now });
  await store.session({ action: "stop", timestamp: now + 1_000 });
  const json = await store.export({ ...query, format: "json" }); const csv = await store.export({ ...query, format: "csv" });
  assert.match(json.content, /Proactive Observer evaluation data/); assert.match(json.content, /participant_1/); assert.match(json.content, /failed_build/);
  assert.equal(csv.content, sanitizedCsv(await store.report(query))); assert.match(csv.content, /detector,eligible_events/);
  for (const content of [json.content, csv.content]) assert.doesNotMatch(content, /absolutePath|filename|rawError|terminalOutput|modelResponse|apiKey|selectedText|userPrompt|\/Users\//i);
});

test("corrupted and mixed local records recover safely", async () => {
  const store = new ProactiveInsightsStore(directory);
  await writeFile(store.filePath, "not json"); assert.equal((await store.report(query)).records.length, 0);
  await writeFile(store.filePath, JSON.stringify({ version: INSIGHTS_VERSION, records: [record(), { code: "secret" }], sessions: [{ participantId: "/absolute/path" }] }));
  const report = await store.report(query); assert.equal(report.records.length, 1); assert.equal(report.sessions.length, 0);
  const raw = await readFile(store.filePath, "utf8"); assert.doesNotMatch(raw, /secret|absolute\/path/);
});

test("usefulness and evaluation UI remain optional, nonmodal, consent-based, and explicit", async () => {
  const observer = await readFile(new URL("../renderer/src/ObserverPanel.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../renderer/src/ObserverInsightsSettings.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../renderer/src/App.tsx", import.meta.url), "utf8");
  assert.match(observer, /Was this Observer nudge useful\?/); assert.match(observer, />Yes<|\("yes"\)/); assert.match(observer, />No<|\("no"\)/); assert.match(observer, />Skip<|\("skip"\)/);
  const prompt = observer.slice(observer.indexOf("observer-usefulness")); assert.doesNotMatch(prompt, /aria-modal|role="dialog"|autoFocus/);
  assert.match(settings, /I understand and consent/); assert.match(settings, /Stop Evaluation/); assert.match(settings, /Preview all evaluation report data before export/); assert.match(settings, /Export sanitized JSON/); assert.match(settings, /Export sanitized CSV summary/);
  assert.match(settings, /Apply Recommendation/); assert.match(settings, /Dismiss permanently/); assert.doesNotMatch(settings, /recommendTuning[\s\S]{0,300}onSave\(/, "recommendation calculation does not apply a setting automatically");
  assert.match(app, /kind: "feedback"/); assert.match(app, /proactiveFeedbackPrompts/);
});
