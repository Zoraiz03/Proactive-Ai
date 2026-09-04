# ADR: Chrome-to-desktop context transport

- Status: Accepted
- Date: 2026-09-02
- Scope: Phase 11B2 only

## Decision

Chrome sends explicitly reviewed selected text to an authenticated HTTP service bound
only to `127.0.0.1:32145`. The port is fixed and documented so the extension needs one
stable, narrow local destination. The service is disabled by default until the user
enables Browser Extension integration in desktop Settings.

Pairing starts only from desktop Settings. An eight-digit code expires after two
minutes. A successful exchange creates an independent 256-bit random bearer token,
bound to the exact extension origin. The token is encrypted at rest by Electron
`safeStorage` in an owner-only desktop file and stored only in
`chrome.storage.local` in Chrome; it is never synced, logged, derived from the code,
or shown in UI. Revocation, Disconnect/Forget, integration disable, and invalid secure
storage remove or invalidate the credential.

Every non-pairing request requires POST JSON, the bearer token, the exact paired
`chrome-extension://` origin, protocol version 1, strict schema/size validation, and
rate limits. CORS returns only the accepted extension origin and never `*`. An
authenticated status request plus the `X-Proactive-Bridge: 1` response marker prevents
Chrome from treating an unrelated listener as the IDE.

Accepted transfers enter a bounded in-memory desktop review queue. They do not enter
the Context Tray until the user chooses **Add to Context Tray**. URL query and fragment
data are removed, secret-shaped text is redacted on receipt and again during tray-item
creation, duplicate capture/content submissions are rejected, and rejected content is
discarded. No context or credential is sent to Supabase or any AI provider.

## Alternatives

- Native Messaging offers stronger browser-to-application identity and avoids a TCP
  listener, but adds platform host manifests, installer registration, and packaging
  work. It remains a future alternative, not an implementation in this phase.
- WebSocket does not improve the trust boundary and would add a persistent channel.
- Cloud relay was rejected because it would upload selected context and add account,
  retention, and availability dependencies.

## Consequences

The integration works only while the signed-in desktop IDE has an open workspace and
the loopback receiver is enabled. Port conflicts are reported as unavailable. Pending
reviews are session-only. Logs may contain transfer IDs, timestamps, sizes, protocol
versions, and error categories, but never selected text, full sensitive URLs, pairing
codes, or bearer tokens.
