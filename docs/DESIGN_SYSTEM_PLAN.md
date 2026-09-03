# Proactive AI Desktop Design System Plan

Status: Phase 13A complete planning artifact. No desktop UI or application behavior is
changed by this document.

## Audit basis and non-negotiable source rule

The desktop visual identity must come from the original browser application on the
`main` branch. The audit was performed from `desktop-ide-foundation` without checking
out or modifying `main`, using `git ls-tree` and `git show main:<path>`. Screenshots were
used only to confirm the source implementation visually; no color was sampled from an
image and no value below is an approximation.

Canonical website sources inspected:

- `main:src/app/globals.css` — core palette, Geist/serif use, landing grid, and document
  typography.
- `main:tailwind.config.ts` and `main:package-lock.json` — palette bindings, Tailwind
  3.4.19 spacing/radius/shadow primitives, and responsive breakpoints.
- `main:src/app/layout.tsx` — bundled Geist Sans and Geist Mono variable-font setup.
- `main:src/app/page.tsx` — landing shell, buttons, hover states, preview window,
  traffic-light colors, grid, and custom shadow.
- `main:src/app/login/page.tsx` and `main:src/app/signup/page.tsx` — authentication
  layout, form/error/disabled states, buttons, and link treatment.
- `main:src/app/workspace/page.tsx` — browser workspace shell, header, editor surface,
  save state, active-file chip, and user controls.
- `main:src/components/AuthField.tsx`, `AuthShowcase.tsx`, and `Logo.tsx` — input focus,
  dark coffee showcase, orbit motif, and exact brand mark.
- `main:src/components/FileTree.tsx`, `ObserverPanel.tsx`, `CodeEditor.tsx`, and
  `DocEditor.tsx` — selected/hover rows, panel cards, controls, status pills, code blocks,
  Monaco typography, and Markdown toolbar/editor styling.

If Phase 13 implementation finds a desired state with no source-backed color here, it
must reuse the closest semantic token already defined below or return to design review.
It must not introduce a new hardcoded color.

## Exact source palette

### Core tokens

These values are copied verbatim from `main:src/app/globals.css:7-16` and are also bound
as Tailwind colors in `main:tailwind.config.ts:11-22`.

| Website token | Exact value | Website use |
|---|---:|---|
| `--cream` | `#faf7f0` | Page background, neutral hover, dashed empty cards |
| `--cream-deep` | `#f3ecdf` | Selected rows, inactive controls, inline code |
| `--card` | `#fdfbf6` | Headers, side panels, cards, bordered controls |
| `--ink` | `#2b2118` | Primary text and dark code-block surface |
| `--ink-soft` | `#5c4d3d` | Secondary text, labels, neutral controls |
| `--bronze` | `#8a5a34` | Links, active tools, focus border, primary hover |
| `--bronze-deep` | `#6f4e2e` | Primary actions, avatars, logo background |
| `--ember` | `#b4552d` | Error text/borders, code emphasis, status dot |
| `--sand` | `#e8dfd0` | One-pixel borders, dividers, grid lines, icon hover |
| `--tan` | `#b9a68f` | Placeholder, tertiary metadata, dashed borders |

### Source-specific exact colors

These colors are intentional website values but are not part of the ten-token core.
They must be centralized before reuse; they must never be copied as component literals.

| Planned token | Exact value | Original source and restriction |
|---|---:|---|
| `--brand-input` | `#fffdf5` | `main:src/components/AuthField.tsx:40`; form input surface |
| `--canvas-white` | `#ffffff` | `bg-white` in workspace, file inputs, model controls, and document canvas |
| `--window-close` | `#e5654f` | `main:src/app/page.tsx:11`; decorative window control/status indicator only |
| `--window-warn` | `#e8b84f` | `main:src/app/page.tsx:12`; decorative window control/status indicator only |
| `--window-success` | `#7bb662` | `main:src/app/page.tsx:13`; decorative window control/status indicator only |
| `--google-blue` | `#4285F4` | `main:src/app/login/page.tsx:105`; Google mark only |
| `--coffee-highlight` | `#4a3626` | `main:src/components/AuthShowcase.tsx:19`; radial-gradient start |
| `--coffee-mid` | `#2c2015` | `main:src/components/AuthShowcase.tsx:19`; radial-gradient midpoint |
| `--coffee-deep` | `#1e150d` | `main:src/components/AuthShowcase.tsx:19`; radial-gradient end |
| `--coffee-star` | `#d8c3a5` | `main:src/components/AuthShowcase.tsx:23`; decorative dots at 70% opacity |
| `--coffee-orbit` | `#5c4630` | `main:src/components/AuthShowcase.tsx:36`; orbit border at 60% opacity |
| `--coffee-emblem` | `#f5efe3` | `main:src/components/AuthShowcase.tsx:37`; light orbit disc |
| `--coffee-eyebrow` | `#c9a876` | `main:src/components/AuthShowcase.tsx:44`; dark-panel eyebrow |
| `--coffee-text` | `#f0e8da` | `main:src/components/AuthShowcase.tsx:47`; dark-panel primary text |
| `--coffee-accent` | `#e0b877` | `main:src/components/AuthShowcase.tsx:49`; dark-panel italic accent |

