"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import FileTree from "@/components/FileTree";
import ObserverPanel, { ObserverStatus } from "@/components/ObserverPanel";
import { useWorkspace } from "@/lib/store";
import { kindOf } from "@/lib/files";
import { getSession, signOut, Session } from "@/lib/auth";
import {
  fetchStuckSettings,
  fetchSuggestion,
  Provider,
  recordSuggestionOutcome,
  Suggestion,
} from "@/lib/suggest";
import { resolveStuckConfig, StuckDetectionConfig } from "@/lib/stuck-config";
import type { StuckMetadata } from "@/lib/stuck-detectors";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
});
const DocEditor = dynamic(() => import("@/components/DocEditor"), {
  ssr: false,
});

const MIN_CONTENT_LENGTH = 20;

function SaveStatus() {
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (!lastSavedAt) return null;
  const secondsAgo = Math.round((Date.now() - lastSavedAt) / 1000);
  return (
    <span className="font-mono text-[11px] text-tan">
      {secondsAgo < 4 ? "saving…" : "all changes saved"}
    </span>
  );
}

function UserMenu({ session }: { session: Session | null }) {
  const router = useRouter();

  if (!session) {
    return (
      <Link
        href="/login"
        className="rounded-lg border border-sand px-3 py-1 text-xs text-ink-soft hover:border-bronze"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bronze-deep text-[11px] font-semibold uppercase text-cream">
        {session.name.charAt(0) || "?"}
      </span>
      <span className="text-xs text-ink-soft">{session.email}</span>
      <button
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
        className="rounded-lg border border-sand px-2 py-1 text-xs text-ink-soft hover:border-bronze"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}

export default function WorkspacePage() {
  const { files, activeFileId, updateContent } = useWorkspace();
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Observer state
  const [status, setStatus] = useState<ObserverStatus>("signedout");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [detectionConfig, setDetectionConfig] = useState<StuckDetectionConfig>(
    () => resolveStuckConfig()
  );
  const requestInFlight = useRef(false);
  const pendingStuck = useRef<StuckMetadata | null>(null);
  // Content the observer has already handled — don't re-suggest for it
  const lastHandledContent = useRef<string | null>(null);

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setSessionLoaded(true);
      setStatus(s ? "idle" : "signedout");
      if (s) {
        void fetchStuckSettings().then((config) => {
          if (config) setDetectionConfig(config);
        });
      }
    });
  }, []);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  const pauseMs = (session?.pauseSeconds ?? 5) * 1000;
  const contentTooShort =
    !!activeFile && activeFile.content.length < MIN_CONTENT_LENGTH;

  // Document files retain the original pause-based suggestion behavior.
  // Monaco code files are triggered only by the detector engine below.
  useEffect(() => {
    if (!sessionLoaded || !session || !activeFile) return;
    if (kindOf(activeFile.name) === "code") return;
    if (activeFile.content.length < MIN_CONTENT_LENGTH) return;
    if (activeFile.content === lastHandledContent.current) return;

    setStatus("watching");
    const timer = setTimeout(async () => {
      const requested = activeFile.content;
      requestInFlight.current = true;
      setStatus("thinking");
      const result = await fetchSuggestion({
        provider,
        fileName: activeFile.name,
        kind: kindOf(activeFile.name),
        content: requested,
      });
      lastHandledContent.current = requested;
      requestInFlight.current = false;
      if (result.suggestion) {
        setSuggestion(result.suggestion);
        setStatus("ready");
      } else {
        setError(result.error ?? "Something went wrong.");
        setNeedsKey(Boolean(result.needsKey));
        setStatus("error");
      }
    }, pauseMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFile?.content,
    activeFile?.id,
    provider,
    pauseMs,
    session,
    sessionLoaded,
    retryNonce,
  ]);

  const handleStuck = useCallback(
    async (stuck: StuckMetadata) => {
      if (
        !session ||
        !activeFile ||
        kindOf(activeFile.name) !== "code" ||
        activeFile.content.length < MIN_CONTENT_LENGTH ||
        requestInFlight.current ||
        suggestion
      ) {
        return;
      }

      requestInFlight.current = true;
      pendingStuck.current = stuck;
      setError(null);
      setNeedsKey(false);
      setStatus("thinking");
      const requestedFileId = activeFile.id;
      const result = await fetchSuggestion({
        provider,
        fileName: activeFile.name,
        kind: "code",
        content: activeFile.content,
        stuck,
      });
      requestInFlight.current = false;

      if (requestedFileId !== useWorkspace.getState().activeFileId) return;
      if (result.suggestion) {
        pendingStuck.current = null;
        setSuggestion(result.suggestion);
        setStatus("ready");
      } else {
        if (!result.needsKey) pendingStuck.current = null;
        setError(result.error ?? "Something went wrong.");
        setNeedsKey(Boolean(result.needsKey));
        setStatus("error");
      }
    },
    [activeFile, provider, session, suggestion]
  );

  const acceptSuggestion = () => {
    if (!activeFile || !suggestion?.snippet) return;
    void recordSuggestionOutcome(suggestion.id, "accepted").then((config) => {
      if (config) setDetectionConfig(config);
    });
    const next =
      kindOf(activeFile.name) === "code"
        ? `${activeFile.content.replace(/\n$/, "")}\n\n${suggestion.snippet}\n`
        : `${activeFile.content}<pre>${suggestion.snippet
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</pre>`;
    updateContent(activeFile.id, next);
    lastHandledContent.current = next;
    setSuggestion(null);
    setStatus("idle");
  };

  const dismissSuggestion = () => {
    const dismissedId = suggestion?.id;
    setSuggestion(null);
    setError(null);
    setNeedsKey(false);
    setStatus(session ? "idle" : "signedout");
    if (dismissedId) {
      void recordSuggestionOutcome(dismissedId, "dismissed").then((config) => {
        if (config) setDetectionConfig(config);
      });
    }
  };

  const retryAfterKeySaved = () => {
    const stuck = pendingStuck.current;
    lastHandledContent.current = null;
    setError(null);
    setNeedsKey(false);
    setStatus("idle");
    if (stuck) {
      setTimeout(() => void handleStuck(stuck), 0);
    } else {
      setRetryNonce((n) => n + 1);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-tan">
        Opening workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-sand bg-card px-4">
        <div className="flex items-center gap-6">
          <Logo />
          {activeFile && (
            <span className="rounded-md bg-cream-deep px-2.5 py-1 font-mono text-xs text-ink-soft">
              {activeFile.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <SaveStatus />
          <UserMenu session={session} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FileTree />

        <main className="min-w-0 flex-1 bg-white">
          {activeFile ? (
            kindOf(activeFile.name) === "code" ? (
              <CodeEditor
                fileName={activeFile.name}
                value={activeFile.content}
                onChange={(v) => updateContent(activeFile.id, v)}
                detectionConfig={detectionConfig}
                onStuck={handleStuck}
              />
            ) : (
              <DocEditor
                fileId={activeFile.id}
                value={activeFile.content}
                onChange={(v) => updateContent(activeFile.id, v)}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-soft">
              <p className="text-lg font-medium">No file open</p>
              <p className="text-sm text-tan">
                Create or select a file from the sidebar.
              </p>
            </div>
          )}
        </main>

        <ObserverPanel
          status={status}
          suggestion={suggestion}
          error={error}
          needsKey={needsKey}
          contentTooShort={contentTooShort}
          isCodeFile={!!activeFile && kindOf(activeFile.name) === "code"}
          provider={provider}
          onProviderChange={(p) => {
            setProvider(p);
            lastHandledContent.current = null;
          }}
          onAccept={acceptSuggestion}
          onDismiss={dismissSuggestion}
          onKeySaved={retryAfterKeySaved}
        />
      </div>
    </div>
  );
}
