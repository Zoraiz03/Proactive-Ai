# Proactive AI IDE — Current Modules and Functional Inventory

**Baseline date:** 2 October 2026  
**Source baseline:** `desktop-ide-foundation`, commit `05dbc9d`  
**Purpose:** factual input for revising the project scope, Software Requirements Specification (SRS), Software Design Description (SDD), and diagrams.

This document describes **what the product does**, its functional modules, user controls, outputs, and limitations. It deliberately omits implementation algorithms, request-processing sequences, API designs, database schemas, and deployment instructions. It is an inventory for the revised documents, not a replacement for an approved SRS or SDD.

## 1. Current product definition

Proactive AI IDE is a desktop development workspace with local project editing, controlled code execution, Markdown documentation support, and an AI assistant called **Observer**. It helps a developer understand code, diagnose problems, improve maintainability or performance, propose code and documentation changes, and review those changes before accepting them.

The developer remains in control of file changes, execution, and transmission of project context. The product includes manual assistance and separately controlled proactive assistance. It also includes an optional Chrome extension for explicitly collecting selected research text.

The project has evolved beyond its original browser workspace. The desktop IDE is now the main product direction. The earlier web application remains in the repository, including account registration/sign-in, a browser workspace, and AI-related services. It should not be described as removed, nor as functionally identical to the desktop IDE.

### Intended users

- Developers working on local source-code projects.
- Students and less-experienced programmers seeking explanations and help investigating errors.
- Developers maintaining Markdown project documentation alongside code.
- Researchers/evaluators reviewing the usefulness and interruption level of proactive assistance through optional local evaluation features.

These are usage categories, not implemented account permission roles. No separate administrator, instructor, team manager, or reviewer portal was established by this inspection.

### Status terms

| Status | Meaning in this document |
| --- | --- |
| Implemented | Current source includes the feature and its user-facing controls or supporting product operation. This does not imply every platform or live-provider path has passed acceptance. |
| Experimental | Implemented, but deliberately offered as an experiment with narrower limits and further evaluation required. |
| Partial | Some functionality exists, with specific missing connections or restrictions. |
| Retained web functionality | Exists in the earlier web application; do not assume it is the desktop version of the feature. |
| Planned | Documented intent without the completed user-facing capability. |

## 2. Module catalogue

These IDs are proposed documentation identifiers for requirements and diagrams. They are functional groupings, not a claim that the product contains 19 separate deployable services.

| ID | Functional module | Current status |
| --- | --- | --- |
| M01 | Accounts, sessions, and provider access | Implemented; desktop sign-in and retained web registration |
| M02 | Desktop workspace and navigation | Implemented |
| M03 | Local project and file management | Implemented |
| M04 | Code editing and saving | Implemented |
| M05 | Project search | Implemented |
| M06 | Terminal, code execution, output, and diagnostics | Implemented with execution-language limits |
| M07 | Manual Observer assistance | Implemented; action-specific maturity varies |
| M08 | Context selection, preview, and Context Tray | Implemented; project knowledge integration partial |
| M09 | AI change review, checkpoints, and Undo | Implemented |
| M10 | Planned multi-file changes and verification | Implemented with bounded scope |
| M11 | Proactive Assist nudges | Implemented with controlled detectors |
| M12 | Automatic failed-run explanation | Experimental |
| M13 | Live Observer | Experimental |
| M14 | Markdown editing and document assistance | Implemented |
| M15 | Documentation impact and reviewed updates | Implemented with evidence limits |
| M16 | Git source-control inspection | Implemented, read-only |
| M17 | Chrome research capture and desktop review | Implemented; workspace-binding improvement pending |
| M18 | Settings, privacy, and retention controls | Implemented |
| M19 | Observer insights and evaluation | Implemented local evaluation features |

## 3. Detailed functional inventory

### M01 — Accounts, sessions, and provider access

- Sign in to the desktop IDE using the existing project account and sign out.
- Display initializing, signed-out, signed-in, and authentication/configuration-error states.
- Retain account registration and sign-in in the web application. A desktop registration wizard is not established by the current desktop authentication interface.
- Choose an AI provider and its supported configured model.
- Show provider availability and whether a user key is configured.
- Save, optionally verify, and delete a provider API key through the existing account/provider controls.
- Offer a Demo provider for synthetic demonstrations without real model analysis.
- Report missing authentication, unavailable provider configuration, missing keys, request failures, and other actionable errors.

**Boundary:** provider integrations are options, not evidence that every provider is currently operational for every action. Manual Explain specifically blocks the repository's retired `deepseek-chat` configuration with an explanation; the inventory does not certify live-provider availability. A ChatGPT-labeled provider option does not imply access through a user's ChatGPT subscription.

