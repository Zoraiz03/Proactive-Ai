# Proactive AI IDE selected-text tools

This Manifest V3 extension shows a small Proactive AI control beside text selected
on websites the user explicitly enables. Clicking the control opens an isolated
plain-text preview; **Send to IDE** places the confirmed selection in a bounded desktop
review queue without making an AI request.

## Develop and verify

```bash
npm install
npm test
npm run typecheck
npm run build
```

Load `apps/chrome-extension/dist` through Chrome's **Extensions → Developer mode
→ Load unpacked** flow. After rebuilding, use **Reload** on `chrome://extensions`.

## Use the extension

1. Open Proactive AI IDE, sign in, open a workspace, then open Settings →
   **Browser Extension** and enable the local integration.
2. Choose **Start Pairing** and copy the two-minute eight-digit code.
3. Open the extension, enter the code under **Desktop connection**, and choose
   **Connect**. Chrome verifies the authenticated local service before showing Connected.
4. Visit a normal HTTP or HTTPS page, open the extension, and choose **Turn on
   for this website**. Chrome grants only that origin.
5. Highlight ordinary page text. Click the inline **P** icon, review or trim the
   plain text, then choose **Send to IDE**.
6. Review the incoming selection in the IDE, then choose **Add to Context Tray** or
   **Reject**. Added `web_research` remains removable and is included only after the
   normal Context Preview confirmation for an Observer request.

The icon and preview close on Cancel, Escape, outside click, scroll, selection
clear, or when the website is turned off.

## Privacy and trust boundaries

- Website access is optional and granted per origin; there is no permanent
  install-time host access and no static all-page content script.
- Selection detection checks only whether a range exists. Text is read only when
  the inline P icon is clicked, and sent only after **Send to IDE**.
- Inputs, textareas, selects, content-editable regions, credential-bearing URLs,
  internal browser pages, and malformed/non-HTTP(S) URLs are rejected.
- Page UI uses a closed Shadow DOM and text-only DOM APIs. Selected text is
  normalized, stripped of unsafe controls, and capped at 10,000 characters.
- Desktop transport is restricted to `127.0.0.1:32145`. It requires
  a two-minute pairing code, a random persistent token bound to the exact extension
  origin, current desktop authentication, an open workspace, and authenticated health.
- The token is kept only in `chrome.storage.local` (never sync). Disconnect / Forget
  revokes it on the desktop when reachable and always deletes the Chrome copy.
- The desktop independently checks exact schema keys, URL safety, hashes, capture
  age, replay/idempotency, rate, queue size, protocol, and authorization. It strips URL
  queries/fragments and redacts secret-shaped content before review and again on Add.
- There is no cloud context sync, Supabase storage, browsing-history collection,
  automatic AI request, native messaging, or background page capture.
