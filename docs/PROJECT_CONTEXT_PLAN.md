# Shared Project Context — implementation plan

Status: **Phase 1 implemented and fixture-tested; later phases pending** (2026-09-29).
Scope: shared local project knowledge inside the existing Electron Observer panel.
“Shared” means available to supported workflows in one workspace, not cloud/team sync.
The initial inspection pass changed docs only. The subsequent authorized tabs-only
iteration is recorded below; it adds no persistence or request-payload changes.

## Existing foundations and evidence

No applicable `AGENTS.md` was found in the repository or ancestor directories.
The [desktop roadmap](./DESKTOP_IDE_PLAN.md), [product direction](./PRODUCT_DIRECTION.md)
and [Chrome transport ADR](./adr/ADR-CHROME-DESKTOP-CONTEXT-TRANSPORT.md) guide this plan.
The root README still describes older web/extension milestones; use the desktop
roadmap and implementation for current desktop status.

| Area | Implemented and reusable | Verification status |
| --- | --- | --- |
| Context Tray | `shared/context-tray.ts`, `renderer/src/ContextTray.tsx`, and App state: typed code/docs/output/rules/web attachments, provenance, hashes, duplicate detection, ordering, refresh/keep/remove, explicit truncation and budgets. Session-only; clears on workspace replacement/sign-out. | `context-tray.test.ts` exists; earlier roadmap records passing checks. Not rerun here. |
| Context builder | `main/project-context.ts` and `shared/project-context.ts`: deterministic relationships, bounded request packages, exclusions, root/symlink-safe reads, costs, omission reasons and removable items. This is request context, not a persistent knowledge store. | Desktop/root context test suites exist. Latest recorded desktop suite: 279 passing tests from Improve Code iteration. |
| Manual Observer | `observer-ipc.ts`, `ContextPreview.tsx`, dedicated Explain/Fix/Improve sessions and shared edit/checkpoint flows. Main authorizes the prepared context; backend validates again and labels source material untrusted. | Prior mocked UI fixtures and builds passed per roadmap; real-provider/native acceptance remains pending. |
| Research extension | Explicit selected-text capture/preview, authenticated loopback pairing, in-memory incoming review, explicit Add/Reject, URL query/fragment removal and redaction. Accepted research enters the same tray. | Bridge/extension tests exist; full two-application pairing/restart/revoke acceptance is still pending in Phase 11B2. |
| Live/automatic help | Independent bounded active-code/run-error builders, cancellation, privacy checks and session controls. They do not consume the tray or saved project knowledge. | Mocked trigger tests recorded passing; live-provider evaluation pending. |
| Local storage/privacy | Main-process settings/recent-project/tab/checkpoint stores; canonical-root-derived workspace ID (`recentProjectId`); owner-only files and atomic-write patterns. Synced AI policy and local exclusions/limits are separate. Browser pairing is encrypted; tray payloads are not persisted. | Existing settings/storage/security tests provide patterns, not tests of the proposed store. |

Paths above are under `apps/desktop/src/` unless specified. Backend context validation
and formatting live in `src/lib/server/project-context.ts`; authenticated dispatch
is in `src/app/api/suggest/route.ts`. Extension code is in `apps/chrome-extension/src/`.

## Inspection baseline: missing pieces and duplication

- At inspection there was no Conversation/Project Context tab model (now Phase 1),
  durable goal/task/requirement schema,
  local CRUD store, confirmation/revision lifecycle, or explicit saved-note inclusion.
- Tray and request items deliberately overlap: tray items are source snapshots;
  request items are approved, budgeted projections. Keep this distinction and add
  one adapter rather than a third provider-context builder.
- Desktop/server schemas and secret checks overlap across trust boundaries. Preserve
  both validations; add parity tests when introducing any new item type. Do not
  consolidate all action builders: their privacy/scope restrictions are intentional.
- `ObserverPanel` mixes controls, conversation cards, proactive cards and tray;
  App owns their state. Tabs should compose these components, not create duplicate
  conversations, request controllers or tray arrays.
- Browser IPC is window-bound (`web-context-ipc.ts`), not workspace-ID-bound.
  Changing its workspace binding does not clear/tag the bridge's pending queue;
  async acceptance also looks up the current window after awaiting. This is a
  code-inspected isolation gap, not a reproduced exploit. Bind pending transfers
  and accept results to a workspace generation before adding durable research.
- Existing “Clear Observer history”, tray Clear, and settings Reset do not define
  deletion of future saved project notes. Give each a distinct, explicit scope.

## Tab design and workflow boundaries

Use the existing Observer panel/header and coffee/cream tokens. **Conversation** is
selected by default and retains the current request controls, answers, follow-ups,
review actions and verification. **Project Context** contains the existing Context
Tray first; later it adds clearly separate Saved project notes and Research sections.
A small attachment count/link remains visible in Conversation. Context Preview stays
the final source-of-truth for what is sent, outside either tab's conditional content.

