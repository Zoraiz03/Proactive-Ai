import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  normalizedFailureSignature,
  ProactiveObserverEngine,
  type ProactiveSettingsSnapshot,
} from "../shared/proactive-observer.ts";
import { parseVerificationTaskCommand } from "../shared/verification-task.ts";

const workspaceId = "a".repeat(64);
const baseSettings = (overrides: Partial<ProactiveSettingsSnapshot> = {}): ProactiveSettingsSnapshot => ({
  mode: "assist",
  persistentDiagnostics: true,
  failedRuns: true,
  failedTests: true,
  failedBuilds: true,
  cooldownMinutes: 0,
  maximumNudgesPerHour: 10,
  mutedErrors: [],
  mutedFiles: [],
  mutedProjects: [],
  ...overrides,
});
const error = { severity: "error" as const, message: "Cannot find name widget", line: 12, column: 4 };

test("Manual and Off modes are inert and warning/temporary diagnostics do not trigger", () => {
  const engine = new ProactiveObserverEngine();
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [error], baseSettings({ mode: "manual" })).nudge, null);
  assert.equal(engine.observeObjectiveFailure({ kind: "run", workspaceId, message: "exit 1", succeeded: false }, baseSettings({ mode: "off" })).nudge, null);
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [{ ...error, severity: "warning" }], baseSettings()).nudge, null);
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [error], baseSettings()).nudge, null);
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [], baseSettings()).nudge, null);
});

test("an identical error needs two meaningful save cycles and deduplicates to one nudge", () => {
  const engine = new ProactiveObserverEngine();
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [error], baseSettings()).nudge, null);
  const second = engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [error], baseSettings());
  assert.equal(second.nudge?.event.detectorType, "persistent_diagnostic");
  assert.equal(second.nudge?.event.occurrenceCount, 2);
  assert.equal(engine.observeDiagnosticCycle(workspaceId, "src/a.ts", [error], baseSettings()).nudge, null);
  assert.equal(engine.currentNudge()?.event.eventId, second.nudge?.event.eventId);
});

test("controlled run, test, and build failures trigger while success resolves", () => {
  for (const kind of ["run", "test", "build"] as const) {
    const engine = new ProactiveObserverEngine();
    const failed = engine.observeObjectiveFailure({ kind, workspaceId, relativePath: "src/a.ts", message: `${kind} failed`, succeeded: false }, baseSettings());
    assert.equal(failed.nudge?.event.detectorType, kind === "run" ? "failed_run" : kind === "test" ? "failed_test" : "failed_build");
    engine.dismiss("not_now");
    const repeated = engine.observeObjectiveFailure({ kind, workspaceId, relativePath: "src/a.ts", message: `${kind} failed`, succeeded: false }, baseSettings());
    assert.equal(repeated.nudge, null, "Not Now suppresses the same unresolved failure");
    const resolved = engine.observeObjectiveFailure({ kind, workspaceId, relativePath: "src/a.ts", message: "success", succeeded: true }, baseSettings());
    assert.equal(resolved.resolved.length, 1);
    const returned = engine.observeObjectiveFailure({ kind, workspaceId, relativePath: "src/a.ts", message: `${kind} failed`, succeeded: false }, baseSettings());
    assert.ok(returned.nudge, "the failure may return after a successful resolution");
  }
});

test("failure normalization is stable while raw failure details stay out of signatures", () => {
  const first = normalizedFailureSignature("failed_run", workspaceId, "src/a.ts", 8, "Error at /Users/alice/project/a.ts:123 token abcdefghijklmnopqrstuvwxyz");
  const second = normalizedFailureSignature("failed_run", workspaceId, "src/a.ts", 8, "Error at /Users/bob/other/a.ts:999 token zyxwvutsrqponmlkjihgfedcba");
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{16}$/);
  assert.doesNotMatch(first, /alice|token|project/);
});

test("removed files resolve their active events and detector failures fail closed", () => {
  const engine = new ProactiveObserverEngine();
  assert.ok(engine.observeObjectiveFailure({ kind: "run", workspaceId, relativePath: "removed.js", message: "failed", succeeded: false }, baseSettings()).nudge);
  assert.equal(engine.resolveFile(workspaceId, "removed.js").resolved.length, 1);
  assert.equal(engine.currentNudge(), null);
  const broken = new ProactiveObserverEngine({ now: () => { throw new Error("clock failure"); } });
  const observation = broken.observeObjectiveFailure({ kind: "run", workspaceId, message: "failed", succeeded: false }, baseSettings());
  assert.equal(observation.failedSafely, true);
  assert.equal(observation.nudge, null);
});

