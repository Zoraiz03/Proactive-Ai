# Manual Improve Code

Improve Code now reviews one approved scope for **Readability & maintainability**
(the default) or **Performance**, with an optional instruction. This iteration
keeps other Observer actions and proactive modes separate.

## Scope and context

Selected code takes priority. Otherwise, Improve Code identifies the current
function from the unsaved editor buffer and shows its exact absolute line/column
range in Context Preview. It never uses the old 80-line symbol approximation.
When it cannot identify a function safely, it asks for a selection or the explicit
**Approve active file scope** checkbox. That approval resets on file/project
changes. Checking it does not send anything; Ask Observer still opens the preview.

JavaScript/TypeScript function boundaries use the workspace's existing TypeScript
compiler parser, including methods and arrow functions. Python uses conservative
static indentation/string handling. Ambiguous Python forms (including triple-quoted
strings, f-strings, tabs and continued statements), syntax errors, and unsupported
function grammars require selection or explicit file approval. Code is never
executed to find its scope. The parser is bundled into Electron main; no new
package dependency was added. Packaging/startup impact of the larger main bundle
is still an acceptance check.

The exact code is mandatory. Oversized code is rejected with a smaller-selection
message, never silently truncated. Bounded nearby lines are read-only. Optional
read-only project conventions/test configuration can come from `AGENTS.md`,
`.proactive/rules.md`, `package.json`, `pyproject.toml`, or `pytest.ini`. They are
shown as removable preview items, subject to exclusions, secret screening,
related-file count and character limits. Unsafe/oversized optional material is
omitted whole. Context Tray/imported source files are not automatically attached
for this focused action; the UI describes its narrower context.

Complete files, including configuration files and small-function surroundings
that cover an entire file, retain the existing complete-file consent requirement.
Unavailable privacy settings fail closed. Authenticated backend requests and
server-only provider keys are unchanged. Code/comments/configuration and prior
model questions are untrusted data. No conversation transcript is stored.

## Outcomes and safe application

The dedicated prompt requests one coherent improvement and explains the opportunity,
change, rationale, trade-offs/assumptions and how to check behavior. It requires
preserving public interfaces, return values, errors, evaluation order and relevant
side effects. It discourages cosmetic churn, unnecessary abstractions, dependencies
and unrelated rewrites. Performance reasoning must be separated from measurements;
no benchmark values or measured speedups may be invented.

Results are:

- **Improvement proposed**: a single structured, exact-text edit within the approved
  range and current file, with explicit trade-offs and verification guidance.
- **Clarification needed**: one focused question. Answer inside Observer, reusing
  exactly the approved context and goal. Current privacy/source checks run again.
- **No worthwhile improvement found**: a valid outcome without an edit.
- **Possible correctness issue**: evidence and an explicit **Review separately with
  Fix Code** button. It selects Fix Code; it does not send another request or apply
  a correction. Review Fix Code's scope through Ask Observer before sending.

Safe Markdown/fenced code blocks reuse the existing coffee/cream presentation.
Raw HTML, remote images and executable links are not activated. Clear/cancel/project
changes invalidate late responses. Changed source is marked stale; refresh requires
another Context Preview. Goals/providers are locked while a review is open.

**Review improvement diff → Accept Change** reuses the existing source hash/text
validation, checkpoint and Undo workflow. Apply validates again after checkpoint
creation, changes only the in-memory draft, preserves unrelated unsaved content,
and blocks auto-save for the applied draft. Broader/multi-file changes or changes
that cannot fit one coherent contiguous edit require clarification/new scope;
partial or out-of-scope edits are rejected. There is no automatic saving, execution
or dependency installation.

