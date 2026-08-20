# Proactive AI IDE — Desktop

This package contains the isolated Electron desktop application. Phase 1 is a
secure visual shell only; local filesystem access, Monaco, terminals, auth, AI,
and documentation tools are intentionally not included yet.

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
npm run typecheck
npm run build
```

The existing web application continues to use the commands in the repository
root, including `npm run dev` and `npm run build`.
