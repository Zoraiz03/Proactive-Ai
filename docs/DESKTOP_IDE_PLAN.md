# Desktop IDE Roadmap

This document is the living implementation plan for adding an Electron desktop
IDE to Proactive AI Workspace without replacing or breaking the existing Next.js
web application.

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
| Phase 3 | Not Started | Complete file explorer and editor workflow |
| Phase 4 | Not Started | Terminal, task output, and diagnostics |
| Phase 5 | Not Started | Authenticated Observer AI integration |
| Phase 6 | Not Started | Documentation editing and preview |
| Phase 7 | Not Started | Packaging, signing, updates, and release checks |

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

- [ ] **Not Started** — Add file and folder creation.
- [ ] **Not Started** — Add rename and delete operations with clear confirmation for
  destructive actions.
- [ ] **Not Started** — Add editor tabs and active-tab navigation.
- [ ] **Not Started** — Preserve dirty buffers when switching files.
- [ ] **Not Started** — Add Save, Save As, and Save All commands.
- [ ] **Not Started** — Detect external file changes and offer reload/compare choices.
- [ ] **Not Started** — Add workspace refresh and filesystem watching.
- [ ] **Not Started** — Add find-in-file and project search.
- [ ] **Not Started** — Persist non-sensitive window and recent-project preferences.

Required verification:

- [ ] **Not Started** — File operations remain confined to the selected root.
- [ ] **Not Started** — Dirty-buffer and external-change scenarios preserve data.
- [ ] **Not Started** — Large directory trees remain responsive.
- [ ] **Not Started** — Relevant automated tests pass.
- [ ] **Not Started** — Desktop and web builds still pass.

## Phase 4 — Terminal, output, and diagnostics

**Goal:** Run project commands intentionally and surface their output and errors.

- [ ] **Not Started** — Add an output panel separate from interactive terminals.
- [ ] **Not Started** — Add `xterm.js` terminal rendering.
- [ ] **Not Started** — Add a controlled `node-pty` integration in the main process.
- [ ] **Not Started** — Start terminal processes only after explicit user action.
- [ ] **Not Started** — Use the selected project root as the terminal working directory.
- [ ] **Not Started** — Stream output through narrowly scoped IPC events.
- [ ] **Not Started** — Resize, restart, and stop terminal sessions safely.
- [ ] **Not Started** — Terminate child processes when the window or application exits.
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

- [ ] **Not Started** — Choose and document the desktop authentication/session flow.
- [ ] **Not Started** — Add desktop sign-in, sign-out, and secure session persistence.
- [ ] **Not Started** — Adapt the existing API authentication boundary for desktop
  clients without weakening web authentication.
- [ ] **Not Started** — Keep the Supabase service-role key and provider-key decryption
  exclusively on the server.
- [ ] **Not Started** — Collect selected text or cursor/nearby context from Monaco.
- [ ] **Not Started** — Add the active file content to explicit Observer requests.
- [ ] **Not Started** — Implement the Observer loading, suggestion, error, Accept, and
  Dismiss states.
- [ ] **Not Started** — Preserve suggestion and outcome persistence under Supabase RLS.
- [ ] **Not Started** — Apply accepted snippets through editor operations with undo
  support.
- [ ] **Not Started** — Add explicit options for including terminal diagnostics or
  selected project files.
- [ ] **Not Started** — Keep AI requests user-triggered unless a later, separately
  approved proactive design is implemented.

Required verification:

- [ ] **Not Started** — Unauthenticated requests are rejected.
- [ ] **Not Started** — Users can access only their own suggestions and outcomes.
- [ ] **Not Started** — No service-role or provider secret appears in renderer bundles,
  logs, IPC messages, or packaged resources.
- [ ] **Not Started** — Ask, Accept, Dismiss, Escape, and shortcut behavior works.
- [ ] **Not Started** — API, RLS, desktop, and web tests pass.

## Phase 6 — Documentation support

**Goal:** Edit and navigate project documentation without corrupting source formats.

- [ ] **Not Started** — Add Markdown source editing in Monaco.
- [ ] **Not Started** — Add a sanitized Markdown preview.
- [ ] **Not Started** — Add side-by-side editor/preview mode.
- [ ] **Not Started** — Add navigation for headings and documentation files.
- [ ] **Not Started** — Decide whether TipTap rich-text documents are a separate file
  type instead of converting Markdown to stored HTML.
- [ ] **Not Started** — Add Observer requests for selected or complete documentation.
- [ ] **Not Started** — Add explicit context selection for related code and documents.

Required verification:

- [ ] **Not Started** — Markdown round-trips without source corruption.
- [ ] **Not Started** — Preview content is sanitized.
- [ ] **Not Started** — Large documents remain responsive.
- [ ] **Not Started** — Documentation Observer requests contain only approved context.
- [ ] **Not Started** — Desktop and web builds still pass.

## Phase 7 — Packaging and release readiness

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

## Security rules

- `contextIsolation` must remain enabled.
- `nodeIntegration` must remain disabled.
- Renderer sandboxing should remain enabled unless a documented, reviewed platform
  limitation requires otherwise.
- Never expose `ipcRenderer`, `fs`, `child_process`, `shell`, or arbitrary command
  execution directly to renderer code.
- Define and validate every IPC request and response with strict TypeScript types
  and runtime validation where input crosses a trust boundary.
- Resolve and validate filesystem paths in the main process. Reject traversal and
  symlink escapes outside the user-selected project root.
- Canonicalize both the selected root and every requested target with `realpath`.
  Broken symlinks and symlinks resolving outside the root must not be returned.
- Keep absolute local paths out of renderer responses and visible error messages.
- Limit directory listing size and ignore generated dependency/build directories.
- Permit file content reads only for the documented extension allowlist, require a
  regular file, cap reads at 2 MiB before and after loading, and reject NUL bytes or
  invalid UTF-8.
- Permit writes only to an existing supported regular file inside the selected
  root. Enforce the 2 MiB limit, reject stale modification timestamps, and never
  expose a general-purpose write, create, rename, or delete API.
- Do not read or transmit files until the user explicitly selects a project and,
  for AI context, explicitly asks for help.
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

## Recommended next task

Add **editor tabs and basic file operations** as Phase 3's first small slice:

1. Preserve one dirty buffer per open tab and add keyboard tab navigation.
2. Add narrowly scoped, root-confined create and rename operations.
3. Design delete as an explicit, recoverable, confirmed action.
4. Add Save All and external-change handling before filesystem watching.
5. Continue to defer terminal, AI, Supabase, authentication, and documentation
   features.
