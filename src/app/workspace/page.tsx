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
  fetchSuggestion,
  Provider,
  recordSuggestionOutcome,
  Suggestion,
} from "@/lib/suggest";
import {
  createManualSuggestionRequest,
  EditorRequestContext,
  hasMeaningfulContent,
} from "@/lib/manual-suggestion";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
});
const DocEditor = dynamic(() => import("@/components/DocEditor"), {
  ssr: false,
});

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

  // Observer state
  const [status, setStatus] = useState<ObserverStatus>("signedout");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [editorContext, setEditorContext] = useState<EditorRequestContext>({});
  const requestInFlight = useRef(false);

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setStatus(s ? "idle" : "signedout");
    });
  }, []);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  const activeKind = activeFile ? kindOf(activeFile.name) : null;
  const meaningfulContent =
    !!activeFile && !!activeKind && hasMeaningfulContent(activeKind, activeFile.content);

  useEffect(() => {
    setEditorContext({});
  }, [activeFileId]);

  const askObserver = useCallback(
    async () => {
      if (
        !session ||
        !activeFile ||
        !activeKind ||
        !hasMeaningfulContent(activeKind, activeFile.content) ||
        requestInFlight.current ||
        suggestion
      ) {
        return;
      }

      requestInFlight.current = true;
      setError(null);
      setNeedsKey(false);
      setStatus("thinking");
      const requestedFileId = activeFile.id;
      const request = createManualSuggestionRequest(
        activeFile.name,
        activeKind,
        activeFile.content,
        editorContext
      );
      const result = await fetchSuggestion({
        provider,
        ...request,
      });
      requestInFlight.current = false;

      if (requestedFileId !== useWorkspace.getState().activeFileId) {
        setStatus(session ? "idle" : "signedout");
        return;
      }
      if (result.suggestion) {
        setSuggestion(result.suggestion);
        setStatus("ready");
      } else {
        setError(result.error ?? "Something went wrong.");
        setNeedsKey(Boolean(result.needsKey));
        setStatus("error");
      }
    },
    [activeFile, activeKind, editorContext, provider, session, suggestion]
  );

  const acceptSuggestion = () => {
    if (!activeFile || !suggestion?.snippet) return;
    if (suggestion.id) void recordSuggestionOutcome(suggestion.id, "accepted");
    const next =
      kindOf(activeFile.name) === "code"
        ? `${activeFile.content.replace(/\n$/, "")}\n\n${suggestion.snippet}\n`
        : `${activeFile.content}<pre>${suggestion.snippet
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</pre>`;
    updateContent(activeFile.id, next);
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
      void recordSuggestionOutcome(dismissedId, "dismissed");
    }
  };

  const retryAfterKeySaved = () => {
    setError(null);
    setNeedsKey(false);
    setStatus("idle");
    setTimeout(() => void askObserver(), 0);
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
                onContextChange={setEditorContext}
              />
            ) : (
              <DocEditor
                fileId={activeFile.id}
                value={activeFile.content}
                onChange={(v) => updateContent(activeFile.id, v)}
                onContextChange={setEditorContext}
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
          hasMeaningfulContent={meaningfulContent}
          askDisabled={
            !session || !meaningfulContent || status === "thinking" || !!suggestion
          }
          provider={provider}
          onProviderChange={(p) => {
            setProvider(p);
          }}
          onAsk={() => void askObserver()}
          onAccept={acceptSuggestion}
          onDismiss={dismissSuggestion}
          onKeySaved={retryAfterKeySaved}
        />
      </div>
    </div>
  );
}