**Evidence:** [Desktop authentication](../apps/desktop/src/renderer/src/DesktopAuth.tsx), [provider/settings controls](../apps/desktop/src/renderer/src/SettingsPanel.tsx), [web signup](../src/app/signup/page.tsx), [Explain capacity policy](../apps/desktop/src/shared/explanation-budget.ts).

### M02 — Desktop workspace and navigation

- Provide a desktop IDE layout with file Explorer, editor tabs, bottom panels, and Observer.
- Provide a welcome screen, open-folder action, recent projects, and project reopening.
- Switch between Explorer, Search, Source Control, and Documentation views.
- Show Terminal, Output, and run-related information in the bottom workspace area.
- Provide a searchable command palette and keyboard shortcuts for common operations.
- Disable unavailable commands and explain why they cannot currently be used.
- Offer Conversation and Project Context tabs in Observer.
- Preserve Observer conversations, drafts, attachments, pending work, and review state when switching those two tabs.
- Support keyboard tab navigation, visible focus, and dialog focus handling.
- Offer light, dark, and system appearance preferences within the existing coffee/cream visual design.

**Boundary:** switching an Observer tab is navigation, not consent to send code or a request for a new AI answer.

**Evidence:** [workspace UI](../apps/desktop/src/renderer/src/App.tsx), [commands](../apps/desktop/src/renderer/src/commands.ts), [Observer panel](../apps/desktop/src/renderer/src/ObserverPanel.tsx), [welcome screen](../apps/desktop/src/renderer/src/WelcomeScreen.tsx).

### M03 — Local project and file management

- Open a local project folder and browse its files/subfolders.
- Open supported text/code files in editor tabs.
- Create files and folders, rename files/folders, and delete permitted targets with the applicable confirmation.
- Restrict the IDE's file operations to the opened workspace and reject invalid or escaping paths.
- Recognize unsupported, binary, oversized, missing, and unavailable files with explicit states.
- Detect external file changes and refresh the visible project.
- Reload externally changed clean files; offer reload/keep-local choices for conflicting unsaved content.
- Preserve unsaved buffers when a file disappears externally, rather than silently discarding the user's draft.
- Store recent-project and bounded open-tab metadata for reopening projects.

**Boundary:** file deletion is not an unrestricted recursive folder-deletion service; existing directory restrictions apply. Restoring tab metadata is not a guarantee that unsaved drafts survive a crash. Local filesystem projects are not automatically uploaded or cloud-synchronized.

**Evidence:** [workspace capabilities](../apps/desktop/src/shared/workspace.ts), [file operations](../apps/desktop/src/main/workspace-files.ts), [external synchronization](../apps/desktop/src/shared/external-sync.ts), [recent/local settings storage](../apps/desktop/src/main/settings-store.ts).

### M04 — Code editing and saving

- Edit local text and code with language-aware highlighting and editor navigation.
- Support multiple tabs, active-tab selection, dirty indicators, and safe tab closing.
- Save the active file and save all dirty files.
- Offer configurable editor font size, indentation size, word wrapping, and minimap.
- Offer opt-in delayed autosave for eligible ordinary editor changes.
- Protect unsaved changes with Save/Discard/Cancel choices where required.
- Supply current selections, cursor locations, and unsaved buffers to explicitly chosen Observer actions.
- Keep applied single-file Observer edits unsaved until the user explicitly saves; ordinary autosave does not silently save those reviewed AI changes.

The language mapping includes Python, JavaScript, TypeScript, JSX/TSX, Java, C/C++, HTML, CSS, JSON, Markdown/MDX, YAML, and plain text. **Editing/highlighting support is broader than built-in execution, function detection, or Live Observer support.**

**Boundary:** a dedicated Save As command is not present in the inspected command registry. Do not claim a universal debugger, language server suite, or full refactoring platform from the editor component alone.

**Evidence:** [editor workspace](../apps/desktop/src/renderer/src/App.tsx), [language mapping](../apps/desktop/src/shared/languages.ts), [Save/Save All commands](../apps/desktop/src/renderer/src/commands.ts).

### M05 — Project search

- Search within the opened project.
- Offer case-sensitive, whole-word, and regular-expression search.
- Filter searched paths using include/exclude patterns.
- Show matching files, line locations, and bounded text previews.
- Open a match in the editor at its relevant location.
- Cancel a search and disclose bounded/truncated search results.

**Boundary:** this is project text search. It is not semantic AI retrieval or an unrestricted search of the computer. A dedicated workspace-wide Replace feature is not established here.

**Evidence:** [search UI](../apps/desktop/src/renderer/src/SearchPanel.tsx), [search contract](../apps/desktop/src/shared/search.ts).

