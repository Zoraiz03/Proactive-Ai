# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. Phase 2B adds a
secure read-only text/code file viewer on top of the local project Explorer.
Monaco, editing, saving, tabs, terminals, auth, AI, and documentation tools are
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

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
