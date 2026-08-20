# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. Phase 3A adds
editor tabs and validated create, rename, and non-recursive delete operations for
the selected workspace. Terminals, auth, AI, Git, and documentation tools are
intentionally not included yet.

## Development

From this directory:

```bash
npm install
npm run dev
```

Or from the repository root:

```bash
npm --prefix apps/desktop install
npm --prefix apps/desktop run dev
```

## Checks

```bash
npm test
npm run typecheck
npm run build
```

Open a folder, choose a supported text/code file, edit it, and use the visible
Save action or Ctrl+S / Cmd+S. Closing a dirty tab or replacing the workspace
offers Save, Discard, and Cancel choices. Explorer actions create supported text
files and folders, rename items, and delete files or empty folders after
confirmation.

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
