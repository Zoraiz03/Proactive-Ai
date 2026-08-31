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
| Phase 8 | Not Started | Packaging, signing, updates, and release checks |

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

## Phase 8 — Packaging and release readiness

**Goal:** Produce secure, installable, supportable desktop releases.

- [ ] **Not Started** — Choose supported operating-system and CPU targets.
- [ ] **Not Started** — Configure application metadata, icons, and packaged resources.
- [ ] **Not Started** — Package native dependencies such as `node-pty` correctly.
- [ ] **Not Started** — Add macOS code signing and notarization.
- [ ] **Not Started** — Add Windows code signing.
- [ ] **Not Started** — Add Linux packaging targets.
- [ ] **Not Started** — Define a signed and verified update strategy.
- [ ] **Not Started** — Add production Content Security Policy and navigation guards.
- [ ] **Not Started** — Block unexpected new windows, permissions, and external
  navigation.
- [ ] **Not Started** — Add crash reporting and privacy controls if approved.
- [ ] **Not Started** — Create clean-machine installation and upgrade tests.
- [ ] **Not Started** — Document release, rollback, and support procedures.

Required verification:

- [ ] **Not Started** — Signed installers pass platform security checks.
- [ ] **Not Started** — Clean installations launch on every supported platform.
- [ ] **Not Started** — Folder access, Monaco, terminal, auth, and Observer smoke tests
  pass in packaged builds.
- [ ] **Not Started** — Updates verify signatures and preserve user settings.
- [ ] **Not Started** — Renderer bundles and packaged resources contain no secrets.
- [ ] **Not Started** — Existing web release checks still pass.

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

## Recommended next task

Implement **Basic Git status and diff viewer**. Keep Git operations read-only, bounded to
the authorized workspace, outside the renderer process, and free of arbitrary shell input.
