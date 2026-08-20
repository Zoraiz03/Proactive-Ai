"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WorkspaceFile } from "./files";

const SEED_FILES: WorkspaceFile[] = [
  {
    id: "seed-welcome",
    name: "welcome.md",
    content:
      "<h1>Welcome to Proactive AI Workspace</h1><p>Write or select something, then click <strong>Ask Observer</strong> for focused help. You can also press Ctrl+Enter or Cmd+Enter.</p><p>Try it out:</p><ul><li>Create a file from the sidebar (a <code>.py</code> or <code>.js</code> file opens the code editor)</li><li>Everything auto-saves as you type</li><li>Pick your AI model from the dropdown in the observer panel</li></ul>",
    updatedAt: 0,
  },
  {
    id: "seed-fib",
    name: "fibonacci.py",
    content:
      "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\n# This is recursive but slow for large n\n",
    updatedAt: 0,
  },
];

interface WorkspaceState {
  files: WorkspaceFile[];
  activeFileId: string | null;
  lastSavedAt: number | null;
  createFile: (name: string) => void;
  renameFile: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateContent: (id: string, content: string) => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      files: SEED_FILES,
      activeFileId: SEED_FILES[0].id,
      lastSavedAt: null,

      createFile: (name) =>
        set((s) => {
          const file: WorkspaceFile = {
            id: crypto.randomUUID(),
            name,
            content: "",
            updatedAt: Date.now(),
          };
          return { files: [...s.files, file], activeFileId: file.id };
        }),

      renameFile: (id, name) =>
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, name, updatedAt: Date.now() } : f
          ),
        })),

      deleteFile: (id) =>
        set((s) => {
          const files = s.files.filter((f) => f.id !== id);
          return {
            files,
            activeFileId:
              s.activeFileId === id ? files[0]?.id ?? null : s.activeFileId,
          };
        }),

      setActiveFile: (id) => set({ activeFileId: id }),

      updateContent: (id, content) =>
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, content, updatedAt: Date.now() } : f
          ),
          lastSavedAt: Date.now(),
        })),
    }),
    { name: "proactive-ai-workspace" }
  )
);
