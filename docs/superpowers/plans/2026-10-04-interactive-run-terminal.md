# Interactive Run Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Run Current File behave like VS Code by opening a dedicated, interactive `Run: <filename>` terminal where Python and JavaScript programs can read stdin and display output, without changing or commandeering the existing workspace shell.

**Architecture:** Extend the typed Runner IPC contract with bounded input and resize requests, then place a small process adapter behind `RunSessionController`. Ordinary manual runs use a main-process `node-pty` adapter; guarded Observer verification continues to use the existing child-process adapter so source-hash verification remains intact. The renderer owns a second xterm instance for the run session, while the existing workspace xterm and structured Output view remain independent consumers.

**Tech Stack:** Electron 43, TypeScript 7, React 18, `node-pty` 1.1, xterm 6, Node test runner, existing Playwright-based Electron UI fixture.

**Spec:** [2026-10-04-interactive-run-terminal-design.md](../specs/2026-10-04-interactive-run-terminal-design.md)

## Global Constraints

- Preserve every existing workspace-terminal behavior and IPC channel.
- Never accept an executable, absolute path, shell command, working directory, or environment from the renderer.
- Use `shell: false` for guarded child processes and direct executable/argument calls for PTY processes.
- Keep one controlled run at a time. Do not add TypeScript or additional runtime support.
- Bound each renderer input request to 64 KiB and terminal dimensions to 2–500 columns and rows.
- Preserve captured output, structured diagnostics, automatic-run evidence, and Observer failure explanations.
- Keep the completed run buffer visible until another run starts or the workspace changes.
- Run focused tests after each red/green step and the full desktop suite before completion.

## Review Focus

- Input arriving after exit or with a stale run ID must be rejected and must never reach the workspace terminal.
- Pasted input larger than 64 KiB and invalid terminal dimensions must be rejected in the main process.
- Starting, typing in, stopping, and completing a file run must not change the workspace shell session, buffer, or input route.
- Late output or exit callbacks from an older PTY must not corrupt a newer run.
- A failed PTY run whose error appears only in the combined PTY stream must still populate Output diagnostics and automatic Observer evidence.

---

## Task 1: Add a bounded interactive Runner contract

**Files:**

- Modify: `apps/desktop/src/shared/runner.ts`
- Modify: `apps/desktop/src/main/run-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/run-session.ts`
- Create: `apps/desktop/src/main/interactive-run.test.ts`
- Modify: `apps/desktop/package.json`

### Step 1: Register the focused test file before implementation

- [ ] Add `src/main/interactive-run.test.ts` immediately after the existing `src/main/automatic-run.test.ts` entry in the desktop `test` script, leaving every other listed test in its current order.

### Step 2: Write failing controller validation tests

- [ ] Create `interactive-run.test.ts` with a fake managed process and a temporary workspace containing `prompt.py`.
- [ ] Add these tests before production changes:

```ts
test("writes input only to the matching active run", async () => {
  const process = new FakeManagedRunProcess();
  const controller = controllerFor(process);
  controller.setWorkspace(rootPath, 7);
  await controller.start(7, { runId: RUN_ID, relativePath: "prompt.py" });

  assert.deepEqual(controller.input(7, { runId: RUN_ID, data: "42\r" }), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(process.writes, ["42\r"]);
});

test("rejects stale input without writing to any process", async () => {
  // Assert a different runId is rejected while active.
  // Emit exit, then assert the former runId is rejected.
  // In both cases process.writes remains empty.
});

test("rejects oversized input and invalid resize dimensions", async () => {
  // 65 * 1024 characters fails.
  // cols 1, rows 24 fails.
  // cols 80, rows 501 fails.
  // No write or resize reaches the fake process.
});

test("resizes only the matching active run", async () => {
  // A valid { cols: 100, rows: 30 } reaches the fake exactly once.
});
```

The fake exposes `writes`, `resizes`, `killed`, and explicit `emitOutput` / `emitExit` helpers. It does not spawn a runtime.

### Step 3: Run the focused test and confirm red

- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop test -- --test-name-pattern="input|resize"
```

Expected: compilation or assertions fail because input/resize do not exist.

### Step 4: Extend the shared Runner API

- [ ] In `shared/runner.ts`, add:

```ts
export const RUNNER_CHANNELS = {
  start: "runner:start",
  stop: "runner:stop",
  input: "runner:input",
  resize: "runner:resize",
  output: "runner:output",
  complete: "runner:complete",
} as const;

export interface RunInputRequest {
  runId: string;
  data: string;
}

export interface RunResizeRequest {
  runId: string;
  cols: number;
  rows: number;
}