Applied changes remain **unverified**. The existing explicit **Run again** control
is available for supported Python/JavaScript files and retains Save and Run consent
and source-version guards. A matching run reports its exact saved snapshot and
limited result; compilation or one successful execution does not establish behavior
preservation. Existing test commands may be suggested only from supplied
configuration; no new automatic test/benchmark runner was added. See
[Fix Code verification](./FIX_CODE.md#explicit-verification) for runtime requirements.

## Limits and implementation

`IMPROVE_CODE_LIMITS` inherits the existing bounded review defaults: 500-character
instruction/clarification answers, four clarification turns, 4,000 history
characters, 20,000 code characters, 20,000 explanation characters, 8,192 output
tokens and a 120-second request timeout. Privacy per-file/total limits take priority.
Each optional configuration file is capped at 2,000 characters and the configured
related-file count is respected. Output-limit and malformed responses are errors,
not silently accepted partial improvements.

Improve's main-process adapter reuses Fix's scope/privacy/exact-edit validator;
provider-facing requests and public outcomes retain a distinct Improve contract.
Read-only configuration is permitted only through that adapter, not in Fix Code.
The renderer reuses the cancellable review hook with separate IPC/session state.

## Exact manual checks

1. Start `npm run dev` and `npm --prefix apps/desktop run dev`. Sign in, open a safe
   code fixture, and select **Improve Code**. Use **Demo (offline)** for no paid
   provider call. Demo explicitly performs no analysis and proposes no edit.
2. Place the cursor inside a function with no selection. Leave the default goal,
   enter “Reduce duplication without changing the public API,” and click **Ask
   Observer**. Inspect the exact function scope, unsaved code, instruction and
   optional configuration. Remove optional items or cancel without sending.
3. Select only part of the function and preview again. Confirm selected columns
   define the editable range. Try an oversized scope: expect a smaller-selection
   error, not a trimmed preview. With no function/selection, explicitly approve the
   file or select code; no whole-file request is sent automatically.
4. Switch the goal to **Performance** and inspect the next preview. With complete-file
   confirmation enabled, cancel its native dialog and verify nothing is sent.
5. Run `npm --prefix apps/desktop run test:improve-ui` to exercise real Electron/
   Monaco components with mocked improvement, clarification, no-change and bug
   outcomes, without provider charges.
6. For a live-provider evaluation only after approving its cost/context: answer a
   clarification, inspect trade-offs and the diff, then explicitly Accept Change.
   Confirm the draft stays dirty and unverified. Undo restores the original
   unsaved content; newer edits prevent unsafe Undo. A bug handoff must not send
   automatically. Editing during a request, Cancel, Clear and project switching
   must reject late results.
7. Use explicit Run again on a safe supported fixture. Cancel Save and Run once,
   then approve it deliberately. Inspect the source-version/result message;
   changing code afterward invalidates that run's relevance. Run configured tests
   separately through existing controls and review actual outputs, not AI claims.

## Live-provider evaluation — pending

Record provider/model, exact approved scope, goal/instruction, outcome, edit validity,
behavior assumptions, suggested existing checks, latency/cost and any unsupported
claims. These cases are evaluation prompts, not proven model outcomes.

| Case | Example / instruction | Evaluate |
| --- | --- | --- |
| Duplicated logic | A function repeats `name.trim().toLowerCase()` in two branches; ask to reduce duplication while preserving when validation/errors occur. | One useful local change, no eager evaluation that changes errors/side effects, no unnecessary abstraction. |
| Deep nesting | Nested authorization/availability checks return distinct errors; request clearer control flow. | Guard clauses only if check order, return values and error handling stay identical; explain assumptions. |
| Already clear | `function add(a, b) { return a + b; }` with a readability goal. | No worthwhile improvement found; no forced cosmetic edit. |
| Risky performance | Replace repeated lookups or sorting with caching; inputs may mutate or order may matter. | Ask about mutation/order when unclear; distinguish complexity reasoning from measurement, no invented speedup or benchmark numbers. |

## Verification evidence and remaining checks

- **279/279 desktop tests pass**, including 24 Improve scope/goal/outcome/privacy/
  stale/edit/cancellation/configuration/checkpoint tests and existing Fix tests.
- Root tests pass: dedicated prompts, strict outcome parsing, all provider output
  budgets with mocked fetch, route authentication/goal/scope validation, no transcript
  writes, IPC authorization/isolation, and other-action contracts.
- Improve, Fix, Explain and Live trigger Electron fixtures pass. The prior Fix
  fixture initially failed with Monaco “no diff result available” during teardown;
  it now waits for an actual computed diff before applying. Errors are not hidden.
- Strict desktop type checks, Electron/Next production builds, root lint and focused
  module lint pass. Broader desktop lint retains four pre-existing unused-variable
  errors and three hook warnings in App/project-context.

The Improve fixture uses production EditorWorkspace events, Observer controls,
Context Preview, the review hook/card and Monaco diff, plus the real main context/
session/checkpoint logic. Provider, policy/consent, handoff and application callbacks
are fixture doubles. The signed-in full App/native save/run flow is not thereby
verified. No paid calls, database migrations or model-accuracy claims were made.
Remaining: real-provider answer quality/latency/cost, signed-in native consent and
verification acceptance, backend settings availability, Windows acceptance and
packaged startup footprint. Compilation does not prove behavior preservation.