The auth gradient is exactly
`radial-gradient(ellipse at 70% 35%, #4a3626 0%, #2c2015 55%, #1e150d 100%)`.
Source opacity variants are also exact: card at 80% in the landing header; bronze at 15%
for code-file icons and 40% for suggestion borders; ember at 10% for document icons, 30%
for error borders, and 5% for error fills; sand at 50% for compact hover; coffee-star at
70%; and coffee-orbit at 60%. Phase 13B must express these through centralized derived
tokens such as `rgb(138 90 52 / 15%)`, never repeated component literals.

## Centralized semantic desktop tokens

Phase 13B must define these in one theme layer (for example, a dedicated theme CSS file
imported once). Components and Monaco adapters consume semantic variables only. Existing
scattered desktop hex/RGB literals are migration inputs, not approved design values.

| Semantic token | Exact source token/value | Intended desktop role |
|---|---|---|
| `--desktop-background` | `var(--cream)` / `#faf7f0` | Application and inactive workspace background |
| `--desktop-surface` | `var(--card)` / `#fdfbf6` | Title bar, sidebars, panels, menus, cards |
| `--desktop-surface-subtle` | `var(--cream-deep)` / `#f3ecdf` | Selected row/tab, subdued controls, inline code |
| `--desktop-canvas` | `var(--canvas-white)` / `#ffffff` | Monaco/document primary editing canvas |
| `--desktop-input` | `var(--brand-input)` / `#fffdf5` | Text fields and textareas |
| `--desktop-border` | `var(--sand)` / `#e8dfd0` | Standard one-pixel divider/border |
| `--desktop-border-strong` | `var(--tan)` / `#b9a68f` | Dashed/empty-state border, never body text alone |
| `--desktop-text` | `var(--ink)` / `#2b2118` | Primary text |
| `--desktop-text-muted` | `var(--ink-soft)` / `#5c4d3d` | Secondary text and labels |
| `--desktop-text-subtle` | `var(--tan)` / `#b9a68f` | Decorative/large tertiary text only |
| `--desktop-accent` | `var(--bronze-deep)` / `#6f4e2e` | Primary action, logo, strong selection marker |
| `--desktop-accent-hover` | `var(--bronze)` / `#8a5a34` | Primary-action hover and active tool |
| `--desktop-accent-text` | `var(--cream)` / `#faf7f0` | Text/icons on bronze actions |
| `--desktop-focus` | `var(--bronze)` / `#8a5a34` | Keyboard focus outline/border |
| `--desktop-hover` | `var(--cream)` / `#faf7f0` | Neutral row hover on card surfaces |
| `--desktop-hover-strong` | `var(--sand)` / `#e8dfd0` | Compact icon/menu hover |
| `--desktop-selected` | `var(--cream-deep)` / `#f3ecdf` | Active file, tab, list item, segmented option |
| `--desktop-success` | `var(--window-success)` / `#7bb662` | Dot/icon only; pair with accessible ink text |
| `--desktop-warning` | `var(--window-warn)` / `#e8b84f` | Dot/icon only; pair with accessible ink text |
| `--desktop-error` | `var(--ember)` / `#b4552d` | Error text/icon; website form error color |
| `--desktop-error-border` | `rgb(180 85 45 / 30%)` | Error card border, from `border-ember/30` |
| `--desktop-error-surface` | `rgb(180 85 45 / 5%)` | Error card fill, from `bg-ember/5` |
| `--desktop-overlay` | `rgb(43 33 24 / 25%)` | Coffee/ink-derived overlay or shadow basis |

Dark coffee values are approved for the authentication showcase and intentionally dark
presentation surfaces. A general dark IDE theme must not be extrapolated from these few
states during 13B; it needs a separately approved mapping using only the exact palette.

