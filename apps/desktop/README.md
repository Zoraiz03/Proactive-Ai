# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. It includes the
local workspace/editor foundation, controlled terminal and Run Current File, and
Phase 5A email/password authentication. AI, Git integration, and documentation
tools are intentionally not included yet.

## Development

From this directory:

```bash
npm install
npm run dev
```

Desktop development automatically reuses the root web app's
`NEXT_PUBLIC_SUPABASE_URL` and public anon/publishable key from `.env.local`.
Alternatively, copy `.env.example` to `.env.local` in this directory and set
`DESKTOP_SUPABASE_URL` plus `DESKTOP_SUPABASE_PUBLISHABLE_KEY`. These are public
client values only—never put a service-role key, provider API key, or encryption
secret in the desktop environment.

Desktop access and refresh tokens are never placed in renderer localStorage.
Electron main encrypts them with OS-backed `safeStorage` and keeps only the
encrypted bytes under the application's user-data directory. Linux environments
without a real secret service are rejected rather than using Electron's
`basic_text` fallback.

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
local changes. After opening a workspace, choose New Terminal to start its shell;
no terminal process starts automatically.

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
