# Desktop browser integration

The Browser Extension section in desktop Settings owns the local integration.

1. Enable local browser integration.
2. Choose **Start Pairing** and enter the displayed eight-digit code in Chrome before
   its two-minute expiration.
3. After Chrome reports **Connected**, enable the extension for an individual website.
4. Select text, open the inline P preview, and choose **Send to IDE**.
5. In the desktop incoming-selection card choose **Add to Context Tray**, **Reject**,
   or **View Full**. Adding context never calls AI; the normal Context Preview remains
   required before an Observer request.

Use **Revoke** in desktop Settings or **Disconnect / Forget** in Chrome to invalidate
the pairing. Disabling browser integration stops the listener and revokes the pairing.
After an app restart, an encrypted valid pairing is restored and Chrome confirms it
with an authenticated status check. If the IDE is closed, Chrome preserves the current
review and offers an explicit Retry.

The receiver is fixed at `127.0.0.1:32145`. Production builds should set
`DESKTOP_CHROME_EXTENSION_ORIGIN=chrome-extension://<32-character-extension-id>` to
pin the expected extension identity before first pairing. Development builds bind the
first valid extension origin and persist that binding.

No selected text, browsing history, URL query/fragment, or pairing secret is synced to
the cloud. The review queue is bounded to five items and exists only in desktop memory.
See [the transport ADR](./adr/ADR-CHROME-DESKTOP-CONTEXT-TRANSPORT.md) for the trust
boundary and alternatives.
