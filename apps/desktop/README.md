# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. Phase 2C adds
local Monaco editing and secure saving for existing supported files inside the
selected workspace. Tabs, file creation/rename/delete, terminals, auth, AI, and
documentation tools are intentionally not included yet.

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
Save action or Ctrl+S / Cmd+S. Switching files with unsaved changes offers Save,
Discard, and Cancel choices.

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
