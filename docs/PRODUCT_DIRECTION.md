# Proactive AI IDE — Product Direction

## Document purpose

This document defines the product direction for the pivot from the original
browser-based **Proactive AI Workspace** and Chrome extension concept to a
desktop-first product named **Proactive AI IDE**. It is a product-direction
record, not a replacement for the official FYP Scope, Software Requirements
Specification (SRS), or Software Design Description (SDD).

## 1. Product vision

Proactive AI IDE will be a secure desktop development environment that combines
local project work, code execution, diagnostics, documentation, and carefully
controlled AI assistance in one application. It should help students and
developers understand and resolve technical problems while keeping them in
control of their source code, credentials, and the context sent to AI providers.

The desktop IDE becomes the main user-facing product. The existing browser
application remains part of the system as a working web prototype and the
foundation for backend APIs, Supabase authentication and data, and AI provider
key management.

## 2. Problem being solved

Developers commonly move between an editor, terminal, error output,
documentation, browser tools, and general-purpose AI chat. This fragmentation
makes it harder to give an assistant the right context and increases the chance
of sharing too much information or applying advice without understanding it.

The original browser workspace demonstrated AI-assisted editing but could not
provide the same natural and secure access to local projects, native runtimes,
and development diagnostics as a desktop application. Proactive AI IDE addresses
that limitation by placing assistance beside the real local editing and execution
workflow. It emphasizes explicit user actions, relevant technical context, and
quiet assistance instead of constant interruption or behavioral surveillance.

## 3. Target users

The primary users are:

- Computer science and software engineering students working on assignments,
  projects, and documentation.
- Beginner and intermediate developers who benefit from contextual explanations
  of compiler, runtime, test, import, and documentation problems.
- Individual developers who want a lightweight local IDE with optional AI help
  and user-controlled context sharing.

The first release is designed for individual project work. It is not intended to
replace a full enterprise IDE or provide organization-wide collaboration and
administration.

## 4. New desktop product scope

The first useful desktop product will allow an authenticated user to:

- Open a local coding-project folder and navigate its files and directories.
- Create, rename, delete, open, edit, and safely save supported text/code files.
- Work with multiple editor tabs and respond safely to files changed outside the
  application.
- Run supported code through controlled local runtimes and view output,
  diagnostics, and errors.
- Open a controlled project terminal.
- Manually invoke **Ask Observer** with an explicit selection of relevant code,
  file content, diagnostics, or documentation context.
- Review, accept, dismiss, or apply an AI suggestion through visible actions with
  normal editor undo support.
- Edit Markdown project documentation, including README files, and view a
  sanitized preview.
- Sign in securely and manage the AI provider configuration associated with the
  user's account through the existing server-side system.
- Keep local project content on the local machine unless the user explicitly
  includes it in an AI request.

Once the manual workflow is stable and evaluated, the product may add optional,
quiet proactive assistance for a narrow set of real technical events.

## 5. Out-of-scope items for the first release

The following are not first-release commitments:

- Replacing mature IDEs with a complete language-server, debugger, refactoring,
  extension-marketplace, or source-control feature set.
- Real-time team collaboration, cloud workspaces, or automatic synchronization of
  entire local projects to Supabase.
- Mobile or browser parity with every desktop function.
- A new Chrome extension or browser-activity monitoring.
- Cursor-movement, keystroke-pattern, repeated-typing, attention, emotion, or
  productivity surveillance.
- Unprompted AI calls, automatic code changes, or autonomous command execution.
- Proactive alerts for style preferences, speculative improvements, or general
  conversation unrelated to an observed technical failure.
- Support for every programming language, shell, operating system, package
  manager, debugger, or build system in the initial release.
- Storing decrypted provider keys or privileged backend credentials in the
  desktop renderer, preload bundle, local project, or application logs.

## 6. Core modules

1. **Desktop shell and workspace security** — Electron window lifecycle, process
   isolation, narrow IPC contracts, local-folder authorization, and safe path
   handling.
2. **Project Explorer** — Local project selection, directory navigation, file
   operations, ignore rules, and external-change synchronization.
