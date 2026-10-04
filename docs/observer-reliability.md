# Observer reliability — 4 October 2026

Branch: `fix/observer-reliability`. Existing uncommitted work was retained. No original student file was modified. No running server was stopped or restarted. Production Next.js output remains `.next-build`; development remains `.next`.

## Request path and changes

1. Monaco captures the current selection and unsaved editor buffer in `App.tsx`. Main-process IPC validates the request and the active workspace. Observer is explicitly enabled for the session; meaningful changes queue a request after the default 2,500 ms editing pause. Every subsequent edit, including whitespace, invalidates pending work.
2. `ObserverContextController.prepare` / `buildLiveProjectRequest` gather context. `observer-budget.ts` supplies model envelopes and the common 50,000-character transport ceiling. The user's smaller total Privacy setting still wins. The 8,000-character **related-file** preference no longer restricts the active Explain/Fix selection. Active selections are preserved in full or rejected explicitly; attachments cannot replace mandatory active code. Supporting imports and attached requirements are read-only, removable context with omission reasons. Exclusions, secret screening, stale-attachment checks and complete-file consent remain enforced.
3. Explain and Fix sessions recheck current privacy settings and bind the reviewed snapshot. Fix binds the exact range and source hash. Follow-ups reuse the approved snapshot; they do not silently read newer code.
4. `ObserverApiClient.ask` authenticates and POSTs to `/api/suggest`. An opaque `X-Observer-Trace` ID links context preparation, backend preparation, provider response, backend total and client round-trip log events. Logs contain elapsed milliseconds, item types/sizes and omission categories, never code, filenames, keys, or raw provider error bodies. Detailed omission explanations remain in Context Preview. Provider and client timeouts are bounded; live requests have up to 120 seconds. This is a timeout ceiling, not a response-time promise.
5. The route authenticates, validates the context/schema/model, resolves the selected provider's key and builds the prompt. A conservative UTF-8-byte check of the **serialized prompt**, with output and metadata reserves, runs before provider dispatch. This is a safety envelope, not an exact tokenizer. Unknown requested models are rejected. There is no provider fallback or automatic retry.
6. Provider adapters receive the request cancellation signal. Live/Fix reserve 8,192 output tokens; Explain reserves 6,000. Cut-off responses are rejected. Fix requests one minimal exact-text correction rather than repeating the file. Client validation rejects a mismatched provider, malformed edits, out-of-scope edits, incorrect hashes and nonmatching original text. Review and Apply recheck the current source; no automatic application occurs.

UI messages distinguish local/context blocks, provider quota/rate limiting (429), overload (503/529), timeout, no suggestion, clarification and invalid edits. Once dispatch is attempted, failures no longer assert that no code was sent. Cancellation cannot recall data already transmitted.

## Evidence

The candidate actual file was `/Users/zoraiz/Desktop/React/python.py`, a student-management program with **6,210 characters, 288 newline characters / 289 split lines**, rather than exactly 253 lines. Local tests preserved its full selection for Explain and Fix and executed existing percentage/grade boundary assertions in a temporary directory. Context preparation measured **2 ms** for each mode in that run. Its incomplete `view_student_details` implementation was observed; those grade tests do not establish completeness of the program.

The representative fixture is explicitly synthetic: 253 lines, including padding with teaching comments. A separate variant is exactly 30,000 characters. Mocked transport/parser tests cover random text inside a function, unfinished logic, a concrete arithmetic bug, unchanged correct code, stale source, output cut-off, provider cancellation, unsupported models, quota, overload and budget rejection. Corrected Python is checked for empty marks, two-subject mean, zero marks and grade boundaries. These mocks test safeguards and behavior of known corrections, not AI diagnosis quality.

Real provider tests used **only synthetic fixtures**, sent directly through the production context builder/provider adapter. They did not exercise signed-in Electron → HTTP → Supabase end to end.

| Real Gemini request | Context preparation | Provider response | Result |
| --- | ---: | ---: | --- |
| Random inserted text | 18 ms | 4,526 ms | HTTP 503 overload; no correction |
| Unfinished calculation | 4 ms | 22,678 ms | Valid 43-character replacement; Python behavioral assertions passed |
| Concrete arithmetic bug, Live | 2 ms | 1,846 ms | HTTP 503 overload; no correction |
| Already-correct program | 4 ms | 17,311 ms | `NO_SUGGESTION` |
| 30,000-character program | 193 ms | 4,200 ms | HTTP 503 overload; context accepted locally |
| Explain complete 253-line selection | 19 ms | 13,811 ms | Complete read-only response parsed successfully; explanation quality not independently graded |
| Fix concrete bug in complete selection | 6 ms | 8,541 ms | Valid 43-character replacement; Python behavioral assertions passed |

Raw metadata-only records: [Live](evaluations/observer-live-2026-10-04.json) and [Explain/Fix](evaluations/observer-manual-2026-10-04.json). The 2.5-second editing pause is additional to context and response latency. Backend HTTP preparation/total timing is instrumented and covered with route dependency doubles, but no real signed-in HTTP latency was measured in this run.

