# Desktop IDE Roadmap

This document is the living implementation plan for adding an Electron desktop
IDE to Proactive AI Workspace without replacing or breaking the existing Next.js
web application.

The product vision and scope for this pivot are defined in
[`PRODUCT_DIRECTION.md`](./PRODUCT_DIRECTION.md). Future implementation phases
follow that desktop product direction while preserving the existing browser
application as the backend/API, Supabase account and data layer, provider-key
management system, and web prototype.

Update this document before and after every desktop-IDE task. A task may be
marked **Complete** only after all checks listed for that task pass. Record the
implementation and its verification evidence in the changelog.

## Status legend

- **Not Started** — no implementation work has begun.
- **In Progress** — implementation or required verification is underway.
- **Complete** — implementation is finished and every required check has passed.

## Current status

| Phase | Status | Goal |
|---|---|---|
| Phase 1 | Complete | Secure Electron application shell |
| Phase 2 | Complete | Local projects, file explorer, Monaco editing, and saving |
| Phase 3 | In Progress | Complete file explorer and editor workflow |
| Phase 4 | In Progress | Terminal, task output, and diagnostics |
| Phase 5 | Complete | Authenticated manual Observer AI integration |
| Phase 6 | Complete | Markdown documentation editing, safe preview, navigation, and manual Observer help |
| Phase 7A | Complete | Secure global project search |
| Phase 7B | Complete | Recent projects and secure workspace reopening |
| Phase 7C | Complete | Typed command palette and keyboard-first navigation |
| Phase 7D | Complete | Settings and Privacy Center |
| Phase 7E | Complete | Read-only Git status and diff viewer |
| Phase 8 | Complete | Deterministic, explainable, privacy-safe project context engine |
| Phase 9A | Complete | Safe single-file AI changes with diff review and local rollback |
| Phase 9B | Complete | Safe, explicit multi-file AI change sets with transactional rollback |
| Phase 10 | Complete | Proactive Observer V1 and privacy-safe local evaluation tools |
| Phase 11A | Complete | Privacy-safe Observer Context Tray |
| Phase 11B1 | Complete | Explicit Chrome selected-text capture and local preview |
| Phase 11B2 | Verification In Progress | Secure Chrome pairing, incoming review, and local Context Tray handoff |
| Phase 12A | Complete | Local code-to-documentation relationship detection |
| Phase 12B | Complete | Safe, evidence-based Markdown update suggestions with explicit review and rollback |
| Phase 13A | Complete | Read-only website visual audit and centralized desktop design-system plan |
| Phase 13B | Complete | Source-exact coffee-and-cream desktop foundation and complete visible shell migration |
| Phase 13C1 | Complete | Observer and Context Tray visual refinement with preserved privacy and action flows |
| Phase 13D | Complete | Final desktop UI polish, responsive containment, accessibility, and verification |
| Experiment A1 | In Progress | Automatic failed-run explanations implemented; 183 desktop tests and backend/build checks pass; interactive/provider acceptance pending |

## Observer-Intervener Engine

The [implementation spec](./OBSERVER_ENGINE_SPEC.md) is being followed one phase
at a time. Phase 0 began on 2026-10-02 as a documentation-only audit; no engine
runtime work is authorized in this task. Existing phase statuses above retain
their original meaning.

| Phase | Status | Goal |
|---|---|---|
| Phase 0 (P0-T1–T3) | In Progress | Documentation delivered; desktop baseline gate fails on Python availability and Windows symlink permissions |
| Phase E1 | In Progress | E1a and E1b implementation complete; Electron runtime and packaged-launch acceptance pending |
| Phase E1b (P1-T4, P1-T5) | In Progress | Chunks/symbols, validated memory IPC, typed preload and read-only Privacy MemoryPanel implemented; typecheck passed; desktop tests 312 passed, 0 failed, 1 existing skip; native/runtime verification pending |
| Phase E2 (P2-T1 through P2-T5) | Implementation complete; runtime acceptance pending | Validated delta replay, Monaco capture with origin/flush rules, private transactional journals and 20-file LRU, save drift recovery, external-change rebaselines, compaction and retention implemented |
| Phase E3 (P3-T1 through P3-T5) | In Progress | A-J context builders, bounded retrieval, edit bursts, feedback memory and local manifest preview; E4 remains out of scope |
| Phase E4 | Not Started | Independent switches, engine governance, backend and outcomes; optional real streaming |
| Phase E5 | Not Started | Opt-in Chrome page context v2 and bridge integration |
| Phase E6 | Not Started | New-project wizard, brief, plan and phase-aware help |
| Phase E7 | Not Started | History, local evaluation, accessibility, documentation and release checks |
| Phase E8 | Not Started | Unspecified: §14 requests E1–E8 rows but defines tasks only through E7; owner clarification required before scoping E8 |

E2 validation (2026-10-03): desktop typecheck passed; `npm test`: 327 tests, 326 passed, 0 failed, 1 existing skip (baseline: 312 passed). Tests cover randomized replay, capture batches, trusted IPC, privacy purges, unsaved/reopen/save drift, watcher changes, LRU eviction, emoji paste boundaries, compaction, retention and purge recovery. Root backend and root lockfiles unchanged; root build not required.
E2 wiring and limitations: typed `memory:buffer` bootstraps a validated unsaved snapshot before fire-and-forget `memory:edits`; existing LiveEdit behavior remains. Journal compaction runs after 30 seconds idle and on close, with daily expiry and journal/web-first size eviction. Consent now explicitly describes unsaved capture. Electron native rebuild, interactive Monaco/save/close acceptance and packaged launch remain unverified: Visual Studio C++ Build Tools are missing. Node SQLite tests passed; E3 was not started.

E1a verification: desktop typecheck passed; 305 tests = 300 passed, four known Python/symlink environment failures, one existing skip; all 17 new tests passed. No backend changes, so root build not run.
E1a limits: generated directories are metadata-only (not traversed); Node SQLite verified, Electron native rebuild/packaged launch unverified; no packaging/asar-unpack config exists. Chunks/symbols, journaling, retention, IPC/UI remain later tasks; this update supersedes the Phase 0 unstarted/native-dependency notes below.

E1b (2026-10-02) supersedes the E1a chunks/symbols/IPC/UI deferral: scans now atomically index 40-line chunks with five-line overlap and heuristic JS/TS/Python declarations, backfill E1a databases, and purge derived data on exclusion, secret detection or deletion. The existing symbol detector is reused through a pure shared helper. Memory open/status/pause/purge enforce authenticated main-frame sender, current workspace, exact payloads and native consent; workspace changes, sign-out and shutdown cancel/close the service. Settings changes immediately reapply exclusions. The Privacy panel subscribes to real counts, journal text bytes, database size, scan state and last-scan time; it has no mutation controls and receives no file content, keys or database paths.
Validation: 313 desktop tests total (312 passed, 0 failed, 1 pre-existing POSIX-fixture skip), including eight added indexing/IPC/preload/read-only-view tests; typecheck and diff checks passed. The separately committed Windows Python fixture fix passed all 24 Fix Code tests. Node SQLite works in this checkout; Electron native rebuild remains blocked by missing Visual Studio C++ Build Tools. No Electron runtime, interactive native-dialog, rendered-panel or packaged-launch verification is claimed. No backend files changed, so root build was not run. Both root package-lock.json copies retained their original hashes. Journaling, web ingestion and later engine phases remain unstarted.

Phase 0 deliverables are finished; the phase is not marked Complete because this
plan requires every check to pass. E1–E7 remain unstarted. The baseline and
remaining environment prerequisites are recorded in the 2026-10-02 changelog.

Open decisions carried forward from spec §16, without changing the specified
defaults: supervisor approval of the amendment before E4 ships to others;
proactive default off versus opt-in onboarding behavior; widening SRS FR-06's
2–15-second range to 2–300 seconds; web auto-ingestion default off and initial
deny list; history sync default off; retention defaults and future at-rest
encryption; genuine streaming support per provider. No official `.docx` is edited.
The missing E8 task definition is a specification discrepancy, not a new phase
designed here. The §7.2 `useWebContext` default and §9 auto-ingestion switch must
remain distinct; §16's wording does not authorize silently enabling ingestion.

Native packaging audit: `apps/desktop/package.json` currently rebuilds only
`node-pty`; `electron.vite.config.ts` externalizes dependencies. No electron-builder,
Forge or asar-unpack configuration was found in the desktop package. E1 must
address `better-sqlite3` rebuild/packaging requirements (§4.1); no dependency or
packaging configuration is added in Phase 0.

## Recommended folder structure

```text
Proactive-Ai/
├── src/                         # Existing Next.js application
├── supabase/                    # Existing backend migrations/configuration
├── apps/
│   └── desktop/
│       ├── package.json
│       ├── electron.vite.config.ts
│       ├── tsconfig.json
│       └── src/
│           ├── main/            # Trusted Electron main process
│           │   ├── index.ts
│           │   ├── workspace-files.ts
│           │   └── workspace-ipc.ts
│           ├── preload/         # Narrow, typed IPC bridge
│           │   └── index.ts
│           ├── renderer/        # Sandboxed React interface
│           │   ├── App.tsx
│           │   ├── Explorer.tsx
│           │   └── styles.css
│           └── shared/          # IPC contracts shared by Electron processes
│               └── workspace.ts
├── packages/                    # Optional, introduced only when justified
│   └── shared/                  # Framework-independent reusable logic
└── docs/
    └── DESKTOP_IDE_PLAN.md
```

The desktop application is an independent package. Its Electron dependencies,
build output, lockfile, and TypeScript configuration remain isolated from the root
Next.js package. The existing Next.js build currently passes without changing its
root configuration; add an explicit exclusion later only if future desktop types
create a verified conflict.

## Reuse strategy

Good candidates for reuse or extraction into a future shared package:

- `src/lib/files.ts`: extension detection, file-kind types, and Monaco language
  mapping.
- `src/lib/manual-suggestion.ts`: meaningful-content checks and selection/cursor
  request-context construction.
- `src/components/CodeEditor.tsx`: Monaco options and selection/cursor context
  collection.
- `src/components/ObserverPanel.tsx`: Observer states and Ask/Accept/Dismiss
  interaction model.
- `src/lib/suggest.ts`: provider, suggestion, and API response types.
- `src/components/DocEditor.tsx`: TipTap configuration for a later rich-text
  document mode.
- The current three-pane workspace layout and visual language.

Initially, adapt UI components rather than importing them directly. They depend
on Next.js aliases, Tailwind, browser persistence, and the web-only Zustand
workspace store. Only framework-independent TypeScript should eventually move
into `packages/shared`.

The following code must remain server-only and must never be bundled into the
Electron renderer or preload script:

- `src/lib/server/crypto.ts`
- `src/lib/server/providers.ts`
- Supabase service-role credentials
- Server-side or decrypted AI provider keys

## Phase 1 — Secure desktop shell

**Goal:** Launch an isolated Electron application without changing the behavior
of the existing web application.

- [x] **Complete** — Create the isolated `apps/desktop` package.
- [x] **Complete** — Add Electron, React, TypeScript, and desktop build tooling.
- [x] **Complete** — Add Electron main, preload, and renderer entry points.
- [x] **Complete** — Enable `contextIsolation`.
- [x] **Complete** — Disable `nodeIntegration`.
- [x] **Complete** — Enable renderer sandboxing where supported.
- [x] **Complete** — Expose no unrestricted Node or Electron API to the renderer.
- [x] **Complete** — Add the initial explorer/editor/output/Observer layout.
- [x] **Complete** — Add an inactive `Ask Observer` placeholder button.
- [x] **Complete** — Isolate desktop TypeScript and build output from Next.js.
- [x] **Complete** — Document desktop development commands.

Required verification:

- [x] **Complete** — Desktop TypeScript check passes.
- [x] **Complete** — Desktop production build passes.
- [x] **Complete** — Electron launches and renders its shell.
- [x] **Complete** — Runtime security diagnostics and the empty preload boundary
  confirm the renderer has no direct Node access.
- [x] **Complete** — Existing web lint, tests, and production build pass.

## Phase 2 — Local projects, explorer, Monaco, and saving

**Goal:** Open a local folder, navigate text files, edit them in Monaco, and save
changes safely.

### Phase 2A — Local project folder and read-only Explorer

- [x] **Complete** — Add a native folder-selection dialog.
- [x] **Complete** — Store the authorized workspace root only in main-process
  memory.
- [x] **Complete** — Add minimal typed preload methods for folder selection and
  immediate directory listing.
- [x] **Complete** — Validate relative paths and real paths against the authorized
  root.
- [x] **Complete** — Allow only symlinks whose resolved targets remain inside the
  authorized root.
- [x] **Complete** — Ignore `node_modules`, `.git`, `dist`, `build`, and `.next`.
- [x] **Complete** — Render an expandable tree that loads child folders lazily.
- [x] **Complete** — Add empty, loading, cancellation, and safe error states.
- [x] **Complete** — Keep files read-only and leave the Editor placeholder intact.

Phase 2A required verification:

- [x] **Complete** — Focused workspace-boundary and directory-listing tests pass.
- [x] **Complete** — Desktop TypeScript and production builds pass.
- [x] **Complete** — Electron launches and the folder-selection/expansion flow is
  verified against a deterministic local workspace fixture.
- [x] **Complete** — Runtime still reports `contextIsolation=true`,
  `nodeIntegration=false`, and `sandbox=true`.
- [x] **Complete** — Existing web lint, tests, and production build pass.

### Phase 2B — Secure read-only text file viewer

- [x] **Complete** — Add one typed, root-confined IPC method for reading a
  selected relative file path.
- [x] **Complete** — Restrict reads to the supported text/code extensions.
- [x] **Complete** — Reject directories, binary content, oversized files, and
  paths or symlinks resolving outside the workspace.
- [x] **Complete** — Return safe typed error states without absolute local paths.
- [x] **Complete** — Load clicked files into a read-only code-style viewer.
- [x] **Complete** — Highlight the active Explorer file.
- [x] **Complete** — Add loading, empty, unsupported, and read-error states.
- [x] **Complete** — Keep Monaco, editing, saving, tabs, terminal, AI, Supabase,
  authentication, and documentation features deferred.

Phase 2B required verification:

- [x] **Complete** — Focused supported, nested, unsupported, binary, oversized,
  directory, traversal, and external-symlink tests pass.
- [x] **Complete** — Desktop TypeScript and production builds pass.
- [x] **Complete** — Electron launches with the secure BrowserWindow flags.
- [x] **Complete** — Existing web lint, tests, and production build pass.

### Phase 2C — Monaco editing and secure file saving

- [x] **Complete** — Open supported text and code files in Monaco Editor.
- [x] **Complete** — Map common extensions to Monaco languages.
- [x] **Complete** — Track dirty editor state and show a visible indicator.
- [x] **Complete** — Add a typed, root-confined IPC method that can overwrite an
  existing opened file without creating, renaming, or deleting files.
- [x] **Complete** — Save the active file with a visible action and Ctrl+S or
  Cmd+S.
- [x] **Complete** — Require Save, Discard, or Cancel before switching away from
  unsaved work.
- [x] **Complete** — Warn before closing a window with unsaved changes.

Phase 2C required verification:

- [x] **Complete** — Files inside the selected root can be listed, opened, edited,
  and saved.
- [x] **Complete** — Attempts to read or write outside the root are rejected.
- [x] **Complete** — Binary and oversized-file handling is deterministic.
- [x] **Complete** — Save shortcuts work on Windows/Linux and macOS.
- [x] **Complete** — Relevant unit/integration tests pass.
- [x] **Complete** — Desktop and web builds still pass.

## Phase 3 — Explorer and editor workflow

**Goal:** Provide the core multi-file workflow expected from a desktop editor.

### Phase 3A — Editor tabs and basic workspace file operations

- [x] **Complete** — Keep opened files in tabs with active and dirty states.
- [x] **Complete** — Close tabs safely with Save, Discard, or Cancel for dirty
  buffers.
- [x] **Complete** — Create validated files and folders inside the workspace.
- [x] **Complete** — Rename validated files and folders while updating affected
  open-tab paths without losing dirty buffers.
- [x] **Complete** — Delete files and empty folders only after explicit target
  confirmation; refuse recursive directory deletion.
- [x] **Complete** — Keep all new operations behind minimal typed, root-confined
  preload IPC methods.

Phase 3A required verification:

- [x] **Complete** — Tab switching, dirty states, closing, and save protection
  behave correctly.
- [x] **Complete** — File/folder create, rename, and allowed delete operations
  succeed and refresh/reveal the Explorer result.
- [x] **Complete** — Traversal, invalid names, duplicates, external symlinks, and
  non-empty folder deletion are rejected.
- [x] **Complete** — Focused tests and desktop TypeScript/build checks pass.
- [x] **Complete** — Electron launches with the existing secure flags.
- [x] **Complete** — Existing web lint, tests, and production build pass.

### Phase 3B — External workspace synchronization

- [x] **Complete** — Watch the selected workspace only from Electron's main
  process and ignore generated/noisy directories.
- [x] **Complete** — Debounce and batch relative-path change events through one
  typed preload subscription.
- [x] **Complete** — Refresh Explorer contents while preserving expanded and
  still-valid selected entries where possible.
- [x] **Complete** — Reload externally changed clean tabs without overwriting
  dirty editor buffers.
- [x] **Complete** — Offer Reload External Version or Keep My Local Changes for
  dirty-file conflicts.
- [x] **Complete** — Mark externally deleted open files unavailable without
  dropping their in-memory content.
- [x] **Complete** — Stop watchers when switching workspaces and closing the app.

Phase 3B required verification:

- [x] **Complete** — External create, rename, edit, delete, and rapid event
  batches refresh the workspace safely.
- [x] **Complete** — Clean, dirty, recreated, and deleted open-file flows behave
  deterministically.
- [x] **Complete** — Watcher ignore, batching, suppression, and cleanup tests pass.
- [x] **Complete** — Desktop TypeScript/build and secure launch checks pass.
- [x] **Complete** — Existing web lint, tests, and production build pass.

- [x] **Complete** — Add file and folder creation.
- [x] **Complete** — Add rename and delete operations with clear confirmation for
  destructive actions.
- [x] **Complete** — Add editor tabs and active-tab navigation.
- [x] **Complete** — Preserve dirty buffers when switching files.
- [ ] **Not Started** — Add Save, Save As, and Save All commands.
- [x] **Complete** — Detect external file changes and offer reload/keep choices.
- [x] **Complete** — Add automatic workspace refresh and filesystem watching.
- [x] **Complete** — Add secure global project search; single-file Find remains future work.
- [x] **Complete** — Persist non-sensitive settings, recent projects, and bounded open-tab metadata in Electron application data.

Required verification:

- [ ] **Not Started** — File operations remain confined to the selected root.
- [ ] **Not Started** — Dirty-buffer and external-change scenarios preserve data.
- [ ] **Not Started** — Large directory trees remain responsive.
- [ ] **Not Started** — Relevant automated tests pass.
- [ ] **Not Started** — Desktop and web builds still pass.

## Phase 4 — Terminal, output, and diagnostics

**Goal:** Run project commands intentionally and surface their output and errors.

### Phase 4A — One controlled workspace terminal and Output panel

- [x] **Complete** — Add Terminal and Output tabs to the bottom panel.
- [x] **Complete** — Create one terminal only after the user selects New Terminal.
- [x] **Complete** — Render the interactive session with xterm.js and fit it on resize.
- [x] **Complete** — Spawn and own the pseudoterminal only in Electron's main process.
- [x] **Complete** — Start the user's platform shell in the authorized workspace root.
- [x] **Complete** — Add minimal typed create/input/output/resize/close IPC contracts.
- [x] **Complete** — Stop the terminal on explicit close, workspace replacement,
  renderer destruction, and application exit.
- [x] **Complete** — Add a separate Output view for bounded IDE status messages.

Phase 4A required verification:

- [x] **Complete** — Terminal creation, input, streamed output, resize, and close work.
- [x] **Complete** — No process starts before explicit user action or without a workspace.
- [x] **Complete** — Workspace switching and application exit clean up the child process.
- [x] **Complete** — Focused terminal lifecycle tests pass.
- [x] **Complete** — Desktop TypeScript/build and secure launch checks pass.
- [x] **Complete** — Existing web lint, tests, and production build pass.

### Phase 4B — Run Current File and structured diagnostics

- [x] **Complete** — Add an explicit Run action and Ctrl+R/Cmd+R shortcut.
- [x] **Complete** — Run saved Python and JavaScript files through a controlled
  main-process command map without a shell.
- [x] **Complete** — Stream stdout/stderr and report exit status and duration in
  the Output panel.
- [x] **Complete** — Add explicit Stop behavior and process cleanup on workspace
  replacement and application exit.
- [x] **Complete** — Parse Python and Node error locations into clickable
  diagnostics that focus Monaco.
- [x] **Complete** — Report unsupported languages and unavailable TypeScript
  execution without guessing commands.

Phase 4B required verification:

- [x] **Complete** — Successful Python and JavaScript files run from the
  selected workspace root.
- [x] **Complete** — Syntax/runtime errors produce useful clickable diagnostics.
- [x] **Complete** — Unsaved, unsupported, Stop, workspace-change, and app-exit
  behavior is safe and explicit.
- [x] **Complete** — Focused runner and diagnostic parser tests pass.
- [x] **Complete** — Desktop TypeScript/build and secure launch checks pass.
- [x] **Complete** — Existing web lint, tests, and production build pass.

- [x] **Complete** — Add an output panel separate from interactive terminals.
- [x] **Complete** — Add `xterm.js` terminal rendering.
- [x] **Complete** — Add a controlled `node-pty` integration in the main process.
- [x] **Complete** — Start terminal processes only after explicit user action.
- [x] **Complete** — Use the selected project root as the terminal working directory.
- [x] **Complete** — Stream output through narrowly scoped IPC events.
- [x] **Complete** — Resize and stop the single terminal session safely.
- [x] **Complete** — Terminate child processes when the window or application exits.
- [ ] **Not Started** — Add opt-in project tasks for builds and tests.
- [ ] **Not Started** — Parse supported compiler/test output into diagnostics.
- [ ] **Not Started** — Display diagnostics in Monaco and navigate to source lines.

Required verification:

- [ ] **Not Started** — Terminal input/output and resizing work on supported platforms.
- [ ] **Not Started** — Processes are cleaned up on exit.
- [ ] **Not Started** — Commands cannot silently start without user action.
- [ ] **Not Started** — Diagnostics link to the correct local files and lines.
- [ ] **Not Started** — Packaged native-module smoke tests pass.
- [ ] **Not Started** — Desktop and web builds still pass.

## Phase 5 — Observer AI integration

**Goal:** Connect the desktop editor to the existing authenticated Observer backend
without placing secrets in the desktop bundle.

### Phase 5A — Secure desktop authentication

- [x] **Complete** — Add an unauthenticated email/password sign-in screen and
  authenticated user menu with Sign Out.
- [x] **Complete** — Run Supabase Auth in Electron main with a public client key
  only; expose no raw session or token to the renderer.
- [x] **Complete** — Encrypt the persisted session using Electron `safeStorage`
  and restore/refresh it across application restarts.
- [x] **Complete** — Keep the desktop IDE inaccessible while signed out and clear
  secure session data during sign-out.
- [x] **Complete** — Document the bearer-token boundary required for future
  desktop calls to the existing Next.js AI routes without changing web auth.

Phase 5A required verification:

- [x] **Complete** — Valid and invalid email/password sign-in states behave
  clearly.
- [x] **Complete** — A valid encrypted session restores after restart and is
  removed on sign-out.
- [x] **Complete** — Signed-out users see only authentication UI.
- [x] **Complete** — No service-role key, provider key, encryption secret, or raw
  session token appears in renderer code, renderer bundles, logs, or IPC responses.
- [x] **Complete** — Focused desktop auth/session tests pass.
- [x] **Complete** — Desktop TypeScript/build and secure launch checks pass.
- [x] **Complete** — Existing web lint, tests, authentication behavior, and
  production build pass unchanged.

### Phase 5B — Manual Ask Observer integration

- [x] **Complete** — Adapt the existing API authentication boundary for desktop
  clients without weakening web authentication.
- [x] **Complete** — Keep the Supabase service-role key and provider-key decryption
  exclusively on the server.
- [x] **Complete** — Add Explain, Fix Error, Improve Code, Continue Code, and
  Generate Tests request modes to explicit manual requests.
- [x] **Complete** — Collect bounded selected text or cursor/nearby context from Monaco.
- [x] **Complete** — Include the active file only for Generate Tests and only within
  the documented safe size limit.
- [x] **Complete** — Include a matching structured diagnostic and bounded current run
  error only for an explicit Fix Error request.
- [x] **Complete** — Implement context summary, loading, suggestion, error, Copy,
  Insert, and instant Dismiss states, plus Ctrl/Cmd+Enter and Escape shortcuts.
- [x] **Complete** — Preserve suggestion and outcome persistence under Supabase RLS.
- [x] **Complete** — Apply accepted snippets at the current cursor through Monaco
  editor operations with undo
  support.
- [x] **Complete** — Keep filenames basename-only and exclude `.env`, credential,
  key/certificate, workspace-wide, terminal-history, and unrelated file context.
- [x] **Complete** — Keep AI requests user-triggered unless a later, separately
  approved proactive design is implemented.

Phase 5B required verification:

- [x] **Complete** — Every request mode and selected/cursor/diagnostic context path is
  covered by focused tests.
- [x] **Complete** — Unauthenticated requests are rejected before a network call.
- [x] **Complete** — Bearer tokens are server-validated and user-scoped suggestion and
  outcome operations retain existing ownership RLS.
- [x] **Complete** — No service-role or provider secret appears in renderer bundles,
  logs, IPC messages, or packaged resources.
- [x] **Complete** — Ask, Copy, cursor Insert, Dismiss, Escape, and shortcut behavior
  passes focused verification.
