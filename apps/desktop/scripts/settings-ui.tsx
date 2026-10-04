import React from "react";
import { createRoot } from "react-dom/client";
import "../src/renderer/src/theme.css";
import "../src/renderer/src/styles.css";
import SettingsPanel from "../src/renderer/src/SettingsPanel";
import { DEFAULT_LOCAL_SETTINGS, DEFAULT_SYNCED_SETTINGS } from "../src/shared/settings";

const noError = async () => null;

Object.assign(window, {
  observerInsights: {
    report: async () => ({ ok: false as const, error: "No fixture insights." }),
    session: async () => ({ ok: false as const, error: "Unavailable in fixture." }),
    clear: async () => ({ ok: true as const, value: undefined }),
    export: async () => ({ ok: false as const, error: "Unavailable in fixture." }),
  },
});

createRoot(document.getElementById("root")!).render(
  <SettingsPanel
    open
    local={DEFAULT_LOCAL_SETTINGS}
    synced={DEFAULT_SYNCED_SETTINGS}
    providers={[]}
    webContextStatus={{ available: true, enabled: false, paired: false, connected: false, pairingCode: null, pairingExpiresAt: null, pairedDevice: null, port: 32145, message: "Ready to pair" }}
    onClose={() => undefined}
    onSaveLocal={noError}
    onSaveSynced={noError}
    onSaveKey={noError}
    onDeleteKey={noError}
    onResetLocal={noError}
    onClearRecents={noError}
    onClearHistory={noError}
    onClearCheckpoints={noError}
    onSetBrowserIntegration={noError}
    onStartBrowserPairing={noError}
    onCancelBrowserPairing={noError}
    onRevokeBrowserPairing={noError}
    onSignOut={() => undefined}
  />
);