Gemini model metadata returned HTTP 200 in 566 ms: `gemini-3.5-flash`, 1,048,576 input tokens, 65,536 output tokens. This agrees with the [official model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash). Availability does not imply spare serving capacity: three of five Live generation requests overloaded. No local OpenAI, DeepSeek or Anthropic keys were configured; their account/model access remains unverified. Adapter tests for them were mocked. Conservative configured envelopes are not an availability guarantee.

Automatic approval review rejected sending the actual local student file to Gemini without explicit file-and-destination approval. Its external evaluation remains pending; the rejected network-enabled command did not execute. Initial sandbox attempts failed at network transport and are not counted as provider results.

## Verification commands

Passed: root `npm test`; desktop suite **252/252**; reliability suite with the actual-file environment variable **6/6**; Next.js production build; Electron typecheck and production build; `git diff --check`. The default root run skips the optional actual-file test, which was also run separately with the path supplied.

```sh
npm test
npm --prefix apps/desktop test
OBSERVER_STUDENT_FILE=/Users/zoraiz/Desktop/React/python.py node --test scripts/observer-reliability.test.ts
npm run build
npm --prefix apps/desktop run build
```

The desktop suite requires local loopback sockets for unrelated browser-bridge tests; those tests pass with appropriate sandbox permission. The opt-in real synthetic evaluation command is:

```sh
OBSERVER_EVAL_REPORT=/tmp/observer-results.json node --env-file=.env.local scripts/evaluate-observer-reliability.ts
```

This command can incur provider charges and sends only generated fixtures unless `OBSERVER_STUDENT_FILE` is explicitly set. Do not set that variable for real evaluation until the actual-file approval is granted. There are no automatic retries. To run only synthetic Explain/Fix, additionally set `OBSERVER_EVAL_CASE=manual`.

## Presentation steps

1. Keep the existing Next.js development server running. When ready to demonstrate, close the older desktop app and launch the built desktop with `npm --prefix apps/desktop run preview` from the repository root. Do not run a production build into `.next`. Open the student-program project and sign in.
2. In Settings, select Gemini / `gemini-3.5-flash`. Keep privacy exclusions and complete-file confirmation enabled. For the large-file demonstration, explicitly choose a **50,000-character total** Privacy budget. The related-file limit may remain 8,000.
3. Select the full program and choose **Explain**. In Context Preview, verify the active selection character count, attached requirements/imports and omission reasons. Approve complete-file sending only if intended. Send and show the response; note that the real synthetic explanation took 13.8 seconds, not 2.5 seconds.
4. On a demonstration copy, replace `return total_marks / number_of_subjects` with `return total_marks * number_of_subjects`. Choose **Fix Code**, preview the exact current unsaved code, and send. Inspect the targeted diff before Apply. Run the percentage/grade checks after applying; demonstrate Undo if desired.
5. Explicitly enable **Live Observer** for the session with a **2.5-second** pause. Insert random text inside the calculation function, or leave `return total_marks /` unfinished. Pause. Show the distinct waiting/checking/provider-response states. If the provider overloads, report it as overload; do not call it “no suggestion.” Retry only by an explicit fresh action when appropriate.
6. Resume typing during a pending response. Verify the older result never becomes an applicable suggestion. Finish the correct function and pause again; a no-suggestion response is valid.
7. For a deterministic offline presentation of guardrails, run the reliability test command above. Label it **mocked transport/local behavioral validation**. Show the saved real-provider table separately, including the overload failures and the unverified actual-file external run.

Remaining limits: model generation is nondeterministic; exact edit validation is not proof of semantic correctness, nor a compiler for every language. The synthetic correction tests are deliberately narrow. A single contiguous correction may need clarification when multiple separated edits are required. Real UI interaction and real authenticated backend latency were not measured here. Neither these tests nor the successful builds establish that the system is perfect or fully reliable.

## Follow-up: privacy-settings HTTP 500 recovered

The reported `Settings request failed` was reproduced against the running development server: `/api/desktop-settings`, `/api/desktop-settings/providers`, and `/login` all returned HTTP 500 HTML containing `missing required error components, refreshing...`. The development manifest referenced generated files that were missing, including the webpack runtime and error-page components. This was a broken local Next.js runtime, before provider dispatch; the evidence does not establish what originally removed those generated files.

A normal Next.js configuration reload regenerated the development runtime without deleting source, build directories, credentials or settings. Read-only verification then returned JSON HTTP 401 for the two unauthenticated settings probes (expected), and HTTP 200 for login. This verifies route recovery, not a signed-in user's settings contents. The Settings client now reports HTTP status and an actionable backend diagnosis for non-JSON failures, with separate timeout/404 messages, instead of hiding all failures behind `Settings request failed`. Raw HTML/error bodies are not displayed, and failure never falls back to default privacy permissions. All 12 settings tests passed.

Follow-up verification: the desktop production build passed. The anonymous schema probe initially reported permission denial for the private settings table, as its migration intentionally revokes anonymous access. The probe now uses the existing server-side key for zero-row schema checks when available, or labels anonymous denial as skipped instead of diagnosing a database outage. This changes no grants or stored settings.
