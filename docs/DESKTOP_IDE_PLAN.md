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
| Phase 2 | Not Started | Local projects, file explorer, Monaco editing, and saving |
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
│           │   ├── filesystem.ts
│           │   └── terminal.ts
│           ├── preload/         # Narrow, typed IPC bridge
│           │   └── index.ts
│           ├── renderer/        # Sandboxed React interface
│           │   ├── App.tsx
│           │   ├── components/
│           │   ├── state/
│           │   └── styles/
│           └── shared/          # IPC contracts shared by Electron processes
│               └── ipc-types.ts
├── packages/                    # Optional, introduced only when justified
│   └── shared/                  # Framework-independent reusable logic
└── docs/
    └── DESKTOP_IDE_PLAN.md
```

The desktop application should begin as an independent package. Its Electron
dependencies, build output, and TypeScript configuration must remain isolated
from the root Next.js package. The root TypeScript configuration currently
includes all TypeScript files, so `apps/desktop` will need to be explicitly
excluded from the web TypeScript project when the desktop package is created.

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

- [ ] **Not Started** — Add a native folder-selection dialog.
- [ ] **Not Started** — Store the currently authorized project root in main-process
  memory.
- [ ] **Not Started** — Add typed IPC contracts for folder selection, directory
  listing, file reading, and file writing.
- [ ] **Not Started** — Validate every filesystem path against the authorized root.
- [ ] **Not Started** — Handle symlinks without allowing access outside the root.
- [ ] **Not Started** — Ignore `.git`, `node_modules`, build output, and other heavy
  generated directories by default.
- [ ] **Not Started** — Detect and reject unsupported binary files.
- [ ] **Not Started** — Render a lazy-loading folder/file explorer.
- [ ] **Not Started** — Open text and code files in Monaco Editor.
- [ ] **Not Started** — Map common extensions to Monaco languages.
- [ ] **Not Started** — Track dirty editor state.
- [ ] **Not Started** — Save the active file with Ctrl+S or Cmd+S.
- [ ] **Not Started** — Warn before closing a window with unsaved changes.

Required verification:

- [ ] **Not Started** — Files inside the selected root can be listed, opened, edited,
  and saved.
- [ ] **Not Started** — Attempts to read or write outside the root are rejected.
- [ ] **Not Started** — Binary and oversized-file handling is deterministic.
- [ ] **Not Started** — Save shortcuts work on Windows/Linux and macOS.
- [ ] **Not Started** — Relevant unit/integration tests pass.
- [ ] **Not Started** — Desktop and web builds still pass.

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

## Recommended next task

Begin the first, security-focused slice of **Phase 2 — Local projects, explorer,
Monaco, and saving**:

1. Define strict typed IPC contracts for folder selection and directory listing.
2. Add a native folder picker in the main process.
3. Retain the selected root only in main-process memory.
4. Validate paths and symlinks against that authorized root.
5. Render a read-only, lazy project tree and add focused path-boundary tests.

Opening file contents, Monaco editing, and saving should follow only after this
filesystem boundary passes its security checks.
