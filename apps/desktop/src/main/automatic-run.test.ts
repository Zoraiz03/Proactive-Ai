import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { AutomaticRunController, buildAutomaticRunRequest, type AutomaticRunSnapshot, type AutomaticRunPolicy } from "./automatic-run.ts";
import { AUTOMATIC_RUN_CONFIG, type AutomaticRunState } from "../shared/automatic-run.ts";
import type { ObserverAskResult, ObserverRequest } from "../shared/observer.ts";
import type { RunCompleteEvent } from "../shared/runner.ts";
import type { IpcResult } from "../shared/workspace.ts";
import { ObserverApiClient } from "./observer-client.ts";
import { RunSessionController } from "./run-session.ts";

const snapshot = (): AutomaticRunSnapshot => ({ runId: randomUUID(), relativePath: "main.py", language: "python", content: "value = 0\nprint(1 / value)\n" });
const failure = (source: AutomaticRunSnapshot): RunCompleteEvent => ({ runId: source.runId, status: "failed", exitCode: 1, durationMs: 10, diagnostics: [{ relativePath: source.relativePath, line: 2, column: 1, message: "ZeroDivisionError: division by zero", source: source.language }] });
const stderr = "Traceback (most recent call last):\n  File \"/Users/example/project/main.py\", line 2\nZeroDivisionError: division by zero";
const policy: AutomaticRunPolicy = { enabled: true, exclusions: [], maximumCharacters: 9_000 };
const answer: IpcResult<ObserverAskResult> = { ok: true, value: { provider: "demo", suggestion: { explanation: "What happened: division failed. Likely cause: zero divisor. Next step: check value before dividing.", snippet: "", reason: "Auto" } } };

function fixture() {
  let now = 100_000;
  let content = snapshot().content;
  let ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>> = async () => answer;
  let getPolicy = async () => policy;
  const calls: ObserverRequest[] = [];
  const signals: AbortSignal[] = [];
  const states: AutomaticRunState[] = [];
  const controller = new AutomaticRunController({
    now: () => now, readCurrent: async () => content,
    policy: () => getPolicy(),
    ask: async (request, signal) => { calls.push(request); signals.push(signal); return ask(request, signal); },
    publish: (state) => states.push(state),
  });
  const activity = (overrides = {}) => controller.observeActivity({ relativePath: "main.py", focused: true, dirty: false, blocked: false, ...overrides });
  const queue = (source = snapshot()) => { controller.runStarted(source); controller.runCompleted(failure(source), stderr); activity({ relativePath: source.relativePath }); return source; };
  const advance = (ms: number = AUTOMATIC_RUN_CONFIG.pauseMs) => { now += ms; activity(); };
  return { controller, calls, signals, states, queue, activity, advance, setContent: (value: string) => { content = value; }, setAsk: (value: typeof ask) => { ask = value; }, setPolicy: (value: typeof getPolicy) => { getPolicy = value; } };
}

test("disabled mode never sends; enabling does not replay an old failure", async () => {
  const f = fixture(); f.queue(); f.advance(); await f.controller.tick();
  assert.equal(f.calls.length, 0);
  f.controller.configure(true, "demo"); await f.controller.tick(); assert.equal(f.calls.length, 0);
});

test("a failed controlled run automatically explains after a pause without a click", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.queue();
  await f.controller.tick(); assert.equal(f.calls.length, 0);
  f.advance(); await f.controller.tick();
  assert.equal(f.calls.length, 1); assert.equal(f.controller.getState().status, "ready");
  assert.equal(f.calls[0].mode, "explain"); assert.equal(f.calls[0].storeHistory, false);
  assert.equal(f.calls[0].editBase, undefined); assert.equal(f.calls[0].automaticRun?.trigger, "failed_run");
  assert.match(f.controller.getState().reason!, /main.py:2/);
});

test("successful, stopped, missing-runtime and unlocated failures do not send", async () => {
  for (const override of [{ status: "succeeded", exitCode: 0 }, { status: "stopped", exitCode: null }, { exitCode: null }, { diagnostics: [] }] as Partial<RunCompleteEvent>[]) {
    const f = fixture(); f.controller.configure(true, "demo"); const s = snapshot();
    f.controller.runStarted(s); f.controller.runCompleted({ ...failure(s), ...override }, stderr); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
  }
});

test("dirty buffers, changed files and switched tabs invalidate pending explanations", async () => {
  for (const action of [(f: ReturnType<typeof fixture>) => f.activity({ dirty: true }), (f: ReturnType<typeof fixture>) => f.activity({ relativePath: "other.py" }), (f: ReturnType<typeof fixture>) => f.setContent("print('fixed')"), (f: ReturnType<typeof fixture>) => f.controller.invalidateFiles()]) {
    const f = fixture(); f.controller.configure(true, "demo"); f.queue(); action(f); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
  }
});

