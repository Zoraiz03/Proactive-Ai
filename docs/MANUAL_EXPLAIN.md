# Manual code Explain and follow-ups

Status: implemented locally, 2026-09-29. Automated tests use mocked responses;
real-provider answer quality has not been evaluated. No paid API calls were made.

## Using it

1. Restart the Next.js backend and Electron after rebuilding. Sign in and open a
   code file in a workspace. Choose **Explain** in Observer. Use **Demo (offline)**
   to check the controls without a provider call; Demo does not analyze code.
2. Select the code to explain. Without a selection, Explain uses the current
   function/symbol when detected, otherwise nearby lines. Optionally enter
   **Explain this for a beginner** in **Question or instruction**.
3. Click **Ask Observer**. Inspect **Context Preview**, including the file, line
   range, redaction/truncation flags, and exact content. Explain includes no
   Context Tray attachments or automatically discovered files. Nothing is sent
   until **Send to Observer**. If **Confirm complete files** is enabled and the
   excerpt covers the complete file, approve the separate confirmation to send.
4. Read the Markdown answer, scroll the conversation/code blocks, and use
   **Copy answer** for the latest answer. Examples are text only; Explain offers
   no edit, Apply, save, or execution action.
5. Enter **Why does this return undefined?** (or another relevant question) beneath
   the answer and click **Ask follow-up**. It reuses the approved code snapshot and
   bounded recent messages. No new file contents are silently gathered.
6. Edit the source. The conversation should say **Based on an older source
   snapshot**. Further questions still use the old snapshot. On that file, choose
   **Explain**, then **Refresh through context preview** to explicitly review and
   approve current code. Refresh starts a new conversation.
7. During a request, click **Cancel request**. Clear with
   **New explanation / Clear conversation**, or switch/close the project. Late
   replies must not recreate the cleared conversation. Cancellation stops waiting
   and aborts the client request; an already-sent provider request may still finish.

The response asks for an overview, important logic, inputs/outputs, assumptions,
pitfalls, and a small example when useful. It should scale detail to complexity,
distinguish evidence from assumptions, and ask for missing context. These are
prompt requirements, not demonstrated model-accuracy guarantees.

## Privacy and limits

The provider/mode controls remain fixed while a conversation is open; clear it
before choosing a different mode or provider.

Conversation transcripts stay in renderer/main-process memory for the session;
requests set `storeHistory: false`. Each follow-up uses the authenticated backend
and server-side provider keys, revalidates the original package, and rechecks
current Observer settings, exclusions, secret screening, and size limits.
Unavailable privacy settings block sending with the backend's error. Changed
complete-file consent requirements require a fresh preview; consent is never
inferred from a follow-up question.

Configuration is centralized in `apps/desktop/src/shared/explanation.ts`:

| Limit | Default |
| --- | --- |
| Question/guidance | 500 characters |
| Retained recent history | 8 messages (4 complete turns) |
| Retained history characters | 24,000 |
| Original context | 20,000 characters maximum |
| Explanation output | 20,000 characters / 6,000 provider output tokens |
| Client response timeout | 120 seconds |

Current Privacy total/per-file limits also apply. The code snapshot and current
question consume the total input budget first; oldest complete history turns are
omitted to fit what remains. The UI reports cumulative omitted-message counts.
Provider token-limit stops, malformed JSON, excessive output, or edit proposals
produce actionable errors rather than displaying silently truncated output.
Other Observer actions retain their existing provider budgets/contracts.

## Small real-provider evaluation checklist — pending approval

Use safe fixture files, the same selected scope and guidance across providers,
and record provider/model/date, response time, cost if available, omissions, and
factual errors. Obtain approval before paid calls. Nothing below has been scored.

| Case | Fixture | What to assess |
| --- | --- | --- |
| Simple function | `function add(a, b) { return a + b; }` | Overview; inputs/output; JavaScript addition vs string concatenation; small example without unsupported type claims. |
| Branching logic | `function fee(total, member) { if (total >= 100) return 0; if (member) return 3; return 7; }` | Branch order, boundary at 100, each return path, concise walkthrough. |
| Async code | `async function load(url) { const response = await fetch(url); if (!response.ok) throw new Error("HTTP error"); return response.json(); }` | Await/promise flow, inputs/result, HTTP/network/JSON rejection possibilities; no claim the URL or data schema was inspected. |
| Missing dependency | `function greet(id) { const user = lookupUser(id); return user.name.toUpperCase(); }` | Identify `lookupUser` as unavailable; distinguish assumptions about its return value; ask for its contract instead of inventing behavior. |

For each, ask a follow-up about one assumption, change the source, and verify the
old-snapshot label and explicit refresh. Check whether older model mistakes are
corrected rather than repeated. Rate usefulness/clarity separately from factual
correctness. A passing mocked control-flow test is not a passing quality review.

## Automated verification

- `npm --prefix apps/desktop test`: session history, privacy/consent, cancellation,
  duplicate prevention, code-scope selection and existing regressions.
- `npm test`: Explain prompt/output-budget/parser checks, authenticated route and
  IPC validation, no transcript storage, project isolation, other-mode contracts.
- `npm --prefix apps/desktop run test:explain-ui`: real React Observer controls,
  Context Preview, conversation hook/component, mocked provider/session policy;
  checks Markdown safety, copy, follow-ups, snapshot labels, refresh, bounded
  history, cancellation, errors, and late replies after clear/project switching.
- Existing Live Observer renderer fixtures protect trigger and explicit edit-review
  behavior. Signed-in native consent and live backend/provider acceptance remain
  manual checks; the prior backend schema availability problem is not repaired by
  this iteration.