## Typography

- UI/body: bundled Geist Sans variable font, weights 100–900, with
  `ui-sans-serif, system-ui, sans-serif` fallback. Source:
  `main:src/app/layout.tsx:5-9` and `main:src/app/globals.css:27`.
- Code, paths, shortcuts, timestamps, and compact metadata: bundled Geist Mono variable
  font with `ui-monospace, monospace` fallback. Source:
  `main:src/app/layout.tsx:10-14`, `globals.css:91`, and `CodeEditor.tsx:78`.
- Display/auth headings only: Georgia, then Times New Roman, with `-0.02em` tracking.
  Source: `main:src/app/globals.css:30-33`.
- Desktop working scale should use source-backed sizes: 10px and 11px for compact metadata;
  12px for dense navigation; 14px for normal UI/editor controls; 15px for brand/body
  emphasis; 18px for empty-state titles; 20/24/30px for Markdown headings; 48px for auth
  display headings where window space permits.
- Preserve source line-height intent: compact controls use their native line box, body text
  uses 1.5/`leading-relaxed`, code preview uses 24px, and documentation body uses 1.75.
  Do not shrink interactive text below 10px or rely on color alone for meaning.

## Spacing, radii, borders, and shadows

The website uses Tailwind 3.4.19 (`main:package-lock.json`, `node_modules/tailwindcss`
entry). Central spacing steps needed by the desktop are the exact Tailwind values:

| Step | Value | Typical source use |
|---|---:|---|
| `0.5` | 2px | Tight row separation/status padding |
| `1` | 4px | Toolbar gaps, compact icon padding |
| `1.5` | 6px | Compact control padding/gap |
| `2` | 8px | Standard gap and list/card padding |
| `2.5` | 10px | Inputs, buttons, status pill |
| `3` | 12px | Panel/card padding |
| `3.5` | 14px | Auth input horizontal padding |
| `4` | 16px | Panel/header padding |
| `5` | 20px | Form group rhythm |
| `6` | 24px | Major inset and section gap |
| `8` | 32px | Auth/page outer inset |
| `9` | 36px | Auth form offset |
| `10` | 40px | Large section rhythm |
| `12` | 48px | Auth vertical inset |
| `14` | 56px | Responsive auth/page inset |
| `16` | 64px | Showcase/footer positioning |
| `20` | 80px | Landing-only major vertical spacing |

Radii are exact: 4px (`rounded`), 6px (`rounded-md`), 8px (`rounded-lg`), 12px
(`rounded-xl`), and 9999px (`rounded-full`). Use 4px for dense icons/chips, 6px for IDE
controls, 8px for fields/cards/dialog actions, 12px for large dialogs/previews, and full
for avatars/status pills. Markdown inline code uses 4px and fenced code uses 8px
(`main:src/app/globals.css:89,97`).

- Standard borders/dividers: 1px solid `sand`.
- Empty/help states: 1px dashed `tan`.
- Active suggestion: 1px solid bronze at 40% opacity.
- Error card: 1px solid ember at 30% opacity over ember at 5% opacity.
- Blockquote: 3px left border in `tan`.
- Brand mark: 3px cream inner ring.
- Keyboard focus: retain the website's bronze focus border and add a clearly visible 2px
  bronze `:focus-visible` outline with 2px offset where a border alone is insufficient.
  This adds no new color.

Exact shadows from the site and its locked Tailwind version:

- Preview elevation: `0 24px 60px -20px rgba(43,33,24,0.25)`
  (`main:src/app/page.tsx:6`).