### M06 — Terminal, execution, output, and diagnostics

- Start and close an interactive terminal associated with the opened workspace.
- Accept explicit user-entered shell commands and display terminal output.
- Provide a separate explicit Run Current File action for saved Python and JavaScript files.
- Request the applicable save confirmation before running unsaved work.
- Stop a controlled file run and display success, failure, stopped state, exit status, duration, stdout, and stderr.
- Present recognized run diagnostics and allow navigation to relevant source locations.
- Display bounded IDE status/error messages in Output.
- Offer explicit supported test/build verification commands in eligible review workflows.
- Distinguish a result for the executed source version from a result for subsequently changed code.

**Boundary:** the terminal can run user commands, but Observer does not automatically execute them. The dedicated runner is not a general runner for every editable language. It depends on installed runtimes/tools. A successful run is not proof of complete correctness. The user-operated shell should not be depicted as a filesystem sandbox merely because IDE file operations are workspace-confined.

**Evidence:** [terminal](../apps/desktop/src/shared/terminal.ts), [runner](../apps/desktop/src/shared/runner.ts), [verification commands](../apps/desktop/src/shared/verification-task.ts), [bottom panel](../apps/desktop/src/renderer/src/BottomPanel.tsx).

### M07 — Manual Observer assistance

Observer presents action-specific assistance on user request. Loading, cancellation, duplicate-send prevention, errors, dismissal, and stale-response protection are part of the relevant workflows.

| Action | User-facing capability | Important boundary |
| --- | --- | --- |
| Explain | Explain explicitly selected code, a detected current function, or the entire active buffer; accept optional guidance; support bounded follow-up questions. | Read-only, exact approved snapshot; no edit proposals or execution. |
| Fix Code | Review selected code with read-only surrounding context, or the entire active file; accept an optional description of expected behavior/problem. | Can return a justified correction, one clarification question, or no clear problem; does not require an explicit error. |
| Improve Code | Review a selection/current function, or an explicitly approved file; choose Readability & maintainability or Performance and add an instruction. | One coherent improvement; can clarify, find no worthwhile improvement, or identify a correctness concern for explicit Fix Code handoff. |
| Continue Code | Request a short continuation using available approved code context. | Does not imply autonomous completion of a project or free-form agent execution. |
| Generate Tests | Request proposed tests for the reviewed code. | Generated tests are suggestions; they are not automatically run or evidence of coverage/correctness. |
| Add Comments/Documentation | Request code comments or documentation-oriented assistance for code. | Separate from the Markdown document actions and evidence-based documentation-update workflow. |
| Plan Multi-File Change | Describe a coordinated change and request a bounded plan/change set. | Has its own approval/review controls; see M10. |

#### Explain-specific functionality

- Show scope choices and actual source ranges; disable unavailable choices with a reason.
- Use unsaved editor content and preview the exact snapshot before sending.
- Request a complete detected function when supported; reject ambiguous or oversized scopes rather than silently substitute unrelated lines.
- Provide readable Markdown answers and fenced examples, copying, scrolling, and follow-up input.
- Retain bounded session-only conversation history and indicate omitted older messages.
- Mark conversations based on an older source snapshot when the editor changes.
- Offer explicit refresh through context preview and New explanation/Clear conversation.
- Require a new preview if the active source changes before the preview is sent.
- Provide a separate manual Explain code-size setting. The current application ceiling is 20,000 code characters, with separate total-context and conservative model/response budgets.

#### Fix Code-specific functionality

- Include permitted relevant diagnostics or applicable run evidence in review context.
- Identify stale/unconfirmed run errors rather than attributing them to the current buffer.
- Allow an answer to a clarification within Observer using the approved context.
- Explain the suspected problem, proposed correction, and verification suggestions.
- Restrict a selection-based edit to the approved selection and reject unsafe/stale proposals.
- Label applied changes as unverified and offer explicit Run again when supported.

#### Improve Code-specific functionality

- Present the proposed improvement, explanation, trade-offs, assumptions, and suggested checks.
- Distinguish performance reasoning from measured performance; measurements are not invented.
- Preserve behavior/interfaces as a stated requirement, not a guaranteed model outcome.
- Allow clarification within the review and an explicit Fix Code handoff for correctness concerns.
- Reuse explicit diff review, Apply, checkpoint, Undo, and stale-source protection.

**Boundary:** Explain follow-ups and Fix/Improve clarifications are different from a universal persistent project chat. Continue/Generate Tests/Add Comments retain simpler existing contracts; do not attribute every specialized Explain/Fix/Improve capability to them. Model output is fallible and may be rejected or require user clarification.

