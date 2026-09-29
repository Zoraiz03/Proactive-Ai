# Manual Fix Code

Fix Code replaces the user-facing **Fix Error** label. The internal action remains
`fix_error`. This iteration changes manual code review only. Explain, Improve Code,
Continue Code, Generate Tests, Live Observer, automatic failed-run help and
multi-file changes retain their separate contracts.

## Scope and privacy

Select code to review that exact range with up to three surrounding lines on each
side. Surroundings are read-only; a proposed edit must stay inside the selection,
including its columns. With no selection, Fix Code reviews the entire active editor
buffer, including unsaved changes. Context Preview shows the actual code and scope
before any provider request. Oversized mandatory code is rejected with a request
to select a smaller section; it is never silently truncated. Context Tray items,
imports and other files are not automatically attached.

“What should this code do, or what is going wrong?” is optional. Diagnostics are
not required. When enabled in Privacy settings, up to three relevant diagnostics
and bounded output from the latest applicable failed run appear as optional
preview items. Run evidence whose source hash does not match the current buffer,
or whose version cannot be confirmed, is prominently marked stale/unconfirmed.
It is not presented as a failure in the current code.

Existing exclusions, secret screening, context budgets, authentication and
server-only provider keys remain in force. A complete file (including a selection's
surrounding context that covers the whole file) still requires consent when
“Confirm complete files” is enabled. Unavailable privacy settings block sending;
this iteration does not repair missing backend tables or change privacy settings.

## Results, clarification, and application

Fix Code returns a correction, one focused clarification question, or “No clear
problem found.” The dedicated prompt asks for evidence, assumptions, an explanation
of why a correction helps, and verification guidance. It forbids invented intent,
requirements/dependencies, removing functionality, weakening checks, or suppressing
errors just to make a failure disappear. Optimization and formatting belong in
Improve Code. Model compliance and diagnosis quality still require live evaluation.

Clarification answers reuse the exact approved code snapshot and bounded prior
question/answer pairs. Every send rechecks current privacy settings and source
version. No conversation transcript is stored in the database. Clear, cancellation,
source changes during a request and project changes invalidate late responses.
A completed review becomes stale when its source changes and offers an explicit
new preview; it does not silently expand scope.

Markdown and fenced code use safe rendering; raw HTML, active links and remote
images are not executed/loaded. Corrections first require **Review correction
diff**, then **Accept Change**. The existing structured edit contract supports one
contiguous replacement/insertion/deletion. An invalid, partial, wrong-file,
out-of-selection or stale proposal is rejected. The model is instructed to explain
when that contract cannot express a complete safe correction.

Apply validates the exact source hash and expected text, creates the existing
checkpoint, validates again, and updates only the in-memory draft. Unrelated
unsaved code stays intact; auto-save is blocked for this applied draft. **Undo Fix
Code change** uses the existing checkpoint and refuses to overwrite newer edits.
“New Fix Code review” in the diff closes the proposal and returns to the Observer
controls; use Ask Observer to preview the new scope.

## Explicit verification

Applied changes are labeled **unverified**. For the existing supported Python and
JavaScript runners, **Run again** uses the existing Save and Run confirmation.
Cancelling that dialog does not save or execute. A changed draft is rejected before
verification of the old applied version. There is no automatic save, execution,
dependency installation or change to another file.

Only this explicit verification action adds a source guard. Python compiles the
exact bytes whose SHA-256 matches the approved version; JavaScript checks the
entry module's loaded source through Node's synchronous load hook. An acknowledgement
is associated with the run and the unchanged source version; ordinary Run keeps
its existing command behavior. JavaScript guarded verification needs Node 22.15+
(or another version with `module.registerHooks`); unsupported runtimes fail rather
than claiming verification. See [Node module hooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions).

A run result is displayed with a short source hash only when it matches the
unchanged applied version. Changed/unavailable code remains unverified. A successful
run covers that execution, not all inputs, dependencies or overall correctness.
This bookkeeping is not a security attestation against adversarial code running
inside the child process.

## Limits

`apps/desktop/src/shared/fix-code.ts` centralizes the limits: 500 characters per
problem/answer, four clarification turns / 4,000 history characters, at most 20,000
code characters, 2,000 surrounding/evidence characters, 20,000 explanation
characters, 8,192 provider output tokens and a 120-second timeout. Current privacy
per-file/total limits can be lower and always take precedence. Input limits never
silently drop the selected/full-file scope. Optional context omissions are shown
in preview. Exhausted clarification/context limits require a fresh focused review.
Provider output-limit responses and incomplete/malformed JSON are actionable
errors, never silently accepted partial fixes.

