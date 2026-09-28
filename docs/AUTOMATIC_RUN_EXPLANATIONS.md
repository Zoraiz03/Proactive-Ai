# Experiment A1 — Automatic failed-run explanations

## Status (2026-09-04)

Implemented and automated checks pass. Interactive desktop/provider acceptance
and student usefulness evaluation remain pending. This is not release approval.
Existing uncommitted UI work was preserved; no Git commit was created.

## Product decision

An explicit, session-only **Auto-explain failed runs** switch lives in Observer.
This is a narrow exception to the earlier no-automatic-request policy, authorized
for this experiment. Manual Ask Observer retains its context preview and review
workflow. Existing Assist diagnostic/test/build nudges stay local and click-gated;
their failed-run nudge is suppressed while Auto-explain is enabled.

The pause schedules a response; it does not imply the user is stuck. No cursor
thrashing, repeated typing, global keystrokes, attention inference, or monitoring
outside the active IDE is introduced. Nothing modifies files or runs a command
automatically.

## Runtime sequence

1. User opens a local project, selects an Observer provider, and turns the switch on.
2. A native confirmation explains automatic transmission, provider costs, limits,
   session lifetime, and the possibility of including a complete short file.
3. An IDE-controlled Python/JavaScript run starts; main retains its source snapshot.
4. A nonzero exit with a diagnostic in that same file becomes a candidate.
5. After a two-second quiet period, main checks current activity, source freshness,
   authentication, synced privacy preferences, local exclusions, and request limits.
6. The existing authenticated `/api/suggest` endpoint receives a specifically
   marked explanation-only request. No separate per-request preview is required.
7. Observer displays a brief What happened / Likely cause / Next step explanation
   and an evidence-derived reason. The user can dismiss immediately or press Escape.

## Boundaries

- Python `.py` and Node JavaScript `.js`/`.mjs` only; no C, C++, Java, terminal
  command monitoring, tests/builds, documentation, or speculative suggestions.
- Defaults in `apps/desktop/src/shared/automatic-run.ts`: 2-second pause,
  60-second cooldown, 6 attempts per hour, 2-minute evidence expiry, 12 lines on
  either side of the error line, 6,000 code characters, 2,000 stderr characters.
- The code excerpt can equal the whole file when the file is short. This is
  disclosed at opt-in and represented accurately in context metadata.
- No project crawling, related files, rules, browser research, Context Tray,
  stdout, or raw keystrokes are sent. Absolute paths in stderr are masked.
- Only bounded source context and stderr are sent; secret detection is heuristic,
  not a guarantee. Suspected secrets and oversized/excluded context fail closed.
- `storeHistory: false` is enforced by the backend for automatic requests. This
  avoids suggestion DB persistence, but does not control an external provider's
  retention policy. No automatic feedback dataset is collected in this version.
- Mode/provider consent is in memory, not persisted: reload, sign-out, project
  replacement, and window closure disable it. Selecting a different provider
  requires turning the switch off and on again; the active provider is shown.
- Identical failures for unchanged code are suppressed. Request caps count failed
  attempts and survive toggles/project changes in the same main process.
- Source edits, file switches, project changes, new runs, and dismiss/disable
  invalidate pending work. Edits during a request abort the client fetch and reject
  late results. Already-transmitted provider requests cannot be recalled.
- Successful/stopped runs, missing-runtime failures without a source diagnostic,
  stale failures, and insufficient context do not initiate AI requests.
- Manual requests/dialogs and background windows block automatic dispatch.
- Failed AI requests do not retry automatically. Use manual Ask Observer if needed.

## Verification performed

- 183/183 desktop tests passed, including 19 new automatic-run tests.
- Real Node and Python subprocesses: failure output and source locations verified.
- Backend harness: actual route compiled with dependency doubles; authentication,
  valid requests, invalid triggers/modes/history/context, prompt intent, and
  truthful demo output checked without network/provider/database calls.
- Existing root test harnesses and ESLint passed.
- Desktop TypeScript and production build passed; Next.js production build passed.
- `git diff --check` passed.
- First run of existing browser-bridge tests was blocked by localhost permissions;
  all passed after network permission was granted. No source workaround was used.
- Interactive launch was attempted: Electron exited with SIGABRT in this tool
  environment; opening Electron through the UI showed its default app, not the
  IDE. No live IDE or provider UI acceptance is claimed.
- No real LLM call, production database mutation, Windows QA, signing or packaging
  was performed. No accuracy or student-benefit claims have been established.

## How to try it safely

1. Restart the Next.js backend and the Electron application so both use this code.
2. Open `apps/desktop/fixtures/automatic-run` as a project. These examples are
   intentionally broken and contain no private data.
3. Select your configured provider in Observer. Demo exercises the request path
   but explicitly does not diagnose code; it still requires the existing backend.
4. Enable Auto-explain and read/accept its native confirmation yourself.
5. Open `undefined_name.js` or `divide_by_zero.py`, run it, and leave it unchanged
   for a short pause. A configured backend, valid sign-in, and installed runtime
   are required. Allow diagnostic and terminal-error context in Privacy settings.
6. Verify one short explanation appears without Ask Observer or a context preview.
7. Dismiss and rerun unchanged code: no repeat request should be made.
8. Run `success.js`: no explanation. Edit while a request is pending: no stale card.
9. Disable, switch projects, or reload: verify automatic mode is off.
10. Record explanation correctness, usefulness, delay, and annoyance manually.

## Next acceptance gate

Finish the interactive checks on macOS and Windows. Then compare this feature
with raw errors and manual Ask Observer using student tasks. Improve context and
timing from observed failures before broadening triggers. Keep this experiment
separate from the remaining Phase 14 usability/release-readiness work.



