# Interactive Run Terminal Design

Date: 2026-10-04  
Status: Awaiting design review

## Problem

Run Current File launches Python and JavaScript through the controlled runner, but its standard input is not connected to the renderer. Programs that call `input()`, read from `stdin`, or otherwise expect keyboard input wait indefinitely while their prompt appears in the read-only Output view.

The desktop IDE already has an interactive workspace terminal. A file run must gain the same input/output experience without injecting commands into that shell, destroying its history, or weakening the runner's path, privacy, evidence, and verification controls.

## Goals

- Clicking Run opens a dedicated `Run: <filename>` terminal view.
- Program prompts, user input, stdout, and stderr appear in that view in their original order.
- Input typed in the run terminal reaches only the active file process.
- The existing workspace terminal remains alive and unchanged.
- Stop terminates only the active file process.
- The completed run buffer remains visible until the next run.
- Output continues to hold the structured summary, diagnostics, and evidence actions used by Observer.
- Existing file authorization, save-before-run, source hashing, diagnostics, failure detection, and automatic explanation behavior remain intact.

## Non-goals

- The run terminal is not a general-purpose shell and does not show a shell prompt after completion.
- It does not support multiple simultaneous file runs.
- It does not add TypeScript execution or new language runtimes.
- It does not send arbitrary shell commands from the renderer.
- It does not merge the workspace terminal and run terminal buffers.

## User Experience

The bottom panel gains a dynamic third top-level tab between Terminal and Output:

1. `Terminal` continues to represent the existing workspace shell.
2. `Run: hello.py` appears after a supported file is started.
3. `Output` continues to show the structured run result and IDE messages.

When the user selects Run:

1. Existing validation and save-before-run behavior completes.
2. The bottom panel switches to `Run: <filename>`.
3. The run terminal clears the previous run buffer and displays the new process output.
4. The terminal receives focus so the user can immediately answer prompts.
5. While the process is running, typed data is forwarded to that run only.
6. On completion, the terminal prints a subdued exit summary and leaves the buffer selectable.

The editor's Run button becomes Stop while the process is active. Stop terminates the run process and leaves the workspace shell untouched. Starting another file run reuses the single run terminal and clears its old contents.

The run terminal action area offers `Add Selected Run to Context`. It uses only explicit selected text. Existing Run Failure and diagnostic evidence actions remain in Output.

## Architecture

### Shared runner contract

Extend the existing runner contract rather than creating a shell-command channel:

- Add a bounded `RunInputRequest` containing `runId` and non-empty input data.
- Add a bounded `RunResizeRequest` containing `runId`, columns, and rows for the interactive process.
- Add `input` and `resize` IPC channels and bridge methods.
- Keep start, stop, output, and complete event identities unchanged.

The main process remains authoritative for the active run ID. Input, resize, and stop requests for stale or foreign IDs fail closed.

### Main-process run session

Normal manual runs use a dedicated pseudo-terminal process created with the existing `node-pty` dependency. The executable and argument list still come only from the authorized file extension and resolved workspace path; no renderer-provided command and no shell interpolation are allowed.

The run session:

- validates the workspace-relative file path;
- reads and hashes the source before launch;
- spawns Python or Node directly in the workspace directory;
- streams bounded terminal data to the renderer;
- accepts bounded keyboard input and terminal resize requests;
- captures a bounded combined stream for diagnostics and Observer failure evidence;
- rereads the file after exit to calculate `sourceUnchanged`;
- emits the existing structured completion event.

Runs that require the guarded Fix Code verification hash keep the existing guarded child-process path. They appear in the same run tab and accept standard input through the child process pipe, but terminal resize requests have no effect on that guarded process. Its hash-verification guarantees take priority over raw pseudo-terminal behavior.

### Renderer run terminal

`BottomPanel` owns a second xterm instance dedicated to runs. It does not share state, selection, input routing, or resize events with the workspace xterm.

- Runner output events matching the displayed run ID are written to the run xterm.
- xterm input is sent through `runner.input` only while that run is active.
- resize events use `runner.resize` only for the active run ID.
- completion disables further input but preserves scrollback and selection.
- a new run resets only the run xterm and selects its tab.
- workspace-terminal events continue to target only the workspace xterm.

`App` continues to build `RunOutputState` for structured summaries, diagnostics, Context actions, proactive detection, and Fix Code verification. Starting or completing a normal run no longer forces the Output tab to the foreground.

## Data Flow

1. Editor Run invokes the existing `runCurrentFile` flow.
2. Renderer validates the active tab, handles unsaved content, and sends `runner.start`.
3. Main resolves and authorizes the file, hashes it, and spawns the dedicated process.
4. Main emits ordered terminal chunks tagged with the run ID.
5. `BottomPanel` writes matching chunks to the run xterm; `App` retains bounded evidence.
6. xterm keyboard data returns through `runner.input(runId, data)`.
7. Main writes the data to the active process only.
8. Exit produces the existing completion event; diagnostics and Observer flows consume the captured failure evidence.

## Error Handling

- Missing runtimes produce a readable run-terminal message and the existing Output error.
- Input after completion is rejected without affecting the workspace terminal.
- Renderer or workspace teardown kills the active run and workspace shell independently.
- Oversized input, invalid dimensions, unknown run IDs, unsafe paths, and unsupported extensions fail closed.
- If pseudo-terminal startup fails, the run returns the current actionable runtime error and never falls back to shell command injection.
- Stop remains idempotent from the UI perspective; late output or completion from an obsolete run ID is ignored.

## Security and Privacy

- The renderer never provides an executable, absolute path, shell string, environment, or working directory.
- The main process resolves the authorized workspace path and chooses the runtime.
- No shell is used for file execution.
- Existing secret filtering, environment sanitization, source hashing, bounded capture, and trusted-sender checks remain in force.
- Terminal input is session-local and is not stored in Observer history or automatically added to Context.
- Only explicit selection can add run-terminal text to Context.

## Testing

### Main-process tests

- A real Python program prompts, receives input, and prints the result.
- A real JavaScript program reads stdin and prints the result.
- Input for a stale or incorrect run ID is rejected.
- Oversized input and invalid resize requests are rejected.
- Stop terminates the run without closing the workspace terminal.
- Combined failure output still produces diagnostics and automatic-run evidence.
- Workspace replacement and renderer cleanup terminate the run safely.

### Electron UI tests

- Run creates and selects `Run: <filename>`.
- Typing in the run xterm calls only the runner input bridge.
- Typing in the workspace xterm calls only the terminal bridge.
- Program output is visible in the run xterm and remains after exit.
- Stop and exit status are readable.
- Starting a second run clears and reuses the run terminal.
- Output still exposes structured diagnostics, Run Failure, and Context actions.

### Regression verification

- Full desktop unit suite.
- Electron live UI suite.
- TypeScript typecheck and production Electron build.
- Manual smoke test using the factorial program shown in the reported issue.

## Acceptance Criteria

- The factorial example prompts in `Run: hello.py`, accepts a number, and displays the factorial without using Output for keyboard input.
- The workspace terminal remains available with its prior buffer before and after the run.
- Stop affects only the running file.
- Output and Observer still receive an accurate completion status and diagnostics.
- All new and existing automated checks pass.