test("no request while backgrounded or manual Observer/dialog is busy", async () => {
  for (const options of [{ focused: false }, { blocked: true }]) {
    const f = fixture(); f.controller.configure(true, "demo"); f.queue(); f.advance(); f.activity(options); await f.controller.tick(); assert.equal(f.calls.length, 0);
    f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
  }
});

test("activity is rechecked after asynchronous privacy checks", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.queue(); f.advance();
  let release!: (value: AutomaticRunPolicy) => void;
  f.setPolicy(() => new Promise((resolve) => { release = resolve; }));
  const pending = f.controller.tick(); f.activity({ focused: false }); release(policy); await pending;
  assert.equal(f.calls.length, 0);
});

test("dismiss immediately suppresses unchanged failure even after cooldown", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.queue(); f.controller.dismiss();
  f.advance(AUTOMATIC_RUN_CONFIG.cooldownMs + 1); f.queue(); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
});

test("shown failures are deduplicated; changed code permits a new explanation", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.queue(); f.advance(); await f.controller.tick();
  f.advance(AUTOMATIC_RUN_CONFIG.cooldownMs + 1); f.queue(); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
  const changed = { ...snapshot(), content: "value = 0\nprint(2 / value)\n" }; f.setContent(changed.content);
  f.queue(changed); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 2);
});

test("cooldown and hourly cap count attempts, including errors, and survive toggles", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.setAsk(async () => ({ ok: false, error: "network" }));
  for (let i = 0; i < AUTOMATIC_RUN_CONFIG.maximumRequestsPerHour + 2; i++) {
    const s = { ...snapshot(), content: `value = 0\nprint(${i} / value)\n` }; f.setContent(s.content);
    f.controller.configure(true, "demo"); f.queue(s); f.advance(); await f.controller.tick(); f.advance(AUTOMATIC_RUN_CONFIG.cooldownMs + 1);
  }
  assert.equal(f.calls.length, AUTOMATIC_RUN_CONFIG.maximumRequestsPerHour);
  const g = fixture(); g.controller.configure(true, "demo"); g.queue(); g.advance(); await g.controller.tick();
  const s = { ...snapshot(), content: "value = 0\nprint(9 / value)\n" }; g.setContent(s.content); g.queue(s); g.advance(); await g.controller.tick(); assert.equal(g.calls.length, 1);
});

test("disable, edit, dismiss and reset abort requests and reject late responses", async () => {
  for (const invalidate of [(f: ReturnType<typeof fixture>) => f.controller.configure(false, "demo"), (f: ReturnType<typeof fixture>) => f.activity({ dirty: true }), (f: ReturnType<typeof fixture>) => f.controller.dismiss(), (f: ReturnType<typeof fixture>) => f.controller.reset()]) {
    const f = fixture(); let release!: (value: IpcResult<ObserverAskResult>) => void;
    f.setAsk(() => new Promise((resolve) => { release = resolve; })); f.controller.configure(true, "demo"); f.queue(); f.advance();
    const pending = f.controller.tick(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 1); invalidate(f); assert.equal(f.signals[0].aborted, true); release(answer); await pending;
    assert.notEqual(f.controller.getState().status, "ready"); assert.equal(f.controller.getState().explanation, undefined);
  }
});

test("disk changes during a request reject its result even without a watcher event", async () => {
  const f = fixture(); f.setAsk(async () => { f.setContent("print('changed')"); return answer; });
  f.controller.configure(true, "demo"); f.queue(); f.advance(); await f.controller.tick(); assert.notEqual(f.controller.getState().status, "ready");
});

test("errors are not automatically retried", async () => {
  const f = fixture(); f.setAsk(async () => { throw new Error("network down"); }); f.controller.configure(true, "demo"); f.queue(); f.advance(); await f.controller.tick();
  f.advance(AUTOMATIC_RUN_CONFIG.cooldownMs + 1); f.queue(); f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 1);
});

test("missing, expired, disabled and excluded context stays local", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); f.queue(); f.advance(AUTOMATIC_RUN_CONFIG.maximumAgeMs + 1); await f.controller.tick(); assert.equal(f.calls.length, 0);
  for (const p of [{ ...policy, enabled: false }, { ...policy, exclusions: ["main.py"] }, { ...policy, maximumCharacters: 10 }]) {
    const g = fixture(); g.setPolicy(async () => p); g.controller.configure(true, "demo"); g.queue(); g.advance(); await g.controller.tick(); assert.equal(g.calls.length, 0);
  }
});