- [x] **Complete** — API authentication, RLS policy regression, desktop, and web tests
  and production builds pass.

## Phase 6 — Documentation support

**Goal:** Edit and navigate project documentation without corrupting source formats.

- [x] **Complete** — Edit `.md` and `.mdx` source in Monaco while `.txt` remains
  ordinary plain text.
- [x] **Complete** — Render a safe GitHub-flavored Markdown preview with raw HTML,
  remote images, and executable URL schemes disabled.
- [x] **Complete** — Add Edit, Preview, and side-by-side Split modes plus the existing
  safe Save action.
- [x] **Complete** — Build a heading outline from Markdown source and navigate to the
  corresponding editor line or preview heading.
- [x] **Complete** — Keep rich-text conversion, TipTap, DOCX/PDF editing, collaboration,
  and export outside Phase 6; Markdown remains the source of truth.
- [x] **Complete** — Add Explain this document, Improve writing, Summarize, and Generate
  README section to the explicitly triggered Observer workflow.
- [x] **Complete** — Restrict documentation requests to the active document's selection,
  cursor neighborhood, or mode-approved bounded active content; related files are not
  collected automatically.

Required verification:

- [x] **Complete** — `.mdx` source round-trips without conversion and existing dirty,
  save, stale-write, and external-change protections remain in force.
- [x] **Complete** — Renderer tests cover headings, links, tables, code blocks,
  blockquotes, task lists, raw HTML/scripts/event handlers, and executable URLs.
- [x] **Complete** — A bounded 2,000-section document renders within the desktop test
  budget; preview virtualization is deferred.
- [x] **Complete** — All four documentation Observer modes pass focused-context and
  bearer-transport tests without project-wide collection.
- [x] **Complete** — Desktop tests/type/build and existing web tests/lint/build pass.

## Phase 7A — Global project search

**Goal:** Search supported files in the authorized local workspace without giving
the renderer filesystem or process access.

- [x] **Complete** — Add Explorer/Search sidebar views and Ctrl/Cmd+Shift+F focus.
- [x] **Complete** — Add case-sensitive, whole-word, regular-expression, include,
  exclude, and configurable result-limit controls.
- [x] **Complete** — Debounce requests, terminate superseded searches, expose Cancel,
  and show loading, empty, error, cancelled, and truncated states.
- [x] **Complete** — Run pinned ripgrep outside the renderer with `shell: false`, a
  fixed argument array, a filtered environment, JSON parsing, and 50-match batches.
- [x] **Complete** — Group results by relative file path with line numbers and
  highlighted previews.
- [x] **Complete** — Open matches through the existing secure file/tab flow and select
  the exact line/column range in Monaco without replacing dirty drafts.
- [x] **Complete** — Respect project `.gitignore`, skip symlinks, binaries, files over
  1 MiB, generated/dependency folders, and default secret/credential/private-key files.
- [x] **Complete** — Keep search-and-replace, command palette, Git, recent projects,
  proactive Observer, and new AI behavior outside Phase 7A.

Required verification:

- [x] **Complete** — Normal, case-sensitive, whole-word, and Rust-regex searches pass.
- [x] **Complete** — Include/exclude patterns, batching, result limits, and cancellation pass.
- [x] **Complete** — `.gitignore`, ignored folders, binary/large files, secret files,
  traversal-safe relative paths, and no-follow symlink behavior pass.
- [x] **Complete** — Result-to-Monaco selection mapping and existing tab protections pass.
- [x] **Complete** — Desktop tests/type/build and existing web tests/lint/build pass.

## Phase 7B — Recent projects and workspace reopening

**Goal:** Reopen user-approved projects safely without weakening workspace authorization.

- [x] **Complete** — Show a welcome screen with Open Folder, a clear first-use state,
  and up to 10 recent projects with name, shortened path, timestamp, and Remove action.
- [x] **Complete** — Persist only canonical path, display name, and last-opened timestamp
  in an owner-only JSON file under Electron's application-data directory.
- [x] **Complete** — Deduplicate canonical paths, order by newest timestamp, move a
  reopened project to the top, and enforce the 10-project limit.
- [x] **Complete** — Expose only opaque identifiers and shortened display paths to the
  renderer; keep canonical paths and all storage access in Electron main.
- [x] **Complete** — Reopen only list-authorized projects through canonical folder and
  directory-read validation, rejecting missing, non-directory, changed, or replaced-
  symlink paths with a removable error state.
- [x] **Complete** — Preserve the existing dirty-tab confirmation and workspace process
  cleanup when switching through either Open Folder entry point or a recent project.
- [x] **Complete** — Default startup to the welcome screen. The newest recent entry
  remembers the last workspace, but automatic reopening remains disabled.

Required verification:

- [x] **Complete** — Add, deduplication, timestamp ordering, 10-item limit, and removal pass.
- [x] **Complete** — Missing/non-directory/unlisted paths and replaced-symlink reopening fail safely.
- [x] **Complete** — Persisted and renderer-visible schemas contain only their documented metadata.
- [x] **Complete** — Desktop tests/type/build and existing web tests/lint/build pass.

## Phase 7C — Command Palette and keyboard-first navigation

**Goal:** Search for and run a bounded registry of existing IDE actions without
weakening renderer isolation or embedded editor/terminal keyboard behavior.

- [x] **Complete** — Open a centered searchable command dialog with Ctrl/Cmd+Shift+P.
- [x] **Complete** — Add fuzzy command-name filtering, command shortcut labels, an
  empty state, and visible selected/focus states.
- [x] **Complete** — Support Up/Down wrapping, Enter execution, Escape/click-away
  closing, dialog/listbox semantics, and previous-focus restoration.
- [x] **Complete** — Define one typed 20-command registry with centralized availability
  reasons, execution handlers, duplicate-ID rejection, and shortcut-conflict rejection.
- [x] **Complete** — Dispatch file, search, view, terminal, run, Observer, Markdown,
  workspace-close, and Welcome actions through their existing owners rather than
  duplicating filesystem, terminal, runner, editor, or Observer logic.
- [x] **Complete** — Add a narrow authenticated Close Workspace operation so File:
  Close Workspace and Window: Open Welcome Screen reuse the main-process lifecycle
  and existing unsaved-file confirmation.
- [x] **Complete** — Preserve terminal Ctrl+S/Ctrl+R input, Monaco shortcuts, and the
  intentionally global palette/search/Observer shortcuts.
- [x] **Complete** — Keep customizable shortcuts, shortcut editing, arbitrary commands,
  Git, proactive AI, and unrelated redesign outside Phase 7C.

Required verification:

- [x] **Complete** — Palette open/close, fuzzy filtering, keyboard movement, execution,
  disabled behavior, duplicate IDs/shortcuts, Escape focus restoration, and embedded
  terminal/Monaco shortcut protection pass focused tests.
- [x] **Complete** — All 20 required command IDs are present exactly once.
- [x] **Complete** — Desktop tests/type/build and existing web tests/lint/build pass.

## Phase 7D — Settings and Privacy Center

**Goal:** Centralize safe device preferences, per-account AI choices, server-side
provider-key management, privacy rules, and data controls.

- [x] **Complete** — Add a searchable, sectioned Settings dialog reachable from a
  visible header action, account menu, Ctrl/Cmd+Comma, and the typed command registry.
- [x] **Complete** — Add System/Light/Dark theme, Welcome/reopen-last startup behavior,
  delete confirmation, and project-tab restoration controls.
- [x] **Complete** — Apply font size, tab size, word wrap, minimap, and delayed auto-save
  to the active Monaco workflow without an application restart; provide editor reset.
- [x] **Complete** — Show server-reported system/user/unavailable provider status,
  fixed supported models, and a per-user preferred provider/model.
- [x] **Complete** — Add authenticated bearer-token Add/Replace, optional Verify, and
  Delete API-key operations. Inputs are masked and cleared after successful writes;
  stored values are never returned.
- [x] **Complete** — Add manual Observer defaults, focused-context controls, optional
  history, restrictive context sizing, full-file confirmation, and disabled future
  Assist Mode without proactive monitoring.
- [x] **Complete** — Keep permanent `.env`, credential, token, and private-key exclusions
  non-removable; add device-local user exclusions and clear privacy explanations.
- [x] **Complete** — Store typed/versioned local settings, bounded tab metadata, and
  recent metadata under Electron `userData`; store only user-owned synced preferences
  in Supabase behind RLS. Tokens remain in the existing encrypted session store.
- [x] **Complete** — Add confirmed local reset, recent-history clearing, local
  Observer/context-history clearing, and sign-out controls. Account deletion remains out of scope.

Required verification:

- [x] **Complete** — Focused tests cover defaults, corruption recovery, local/synced
  separation, Monaco option updates, signed-out rejection, response secret rejection,
  permanent exclusions, tab metadata, recents clearing, and command access.
- [x] **Complete** — The CLI-created migration enables RLS, includes owner-only SELECT,
  INSERT, UPDATE (`USING` and `WITH CHECK`), and DELETE policies, and handles grants
  separately. The static policy harness and linked-project SQL verification pass; local
  Docker remains unavailable, but the migration is applied to the linked project.
- [x] **Complete** — Desktop tests/type/build and web tests/lint/build pass; desktop
  output contains no server credential identifiers or raw provider-key patterns.

## Phase 7E — Read-only Git status and diff viewer

**Goal:** Inspect the authorized workspace's local Git state and HEAD-to-worktree
diffs without exposing Git, process, or filesystem capabilities to the renderer.

- [x] **Complete** — Add a Source Control sidebar with repository name, branch,
  changed count, staged, unstaged, renamed, deleted, and untracked groups.
- [x] **Complete** — Add manual Refresh, Ctrl/Cmd+Shift+G, the typed “Git: Show
  Source Control” command, and debounced refresh after workspace file changes.
- [x] **Complete** — Parse bounded NUL-delimited porcelain-v2 status output so
  spaces, rename source paths, detached HEAD, and non-human status data are safe.
- [x] **Complete** — Open read-only Monaco side-by-side diffs without disturbing
  normal editor tabs; use an empty side for untracked/added or deleted content.
- [x] **Complete** — Show explicit binary, oversized, unavailable, missing-Git,
  non-repository, loading, error, clean, cancelled, and truncated states.
- [x] **Complete** — Run only fixed `status` and `cat-file` argument arrays from
  Electron main with `shell: false`, filtered environment, validated workspace cwd,
  timeouts, cancellation, output caps, and a 500-file result limit.
- [x] **Complete** — Keep the renderer behind a narrow typed status/diff/cancel IPC
  allowlist; reject extra request fields, paths outside the refreshed status result,
  traversal, symlinks, and canonical workspace escapes.
- [x] **Complete** — Exclude every Git write, remote, credential, AI-review, and
  proactive operation from this phase.

Required verification:

- [x] **Complete** — Temporary-repository tests cover repository detection, branch
  parsing, staged/unstaged/untracked/deleted/renamed/binary files, and paths with spaces.
- [x] **Complete** — Tests cover correct original/current content, result limits,
  timeout/cancellation, missing Git, non-repositories, and arbitrary-command rejection.
- [x] **Complete** — Desktop tests/type/build and existing web tests/lint/build pass.
- [x] **Complete** — Production code contains no shell mode, write/remote Git command,
  credential operation, or renderer filesystem/process access.

## Phase 8 — Deterministic Project Context Engine

**Goal:** Improve explicit Ask Observer requests with a focused, explainable,
workspace-scoped context package without indexing or uploading the project.

- [x] **Complete** — Define a reusable typed context package with intent, active
  file/language, cursor, explicit item types, provenance, selection reason, priority,
  line ranges, relevance, cost, truncation/redaction state, omissions, and limits.
- [x] **Complete** — Apply the fixed priority order: explicit action, selection,
  diagnostic, current symbol, nearby code, related files, rules/docs, terminal error.
- [x] **Complete** — Build action-specific packages for all five code actions and
  four documentation actions; documentation does not collect code automatically.
- [x] **Complete** — Discover only deterministic local relationships: relative
  imports/requires, nearby test naming patterns, test/framework configuration, and
  workspace instruction files (`AGENTS.md`, `.proactive/rules.md`, relevant README).
- [x] **Complete** — Keep bounded candidate metadata in Electron main and invalidate
  it for changed editor content, workspace watcher batches, saves, creates, renames,
  deletes, workspace replacement, and close.
- [x] **Complete** — Add Settings limits for total characters (1,000–50,000), related
  files (1–10), and content per related file (500–20,000), with restrictive defaults
  of 20,000, 4, and 8,000 respectively.
- [x] **Complete** — Preserve higher-priority context deterministically, record every
  omitted/truncated lower-priority item, and never exceed the final total budget.
- [x] **Complete** — Block permanent secret formats, generated folders, `.gitignore`,
  user exclusions, binary/oversized content, traversal, and escaping symlinks; redact
  common token, credential, cloud-key, and private-key content before preview/send.
- [x] **Complete** — Show a detailed Context Preview before sending, including source,
  line range, provenance, reason, cost, omissions, and redaction/truncation indicators;
  allow optional-item removal and require confirmation for complete-file context.
- [x] **Complete** — Send the structured package through authenticated Observer IPC;
  main authorizes only an unchanged subset of the package it prepared.
- [x] **Complete** — Validate schema, relationships, item costs, total size, secrets,
  and complete-file metadata again in Next.js. Prompt boundaries label project content
  as untrusted data, and suggestion history stores safe metadata rather than raw context.
- [x] **Complete** — Keep all requests manual. No embeddings, vector database,
  workspace upload/index, proactive monitoring, multi-file edits, commands, Git writes,
  extension communication, or release work were added.

Required verification:

- [x] **Complete** — Focused tests cover every Observer action, priority order, direct
  imports, test discovery/config, budgets, file/count limits, `.gitignore`, generated/
  secret/user-excluded files, redaction, symlink containment, cache invalidation,
  preview removal, and complete-file confirmation.
- [x] **Complete** — Backend tests cover valid/oversized/malformed packages, duplicate
  items, secret rejection, untrusted prompt-injection text, and metadata-only logging.
- [x] **Complete** — Desktop tests/type/build and web tests/lint/build pass.
- [x] **Complete** — Desktop output and context fixtures pass credential/token scans.

## Phase 9 — Safe AI Change Engine with diff review and rollback

**Goal:** Let users review and explicitly apply bounded AI changes with a recoverable
diff workflow.

### Phase 9A — Safe single-file AI changes

- [x] **Complete** — Fix Error, Improve Code, Continue Code, and selected-code
  Add Comments/Documentation may return one structured edit for the already-open
  active file. Explain/document modes and Generate Tests remain suggestion-only.
- [x] **Complete** — The strict response contains explanation, reason, trusted target
  relative path, original SHA-256, replace/insert/delete type, one 1-based range,
  exact expected original text, bounded replacement text, and optional warnings.
- [x] **Complete** — Server and desktop reject unknown fields/types, traversal,
  target/hash mismatches, invalid/reversed ranges, wrong expected text, and oversized
  edits. The permitted target and base hash are calculated locally, never trusted
  from model output.
- [x] **Complete** — A read-only Monaco Diff Editor shows original/proposed content,
  explanation, reason, target, context summary, warnings, and unsaved-base status,
  with Accept, Reject, Regenerate, Copy, and Escape actions.
- [x] **Complete** — Acceptance revalidates the live in-memory SHA-256 and exact range
  text, then creates an owner-only local checkpoint before updating the Monaco draft.
  It never saves, runs, tests, opens a terminal, or performs Git operations.
- [x] **Complete** — Accepted changes and checkpoint restores remain dirty and are
  excluded from auto-save until an explicit manual save.
- [x] **Complete** — Checkpoints live under Electron application data, never the
  repository or Supabase. They bind workspace ID, relative path, timestamp, previous
  and applied hashes, optional suggestion ID, and bounded previous content.
- [x] **Complete** — Undo Observer Change is available in Observer and the Command
  Palette. Hash checks block unsafe restoration; Settings controls 1–100 checkpoint
  retention (default 20) and can clear all local checkpoints.
- [x] **Complete** — Supabase suggestion history stores edit metadata and outcomes,
  not replacement text or complete checkpoint code. Existing bearer and cookie auth
  paths, server-only provider keys, and untrusted-context boundaries remain intact.

Required verification:

- [x] **Complete** — Focused tests cover replacement/insertion/deletion, malformed and
  overlapping/batched edits, paths/ranges/size, target/hash/stale/expected-text checks,
  dirty buffers, diff generation, accept/reject/regenerate safety, checkpoints,
  restoration, cleanup/retention, and no automatic save/command execution.
- [x] **Complete** — Desktop tests (105/105), strict TypeScript, and Electron production
  build pass.
- [x] **Complete** — Root backend tests, lint, and Next.js production build pass.
- [x] **Complete** — Desktop production output passes the credential/secret scan.

### Phase 9B — Multi-file AI Change Sets

- [x] **Complete** — Add a separate Plan Multi-File Change action that requires a
  3–500 character user description; no normal Observer mode can escalate itself.
- [x] **Complete** — Preview focused Phase 8 context before both plan and generation,
  then require explicit plan approval before the server may generate file content.
- [x] **Complete** — Validate strict server-assigned plan/change-set IDs, exact schemas,
  unique workspace-relative paths, operation/base agreement, hashes, byte/count/line
  limits, and complete membership on the server and desktop.
- [x] **Complete** — Support only existing supported-text updates and absent supported-
  text creates. Reject delete/rename/move, binaries, secrets, `.git`, absolute/traversal
  paths, escaping or target symlinks, and paths outside the selected workspace.
- [x] **Complete** — Show every affected file in an all-or-nothing Monaco diff review,
  including empty originals for creates, per-file explanations and line counts,
  warnings, verification suggestions, Reject, and whole-set Regenerate.
- [x] **Complete** — Repeat path, dirty-tab, hash, absence, exact-base, and configured-
  limit preflight immediately before applying. Conflicts apply nothing and remain in
  review so the user can regenerate or cancel.
- [x] **Complete** — Create one owner-only checkpoint bundle under Electron application
  data before staging writes. Commit same-directory staged files atomically; a mid-
  apply failure restores committed updates and removes only matching new files.
- [x] **Complete** — Refresh affected editor state, clear stale diagnostics, summarize
  success, and offer hash-gated whole-set Undo from the result and Command Palette.
- [x] **Complete** — Show suggested verification commands without running them. The
  user must confirm a restricted validation-only command list or open the terminal and
  run unsupported suggestions manually; Git and shell-control commands are rejected.
- [x] **Complete** — Store configurable local limits (default 5 files, 500 changed
  lines, 200,000 generated UTF-8 bytes) and reuse checkpoint retention. Plan review
  and diff review are locked On; automatic command execution is locked Off.
- [x] **Complete** — Log only provider/model, action/phase/outcome, file-type counts,
  size/timing, IDs, and safe context metadata. Raw originals, generated code,
  checkpoint contents, paths beyond necessary basename/metadata, and terminal output
  are not stored in Supabase analytics.

Required verification:

- [x] **Complete** — Focused tests cover planning context, strict plan/change-set
  validation, duplicates, traversal/absolute/secret/binary/symlink targets, limits,
  bearer/signed-out/malformed API behavior, stale/collision/dirty conflicts,
  checkpoint failure, successful update/create, simulated mid-apply restoration,
  safe undo, rollback conflict, review actions, and explicit-only verification.
- [x] **Complete** — Desktop tests (115/115), strict TypeScript, and Electron production
  build pass.
- [x] **Complete** — Root backend tests, lint, and Next.js production build pass.
- [x] **Complete** — Desktop production output passes the credential/private-key scan.
- [x] **Complete** — No Supabase migration was required; the existing owner-scoped
  suggestions table stores metadata-only records through authenticated requests.

## Phase 10 — Proactive Observer

**Goal:** Offer optional, quiet help only for verified technical events while keeping
the user in control of every AI request and change.

### Phase 10A — Optional Proactive Observer V1

- [x] **Complete** — Add Off, Manual, and Assist modes. Manual is the versioned local
  default for existing and new users; Assist requires explicit privacy-confirmed opt-in.
- [x] **Complete** — Detect locally only: the same error-level Monaco marker across two
  save/validation cycles, failed Run Current File, and failed explicitly approved
  test/build actions. Warnings, transient typing errors, arbitrary terminal text,
  cursor/typing behavior, emotion inference, document drift, missing-import special
  cases, and background monitoring are excluded from V1.
- [x] **Complete** — Normalize events into a typed, secret-free hashed signature with
  detector/severity, pseudonymous workspace ID, optional relative context reference,
  occurrence/timing/resolution state, deterministic reason, actions, and cooldown data.
- [x] **Complete** — Show at most one quiet nonmodal Observer nudge with its local
  reason and Investigate, Explain, Suggest Fix, Not Now, mute-error/file/project, and
  Disable Assist actions. Escape dismisses without focus stealing, sound, modal UI, or
  continuous animation.
- [x] **Complete** — Detection and nudge actions make zero model calls. Assistance
  actions prepare Phase 8 Context Preview; only explicit Send may contact the backend,
  and Phase 9 review/rollback remains required for proposed edits.
- [x] **Complete** — Enforce a 10-minute global cooldown, three nudges per project/hour,
  one active nudge, unresolved-dismissal suppression, detector switches, validated
  thresholds, resolution on diagnostic disappearance/success/file removal, and visible
  manageable local mutes.
- [x] **Complete** — Store only bounded owner-only local feedback metadata. Raw code,
  file content, error text, terminal output, paths, keys, cursor/keystroke history, and
  screenshots are rejected by the feedback schema.

Required verification:

- [x] **Complete** — 124/124 desktop tests pass across deterministic modes/signals,
  persistence, exclusions, repetition, deduplication, resolution, cooldown/cap,
  dismissal/mutes, failure-safe behavior, nonmodal UI, Context Preview, and zero AI
  calls before explicit Send.
- [x] **Complete** — Strict desktop TypeScript and Electron production build pass;
  root backend tests, lint, and Next.js production build pass unchanged.
- [x] **Complete** — Desktop output contains no credential-shaped provider key,
  service-role token, encryption secret, or private key. The existing Supabase anon
  publishable JWT remains intentionally bundled for desktop authentication.
- [x] **Complete** — No Supabase migration was needed. Proactive preferences and
  feedback remain local; manual AI continues through the authenticated server backend.

### Phase 10B — Proactive Observer Evaluation and Tuning Dashboard

- [x] **Complete** — Add Observer Insights in Settings with truthful local aggregate
  metrics, detector breakdowns, time-to-action/resolution measures, mute counts, and
  optional Yes/No/Skip usefulness feedback. Skip is reported separately and excluded
  from the usefulness-rate denominator; resolution is not presented as AI causation.
- [x] **Complete** — Add Low, Balanced, and High safe presets plus bounded advanced
  per-detector enabled, threshold, cooldown, hourly-cap, mute-count, and clear controls.
  Presets change deterministic local eligibility only and never send an AI request.
- [x] **Complete** — Generate conservative local recommendations only from sufficient
  observed history. Every recommendation names the evidence and exact proposed change,
  requires Apply, supports permanent dismissal, and can only reduce interruptions.
- [x] **Complete** — Store a versioned, bounded, owner-only local event schema containing
  random IDs, detector/category/severity, lifecycle timestamps, actions, usefulness,
  resolution, and preset only. Exact-key validation rejects code, messages, output,
  paths, names, prompts, model text, API keys, cursor activity, and unknown fields.
- [x] **Complete** — Add explicit retention, collection, feedback-prompt, clear-history,
  JSON export, and CSV summary controls. Exports are generated only after a user action,
  contain the same privacy-safe schema, and are never uploaded automatically.
- [x] **Complete** — Add an opt-in FYP Evaluation Mode with clear consent, a user-editable
  pseudonymous participant ID, explicit session start/stop, exact-data preview, and
  local export. It does not collect identity, project contents, or hidden telemetry.
- [x] **Complete** — Preserve Phase 10A's signal and execution boundaries: no cursor or
  typing inference, background AI, automatic file change, new detector input, cloud
  analytics, Supabase schema, or web-application behavior was added.

Required verification:

- [x] **Complete** — 132/132 desktop tests pass, including calculations, detector
  breakdowns, presets/ranges, recommendations, strict schema rejection, lifecycle,
  retention/clearing, evaluation sessions, sanitized exports, corruption recovery,
  and optional nonmodal feedback UI.
- [x] **Complete** — Strict desktop TypeScript and Electron production build pass;
  root backend tests, lint, and Next.js production build pass unchanged.
- [x] **Complete** — A generated JSON/CSV evaluation fixture and desktop production
  output passed privacy/credential scans. No prohibited context field or secret-shaped
  provider/service/private-key value was found.
- [x] **Complete** — Current Supabase guidance/changelog was reviewed. All Phase 10B
  data remains device-local, so no database migration, grants, or RLS change was needed.

## Phase 11 — User-controlled Observer Context

### Phase 11A — Privacy-safe Observer Context Tray

- [x] **Complete** — Add a collapsible Context Tray inside Observer with item count,
  safe title/type/source/range, bounded preview, size/token estimate, redacted/truncated/
  stale/unavailable flags, reordering, individual removal, clear-all, and empty state.
- [x] **Complete** — Support explicit selected code, current symbol, file excerpt,
  confirmed complete text file, diagnostic, controlled run error, failed test/build
  summary, selected terminal/output, selected Markdown, current Markdown section, and
  project-rule attachments. Reserve `web_research` in the typed model but reject it
  until Phase 11B provides an approved integration.
- [x] **Complete** — Add visible Monaco/Markdown, Explorer, diagnostics, Output/terminal,
  controlled-failure, and Command Palette attachment actions. Attachment changes local
  tray state only and contains no AI, backend, command, or file-write side effect.
