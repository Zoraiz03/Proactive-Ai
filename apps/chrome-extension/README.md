# Proactive AI IDE selected-text preview

Phase 11B1 is an isolated Chrome Manifest V3 extension for explicitly capturing
selected text from the active HTTP/HTTPS page and reviewing it locally. It does
not connect to the desktop IDE, a web server, Supabase, or an AI provider.

## Develop and verify

```bash
npm install
npm test
npm run typecheck
npm run build
```

Load `apps/chrome-extension/dist` through Chrome's **Extensions → Developer mode
→ Load unpacked** flow. Select ordinary page text and either open the toolbar
popup and choose **Refresh Selection**, or use the selection context menu named
**Send selected text to Proactive AI IDE**. Despite that forward-looking menu
label, Phase 11B1 only opens a local preview; the disabled Send button states
that the desktop connection comes next.

The preview can be edited or trimmed without changing its capture identity or
source metadata. **Clear** removes the one pending capture. **Cancel** clears it
and closes the popup. Pending data expires after 30 minutes.

## Privacy and permissions

- `activeTab` and `scripting` read only the selection after a user action.
- `storage` holds only the latest short-lived pending capture on this device.
- `contextMenus` exposes the explicit selection action.
- There are no host permissions and no network, native-messaging, cloud, auth,
  desktop, or AI transport APIs.
- Form controls, editable regions, password fields, internal browser pages,
  empty selections, malformed URLs, and non-HTTP(S) pages are rejected.
- Selected text is plain text, control characters are removed, and content is
  capped at 10,000 characters.

## Phase 11B2 boundary

The versioned `ChromeSelectedTextContext` contract reserves provenance
`chrome_selected_text` for a future explicit desktop handoff. Phase 11B2 must
pair with the desktop app through a narrow authenticated channel, revalidate
the contract, apply desktop secret/exclusion rules, show the item as removable
`web_research` context, and require confirmation before any AI request. It must
not introduce automatic page capture or background AI requests.

Known limitation: programmatically opening an action popup after a context-menu
capture depends on Chrome support. If it does not open, clicking the extension
toolbar icon shows the locally stored preview.