**Evidence:** [action catalogue](../apps/desktop/src/shared/observer.ts), [Explain](./MANUAL_EXPLAIN.md), [Fix Code](./FIX_CODE.md), [Improve Code](./IMPROVE_CODE.md), [current Explain scope/budget evidence](./CONTEXT_PIPELINE_AUDIT.md#phase-a-delivery--2026-09-30).

### M08 — Context selection, preview, and Context Tray

- Display the exact included context before eligible manual AI requests.
- Identify source files, line ranges, item reasons, size, complete-file inclusion, and optional/required items.
- Allow removal of optional preview items.
- Screen exclusions and suspected secrets; enforce request-size limits and complete-file consent.
- Build action-specific bounded context from permitted code, diagnostics, errors, related files, rules/configuration, and user attachments where supported.
- Maintain a single session Context Tray inside the Project Context tab.
- Add selections, symbols/excerpts, permitted complete files, Markdown sections, project rules, diagnostics, run/test/build failures, selected output, and accepted web research as supported attachment types.
- Inspect, remove, reorder, clear, refresh, keep-original, or explicitly shorten eligible tray items.
- Identify stale/unavailable attachments and block unresolved unsafe transmission.

| Request family | Current relationship to project context |
| --- | --- |
| Manual code Explain | Approved active-file scope, user question and approved bounded conversation; no tray, saved goals, research, or other files. |
| Fix Code | Approved active-file scope and permitted evidence; not the general tray. |
| Improve Code | Approved code scope and bounded available conventions/test configuration; not the general tray. |
| Eligible other manual/document/multi-file workflows | Can use approved context appropriate to the action; the actual preview is the authoritative included set. |
| Live Observer | Bounded active-file excerpt and permitted nearby diagnostics; no project notes, tray, or research. |
| Automatic failed-run explanation | Bounded failed-run code/error evidence; no general project-knowledge feed. |

**Boundary:** the Project Context tab currently contains the existing tray, not a completed persistent project-memory module. Saved project goals, current tasks, confirmed requirements, and their cross-mode integration remain planned. Adding an attachment is not itself approval for automatic transmission. Overlapping attachments are not universally deduplicated.

**Evidence:** [Context Tray](../apps/desktop/src/renderer/src/ContextTray.tsx), [preview](../apps/desktop/src/renderer/src/ContextPreview.tsx), [context inventory/audit](./CONTEXT_PIPELINE_AUDIT.md), [pending project knowledge phases](./PROJECT_CONTEXT_PLAN.md).

### M09 — AI change review, checkpoints, and Undo

- Present an explanation and original/proposed diff for a valid structured single-file code edit.
- Require explicit Apply; allow rejection/dismissal instead.
- Reject edits for a different file, outdated source, mismatched original text, or unsupported edit contract.
- Preserve unrelated unsaved content when an accepted edit is safely representable.
- Create bounded checkpoints and offer Undo of the relevant Observer change.
- Prevent stale Undo from blindly overwriting newer work.
- Keep suggested, reviewed, applied, saved, and verified states distinct.

**Boundary:** not every model answer is a valid applicable edit. Explain is read-only. Single-file code Apply changes the editor buffer without automatic saving; explicitly approved multi-file/documentation workflows can write files as described below. A project-wide claim that all AI Apply actions are unsaved would therefore be inaccurate.

**Evidence:** [edit review](../apps/desktop/src/renderer/src/ObserverEditReview.tsx), [edit validation](../apps/desktop/src/shared/ai-edit.ts), [checkpoints](../apps/desktop/src/shared/checkpoints.ts), [application actions](../apps/desktop/src/renderer/src/App.tsx).

### M10 — Planned multi-file changes and verification

- Accept a user description of a coordinated project change.
- Present a plan naming affected files, reasons, risks, and verification suggestions.
- Allow user approval/rejection before generating the complete change set.
- Propose bounded updates to existing files and creation of new files.
- Show affected-file navigation, complete diffs, explanations, warnings, and size limits.
- Allow regeneration or rejection of the entire set and explicit approval of the complete set.
- Check for changed source, file-existence conflicts, dirty files, and other unsafe application conditions.
- Apply approved file changes as a coordinated operation with rollback safeguards.
- Offer Undo Multi-File Change and explicit optional supported verification commands.
- Display verification results without presenting one check as proof of overall correctness.

**Boundary:** the supported change contract is create/update, not arbitrary file deletion, renaming, installation, deployment, or unrestricted shell automation. Individual-file exclusion from a generated set is deliberately unavailable where consistency cannot be established. Limits on affected files, changed lines, and generated size apply. Approved application can write local files; execution still requires a separate explicit action.

**Evidence:** [multi-file contract](../apps/desktop/src/shared/multi-file-change.ts), [review UI](../apps/desktop/src/renderer/src/MultiFileChangeWorkspace.tsx), [verification controls](../apps/desktop/src/shared/verification-task.ts).

### M11 — Proactive Assist nudges

- Offer Off, Manual, and Assist mode choices.
- In Assist, recognize bounded objective signals such as persistent diagnostics, failed controlled runs, and failed supported tests/builds.
- Show a nonmodal help nudge with relevant actions such as Investigate, Explain, or Suggest Fix.
- Allow Not now, muting an error/file/project, and disabling Assist.
- Limit interruptions using cooldowns, occurrence thresholds, per-detector limits, and presets.
- Avoid presenting obsolete/resolved events as current assistance opportunities.
- Give manual requests and active review/dialog work priority.

**Boundary:** a local nudge is not the same as an automatic AI request. The user must choose an applicable action before the manual context-review/send path. This is not proof that the application detects a user's emotions, gaze, frustration, or general intentions.

**Evidence:** [Assist event/actions](../apps/desktop/src/shared/proactive-observer.ts), [Observer controls](../apps/desktop/src/renderer/src/ObserverPanel.tsx), [Assist settings](../apps/desktop/src/shared/settings.ts).

### M12 — Automatic failed-run explanation — experimental

- Offer a separate opt-in automatic explanation for eligible failed controlled runs.
- Send permitted bounded code/error context after the explicit enabling consent.
- Present an explanation of what happened, likely cause, and a possible next step.
- Provide dismissal and accurate status/error messages.
- Respect privacy blockers, context bounds, request coordination, and source/project changes.

**Boundary:** this is explanation-only assistance, not automatic fixing, execution, or an interpretation of every command typed in the terminal. It is separate from both Assist nudges and Live Observer.

**Evidence:** [feature and acceptance record](./AUTOMATIC_RUN_EXPLANATIONS.md), [automatic-run controls](../apps/desktop/src/shared/automatic-run.ts), [card](../apps/desktop/src/renderer/src/AutomaticRunCard.tsx).

### M13 — Live Observer — experimental

- Offer a separate session-only On/Off switch, off by default.
- Explain that bounded active-file content, including unsaved code, may be sent automatically after enabling.
- Initially support Python and JavaScript code files.
- Consider a suggestion after meaningful active-editor edits and a pause; cursor movement/file opening alone do not request a suggestion.
- Preserve pending meaningful edits across trailing spaces/Enter and retain eligible edits through cooldown.
- Distinguish typing pause, cooldown, hourly cap, provider waiting time, privacy blockers, and competing activity in status messages.
- Present one compact nonmodal suggestion near the code with a panel fallback.
- Allow Dismiss/Escape and avoid repeating dismissed suggestions for unchanged context.
- Accept no suggestion as a valid result.
- Cancel/reject stale work when typing resumes, the file/project changes, focus is lost, or the feature is disabled.
- Offer explicit manual review for blocked complete-file context.
- Route proposed changes through the existing diff/Apply/checkpoint controls.

**Current experimental defaults:** 4-second typing pause, 30-second request cooldown, and 10 requests/hour. Provider response time is additional. Limits remain configured; this is not an unlimited background assistant.

**Boundary:** no global keystroke surveillance, automatic project upload, project-goal understanding, automatic code application, saving, or execution. This is an implemented experiment, not validated evidence of model accuracy or productivity improvement.

**Evidence:** [Live controls/limits](../apps/desktop/src/shared/live-observer.ts), [Live controller](../apps/desktop/src/main/live-observer.ts), [editor events](../apps/desktop/src/renderer/src/live-editor-events.ts), [verification history](./DESKTOP_IDE_PLAN.md#live-observer-trigger-reliability-and-status-repair--2026-09-28).

### M14 — Markdown editing and document assistance

- Edit Markdown as source and provide Edit, Preview, and Split views.
- Show a safely rendered Markdown preview and code blocks.
- Attach a selected Markdown section to eligible context workflows.
- Offer Explain this document, Improve writing, Summarize, and Generate README section actions.
- Support reviewed assistance on project documentation within the relevant action's context limits.

**Boundary:** desktop Markdown support is not a general Word/PDF editing suite. An MDX extension does not imply execution of embedded application components. The retained web rich-text editor is a separate earlier capability; do not depict it as the desktop Markdown editor.

**Evidence:** [Markdown support](../apps/desktop/src/shared/markdown.ts), [preview](../apps/desktop/src/renderer/src/MarkdownPreview.tsx), [document actions](../apps/desktop/src/shared/observer.ts).

### M15 — Documentation impact and reviewed updates

- Identify possible relationships between changed code and local Markdown documentation.
- Show supporting references, confidence, code/document locations, and relationship status.
- Cover references such as file paths, symbols, API routes, package commands, configuration names, project links, README setup guidance, and test documentation.
- Let the user open evidence, confirm/reject a relationship, dismiss an item, and control detection settings.
- Use available Git changes or permitted session-change evidence.
- Offer an explicit draft update for a reviewed/confirmed relationship and selected documentation scope.
- Support relevant changes such as updating/adding a section, correcting a path/route/command, updating symbol descriptions, setup instructions, or examples.
- Preview the proposed document change, edit its proposed text, copy or regenerate it, and refresh stale context.
- Reject stale code/document evidence or invalid output.
- After approval, offer document preview, relationship rechecking, Git diff, relevant context attachment, and Undo.
- Require explicit approval for a documentation update and provide the existing restoration/checkpoint controls.

**Boundary:** relationships are candidates supported by limited evidence, not proof of semantic consistency. This does not automatically maintain all documentation, regenerate an SRS/SDD, or redraw UML diagrams. Approved documentation application may save the target file; detection alone never authorizes that change.

**Evidence:** [impact panel](../apps/desktop/src/renderer/src/DocumentationImpactPanel.tsx), [relationship types](../apps/desktop/src/shared/documentation-impact.ts), [update contract](../apps/desktop/src/shared/documentation-update.ts), [update review](../apps/desktop/src/renderer/src/DocumentationUpdateWorkspace.tsx).

### M16 — Git source-control inspection

- Display whether the workspace is a Git repository and show the current branch.
- List changed files and distinguish staged/unstaged status and common change categories.
- Open a read-only text diff for supported changed files.
- Explain missing Git, non-repository, binary, oversized, or unavailable diff states.
- Supply relevant change evidence for documentation-impact inspection.

**Boundary:** the built-in Source Control module does **not** offer staging, committing, pushing, branch creation/deletion, or pull-request management. Git commands performed by the user in a terminal, or by a development assistant during this project, are not implemented IDE buttons/features.

**Evidence:** [Git contract](../apps/desktop/src/shared/git.ts), [Source Control UI](../apps/desktop/src/renderer/src/SourceControlPanel.tsx).

### M17 — Chrome research capture and desktop review

- Enable browser integration explicitly in desktop Settings.
- Pair the Chrome extension with the desktop application using a temporary pairing code.
- Enable the extension for individual supported websites.
- Select webpage text, inspect an inline preview, and explicitly choose Send to IDE.
- Show an incoming-selection review in the desktop with inspect, accept-to-tray, and reject choices.
- Retain source attribution and sanitized web-source information.
- Reject unsafe/unsupported capture situations and apply bounded capture/queue limits.
- Provide connection state, explicit retry, disconnect/forget, and revoke controls.

**Boundary:** this is selected-text capture, not autonomous browsing, full browsing-history collection, web search, whole-page crawling, or guaranteed AI inclusion. Accepted research remains a tray item until an eligible request preview includes it. Stronger workspace binding for queued research remains a documented pending improvement; do not claim it is complete.

**Evidence:** [browser feature description](./DESKTOP_BROWSER_INTEGRATION.md), [extension](../apps/chrome-extension/src/selection-overlay.ts), [incoming review](../apps/desktop/src/renderer/src/IncomingWebContextReview.tsx), [pending workspace-binding work](./PROJECT_CONTEXT_PLAN.md).

### M18 — Settings, privacy, and retention

- Configure appearance, startup/reopen behavior, tab restoration, and editor preferences.
- Configure provider preference, default Observer action, Observer availability, and eligible history storage.
- Set context-size limits, related-file limits, and the separate manual Explain code ceiling.
- Control permitted diagnostics/run-error inclusion and complete-file confirmation.
- Exclude additional project files/folders from AI context and retain mandatory secret-file exclusions.
- Report unavailable privacy settings explicitly and block affected sends rather than assume consent.
- Configure proactive presets, detectors, cooldowns, caps, feedback collection, and retention.
- Configure documentation-impact preferences and browser integration.
- Clear supported history, recent-project records, checkpoints, or evaluation data through their respective controls.

**Boundary:** settings are not a guarantee that secret screening catches every possible secret. Code and external content can contain untrusted instructions. Full-file consent and experimental automatic-transmission consent must remain distinct from ordinary settings changes. Some privacy/preferences are account-associated; not all settings are local and not all project information is cloud-synced.

**Evidence:** [settings UI](../apps/desktop/src/renderer/src/SettingsPanel.tsx), [settings catalogue](../apps/desktop/src/shared/settings.ts), [context privacy audit](./CONTEXT_PIPELINE_AUDIT.md).

### M19 — Observer insights and evaluation

- Display local aggregate and per-detector assistance metrics.
- Track eligible/shown nudges, chosen actions, dismissals/muting, usefulness feedback, resolution signals, and related timing where recorded.
- Offer low/balanced/high Assist presets and reviewable settings recommendations.
- Allow optional usefulness responses, including skipping feedback.
- Start/stop a locally consented evaluation session using a participant pseudonym.
- Preview/export sanitized JSON reports and CSV summaries.
- Configure collection/retention and clear evaluation data.

**Boundary:** these are local interaction/evaluation records, not proven measures of productivity, causal benefit, or AI correctness. The evaluation feature is designed not to collect source code, prompts, model answers, raw errors, terminal output, or identifiable project paths as evaluation content. It is not a team analytics/admin dashboard.

**Evidence:** [Insights UI](../apps/desktop/src/renderer/src/ObserverInsightsSettings.tsx), [evaluation record types](../apps/desktop/src/shared/proactive-insights.ts).

## 4. Retained web-application functionality

The original web application remains a separate surface in the codebase:

- Account signup, login, session display, and sign-out.
- Browser-local workspace files with create, rename, delete, active-file selection, and persisted editing state.
- Code editing and a rich-text document editor.
- Explicit Ask Observer with provider selection and key-entry guidance.
- Display, accept, or dismiss a suggestion and record eligible feedback/history.
- A web suggestion-acceptance behavior that appends proposed content; it is not the desktop's full structured diff/checkpoint workflow.

Do not represent browser-local file persistence as a cloud project repository. Do not copy desktop execution, terminal, Git, research pairing, or multi-file review features into the web system's use-case list unless separately implemented there.

**Evidence:** [web workspace](../src/app/workspace/page.tsx), [browser workspace state](../src/lib/store.ts), [web Observer](../src/components/ObserverPanel.tsx), [rich-text editor](../src/components/DocEditor.tsx).

## 5. Changes to the old scope

| Earlier concept | Accurate current description |
| --- | --- |
| Web-based AI code/document workspace as the complete product | Desktop IDE is the main product; retained web account/workspace features still exist. |
| Browser files as the project | Desktop opens real local folders, edits files, tracks external changes, and protects unsaved drafts. |
| One generic AI suggestion module | Distinct manual Explain/Fix/Improve and other actions, with separate proactive/automatic experiments. |
| Fix Error | User-facing Fix Code, accepting requests with or without explicit diagnostics. |
| Simple explanation | Scoped read-only explanations with optional guidance and bounded session follow-ups. |
| Generic improvement | Goal-oriented Improve Code, clarification/no-change outcomes, trade-offs, and review. |
| Accept a snippet | Desktop structured diff, explicit Apply, stale rejection, checkpoints/Undo; multi-file changes have separate approvals. |
| Proactive assistance as a single idea | Assist nudges, automatic failed-run explanations, and Live Observer are three distinct capabilities. |
| Documents as only editable text | Markdown views/actions plus evidence-based documentation impact and approved updates. |
| Context as everything open in the project | Action-specific approved context with exclusions, size limits, provenance, and incomplete tray/project-note integration. |
| Browser research as automatic project knowledge | Explicit selected-text capture and review; not automatic shared knowledge across Observer modes. |
| GitHub operations as an IDE feature | Built-in Git is read-only inspection; terminal/development-assistant Git operations are separate. |

Several roadmap checkboxes are historical and can lag later source changes. For example, Save All exists in the current command registry despite an earlier aggregate roadmap item grouping it with unfinished Save As. Use this inventory's cited source and current acceptance evidence when revising formal claims.

## 6. Pending, unsupported, or unverified claims to keep separate

### Planned/partial work

- Persistent workspace-specific project goals, current tasks, and confirmed requirements.
- Consistent approved project-knowledge inclusion across manual Observer actions.
- Separately consented project knowledge for Live Observer.
- Research workspace-binding hardening and promotion into saved project knowledge.
- Broader reliable function detection beyond the current conservative supported syntax.

### Not established as current product features

- Autonomous project-wide coding, automatic dependency installation, or automatic deployment.
- A complete debugger or built-in execution for every highlighted language.
- Built-in Git write operations, GitHub PR management, or automatic branch publishing.
- Collaborative editing, team permissions, instructor dashboards, or an administrator portal.
- Word/PDF document editing or automatic SRS/SDD/UML generation inside the application.
- Unlimited full-file uploads or automatic background chunking to evade limits.
- Persistent Explain transcripts or universal cross-project AI memory.
- Guaranteed reasoning accuracy, behavior preservation, performance gains, or complete test coverage.

These exclusions distinguish implemented scope from possible future requirements; they are not a prohibition on future approved development.

### Acceptance still needed

- Real-provider quality on representative safe code/document tasks, using separately approved calls.
- Signed-in production behavior and complete native consent/settings-save workflows.
- Cross-platform packaged desktop acceptance and accessibility testing beyond existing fixtures.
- Provider/model availability and tokenizer calibration beyond the application's current conservative checks.
- The unresolved browser research workspace-binding scenarios.

## 7. Guidance for revising the scope, SRS, SDD, and diagrams

### Suggested scope statement

> Proactive AI IDE is a desktop development environment that supports local project management, code and Markdown editing, project search, controlled execution and diagnostics, and user-controlled AI assistance. Observer provides manual explanations, code correction and improvement, other bounded code/document suggestions, and reviewed multi-file changes. Separately controlled proactive features offer objective-error nudges, automatic failed-run explanations, and experimental edit-triggered suggestions. The product includes explicit context review, privacy controls, checkpoints/Undo, documentation-impact assistance, read-only Git inspection, optional browser research capture, and local evaluation features. Persistent shared project knowledge and broader autonomous development are outside the completed baseline.

### Actors and boundaries to reflect

| Participant | What it contributes or controls |
| --- | --- |
| Developer/student user | Opens projects, edits, selects context, requests assistance, reviews/approves changes, executes checks, configures privacy. |
| Optional evaluation participant | Consents to local evaluation and provides optional usefulness feedback; not a distinct account role. |
| AI provider | Supplies responses for permitted requests; its availability and correctness are external dependencies. |
| Account service | Provides account/session and account-associated preferences/provider-access functions. |
| Local project/files | User-owned code and documentation, including explicitly saved changes and external modifications. |
| Local runtimes/tools | Execute user-approved file runs, shell commands, and supported verification tasks. |
| Chrome extension and selected website | Supply explicitly captured research text for desktop review. |
| Git repository | Supplies branch/change/diff information for the built-in read-only features. |

The table is a functional boundary inventory, not a technical interaction or deployment diagram. The actual revised diagrams should be a separate deliverable.

### Requirements organization

Use M01–M19 as module references, then assign individual functional requirement IDs under each module. Preserve these distinctions in acceptance criteria:

- User-requested versus automatic assistance.
- Merely attached versus explicitly approved/transmitted context.
- Proposed versus applied versus saved versus verified changes.
- Selection/function/file scope versus unrelated project knowledge.
- Session information versus retained local/account-associated information.
- Current-version evidence versus stale source/run evidence.
- Implemented behavior versus experimental acceptance versus planned work.

Do not reuse an old general "AI automatically monitors and fixes everything" requirement. It would contradict the current bounded, opt-in and explicit-approval controls.

## 8. Evidence and confidence in this inventory

This inventory was checked against the current desktop controls, shared feature contracts, command registry, action handlers, web workspace, extension sources, and project documents on 2 October 2026. Source links above are traceability references, not implementation instructions.

The preceding Phase A delivery recorded 288 passing desktop tests, root regression tests, mocked Electron workflows, desktop type checks, focused/root lint, and desktop/web builds. That historical result applies to the tested baseline; it is not a new comprehensive acceptance test performed for this documentation task. Existing broader lint/standalone type-check limitations and native/live-provider gaps remain in the audit.

For this task, only the functional inventory and a roadmap reference were added. No application behavior, privacy setting, database, dependency, or provider configuration was changed. No private environment file was read and no paid AI call was made. Markdown/source-link checks validate this document's references; they do not establish product correctness or AI accuracy.

### Supporting documents

- [Desktop development plan](./DESKTOP_IDE_PLAN.md) — detailed implementation history and verification notes.
- [Context pipeline audit](./CONTEXT_PIPELINE_AUDIT.md) — context inclusion, exclusions, limits, and Phase A evidence.
- [Project Context plan](./PROJECT_CONTEXT_PLAN.md) — completed tabs and pending saved-knowledge phases.
- [Manual Explain](./MANUAL_EXPLAIN.md), [Fix Code](./FIX_CODE.md), [Improve Code](./IMPROVE_CODE.md) — specialized action scope and evaluation cases.
- [Automatic failed-run explanations](./AUTOMATIC_RUN_EXPLANATIONS.md) — experimental automatic-error help.
- [Browser integration](./DESKTOP_BROWSER_INTEGRATION.md) — research capture/review boundaries.
- [Product direction](./PRODUCT_DIRECTION.md) — earlier desktop direction; not by itself proof of current feature status.
- [Observer engine specification](./OBSERVER_ENGINE_SPEC.md) — design/specification reference; future or aspirational claims must be reconciled with implemented controls before inclusion in revised formal documents.