- [x] **Complete** — Merge user attachments into the Phase 8 package below explicit
  intent/action and above automatic symbol/related/document context. Preserve tray order,
  deduplicate exact selections, warn on overlap, and refuse over-budget user items rather
  than silently dropping them.
- [x] **Complete** — Reapply mandatory secret-file, exclusion, canonical workspace,
  symlink, binary/text, content-redaction, item-size, total-size, integrity-hash, and
  server maximum checks in the main process and again during server validation.
- [x] **Complete** — Hash file-backed sources and mark their original snapshot stale or
  unavailable when editor/disk/workspace changes occur. Offer Refresh, Keep Original,
  and Remove; unresolved items block final sending and are never silently replaced.
- [x] **Complete** — Keep tray contents session-local. Opening or closing a workspace
  clears raw context; no references or content are written to localStorage, app data,
  the repository, Supabase, analytics, or cloud sync in Phase 11A.
- [x] **Complete** — Extend manual, proactive, and approved-change workflows through the
  existing authorized Context Preview. Preview distinguishes manually attached from
  automatic items; backend prompt framing keeps all content untrusted; logging contains
  item category, character count, and provenance only.

Required verification:

- [x] **Complete** — 140/140 desktop tests pass, including every implemented source,
  selection/diagnostic/output/Markdown actions, confirmation, budgets/priorities,
  duplicates/overlap, secrets/redaction, symlinks, stale choices, clearing, preview,
  prompt-injection boundaries, and zero AI calls while attaching.
- [x] **Complete** — Strict desktop TypeScript and Electron production build pass;
  root backend harnesses, lint, and Next.js production build pass.
- [x] **Complete** — Desktop production credential/private-key scan found no matching
  secret-shaped value. Source persistence scan found no Context Tray localStorage,
  app-data, Supabase, analytics, or repository write path.
- [x] **Complete** — Current Supabase changelog/security guidance was reviewed. Phase
  11A adds no table or cloud persistence, so no migration, grants, or RLS change exists.

### Phase 11B1 — Chrome extension selected-text capture and preview

- [x] **Complete** — Add an isolated Manifest V3 package under
  `apps/chrome-extension` without changing the Electron renderer or Next.js app.
- [x] **Complete** — Capture only explicitly selected text from the active HTTP/HTTPS
  tab after a toolbar Refresh or the selection context-menu action. Reject internal,
  malformed, credential-bearing, background, form, editable, and password contexts.
- [x] **Complete** — Show a local preview with source title, hostname, expandable URL,
  capture time, character count, editable/trimmed plain text, and truncation/edit flags.
  Refresh, Clear, and Cancel are active; desktop Send is visibly disabled.
- [x] **Complete** — Define a strict versioned `ChromeSelectedTextContext` contract
  with a random capture ID, hashed source ID, SHA-256 content hash, bounded text,
  provenance `chrome_selected_text`, and metadata reserved for `web_research` handoff.
- [x] **Complete** — Store only the latest pending capture in `chrome.storage.local`,
  expire it after 30 minutes, and clear it immediately on Clear or Cancel. Add no
  server, Supabase, authentication, desktop, native-messaging, or AI transport.
- [x] **Complete** — Keep permissions limited to `activeTab`, `scripting`, `storage`,
  and `contextMenus`, with no host permissions. Render all captured values through
  text-only DOM properties under a restrictive extension-page CSP.

Required verification:

- [x] **Complete** — 13/13 extension tests pass for normal/empty/oversized text,
  protocol and credential rejection, password/editable blocking, control cleanup,
  hashes/schema, local editing, latest-item retention, expiration, clearing, minimal
  permissions, text-only rendering, and absence of any transfer implementation.
- [x] **Complete** — Extension strict TypeScript, production build, and manifest
  validation pass. The built package contains only local extension assets and no
  credential/private-key-shaped values.
- [x] **Complete** — Existing 140/140 desktop tests, strict TypeScript, and Electron
  production build pass. Root backend tests, lint, and Next.js production build pass.
- [x] **Complete** — No Supabase schema, API, auth, or storage path was added; therefore
  no migration, grants, or RLS change was required.

### Phase 11B2 — Per-site inline selection and paired desktop handoff

- [x] **Complete** — Replace toolbar-driven capture with an explicit per-origin On/Off
  control using optional runtime host permission. Dynamically register the selection UI
  only for granted origins and remove it from every matching open tab when turned off.
- [x] **Complete** — Show a small isolated P control beside a non-collapsed normal-page
  selection. Read text only after the control is clicked, then show an editable compact
  preview with Send to IDE and Cancel. Dismiss on outside click, Escape, scroll, resize,
  selection clear, or site disable; block form, select, textarea, and editable contexts.
- [x] **Complete** — Add an authenticated loopback bridge bound only to `127.0.0.1` on
  fixed port 32145. Pair only after Start Pairing in desktop Settings with a two-minute
  eight-digit code and an independent random token bound to the exact Chrome extension
  origin. Encrypt the desktop credential with OS safe storage and keep Chrome's copy in
  local, never-sync storage. Support authenticated health, revoke, disconnect, and disable.
- [x] **Complete** — Independently revalidate exact payload keys, UUID, HTTP/HTTPS source,
  hostname, SHA-256 content/source hashes, size, control characters, ten-minute capture
  age, authorization, and replay in Electron main. Strip URL query/fragment data and
  apply existing secret redaction before creating session-local `web_research` context.
- [x] **Complete** — Deliver validated context into a bounded, nonmodal desktop review
  queue. Add it to the existing removable Context Tray only after the user chooses Add;
  Reject discards it. Preserve Context Preview and do not trigger AI, cloud sync,
  Supabase, file writes, commands, or background capture.

Required verification:

- [x] **Complete** — 11/11 extension tests pass for optional per-site permissions,
  supported-origin matching, isolated text-only UI, editable-field blocking, explicit
  confirmation, loopback-only transport, local-only credential storage, authenticated
  health, disconnect, explicit retry, and strict transfer contracts.
- [x] **Complete** — Desktop focused tests cover origin rejection, one-time pairing,
  bearer authorization, strict hashes/source/age, replay rejection, secret redaction,
  safe web-context creation, Context Tray display, and server Context Preview validation.
- [x] **Complete** — Extension and desktop strict TypeScript and production builds pass;
  root backend harnesses pass with `web_research` treated as untrusted user attachment.
- [ ] **Verification in progress** — Run all production builds, regression checks, and a
  live unpacked-Chrome/Electron flow covering pairing expiry, restart, revocation,
  dismissal, review Add/Reject, retry, URL stripping, and redaction. Do not mark the phase
  complete until this manual acceptance pass succeeds.

## Phase 12 — Documentation impact and safe update assistance

### Phase 12A — Local code-to-documentation relationship detection

- [x] **Complete** — Add a typed, relative-path-only relationship model with stable
  IDs, evidence-version hashes, code/document hashes, line ranges, timestamps,
  current/stale/dismissed state, and confirmed/rejected decisions.
- [x] **Complete** — Discover README variants, project Markdown/MDX, docs, setup,
  contribution, API, architecture/ADR, and configured documentation paths through the
  existing bounded, workspace-scoped, symlink-safe text-file bridge. Exclude generated,
  ignored, secret, binary, oversized, and user-excluded content.
- [x] **Complete** — Detect exact file paths and Markdown links, exported symbols,
  API routes, package/CLI scripts, configuration/environment keys, README setup links,
  and test-file/command relationships without AI, embeddings, command execution, or
  network access.
- [x] **Complete** — Assign High confidence to direct paths/links/routes/scripts,
  Medium to exact symbols/configuration keys, and Low to weak filename evidence. The
  default view starts at Medium and suppresses Low results unless explicitly enabled.
- [x] **Complete** — Consume existing read-only Git status/diffs for modified, staged,
  untracked, renamed, and deleted code, plus bounded saved/dirty session changes. In a
  non-Git workspace, explain that results are limited to the current IDE session.
- [x] **Complete** — Ignore comment-only/formatting-only edits, use changed lines for
  new identifiers, retain removed/renamed identifiers as evidence, update on workspace,
  Git, code, documentation, settings, and decisions, mark matching relationships current
  after documentation changes, resolve disappearing evidence, and resurface rejected
  relationships only when source evidence hashes materially change.
- [x] **Complete** — Add the Documentation Impact sidebar with “May need review,”
  confidence and lifecycle state, expandable evidence, correct file/line navigation,
  Confirm Relationship, Not Related, Ignore for This Session, and an empty state.
- [x] **Complete** — Add Both to Context Tray creates only bounded code/document
  excerpts after an explicit click, includes evidence, reuses secret/budget/duplicate
  protections, and preserves `documentation_relationship` provenance through Context
  Preview and server validation. It never modifies a file or calls AI.
- [x] **Complete** — Add device-only defaults and controls for enablement, documentation
  paths, confidence, Low visibility, Git/session sources, and clearing decisions. Persist
  only bounded relative paths, stable IDs, hashes, and decisions—never raw code,
  documentation, absolute paths, analytics, Supabase records, or a cloud graph.

Required verification:

- [x] **Complete** — 153/153 desktop tests pass, including deterministic signal types,
  confidence filtering, comment/format suppression, removal/rename evidence, decisions,
  materially new evidence, lifecycle resolution/current state, Context Tray provenance,
  path/settings validation, and all prior desktop/Chrome bridge regressions.
- [x] **Complete** — Desktop strict TypeScript and Electron production build pass.
- [x] **Complete** — Root backend tests, lint, and Next.js production build pass with
  additive `documentation_relationship` validation and unchanged Supabase storage.
- [x] **Complete** — Chrome extension 11/11 tests, strict TypeScript, Manifest V3
  validation, and production build pass unchanged.
- [x] **Complete** — Generated-output credential/private-key scan and detection-path
  AI/network/storage source scan pass with no matches; `git diff --check` passes.

Manual acceptance steps:

1. Open a Git workspace containing a changed code file and a Markdown reference to its
   path, symbol, route, script, or configuration key; open **Docs** in the sidebar.
2. Verify the card says **May need review**, shows confidence/state/evidence, and that
   Open Code/Open Documentation navigate to the indicated local line.
3. Exercise Confirm Relationship, Not Related, Ignore for This Session, and clearing
   decisions in Settings. Change the underlying evidence and verify a rejected match can
   reappear; update the documentation and verify the matching relationship becomes current.
4. Choose Add Both to Context Tray and verify two bounded excerpts appear with
   Documentation relationship provenance and remain removable in Context Preview.
5. Repeat in a non-Git workspace after saving a code edit and verify the limited-session
   notice. Confirm that no command, AI request, file write, or network action occurs.

Known limitations: Phase 12A uses exact deterministic identifiers rather than semantic
meaning, scans only a bounded portion of very large workspaces, and cannot infer every
indirect relationship. Low filename evidence remains opt-in. It detects impact but does
not generate or apply documentation changes.

### Phase 12B — Safe AI documentation update suggestions

- [x] **Complete** — Add Draft Documentation Update for confirmed or High-confidence
  Phase 12A relationships only. Preparation requires signed-in Observer mode, an existing
  writable workspace `.md` target, matching evidence hashes, safe paths, and no dirty or
  conflicted documentation tab. Opening preparation never calls AI.
- [x] **Complete** — Show the changed code/document, relationship type, confidence,
  evidence, affected section, bounded context size, redaction state, editable explicit
  request, local context preview, and opt-in Context Tray attachments before generation.
- [x] **Complete** — Send only the explicit request, relationship identifiers, bounded
  changed-code evidence, the relevant Markdown section, applicable bounded project rules,
  and explicitly selected tray items. The full document stays local for diffing; web
  context is labeled untrusted and cannot prove local implementation behavior.
- [x] **Complete** — Add strict server and desktop contracts for section update/insertion,
  path/route/command correction, symbol/setup descriptions, and small code examples.
  Validate relative `.md` targets, exact trusted ranges/text/hashes and evidence references,
  bounded sizes, balanced fences, preserved headings/links, secret and absolute-path
  redaction, unsafe HTML rejection, and unverified test/build warnings.
- [x] **Complete** — Provide full-document Monaco diff, rendered Markdown preview,
  editable proposed section, warnings and evidence, Copy Draft, source navigation,
  Refresh Context, Regenerate, Reject/Escape, and explicit acceptance. No file changes
  before acceptance and no silent stale-content rebasing.
- [x] **Complete** — Recheck code/document hashes, exact range, relationship identity,
  dirty state, workspace path, and disk version before apply. Create a local checkpoint
  first, perform a versioned safe write, refresh the editor/analysis, and expose hash-gated
  Undo plus optional preview, relationship recheck, Git diff, and Context Tray actions.
- [x] **Complete** — Keep analytics metadata-only: generic document label, action,
  relationship type/confidence, provider/model, changed-line and warning counts, outcome,
  and timing. No raw code, full Markdown, generated text, web selection, absolute path,
  checkpoint content, key, automatic AI call, command, build/test run, or Git mutation.

Required verification:

- [x] **Complete** — 160/160 desktop tests pass, including the new documentation action,
  request/response validation, stale evidence, Markdown safety, authenticated explicit-call,
  writable preflight, checkpoint/rollback, UI action, and prior regression coverage.
- [x] **Complete** — Desktop strict TypeScript and Electron production build pass.
- [x] **Complete** — Root backend harnesses, lint, and Next.js production build pass with
  the authenticated documentation-update route and no Supabase schema change.
- [x] **Complete** — Unchanged Chrome extension 11/11 tests, strict TypeScript, Manifest V3
  validation, and production build pass.
- [x] **Complete** — Generated credential/private-key, analytics raw-content,
  absolute-path, request-boundary, and whitespace scans pass.

Manual acceptance steps:

1. Sign in, enable Observer, open a workspace with a changed code file and matching `.md`
   relationship, then confirm the relationship (or use a High-confidence result).
2. Choose Draft Documentation Update. Verify preparation appears without a network call;
   review the bounded code/Markdown context and explicitly select any desired tray item.
3. Generate the draft and inspect Markdown Diff and Rendered Preview. Exercise editing,
   Copy Draft, code/document navigation, Regenerate, Reject, and Escape.
4. Change either source before acceptance and verify apply is blocked with Refresh Context,
   Regenerate, and Cancel/Reject choices. Also verify a dirty document and read-only target
   are blocked.
5. Accept a fresh draft and verify the editor/preview and Documentation Impact refresh,
   then exercise Preview, Recheck Relationship, Git Diff, Add Relevant Files, and Undo.
   Confirm no tests, terminal commands, Git commits, or further AI calls run automatically.

Known limitations: Phase 12B updates one existing `.md` file per request by default and
does not support MDX, DOCX, PDF, generated/dependency documentation, file deletion, or
automatic multi-document changes. Relationship discovery remains Phase 12A's bounded,
deterministic analysis. AI output still requires human factual review, and the outstanding
Phase 11B2 live two-application acceptance remains a release-verification item.

## Phase 13 — Desktop coffee-cream visual identity

### Phase 13A — Visual audit and design-system planning

- [x] **Complete** — Confirm work remains on `desktop-ide-foundation`, not `main`, and
  inspect the original browser application's tracked styling through read-only
  `git ls-tree`, `git show main:<path>`, and `git grep` commands without switching branches
  or modifying website files.
- [x] **Complete** — Record the exact ten-color website palette plus every intentional
  source-specific input, traffic-light, and dark coffee showcase color with its `main`
  source location. No screenshot sampling, approximation, or invented palette is used.
- [x] **Complete** — Audit Geist Sans/Mono and Georgia typography, Tailwind 3.4.19 spacing,
  radii, borders, shadows, hover/focus/disabled states, and exact responsive breakpoints.
- [x] **Complete** — Inventory every current Electron renderer surface and map website
  patterns to shell/title/status bars, sidebar/navigation, Explorer/Search, editor/Monaco,
  terminal/output/diagnostics, Observer, Context Tray, Git/diff, Markdown, Settings/auth,
  dialogs/menus, AI review flows, and all empty/loading/error/notification states.
- [x] **Complete** — Add `docs/DESIGN_SYSTEM_PLAN.md` with centralized semantic token
  requirements, component mappings, WCAG contrast measurements/restrictions, responsive
  pane behavior, staged Phases 13B–13D, and a visual QA checklist.
- [x] **Complete** — Keep the phase documentation-only: no desktop UI/CSS/Monaco source,
  web application, `main` branch, behavior, dependency, build output, or completed feature
  is changed.

Verification:

- [x] **Complete** — Source/provenance checks confirm every recorded palette value exists
  in the audited `main` styling files and the locked Tailwind version is 3.4.19.
- [x] **Complete** — WCAG contrast calculations cover primary/secondary/accent/error and
  dark coffee pairs; low-contrast tan/amber/green are explicitly restricted from small text.
- [x] **Complete** — Markdown structure, docs-only changed-file scope, whitespace, branch,
  clean-reference, and staged-diff checks pass before the focused commit.

Known limitations: Phase 13A is a source audit and implementation plan, not a redesign.
The website provides a complete light workspace vocabulary and a dark authentication
showcase, but not a fully specified dark IDE component system. Phase 13B must not invent
missing dark states. Visual parity, responsive interaction, and Monaco token tuning require
implementation and screenshot QA in Phases 13B–13D.

### Phase 13B — Main desktop shell redesign

- [x] **Complete** — Add one renderer theme layer containing the exact website primitives,
  semantic desktop colors, bundled Geist typography, Tailwind spacing, radii, borders,
  shadows, focus rules, and responsive shell geometry.
- [x] **Complete** — Remove legacy black, navy, blue, violet, and purple literals from
  desktop component CSS. The native Electron boot surface mirrors the exact cream
  background through one shared native token.
- [x] **Complete** — Apply the website identity coherently to the root/window, title and
  status bars, activity bar, Explorer/Search, editor tabs and chrome, welcome/recents,
  Observer controls, Context Tray, bottom tools, dialogs, menus, and visible empty,
  hover, selected, active, disabled, and focus states.
- [x] **Complete** — Define and select the `proactive-cream` Monaco theme at every editor
  and diff entry point. Its colors are resolved from CSS variables rather than duplicated
  literals, and no `vs-dark` fallback remains in desktop source.
- [x] **Complete** — Pass the xterm palette from the centralized theme at startup. Its only
  dark surface uses source-approved ink/coffee values, never black, navy, or purple.
- [x] **Complete** — Add pointer and keyboard-operable sidebar, Observer, and bottom-panel
  separators with bounded sizes and responsive 1024px/768px layout behavior.
- [x] **Complete** — Preserve IPC, filesystem, terminal, authentication, AI, database, and
  browser-application behavior; no dependency or `main` website change was required.

Verification:

- [x] **Complete** — Strict desktop TypeScript and Electron production build pass; both
  Geist variable fonts are emitted into the renderer bundle.
- [x] **Complete** — All 160 desktop tests pass with loopback permission, and root tests
  and lint pass.
- [x] **Complete** — A source scan finds no legacy theme literals or `vs-dark` references
  in desktop components; approved color literals live only in the centralized theme layer
  plus the shared native boot-background token.
- [x] **Complete** — Live development and production Electron windows were inspected. The
  cream welcome workspace, Observer, Context Tray, Explorer, editor chrome, and coffee
  terminal form one palette; no visually obvious black, navy, or purple region remains.

Known limitations: Phase 13B establishes the coherent source-exact theme and covers every
currently visible shell state. Phase 13C remains responsible for deliberate component-level
polish and state-by-state visual QA of advanced feature workflows that were not opened in
this phase; Phase 13D retains full breakpoint, contrast, and accessibility acceptance.

### Phase 13C1 — Observer and Context Tray UI redesign

- [x] **Complete** — Replace the generic Observer heading and hidden legacy orb with a
  source-derived bronze/cream emblem, explicit text status, calm section hierarchy, and a
  dedicated scroll region that keeps request controls and the privacy boundary reachable.
- [x] **Complete** — Restyle request mode/provider fields, context summary, Ask, shortcut,
  disabled state, Undo, empty/loading/error/suggestion states, code previews, reasons,
  dismissal, proactive nudges, and usefulness feedback with centralized semantic tokens.
- [x] **Complete** — Preserve the existing separate edit-review Accept/Reject/Regenerate
  workflow and apply the same primary, secondary, disabled, hover, and focus hierarchy to
  its controls without changing checkpoint or rollback behavior.
- [x] **Complete** — Redesign Context Tray hierarchy, count, expansion, browser connection
  status, request usage, empty state, source cards, titles/paths/URLs, previews, stale flags,
  ordering, refresh/keep/truncate, Remove, Clear, and session-local privacy messaging.
- [x] **Complete** — Keep all Observer prompts, provider calls, proactive detection, IPC,
  authentication, filesystem, database, browser pairing, and Context Tray data flow intact.

Verification:

- [x] **Complete** — Strict desktop TypeScript and the Electron production build pass; all
  160 desktop tests pass with loopback permission, including Observer success/error API
  handling, explicit edit acceptance/checkpointing, dismissal, rollback, Context Tray
  validation, reorder, stale, refresh, truncate, clear, and no-automatic-AI guarantees.
- [x] **Complete** — Root suggestion/context harnesses, lint, and Next.js production build
  pass unchanged.
- [x] **Complete** — Live Electron QA verifies the empty and populated Tray, local attach,
  remove, clear, collapse/expand, browser unavailable/off states, bronze keyboard focus,
  scroll containment, and 230px/380px Observer widths without horizontal overflow.
- [x] **Complete** — Computed live colors resolve to exact cream `#faf7f0`, card `#fdfbf6`,
  ink `#2b2118`, ink-soft `#5c4d3d`, sand `#e8dfd0`, bronze `#8a5a34`, and approved ember
  alpha states. The review screenshot is `docs/screenshots/phase-13c1-observer-context-tray.png`.

Known limitation: a live provider request was not sent from the repository workspace during
visual QA because that would transmit active project context to the configured external
provider. Deterministic authenticated client tests cover response/error outcomes, while the
live pass covers the explicit pre-send and local Context Tray interaction boundary.

### Phase 13D — Final UI/UX polish and verification

- [x] **Complete** — Normalized flex/grid minimum sizing, wrapping, dialog bounds, action
  wrapping, and compact-window row limits so long paths, labels, context, code, and empty
  states remain contained at the supported `760 × 560` minimum and at wider panel sizes.
- [x] **Complete** — Added one shared topmost-modal focus manager that traps forward and
  reverse Tab navigation, handles Escape through each dialog's existing dismiss action,
  restores the previously focused control, and gives programmatically focused dialogs the
  approved bronze focus treatment.
- [x] **Complete** — Added missing dialog labels and icon-button accessible names to file
  operations, Context Preview, and documentation-update surfaces without replacing icons or
  changing control colors.
- [x] **Complete** — Converted modern semantic alpha-color syntax to Monaco-compatible
  eight-digit hexadecimal at the editor boundary. This preserves the exact approved palette
  while preventing saturated fallback colors in Git and documentation diffs.
- [x] **Complete** — Suppressed page-level overflow, kept compact Observer content internally
  scrollable, respected reduced-motion for the shared loading spinner, and replaced the stale
  Phase 11A status-bar copy with product-neutral workspace status.

Verification:

- [x] **Passed** — `desktop-ide-foundation` was confirmed before editing; `main` was never
  checked out. The actual Phase 13B theme/token/Monaco/xterm/resizer implementation and Phase
  13C1 Observer/Context Tray implementation were inspected before Phase 13D changes.
- [x] **Passed** — Desktop strict TypeScript/Electron production build and all `164/164`
  desktop tests pass, including focused dialog wrap/entry tests and semantic alpha-color
  serialization tests. Root tests, lint, and Next.js production build pass. Chrome extension
  `11/11` tests, strict TypeScript, Manifest V3 validation, and production build pass.
- [x] **Passed** — Live Electron on macOS logged `contextIsolation=true`,
  `nodeIntegration=false`, and `sandbox=true`. Keyboard-only checks covered visible focus,
  forward/reverse dialog wrapping, Escape dismissal, focus restoration, the command palette,
  tabs, sidebar actions, and Observer controls.
- [x] **Passed** — Live sizes covered approximately `1197 × 661`, `964 × 665`, and the
  supported `762 × 560` window, plus pointer panel resizing. The minimum window kept the
  status bar pinned and scrolled focused Observer controls into view without body overflow.
- [x] **Passed** — A disposable `/tmp/proactive-phase13d-fixture` repository covered long
  nested names, Markdown/code blocks, an empty file, editor save, project search, terminal
  input/output, JavaScript Run success, diagnostics/output presentation, Git status/diff,
  Markdown preview, Settings, Context Tray add/remove, and the Observer Context Preview.
- [ ] **Not run** — No live provider request was sent because it would transmit workspace
  context. The explicit local pre-send path was exercised and authenticated response/error
  behavior remains covered by deterministic tests.
- [ ] **Not run** — The complete Chrome pairing/Add/Reject/restart/revoke acceptance flow
  remains tracked under Phase 11B2; this pass verified its disabled/unavailable desktop state.
- [ ] **Not run** — Windows-specific rendering and keyboard behavior were not tested. Phase
  13D visual verification was performed on macOS only.

Screenshots:

- `docs/screenshots/phase-13d-main-workspace.jpg`
- `docs/screenshots/phase-13d-settings.jpg`
- `docs/screenshots/phase-13d-git-diff.jpg`
- `docs/screenshots/phase-13d-minimum-window.jpg`

Unresolved palette conflict (reported, not changed): the approved green `#7bb662` and amber
status hues do not meet WCAG AA for small text on cream/card backgrounds (approximately
`2.25:1` and `1.72:1`). Existing adjacent labels/icons preserve meaning, but any future use
as standalone small text needs explicit design approval for a token adjustment. This is an
optional future color review; Phase 13D makes no icon replacement or approved color change.

## Architecture decisions

1. **Keep two applications in one repository.** The existing Next.js application
   remains at the repository root. Electron lives in `apps/desktop` and has its
   own package, TypeScript configuration, scripts, and build output.