3. **Code editor** — Monaco-based editing, tabs, language mapping, safe saves,
   conflict handling, and undoable edits.
4. **Execution, terminal, and diagnostics** — Controlled runtime commands,
   project-scoped terminal sessions, output capture, cancellation, and structured
   technical diagnostics.
5. **Authentication and account session** — Supabase-backed sign-in, sign-out,
   session refresh, encrypted persistence, and a renderer-safe public user state.
6. **Observer AI** — Explicit context selection, manual requests, response states,
   suggestion outcomes, and later optional event-driven alerts.
7. **Documentation workspace** — Markdown editing, sanitized preview, navigation,
   and user-approved code/document context for Observer.
8. **Backend and provider-key services** — Existing Next.js APIs, Supabase data and
   row-level security, encrypted provider-key lookup, and server-side calls to AI
   providers.
9. **Packaging and updates** — Installers, native dependency packaging, signing,
   update integrity, privacy controls, and release verification.

## 7. Mapping the browser scope to the desktop scope

| Original browser-based capability | Desktop product direction | Role of the existing browser application |
|---|---|---|
| Browser workspace and in-memory/cloud files | Local Project Explorer and Monaco editor working on user-selected folders | Remains a web prototype; it does not become the source of truth for local files |
| Chrome extension supplying live web context | Removed from the main direction | No new extension is required for the desktop first release |
| Observer suggestions inside the web editor | Manual Ask Observer beside real code, output, diagnostics, and documentation | Existing request, suggestion, and outcome concepts can be adapted |
| Browser-derived proactive activity signals | Optional alerts from verified technical events only | Browser behavior is not used as a trigger |
| Web code execution assumptions | Controlled local runtimes, project terminal, and structured diagnostics | Backend is not used to execute arbitrary local commands |
| Web document editor | Markdown source editing and sanitized preview for project documentation | Existing documentation UX may inform, but not dictate, the desktop design |
| Supabase web authentication | Secure desktop authentication with session material kept out of the renderer | Continues to provide the identity and database layer |
| Encrypted user AI provider keys | Account-linked provider settings consumed only by server-side APIs | Continues as the provider-key management interface and secure storage path |
| Next.js AI routes | Authenticated endpoints called by a purpose-specific Electron main-process boundary | Continues as the backend/API rather than being bundled into Electron |

This mapping preserves useful completed work without forcing the desktop product
to imitate browser constraints. Reuse should favor validated domain logic and API
contracts; desktop trust boundaries and local-file operations remain desktop
specific.

## 8. Observer strategy

### Manual Ask Observer first

Observer begins as a user-initiated assistant. The user chooses when to ask and
which context to include. The application must make included context clear before
submission and must not silently expand the request to unrelated files, terminal
history, or project content. Suggestions remain proposals: accepting, dismissing,
or applying them requires a visible user action.

### Future proactive assistance

Proactive assistance may be considered only after the manual path is secure,
reliable, and evaluated. It must be optional and quiet, and its triggers are
limited to concrete technical events:

- Runtime or compiler errors.
- Failed tests.
- Failed builds.
- Missing imports or unresolved dependencies detected by reliable tooling.
- A verifiable mismatch between code behavior/interfaces and project
  documentation.

Cursor movement and repeated typing are not meaningful technical failures and
must not be detected or used as triggers. The product will not infer that a user
is stuck from keystroke patterns, inactivity, navigation, or repeated edits.

Even when an eligible event occurs, it may only produce a local, non-disruptive
offer of help. **No AI request is sent automatically.** The user must approve the
request and its context before any project material is transmitted to the
backend or an AI provider. Proactive features must be independently configurable
and easy to disable.

## 9. Architecture overview

The system remains a two-application architecture in one product ecosystem:

- **Electron desktop IDE:** The main process owns privileged filesystem, process,
  terminal, secure-session, and network operations. A narrow typed preload bridge
  exposes purpose-specific actions to a sandboxed React renderer. The renderer
  receives neither unrestricted Node access nor raw authentication tokens.