test("cooldown, hourly cap, one-active-nudge, detector switches, and mute scopes are enforced", () => {
  let now = 1_000_000;
  const engine = new ProactiveObserverEngine({ now: () => now });
  const first = engine.observeObjectiveFailure({ kind: "run", workspaceId, relativePath: "a.js", message: "one", succeeded: false }, baseSettings({ cooldownMinutes: 10, maximumNudgesPerHour: 1 }));
  assert.ok(first.nudge);
  assert.equal(engine.observeObjectiveFailure({ kind: "build", workspaceId, message: "two", succeeded: false }, baseSettings()).nudge, null, "only one nudge is active");
  engine.dismiss("not_now");
  now += 11 * 60_000;
  assert.equal(engine.observeObjectiveFailure({ kind: "build", workspaceId, message: "two", succeeded: false }, baseSettings({ maximumNudgesPerHour: 1 })).nudge, null, "hourly cap applies per project");
  now += 60 * 60_000;
  assert.equal(engine.observeObjectiveFailure({ kind: "test", workspaceId, message: "three", succeeded: false }, baseSettings({ failedTests: false })).nudge, null);
  assert.equal(new ProactiveObserverEngine().observeObjectiveFailure({ kind: "run", workspaceId, message: "disabled", succeeded: false }, baseSettings({ failedRuns: false })).nudge, null);
  assert.equal(new ProactiveObserverEngine().observeObjectiveFailure({ kind: "build", workspaceId, message: "disabled", succeeded: false }, baseSettings({ failedBuilds: false })).nudge, null);
  const diagnosticDisabled = new ProactiveObserverEngine();
  diagnosticDisabled.observeDiagnosticCycle(workspaceId, "a.ts", [error], baseSettings({ persistentDiagnostics: false }));
  assert.equal(diagnosticDisabled.observeDiagnosticCycle(workspaceId, "a.ts", [error], baseSettings({ persistentDiagnostics: false })).nudge, null);

  for (const muted of [
    baseSettings({ mutedProjects: [workspaceId] }),
    baseSettings({ mutedFiles: ["a.js"] }),
  ]) {
    const mutedEngine = new ProactiveObserverEngine();
    assert.equal(mutedEngine.observeObjectiveFailure({ kind: "run", workspaceId, relativePath: "a.js", message: "muted", succeeded: false }, muted).nudge, null);
  }
  const signatureEngine = new ProactiveObserverEngine();
  const shown = signatureEngine.observeObjectiveFailure({ kind: "run", workspaceId, relativePath: "a.js", message: "muted signature", succeeded: false }, baseSettings()).nudge!;
  const mutedEngine = new ProactiveObserverEngine();
  assert.equal(mutedEngine.observeObjectiveFailure({ kind: "run", workspaceId, relativePath: "a.js", message: "muted signature", succeeded: false }, baseSettings({ mutedErrors: [shown.event.normalizedSignature] })).nudge, null);
});

test("only strict explicit verification actions are recognized", () => {
  assert.equal(parseVerificationTaskCommand("npm test")?.kind, "test");
  assert.equal(parseVerificationTaskCommand("npm run build")?.kind, "build");
  assert.equal(parseVerificationTaskCommand("npx tsc --noEmit")?.kind, "build");
  assert.equal(parseVerificationTaskCommand("echo tests failed"), null);
  assert.equal(parseVerificationTaskCommand("npm test && curl example.test"), null);
  assert.equal(parseVerificationTaskCommand("git status"), null);
});

test("the proactive action path prepares Context Preview before any AI request and the nudge stays nonmodal", async () => {
  const app = await readFile(new URL("../renderer/src/App.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../renderer/src/ObserverPanel.tsx", import.meta.url), "utf8");
  const actionStart = app.indexOf("const handleProactiveAction");
  const actionEnd = app.indexOf("const muteProactiveNudge", actionStart);
  const actionBody = app.slice(actionStart, actionEnd);
  assert.match(actionBody, /window\.observer\.prepare/);
  assert.match(actionBody, /setContextPreviewRequest/);
  assert.doesNotMatch(actionBody, /window\.observer\.ask/);
  assert.match(panel, /No code or output has been sent/);
  assert.doesNotMatch(panel.slice(panel.indexOf("proactive-nudge")), /aria-modal|autoFocus/);
  assert.match(app, /event\.key !== "Escape"[\s\S]*finishProactiveNudge\("not_now"\)/);
});