2. **Use three Electron trust boundaries.** The main process owns privileged OS
   operations, preload exposes a narrow typed bridge, and the renderer remains an
   unprivileged React application.
3. **Keep local projects local.** The selected desktop folder is the source of
   truth. Supabase's `files` table must not automatically overwrite local files.
4. **Reuse pure logic, not server boundaries.** File-language mapping and manual
   request helpers can be shared. Next.js route handlers and server-only modules
   remain in the web/server application.
5. **Keep AI and encryption server-side.** The desktop client calls an authenticated
   backend. It never contains the service-role key, encryption secret, or decrypted
   provider keys.
6. **Defer native terminal dependencies.** Establish filesystem and editor behavior
   before introducing `node-pty` and platform-specific packaging complexity.
7. **Preserve source formats.** Markdown remains Markdown. Rich-text HTML is used
   only for an explicitly separate document format.
8. **Prefer explicit user actions.** Opening folders, running commands, sending AI
   context, and destructive file operations require visible user intent.
9. **Use an isolated Electron Vite package.** Phase 1 uses a local package and
   lockfile under `apps/desktop`; the root web package and commands are unchanged.
10. **Expose relative workspace entries only.** Phase 2A retains the canonical root
    in main-process memory and gives the renderer names, relative paths, entry types,
    and safe-symlink indicators only.
11. **Load the tree on demand.** The main process lists one directory level per IPC
    request; the renderer requests children only when a folder is expanded.
12. **Read only allowlisted UTF-8 files.** Phase 2B permits a fixed extension set,
    caps files at 2 MiB, rejects NUL bytes and invalid UTF-8, and returns content
    through one renderer-bound method without exposing absolute paths.
13. **Overwrite only version-matched existing files.** Phase 2C saves through a
    single typed IPC operation. The main process revalidates the canonical path,
    extension, regular-file status, UTF-8 byte limit, and modification timestamp,
    then opens with `r+` so a save cannot create a missing file.
14. **Bundle Monaco locally.** Monaco and its workers live only in the isolated
    desktop package and are loaded from the application bundle, not a CDN.
15. **Use explicit, non-recursive workspace mutations.** Phase 3A adds three typed
    renderer capabilities only: create one entry, rename one entry, and delete one
    file or empty directory. The main process validates every name and path again.
16. **Keep dirty buffers independent of paths.** Open tabs own their in-memory
    drafts. Renaming a file or parent directory rewrites the affected tab paths but
    preserves drafts, saved baselines, and modification timestamps.
17. **Watch only in the main process.** Phase 3B uses one watcher for the currently
    authorized canonical workspace root, emits only normalized relative paths,
    batches rapid activity, and never exposes a filesystem watcher to preload or
    renderer code.
18. **Treat disk changes as untrusted concurrent edits.** Clean buffers may reload
    after the existing secure read checks pass. Dirty buffers retain their local
    draft until the user explicitly chooses the external version or keeps the
    local version. Deletion never removes an open buffer automatically.
19. **Own pseudoterminals in Electron main.** Phase 4A uses `node-pty` only in the
    main process and xterm.js only in the sandboxed renderer. One session is tied
    to the authorized workspace and renderer, and only typed input/output/resize/
    close messages cross preload.
20. **Rebuild native modules for Electron.** `node-pty` remains external to the
    Electron Vite main bundle and is rebuilt against the installed Electron ABI
    through the desktop package's postinstall and `rebuild:native` scripts.
21. **Run files through an allowlisted argument map.** Phase 4B accepts only one
    validated workspace-relative file path and maps `.py` to Python and `.js`/`.mjs`
    to Node. Electron main spawns the interpreter with an argument array,
    `shell: false`, the canonical workspace root as `cwd`, and a filtered
    environment. TypeScript and all other languages remain non-runnable.
22. **Keep desktop auth tokens in Electron main.** Phase 5A uses the public Supabase
    URL and publishable/anon key only. Password calls, refresh rotation, and session
    validation happen in main; renderer IPC receives only user ID, display name,
    email, and public auth state. Access/refresh tokens are encrypted asynchronously
    with Electron `safeStorage` and stored with owner-only permissions. Linux's
    insecure `basic_text` fallback is rejected.
23. **Use a dual request-scoped API authentication boundary.** Phase 5B preserves
    cookie-backed web requests and accepts one strictly parsed desktop bearer token.
    The Next.js server validates the token with Supabase Auth `getUser(token)` and
    creates a new public-key client carrying that token for RLS-scoped database work.
24. **Send only explicit, bounded Observer context.** The renderer constructs one
    selected-code, cursor-neighborhood, or diagnostic request; Electron main validates
    and strips it to the allowlisted contract. The request contains a basename and
    detected language, never an absolute path, workspace snapshot, terminal history,
    `.env`/credential file, or unrelated project file. Active-file content is allowed
    only for Generate Tests and is capped at 50,000 characters.
25. **Keep Observer transport and tokens in Electron main.** A purpose-specific IPC
    method obtains the current refreshed access token internally and sends the HTTPS
    request. The renderer receives only the suggestion or a safe error. Provider-key
    lookup, decryption, provider calls, and service-role access remain in Next.js.
26. **Make every AI and edit action explicit.** Ask Observer is triggered only by the
    button or Ctrl/Cmd+Enter. A result may be copied, dismissed, or inserted at the
    current cursor only while its original file is still active and available. Insert
    uses Monaco editor operations with undo support and records an accepted outcome;
    dismiss clears immediately and records a dismissed outcome.
27. **Keep Markdown source authoritative and rendering inert.** Phase 6 detects only
    `.md` and `.mdx` as documentation files; `.txt` remains plain text. Monaco owns
    the editable draft in every mode. Preview uses `react-markdown` with `remark-gfm`,
    `skipHtml`, no raw-HTML/MDX execution plugin, no remote image rendering, and an
    allowlist for link schemes. MDX is previewed as inert Markdown, never evaluated.
28. **Scope documentation AI to one active file.** Documentation Observer requests
    reuse the validated desktop bearer boundary and contain a basename plus selected
    text, nearby text, or—only for Explain, Summarize, and Generate README section—a
    user-triggered active document capped at 50,000 characters. No related source,
    documentation, workspace snapshot, or comparison is gathered automatically.
29. **Search through a bounded subprocess, never renderer filesystem APIs.** Phase 7A
    pins `@vscode/ripgrep`, spawns its absolute binary from Electron main with an
    argument array, `shell: false`, no config file, a minimal environment, the
    authorized canonical root as `cwd`, and no symlink following. Main validates the
    request, parses JSON output, revalidates every relative supported-file result,
    batches matches, enforces a 10–2,000 result limit, and kills previous/cancelled
    searches. Preload exposes only Search, Cancel, and typed result-batch operations.
30. **Layer project ignores with mandatory privacy exclusions.** Ripgrep respects the
    workspace `.gitignore`, skips binary and files over 1 MiB, and receives mandatory
    case-insensitive exclusions for `.git`, dependencies/build output, coverage,
    `.env*`, credential/secret files, and private-key formats. Result parsing repeats
    directory, supported-extension, secret-basename, include/exclude, and root-relative
    checks before a path reaches the renderer.
31. **Persist only bounded recent-workspace metadata in app data.** Phase 7B stores a
    versioned, owner-only JSON file under Electron `userData`, outside the repository
    and browser storage. Each of at most 10 entries contains only a canonical path,
    display name, and last-opened timestamp. Reopening deduplicates and promotes the
    project; no file content, session/token, terminal, diagnostic, or AI data is stored.
32. **Keep recent paths behind the main-process authorization boundary.** The renderer
    receives a SHA-256-derived opaque identifier, folder name, shortened two-segment
    display path, and timestamp—not the canonical path. Reopen/remove requests use the
    opaque identifier. Main resolves it against stored metadata, rejects missing,
    non-directory, unlisted, or replaced-symlink targets, then reuses the normal
    workspace activation, watcher, terminal, runner, and search lifecycle. Startup
    intentionally shows Welcome; automatic last-workspace reopening is deferred.
33. **Use one closed, typed command registry.** Phase 7C defines stable command IDs,
    names, optional shortcut labels, centralized disabled-reason functions, and typed
    handlers as the sole palette source. Registry construction rejects duplicate IDs
    and conflicting shortcut labels. Fuzzy search only selects registered entries;
    there is no command text evaluation, dynamic import, shell parsing, or arbitrary
    IPC dispatch.
34. **Dispatch actions to their existing owners.** App-level save/run/workspace actions
    reuse existing callbacks. Typed request tokens ask Explorer, BottomPanel, and
    Observer to invoke their existing New/Open, terminal/view, and focus behavior.
    Close Workspace is the only added preload method and calls the existing authenticated
    main-process clear lifecycle. Ctrl/Cmd+Shift+P is intentionally global, while
    save/run shortcuts yield to xterm so terminal control input remains intact.
35. **Separate device settings from user-owned cloud preferences.** Phase 7D writes a
    versioned, allowlisted device schema and bounded open-tab relative paths to owner-only
    files under Electron `userData`; neither uses browser localStorage. Theme, Monaco,
    startup, deletion, tab restoration, and custom context exclusions remain local.
    Provider/model, manual Observer behavior, and history/privacy choices live in
    `desktop_user_settings`, keyed by the authenticated Supabase user.
36. **Treat provider keys as write-only secrets.** The desktop renderer submits a masked
    input through a narrow main-process bearer client. Next.js validates the session,
    optionally verifies the key directly with the selected provider, encrypts it, and
    returns only success/status metadata. Provider key lookup/decryption, service-role
    access, server environment availability, and all model calls remain server-only.
37. **Enforce privacy twice.** The desktop typed schema permanently blocks `.env`,
    credential, token, and private-key formats before building Observer context and
    applies user-defined relative exclusions plus a 1,000–50,000 character bound.
    The existing Next.js `/api/suggest` sensitive-basename validation remains a second
    server-side boundary. Complete-file context can require an explicit confirmation.
38. **Keep Git execution fixed and main-process-only.** Phase 7E invokes the user's
    PATH-resolved Git executable with `spawn`, `shell: false`, the validated workspace
    root as `cwd`, a filtered non-interactive environment, and compile-time argument
    arrays for porcelain-v2 `status` and `cat-file` only. Renderer input cannot select
    a binary, subcommand, revision, option, working directory, or arbitrary argument.
39. **Authorize diffs from the latest bounded status snapshot.** Main accepts a
    normalized relative path only when it appeared in the latest displayed status
    result, then rechecks the current file lexically and canonically and refuses
    symlinks. Original text comes from `HEAD:<path>`; current text comes from the
    validated worktree. Both sides are capped at 2 MiB and invalid UTF-8/NUL content
    is reported as binary rather than decoded.
40. **Make Source Control observational.** Status is capped at 500 changed files,
    command output and stderr are bounded, operations time out and can be cancelled,
    and the UI remains independent of normal editor tabs. This phase provides no Git
    mutation, remote, credential, terminal-command, or AI-review capability.
41. **Build context locally from deterministic evidence.** Phase 8 performs no cloud
    indexing and keeps no content index. Electron main evaluates the active draft,
    relative imports/requires, nearby test filenames, known project configuration,
    and optional workspace rules. Candidate metadata is bounded and invalidated on
    editor-content or workspace changes; files are read only when selected for the
    current manual request.
42. **Make context selection explainable and budget-first.** Every item carries a
    fixed priority, provenance, relative source and line range, human reason, optional
    relevance score, approximate character/token cost, and truncation/redaction state.
    Higher priorities consume the configured total first; lower priorities are
    deterministically truncated or recorded as omitted rather than silently exceeding it.
43. **Authorize the reviewed package at both trust boundaries.** Main prepares and
    retains one workspace-scoped package, accepts only unchanged prepared items with
    optional removals, and rejects forged, stale, or newly secret-bearing content.
    Next.js repeats schema/cost/size/secret validation, separates user intent from
    delimited untrusted project data, and persists only package metadata—not raw input.
44. **Bind every AI edit to one trusted in-memory base.** Phase 9A hashes the active
    Monaco draft before sending. The model may echo only that main-process-selected
    relative path and SHA-256. Server and desktop validate the same strict single-edit
    shape; application code rechecks the live hash and exact expected range text before
    applying, with no silent rebase.
45. **Review first and mutate only the editor draft.** A read-only Monaco diff is the
    only path from editable Observer output to acceptance. Reject, Regenerate, and
    Escape leave the tab unchanged. Accept updates one existing draft only after a
    checkpoint succeeds, blocks auto-save for that draft, and starts no process, test,
    terminal, Git, file creation, or disk write.
46. **Keep rollback code local and hash-gated.** Owner-only checkpoints live beneath
    Electron `userData`, outside the workspace and Supabase. Main binds requests to the
    authenticated renderer and current workspace ID, enforces path/content/retention
    limits, and restores only when the current in-memory hash matches the applied hash.

### Desktop-to-backend authentication boundary

Phase 5B keeps the HTTP request in Electron main behind a purpose-specific Ask
Observer IPC method. Main obtains the current refreshed access token and
sends it as `Authorization: Bearer <token>` to the deployed Next.js API. The token
must never be returned to renderer JavaScript, stored in localStorage, or logged.

The server-only request-auth helper now:

1. preserves the current cookie path unchanged for web requests;
2. accepts exactly one bearer token for desktop requests;
3. validates that token with Supabase Auth `getUser(token)`, not by trusting decoded
   JWT fields alone;
4. creates a request-scoped Supabase client with the public key and bearer header so
   database reads/writes continue to run as that user under existing RLS; and
5. uses the service-role client only after identity validation for the existing
   server-only encrypted provider-key lookup.

No user-scoped Supabase client is cached across requests. Mixed or invalid auth
headers return 401, and authorization data is not logged.

## Security rules

- `contextIsolation` must remain enabled.
- `nodeIntegration` must remain disabled.
- Renderer sandboxing should remain enabled unless a documented, reviewed platform
  limitation requires otherwise.
- Never expose `ipcRenderer`, `fs`, `child_process`, `shell`, or arbitrary command
  execution directly to renderer code.
- Command Palette may dispatch only compile-time registered command IDs to typed
  in-renderer handlers. Never interpret the search query as code, a path, IPC channel,
  shell command, terminal input, or AI prompt.
- Define and validate every IPC request and response with strict TypeScript types
  and runtime validation where input crosses a trust boundary.
- Resolve and validate filesystem paths in the main process. Reject traversal and
  symlink escapes outside the user-selected project root.
- Canonicalize both the selected root and every requested target with `realpath`.
  Broken symlinks and symlinks resolving outside the root must not be returned.
- Keep absolute local paths out of renderer responses and visible error messages.
  Recent-project responses use only an opaque identifier and a shortened display path;
  the persisted canonical path remains in Electron main's app-data file.
- Run global search only from the authenticated window and currently authorized
  canonical workspace. Use a fixed binary and argument array, never a shell command;
  disable ripgrep configuration/environment inheritance, do not follow symlinks, and
  validate every emitted path before forwarding a bounded batch.
- Search only supported extensions and exclude `.git`, `node_modules`, `.next`, `dist`,
  `build`, `coverage`, binary/large files, `.env*`, credentials, secrets, and private
  keys even when user include patterns are broad.
- Run Git only in Electron main against the currently authorized workspace with fixed
  read-only argument arrays, `shell: false`, a filtered non-interactive environment,
  timeout/cancellation, output limits, and porcelain output. Never expose a general
  Git command, revision, option, process, filesystem path, credential, or remote action
  to renderer code.
- Limit directory listing size and ignore generated dependency/build directories.
- Permit file content reads only for the documented extension allowlist, require a
  regular file, cap reads at 2 MiB before and after loading, and reject NUL bytes or
  invalid UTF-8.
- Permit writes only to an existing supported regular file inside the selected
  root. Enforce the 2 MiB limit, reject stale modification timestamps, and never
  expose a general-purpose write, create, rename, or delete API.
- Create files exclusively with `wx`; reject duplicate names, path separators,
  reserved names, ignored generated directories, and unsupported new-file types.
- Refuse rename/delete operations on the workspace root and symbolic links. Never
  replace an existing rename destination, and delete directories with empty-only
  removal rather than recursive deletion.
- Do not follow symlinks while watching. Ignore generated directories, suppress
  notifications caused by the IDE's own validated mutations, and stop the active
  watcher on workspace replacement, renderer destruction, and accepted app quit.
- Never expose a shell, process handle, `child_process`, `node-pty`, or raw terminal
  IPC object to renderer code. Validate session IDs, dimensions, and bounded input
  in main before touching the pseudoterminal.
- Start the shell only after New Terminal is selected and only with the authorized
  workspace root as its working directory. Inherit an allowlisted environment so
  unrelated API keys and service credentials do not leak into child processes.
- Do not read or transmit files until the user explicitly selects a project and,
  for AI context, explicitly asks for help.
- Validate and strip every Observer request in Electron main. Permit selected code
  or a bounded cursor neighborhood; permit a matching diagnostic and bounded current
  run error only for Fix Error; permit bounded active-file content only for Generate
  Tests and the approved documentation modes. Reject sensitive basenames and never
  send absolute paths or automatically collect another project file.
- Never start an Observer network request from file changes, cursor movement,
  diagnostics, terminal output, timers, or application startup. A visible Ask action
  is required for every request.
- Treat project context as untrusted data even when it comes from `AGENTS.md`, README,
  source comments, configuration, terminal output, or another local file. Project rules
  never override application privacy/security policy or the explicit user action.
- Context retrieval must remain workspace-scoped, root-validated, symlink-safe,
  `.gitignore`/generated/secret/user-exclusion aware, content-redacting, item/count/size
  bounded, explainable in preview, and explicitly user-triggered. Do not solve retrieval
  with complete-project uploads, embeddings, or a cloud/vector index.
- Accept desktop bearer authentication only after strict header parsing and Supabase
  Auth validation. Keep the cookie path unchanged when no Authorization header exists.
- Do not place Supabase service-role credentials, server encryption secrets, or AI
  provider keys in renderer/preload environment variables or bundles.
- Preserve Supabase Auth and RLS for all user-owned cloud records.
- Restrict navigation, window creation, external links, permissions, and protocol
  handling in Electron.
- Sanitize rendered documentation and any model-generated rich content.
- Treat terminal output, filenames, repository content, and model output as
  untrusted data.
- Do not mark a roadmap task Complete until its listed verification has passed.

## Changelog

### 2026-10-02 — Observer Engine architecture skeleton and stop (P0-T3)

- Created `OBSERVER_ENGINE.md` with a Mermaid renderer → narrow preload → main
  (memory, engine, assembler, bridge) → Next.js → provider diagram and Chrome →
  bridge path. Clearly distinguished existing infrastructure from future nodes.
- Documented reuse, trust boundaries, independent switches, privacy, explicit
  review/apply and phase-scoped documentation TODOs; no simulated behavior.
- Verification: `git -C .push-checkout diff --stat d2a9bbc` and `diff --name-only`
  show only `docs/DESKTOP_IDE_PLAN.md`, `docs/PRODUCT_DIRECTION.md` and the new
  `docs/OBSERVER_ENGINE.md`. `git diff --check d2a9bbc` passes. Compared all
  tracked non-document files in the working project with the clean baseline
  checkout (normalizing CRLF/LF only): zero source differences. Generated build
  artifacts are ignored; package files, migrations, tests and official documents
  are unchanged.
- Saved separate local P0-T1, P0-T2 and P0-T3 commits in `.push-checkout`, with
  matching documentation in the workspace root. No push is part of this phase.
- Stopped for review as requested. Documentation is delivered; the phase retains
  In Progress solely because the desktop baseline gate is not green. No E1 work
  was started and no later-phase runtime behavior was introduced.

### 2026-10-02 — Observer Engine direction and roadmap (P0-T2)

- Added a dated PRODUCT_DIRECTION amendment while preserving the earlier text:
  primary opt-in engine, visible independent switches, content-change debounce,
  second-resolution delta timestamps, prohibited behavioral surveillance,
  revocable allowlisted Chrome capture and unchanged consent/privacy boundaries.
- Added E1–E7 roadmap rows and an explicitly unspecified E8 row. Recorded owner
  and supervisor decisions, timer-range deviation and native-packaging gap.
- The amendment does not claim supervisor approval or change official documents.
  Later phases remain Not Started; Phase 0 retains In Progress until the failed
  baseline test gate is resolved.

### 2026-10-02 — Observer Engine Phase 0 baseline audit (P0-T1)

- Read all of `OBSERVER_ENGINE_SPEC.md` v1.1, including §0, the independent
  switches in §7.0 and the stop-after-each-phase requirement.
- Baseline is commit `d2a9bbc` on `desktop-ide-foundation`. The workspace root
  is an extracted folder without `.git`; the existing `.push-checkout` holds
  the branch history. Commands below ran against the working project in the
  workspace root, on Windows/PowerShell, Node `v24.13.0`, npm `11.6.2`.
- Audit commands completed; the required desktop test gate remains failed.
  No source changes, test skips, privacy relaxations or machine configuration
  changes were introduced to make the baseline appear green.

| Working directory | Command (PowerShell uses `npm.cmd`) | Result |
|---|---|---|
| `apps/desktop` | `npm run typecheck` | PASS, exit 0 |
| `apps/desktop` | `npm test` | FAIL, exit 1: 255 tests, 250 pass, 4 fail, 1 existing skip |
| repository root | `npm run lint` | PASS, exit 0; no ESLint warnings/errors |
| repository root | `npm run build` | PASS, exit 0; all 14 static pages generated; warnings below |
| `apps/chrome-extension` | `npm test` | PASS, exit 0; 11/11 tests |
| `apps/chrome-extension` | `npm run build` | PASS, exit 0; Manifest V3 validation passed |

Initial sandbox desktop/extension tests and root build failed with `spawn EPERM`.
Approved retries outside that sandbox allowed subprocesses to run. The desktop
retry still failed these existing tests:

- `main/fix-code.test.ts:78`: guarded `main.py` runner assertion failed because
  the Windows Python command resolves to the Microsoft Store alias, not an
  available Python runtime.
- `main/multi-file-change.test.ts:52`: secret/binary/symbolic-link test could not
  create its symlink (`EPERM`).
- `main/project-context.test.ts:97` and `:161`: escaping-symlink and stale-tray
  tests likewise failed at symlink creation (`EPERM`).
- Existing skipped test: Git process timeout/cancellation fixture uses a POSIX
  shebang. This task did not add that skip.

Full baseline logs are local `%TEMP%/proactive-phase0-*.log`; authoritative retry
logs are `proactive-phase0-desktop-tests-retry.log`,
`proactive-phase0-extension-tests-retry.log` and
`proactive-phase0-root-build-retry.log`. Other successful logs are
`proactive-phase0-desktop-typecheck.log`, `proactive-phase0-root-lint.log` and
`proactive-phase0-extension-build.log`. Logs are not committed.

Build warnings: webpack large-string cache serialization and Supabase's
`process.version` use in the Edge Runtime. Desktop tests also emit Node's
existing module-type warnings. These do not explain away the four test failures.
Before claiming a green baseline, provide an actual Python runtime and Windows
symlink creation privileges (Developer Mode or an appropriately privileged test
environment), then rerun the desktop suite without weakening its assertions.

### 2026-09-04 — Phase 13D final UI/UX polish complete

- Added responsive containment for compact windows, long paths and code, dialogs, action
  rows, the editor, terminal/output, Observer, diagnostics, diffs, and empty states.
- Added shared modal keyboard containment, Escape handling, focus restoration, missing
  accessible names, reduced-motion spinner behavior, and focused accessibility regression
  tests without changing product behavior.
- Preserved the approved coffee-and-cream design while correcting Monaco's parsing of its
  semantic alpha colors, completed macOS Electron smoke checks with a disposable fixture,
  and captured the four review screenshots listed in the Phase 13D evidence.

### 2026-09-03 — Phase 13C1 Observer and Context Tray redesign complete

- Rebuilt the Observer presentation around a source-exact bronze emblem, explicit status,
  compact request hierarchy, resilient scroll region, clearer result states, and consistent
  primary/secondary/destructive/focus treatment.
- Rebuilt the Context Tray presentation with a clear item count, collapsible source area,
  labeled browser status, request usage, wrapping previews and URLs, source metadata, and
  distinct local remove/clear controls while preserving its session-only behavior.
- Verified the renderer in live Electron at narrow and wide panel widths, exercised local
  add/remove/clear and collapse/expand behavior, and saved the populated-state screenshot.

### 2026-09-03 — Phase 13B coffee-and-cream desktop shell complete

- Added centralized source-exact CSS primitives and semantics, bundled Geist fonts, a
  CSS-token-driven Monaco theme, a CSS-token-driven xterm coffee theme, and an exact cream
  native window fallback.
- Replaced the old renderer color literals and corrected the root, shell, welcome screen,
  Observer, Context Tray, Explorer, tabs, editor chrome, terminal/output, status, controls,
  menus, dialogs, and interaction states without changing their behavior.
- Added bounded pointer and keyboard pane resizing and kept the editor usable at the
  Electron minimum window size. Verified the production UI by screenshot.

### 2026-09-03 — Phase 13A desktop visual audit and planning complete

- Audited the original `main` website through read-only Git object commands while staying
  on `desktop-ide-foundation`; no branch switch or website working-tree change occurred.
- Added `docs/DESIGN_SYSTEM_PLAN.md` with exact source-linked colors, typography, spacing,
  radii, borders, shadows, interaction states, semantic tokens, full desktop surface
  mapping, accessibility/contrast constraints, responsive behavior, staged implementation,
  and visual QA requirements.
- Kept all application source and behavior unchanged. Phase 13B is deliberately deferred
  until explicit approval.

### 2026-09-03 — Phase 12B safe documentation update suggestions complete

Architecture and behavior:

- Added a bounded structured Markdown-edit contract, authenticated provider route,
  metadata-only history, and dual server/desktop validation.