- `shadow-sm`: `0 1px 2px 0 rgb(0 0 0 / 0.05)`.
- `shadow`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`.
- Prefer no shadow on adjacent IDE panes; use sand dividers. Use `shadow-sm` for compact
  raised controls, `shadow` for primary buttons, and the custom preview elevation only for
  dialogs, command palette, or detached overlays.

## Interaction-state rules

- Primary button: bronze-deep background, cream text; hover to bronze; disabled opacity
  50–60% with non-interactive cursor. Never switch to a new blue/purple accent.
- Secondary button: card/transparent surface, sand border, ink-soft text; hover border to
  bronze and text to ink.
- Neutral row: ink-soft on card; hover cream; selected cream-deep with ink and medium weight.
- Compact icon action: ink-soft; hover sand (or sand at 50%) and ink.
- Form control: input/canvas fill, sand border, ink text; focus border/outline bronze;
  placeholder tan. Validation uses ember card tokens.
- Status pill: card or cream fill, sand border, mono 10–11px label, 6px colored dot. Color
  never replaces the label.
- Loading: retain explicit text plus spin/pulse motion. Respect `prefers-reduced-motion` by
  disabling nonessential spin/pulse while keeping status text.
- Links: bronze text, underline on hover where used in auth; navigation may transition from
  ink-soft to ink.

## Component-by-component desktop mapping

| Desktop surface | Website source pattern | Planned application |
|---|---|---|
| Application shell and title bar | `workspace/page.tsx:201-213`, `Logo.tsx` | Card title bar, sand divider, exact bronze-deep/cream logo, ink title, ink-soft account controls, mono tan save state. Preserve Electron drag/no-drag regions. |
| Activity bar and sidebar tabs | `FileTree.tsx:42-59`, navigation in `page.tsx:65-86` | Card surface with sand divisions; active destination uses cream-deep/ink and a bronze marker; inactive ink-soft, hover ink/cream. |
| File Explorer | `FileTree.tsx:6-130` | Reuse heading tracking, bronze New action, cream hover, cream-deep selected row, bronze/ember icon tints, sand icon-action hover, and tan empty copy. Apply to nested folders, operations, recent projects, and conflict states. |
| Search | FileTree controls plus `AuthField.tsx:40` | Input fill/sand border/bronze focus; compact toggles use secondary-button rules; results follow file-row hover/selection; matches use bronze emphasis without low-contrast text. |
| Editor tabs and chrome | Active-file chip in `workspace/page.tsx:202-210`; selected FileTree row | Card tab strip, sand separators, cream-deep active tab, ink-soft inactive tabs, sand hover controls, mono file names. Dirty/conflict badges retain text/icon labels. |
| Monaco editor surroundings | White workspace canvas in `workspace/page.tsx:217-241`; `CodeEditor.tsx` | Canvas white, Geist Mono, cream/sand gutter/chrome, ink-family editor foregrounds, and a separately centralized Monaco theme derived only from this palette. Syntax token mapping is a 13B task; editor behavior/options remain unchanged. |
| Terminal, Output, Diagnostics | Dark code block in `globals.css:94-105`; status/error cards | Ink terminal/code surface with cream mono text; panel chrome remains card/sand. Success/warning dots need adjacent ink text; errors use ember. Tabs use selected-row rules. |
| Observer panel and cards | `ObserverPanel.tsx:126-258` | Card panel/sand border, exact status pill, bronze-deep Ask/Accept actions, dashed tan help cards, cream suggestion cards with 40% bronze border, ink code block, ember errors, and explicit loading text. |
| Context Tray and Context Preview | Observer web-context and suggestion cards | Cream/card items with sand borders; selected/attached state uses cream-deep; stale/error uses ember plus label; removable actions use compact icon rules. Web source title/URL remain visible and untrusted. |
| Git/source control and diff | FileTree rows, status pills, white editor canvas | Groups and files use sidebar patterns; staged/changed states use labeled pills/icons. Monaco diff canvas adopts centralized editor tokens; additions/deletions must not rely on green/red alone. |
| Markdown editor and preview | `DocEditor.tsx` and `globals.css:43-109` | Card/sand toolbar; active tool bronze/cream; white document canvas; max 46rem content; 40px 24px 96px document padding; 1.75 body line height; exact heading/list/blockquote/code rules. |
| Settings | Auth fields/buttons plus Observer model control | Card page/dialog, grouped sections divided by sand, input token/focus treatment, bronze primary actions, secondary destructive confirmation with explicit ember copy. Preserve every privacy setting and behavior. |
| Authentication | `login/page.tsx`, `signup/page.tsx`, `AuthShowcase.tsx` | Reproduce the split cream form and exact dark radial showcase when width allows; Georgia heading, Geist form, source input/error/button states, exact orbit motif. At compact widths hide showcase as the website does. |
| Dialogs and confirmations | Landing preview/card and auth form cards | Card or cream surface, 12px outer radius, sand border, source preview elevation, 16–24px insets, primary/secondary button hierarchy, Escape behavior unchanged. Includes unsaved/file-operation dialogs. |
| Menus and command palette | Card controls and selected FileTree rows | Card surface, sand border, 8px radius, preview elevation; cream hover and cream-deep keyboard selection; bronze focus outline and mono shortcuts. |
| Empty and loading states | FileTree empty, workspace empty, editor loader, Observer idle/thinking | Tan only for large/supporting copy; primary state title in ink/ink-soft. Dashed tan help container where appropriate. Spinner/pulse always paired with text. |
| Errors, warnings, notifications | Auth/Observer error cards and status pills | Ember text with exact ember tint/border for errors. Amber/green remain icon/dot only with ink text labels. Toasts and external-change banners use the same card geometry and explicit severity text. |
| Welcome/recent projects | Landing call-to-action and FileTree rows | Cream background with optional sand grid motif, Georgia display title used sparingly, bronze-deep primary open action, card recent-project list with selected/hover rules. |
| AI diff workflows | Landing preview, Observer suggestion card, Monaco canvas | Context Preview, single/multi-file reviews, documentation-update dialogs, applied summaries, warnings, and rollback actions share the dialog/card/button tokens; no workflow or safety control may be removed. |

Desktop files covered by this mapping include `App.tsx`, `DesktopAuth.tsx`, `Explorer.tsx`,
`SearchPanel.tsx`, `SourceControlPanel.tsx`, `GitDiffViewer.tsx`, `BottomPanel.tsx`,
`ObserverPanel.tsx`, `ContextTray.tsx`, `ContextPreview.tsx`, `MarkdownPreview.tsx`,
`SettingsPanel.tsx`, `CommandPalette.tsx`, `WelcomeScreen.tsx`,
`IncomingWebContextReview.tsx`, `ObserverEditReview.tsx`,
`MultiFileChangeWorkspace.tsx`, `DocumentationImpactPanel.tsx`, and
`DocumentationUpdateWorkspace.tsx`.

## Accessibility and contrast requirements

WCAG contrast measurements for the exact source colors:

| Pair | Ratio | Rule |
|---|---:|---|
| ink on cream | 14.72:1 | Passes normal and large text |
| ink on card | 15.23:1 | Passes normal and large text |
| ink-soft on cream | 7.60:1 | Passes normal and large text |
| ink-soft on card | 7.86:1 | Passes normal and large text |
| cream on bronze-deep | 7.00:1 | Passes normal and large text |
| cream on bronze | 5.46:1 | Passes normal and large text |
| ember on cream | 4.59:1 | Passes normal text; keep normal weight/size readable |
| tan on cream | 2.20:1 | Fails text; decoration, placeholders, or large supplemental text only |
| green on cream | 2.25:1 | Fails text; indicator only with accessible label |
| amber on cream | 1.72:1 | Fails text; indicator only with accessible label |
| coffee-text across auth gradient | 9.35:1 minimum | Passes normal and large text |
| coffee-accent across auth gradient | 6.11:1 minimum | Passes normal and large text |
| coffee-eyebrow across auth gradient | 5.06:1 minimum | Passes normal and large text |

- Meet WCAG AA: at least 4.5:1 for normal text, 3:1 for large text and meaningful UI
  graphics/boundaries. Do not use tan, green, or amber as standalone small text on cream.
- Every interactive control needs a visible keyboard focus state, logical tab order, and
  accessible name. Hover-only actions must also appear on focus-within.
- Selected, dirty, stale, conflict, warning, error, success, Git state, and diff meaning
  require text, shape, or icon in addition to color.
- Preserve zoom, system text scaling, screen-reader landmarks, reduced motion, and minimum
  practical 32px desktop pointer targets (44px where the layout is not density constrained).
- Monaco selection, caret, diagnostics, diff additions/deletions, bracket matching, and
  find matches require contrast verification after its palette adapter is built.

## Responsive panes and window resizing

Use the website's locked Tailwind breakpoints exactly: `sm` 640px, `md` 768px,
`lg` 1024px, `xl` 1280px, and `2xl` 1536px. Desktop behavior must remain fluid between
breakpoints and continue to honor the current Electron minimum-window constraints.

- At 1024px and wider, retain the three-column IDE: navigation/sidebar, primary editor,
  Observer; bottom tools remain vertically resizable. Preserve current safe minimums of
  roughly 180px sidebar, 320px editor, and 230px Observer unless usability testing raises
  them.
- From 768px through 1023px, keep the editor primary. Collapse either sidebar or Observer
  into an explicitly toggled pane; never compress both over editor content. Bottom tools
  may use a bounded drawer with a visible resize handle.
- From 640px through 767px, show one principal work surface at a time with activity controls
  switching Explorer/Search/Source/Docs/Observer/Output. Preserve editor state and avoid
  unmounting terminal/AI workflows solely for layout.
- Below 640px, dialogs and Context Preview use the full available window inset by 8px;
  actions wrap or become a vertical stack. Authentication uses the cream form only, matching
  the website's `lg:block` showcase rule.
- All panes require `min-width: 0`, `min-height: 0`, internal scrolling, ellipsis for paths,
  and no body-level overflow. Resizing must not hide Accept/Reject/Cancel/Undo or privacy
  controls, move Electron drag regions over controls, reset tabs, or trigger AI/actions.

## Staged implementation checklist

### Phase 13B — Foundation and shell

- [ ] Add one centralized theme-variable layer containing every approved primitive and
  semantic token; remove direct color ownership from component rules as they migrate.
- [ ] Bundle/use Geist Sans and Geist Mono for Electron without a network dependency.
- [ ] Restyle desktop authentication, root background, brand mark, title/status bars,
  main grid, panel boundaries, activity/sidebar navigation, shared buttons, inputs, pills,
  menus, focus states, and scrollbars.
- [ ] Define a centralized Monaco light theme using only approved tokens; validate syntax,
  selection, caret, diagnostics, find, and diff contrast.
- [ ] Preserve all existing behavior and run screenshot baselines at wide/medium/compact sizes.

### Phase 13C — Feature-surface migration

- [ ] Migrate Explorer, Search, editor tabs/chrome, Markdown outline/editor/preview, terminal,
  Output, diagnostics, Observer, Context Tray/Preview, Git/diff, Documentation Impact,
  Settings/Insights, welcome/recents, and web-context review.
- [ ] Migrate all single/multi-file/documentation diff and applied-state workflows, dialogs,
  banners, notifications, errors, empty/loading states, command palette, and menus.
- [ ] Replace remaining component color literals with semantic variables and add a source
  scan that fails on unauthorized new color literals.

### Phase 13D — Responsive, accessibility, and visual QA

- [ ] Implement and test pane collapse/resizing behavior at the exact breakpoints above.
- [ ] Complete keyboard/focus/hover parity, contrast audits, reduced-motion support,
  screen-reader labels, zoom/text-scaling, and color-independent status/diff cues.
- [ ] Compare Electron screenshots with the original website at matching scale, correct
  token/mapping defects only, and obtain explicit visual approval.
- [ ] Run all desktop/web/extension regressions and security/privacy checks before marking
  the redesign complete.

## Visual QA checklist

- [ ] Every rendered color resolves to an approved centralized token; no approximated or
  scattered hardcoded component colors remain.
- [ ] Logo geometry/color, cream/card backgrounds, sand dividers, ink text, bronze actions,
  neutral hover, selected rows, and focus states match the browser source.
- [ ] Geist Sans/Mono load locally; Georgia appears only for display/auth headings.
- [ ] Spacing follows the audited scale; dense IDE controls remain usable and aligned.
- [ ] Radii and shadows follow the component hierarchy; adjacent panes do not appear as
  floating cards.
- [ ] Explorer, Search, tabs, Monaco surround, terminal/output/diagnostics, Observer,
  Context Tray, Git/diff, Markdown, Settings, auth, dialogs, menus, workflow reviews,
  empty/loading/error/notification states all have screenshots in representative states.
- [ ] Primary, secondary, disabled, hover, active, selected, focus-visible, loading, success,
  warning, error, stale, conflict, and destructive states are checked.
- [ ] Monaco syntax, selection, line numbers, diagnostics, find, and side-by-side/inline diff
  remain legible; Markdown code and links are visually distinct.
- [ ] 1536px, 1280px, 1024px, 768px, 640px, and the minimum supported Electron window are
  checked while resizing continuously between them.
- [ ] No clipped paths, overlapping panes, unreachable actions, body scrolling, layout-driven
  state loss, or accidental action/AI invocation occurs during resize.
- [ ] Keyboard-only, screen-reader landmark/name, 200% zoom, text scaling, reduced motion,
  and WCAG AA contrast checks pass.
- [ ] Existing desktop tests/build, root tests/lint/build, extension tests/build, privacy
  scans, and `git diff --check` pass after implementation.

## Phase 13A completion boundary

This phase defines provenance, tokens, mappings, constraints, and QA only. It does not
change CSS, React, Monaco configuration, Electron layout, application behavior, the
original website, or `main`. Phase 13B may begin only after explicit approval.
