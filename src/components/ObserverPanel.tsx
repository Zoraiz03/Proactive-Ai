"use client";

import { useEffect, useState } from "react";
import {
  Provider,
  PROVIDER_LABELS,
  Suggestion,
  saveApiKey,
} from "@/lib/suggest";

export type ObserverStatus =
  | "signedout"
  | "idle"
  | "thinking"
  | "ready"
  | "error";

interface Props {
  status: ObserverStatus;
  suggestion: Suggestion | null;
  error: string | null;
  needsKey: boolean;
  hasMeaningfulContent: boolean;
  askDisabled: boolean;
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  onAsk: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onKeySaved: () => void;
}

const STATUS_PILL: Record<ObserverStatus, { label: string; pulse: boolean }> = {
  signedout: { label: "Signed out", pulse: false },
  idle: { label: "Ready", pulse: false },
  thinking: { label: "Thinking…", pulse: true },
  ready: { label: "Suggestion", pulse: false },
  error: { label: "Paused", pulse: false },
};

function KeyForm({
  provider,
  onSaved,
}: {
  provider: Provider;
  onSaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true);
    const err = await saveApiKey(provider, key.trim());
    setBusy(false);
    if (err) {
      setSaveError(err);
      return;
    }
    setKey("");
    onSaved();
  };

  return (
    <div className="space-y-2">
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={`Paste your ${provider} API key`}
        className="w-full rounded-md border border-sand bg-white px-2.5 py-1.5 text-xs outline-none focus:border-bronze"
      />
      {saveError && <p className="text-[11px] text-ember">{saveError}</p>}
      <button
        onClick={save}
        disabled={busy || !key.trim()}
        className="w-full rounded-md bg-bronze-deep py-1.5 text-xs font-medium text-cream hover:bg-bronze disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save key & retry"}
      </button>
      <p className="text-[10px] leading-relaxed text-tan">
        Stored encrypted on the server, never shown again.
      </p>
    </div>
  );
}

export default function ObserverPanel({
  status,
  suggestion,
  error,
  needsKey,
  hasMeaningfulContent,
  askDisabled,
  provider,
  onProviderChange,
  onAsk,
  onAccept,
  onDismiss,
  onKeySaved,
}: Props) {
  const pill = STATUS_PILL[status];

  useEffect(() => {
    if (status !== "ready" || !suggestion) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [onDismiss, status, suggestion]);

  useEffect(() => {
    const askWithShortcut = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      if (!askDisabled) onAsk();
    };
    window.addEventListener("keydown", askWithShortcut, true);
    return () => window.removeEventListener("keydown", askWithShortcut, true);
  }, [askDisabled, onAsk]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-sand bg-card">
      <div className="flex items-center justify-between border-b border-sand px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">◉</span>
          <h2 className="text-sm font-semibold">Proactive observer</h2>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-sand bg-cream px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
          <span
            className={`h-1.5 w-1.5 rounded-full bg-ember ${
              pill.pulse ? "animate-pulse" : ""
            }`}
          />
          {pill.label}
        </span>
      </div>

      <div className="border-b border-sand px-4 py-2.5">
        <label className="block text-[10px] font-semibold uppercase tracking-widest text-tan">
          AI model
        </label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as Provider)}
          className="mt-1 w-full rounded-md border border-sand bg-white px-2 py-1.5 text-xs outline-none focus:border-bronze"
        >
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAsk}
          disabled={askDisabled}
          className="mt-2.5 w-full rounded-md bg-bronze-deep py-2 text-xs font-semibold text-cream shadow-sm hover:bg-bronze disabled:cursor-not-allowed disabled:opacity-50"
          title="Ask Observer (Ctrl+Enter or Cmd+Enter)"
        >
          ✳ Ask Observer
        </button>
        <p className="mt-1.5 text-center font-mono text-[10px] text-tan">
          Ctrl/⌘ + Enter
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {status === "signedout" && (
          <div className="rounded-lg border border-dashed border-tan bg-cream p-3 text-xs leading-relaxed text-ink-soft">
            Sign in to start receiving suggestions.
          </div>
        )}

        {status === "idle" &&
          (!hasMeaningfulContent ? (
            <div className="rounded-lg border border-dashed border-tan bg-cream p-3 text-xs leading-relaxed text-ink-soft">
              Write something first, then ask the Observer for help.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-dashed border-tan bg-cream p-3 text-xs leading-relaxed text-ink-soft">
                Select text for focused feedback, or ask about the current file.
              </div>
              <p className="px-1 font-mono text-[11px] text-tan">
                waiting for you to ask…
              </p>
            </>
          ))}

        {status === "thinking" && (
          <div className="rounded-lg border border-sand bg-cream p-3 text-xs leading-relaxed text-ink-soft">
            <span className="mr-2 inline-block animate-spin">✳</span>
            Reviewing your work…
          </div>
        )}

        {status === "ready" && suggestion && (
          <div className="space-y-3">
            <div className="relative rounded-lg border border-bronze/40 bg-cream p-3 pr-8">
              <button
                type="button"
                onClick={onDismiss}
                className="absolute right-2 top-1.5 rounded p-1 text-xs text-tan hover:bg-sand/50 hover:text-ink"
                aria-label="Dismiss suggestion"
                title="Dismiss (Escape)"
              >
                ✕
              </button>
              <p className="text-xs leading-relaxed text-ink">
                {suggestion.explanation}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-tan">
                {suggestion.reason}
              </p>
              {suggestion.snippet && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-ink p-2.5 font-mono text-[11px] leading-relaxed text-cream">
                  {suggestion.snippet}
                </pre>
              )}
            </div>
            <div className="flex gap-2">
              {suggestion.snippet && (
                <button
                  onClick={onAccept}
                  className="flex-1 rounded-md bg-bronze-deep py-1.5 text-xs font-medium text-cream hover:bg-bronze"
                >
                  ✓ Accept
                </button>
              )}
              <button
                onClick={onDismiss}
                className="flex-1 rounded-md border border-sand py-1.5 text-xs text-ink-soft hover:border-bronze"
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-ember/30 bg-ember/5 p-3 text-xs leading-relaxed text-ember">
              {error}
            </div>
            {needsKey && <KeyForm provider={provider} onSaved={onKeySaved} />}
          </div>
        )}
      </div>

      <div className="border-t border-sand p-4">
        <div className="rounded-lg border border-sand bg-cream px-3 py-2 text-[11px] text-ink-soft">
          <span className="mr-1">🌐</span>
          Web context: <span className="text-tan">extension not connected</span>
        </div>
      </div>
    </aside>
  );
}