- Added preparation, explicit Context Tray selection, diff/rendered review, editable draft,
  stale-context recovery, checkpointed safe write, rollback, and optional post-apply actions.
- Extended the trusted workspace bridge with a root-confined writable-file preflight and
  added a device-local maximum-documents setting defaulting to one. No migration was needed.

Verification:

- 160/160 desktop tests, strict TypeScript, and Electron production build pass.
- Root backend harnesses, lint, and Next.js production build pass.
- Chrome extension 11/11 tests, strict TypeScript, Manifest V3 validation, and production
  build pass unchanged.
- Generated-output secret, request/analytics privacy, absolute-path, and whitespace scans pass.

### 2026-09-03 — Phase 12A local documentation relationship detection complete

Architecture and behavior:

- Added the pure relationship engine and focused tests in
  `apps/desktop/src/shared/documentation-impact.ts` and
  `apps/desktop/src/main/documentation-impact.test.ts`.
- Added `DocumentationImpactPanel.tsx`, App/sidebar/session-change wiring, restrained
  existing-theme styles, and device-local Settings controls/defaults/decision validation.
- Extended Context Tray, Project Context, and the server's strict untrusted-context schema
  to preserve `documentation_relationship` provenance. No AI route, provider, file-write,
  command, Supabase schema, migration, analytics, or cloud index was added.

Verification:

- 153/153 desktop tests, desktop strict TypeScript, and Electron production build pass.
- Root backend harnesses, lint, and Next.js production build pass.
- The unchanged Chrome extension passes 11/11 tests, strict TypeScript, manifest
  validation, and production build.
- Privacy/source, generated credential/private-key, and whitespace scans pass.

### 2026-09-02 — Phase 11B2 secure Chrome handoff verification in progress

Architecture and behavior:

- Replaced the toolbar/context-menu capture interaction with per-site activation and a
  closed-Shadow-DOM inline P control next to selected page text. Clicking it opens an
  editable preview; Send to IDE is the only transfer action.
- Added a user-started, short-lived, origin-bound pairing flow between the extension and
  Electron Settings, with OS-encrypted persistent credentials, authenticated health,
  revocation, Disconnect/Forget, and a completely disabled state.
- Added a bounded incoming review queue. `web_research` becomes removable local tray
  context only after explicit desktop acceptance and then follows the existing untrusted
  Context Preview and backend validation path.

Security and privacy:

- Host access is optional and granted per origin. No static content script, browsing
  history, full-page capture, cloud sync, native messaging, or background AI was added.
- The loopback bridge rejects non-extension origins, missing/revoked/wrong tokens,
  malformed or old payloads, altered hashes, duplicate/idempotent transfers, oversized
  bodies, rate/queue excess, protocol mismatch, and sends without an authenticated open
  desktop workspace.
- URL credentials are rejected; query and fragment data are dropped before attachment;
  existing content-secret redaction runs before renderer delivery.

Verification:

- Extension focused tests and strict TypeScript pass. Full production builds, desktop
  loopback tests, root regressions, and live unpacked Chrome/Electron acceptance remain
  in progress; this phase is not Complete until all of them pass.

### 2026-09-02 — Phase 11B1 Chrome selected-text preview complete

Architecture and behavior:

- Added a standalone Chrome Manifest V3 package that injects one bounded selection
  reader only after an explicit action on the active normal web tab. It never reads
  page HTML, complete-page text, browsing history, background tabs, or form fields.
- Added toolbar and context-menu capture plus a plain-text preview for safe source
  metadata, editing/trimming, Refresh, Clear, and Cancel. The Send control is disabled
  and explains that desktop connectivity is deferred to Phase 11B2.
- Added a strict, versioned, hash-backed contract designed to map later to the Context
  Tray's reserved `web_research` type without implementing that mapping or transport.

Changed files:

- Added `apps/chrome-extension` with the manifest, popup assets, background worker,
  selection/contract/storage modules, local package/lockfile, build scripts, README,
  and 13 focused tests.
- Updated only this living plan outside the extension package. Electron, Next.js,
  Supabase, Observer detection, AI providers, and existing UI source were unchanged.

Security, privacy, and storage decisions:

- Permissions are exactly `activeTab`, `scripting`, `storage`, and `contextMenus`; no
  host pattern or broad browser-data permission exists. There is no fetch/socket,
  native messaging, local server, backend, cloud, Supabase, auth, or AI code path.
- Captures accept HTTP/HTTPS URLs without embedded credentials, normalize CRLF, remove
  unsafe controls, cap text at 10,000 characters, and render with `textContent`/`value`
  only. Form, editable, password, empty, malformed, internal, and inactive contexts fail.
- `chrome.storage.local` contains at most one pending typed item and removes invalid,
  future-dated, or older-than-30-minute data when read. Clear and Cancel delete it now.

Verification:

- Extension tests: 13/13 passed. Strict TypeScript, production build, and Manifest V3
  validation passed; dependency audit reported zero vulnerabilities.
- Desktop regression: 140/140 tests, strict TypeScript, and Electron build passed.
- Web regression: root backend harnesses, lint, and Next.js production build passed.
- Static source/build scans confirmed text-only rendering, minimal permissions, no
  transfer API, and no credential/private-key-shaped values. A live unpacked-extension
  smoke test remains an environment/user-confirmed Chrome-profile action.

### 2026-09-02 — Phase 11A privacy-safe Observer Context Tray complete

Architecture and behavior:

- Added a strict versioned Context Tray item contract with random local IDs, implemented
  and reserved types, safe display metadata, relative source/range, sanitized snapshot,
  SHA-256 content/source hashes, timestamps, cost estimates, flags, provenance, and reason.
- Added a collapsible Observer tray and explicit attachment controls in Monaco/Markdown,
  Explorer, run diagnostics, Output, terminal selection, controlled failures, and the
  centralized Command Palette. Complete files show a preview/cost confirmation first.
- Added exact duplicate suppression, explicit overlap confirmation, reordering, removal,
  clearing, truncation, budget refusal, and stale Refresh/Keep Original/Remove actions.
- Extended the existing main-process Project Context Engine instead of adding a new IPC
  or upload path. User items are main-validated, ordered ahead of automatic retrieval,
  never silently dropped, and authorization-bound to the exact final Context Preview.
- Manual Ask, proactive Investigate/Explain/Suggest Fix, and approved AI change planning
  use the same tray-aware preparation. Adding an item cannot call AI or execute a command.

Changed files:

- Added desktop shared `context-tray` model/helpers, focused tests, and renderer Context
  Tray UI. Updated App, Observer, editor/Explorer/Output actions, preview, commands, styles,
  and the desktop test script.
- Updated the main Observer authorization and Project Context Engine/tests plus shared
  context/Observer contracts for attachment validation, priority, integrity, and staleness.
- Extended only the Next.js server Project Context schema/metadata formatter and backend
  harness. Existing web UI, cookie authentication, providers, and routes remain compatible.

Security, privacy, persistence, and priority decisions:

- Priority is explicit request/action, selected/error tray items, other tray items,
  automatic current symbol/nearby code, deterministic related files, then optional docs.
  Tray order is stable within its priority. If tray data exceeds the safe budget, preview
  preparation names the offending item and requires remove/truncate/settings action.
- `.env` variants, credential/token/cloud-secret files, private keys/certificates,
  binaries, exclusions, traversal, external symlinks, and unavailable paths remain blocked.
  Keys, tokens, passwords, private-key blocks, connection strings, and session secrets are
  redacted on attachment and checked again before send and on the server.
- File snapshots retain hashes and are never silently refreshed. Editor, watcher, rename,
  deletion, and pre-preview checks mark stale/unavailable state. Unresolved state cannot send.
- Contents are React session state only and clear on workspace replacement/close. Phase 11A
  deliberately does not implement optional reference restoration, cloud sync, or export.
- Supabase suggestion metadata receives item type, character count, automatic/manual
  provenance, totals, and flags only—never item content, relative paths, hashes, titles,
  raw diagnostics/output, or prompts. No migration or schema change was needed.

Verification:

- `npm --prefix apps/desktop test` — 140/140 tests passed.
- `npm --prefix apps/desktop run typecheck` and `npm --prefix apps/desktop run build`
  — strict TypeScript and Electron production bundles passed.
- `npm test`, `npm run lint`, and `npm run build` — backend privacy/schema harnesses,
  lint, and Next.js production build passed.
- Desktop output scan found no credential-shaped provider key, cloud key, or private-key
  block. Context Tray source scan found no localStorage, app-data, repository, Supabase,
  analytics, or cloud persistence path.

Known limitations:

- Tray contents intentionally do not survive workspace close or application restart;
  optional safe-reference restoration is deferred.
- Symbol and Markdown-section extraction is deterministic and language-bounded rather
  than a full language-server symbol graph.
- Failed test/build attachment is available for the existing controlled verification
  workflow only; arbitrary terminal history is never captured.
- `web_research` is reserved in types but cannot be created, previewed, or sent until
  Phase 11B defines the Chrome Research Context Extension trust boundary.

### 2026-09-01 — Phase 10B proactive evaluation and tuning complete

Architecture and behavior:

- Added a typed version-2 proactive-insights contract and main-process store. Events are
  recorded through a narrow authenticated-window IPC bridge, serialized to avoid lost
  lifecycle updates, bounded to 5,000 events/200 sessions, filtered by configurable
  7–365 day retention, and written atomically with owner-only permissions.
- Added eligible/shown/action/usefulness/resolution lifecycle recording for Phase 10A
  events and the repeated-objective-failure evaluation category. The renderer maps
  ephemeral detector IDs to random event UUIDs and never persists workspace signatures.
- Added Observer Insights to Settings with aggregate and detector metrics, optional
  usefulness prompts, Low/Balanced/High presets, advanced detector tuning, local mutes,
  conservative recommendations, retention controls, and destructive-action confirms.
- Added opt-in FYP Evaluation Mode with pseudonymous sessions, preview, and explicit
  JSON/CSV exports. There is no automatic upload, telemetry endpoint, or cloud sync.

Changed files:

- Added shared proactive-insights contracts/calculation/export logic, main-process
  storage/IPC, focused tests, and the Observer Insights Settings component.
- Updated desktop main registration, preload/global allowlists, renderer App/Observer/
  Settings integration and styles, proactive detector settings, versioned local settings,
  settings cleanup behavior, the desktop test script, and this roadmap.
- The Next.js application, Supabase schema, and existing official FYP documents were
  not modified.

Security, privacy, and measurement decisions:

- Persisted events accept an exact metadata-only schema. They cannot contain source or
  selected code, filenames/paths, raw diagnostics, terminal output, prompts/responses,
  model/provider details, keys/tokens, keystrokes, cursor activity, or user identity.
- Metrics count unique normalized lifecycle records. Action/dismiss rates use shown
  nudges; usefulness uses Yes/No only with Skip separate; timing uses valid monotonic
  lifecycle pairs; resolution is reported as subsequent state, not claimed causation.
- Low, Balanced, and High adjust only bounded deterministic thresholds, cooldowns, and
  per-detector hourly caps. Recommendations require sufficient evidence, never increase
  intervention, never apply automatically, and can be permanently dismissed.
- `contextIsolation: true`, `nodeIntegration: false`, renderer sandboxing, trusted-window
  IPC, and server-side AI credentials remain unchanged. Phase 10B makes no AI request.
- Current Supabase documentation/changelog was reviewed; local-only evaluation avoids a
  database/RLS/grants surface, so no migration was created.

Verification:

- `npm --prefix apps/desktop test` — 132/132 tests passed.
- `npm --prefix apps/desktop run typecheck` and `npm --prefix apps/desktop run build`
  — strict TypeScript and Electron production bundles passed.
- `npm test`, `npm run lint`, and `npm run build` — root backend harnesses, lint, and
  Next.js production build passed with web behavior unchanged.
- Generated evaluation JSON/CSV fixtures and desktop output were scanned for paths,
  filenames, raw errors/output, prompts/model text, credential files, provider keys,
  service-role/encryption secrets, and private keys; no prohibited value was found.

Known limitations:

- Insights are intentionally device-local and are not synchronized between computers.
- Resolution timing shows correlation after a nudge, not proof that Observer caused it.
- Repeated objective failure is an evaluation category derived from repeated controlled
  failures; Phase 10B adds no new background signal or project-wide inference.
- CSV is an aggregate summary for analysis; JSON contains the complete sanitized local
  report. Users must explicitly save and share either file themselves.

### 2026-09-01 — Phase 10A optional proactive Observer complete

Architecture and behavior:

- Added a pure typed proactive-event engine driven by deterministic save/run/task
  streams. Stable signatures hash normalized failures; reasons use local templates.
- Added Manual-by-default device settings with explicit Assist consent, detector
  toggles, bounded cooldown/hour limits, visible mutes, reset, and immediate Disable
  Assist. The existing synced Observer master switch still controls manual Ask Observer.
- Monaco markers are sampled only after a successful file save and must remain the same
  error across two cycles. Run detection uses structured runner completion. Test/build
  detection uses only the new controlled main-process task bridge and strict command
  allowlist; interactive terminal content is never inspected.
- Added a quiet Observer-panel nudge. Assistance actions prepare focused context and
  open Context Preview; they do not call AI. Existing explicit Send, bearer validation,
  server-side providers, and Phase 9 edit review remain unchanged.
- Added owner-only local feedback storage with an exact metadata schema and 1,000-record
  bound. Clearing local Observer history also clears proactive feedback.

Changed files:

- Desktop shared proactive/settings/task contracts; main settings store/IPC and
  controlled verification runner; preload/global typed allowlists.
- Renderer App, Observer, Settings, Bottom panel, command validation, and styles for
  deterministic detection, quiet nudges, Context Preview actions, and mutes.
- Focused proactive/settings/multi-file tests, desktop test script, and this roadmap.
  The Next.js application and Supabase schema were not modified.

Security and privacy decisions:

- `contextIsolation: true`, `nodeIntegration: false`, sandboxing, and trusted-window IPC
  remain intact. Task execution uses controlled argument arrays, validated workspace
  `cwd`, `shell: false`, bounded output, one active process, and timeout cleanup.
- Detection is local and inert outside Assist. No cursor, keystroke, arbitrary terminal,
  external API, model inference, automatic command, or automatic edit is used.
- Support context exists only ephemerally until review. Persisted feedback contains
  hashes/categories/timing/outcomes only; mandatory secret exclusions and redaction
  still apply before preview/send.
- Current Supabase documentation/changelog was reviewed. Local-only feedback avoids a
  new table/grants/RLS surface, so no migration was necessary.

Verification:

- `npm --prefix apps/desktop test` — 124/124 tests passed.
- `npm --prefix apps/desktop run typecheck` and `npm --prefix apps/desktop run build`
  — strict TypeScript and production bundles passed.
- `npm test`, `npm run lint`, and `npm run build` — backend harnesses, lint, and Next.js
  production build passed with web behavior unchanged.
- Desktop production scan found no credential-shaped provider key, service-role token,
  encryption secret, or private key; the known anon publishable Supabase JWT is allowed.

Known limitations:

- Test/build signals exist only for explicit Phase 9B verification suggestions accepted
  by the conservative task grammar; there is no general task registry yet.
- V1 does not detect missing imports separately, documentation drift, arbitrary terminal
  failures, or cross-file root causes. It does not synchronize mutes or feedback.
- Investigate currently seeds Explain; Suggest Fix seeds Fix Error. Both require Context
  Preview and explicit Send.

### 2026-09-01 — Phase 9B safe multi-file AI change sets complete

Architecture and workflow:

- Added the separate `Plan Multi-File Change` code action with a required description.
  Planning and generation each use a newly prepared, user-reviewed Phase 8 context
  package. Plan approval happens before original file bases are sent for generation.
- Added strict shared desktop contracts and parallel Zod backend schemas. The backend
  assigns plan/change-set UUIDs; both layers require exact fields, complete membership,
  unique safe paths, update/create-only operations, exact original SHA-256/content,
  expected absence for creates, and configured count/size/line bounds.
- Added an authenticated `/api/multi-file-change` route. Desktop calls use the existing
  verified bearer token; web cookie auth remains supported by the shared auth helper.
  Provider keys and calls remain server-side. No database migration was needed.
- Added a narrow typed preload allowlist and a main-process workflow controller that
  binds generation to the exact approved plan/bases and apply to the exact generated
  change set. The renderer cannot supply arbitrary filesystem or command operations.
- Added plan review, all-file Monaco diff navigation, update/create labels, line counts,
  warnings, whole-set approve/reject/regenerate, and a success/verification screen.
  Partial application is deliberately unavailable because dependency consistency is
  not reliably provable.
- Added a main-process transaction service. It revalidates canonical workspace paths,
  refuses symlinks/secrets/binaries/stale files/create collisions/dirty tabs, writes one
  owner-only local checkpoint bundle, stages every file beside its destination, and
  rolls back already committed files on failure.
- Added hash-gated whole-set rollback with dirty-tab protection and a Command Palette
  action. Created files are removed only while their current hashes still match the
  applied set; newer user changes stop rollback.
- Suggested verification remains inert until the user confirms every displayed command.
  Only a fixed validation-command grammar can be sent to the existing terminal; shell
  controls, Git, mutation commands, and arbitrary model commands are rejected.

Changed files:

- `apps/desktop/src/shared/multi-file-change.ts`, `observer.ts`, `project-context.ts`,
  and `settings.ts` — typed contracts, action/context input, schemas, safe limits, and
  versioned local preferences.
- `apps/desktop/src/main/multi-file-client.ts`, `multi-file-ipc.ts`,
  `multi-file-service.ts`, `project-context.ts`, and `index.ts` — bearer client,
  workflow authorization, path/preflight enforcement, transactions/checkpoints,
  focused context, and lifecycle registration.
- `apps/desktop/src/preload/index.ts` and renderer `global.d.ts` — frozen narrow bridge.
- Renderer `App.tsx`, `ObserverPanel.tsx`, `MultiFileChangeWorkspace.tsx`,
  `BottomPanel.tsx`, `SettingsPanel.tsx`, `commands.ts`, and `styles.css` — explicit
  plan/review/apply/undo/verification UI and safe settings without a visual redesign.
- `src/app/api/multi-file-change/route.ts`, `src/lib/server/multi-file-change.ts`, and
  `src/lib/server/providers.ts` — authenticated structured provider workflow and
  server-side validation/metadata logging.
- Desktop multi-file/context/settings/command tests, root backend harness, desktop
  package script, and this roadmap — focused regression/security coverage and records.

Security and privacy decisions:

- The renderer remains sandboxed with `contextIsolation: true`, `nodeIntegration:
  false`, no filesystem/Node/process access, and no arbitrary IPC/Git/shell command.
- Default limits are 5 affected files, 500 conservatively counted changed lines, and
  200,000 generated UTF-8 bytes. Local settings permit only bounded safer values;
  plan/diff review and automatic-command restrictions cannot be disabled.
- Checkpoint bundles remain local under Electron application data with owner-only
  files. Supabase receives metadata only; it never receives raw file bases, generated
  content, checkpoint code, terminal output, API keys, or provider credentials.
- Existing file hashes and new-file absence are checked during preparation and again
  immediately before staged commits. No silent rebasing, automatic save, command run,
  Git write, or partial apply occurs.

Verification:

- `npm --prefix apps/desktop test` — 115/115 tests passed.
- `npm --prefix apps/desktop run typecheck` and `npm --prefix apps/desktop run build`
  — strict Electron main/preload/renderer TypeScript and production bundles passed.
- `npm test`, `npm run lint`, and `npm run build` — backend harnesses, existing web
  checks, and the Next.js production build passed.
- Credential/private-key scan of `apps/desktop/out` — passed with no prohibited
  provider key, service-role, private-key, or bearer-token values.

Known limitations:

- Only supported UTF-8 text/code files are eligible; target parent folders must already
  exist. Delete, rename, move, binary changes, optional-file exclusion, and nested
  directory creation are unavailable.
- Verification execution accepts only a conservative validation-command allowlist;
  other suggestions must be reviewed and entered manually in the terminal.
- Rollback deliberately stops on any affected dirty tab or changed-after-apply hash.
  Bundles are device-local and not synchronized.

### 2026-08-31 — Phase 9A safe single-file AI changes complete

Changed files and architecture:

- Desktop structured-edit contracts, Observer main/client validation, and the
  Next.js provider/route schema now bind one replace/insert/delete edit to a locally
  selected active relative path and SHA-256. Add Comments/Documentation requires an
  explicit selection; Generate Tests and all read-only modes cannot return an edit.
- The desktop App and new Observer edit-review surface replaced free-form cursor
  insertion with a read-only Monaco diff, stale/exact-text checks, Accept/Reject/
  Regenerate/Copy/Escape controls, unsaved-base labeling, and in-memory-only apply.
- A typed main/preload checkpoint service stores owner-only rollback data beneath
  Electron application data, validates the current workspace and applied-content hash,
  applies bounded retention cleanup, and exposes create/restore/clear only.
- Settings schema version 3 adds local 1–100 checkpoint retention (default 20), Data
  and History adds Clear Local Checkpoints, and the command registry/Observer panel add
  Undo Observer Change.
- The server persists edit/action/provider/file-type/timing metadata and outcome only;
  replacement text and raw checkpoint content are not written to Supabase. No migration
  was required, and existing cookie and bearer authentication remain unchanged.
- Focused desktop/backend tests cover valid and invalid edits, hash/range/target/path/
  size checks, dirty diff behavior, checkpoint restoration and retention, command
  registration, and the no-save/no-execution boundary.

Verification and limitations:

- Desktop tests passed 105/105; strict TypeScript and the Electron production build
  passed. Root backend harnesses and lint passed, and the Next.js production build
  compiled all existing web routes successfully.
- Desktop build output passed scans for private-key blocks, service-role tokens, and
  common provider-key shapes. No service secret, provider key, or Supabase migration
  was added.
- Phase 9A changes only one already-open file per request. It does not create test
  files, change multiple files, save automatically, execute commands/tests, perform Git
  writes, or rebase stale suggestions. A configured provider remains necessary for a
  full manual model-response smoke test; Demo may return explanation-only results.

### 2026-08-31 — Phase 8 deterministic context engine complete

Changed files and architecture:

- Desktop shared context/Observer/settings contracts — added the versioned context
  package, explicit item/provenance types, validation, cost/removal/confirmation helpers,
  prepare IPC, and versioned local related-file/per-file limits.
- Desktop main context engine and Observer/workspace lifecycle — added symbol detection,
  relative-import and nearby-test/config/rule discovery, fixed priorities, deterministic
  budgeting, `.gitignore` and privacy exclusions, root/symlink-safe reads, content secret
  redaction, cache invalidation, and prepared-package subset authorization.
- Desktop Context Preview, Observer/App/Settings integration, and styles — added the
  review dialog, item source/reason/cost/flags/content, optional removal, omission list,
  final totals, complete-file confirmation, and the two-step prepare/send flow.
- Next.js structured context schema, suggest route, and provider prompt — added a second
  validation boundary, untrusted-content delimiters/instructions, package-to-provider
  context mapping, and metadata-only request logging while preserving cookie and bearer
  authentication plus server-only provider keys.
- Focused desktop/backend harnesses and package scripts — added deterministic retrieval,
  privacy, budget, preview, injection-boundary, and no-raw-context-persistence coverage.
  No Supabase schema change was required.

Verification and limitations:

- Desktop tests passed 96/96; strict TypeScript and the Electron production build passed.
  Both root test harnesses, lint, and the Next.js production build passed.
- Desktop build output and context fixtures contain no server credential identifiers or
  token/key-shaped values under the Phase 8 scans.
- Retrieval follows direct syntactic/file relationships and known conventions; it is not
  a semantic whole-codebase search. Symbol detection is intentionally lightweight and can
  miss unusual language syntax. Simple `.gitignore` inclusion patterns are respected;
  negated rules are not used to re-include privacy-sensitive candidates.
- Related content is capped at 10 files/20,000 characters per file and 50,000 total,
  with defaults of 4/8,000/20,000. No embeddings, proactive requests, multi-file edits,
  terminal execution, Git writes, Chrome communication, or packaging work was added.
- Signed-in visual Context Preview/provider interaction remains a manual verification step.

### 2026-08-31 — Phase 7E complete

Changed files and architecture:

- Git shared/main/preload modules — added typed status/diff states, strict request
  validation, a workspace-scoped repository service, trusted-window IPC, cancellation,
  and a frozen renderer bridge. Git runs only fixed porcelain-v2 status and HEAD
  `cat-file` calls with controlled arguments and no shell.
- Source Control and diff renderer modules, App/Explorer integration, styles, and the
  command registry — added the sidebar, standard shortcut, categorized status, refresh
  states, Explorer reveal, and read-only Monaco Diff Editor while preserving normal tabs.
- Focused Git and command tests plus desktop test configuration — added temporary-repo
  coverage without touching this repository's history.
- This living plan — records the Phase 7E architecture, read-only boundary, results,
  limitations, and next task. The existing Next.js application source is unchanged.

Verification and limitations:

- Desktop tests passed 88/88. Strict main/preload/renderer TypeScript and the Electron
  production build passed. Root tests, lint, and the Next.js production build passed.
- Tests cover repository/non-repository/missing-Git states, branches, staged and
  unstaged changes, untracked/deleted/renamed/binary files, spaces, limits, timeout,
  cancellation, request rejection, and correct original/current diff content.
- Diffs compare HEAD with the current worktree; this is not a three-way index/worktree
  viewer. Binary and over-2-MiB sides receive explanatory states instead of text diffs.
  Status displays at most 500 changed files, and external index-only changes can require
  manual Refresh when they do not produce a workspace file event.
- There are no stage, unstage, commit, discard, checkout, branch, merge/rebase,
  pull/push/fetch, remote, credential, AI-review, or proactive operations. Git must
  already be installed and available on PATH. Signed-in visual interaction remains a
  manual verification step.