test("context builder uses bounded error and correct line range, not unrelated files", () => {
  const s = { ...snapshot(), content: Array.from({ length: 100 }, (_, i) => `value${i} = ${i}`).join("\n") };
  const request = buildAutomaticRunRequest({ snapshot: s, line: 50, error: stderr }, "demo", policy)!;
  assert.ok(request); assert.equal(request.contextPackage?.items.length, 3);
  const code = request.contextPackage!.items.find((item) => item.type === "nearby_code")!;
  assert.equal(code.source.lineStart, 38); assert.equal(code.source.lineEnd, 62);
  assert.doesNotMatch(JSON.stringify(request), /\/Users\/example/);
  assert.equal(request.contextPackage?.limits.maximumRelatedFiles, 0);
});

test("secret, oversized, unsupported, generated and traversal context is refused", () => {
  for (const s of [
    { ...snapshot(), content: 'api_key = "test-super-secret-123456"\nprint(1)' },
    { ...snapshot(), content: "x".repeat(7000) + "\nprint(1)" },
    { ...snapshot(), relativePath: "main.c" },
    { ...snapshot(), relativePath: "../main.py" },
    { ...snapshot(), relativePath: "node_modules/main.py" },
  ]) assert.equal(buildAutomaticRunRequest({ snapshot: s, line: 2, error: stderr }, "demo", policy), null);
  assert.equal(buildAutomaticRunRequest({ snapshot: snapshot(), line: 2, error: 'password = "test-secret-value-123456"' }, "demo", policy), null);
});

test("potential secrets before the retained stderr tail are still detected", async () => {
  const f = fixture(); f.controller.configure(true, "demo"); const s = snapshot(); f.controller.runStarted(s);
  f.controller.runCompleted(failure(s), 'password = "test-secret-value-123456"\n' + "x".repeat(3000) + stderr);
  f.advance(); await f.controller.tick(); assert.equal(f.calls.length, 0);
});

test("Observer API cancellation reaches fetch and pre-aborted requests do not send", async () => {
  let calls = 0; let aborted = false;
  const client = new ObserverApiClient("http://localhost:3000", async () => "test-token", async (_url, init) => {
    calls++; return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("cancelled", "AbortError")); }, { once: true }));
  });
  const request = buildAutomaticRunRequest({ snapshot: snapshot(), line: 2, error: stderr }, "demo", policy)!;
  const first = new AbortController(); first.abort(); await client.ask(request, first.signal); assert.equal(calls, 0);
  const second = new AbortController(); const pending = client.ask(request, second.signal); await new Promise((resolve) => setImmediate(resolve)); second.abort(); await pending;
  assert.equal(aborted, true); assert.equal(calls, 1);
});

test("real Node runner emits main-only source evidence and a failed completion", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "proactive-auto-run-")));
  let captured: AutomaticRunSnapshot | undefined;
  let evidence: RunCompleteEvent | undefined;
  let errorText = "";
  let done!: () => void;
  const complete = new Promise<void>((resolve) => { done = resolve; });
  const runner = new RunSessionController({ output: () => undefined, complete: () => done(), startedEvidence: (_id, value) => { captured = value; }, completedEvidence: (_id, event, error) => { evidence = event; errorText = error; } });
  try {
    await writeFile(join(directory, "fail.js"), 'throw new Error("test failure");\n');
    runner.setWorkspace(directory, 1);
    const result = await runner.start(1, { runId: randomUUID(), relativePath: "fail.js" }); assert.equal(result.ok, true);
    await complete;
    assert.equal(captured?.relativePath, "fail.js"); assert.match(captured!.content, /test failure/);
    assert.equal(evidence?.status, "failed"); assert.match(errorText, /test failure/);
    assert.equal(evidence?.diagnostics[0].relativePath, "fail.js");
  } finally { runner.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("real Python failure has a usable source location", async (t) => {
  const python = process.platform === "win32" ? "python" : "python3";
  if (spawnSync(python, ["--version"]).status !== 0) { t.skip("Python runtime is not installed on this test host"); return; }
  const directory = await realpath(await mkdtemp(join(tmpdir(), "proactive-auto-python-")));
  let evidence: RunCompleteEvent | undefined;
  let done!: () => void;
  const complete = new Promise<void>((resolve) => { done = resolve; });
  const runner = new RunSessionController({ output: () => undefined, complete: () => done(), completedEvidence: (_id, event) => { evidence = event; } });
  try {
    await writeFile(join(directory, "fail.py"), "divisor = 0\nprint(10 / divisor)\n");
    runner.setWorkspace(directory, 1);
    const started = await runner.start(1, { runId: randomUUID(), relativePath: "fail.py" }); assert.equal(started.ok, true);
    await complete;
    assert.equal(evidence?.status, "failed");
    assert.equal(evidence?.diagnostics[0].relativePath, "fail.py");
    assert.equal(evidence?.diagnostics[0].line, 2);
  } finally { runner.dispose(); await rm(directory, { recursive: true, force: true }); }
});