export interface RunnerBridge {
  start: (request: RunStartRequest) => Promise<IpcResult<RunStarted>>;
  stop: (request: RunStopRequest) => Promise<IpcResult<void>>;
  input: (request: RunInputRequest) => Promise<IpcResult<void>>;
  resize: (request: RunResizeRequest) => Promise<IpcResult<void>>;
  onOutput: (listener: (event: RunOutputEvent) => void) => () => void;
  onComplete: (listener: (event: RunCompleteEvent) => void) => () => void;
}
```

### Step 5: Add main-process validation and routing

- [ ] Add these bounds in `run-session.ts`:

```ts
const MAX_INPUT_CHUNK = 64 * 1024;
const MIN_TERMINAL_DIMENSION = 2;
const MAX_TERMINAL_DIMENSION = 500;
```

- [ ] Add `input(webContentsId, request)` and `resize(webContentsId, request)`.
- [ ] Validate object shape, active renderer ID, and exact active run ID before touching the process.
- [ ] Treat an empty string as a successful no-op because xterm composition can emit it; lock this with a test.
- [ ] Catch adapter failures and return public errors without local paths:

```text
The run input request was rejected.
The run resize request was rejected.
The running file is no longer available.
Input could not be sent to the running file.
The running file terminal could not be resized.
```

### Step 6: Wire IPC and preload

- [ ] Register `RUNNER_CHANNELS.input` and `RUNNER_CHANNELS.resize` in `run-ipc.ts`, forwarding `event.sender.id` and the untrusted request.
- [ ] Remove both handlers in the disposer.
- [ ] Expose `runner.input` and `runner.resize` in preload with `ipcRenderer.invoke`.
- [ ] Do not expose a generic process writer, executable, path, environment, or shell-string API.

### Step 7: Run tests and type checking

- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop test -- --test-name-pattern="input|resize"
npm --workspace @proactive-ai/desktop run typecheck
```

Expected: focused tests and both desktop TypeScript projects pass.

### Step 8: Commit the contract

- [ ] Commit only Task 1 files:

```bash
git add apps/desktop/src/shared/runner.ts apps/desktop/src/main/run-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/run-session.ts apps/desktop/src/main/interactive-run.test.ts apps/desktop/package.json
git commit -m "feat(runner): add interactive input contract"
```

---

## Task 2: Execute ordinary runs in a dedicated PTY

**Files:**

- Create: `apps/desktop/src/main/run-process.ts`
- Modify: `apps/desktop/src/main/run-session.ts`
- Modify: `apps/desktop/src/main/run-ipc.ts`
- Modify: `apps/desktop/src/main/interactive-run.test.ts`
- Modify: `apps/desktop/src/main/automatic-run.test.ts`

### Step 1: Write failing process-selection and lifecycle tests

- [ ] Extend `interactive-run.test.ts` with dependency-injected factories and:

```ts
test("ordinary runs use the interactive process and guarded runs use the verified process", async () => {
  // No expectedContentHash calls only interactiveFactory.
  // A valid expectedContentHash calls only guardedFactory.
});

test("forwards combined PTY output and captures it for failure evidence", async () => {
  // Emit "Traceback: prompt.py line 1 raised ValueError", then exit 1.
  // Assert output, failed completion, diagnostics, and completedEvidence.
});

test("ignores late output and exit from a superseded process", async () => {
  // Complete A, start B, invoke A callbacks again, and assert B is unchanged.
});

test("stop kills only the active run and reports stopped once", async () => {
  // Stop, emit exit, and assert one stopped completion.
});
```

- [ ] Add an `automatic-run.test.ts` regression where failure exists only on a combined interactive stream and automatic evidence gets non-empty error text.

### Step 2: Run the new tests and confirm red

- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop test -- --test-name-pattern="ordinary runs|combined PTY|superseded|kills only|interactive process"
```

Expected: failures because the controller still spawns a piped child.

### Step 3: Introduce a narrow managed-process abstraction

- [ ] Create `run-process.ts` with no Electron imports:

```ts
export type ManagedRunStream = "stdout" | "stderr";

export interface ManagedRunProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onOutput(listener: (stream: ManagedRunStream, data: string) => void): () => void;
  onExit(listener: (exitCode: number | null) => void): () => void;
  verifiedHash(): string;
}

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type RunProcessFactory = (options: RunProcessOptions) => ManagedRunProcess;
```

- [ ] Export `createInteractiveRunProcess` backed by `node-pty.spawn` with 80×24 initial dimensions, `xterm-256color`, direct command/args, combined output mapped to `stdout`, and an empty verified hash.
- [ ] Export `createGuardedRunProcess` backed by current `spawn` behavior with `shell: false`, four pipes, separated stdout/stderr, fd 3 hash collection, stdin writes, and a safe no-op resize.
- [ ] Ensure both adapters unsubscribe and cannot emit completion twice.

### Step 4: Inject factories and preserve evidence

- [ ] Add production-default dependencies:

```ts
interface RunSessionDependencies {
  createInteractiveProcess: RunProcessFactory;
  createGuardedProcess: RunProcessFactory;
}