Keep state/controllers above the tabs; switching tabs must not clear conversations,
remount request hooks, trigger requests, change mode, apply edits, or cancel work.
Keep busy/cancel and Live status accessible while another tab is selected. Incoming
research keeps its existing explicit review; arrival never changes the selected tab
or moves focus. Implement accessible tablist/tabpanel, keyboard navigation, retained
scroll/drafts, and explicit focus routing for “Ask Observer”/review commands.

A tray visible in Project Context must not imply all actions use it:

| Consumer | Initial integration policy |
| --- | --- |
| Continue Code / Generate Tests | Preserve existing tray behavior. Later allow explicitly selected saved notes via the same preview path, one action at a time. |
| Explain / Fix Code / Improve Code | Preserve focused context contracts. No saved notes or research silently added; Improve's bounded configuration inputs stay unchanged. |
| Multi-file and documentation workflows | Preserve existing per-flow attachment selection; no new implicit inputs. |
| Live Observer / automatic error help / proactive triggers | No saved-note integration in this plan. Saving, editing or attaching notes never triggers AI. |

## Proposed local model and isolation

Create a distinct `WorkspaceKnowledge` model, not a replacement for
`ProjectContextPackage`. Version 1: workspace ID, schema version, revision, updated
timestamp, and entries with random ID, kind (`goal`, `task`, `requirement`), text,
user-authored provenance, created/updated timestamps, and confirmation revision/time
for requirements. Tasks have explicit todo/in-progress/done status. Editing a confirmed
requirement removes its confirmation until the user confirms the new revision.
AI answers and web research are evidence, never automatically confirmed requirements.

Proposed configurable initial limits: 50 entries, 2,000 characters per entry, 20,000
characters total. Reject over-limit saves with an actionable message; never trim
silently. These local storage limits do not grant provider context allowance.

Store only explicitly saved notes at Electron `userData/project-context/<workspaceId>.json`.
Derive the ID in main from the already authorized canonical root using the existing
workspace identity; never accept arbitrary renderer paths or another workspace ID.
Same canonical root reopens the same notes; different roots/worktrees stay separate.
Moving a folder creates a new identity; do not silently merge or discover old notes.
Use narrow preload CRUD IPC, trusted-window plus active-workspace checks, generation
checks on every async result, revision checks and serialized atomic writes. Reuse
settings' temp-write/rename approach, not the tab store's uncoordinated whole-map write.

Files should be owner-only (directory 0700/file 0600 where supported), schema/size
validated before loading, with clear corruption/read/write recovery errors that do
not overwrite valid data silently. Notes are local plaintext, **not encrypted**;
state that plainly. Screen suspected secrets before saving and recheck before sending.
Do not persist code buffers, diagnostics, terminal output, transcripts or research in
this first store. No repository files, browser localStorage, Supabase, embeddings,
telemetry payloads, automatic export or cloud synchronization.

Notes belong to this device's OS-user workspace, not a Supabase account. Sign-out
clears renderer/in-flight state but does not delete deliberately saved notes; disclose
that retention. Provide explicit delete/clear-current-project controls. Unsaved note
drafts require Save/Discard/Cancel on project close/switch; a late save may only finish
for its original project and must never populate the newly opened project's UI.
Saving locally and approving transmission are separate actions. Unavailable AI privacy
settings can leave local editing usable while blocking transmission.

Later attachment integration freezes entry IDs/revisions/content hashes into a request
snapshot; show kind, confirmation state, source, exact text and cost in Context Preview.
Revalidate exclusions, secrets, current policy and budgets in main and server; treat
all notes as untrusted data, never privileged system instructions. Changes after preview
require a fresh preview. Follow-ups keep their approved snapshot rather than silently
reading updated notes. User-confirmed requirements mean user-confirmed, not proven true.

## Small phases and acceptance gates

### Phase 0 — inspection and plan

- [x] Inspect repository guidance, roadmap, tray, research bridge, builders, manual/
  automatic flows, privacy and storage; document reuse and isolation gaps.
- [x] Record proposed boundaries, first slice and acceptance tests.
- [x] Implement and fixture-test Phase 1 only; saved project knowledge remains pending.

### Phase 1 — smallest first implementation: tabs over existing state

- [x] Add Conversation/Project Context tabs, reuse the existing tray exactly once,
  preserve request/review controls and label session-only sources/action eligibility.
- [x] Renderer tests: keyboard/ARIA tabs, focus/scroll, narrow layout and coffee/cream
  theme; repeated switching preserves question drafts, answers, tray order and Undo.
- [x] Mocked UI: tab switching/add/remove/reorder produces zero provider calls; existing
  Ask → Preview → Cancel/Send, follow-up, diff → explicit Apply → Undo still work.
  Cancellation stays reachable during a request; project switch rejects late results.