## Exact manual checks

1. Run the backend with `npm run dev` and Electron with
   `npm --prefix apps/desktop run dev`. Sign in and open a safe fixture project.
   Choose **Demo (offline)** for no paid provider calls. Open a `.py` or `.js` file,
   add an unsaved comment, clear the selection, and select **Fix Code**.
2. Enter an optional problem, click **Ask Observer**, and check that Context Preview
   contains the complete current buffer and your instruction. Cancel: nothing is
   sent. Repeat with a selection and confirm the exact selected range and read-only
   surroundings. Try an over-limit file: it must ask for a smaller selection.
3. Enable **Confirm complete files**. Send a full-file preview, then cancel the
   native consent dialog. Repeat and approve it. Demo reports that it did not run
   AI analysis and returns no edit; it is not a diagnosis or accuracy test.
4. Run `npm --prefix apps/desktop run test:fix-ui` to exercise deterministic mocked
   correction and clarification answers in real Electron/Monaco components,
   including explicit Apply and checkpoint Undo, without provider charges.
5. For live-provider acceptance only after approving its cost/context, use the
   examples below. Answer a clarification in Observer without re-copying code.
   Check the scope stays unchanged. Edit the source during a pending request,
   cancel, clear, or switch project; no late answer may appear as current.
6. For a correction, review the diff and confirm the buffer is unchanged until
   **Accept Change**. Check unrelated unsaved text remains and the file is still
   dirty/unverified. Undo immediately to restore the original unsaved buffer.
   With a second applied proposal, type more text and verify Undo refuses to
   overwrite it.
7. Apply a correction to a safe Python/JavaScript fixture; choose **Run again**,
   cancel Save and Run, and check there was no save/execution. Repeat with explicit
   save approval. Check the result's source version and limited-evidence wording.
   Change the draft afterward: the old run must no longer count as verification.
8. Confirm exclusions/secrets block sending, disabled diagnostic/terminal settings
   remove evidence, and an error from an earlier source version is labeled stale.

## Live-provider evaluation checklist — pending

Use safe disposable files. Record provider/model, approved scope, intended behavior,
outcome, edit validity, reason/assumptions, verification guidance, latency and cost.
Do not infer accuracy from mocked tests. These expected outcomes guide evaluation;
they are not claims that a provider will produce them reliably.

| Case | Code / user instruction | Evaluate |
| --- | --- | --- |
| Syntax | `def add(a, b)` followed by `    return a + b` | Minimal colon correction; no unrelated rewrite; no claim of execution. |
| Undefined variable | `def square(value): return v * v` | Explain undefined `v`; use the visible parameter only if justified; no invented dependency. |
| Ambiguous incomplete function | `def transform(items): pass` with no instruction | One focused clarification or honest limits; no invented transform behavior. |
| Stated logic error | `def add(a, b): return a - b`; instruction “Return the sum of the two inputs.” | Minimal addition correction tied to stated intent and useful verification guidance. |
| Already correct | `def add(a, b): return a + b`; same instruction | No clear problem found; no formatting-only edit or claim of proven correctness. |

## Automated evidence and remaining work

255 desktop tests pass, including 24 Fix Code scope/session/privacy/edit/checkpoint/
runner tests. Root tests cover dedicated prompts, all outcomes, each provider's
mocked output budget, parsing, authenticated route validation/no transcript writes,
IPC preview authorization and other-action regression contracts. Fix Code,
Explain, Live card/diff and Live trigger Electron fixtures pass. Type checks,
Next.js and Electron builds, root lint and focused module lint pass. Broader desktop
lint retains the four pre-existing unused-variable errors and three hook warnings.

The Fix fixture uses production EditorWorkspace selection events, ObserverPanel,
Context Preview, useFixCode, FixCodeCard and Monaco diff, plus the real main session,
context engine and checkpoint store. Provider responses, settings, consent and the
fixture's application callbacks are controlled doubles. It verifies visible states
and interactions, not the full signed-in App or native save/run dialogs. Guarded
Python/CommonJS/ESM execution is separately tested locally with harmless fixtures,
including source mismatch rejection.

Remaining: signed-in native complete-file and save/run acceptance; actual backend
privacy settings availability; live-provider quality, latency and cost; Windows
acceptance and older Node runtime behavior. No paid API calls or migrations were
made. No model accuracy claim is based on the mocked results.