### 2026-08-31 — Phase 7D complete

Changed files and architecture:

- Desktop shared/main/preload settings modules — added a typed versioned device schema,
  owner-only atomic storage, bounded open-tab metadata, authenticated settings/key HTTP
  client, and narrow trusted-window IPC methods. Recent-project storage gained confirmed
  Clear History support; workspace responses include only an opaque ID for tab metadata.
- Desktop Settings renderer/styles and App/Explorer integration — added seven settings
  sections, filtering, all required entry points, runtime theme/Monaco/auto-save behavior,
  startup reopening, tab restoration, deletion preference, Observer privacy controls,
  masked write-only keys, confirmed data actions, and local-versus-Supabase explanations.
- Next.js settings/key/Observer server modules and routes — added dual cookie/bearer
  desktop settings APIs, safe provider availability, optional key verification, user-key
  status only, preferred models, bounded Observer context, and optional suggestion history.
  Existing cookie-based web authentication and UI behavior remain supported.
- `20260831061842_add_desktop_user_settings.sql` — created with Supabase CLI 2.116.0;
  adds the owner-keyed synced table, checks, explicit grants, enabled RLS, and separate
  SELECT/INSERT/UPDATE/DELETE ownership policies (UPDATE has `USING` and `WITH CHECK`).
- Focused desktop/root tests and this plan — added settings recovery/separation/runtime,
  tab/history clearing, signed-out/key-response safety, secret exclusions, command access,
  API-key verification transport, and migration policy/grant assertions.

Verification and limitations:

- Desktop tests passed 79/79; strict desktop TypeScript and the Electron production build
  passed. Root tests, lint, and the Next.js production build passed.
- Desktop output secret scan found no server credential identifiers; broad `sk-` scanning
  produced only Monaco CSS `mask-border-*` vocabulary, not keys.
- Supabase CLI migration creation/help and policy/grant harness checks passed. The linked
  migration was applied and read-only SQL verification confirmed RLS enabled, four
  authenticated owner policies, UPDATE `USING` plus `WITH CHECK`, and explicit
  authenticated/service-role grants. Local stack execution remains unavailable because
  Docker is not running.
- Provider/model catalogs contain the currently supported single model per provider.
  Key verification is optional and depends on provider availability. Account deletion,
  proactive Assist Mode, project-wide indexing, telemetry, Git, and packaging remain out
  of scope. Clearing local Observer/context history does not delete earlier suggestion
  rows already stored in Supabase. Signed-in visual interaction remains a manual step.

### 2026-08-31 — Phase 7C complete

Changed files:

- `apps/desktop/src/renderer/src/commands.ts` — added the typed 20-command registry,
  availability rules, shortcut labels, registry collision checks, fuzzy matching,
  and embedded-terminal shortcut protection.
- Command Palette renderer/state/styles — added the accessible searchable overlay,
  reducer-driven keyboard navigation, disabled reasons, empty state, visible focus,
  execution guard, and focus restoration.
- Desktop App, Explorer, BottomPanel, and ObserverPanel — connected registry handlers
  to existing save/run/search/Markdown/Observer and typed component-owned action hooks;
  terminal/output/Observer commands now move focus to their existing surfaces.
- Workspace shared/main/preload boundary — added one authenticated Close Workspace
  operation backed by the existing cleanup lifecycle and Welcome state.
- Desktop tests/configuration/plan — added seven focused palette/registry/shortcut
  tests, included them in the desktop suite, and recorded Phase 7C architecture/results.

Verification and limitations:

- `npm --prefix apps/desktop test` passed 67/67 tests, including all requested palette,
  registry, execution, disabled-state, collision, focus, and shortcut-protection cases.
  Strict main/preload/renderer TypeScript and the Electron production build passed.
- Root manual-suggestion tests, lint, and the Next.js production build passed with no
  web application source changes.
- The registry and shortcuts are fixed in this release. There are no aliases, custom
  shortcuts, shortcut editor, command history, recently used ranking, extension-contributed
  commands, or arbitrary command execution.
- Toggle Terminal and Toggle Output activate and focus the existing bottom-panel view;
  they do not collapse or resize the panel. Automated interaction/state tests cover the
  keyboard model; signed-in visual Electron smoke testing remains a manual step.

### 2026-08-31 — Phase 7B complete

Changed files:

- `apps/desktop/src/main/recent-projects.ts` and focused tests — added versioned,
  atomic, owner-only app-data persistence; normalization, ordering, deduplication,
  retention, opaque identifiers, safe display paths, removal, and secure reopen checks.
- Desktop workspace main/preload/shared contracts — added authenticated List Recent,
  Reopen Recent, and Remove Recent operations while retaining main-process paths and
  reusing the existing workspace activation lifecycle.
- Desktop renderer — added the startup Welcome screen, Open Folder action, empty/error/
  loading states, bounded Recent Projects list, shortened paths, timestamps, removal,
  and Explorer synchronization after a welcome/recent open.
- Desktop plan/test command — included the new focused test suite and recorded Phase 7B
  architecture, privacy rules, verification evidence, and limitations.

Verification and limitations:

- `npm --prefix apps/desktop test` passed 60/60 tests, including six focused recent-
  project storage and reopen tests. Strict main/preload/renderer TypeScript and the
  Electron production build passed.
- Root manual-suggestion tests, lint, and the Next.js production build passed with no
  web application source changes.
- Startup always shows Welcome and does not automatically reopen the last workspace.
  A future setting may opt into automatic reopen after its UX and recovery behavior
  are approved.
- Recents do not track renamed or moved projects automatically. Such entries show a
  clear unavailable message and remain removable. No recent-project cloud sync,
  pinning, custom labels, or project thumbnails are included.
- Automated tests cover persistence and security behavior; signed-in interactive
  Electron smoke testing remains part of the manual steps and future packaged-release checks.

### 2026-08-30 — Phase 7A complete

Changed files:

- `apps/desktop/src/shared/search.ts` — added bounded request/result contracts, runtime
  validation, include/exclude matching, batch/completion types, and Monaco selection mapping.
- Desktop main/workspace IPC — added the pinned ripgrep search service, fixed safe
  arguments, filtered environment, `.gitignore` support, mandatory ignores, JSON result
  parsing, batching, limits, cancellation, and authenticated workspace lifecycle cleanup.
- Desktop preload/renderer — added a purpose-specific Search/Cancel/batch bridge,
  Explorer/Search tabs, Ctrl/Cmd+Shift+F, debounced controls, all result states, grouped
  highlighted matches, and existing-tab Monaco navigation.
- Desktop tests/dependencies — pinned `@vscode/ripgrep` and added focused integration
  coverage using a temporary workspace and the packaged-platform binary.

Verification and limitations:

- `npm --prefix apps/desktop test` passed 54/54 tests. Strict main/preload/renderer
  TypeScript and the Electron production build passed.
- Root manual-suggestion tests, lint, and the Next.js production build passed with no
  web application source changes.
- Search reads saved disk content only. An already-open dirty tab is preserved, so a
  disk-result line can be stale relative to unsaved edits; no draft is overwritten.
- Include/exclude fields accept comma-separated `*`, `?`, and `**` globs. Brace
  expansion, negated include syntax, search-and-replace, persisted queries, and
  multiline/PCRE-only expressions are not included.
- Release packaging must verify that the platform ripgrep binary is included and
  executable on every supported target; Phase 7A verifies development and production
  bundles, not installers.

### 2026-08-30 — Phase 6 complete

Changed files:

- Desktop Markdown core and renderer — added `.mdx` to the safe text allowlist,
  Markdown detection, heading extraction, safe URL filtering, a raw-HTML-disabled GFM
  preview, Edit/Preview/Split controls, an outline, navigation, and documentation
  styling while retaining Monaco drafts and the existing Save/conflict flow.
- Desktop and server Observer contracts — added four documentation modes, strict
  code/document mode matching, bounded active-document rules, focused context
  summaries, server-side prompts, and existing authenticated outcome logging.
- Desktop dependencies/tests — pinned `react-markdown` and `remark-gfm`; added coverage
  for rendering safety/features, `.mdx` round-trip and conflicts, large documents,
  all documentation modes, and bearer transport.
- Documentation — recorded the rendering/privacy architecture, verification evidence,
  limitations, and packaging as the next phase.

Verification and limitations:

- `npm --prefix apps/desktop test` passed 45/45 tests and the desktop production build
  passed strict main/preload/renderer TypeScript checks.
- Root manual-suggestion/auth/RLS tests, lint, and the Next.js production build passed;
  the web UI and cookie authentication path remain unchanged.
- Preview intentionally ignores raw HTML/MDX components and images. It does not provide
  syntax highlighting, document export, rich-text editing, multi-file documentation
  context, or automatic code/document comparison. Very large previews are not
  virtualized.
- The production dependency audit still reports one low and one moderate advisory
  through Monaco's `dompurify` dependency. The automated force-fix proposes a breaking
  Monaco downgrade, so it is deferred for explicit dependency review in release
  readiness; the Phase 6 Markdown preview does not import DOMPurify or raw HTML.

### 2026-08-30 — Phase 5B complete

Changed files:

- `apps/desktop/src/shared/observer.ts` — added the five manual request modes,
  bounded context/result contracts, sensitive-file denial, summary/shortcut helpers,
  safe insertion rules, and runtime request stripping.
- Desktop main/preload/auth — added a purpose-specific Observer bridge, current-token
  access confined to Electron main, HTTPS/localhost backend configuration, strict IPC
  validation, bearer request forwarding, safe errors, and outcome recording.
- Desktop renderer — replaced the placeholder with mode/provider controls, pre-send
  context summary, loading/error/suggestion states, Copy, cursor Insert with Monaco
  undo support, instant Dismiss, Ctrl/Cmd+Enter, and Escape.
- Next.js API authentication — added a request-scoped cookie-or-bearer helper. Bearer
  tokens are strictly parsed, validated with Supabase Auth `getUser(token)`, and passed
  to a public-key Supabase client so existing suggestion/outcome ownership RLS applies.
- Existing suggestion/provider routes — added mode-aware prompting, desktop-focused
  context validation, basename-only metadata, and manual request metadata while
  preserving existing web request defaults and server-only provider-key handling.
- Desktop and web harnesses — added coverage for all modes, selection/cursor/diagnostic
  context, signed-out behavior, errors, outcomes, copy/insert/dismiss shortcuts,
  bearer configuration, and existing RLS policy ownership guards.
- Desktop README/environment example and this roadmap — documented the two-process
  local workflow, backend URL, privacy boundary, architecture, results, and limits.

Security and privacy decisions:

- The renderer never receives a token. Electron main obtains the refreshed access
  token only when the user presses Ask or records an explicit outcome.
- Selected and nearby code are capped at 20,000 characters, relevant run errors at
  8,000, diagnostic messages at 2,000, and optional Generate Tests active-file content
  at 50,000. Unknown IPC fields are stripped before transport.
- The desktop sends only a file basename and language. `.env`, credential/config,
  private-key/certificate, unrelated file, workspace-wide, terminal-history, and
  absolute-path content is rejected or never collected.
- The service-role key, encryption secret, decrypted provider keys, provider lookup,
  and provider HTTP calls remain inside the existing Next.js server.
- Existing cookie-authenticated web requests follow the unchanged SSR client path.
  Malformed or mixed Authorization values fail with 401 rather than falling back.

Verification:

- `npm --prefix apps/desktop test` — 40/40 tests passed, including all five modes,
  focused context paths, signed-out rejection, API errors, outcomes, privacy limits,
  Copy, insertion safety, Ctrl/Cmd+Enter, and Escape.
- `npm test` — the web manual-suggestion, bearer configuration, and RLS ownership
  regression harness passed.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer TypeScript and
  Electron production builds passed.
- `npm run build` — the existing Next.js application and cookie-authenticated routes
  compiled and rendered successfully with the additive bearer path.
- Renderer/preload bundle secret scan — no configured service-role, provider, or
  encryption secret, raw desktop auth token, or Supabase client configuration appeared.

Known requirements and limits:

- Local Observer use requires the Next.js development server at
  `http://127.0.0.1:3000`; packaged builds require an explicit HTTPS
  `DESKTOP_API_BASE_URL`.
- Live requests require an active Supabase project, a valid desktop account, and a
  configured server/user provider key. Provider-key management remains in the web app.
- Insert adds the returned snippet at the current cursor only; it does not replace a
  selection, edit multiple files, run commands, or act autonomously.
- Generate Tests is the only mode that may include the active file, and oversized
  files fall back to bounded cursor context.
- No proactive trigger, document editor, Git workflow, agent editing, or AI terminal
  execution was added.

### 2026-08-20 — Phase 5A complete

Changed files:

- Desktop package manifest/lockfile — added the pinned `@supabase/supabase-js`
  client only to `apps/desktop`.
- `apps/desktop/src/shared/auth.ts` — added the narrow public auth state and typed
  sign-in/sign-out IPC contracts; tokens are intentionally absent.
- `apps/desktop/src/main/auth-controller.ts`, `auth-session-store.ts`,
  `supabase-auth-provider.ts`, and `auth-ipc.ts` — added validated email/password
  sign-in, server-validated restoration, refresh rotation, encrypted persistence,
  public profile projection, and trusted-window IPC.
- Desktop main/workspace IPC — gated workspace, terminal, and runner access on the
  authenticated state and clears workspace authorization/processes on sign-out.
- Desktop preload and renderer — added the frozen auth bridge, signed-out/loading/
  error screens, authenticated user menu, and Sign Out without exposing Node or
  Supabase clients to the renderer.
- Electron Vite config, desktop environment example, README, and root ignore rule —
  reuse only the existing public web Supabase values or desktop-specific public
  equivalents while excluding all server secrets.
- Focused desktop harness — expanded from 30 to 34 tests for request validation,
  encrypted-at-rest bytes, restoration, invalid/valid sign-in, sign-out cleanup,
  and unavailable secure-storage blocking.

Security and session decisions:

- Supabase Auth runs only in Electron main with `persistSession: false` and automatic
  token refresh. Restored sessions are verified with the Auth server using
  `getUser(accessToken)` before unlocking the IDE.
- The application owns a single encrypted session file under Electron `userData`.
  Async `safeStorage` uses macOS Keychain, Windows DPAPI, or a Linux secret service;
  unavailable encryption and Linux `basic_text` fail closed.
- The renderer receives only `{ id, email, name }`. User metadata is used only as a
  display-name fallback, never for authorization. Service-role/provider keys and
  the application encryption secret remain in the existing Next.js server.
- Sign Out uses local Supabase scope so the separate web login remains unchanged,
  deletes encrypted desktop session data, revokes local IDE IPC access, and stops
  workspace-owned terminal/run processes.

Verification:

- `npm --prefix apps/desktop test` — 34/34 tests passed, including encrypted session
  persistence/restoration, successful and invalid sign-in decisions, sign-out
  clearing, and fail-closed secure-storage behavior.
- Live Supabase invalid-login check — the existing project rejected a deliberately
  invalid email/password request without logging credentials.
- Desktop renderer secret-value scan — no configured service-role key, provider key,
  or encryption secret appeared in renderer production assets.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer TypeScript and
  production Electron/Vite builds passed.
- `env -u ELECTRON_RUN_AS_NODE npm run dev` — Electron launched, initialized to the
  signed-out auth gate, and logged `contextIsolation=true`, `nodeIntegration=false`,
  and `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the existing web app passed with
  its authentication source and behavior unchanged.

Known requirements and limits:

- Email/password is the only desktop sign-in method in Phase 5A. Signup, password
  recovery, OAuth, and MFA UI remain web-only/future work.
- Python/Node runtimes and Supabase must be reachable over the user's network.
- Phase 5B must implement the documented request-scoped bearer validation before
  desktop Ask Observer can call the existing cookie-authenticated API routes.

### 2026-08-20 — Phase 5A started

- Marked secure desktop email/password authentication and encrypted session
  restoration **In Progress** before implementation.
- Selected an Electron-main Supabase client with `persistSession: false`; an
  application-owned encrypted session file will use OS-backed `safeStorage`, and
  the sandboxed renderer will receive only non-sensitive user identity fields.
- Confirmed the existing Next.js API routes currently validate cookie-backed web
  sessions. Phase 5A will document, but not implement, a future bearer-token
  validation path for desktop Observer requests.

### 2026-08-20 — Phase 4B complete

Changed files:

- `apps/desktop/src/shared/runner.ts` — added the narrow typed start, stop, output,
  completion, status, and diagnostic contracts.
- `apps/desktop/src/main/run-session.ts`, `run-ipc.ts`, and
  `run-diagnostics.ts` — added canonical workspace validation, the fixed Python/
  Node command map, shell-free process ownership, bounded output capture, Stop and
  lifecycle cleanup, and in-workspace traceback/stack parsing.
- Desktop main, preload, and renderer declarations — tied the runner to workspace
  authorization and exposed only the typed bridge.
- Desktop App, BottomPanel, styles, language map, and text allowlist — added Run/
  Stop, Ctrl+R/Cmd+R, Save-and-Run protection, structured Output state, clickable
  Monaco diagnostics, `.mjs` viewing, and clear TypeScript/unsupported states.
- Focused desktop test harness — expanded from 26 to 30 tests with real Python and
  JavaScript runs, runtime errors, stopping, authorization, path rejection,
  command-map, and parser coverage.

Security decisions:

- The renderer never receives an absolute path, command, shell, environment, or
  child-process object. It may request only a bounded run ID plus a relative path.
- Main reuses the secure text-file and canonical-root checks immediately before
  spawning. It uses `shell: false`, fixed interpreter names and arguments, a
  filtered environment, and the selected canonical workspace root as `cwd`.
- Output crossing IPC and retained diagnostic capture are bounded. Parsed locations
  outside the selected root are discarded, and processes stop on explicit Stop,
  workspace replacement, renderer destruction, and application exit.

Verification:

- `npm --prefix apps/desktop test` — 30/30 tests passed, including successful
  Python and JavaScript execution, Python diagnostic extraction, Stop, authorization,
  traversal rejection, command mapping, and outside-root diagnostic filtering.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer type checks
  and production Electron/Vite builds passed.
- `env -u ELECTRON_RUN_AS_NODE npm run dev` from `apps/desktop` — Electron launched
  and logged `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the existing Next.js application
  passed lint, its focused harness, and its production build without source changes.

Supported-language limits:

- `.py` uses `python3` on macOS/Linux and `python` on Windows; `.js` and `.mjs` use
  `node`. Those runtimes must be available on PATH.
- `.ts` reports `TypeScript runner not configured`; Java, C/C++, test runners,
  debugging, arbitrary project tasks, and output-to-AI behavior remain deferred.

### 2026-08-20 — Phase 4B started

- Marked the explicit Run Current File and structured-diagnostics slice **In
  Progress** before implementation.
- Limited execution to a main-process command map for saved Python and JavaScript
  files, with no shell interpolation and no automatic execution.
- Explicitly deferred TypeScript execution until a reliable workspace-local runner
  is designed, along with debugging, tests, Git, AI, Supabase, authentication, and
  documentation features.

### 2026-08-20 — Phase 4A complete

Changed files:

- Desktop package manifest, lockfile, and README — added `node-pty`, xterm.js,
  `@xterm/addon-fit`, Electron rebuild tooling, rebuild scripts, and setup notes.
- `apps/desktop/src/shared/terminal.ts` — added the typed create, input, output,
  resize, close, and exit contracts for one terminal session.
- `apps/desktop/src/main/terminal-session.ts`, `terminal-environment.ts`, and
  `terminal-ipc.ts` — added validated one-session lifecycle management, safe shell
  selection/environment filtering, output chunk limits, and trusted-window IPC.
- `apps/desktop/src/main/index.ts` and `workspace-ipc.ts` — tied terminal cleanup
  to workspace replacement, renderer destruction, and accepted application exit.
- `apps/desktop/src/preload/index.ts` and renderer declarations — exposed only the
  frozen typed terminal bridge, without raw Electron or Node access.
- `apps/desktop/src/renderer/src/BottomPanel.tsx`, `App.tsx`, `Explorer.tsx`, and
  `styles.css` — added the professional fitted xterm view, explicit New/Close
  Terminal actions, separate bounded Output log, errors, status messages, and
  responsive bottom-panel styling.
- `apps/desktop/src/main/workspace-files.test.ts` — expanded focused coverage from
  23 to 26 tests for authorization, input/resize routing, one-session enforcement,
  workspace/renderer cleanup, environment filtering, and shell selection.

Dependency decisions:

- xterm.js is renderer-only and provides terminal emulation; it cannot create a
  process by itself.
- `node-pty` is main-process-only so interactive programs receive a real PTY on
  macOS, Linux, and supported Windows versions.
- `node-pty` is a native dependency. `npm install` runs `electron-rebuild -f -w
  node-pty`; `npm run rebuild:native` is documented for Electron upgrades and
  restored dependency caches.

Security decisions:

- Terminal creation fails without the workspace authorization established by the
  native folder picker, and a second session is refused while one is active.
- Input is bounded at 64 KiB per message, output is split into 64 KiB IPC chunks,
  and terminal dimensions/session identifiers receive runtime validation.
- Only ordinary shell environment keys such as PATH, HOME, SHELL, locale, and
  temporary-directory values are inherited. Provider keys, Supabase secrets, and
  unrelated environment variables are excluded.
- No commands start automatically; commands originate only from xterm keystrokes.

Verification:

- `npm --prefix apps/desktop test` — 26/26 tests passed, including the terminal
  authorization, lifecycle, cleanup, environment, input, and resize cases.
- Electron-ABI PTY smoke test — rebuilt `node-pty` spawned zsh, accepted input,
  resized, streamed `PTY_OK` plus the exact desktop working directory, and exited
  with code 0.
- `npm --prefix apps/desktop run build` — strict TypeScript plus production main,
  preload, xterm renderer, and Monaco bundles passed.
- `npm --prefix apps/desktop run dev` — Electron launched, the terminal/output UI
  was visually checked, and runtime logged `contextIsolation=true`,
  `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the unchanged web application
  passed lint, its focused harness, and its production Next.js build.

Known limitations:

- Phase 4A supports exactly one terminal and does not persist its scrollback after
  closing or switching workspaces.
- There is no Run Current File, task runner, diagnostics parsing, terminal search,
  split terminal, shell profile picker, or packaged-installer verification yet.
- Native compiler prerequisites may be required when a platform cannot use a
  compatible `node-pty` prebuild; rerun `npm run rebuild:native` after installing
  those platform tools.

### 2026-08-20 — Phase 4A started

- Marked the one-terminal and tabbed Output-panel slice **In Progress** before
  implementation.
- Selected xterm.js for renderer-only terminal emulation and `node-pty` for the
  main-process pseudoterminal, subject to native Electron rebuild verification.
- Explicitly deferred Run Current File, diagnostics parsing, debugging, Git, AI,
  Supabase, authentication, documentation, and proactive features.

### 2026-08-20 — Phase 3B complete

Changed files:

- Desktop package manifest and lockfile — added `chokidar` only to the isolated
  Electron package.
- `apps/desktop/src/main/workspace-watcher.ts`, `workspace-ipc.ts`, and `index.ts`
  — added a main-process-only watcher, ignored-directory filtering, relative event
  batching, internal-operation suppression, authorized-window delivery, and
  lifecycle cleanup.
- `apps/desktop/src/shared/workspace.ts` and `external-sync.ts` — added the narrow
  typed subscription contract and deterministic clean/dirty/deletion decisions.
- `apps/desktop/src/preload/index.ts` — exposed one listener registration that
  returns an unsubscribe function; no Node or raw IPC object is exposed.
- `apps/desktop/src/renderer/src/Explorer.tsx`, `App.tsx`, and `styles.css` —
  preserved expanded tree state during refresh, retained valid selection, added
  external-update notices, reloaded clean tabs, protected dirty drafts with two
  explicit conflict actions, and marked deleted tabs unavailable.
- `apps/desktop/src/main/workspace-files.test.ts` — expanded focused coverage from
  20 to 23 tests, including watcher batching/ignore/suppression/stop behavior and
  clean-versus-dirty reconciliation.
- Desktop README and this roadmap — documented Phase 3B behavior and results.

Security decisions:

- The canonical workspace root remains main-process-only. Renderer events contain
  relative paths, entry kinds, change kinds, and a timestamp only.
- The watcher does not follow symlinks and ignores `node_modules`, `.git`, `dist`,
  `build`, and `.next` at every depth.
- External reloads still pass through the existing allowlist, canonical-path,
  regular-file, UTF-8, binary, and 2 MiB checks.
- The IDE suppresses its own validated writes/mutations so they do not masquerade
  as external conflicts; rapid external changes are coalesced before delivery.

Verification:

- `npm --prefix apps/desktop test` — 23/23 tests passed, including external event
  batching, ignored paths, internal suppression, cleanup, clean reload decisions,
  dirty conflict decisions, and parent-directory deletion matching.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer TypeScript
  checks and the production Electron Vite build passed.
- `npm --prefix apps/desktop run dev` — Electron launched and logged
  `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the unchanged web application
  passed lint, its focused harness, and its production Next.js build.

Remaining risks:

- Operating systems can represent an external rename as separate delete/add
  events. An open old-path tab is intentionally marked unavailable rather than
  guessing that an unrelated new path is its rename target.
- Native watcher limits vary by operating system and very large repositories;
  ignored generated trees and event batching reduce load, while larger-tree
  scalability remains a future performance-validation task.

### 2026-08-20 — Phase 3B started

- Marked only external disk synchronization **In Progress** before implementation.
- Explicitly deferred terminal, AI, Supabase, authentication, Git integration,
  rich documents, and proactive features.

### 2026-08-20 — Phase 3A complete

Changed files:

- `apps/desktop/src/shared/workspace.ts` and `workspace-paths.ts` — added typed
  create/rename/delete contracts and deterministic open-tab path replacement.
- `apps/desktop/src/main/workspace-files.ts` and `workspace-ipc.ts` — added
  validated, root-confined file/folder creation, collision-safe rename checks, and
  file/empty-folder deletion with safe typed errors.
- `apps/desktop/src/preload/index.ts` — exposed only three new typed mutation
  methods without raw IPC or Node APIs.
- `apps/desktop/src/renderer/src/App.tsx` — replaced the single active buffer with
  persistent Monaco tabs, per-tab dirty/save state, safe close behavior, and
  rename/delete reconciliation.
- `apps/desktop/src/renderer/src/Explorer.tsx` and `styles.css` — added selected
  entries, create/rename/delete actions, exact-target confirmation, dirty-delete
  warnings, tree refresh/reveal behavior, and tab styling.
- `apps/desktop/src/main/index.ts` — generalized the native close warning for
  multiple dirty tabs.
- `apps/desktop/src/main/workspace-files.test.ts` — expanded focused coverage from
  13 to 20 tests.
- Desktop README and this roadmap — documented Phase 3A scope and results.

Security decisions:

- Names must be one safe portable path segment and may not use traversal,
  separators, reserved device names, ignored generated names, or surrounding
  whitespace.
- New files use exclusive creation and supported text/code extensions so they can
  open through the existing protected Monaco read/write path.
- Rename and delete re-resolve the canonical root and target, refuse symlink
  mutation, and never allow mutation of the workspace root.
- Directory deletion uses empty-only `rmdir`; recursive deletion is not exposed.
- Deleting open files requires an exact-target confirmation that reports how many
  open and dirty tabs will be discarded.

Verification:

- `npm --prefix apps/desktop test` — 20/20 tests passed for existing read/write
  behavior, name validation, exclusive creation, duplicates, rename collisions,
  tab-path replacement, file deletion, empty-directory deletion, traversal,
  external symlinks, and blocked non-empty-directory deletion.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer TypeScript
  checks and the production Electron Vite build passed.