- [x] Regression: Explain/Fix/Improve stay focused; Live timing/pause/status and automatic
  help remain unchanged; no duplicated tray/state or new local persistence.
- [x] Run relevant desktop/root tests, type checks, scoped/root lint and builds; record
  pre-existing failures separately. No claim of provider quality from mocks.

**Phase 1 ships no goals store or AI payload changes.** Its acceptance is the same
existing workflows accessible through two tabs, with observable zero new requests.

### Phase 2 — explicit local project notes

- [ ] Add versioned main store/IPC and simple goal/task/requirement forms with explicit
  Save, confirmation, deletion, limits, retention notice and unsaved-draft handling.
- [ ] Tests: restart persistence; A/B workspace isolation; canonical aliases; distinct
  worktrees; sign-out; stale load/save; concurrent revision conflicts; malicious IDs/
  paths; corrupt/oversized data; secret rejection; failed atomic writes and clear.
- [ ] Mocked UI tests prove local save/edit/confirm/delete makes zero AI/network calls
  and does not change source code, settings, conversations or tray lifetime.

### Phase 3 — explicit request inclusion, one consumer first

- [ ] Start with Continue Code only: explicitly attach saved-note snapshots, reuse
  current preview/budget pipeline; define a typed provenance adapter and extend both
  trust-boundary validators together. No spoofed file paths or privileged instructions.
- [ ] Tests: exact payload, optional removal, no silent truncation, blocked privacy,
  secret/exclusion checks, stale revision, prompt-injection strings, cancel/late results,
  unchanged other-action contracts, and metadata-only logging/history.
- [ ] Evaluate with safe fixtures and an approved live provider separately; then decide
  whether Generate Tests or other manual actions merit their own reviewed iteration.

### Phase 4 — workspace-bound research, then optional promotion

- [ ] Bind queued captures/accept results to the original workspace generation; clear
  or reject pending work on switch/close/sign-out. Keep pairing lifecycle independent.
- [ ] Test A→B switch during queueing/acceptance and late delivery; never add to B.
  Complete real extension + Electron pair/Add/Reject/restart/revoke acceptance.
- [ ] Only afterward consider explicit “Save research” or “Create requirement from
  selection”; show provenance and exact stored text, require separate confirmation,
  preserve session-only defaults, and define deletion/retention first.

## Phase 1 delivery evidence (2026-09-29)

Implemented in `ObserverPanel.tsx` and existing theme CSS: default Conversation,
Project Context attachment count, one always-mounted tray, hidden inactive panels,
Arrow Left/Right with wrapping, Home/End, roving tab stops and visible focus. Explicit
Focus Observer opens Conversation; background state changes do not switch tabs.
Each panel retains its scroll position. Request status stays in the common header;
Project Context offers a return link to existing request/cancellation controls.
Source eligibility is stated without changing which sources any action sends.

- **279/279 desktop tests passed**, plus the root suite and strict desktop type checks.
- Extended `test:improve-ui` with `observer-tabs-driver.cjs`: real Electron mouse/key
  events, ARIA relationships and visible focus, 320px containment/scroll, mounted-node
  identity, attachment order/collapse, instruction/clarification drafts, no extra
  provider requests, pending request preservation, explicit cancellation, project
  isolation and diff/Apply/checkpoint Undo across tab switches. No source refresh or
  transmission approval occurs in the tab handlers; existing consent tests still pass.
- Existing `test:fix-ui`, `test:explain-ui` and `test:live-triggers` passed.
- Root lint and focused changed-file lint passed (CommonJS test drivers use their
  required `require` imports with that TypeScript-only import rule disabled for the
  check). Electron and Next production builds passed. Repository-wide desktop lint
  cleanup was not attempted; its previously documented issues remain separate.
- Captured and inspected `/tmp/observer-tabs-context.png` for the coffee/cream panel.
  No paid provider calls, dependencies, settings/database changes, commit or push.

Fixture providers and application/consent callbacks are mocked; this does not prove
model quality or full signed-in App acceptance. Native save/run dialogs, screen-reader
announcement quality, Windows, and the full two-app Chrome flow remain unverified.
The browser workspace-binding concern stays in Phase 4; no transport was changed.

Manual checks: open Observer, type an instruction, switch tabs using mouse and
Left/Right/Home/End, then return and verify the draft. Attach/reorder a safe excerpt
and check it persists across tab switches. Use Focus Observer to return to Conversation.
For request/cancel/diff/Undo without provider charges, run
`npm --prefix apps/desktop run test:improve-ui`. Live-provider testing needs separate
approval and is not required to establish tab-state preservation.

All unchecked phases remain pending. The initial planning changes are preserved;
this iteration modifies only tab presentation, its fixture tests and documentation.
