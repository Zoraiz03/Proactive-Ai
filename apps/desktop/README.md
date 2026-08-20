# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. Phase 3B keeps
the Explorer and open tabs synchronized with changes made through Finder,
Terminal, Git, or another editor. Dirty local buffers are never replaced without
an explicit conflict choice. Terminals, auth, AI, Git integration, and
documentation tools are intentionally not included yet.

## Development

From this directory:

```bash
npm install
npm run dev
```

`npm install` runs `electron-rebuild` for the native `node-pty` dependency. If the
Electron version changes or the terminal fails to load after restoring cached
dependencies, rebuild it explicitly:

```bash
npm run rebuild:native
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
confirmation. External changes refresh expanded Explorer folders; clean files
reload automatically, while dirty files offer Reload external version or Keep my
local changes.

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