- **Existing Next.js and Supabase backend:** Next.js retains authenticated API
  routes and server-only workflows. Supabase remains the authentication,
  database, row-level-security, and account-data layer. Web cookie authentication
  remains supported while desktop requests use a separately validated bearer
  boundary.
- **Server-side AI providers:** AI provider requests, provider selection, decrypted
  API keys, service-role credentials, and encryption secrets remain on the server.
  The desktop sends only a user-approved, bounded request through Electron main
  to the authenticated backend.

Local project files remain local by default. The desktop authorizes one selected
workspace, validates every privileged request in the main process, and transmits
only context explicitly approved for a particular Observer request.

## 10. Phased roadmap

1. **Secure desktop foundation** — Establish the isolated Electron shell, safe
   IPC boundary, local project authorization, editor, saving, tabs, and external
   file synchronization.
2. **Local development workflow** — Add a controlled project terminal, supported
   run actions, output, cancellation, and diagnostics.
3. **Desktop identity and sessions** — Add Supabase sign-in/sign-out, encrypted
   session persistence and refresh, and strict access gating without exposing
   credentials to the renderer.
4. **Manual Observer integration** — Add request-scoped desktop authentication to
   the existing backend, explicit context selection, Ask/Accept/Dismiss behavior,
   outcome persistence under RLS, and undoable suggestion application.
5. **Markdown documentation** — Add Markdown editing, sanitized preview,
   navigation, and explicit Observer context across related code and documents.
6. **Optional technical-event assistance** — Prototype only the approved event
   triggers, require user permission before every AI request, add controls and
   noise limits, and evaluate usefulness and privacy.
7. **Release readiness** — Package native dependencies, choose supported targets,
   sign installers, secure updates, and complete clean-machine, security, privacy,
   and regression checks.

Each phase should have explicit security, functional, and regression gates. The
living implementation status and detailed verification evidence belong in
[`DESKTOP_IDE_PLAN.md`](./DESKTOP_IDE_PLAN.md).

## 11. Risks and open decisions

- **Scope pressure:** A desktop IDE can expand quickly. The first release needs a
  fixed language/runtime and platform support matrix.
- **Cross-platform complexity:** Terminal behavior, native modules, secure storage,
  signing, and packaging differ across macOS, Windows, and Linux. Supported
  operating systems and CPU architectures remain to be finalized.
- **Desktop API authentication:** The backend must validate desktop bearer tokens
  without weakening or duplicating the existing web cookie path.
- **Secret management:** Provider keys and privileged credentials must remain
  server-side, while recovery, rotation, and error UX still need product-level
  decisions.
- **Context privacy:** The interface must make selected AI context understandable,
  bounded, and reviewable without adding excessive friction.
- **Diagnostic reliability:** Structured error and missing-import detection varies
  by language and toolchain. The supported signal sources and confidence rules
  must be defined before proactive use.
- **Code/document mismatch:** This trigger needs a narrow, testable definition to
  avoid subjective or noisy alerts.
- **Proactive interaction design:** Alert frequency, cooldowns, per-project
  settings, dismissal behavior, and measurement of usefulness require supervisor
  and user evaluation.
- **AI response safety:** Suggestions may be incorrect or insecure. The product
  needs clear review states, undo, context limits, and no autonomous execution.
- **Offline and service failure behavior:** Local editing and execution should
  remain useful when Supabase or an AI provider is unavailable; the exact degraded
  experience remains to be specified.
- **Data retention:** Retention and deletion rules for prompts, suggestions,
  outcomes, diagnostics, and telemetry require an explicit privacy decision.
- **Web product role:** The level of continued web UI maintenance beyond backend,
  account, provider-key, and demonstration needs remains an open resourcing choice.

## 12. Impact on official FYP documents

The official FYP Scope, SRS, and SDD still describe the previously approved
browser-based direction and are intentionally unchanged by this document. After
the supervisor reviews and approves the desktop pivot, those documents must be
revised in a controlled pass so that project objectives, actors, requirements,
use cases, architecture, constraints, diagrams, testing, and deliverables
consistently describe Proactive AI IDE. Until that approval and revision occur,
this product-direction document records the proposed direction and does not claim
to supersede the official FYP documents.
