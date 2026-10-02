# AI context pipeline audit — 2026-09-30

**Baseline audit (before Phase A).** Inspected current working-tree source, including uncommitted Observer
tabs; no application/settings/limits/dependency/database changes. No secrets or private
source fixtures read, no provider/network calls, no commit/push. Prior plan is
[PROJECT_CONTEXT_PLAN.md](./PROJECT_CONTEXT_PLAN.md); its saved-note phases remain pending.

Phase A implementation and current verification are recorded [below](#phase-a-delivery--2026-09-30). The following baseline findings describe the pre-change implementation. Phases B/C remain pending.

## Comparison

| Path | Context actually used | Effective limits | Missing connections |
| --- | --- | --- | --- |
| Manual Explain (code) | Selection; otherwise approximate current symbol or 41 nearby lines. Unsaved active buffer. Question plus bounded session conversation. Whole file only via select-all (or incidental small-file coverage), not an explicit entire-file action. | Default send-time per-code-item 8,000 characters; package cap 20,000 including instruction; question/history also consume the package allowance. Entire source buffer must be ≤50,000 even for a small selection. | Tray, research, other files, diagnostics and saved goals/tasks/requirements are not included. |
| Context Tray | User-selected snapshots of code/files/docs/output/rules or accepted Chrome research. Used by existing generic manual modes (e.g. Continue/Generate Tests); documentation/multi-file have their existing flows. | 20 items; generally 20,000 characters/item; total default 20,000; selected output 8,000; Chrome research 10,000. Tray total is not the eventual request total. | Visible in Project Context for all modes, but excluded from Explain/Fix/Improve and automatic modes. No durable project-note store. Overlap is not fully deduplicated. |
| Live Observer | Separate builder: cursor ±12 lines (up to 25), up to three permitted nearby diagnostics, fixed task instruction and exact edit-base hash. | Code ≤min(6,000, per-file setting); total ≤min(9,000, total setting); whole source/previous source each ≤50,000 at IPC. 4s pause, 30s cooldown, 10 requests/hour. | No tray, project rules/files/research, user project goal, tasks, requirements or manual conversation. Intent is deliberately inferred only from the excerpt. |

“Characters” here means JavaScript string length (UTF-16 code units), not lines,
UTF-8 bytes or model tokens. A 453-line file can fit or exceed any character budget.
The token estimate is `ceil(characters / 4)`, not provider tokenization.

## End-to-end trace and concrete findings

Paths below are relative to the repository; line numbers refer to this inspected tree.

1. **Confirmed misleading Settings label / intended Fix safeguard.**
   [SettingsPanel.tsx:186](../apps/desktop/src/renderer/src/SettingsPanel.tsx#L186)
   calls the control “Maximum content per related file,” but App forwards it as
   `maximumCharactersPerFile` for the active selection/file too
   ([App.tsx:955](../apps/desktop/src/renderer/src/App.tsx#L955)).
   [fix-code-context.ts:9](../apps/desktop/src/main/fix-code-context.ts#L9) rejects
   code above `min(20,000, configured per-file, total minus instruction)` before
   preview, without truncation. This produces the reported **Fix Code** error.
   Increasing the actual per-file setting works within other caps; raising total
   alone does not remove the 8,000 default. No line-count limit caused that error.

2. **Confirmed Explain preview/send mismatch.**
   [project-context.ts:160](../apps/desktop/src/main/project-context.ts#L160)
   caps selected code at 20,000, not the configured per-file limit. It can preview
   8,001 or 12,000 characters, then
   [explanation-session.ts:42](../apps/desktop/src/main/explanation-session.ts#L42)
   rejects the approved item under the default 8,000 policy. Preparation also
   consumes the entire package budget before reserving the separately sent
   question/history. A 20,001-character selection becomes a flagged 19,993-character
   excerpt plus “Explain” (20,000 total); even at a 20,000 per-file setting, send
   rejects it because the question exceeds the remaining allowance. Truncation
   is visible in metadata, but not a coherent full-file review path.

3. **Confirmed inaccurate function scope.**
   [project-context.ts:39](../apps/desktop/src/main/project-context.ts#L39)
   searches backward for a regex declaration and stops at 80 lines, not the real
   function end. For a 453-line Python function with cursor at line 400, Explain
   uses lines 1–80, marks `truncated:false`, and says the symbol contains the cursor.
   Nearby context is suppressed whenever a symbol is found (:223–224). This can
   directly disconnect an answer from the code at the cursor. Improve's newer
   exact-scope resolver is separate; Explain does not reuse it.

4. **Intentional isolation, real missing project-context connection.**
   [App.tsx:959](../apps/desktop/src/renderer/src/App.tsx#L959) excludes tray items
   from Explain/Fix/Improve seeds. Explain additionally clears them in
   [project-context.ts:133](../apps/desktop/src/main/project-context.ts#L133), and
   its session and backend allow only active-file code/instruction items
   ([route.ts:64](../src/app/api/suggest/route.ts#L64)). Simply passing tray state
   to the renderer request would not enable this feature safely.
   Improve alone includes bounded, optional AGENTS/rules/test configuration through
   its dedicated path (:141–154); that is not saved user goals or research.
   The current tabs render the same session tray, not saved project notes
   ([ObserverPanel.tsx:316](../apps/desktop/src/renderer/src/ObserverPanel.tsx#L316)).
   No implemented goal/task/confirmed-requirement CRUD model/store was found.
   Per-request Explain guidance, Fix problem, Improve goal/instruction and multi-file
   description exist; they are not a shared project memory.

5. **Confirmed overlap/budget inefficiency, not universal exact duplication.**
   [context-tray.ts:195](../apps/desktop/src/shared/context-tray.ts#L195) detects
   exact/overlapping attachments; App prompts before overlapping tray additions
   ([App.tsx:968](../apps/desktop/src/renderer/src/App.tsx#L968)). At assembly,
   [project-context.ts:218](../apps/desktop/src/main/project-context.ts#L218) only
   suppresses a selection/symbol whose entire text equals an attachment. A containing
   file attachment plus selection and symbol can repeat that selection three times.
   Even an exact selection attachment can overlap an added symbol. Nearby excerpts
   and discovered related files have no general range-union deduplication.
   The prepared transport contains the package, not a second top-level copy of all
   selected code ([observer-ipc.ts:181](../apps/desktop/src/main/observer-ipc.ts#L181)).

6. **Tray lifecycle and transmission boundaries.**
   Creation redacts suspected secrets, slices oversized input and marks truncation
   ([context-tray.ts:87](../apps/desktop/src/shared/context-tray.ts#L87)); App checks
   total at attach time, but not the extra instruction/automatic context cost.
   Preparation validates hashes, exclusions and current source snapshots (:170–217).
   Same-file checks use the supplied unsaved buffer; other attached files are read
   from disk, not another open tab's unsaved buffer. Stale/unavailable snapshots need
   Refresh/Keep original/removal; prepared authorization and backend reject unresolved
   stale states ([observer-ipc.ts:217](../apps/desktop/src/main/observer-ipc.ts#L217),
   [server/project-context.ts:46](../src/lib/server/project-context.ts#L46)).
   Optional items can be omitted for total budget; generic mandatory code can be
   truncated (:247–256). Source ranges are not recomputed after character truncation.
   Chrome requires capture and incoming Add approval; research remains untrusted and
   session-only. Pending-transfer workspace binding remains the previously identified
   later-phase concern, not changed or interactively reproduced here.

7. **Separate automatic pipeline, intentional safety constraints.**
   Monaco's content-change reporter feeds Live IPC, not cursor-only movement
   ([App.tsx:525](../apps/desktop/src/renderer/src/App.tsx#L525),
   [App.tsx:2790](../apps/desktop/src/renderer/src/App.tsx#L2790)).
   [live-observer.ts:15](../apps/desktop/src/main/live-observer.ts#L15) builds its
   own package and blocks complete short files when consent is required, secrets
   anywhere in the active buffer, excluded paths, and excessive excerpt/total size.
   Diagnostics are sliced to 1,000 while their item `truncated` remains false
   (:31–33): a confirmed provenance-metadata inconsistency by inspection.
   Controller pause/cooldown/limits/candidate cancellation and seen-context guards
   run independently of manual context assembly; explicit activity has priority.
   Live IPC re-reads privacy settings before sending (:11–15) and rejects an edit
   payload over 50,000 characters (:25); this cancels without a size-specific status.

8. **Desktop → backend → provider → display.**
   Manual prepare validates IPC seed, builds package, shows Context Preview, then main
   authorizes an unchanged permitted subset. Dedicated sessions recheck privacy/consent
   and snapshot/history. `ObserverApiClient.ask` sends authenticated JSON to `/api/suggest`
   ([observer-client.ts:79](../apps/desktop/src/main/observer-client.ts#L79)). Backend
   authenticates, validates Zod package/action contracts, formats untrusted content,
   selects a server-only key and invokes the provider (:148–228). It does not independently
   load the user's current desktop privacy settings; trusted desktop checks enforce those.
   Budget totals count content, not all JSON/source metadata/system-prompt overhead.
   Provider-specific JSON parsing precedes desktop response validation and safe Markdown
   rendering for Explain; Live renders its compact card. Explain's original snapshot is
   retained and visibly labelled stale when edited; follow-ups do not silently refresh
   source ([useExplanation.ts:35](../apps/desktop/src/renderer/src/useExplanation.ts#L35),
   [App.tsx:2842](../apps/desktop/src/renderer/src/App.tsx#L2842)).

9. **Response restrictions and action identity.**
   [providers.ts:141](../src/lib/server/providers.ts#L141) gives manual code Explain
   a dedicated detailed, read-only prompt: no 1–3 sentence restriction. It requests
   overview/logic/inputs/outputs/pitfalls and examples when useful. Its 6,000 output-token
   and 20,000 response-character limits reject incomplete/truncated JSON explicitly
   (:71–78). Fix/Improve also have dedicated prompts and 8,192-token budgets.
   Generic manual modes still ask for 1–3 sentences (:175–176). Live deliberately asks
   for one suggestion, ≤60 words, and permits `NO_SUGGESTION` (:105–110). Live/generic
   Anthropic requests use 1,024 output tokens; other providers lack an explicit output
   cap for these modes (:267,301,327). They use generic parsing without the dedicated
   Explain finish-reason rejection. These are possible shallowness/partial-output
   contributors, not evidence of real-provider accuracy or a measured failure.
   Live intentionally uses internal `mode: improve_code` plus `liveObserver:true`;
   backend/provider branch on that flag before manual Improve. UI says Live Observer.
   Manual Fix uses `fix_error` and displays Fix Code. No Explain→Fix routing mismatch
   was found; the reported Fix Code text belongs to the Fix builder. The shared error
   heading “Observer request failed” is generic. Mode changes dismiss existing errors
   ([App.tsx:2857](../apps/desktop/src/renderer/src/App.tsx#L2857)); an exact historical
   clicked mode cannot be recovered from the pasted error alone.

## Limit inventory (Settings influence versus fixed caps)

| Boundary | Unit / default or cap | Source; Settings effect |
| --- | --- | --- |
| Local file read | 2 MiB UTF-8 bytes | `main/workspace-files.ts:40,268`; fixed, not the AI budget. |
| Prepare source | Explain/generic 50,000; Fix/Improve 2×1024×1024 code units | `shared/observer.ts:338`; fixed even with small selection. |
| Total / per-file / related count | 20,000 (range 1,000–50,000); 8,000 (500–20,000); 4 (1–10) | `shared/settings.ts:123,166,229,291`; Settings saves and App/main policy use them. They cannot override fixed action caps. |
| Explain package/item/window | 20,000 package incl. instruction; selected item initially ≤20,000; symbol ≤80 lines; nearby ≤41 lines | `shared/explanation.ts:3`, builder :39,133,163; total can lower cap, per-file enforced later; no Settings for line windows. |
| Explain conversation/output | Question 500; ≤8 messages, ≤24,000 history chars, further reduced by remaining total; response 20,000 chars; 6,000 output tokens; 120s | `shared/explanation.ts:3`, session :48; fixed, history drops complete old turns and reports omissions. Initial question is also represented in instruction cost. |
| Fix/Improve | Code ≤20,000 and per-file and total-minus-instruction; surrounding 2,000; Fix evidence 2,000; question 500; 4 clarification turns/4,000 chars; response 20,000, output 8,192 tokens, timeout 120s | `shared/fix-code.ts:3`, Improve inherits it; instruction/diagnostic/evidence overhead also matters. |
| Tray | 20 items; 20,000 chars/item, minimum truncation target 500; selected output 8,000; total follows total setting | `shared/context-tray.ts:3`, `App.tsx:1014`; creation truncation fixed/default, per-related-file setting is not a blanket tray-item cap. |
| Optional discovery/config | Related code/rules initially per-file cap; max 100 candidates; Improve config ≤2,000/file | `main/project-context.ts:149,163,284`; excluded/binary/oversize omitted, total budget still applies. |
| Chrome research | 10,000 selected-text chars; transfer 16,384 bytes; queue 5; capture age 10min | `chrome-extension/src/web-context.ts:2,53`, `main/web-context-bridge.ts:8`; fixed, encoding/metadata can hit byte cap before character cap. |
| Live IPC / excerpt | Each current/previous buffer ≤50,000 chars; ≤100 incoming diagnostics each ≤10,000; excerpt ≤6,000 chars/25 lines; ≤3 diagnostics ×1,000; total ≤9,000 | `main/live-observer-ipc.ts:25`, `main/live-observer.ts:22–36`; privacy settings may lower excerpt/total, not raise caps. |
| Live timing | 4s pause (configure range 1–30s), 30s cooldown, 10/hour; 45s client timeout | `shared/live-observer.ts:3`, `main/observer-client.ts:87`; centralized constants, not normal Settings budget controls. Provider wait is additional to trigger delay. |
| Backend envelope | ≤30 items, ≤50,000 chars/item/package; intent 500; limits metadata ranges match settings | `src/lib/server/project-context.ts:3–49`; strict action-specific refinements are additional, notably Live ≤5 items and allowed active-file types only. |
| Legacy optional fields/response | selected/nearby 20,000; activeFile 50,000; runError 8,000; diagnostic 2,000; generic response explanation 10,000, snippet 50,000, reason 2,000 | `shared/observer.ts:82`, `route.ts:49–61`, `observer-client.ts:45`; fixed, current prepared package avoids legacy content duplication. |

## Actual verification

Ran a temporary, local harness against production `ProjectContextEngine`,
`ExplanationSession` (mocked ask/consent/policy), tray creation and `buildLiveRequest`.
Fixtures are valid synthetic Python, 453 lines, unique assignment lines and a padded
comment to reach exact sizes. Only sizes/types/errors were printed, not private code.

| Synthetic case | Observed result |
| --- | --- |
| 7,999 / 8,000 chars select-all, default settings | Fix preparation accepts; Explain preparation and mocked send accept. |
| 8,001 / 12,000 chars select-all | Fix rejects before preview; Explain prepares then rejects per-file at send. |
| 8,001 chars, Fix per-file raised to 12,000 in test policy only | Accepted; demonstrates wired setting, no real settings changed. |
| 20,001 chars Explain | Preview truncates to 19,993 code chars; default send rejects per-file. Raised per-file 20,000 still rejects code-plus-question total. |
| Cursor 400, no selection | Explain sends symbol lines 1–80 with no truncation flag. |
| Exact tray text versus containing-file tray | Exact selected item suppressed, but symbol overlaps; containing file retains separate selection and symbol (2 vs 3 selection occurrences across items). |
| Tray explicitly supplied to Explain builder | Zero user-attached items in result. |
| Live on 8,001-char file, cursor 400 | 564-character package, only nearby code and fixed instruction. |
| Live on a 17-char complete file / long-line 15,099-char fixture | Complete-file consent blocker / 6,000-char excerpt blocker respectively. |

Two mock Explain asks; **zero network/provider calls**. Also ran
`npm run test:explanation`: existing mocked provider prompt/parser/budget and trusted
IPC regression assertions passed. Temporary harness/results:
`/tmp/context-pipeline-audit.mts`, `/tmp/context-pipeline-audit-results.log`.
No build/type/lint/full UI suite rerun for this docs-only audit. Earlier UI checks are
historical, not new evidence. User's actual 453-line buffer, current persisted privacy
values, exact failed request, signed-in backend behavior, provider tokenizer limits,
real answer quality, and browser cross-workspace timing remain unverified.

## Small implementation plan — Phase A implemented; B/C pending

### A. Task-aware manual full-file budgets

- [x] Separate active task scope budget from related-file budget; accurately label
  Settings. Add explicit Explain selection/current-function/entire-file scope.
  Retain full-file consent; never implicitly send a whole file or truncate mandatory
  scope. Reserve instruction/question/history and prompt overhead before preview;
  use the same effective-budget calculation at prepare/send/backend boundaries.
- [x] Use reliable function boundaries or ask for a selection; preserve cursor coverage
  and honest line ranges. Report action, measured size, unit, effective cap, limiting
  setting and permitted remedies. Do not merely remove the 8,000 safeguard.
- [x] Acceptance: 453-line fixtures at 7,999/8,000/8,001 and task cap ±1; multibyte text;
  small selection in >50k source; settings lower/raise; exact function at cursor400;
  preview/send agreement; no silent truncation; consent cancel; no request until send;
  read-only Explain and Fix/Improve diff/hash/checkpoint regressions.

### B. Shared project context for manual Observer

- [ ] First implement explicit, workspace-isolated local goals/tasks/requirements as
  planned; distinguish user-confirmed facts from research and AI guesses. Saving is
  not transmission approval. Add a typed snapshot adapter to the existing package,
  not a new provider pipeline; extend desktop/session/backend schemas together.
- [ ] Integrate one manual action at a time with explicit included-item selection,
  source provenance/revisions and exclusions. Deduplicate overlapping snapshots only
  when file/hash/ranges agree; preserve conflicting versions as explicit choices.
- [ ] Acceptance: no notes means existing payload; approved notes/research appear once;
  removed items absent; overlap accounting; source/revision changes require preview;
  workspace switch/late results; secrets/injection; per-action budgets; follow-ups use
  original approved snapshot; no persistence of code/transcripts; zero automatic sends.

### C. Explicitly consented project context for Live Observer

- [ ] Keep default active-excerpt-only behavior. Offer a separate opt-in explaining
  automatic transmission of selected goal/task/requirement snapshots and their budget.
  Begin with minimal user-authored notes; research/other files need separate review.
  Record consent per session/workspace/provider and exact context revisions; additions
  or changes require renewed review. Do not inherit manual/tray consent implicitly.
- [ ] Extend Live's allowlisted desktop/backend contract and bounded prompt together;
  preserve pause/cooldown/hourly limits, no-suggestion, priority, stale cancellation,
  explicit diff/Apply and complete-file blockers. Resolve browser workspace-binding
  before considering automatic research context.
- [ ] Acceptance: default payload unchanged; denied/revoked consent sends no notes;
  exact approved note IDs/hash only; switch/disable/focus loss cancels; revisions
  invalidate consent; no send on note edits alone; combined budget/diagnostic truncation
  metadata; injection/secret exclusion; mocked timing/late-response/card tests.
  Separately evaluate real goal relevance and answer quality only with approved calls.

## Phase A delivery — 2026-09-30

Implemented manual code Explain only. Other actions retain their existing budgets;
no project notes, tray/research integration or Live payload changes. No migration,
dependency installation, paid AI call, commit or push. Pre-existing changes preserved.

- [x] Explicit Selected code / Current function / Entire active file controls, exact
  line/column scope and unsaved buffer. Unavailable selection/function options have
  explanations; no nearby-code fallback. Entire-file approval still uses preview
  plus the existing complete-file consent setting.
- [x] Explain bypasses the old 80-line symbol extractor. It reuses the existing
  conservative Python and JavaScript/TypeScript function-boundary implementation.
  Cursor 400 in the synthetic 453-line function resolves lines 1–453, including nested
  function and near-end tests. Ambiguous/unsupported syntax asks for selection/file.
- [x] Local `explainMaximumCodeCharacters` setting (500–20,000 UTF-16 code units),
  initially inherited from the existing per-file value; new installations default
  to 8,000. No persisted user limit is raised. Other actions/related-file setting is
  separately labeled. `maximumContextChars` remains 1,000–50,000 and also bounds
  Explain instruction, question and retained history. Explain's former hard 20,000
  total ceiling is now 50,000; code itself remains capped at 20,000.
- [x] One shared budget calculation in `shared/explanation-budget.ts`, used by the
  exact builder, controller/preview, session, desktop request validator, authenticated
  backend and provider dispatch. Provider data serialization is shared too. The
  generic package's legacy `ceil(chars/4)` metadata remains for compatibility with
  other modes; Explain never uses that estimate for admission or its displayed budget.
- [x] Conservative token estimate: UTF-8 bytes of serialized approved items/history
  plus quoted question, 4,096 tokens for prompt/framing, 6,000 reserved output tokens.
  Configurable application ceiling 64,000 combined tokens, further bounded by known
  model capacity. This intentionally overestimates many inputs; it is not a tokenizer.
  Provider dispatch also verifies the real prompt fits the framing allowance.
  Response parsing still rejects length-limited/invalid output, with 20,000 response
  characters; no new answer-quality claims or edit proposals.
- [x] Preview snapshot/metadata pinned; changed buffer or active file requires a new
  preview. Workspace changes reject late preparation. Current privacy settings are
  rechecked on every send/follow-up; lower limits use the same budget check. Older
  history is omitted in whole turns with the existing visible omission count. The
  approved code is never truncated, chunked or silently replaced.

### Configured provider capacities

Official documentation inspected 2026-09-30; no provider requests made. Static model
metadata lives beside the application ceilings and must be reviewed when models change.

| Configured model | Documented supported capacity | Explain policy |
| --- | --- | --- |
| `gpt-4o-mini` |128,000 context;16,384 output tokens ([OpenAI](https://developers.openai.com/api/docs/models/gpt-4o-mini)) |64,000 application ceiling;6,000 output reserve |
| `gemini-2.5-flash` |1,048,576 input;65,536 output tokens ([Google](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)) |Conservatively treat input capacity as combined capacity;64,000 application ceiling |
| `claude-haiku-4-5-20251001` |200,000 context;64,000 output tokens ([Anthropic](https://platform.claude.com/docs/en/models/haiku-4-5/overview)) |64,000 application ceiling;6,000 output reserve |
| `deepseek-chat` |Official changelog announces discontinuation 2026-07-24 ([DeepSeek](https://api-docs.deepseek.com/updates/)) |Manual Explain blocks before sending with a specific provider-selection alternative; no guessed capacity or automatic migration. Other workflows/model configuration untouched. |
| `demo-local` |No provider; synthetic response |Same 64,000 application ceiling for deterministic checks |

### Boundary results (synthetic, no private source)

Every fixture is a valid 453-line Python function; length is varied using a comment.
The chosen total budget in these tests is 30,000, leaving instruction/question room.

| Code characters | Existing 8,000 code ceiling | Explicit 20,000 code ceiling |
| --- | --- | --- |
|7,999 /8,000 |Exact preview and send accepted |Accepted |
|8,001 /12,000 |Rejected during preparation with size/limit/settings remedy |Complete selection/function/file accepted without truncation |
|19,999 /20,000 |Rejected before sending |Accepted with sufficient total context allowance |
|20,001 |Rejected before sending |Rejected at application code ceiling; select a smaller section |

An exactly 20,000-character scope also needs room for instruction/question in the
**total** setting. Line count alone never controls eligibility. Full-file review can
exceed background budgets, but existing privacy limits require an explicit user change.

### Verification and limits

- [x] 288 desktop tests pass, including synthetic boundaries, full function/nested/end
  positions, JS function columns, unsaved buffer, small selection in a >50,000-character source,
  multibyte/token reserves, history omission, exclusions/secrets, settings inheritance,
  consent denial, cancellation and read-only results. New input buffer guard for
  Explain matches the existing 2 MiB guard used by Fix/Improve; transmitted scope stays bounded.
- [x] Root test suite passes: authenticated route boundary matrix, exact mocked provider
  payload/items/ranges for OpenAI/Gemini/Anthropic, unsupported-model rejection before
  fetch, trusted IPC/preview authorization and late-workspace isolation; other-mode
  prompt/edit contracts retained. Retired DeepSeek is explicitly blocked for this
  pipeline, not counted as a successful provider evaluation.
- [x] Mocked Electron Explain interactions: real Monaco selection/cursor events,
  scope selector, exact preview, no early
  sends, oversized errors, stale-preview rejection, safe Markdown, follow-ups, refresh,
  copy, bounded history, cancellation, privacy errors and project isolation.
- [x] Existing mocked Fix/Improve/Observer-tab/Live/Live-trigger UI regressions pass,
  including explicit diff/Apply/checkpoint Undo. Live fixture logged a Monaco disposed
  disposable warning during teardown; assertions passed. Harness CSP warning is expected.
- [x] Desktop strict typecheck and Electron production build; root tests/lint and
  Next production build passed. Focused new-module lint passed. Broad App/Settings
  lint still reports pre-existing unused variables/hook warnings. Standalone root
  `npx tsc --noEmit` includes desktop/test scripts under its incompatible target and
  reports existing test/config errors; Next's production typecheck passes.
- [ ] Full signed-in App/native consent/settings-save dialogs and packaged cross-platform
  acceptance remain manual. Mock fixtures exercise production components/controllers,
  but do not validate signed-in backend policies or provider availability/answer quality.
- [ ]Function detection intentionally refuses ambiguous Python constructs (including
  triple-quoted strings/docstrings, f-strings, tabs or explicit line continuations),
  unsupported languages and malformed JS/TS. Select exact code or explicitly choose
  the entire file. A full Python parser is not introduced in this phase.
- [ ]Provider tokenizer calibration, real answer quality and replacement of the retired
  DeepSeek model require a separately approved provider iteration. No paid calls made.
- [ ]Shared project notes, tray/research connections and explicitly consented Live
  project context remain Phase B/C; this iteration does not claim project awareness.

### Manual acceptance

1. Restart the desktop app. In Observer → Conversation → Explain code, choose a
   selection, current function or entire active file; verify the displayed range.
2. Edit without saving. Ask Observer and inspect preview content/range. Cancel to
   verify nothing is sent. A file edited after preview must require a fresh preview.
3. For a safe 12,000-character fixture, explicitly set Manual Explain code limit to
  20,000 (Save local context settings) and Total AI context to 30,000 (Save privacy
   settings). Keep complete-file confirmation on. Preview Entire active file and
   check full contents; cancel consent, then retry and explicitly approve if desired.
4. Put the cursor at line 400 of a 453-line function. Current function should include
   the complete function, or explain a detection/budget limitation without fallback.
5. Try 8,001 characters with an 8,000 code limit, then 20,001 with 20,000. Both must show
   the size/limit and no truncated preview/send. Restore any settings changed for testing.
6. Use Demo to exercise read-only responses/follow-ups without paid calls. Real provider
   evaluation is separate. Change source, check the older-snapshot label, and refresh
   explicitly. Clear/switch project while pending and confirm no late answer appears.