constructor(sink: RunSink, dependencies: RunSessionDependencies = productionRunProcesses)
```

- [ ] Change `ActiveRun` to hold `ManagedRunProcess`, `stdout`, `stderr`, `combinedOutput`, `stopped`, and `completed`.
- [ ] Choose guarded only when `expectedContentHash` exists; otherwise choose interactive.
- [ ] Pass only main-selected command, args, authorized root, and sanitized main-created environment.
- [ ] Capture each chunk in `combinedOutput` and its named stream.
- [ ] For interactive failures, parse diagnostics from `stderr || combinedOutput` and pass the same fallback to `completedEvidence`.
- [ ] Guard output and finish by active object identity plus `completed`.

### Step 5: Add real runtime integration tests

- [ ] Add a Python test, skipped only if `python3 --version` is unavailable, with:

```py
value = input("Enter a number: ")
print(f"You entered {value}")
```

- [ ] Wait for the prompt, send `"7\r"` through controller input, and assert `You entered 7` plus success.
- [ ] Add a Node test that registers `process.stdin.once("data", (data) => process.stdout.write(`You entered ${data.toString().trim()}\n`))` and asserts the echoed value.
- [ ] Bound async waits and dispose controllers in `finally`.

### Step 6: Verify and commit

- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop test -- --test-name-pattern="interactive|PTY|guarded|superseded|input"
npm --workspace @proactive-ai/desktop run typecheck
```

- [ ] Commit only Task 2 files:

```bash
git add apps/desktop/src/main/run-process.ts apps/desktop/src/main/run-session.ts apps/desktop/src/main/run-ipc.ts apps/desktop/src/main/interactive-run.test.ts apps/desktop/src/main/automatic-run.test.ts
git commit -m "feat(runner): execute manual runs in a pseudo-terminal"
```

---

## Task 3: Add the dedicated Run terminal UI

**Files:**

- Modify: `apps/desktop/src/renderer/src/BottomPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/scripts/live-observer-ui.tsx`
- Modify: `apps/desktop/scripts/live-observer-ui.mjs`
- Modify: `apps/desktop/package.json`

### Step 1: Add failing Electron fixture assertions

- [ ] Extend the fixture's fake `window.runner` with `input`, `resize`, output/complete listeners, call recording, and event emitters.
- [ ] Add a `--run-terminal` scenario that proves:
  1. initial tabs are Terminal and Output;
  2. starting `hello.py` inserts and activates `Run: hello.py` between them;
  3. emitted prompt/output appears in run xterm;
  4. typing sends runner input and never workspace-terminal input;
  5. run-host resizing sends runner resize with the active ID;
  6. completion preserves text and disables input;
  7. workspace terminal ID/buffer remain unchanged;
  8. a second run resets buffer and label;
  9. selected run text reports source `run`.

### Step 2: Confirm the fixture is red

- [ ] Add:

```json
"test:run-ui": "node scripts/live-observer-ui.mjs --run-terminal"
```

- [ ] Run `npm --workspace @proactive-ai/desktop run test:run-ui`.

Expected: failure because no run tab/xterm exists.

### Step 3: Create an independent run xterm

- [ ] Change view state to:

```ts
type BottomPanelView = "terminal" | "run" | "output";
```

- [ ] Add separate run host, terminal, fit-addon, active-run-ID, and displayed-run-ID refs. Never reuse workspace-terminal refs.
- [ ] Extract shared visual options into `terminalOptions()`; share styling only, not state.
- [ ] Mount run xterm once. Its `onData` calls Runner input only when the latest exact run ID is still `running`.
- [ ] Its fit handler sends Runner resize only for that same active run.
- [ ] Filter Runner output/complete events by exact run ID.
- [ ] On a new running ID: reset, write a muted running banner, select Run, fit, and focus.
- [ ] On completion: preserve buffer, append one concise footer, disable input, retain displayed ID and label.
- [ ] On workspace change: reset both terminals and clear run-tab state.

### Step 4: Render tabs and context action

- [ ] Render `Terminal | Run: hello.py | Output` in that order.
- [ ] Show Run only after a run starts in the current workspace.
- [ ] Use basename in text and full relative path in title/accessible label.
- [ ] Show `Add Selected Run to Context` in Run while preserving existing Terminal/Output actions.
- [ ] Extend the callback to:

```ts
onAddSelectedOutput: (content: string, source: "terminal" | "run" | "output") => void;
```

- [ ] Accept selections only from the active view's host.

### Step 5: Stop forcing runs into Output

- [ ] Remove `setOutputFocusToken` from successful run start and normal completion in `App.tsx`.
- [ ] Keep structured state accumulation and Observer behavior unchanged.
- [ ] Keep Output focus for validation/start errors when no run terminal exists.
- [ ] Extend `addSelectedOutputContext` to create `Selected run text`.

### Step 6: Style and verify

- [ ] Share terminal host dimensions/background with the run host.
- [ ] Add a subtle running/completed tab marker using existing tokens.
- [ ] Truncate narrow labels and preserve focus rings.
- [ ] Do not change bottom height, pane resize, or Output typography.
- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop run test:run-ui
npm --workspace @proactive-ai/desktop run typecheck
npm --workspace @proactive-ai/desktop run build
```

- [ ] Commit:

```bash
git add apps/desktop/src/renderer/src/BottomPanel.tsx apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/styles.css apps/desktop/scripts/live-observer-ui.tsx apps/desktop/scripts/live-observer-ui.mjs apps/desktop/package.json
git commit -m "feat(desktop): add dedicated run terminal"
```

---

## Task 4: End-to-end hardening and regression verification

**Files:**

- Modify if a regression fails: `apps/desktop/src/main/interactive-run.test.ts`
- Modify if a regression fails: `apps/desktop/src/main/automatic-run.test.ts`
- Modify if a regression fails: `apps/desktop/scripts/live-observer-ui.tsx`
- Modify if a regression fails: `apps/desktop/scripts/live-observer-ui.mjs`
- Modify only for intentional divergence: `docs/superpowers/specs/2026-10-04-interactive-run-terminal-design.md`

### Step 1: Lock every Review Focus item with a named test

- [ ] Ensure these exact behaviors each have a dedicated test:

```text
rejects stale input after run exit
rejects input larger than 64 KiB
rejects terminal dimensions outside 2..500
preserves workspace terminal while an interactive run starts and stops
ignores late PTY callbacks after a newer run starts
uses combined PTY output for diagnostics and automatic evidence
```

### Step 2: Run all automated verification

- [ ] Run:

```bash
npm --workspace @proactive-ai/desktop test
npm --workspace @proactive-ai/desktop run test:run-ui
npm --workspace @proactive-ai/desktop run test:live-ui
npm --workspace @proactive-ai/desktop run typecheck
npm --workspace @proactive-ai/desktop run build
```

Expected: every command exits 0. Fix failures at source and rerun the failed command plus its neighboring suite.

### Step 3: Perform a desktop smoke test

- [ ] Start the app normally and open a workspace shell.
- [ ] Run `printf 'shell-alive\n'` in the shell and leave its buffer visible.
- [ ] Run this Python file through the editor:

```py
def factorial(n):
    result = 1
    for value in range(1, n + 1):
        result *= value
    return result

number = int(input("Enter a number: "))
print("Factorial is:", factorial(number))
```

- [ ] Enter `5` in `Run: <filename>` and confirm `Factorial is: 120`.
- [ ] Confirm the original shell still shows `shell-alive` and accepts commands.
- [ ] Run a failing file and confirm traceback in Run, structured failure/diagnostic in Output, and usable Failed Runs/Observer evidence.
- [ ] Stop a long-running program and confirm only Run stops.
- [ ] Select run output, add it to Context, and confirm `Selected run text`.

### Step 4: Security and hygiene checks

- [ ] Run:

```bash
git diff --check
git diff -- apps/desktop/src/shared/runner.ts apps/desktop/src/main/run-process.ts apps/desktop/src/main/run-session.ts apps/desktop/src/main/run-ipc.ts apps/desktop/src/preload/index.ts
rg -n "shell:\s*true|exec\(|execSync\(|absolutePath|command:" apps/desktop/src/renderer apps/desktop/src/preload
git status --short
git diff --cached --stat
```

Expected: clean whitespace; no renderer/preload executable, shell-string, or absolute-path authority; no unrelated staged files.

### Step 5: Reconcile documentation and commit only real changes

- [ ] Compare final behavior to the approved spec. Document any necessary intentional difference and its reason; do not silently diverge.
- [ ] If Task 4 changed files, stage their exact paths and commit:

```bash
git commit -m "test(desktop): harden interactive run terminal"
```

- [ ] Do not create an empty commit.

### Step 6: Final handoff

- [ ] Report the dedicated run behavior, commands and exit statuses, manual Python result, workspace-shell isolation result, and the intentional limitation that guarded Observer verification remains non-PTY.
