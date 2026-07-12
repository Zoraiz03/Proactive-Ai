"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/store";
import { kindOf } from "@/lib/files";

function FileIcon({ name }: { name: string }) {
  const isCode = kindOf(name) === "code";
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
        isCode ? "bg-bronze/15 text-bronze" : "bg-ember/10 text-ember"
      }`}
    >
      {isCode ? "{ }" : "¶"}
    </span>
  );
}

export default function FileTree() {
  const { files, activeFileId, createFile, renameFile, deleteFile, setActiveFile } =
    useWorkspace();
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commitCreate = () => {
    const name = draft.trim();
    if (name) createFile(name);
    setCreating(false);
    setDraft("");
  };

  const commitRename = () => {
    const name = draft.trim();
    if (renamingId && name) renameFile(renamingId, name);
    setRenamingId(null);
    setDraft("");
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sand bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Files
        </h2>
        <button
          onClick={() => {
            setCreating(true);
            setDraft("");
          }}
          className="rounded-md px-2 py-0.5 text-sm font-medium text-bronze hover:bg-cream-deep"
          title="New file"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {files.map((file) =>
          renamingId === file.id ? (
            <input
              key={file.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="mb-0.5 w-full rounded-md border border-bronze bg-white px-2 py-1.5 text-sm outline-none"
            />
          ) : (
            <div
              key={file.id}
              className={`group mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                file.id === activeFileId
                  ? "bg-cream-deep font-medium text-ink"
                  : "text-ink-soft hover:bg-cream"
              }`}
              onClick={() => setActiveFile(file.id)}
            >
              <FileIcon name={file.name} />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="hidden gap-1 group-hover:flex">
                <button
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(file.id);
                    setDraft(file.name);
                  }}
                  className="rounded px-1 text-xs text-ink-soft hover:bg-sand"
                >
                  ✎
                </button>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${file.name}?`)) deleteFile(file.id);
                  }}
                  className="rounded px-1 text-xs text-ink-soft hover:bg-sand"
                >
                  ✕
                </button>
              </span>
            </div>
          )
        )}

        {creating && (
          <input
            autoFocus
            value={draft}
            placeholder="filename.py"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            className="mt-1 w-full rounded-md border border-bronze bg-white px-2 py-1.5 text-sm outline-none placeholder:text-tan"
          />
        )}

        {files.length === 0 && !creating && (
          <p className="px-2 py-6 text-center text-xs text-tan">
            No files yet. Create one to get started.
          </p>
        )}
      </div>
    </aside>
  );
}