- `npm --prefix apps/desktop run dev` — Electron launched and the Phase 3A shell
  rendered; runtime logged `contextIsolation=true`, `nodeIntegration=false`, and
  `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the unchanged web application
  passed lint, its focused harness, and its production Next.js build.

### 2026-08-20 — Phase 3A started

- Marked editor tabs and basic workspace mutations **In Progress** before
  implementation.
- Explicitly deferred recursive deletion, terminal, AI, Supabase, authentication,
  Git, rich documents, and automatic proactive features.

### 2026-08-20 — Phase 2C complete

Changed files:

- Desktop package manifest and lockfile — added Monaco and its React integration
  only inside `apps/desktop`.
- `apps/desktop/src/shared/languages.ts` and `workspace.ts` — added language
  mapping plus typed versioned-save IPC contracts.
- `apps/desktop/src/main/workspace-files.ts`, `workspace-ipc.ts`, and `index.ts` —
  added root-confined existing-file saves, stale-disk protection, safe errors, and
  the native unsaved-close warning.
- `apps/desktop/src/preload/index.ts` — exposed only the typed `writeFile` method.
- `apps/desktop/src/renderer/src/App.tsx`, `Explorer.tsx`, `monaco.ts`, `main.tsx`,
  and `styles.css` — added local Monaco editing, language workers, dirty/save
  states, Save and shortcut behavior, and Save/Discard/Cancel navigation guards.
- `apps/desktop/src/main/workspace-files.test.ts` — expanded coverage from 8 to 13
  tests for language mapping and secure saves.
- Desktop README and this roadmap — documented Phase 2C behavior and results.

Security decisions:

- The renderer still has no Node, filesystem, path, process, shell, or raw IPC
  access; saving crosses one frozen typed preload method.
- Saves repeat root, real-path, symlink, extension, regular-file, and size checks.
- Files are opened with `r+`, so a disappeared or unrequested path is never created.
- A modification timestamp issued with the read result prevents silently
  overwriting a file changed by another process.
- Monaco and language workers are bundled locally under the existing CSP.
- The renderer's `beforeunload` guard is paired with Electron's main-process
  `will-prevent-unload` event so closing unsaved work uses a native warning.

Verification:

- `npm --prefix apps/desktop test` — 13/13 tests passed, including successful
  overwrite, stale-file refusal, no-new-file behavior, oversized/unsupported
  saves, traversal rejection, and external-symlink rejection.
- `npm --prefix apps/desktop run build` — strict main/preload/renderer TypeScript
  checks and the production Electron Vite build passed.
- `npm --prefix apps/desktop run preview` — the production app launched and was
  visually verified; runtime logged `contextIsolation=true`,
  `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint`, `npm test`, and `npm run build` — the unchanged web application
  passed lint, its focused harness, and its production Next.js build.

### 2026-08-20 — Phase 2C started

- Marked only Monaco editing and secure existing-file saving **In Progress** before
  implementation.
- Explicitly deferred tabs, file creation/rename/delete, terminal, AI, Supabase,
  authentication, and documentation features.

### 2026-08-20 — Phase 2B complete

Changed files:

- `apps/desktop/src/shared/workspace.ts` — added the typed `readFile` channel,
  text-file result type, and safe error-code contract.
- `apps/desktop/src/main/workspace-files.ts` — added the extension allowlist,
  2 MiB limit, regular-file check, canonical root enforcement, binary detection,
  strict UTF-8 decoding, and safe file result.
- `apps/desktop/src/main/workspace-ipc.ts` — added one trusted-window,
  renderer-authorization-bound read handler with user-safe errors.
- `apps/desktop/src/preload/index.ts` — exposed one new narrow `readFile(relativePath)`
  method without exposing raw IPC or Node APIs.
- `apps/desktop/src/renderer/src/Explorer.tsx` — made file rows selectable, retained
  lazy folder behavior, reset stale trees on workspace changes, and highlighted the
  active file.
- `apps/desktop/src/renderer/src/App.tsx` and `styles.css` — added race-safe loading,
  read-only content, empty, unsupported, and read-error Editor states.
- `apps/desktop/src/main/workspace-files.test.ts` — expanded security coverage from
  4 to 8 tests.
- Desktop README and this roadmap — documented the Phase 2B boundary and results.

Security decisions:

- Supported extensions are `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.java`, `.c`,
  `.cpp`, `.h`, `.html`, `.css`, `.json`, `.md`, `.txt`, `.yml`, and `.yaml`.
- The existing lexical and canonical real-path checks run before every file read;
  external symlinks and traversal paths are rejected.
- Only regular files of at most 2 MiB are read. The loaded buffer is checked again
  to limit file-growth races.
- NUL-containing and invalid UTF-8 files are treated as binary and rejected.
- Renderer errors contain a typed category and safe message, never an absolute path.
- Content is rendered as escaped React text in a non-editable `<pre>` viewer.

Verification:

- `npm --prefix apps/desktop test` — 8/8 tests passed for all supported extensions,
  root/nested/empty files, unsupported files, binary data, invalid UTF-8, oversized
  files, directories, traversal, and external symlinks.
- `npm --prefix apps/desktop run build` — strict TypeScript and production build
  passed.
- `npm --prefix apps/desktop run dev` — Electron launched and logged
  `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint` — existing web lint passed with no warnings or errors.
- `npm test` — existing web suggestion harness passed.
- `npm run build` — existing Next.js production build passed.

### 2026-08-20 — Phase 2B started

- Marked the secure read-only file-viewer slice **In Progress** before implementation.
- Explicitly deferred Monaco, editing, saving, tabs, terminal, AI, Supabase,
  authentication, and documentation features.

### 2026-08-20 — Phase 2A complete

Changed files:

- `apps/desktop/src/shared/workspace.ts` — typed IPC channel, result, workspace,
  entry, and preload bridge contracts.
- `apps/desktop/src/main/workspace-files.ts` — root-confined path normalization,
  canonical real-path validation, safe symlink handling, ignore rules, sorting, and
  immediate directory listing.
- `apps/desktop/src/main/workspace-ipc.ts` — trusted-window sender checks, native
  folder selection, in-memory workspace authorization, and safe public errors.
- `apps/desktop/src/main/index.ts` — workspace IPC registration while preserving all
  secure BrowserWindow settings.
- `apps/desktop/src/preload/index.ts` — two narrow methods only: open a folder and
  list a selected-root-relative directory.
- `apps/desktop/src/renderer/src/Explorer.tsx`, `App.tsx`, `styles.css`, and
  `global.d.ts` — Open Folder UI, lazy expandable tree, responsive states, and typed
  renderer bridge.
- `apps/desktop/src/main/workspace-files.test.ts` and `package.json` — focused Node
  tests and desktop test command.
- Desktop TypeScript configs and README — shared contract coverage and Phase 2A
  usage description.

Security decisions:

- The renderer has no direct Node, filesystem, path, shell, terminal, or process
  access.
- Only the current main window may invoke the two allowlisted workspace channels,
  and its selected root authorization is bound to that renderer instance.
- The renderer never receives the absolute workspace root.
- All renderer paths are untrusted relative strings and are checked lexically and
  after symlink resolution.
- External/broken symlinks and non-file/non-directory entries are omitted.
- Directory reads are non-recursive, lazy, read-only, and limited to 5,000 immediate
  entries.

Verification:

- `npm --prefix apps/desktop test` — 4/4 tests passed for traversal rejection,
  absolute-path rejection, ignored directories, lazy child listing, safe internal
  symlinks, and blocked external symlinks.
- `npm --prefix apps/desktop run build` — TypeScript and production build passed.
- `npm --prefix apps/desktop run dev` — Electron launched and logged
  `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint` — existing web lint passed with no warnings or errors.
- `npm test` — existing web suggestion harness passed.
- `npm run build` — existing Next.js production build passed.

### 2026-08-20 — Phase 2A started

- Marked only the local-folder and read-only Explorer slice **In Progress** before
  implementation.
- Explicitly deferred file reading, Monaco, editing, saving, terminal, AI, Supabase,
  authentication, and documentation features.

### 2026-08-20 — Phase 1 complete

- Added an isolated Electron + React + TypeScript application in `apps/desktop`.
- Added separate Electron Vite and TypeScript configurations and a local lockfile.
- Created Electron main, preload, and renderer entry points.
- Configured `contextIsolation: true`, `nodeIntegration: false`, renderer sandboxing,
  web security, denied permission requests, blocked new windows, and guarded
  navigation.
- Kept the preload boundary empty; it exposes no filesystem, terminal, process,
  Node, Supabase, or AI capability.
- Added a responsive professional IDE shell with Explorer, Editor, Observer, and
  Output placeholders plus a disabled Ask Observer button.
- Added desktop development and verification instructions.
- Left the existing Next.js source, package configuration, API routes, and Supabase
  files unchanged.

Verification:

- `npm --prefix apps/desktop run typecheck` — passed as part of the desktop build.
- `npm --prefix apps/desktop run build` — passed; main, empty preload, and renderer
  production bundles generated successfully.
- `npm --prefix apps/desktop run dev` — passed; Electron window launched and logged
  `contextIsolation=true`, `nodeIntegration=false`, and `sandbox=true`.
- `npm run lint` — passed with no warnings or errors.
- `npm test` — passed all manual-suggestion harness assertions.
- `npm run build` — existing Next.js production build passed.
- Dependency installation audit reported zero vulnerabilities.

### 2026-08-20 — Phase 1 started

- Marked the secure desktop shell tasks **In Progress** before implementation.
- Scope is limited to an isolated Electron/React shell with placeholder panels;
  privileged APIs and product integrations remain deferred.

### 2026-08-20 — Roadmap established

- Created the living desktop IDE roadmap.
- Recorded the proposed package layout, seven delivery phases, reuse boundaries,
  architecture decisions, security rules, verification gates, and next task.
- No desktop application code or dependencies were added.

Verification:

- Confirmed the roadmap covers the secure Electron shell, local projects and files,
  Monaco editing, terminal/output, Observer AI, documentation, and packaging.
- Confirmed all implementation tasks remain **Not Started**.

## Verification log

| Date | Step | Result | Evidence |
|---|---|---|---|
| 2026-08-20 | Roadmap creation | Complete | Planning document created; no implementation status promoted. |
| 2026-08-20 | Phase 1 desktop type/build | Complete | Electron main, preload, and renderer bundles built successfully. |
| 2026-08-20 | Phase 1 launch smoke test | Complete | Desktop launched; runtime logged secure BrowserWindow flags. |
| 2026-08-20 | Existing web regression checks | Complete | Lint, tests, and Next.js production build passed. |
| 2026-08-20 | Phase 2A path security tests | Complete | 4/4 traversal, ignore, lazy-listing, and symlink tests passed. |
| 2026-08-20 | Phase 2A desktop checks | Complete | TypeScript/build and secure Electron launch passed. |
| 2026-08-20 | Phase 2A web regression | Complete | Existing lint, tests, and Next.js build passed. |
| 2026-08-20 | Phase 2B file security tests | Complete | 8/8 extension, content, size, binary, and boundary tests passed. |
| 2026-08-20 | Phase 2B desktop checks | Complete | TypeScript/build and secure Electron launch passed. |
| 2026-08-20 | Phase 2B web regression | Complete | Existing lint, tests, and Next.js build passed. |
| 2026-08-20 | Phase 2C secure save tests | Complete | 13/13 read, language-map, versioned-write, boundary, and no-create tests passed. |
| 2026-08-20 | Phase 2C desktop checks | Complete | TypeScript/build and production Electron launch passed with secure flags. |
| 2026-08-20 | Phase 2C web regression | Complete | Existing lint, tests, and Next.js build passed unchanged. |
| 2026-08-20 | Phase 3A operation tests | Complete | 20/20 file security, mutation, and tab-path tests passed. |
| 2026-08-20 | Phase 3A desktop checks | Complete | TypeScript/build and secure Electron launch passed. |
| 2026-08-20 | Phase 3A web regression | Complete | Existing lint, tests, and Next.js build passed unchanged. |
| 2026-08-20 | Phase 3B watcher/reconciliation tests | Complete | 23/23 tests passed, including batching, ignore, suppression, cleanup, clean reload, dirty conflict, and deletion cases. |
| 2026-08-20 | Phase 3B desktop checks | Complete | TypeScript/build and secure Electron launch passed. |
| 2026-08-20 | Phase 3B web regression | Complete | Existing lint, tests, and Next.js build passed unchanged. |
| 2026-08-20 | Phase 4A terminal lifecycle tests | Complete | 26/26 tests passed; terminal authorization, routing, cleanup, and environment cases passed. |
| 2026-08-20 | Phase 4A native PTY smoke test | Complete | Electron-ABI node-pty input/output/resize/cwd/exit test passed on macOS. |
| 2026-08-20 | Phase 4A desktop checks | Complete | TypeScript/build, visual UI check, and secure Electron launch passed. |
| 2026-08-20 | Phase 4A web regression | Complete | Existing lint, tests, and Next.js build passed unchanged. |
| 2026-08-20 | Phase 4B runner and diagnostic tests | Complete | 30/30 tests passed; Python/JavaScript success, Python errors, Stop, path authorization, command map, and diagnostic filtering passed. |
| 2026-08-20 | Phase 4B desktop checks | Complete | Strict TypeScript/build and secure Electron launch passed. |
| 2026-08-20 | Phase 4B web regression | Complete | Existing lint, focused tests, and Next.js build passed without web source changes. |
| 2026-08-20 | Phase 5A auth/session tests | Complete | 34/34 tests passed; encrypted persistence, restore, sign-in/error, sign-out, and unavailable-storage cases passed. |
| 2026-08-20 | Phase 5A Supabase connectivity | Complete | Existing project rejected a deliberate invalid email/password request as expected. |
| 2026-08-20 | Phase 5A desktop checks | Complete | Strict TypeScript/build, renderer secret scan, signed-out auth gate, and secure Electron launch passed. |
| 2026-08-20 | Phase 5A web regression | Complete | Existing lint, focused tests, and Next.js build passed without web auth source changes. |
| 2026-08-30 | Phase 5B focused Observer tests | Complete | 40/40 desktop tests passed across five modes, context selection, actions, signed-out behavior, outcomes, privacy, and API errors. |
| 2026-08-30 | Phase 5B API/RLS regression | Complete | Strict bearer parsing/configuration and existing ownership RLS policy guards passed; cookie fallback remains intact. |
| 2026-08-30 | Phase 5B desktop checks | Complete | Strict TypeScript, production build, and renderer/preload secret-value scan passed. |
| 2026-08-30 | Phase 5B web regression | Complete | Existing manual harness and Next.js production build passed with additive bearer support. |
| 2026-08-30 | Phase 6 Markdown and Observer tests | Complete | 45/45 desktop tests passed for safe GFM rendering, outlines, `.mdx` round-trip/conflicts, large documents, four documentation modes, privacy, and bearer transport. |
| 2026-08-30 | Phase 6 desktop checks | Complete | Strict main/preload/renderer TypeScript and the Electron production build passed. |
| 2026-08-30 | Phase 6 web regression | Complete | Existing root tests, lint, and Next.js production build passed with no web UI changes. |
| 2026-08-30 | Phase 7A search tests | Complete | 54/54 desktop tests passed, including text/case/word/regex modes, patterns, ignores, secrets, binary/large files, limits, cancellation, symlinks, and Monaco selection mapping. |
| 2026-08-30 | Phase 7A desktop checks | Complete | Strict main/preload/renderer TypeScript and Electron production build passed with the pinned platform ripgrep dependency. |
| 2026-08-30 | Phase 7A web regression | Complete | Existing root tests, lint, and Next.js production build passed with no web application source changes. |
| 2026-08-31 | Phase 7B recent-project tests | Complete | 60/60 desktop tests passed, including add, deduplication, ordering, limit, removal, unavailable paths, schema privacy, and replaced-symlink reopening. |
| 2026-08-31 | Phase 7B desktop checks | Complete | Strict main/preload/renderer TypeScript and the Electron production build passed. |
| 2026-08-31 | Phase 7B web regression | Complete | Existing root tests, lint, and Next.js production build passed with no web application source changes. |
| 2026-08-31 | Phase 7C command tests | Complete | 67/67 desktop tests passed, including palette state, fuzzy filtering, navigation, execution, disabled reasons, registry collisions, focus restoration, and terminal/Monaco shortcut protection. |
| 2026-08-31 | Phase 7C desktop checks | Complete | Strict main/preload/renderer TypeScript and the Electron production build passed. |
| 2026-08-31 | Phase 7C web regression | Complete | Existing root tests, lint, and Next.js production build passed with no web application source changes. |
| 2026-08-31 | Phase 7D focused settings/privacy tests | Complete | 79/79 desktop tests passed, including typed defaults/recovery, local/cloud separation, runtime Monaco mapping, signed-out restrictions, API-key lifecycle/secret-response rejection, permanent exclusions, data clearing, tab metadata, and settings command access. |
| 2026-08-31 | Phase 7D Supabase security verification | Complete | Migration applied to the linked project; SQL verification confirmed RLS enabled, owner-only SELECT/INSERT/UPDATE/DELETE policies, UPDATE `USING` and `WITH CHECK`, explicit grants, and matching local/remote migration history. Local Docker remained unavailable. |
| 2026-08-31 | Phase 7D desktop checks | Complete | Strict TypeScript, Electron production build, and desktop output secret scan passed. |
| 2026-08-31 | Phase 7D web regression | Complete | Root tests, lint, and Next.js production build passed with cookie behavior preserved and additive bearer APIs. |
| 2026-08-31 | Phase 7E focused Git tests | Complete | 88/88 desktop tests passed, including temporary-repository status/diff, branches, staged/unstaged/untracked/deleted/renamed/binary/space paths, limits, timeout/cancellation, and arbitrary-command rejection. |
| 2026-08-31 | Phase 7E desktop checks | Complete | Strict main/preload/renderer TypeScript and the Electron production build passed. |
| 2026-08-31 | Phase 7E web regression | Complete | Root tests, lint, and Next.js production build passed with no web application source changes. |
| 2026-08-31 | Phase 8 context-engine tests | Complete | 96/96 desktop tests passed, including all actions, priorities, imports/tests/config/rules, budgets, exclusions, redaction, symlink safety, cache invalidation, preview removal, and complete-file confirmation. |
| 2026-08-31 | Phase 8 backend safety | Complete | Structured schema/size/secret tests, untrusted prompt-injection delimiters, metadata-only logging, root harnesses, lint, and Next.js production build passed. |
| 2026-08-31 | Phase 8 desktop/security checks | Complete | Strict desktop TypeScript, Electron production build, and build/fixture credential scans passed. |
| 2026-08-31 | Phase 9A structured-edit/checkpoint tests | Complete | 105/105 desktop tests passed across schema/range/path/hash/stale/dirty/diff/action/checkpoint/retention and no-auto-execution boundaries. |
| 2026-08-31 | Phase 9A desktop/security checks | Complete | Strict TypeScript, Electron production build, and desktop output credential scans passed. |
| 2026-08-31 | Phase 9A web regression | Complete | Backend harnesses, lint, and Next.js production build passed; cookie/bearer auth remained compatible and no migration was needed. |
| 2026-09-01 | Phase 9B focused workflow/transaction tests | Complete | 115/115 desktop tests passed, including strict plans/sets, context, path/secret/binary/limit checks, update/create, stale/collision/dirty preflight, checkpoint failure, mid-write restoration, undo conflict, bearer auth, review actions, and explicit-only verification. |
| 2026-09-01 | Phase 9B desktop/security checks | Complete | Strict TypeScript, Electron production build, and desktop output credential/private-key scans passed. |
| 2026-09-01 | Phase 9B web regression | Complete | Backend schema/privacy harnesses, lint, and Next.js production build passed; authenticated cookie/bearer behavior remains shared and no migration was needed. |
| 2026-09-01 | Phase 10B focused insights tests | Complete | 132/132 desktop tests passed across metrics, presets, recommendations, strict privacy schema, lifecycle, sessions, exports, corruption recovery, and UI boundaries. |
| 2026-09-01 | Phase 10B desktop/privacy checks | Complete | Strict TypeScript, Electron production build, generated JSON/CSV privacy scan, and desktop credential/private-key scan passed. |
| 2026-09-01 | Phase 10B web regression | Complete | Root tests, lint, and Next.js production build passed; no web source or Supabase schema change was required. |
| 2026-09-02 | Phase 11A focused context tests | Complete | 140/140 desktop tests passed across sources/actions, confirmation, priorities/budgets, duplicates, secrets/redaction, symlinks, stale choices, session clearing, preview, and zero-auto-AI boundaries. |
| 2026-09-02 | Phase 11A desktop/privacy checks | Complete | Strict TypeScript, Electron production build, credential scan, and no-persistence source scan passed. |
| 2026-09-02 | Phase 11A web/backend regression | Complete | Structured attachment validation and metadata-only logging harnesses, lint, and Next.js production build passed; no Supabase migration was required. |
| 2026-09-02 | Phase 11B2 automated security and regression | Complete | 145/145 desktop tests (with loopback permission), 11/11 extension tests, both strict TypeScript/production builds, root tests, lint, and Next.js build passed. |
| 2026-09-02 | Phase 11B2 live UI acceptance | In Progress | Rebuilt unpacked extension reloaded and Electron Browser Extension Settings rendered; full paired selection Add/Reject/restart/revoke flow still requires a reliable interactive window pass. |
| 2026-09-03 | Phase 12A deterministic relationship tests | Complete | 153/153 desktop tests passed, including signal confidence, lifecycle, decisions, safety boundaries, Context Tray provenance, and prior regressions. |
| 2026-09-03 | Phase 12A builds/privacy checks | Complete | Desktop strict TypeScript/Electron build, root tests/lint/Next.js build, extension tests/type/build, secret/privacy scans, and whitespace validation passed. |
| 2026-09-03 | Phase 12B documentation-update tests | Complete | 160/160 desktop tests passed across explicit generation, all supported actions, stale/range/path/Markdown protections, writable preflight, review, checkpoint, rollback, and prior regressions. |
| 2026-09-03 | Phase 12B builds/privacy checks | Complete | Desktop strict TypeScript/Electron build, root tests/lint/Next.js build, extension tests/type/build, generated secret and request/analytics privacy scans, and whitespace validation passed. |
| 2026-09-03 | Phase 13A website visual audit | Complete | Read-only `main` tree/show/grep inspection captured exact palette, typography, Tailwind 3.4.19 primitives, component states, and responsive patterns without switching branches. |
| 2026-09-03 | Phase 13A documentation checks | Complete | Branch, exact-token provenance, WCAG contrast, Markdown structure, docs-only scope, whitespace, and staged-diff checks passed; no application source changed. |
| 2026-09-03 | Phase 13B desktop regressions | Complete | Strict TypeScript, 160/160 desktop tests with loopback permission, root tests/lint, Electron production build, and source theme-literal scans passed. |
| 2026-09-03 | Phase 13B visual QA | Complete | Development and production Electron windows showed a coherent cream/card/sand/bronze shell with a source-approved ink/coffee terminal and no visible black, navy, violet, or purple surfaces. |
| 2026-09-03 | Phase 13C1 Observer and Context Tray regressions | Complete | Strict TypeScript, 160/160 desktop tests with loopback permission, root tests/lint/build, Electron production build, and token/whitespace scans passed. |
| 2026-09-03 | Phase 13C1 live visual QA | Complete | Electron verified exact computed theme colors, visible bronze focus, local Tray add/remove/clear and collapse/expand, long-preview containment, and 230px/380px Observer widths; populated screenshot saved under docs/screenshots. |
| 2026-09-04 | Phase 13D automated regressions | Complete | Desktop 164/164 tests and production build, root tests/lint/build, extension 11/11 tests/type/build/manifest, focused focus/color tests, and whitespace validation passed. |
| 2026-09-04 | Phase 13D live macOS UI/accessibility QA | Complete | Safe fixture smoke covered edit/save, search, terminal, Run/output, Git/diff, Markdown/empty files, Settings, Observer pre-send, Context Tray, keyboard focus/trapping/Escape/restoration, pointer panel resizing, and 1197px/964px/762px window widths. |
| 2026-09-04 | Phase 13D Windows QA | Not run | No Windows environment was available; no Windows testing is claimed. |

## Live Observer · experimental — 2026-09-24

Implemented as one focused iteration alongside manual Ask Observer and automatic
failed-run help. No database migration or document support was added.

- Separate session-only switch, off by default. Open a project, select a provider,
  then turn on **Live Observer · experimental** in the Observer panel and accept
  the native disclosure. It explicitly includes unsaved code. Changing provider,
  project, signing out, or reloading disables the experiment.
- Python and JavaScript (`.py`, `.js`, `.mjs`, `.jsx`) active-editor changes only.
  Opening files, cursor movement, or inactivity without an edit do not request AI.
  Pause is selectable before enabling (2/4/8 seconds). Defaults and limits live in
  `apps/desktop/src/shared/live-observer.ts`: 4 seconds, 30-second cooldown,
  10 requests/hour. Limits survive toggling the switch.
- Main-process policy checks preserve Observer enablement, AI context exclusions,
  secret screening, diagnostics preference, context budgets, and complete-file
  confirmation. With **Confirm complete files** enabled, a nearby excerpt covering
  the whole file is blocked with a specific explanation; use manual preview.
  Context contains at most 6,000 nearby code characters, source line ranges,
  cursor location, and up to three permitted nearby diagnostics. No Context Tray,
  related files, terminal output, history storage, or raw keystrokes are included.
- One compact Monaco content widget and Observer-panel fallback; Dismiss/Escape,
  cancellation on editing/context/focus changes, and generation checks for late
  replies. Explicit requests and existing error help take priority. Dismissed or
  already considered unchanged code is not requested again. The provider contract
  allows `NO_SUGGESTION`, treats source/comments as untrusted, and prohibits claims
  of testing or fixes. Demo deliberately returns no suggestion.
- Proposed edits require **Review diff**, then the existing **Accept Change** action
  (explicit Apply). Exact text/hash checks, checkpoint creation, and Undo Observer
  Change are reused. Applied content remains unsaved with auto-save blocked.
  A UI-discovered Monaco diff teardown error was fixed by detaching models before
  disposing them; the rest of the review workflow is unchanged.

Verification:

- Desktop suite: 195/195 tests passed, including 12 deterministic Live Observer
  tests covering timing, cooldown/hourly budgets, cancellation/late replies,
  no-suggestion, exclusions/privacy, dismissal, and explicit-review handoff.
- Backend harness: existing suites plus actual route dispatch with mocked provider
  responses, no-history validation, invalid live contexts, and no-suggestion passed.
- `npm --prefix apps/desktop run test:live-ui`: Electron interactions passed using
  the actual React controls, Monaco editor/content widget, and Monaco diff. Checks
  include off default, toggle, pause selector, opening/cursor versus content edits,
  focus preservation, Dismiss/Escape, stale disabled Apply, and explicit-only Apply.
  The fixture mocks consent/provider/application callbacks; existing checkpoint
  tests verify persistence/Undo. No live workspace or provider is used.
- Desktop strict type checks and production build, root tests/lint and Next.js
  production build passed. New Live Observer files and the touched review component
  pass scoped ESLint. Broad desktop lint still reports three errors and three warnings
  in `App.tsx`, confirmed unchanged against HEAD (unused variables and existing hook
  dependencies). Loopback-dependent tests require sandbox permission.
- Remaining: signed-in native consent/end-to-end provider acceptance, real-provider
  usefulness/accuracy/noise/latency/cost evaluation, and Windows UI acceptance.
  Mocked tests establish control flow, **not model accuracy**. The rapid Electron
  fixture still logs a Monaco SuggestModel disposal warning; no uncaught renderer
  exception remains after the diff cleanup fix. Assess it in live-provider QA.

## Observer repair and functional audit — 2026-09-28

**Local fixes verified; deployed database setup remains blocked.**

A read-only check against the Supabase backend configured in `.env.local` returned
`PGRST205` for `suggestions`, `suggestion_outcomes`, and `desktop_user_settings`.
No user records or credentials were printed. This establishes missing backend
schema as the cause of the reported history-save and privacy-settings errors.

- Manual Explain and other suggestion responses now survive optional history
  storage failure: return the generated answer with a visible history warning,
  omit its ID, and do not retry the provider. Both desktop and web display the
  warning; ID-less answers do not send outcome writes. Normal saved IDs and
  automatic no-history requests remain intact.
- Settings errors distinguish missing schema, permission failures, and connection
  problems. Live Observer preserves the actionable error instead of replacing it
  with a generic message. It still sends nothing when privacy settings cannot be
  loaded; no unsafe fallback or privacy override was introduced.
- The expanded UI regression caught an asynchronous Monaco diff teardown race.
  Text-model disposal now follows the queued diff cancellation; the uncaught
  `no diff result available` error no longer occurs in the fixture. A separate
  nonfatal upstream SuggestModel disposal warning is still observable.
- Added `npm run check:observer-backend`: read-only, zero-row checks of required
  tables/columns, with references to the existing migrations. It currently fails
  correctly for the three absent tables. It does not modify or migrate databases.

Verification: **196/196 desktop tests passed**, covering automatic failed-run
help, Live Observer, settings, edits/checkpoints, and existing regression suites.
Backend tests now exercise both desktop and web history success/failure, thrown
storage errors, no duplicate provider generation, no-history requests, and
missing/denied settings. The real Electron/Monaco UI fixture passes Live toggle,
edit versus cursor events, inline/fallback cards, Dismiss/Escape, focus retention,
diff preview, stale Apply rejection, explicit-only Apply, and the manual Explain
history-warning display/dismissal. Desktop type checks/build, Next.js build,
root lint and scoped changed-file lint pass. Provider responses and application
callbacks in automated tests are mocked; no model-accuracy claim is made.

Remaining database repair: review/apply the existing repository migrations to the
**same project configured in `.env.local`**, preserving their ownership RLS/grants.
The history schema is in `supabase/migrations/20260820100515_add_stuck_suggestion_feedback.sql`;
desktop privacy settings are in `supabase/migrations/20260831061842_add_desktop_user_settings.sql`.
Check already-applied migrations first; do not reset the database or blindly rerun
CREATE statements against partially installed schema. No new migration was added.

No database administration connection is configured here. Automatic approval
review rejected inspecting an unspecified Chrome session because of unrelated
private tabs. An explicitly authorized Supabase SQL Editor session (or an approved
database administration connection) is needed to finish setup. Afterward rerun
`npm run check:observer-backend`, restart/reload the backend and Electron, and
verify signed-in settings save/load, history/outcomes, and a consented live-provider
request. Until then, automatic features remain deliberately blocked.

## Live Observer trigger reliability and status repair — 2026-09-28

**Implemented and verified locally; live-provider acceptance remains pending.**
Code inspection confirmed that whitespace events cleared pending meaningful edits,
rate-limit branches discarded candidates, and generic activity statuses concealed
the reason Live Observer was paused. The renderer also captured the cursor before
Monaco had finished processing a content event.

- Meaningful edits followed by Enter or trailing spaces retain their pending
  suggestion. Every content change restarts the typing pause and captures the
  latest buffer/cursor after Monaco updates. Whitespace-only changes without a
  pending edit do not start requests; indentation changes on Python code lines
  remain meaningful. Content changes abort in-flight work and invalidate replies.
- Latest candidates survive cooldown/hourly waits, subject to the same active,
  focused, permitted file and current activity. Separate statuses explain typing
  pause, cooldown, hourly cap, privacy checking, and elapsed provider response
  time. Requests are not retried automatically after errors or no-suggestion.
  Defaults remain configurable: 4-second pause, 30-second cooldown, 10/hour.
- Blockers identify complete-file confirmation, excluded/protected paths,
  suspected secrets, and context limits. Eligible size/complete-file blockers
  offer **Review with Ask Observer**, using the existing manual Context Preview
  without sending or asserting consent. Privacy settings are not weakened.
- Manual Observer, automatic error help, reviews, and dialogs have specific paused
  messages. Disabling, file switches, focus loss, and competing activity cancel
  queued/in-flight work. A new edit is required after these interruptions.
- Manual action logic, provider prompts, supported languages, theme, and existing
  diff/hash/checkpoint/Undo workflows are unchanged in this repair. No migrations,
  automatic edits, saves, execution, commits, or pushes were performed.

Verification:

- **219/219 desktop tests passed**, including **36 Live Observer tests** covering
  code→Enter→pause, trailing whitespace, whitespace-only edits, Python indentation,
  cooldown/latest-pause queuing, hourly budgets, disable/file/focus cancellation,
  late responses, no suggestion, dismissals, privacy blockers, competing activity,
  and renderer content-event/cursor snapshot handling.
- `npm --prefix apps/desktop run test:live-triggers` passed with the actual
  EditorWorkspace/Monaco, Live Observer controls, Context Preview, and real
  controller using deterministic time and mocked policy/provider responses.
  Visible status transitions, latest cursor, manual-preview-only handoff,
  competing activity, stale responses, and disable were exercised.
- Existing `test:live-ui` passed, including suggestion dismissal, diff preview,
  stale Apply rejection, and explicit-only application. Its known nonfatal Monaco
  SuggestModel disposal warning remains; no uncaught renderer exception occurred.
- Desktop type checks and production build, root tests/lint and Next.js production
  build passed. Scoped lint for the new Live Observer modules/fixtures passed.
  `App.tsx` retains its pre-existing three unused-variable errors and three hook
  dependency warnings; these unrelated issues were not changed.

Manual acceptance: restart the desktop build, open a permitted Python/JavaScript
file, and enable Live Observer after reading its session consent. Make a code edit,
press Enter or add trailing spaces, and stop typing: the pause should restart and
then advance to privacy checking/provider wait. Make another meaningful edit
during cooldown: the latest edit should remain queued until both waits expire.
Whitespace alone must not request help. With **Confirm complete files** enabled,
a short file should show its exact blocker; **Review with Ask Observer** must open
Context Preview and wait for explicit sending. Check that manual requests,
reviews/dialogs, blur, file switches, and Off cancel work. Demo returning no
suggestion is expected.

Remaining: signed-in native consent and real backend/provider acceptance,
real-provider latency/usefulness/noise/cost, and Windows UI testing. The previously
reported backend schema availability issue was not repaired or rechecked in this
iteration; unavailable privacy settings must still block automatic sending.
Mocked responses verify control flow and UI behavior, **not AI accuracy**.

## Manual code Explain and follow-up conversation — 2026-09-29

**Implemented locally; live-provider quality and signed-in acceptance pending.**
The previous Live Observer status was reverified before changes: 219/219 desktop
checks and the real Monaco Live trigger fixture passed. This iteration changes
manual code Explain only; Live Observer, automatic error help, document actions,
editable modes, and multi-file provider contracts retain their behavior.

- Explain has its own read-only prompt: overview, important logic, inputs/outputs,
  assumptions, pitfalls, and useful examples, with detail scaled to complexity.
  The old 1–3 sentence restriction is removed. Provider output budgets allow 6,000
  tokens; strict parsing reports limit/incomplete/invalid responses instead of
  silently accepting truncation. Explain cannot return edit proposals.
- Optional guidance is previewed with selected code, otherwise the current
  symbol/nearby lines. Automatic imports and Context Tray attachments are excluded
  from this focused action, with that scope explained in the UI. Full-file
  selections/functions retain complete-file consent requirements.
- Session-only, bounded follow-ups reuse exactly the originally approved context.
  Privacy, exclusions, secrets and size limits are checked on every send; no
  transcript is stored in the database. Old complete turns are omitted explicitly.
  Changed/unavailable sources get an older-snapshot label and explicit refresh
  through Context Preview. Project change/clear/cancel invalidates late replies.
- Safe Markdown/code blocks, scroll, copy, loading/cancel, duplicate-send guards,
  actionable errors, and New explanation/Clear controls reuse the existing theme.
  Remote images/active HTML and executable links are not rendered.

Configuration, exact manual steps and a four-case evaluation checklist are in
[`MANUAL_EXPLAIN.md`](./MANUAL_EXPLAIN.md). Evaluation covers simple functions,
branching, async behavior and missing dependencies; no provider quality score or
accuracy claim is inferred from mocked tests. No paid provider calls, migrations,
commits or pushes were performed.

Verification:

- **231/231 desktop tests passed**, including 11 new session/privacy/cancellation
  tests and focused Explain scope/complete-file-consent assertions. Existing
  context-tray regression assertions run against Improve Code, whose attachment
  behavior remains intact; Explain separately tests its narrower active-file scope.
- Root tests passed: Explain-specific prompts, each provider's output budget using
  mocked fetch, strict read-only parsing/limit errors, bounded conversation route
  validation, authentication/no-history dispatch, IPC preview authorization and
  project isolation. Existing manual/automatic/Live contracts remain covered.
- `test:explain-ui` passed using real React Observer controls, Context Preview and
  the production conversation hook/component with a mocked provider and policy.
  It exercises guidance, safe Markdown/fences, copy, original-snapshot followups,
  stale source labels, explicit refresh, history omission, cancellation, duplicate
  prevention, privacy errors, and late responses after clear/project switching.
  Visual review checked the coffee/cream layout and corrected code-block contrast.
- Existing `test:live-ui` passed, including Monaco content widgets, diff review,
  stale Apply rejection, explicit-only application and history-warning handling.
  Its previously documented nonfatal upstream Monaco disposal warning remains.
- Desktop strict type checks and production build, Next.js production build,
  root lint, and scoped lint for new/changed Explain modules passed. Broader
  desktop lint still reports pre-existing issues: three unused variables and three
  hook warnings in `App.tsx`, plus the unused `lineNumberAt` helper in
  `project-context.ts` (confirmed present in HEAD). They were not changed here.

Remaining checks: signed-in native complete-file consent, real backend settings
availability, live-provider quality/latency/cost and Windows UI acceptance. The
prior missing-backend-schema issue is not repaired/rechecked in this iteration;
unavailable privacy settings still block sends with an actionable message.
Automated correctness is established for the tested flows; AI accuracy is not.

## Manual Fix Code — implemented, provider acceptance pending (2026-09-29)

The prior Live Observer iteration was rechecked: its controller suite and real
Monaco/Electron trigger fixture pass, including code → Enter → pause, trailing
spaces, whitespace-only suppression, queued cooldown, privacy/activity blockers,
provider time, disable cancellation and stale response rejection. Existing Explain
and Live card/diff UI fixtures also pass. The documented nonfatal upstream Monaco
disposal warning remains in the older Live fixture.

Manual **Fix Error** is now **Fix Code**, retaining `fix_error` internally. It
accepts code with no diagnostics, previews the exact selection plus bounded
read-only surroundings, or the entire active unsaved buffer. Oversized scope is
rejected explicitly instead of silently trimmed. Optional expected behavior,
permitted diagnostics and version-labeled run evidence are previewed together.
Exclusions, secret screening, complete-file consent and authenticated server-only
provider access remain in place.

A dedicated prompt/response contract distinguishes a justified correction, one
focused clarification, and no clear problem found. Clarification is session-only,
bounded and reuses the approved source; privacy/source checks run on each send.
Safe Markdown, cancellation and project/late-response guards use the existing
Observer layout and coffee/cream theme. Other actions' prompts/contracts remain
separate. No conversation transcript is persisted.

Corrections reuse exact hash/text validation, the existing diff preview, explicit
Accept Change, checkpoint and Undo. Selection boundaries are enforced in main and
provider parsing. Apply leaves the draft unsaved and unverified. Explicit Run again
retains save confirmation, checks the executed source version and reports only
limited run evidence. There are no automatic edits, saves, commands, dependency
installs, other-file changes or migrations. Normal Run behavior is unchanged.

Verification:

- **255/255 desktop tests pass**, including 24 new Fix Code tests covering exact
  selection/full unsaved scope, oversize rejection, no diagnostics, stale run
  evidence, clarification/limits, privacy/consent, source tampering, cancellation,
  valid/invalid edits, preserving unrelated changes, checkpoint Undo, and guarded
  Python/CommonJS/ESM execution/source mismatch rejection.
- Root tests pass: Fix-specific prompts/outcomes/parser failures, mocked output
  budgets for all providers, authenticated route/no-history behavior, IPC preview
  authorization, clarification/project isolation and other-action regressions.
- `test:fix-ui` passes with actual EditorWorkspace/Monaco selection events,
  ObserverPanel, Context Preview, Fix hook/card, Monaco diff and main session/
  context/checkpoint logic. It exercises consent cancellation, safe Markdown,
  clarification, no-problem, invalid/stale edits, explicit Apply/Undo, privacy,
  duplicate prevention, cancellation and project isolation. Provider, policy,
  consent and application callbacks are fixture doubles; the signed-in native
  App/save/run flow is still a manual acceptance item.
- `test:explain-ui`, `test:live-ui`, and `test:live-triggers` pass.
- Desktop strict type checks, Electron production build, Next.js build, root lint
  and focused module lint pass. Broader desktop lint retains four existing unused
  variable errors and three existing hook warnings in App/project-context; this
  iteration does not clean up unrelated baseline issues.

[`FIX_CODE.md`](./FIX_CODE.md) documents limits, scope, privacy, exact manual steps,
runner requirements, fixture coverage and five live-provider evaluation cases:
syntax, undefined variable, ambiguous incomplete function, stated logic error,
and already-correct code. No paid API calls were made; mocked correctness tests
are not evidence of AI accuracy. Remaining checks include real provider quality/
latency/cost, native complete-file/save/run dialogs, actual backend settings
availability and Windows acceptance. JavaScript guarded verification requires
Node's synchronous load-hook support; unsupported runtimes must not claim verified
execution. The earlier backend schema availability issue remains outside scope.

The user explicitly requested a local commit for this iteration. No push is part
of this task.

## Manual Improve Code — implemented, provider acceptance pending (2026-09-29)

The previous Fix Code iteration was rechecked, not assumed complete. Its unit,
privacy, IPC, route, checkpoint and runner regressions pass. The Fix UI fixture
initially exposed Monaco's “no diff result available” teardown race. Waiting for
its computed diff before Apply made the fixture pass without hiding renderer
errors. Signed-in/native and live-provider acceptance remain outstanding.

Improve Code now offers Readability & maintainability (default) or Performance,
plus optional instructions. Selection takes priority; otherwise the exact current
function is previewed. No function means selection or explicit file approval is
required. No mandatory code is silently truncated. Function resolution is isolated
from other actions; conservative unsupported/ambiguous forms require selection.
Optional bounded project conventions/test configuration is read-only, removable
and privacy-screened in Context Preview. Context Tray/imported code is not added
automatically for this action.

A dedicated prompt and outcome contract distinguish one justified improvement,
clarification, no worthwhile improvement, and a correctness issue requiring an
explicit Fix Code handoff. Results explain rationale, assumptions/trade-offs and
existing verification options. Performance claims must distinguish reasoning from
measurements; no tests, benchmark results or behavior preservation are invented.
Clarifications are bounded/session-only and recheck approved context, source and
privacy. Authenticated backend/server keys, exclusions and complete-file consent
remain intact; no transcripts or database changes were added.

The existing cancellable session checks, structured edit validation, diff preview,
explicit Accept Change, checkpoint/Undo and source-aware Run again controls are
reused. Apply stays in memory, preserves unrelated unsaved code and is unverified.
There is no automatic save, execution, installation or multi-file editing. The
coffee/cream theme and other Observer/proactive contracts remain intact.

Verification:

- **279/279 desktop tests passed**, including 24 new Improve tests for exact
  selection/function/file approval, long/oversized functions, goal/outcome handling,
  clarification limits, secrets/consent/privacy, readonly configuration, stale or
  invalid edits, cancellation/project isolation and checkpoint Undo.
- Root tests passed: dedicated prompts, four outcomes, strict parsing/output-limit
  errors, provider budgets with mocked fetch, authenticated route/no-history and
  IPC preview/goal authorization, plus other-action regressions.
- `test:improve-ui` passed with real Monaco selection events, preview, controls,
  card/hook and diff; it covers goals/instructions, fallback approval, clarification,
  no-change, explicit bug handoff/no send, Apply/Undo/no save, stale/invalid edits,
  privacy, duplicate prevention and cancellation/project isolation. Main context,
  session and checkpoint logic are real; provider/policy/consent/application and
  handoff callbacks are controlled doubles. This is not full signed-in App testing.
- `test:fix-ui`, `test:explain-ui` and `test:live-triggers` passed. Strict desktop
  type checks, Electron and Next builds, root lint and focused module lint passed.
  Broader desktop lint retains the same four unused-variable errors and three hook
  warnings; unrelated lint cleanup is not included.

[`IMPROVE_CODE.md`](./IMPROVE_CODE.md) records exact manual steps, scope/grammar
limits, configuration/privacy behavior, and evaluations for duplication, nested
conditions, already-clear code and a potentially behavior-changing performance
proposal. Live-provider quality/cost/latency, native consent/save/run acceptance,
backend settings availability, Windows and packaged startup footprint remain
unverified. The existing TypeScript parser is bundled into main for exact JS/TS
function ranges; no new dependency was installed. Mocked correctness tests are not
AI accuracy or behavior-preservation evidence. No paid API calls or migrations
were made. The user's final instruction authorizes a local commit; no push.

## Shared Project Context — planning only (2026-09-29)

- [x] Inspected current Context Tray, Chrome research handoff, context builders,
  manual/Live Observer, privacy controls and local storage; recorded reuse and gaps.
- [x] Added [Project Context implementation plan](./PROJECT_CONTEXT_PLAN.md) with
  proposed workspace-local notes, compatibility boundaries and phased acceptance tests.
- [ ] Implement and verify Conversation/Project Context tabs over existing state first.
- [ ] Add explicit local goals/tasks/confirmed requirements, then opt-in request inclusion.
- [ ] Address workspace binding of pending browser transfers before durable research.

This pass changes documentation only; no tests/builds were rerun and no new feature
is marked implemented or tested. Earlier verification records remain historical.
No application/settings/database changes, dependency installation, commit or push.

## Shared Project Context — Phase 1 tabs (2026-09-29)

- [x] Implemented Conversation/Project Context tabs around existing mounted state,
  with one tray, attachment count, eligibility copy, keyboard/ARIA navigation,
  visible focus, independent scrolling and explicit return to request controls.
- [x] Tested real mouse/keyboard interaction in the mocked Electron fixture, including
  draft/attachment/request preservation, zero additional requests, cancellation,
  project isolation, diff review, explicit Apply and checkpoint Undo across switches.
- [x] 279 desktop tests, root tests, strict desktop type checks, root/focused lint,
  Electron/Next builds and Improve/Fix/Explain/Live-trigger UI fixtures passed.
- [ ] Full signed-in App/native dialogs, screen-reader and Windows acceptance remain
  unverified; provider quality is not inferred from mocked tests.

See [Project Context plan](./PROJECT_CONTEXT_PLAN.md#phase-1-delivery-evidence-2026-09-29)
for exact evidence and remaining phases. No new persistence, notes, payload/consent
changes or browser-transfer changes. Workspace binding remains a later-phase concern.
No commit or push; unrelated prior planning edits are preserved.

## Context pipeline Phase A — manual Explain scopes/budgets (2026-09-30)

- [x] Explicit selected code/current function/entire active file controls with exact
  unsaved scope and honest unavailable/oversized messages. Replaced Explain's 80-line
  function fallback; synthetic cursor at line 400 in a 453-line function regression passes.
- [x] Shared preparation/preview/desktop/backend/provider budget calculation, conservative
  UTF-8 token estimate and response reserve. Separate local manual Explain ceiling
  inherits existing limits; no automatic increases. Full-file consent/privacy retained.
- [x] Exact snapshot validation, history budgeting, workspace cancellation, no truncation
  and read-only Explain contracts. Model capacities documented; retired configured
  `deepseek-chat` is specifically blocked for manual Explain, without model migration.
- [x] 288 desktop tests, root tests, mocked Explain/Fix/Improve/Live/trigger UI suites,
  desktop typecheck, focused/root lint and Electron/Next builds pass. App/Settings lint
  retains pre-existing issues; standalone root tsc includes incompatible test targets.
- [ ]Full signed-in/native dialogs and real-provider quality/token calibration remain
  unverified. Unsupported/ambiguous Python function syntax requires explicit selection
  or file scope. Shared project notes/research and Live context are still pending.

See [Phase A evidence and manual steps](./CONTEXT_PIPELINE_AUDIT.md#phase-a-delivery--2026-09-30)
for limits, provider sources, actual boundary results and remaining acceptance checks.
No paid calls, migrations, commits or pushes. Earlier unrelated changes are preserved.

## Recommended next task

**2026-10-02 update:** Stop after Observer Engine Phase 0 for review. Resolve the
recorded Python/symlink baseline prerequisites and rerun the desktop suite before
claiming all gates pass. Phase E1 requires an explicit follow-up instruction.
The earlier recommendation below is retained as history and its outstanding
acceptance items are not discharged by this documentation audit.

Phase 13D is complete. Experiment A1 — automatic failed-run explanations — was
authorized on 2026-09-04 and implemented after that phase. Automated verification
passed; interactive/provider acceptance remains In Progress. See
[`AUTOMATIC_RUN_EXPLANATIONS.md`](./AUTOMATIC_RUN_EXPLANATIONS.md) for behavior,
privacy changes, evidence, and a safe fixture-based try-out checklist.

Next: evaluate both experiments with a live provider and safe code fixtures before expanding proactive triggers.
The existing Phase 11B2 live pairing acceptance item and the optional approved-palette review
remain separately tracked and are not expanded into this phase.
