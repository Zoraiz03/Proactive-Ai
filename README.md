# Proactive·AI Workspace

> The AI that watches. Not the one you ask.

A browser-based workspace that delivers AI suggestions automatically while you type — for both code and documents. Final Year Project, COMSATS University Islamabad, Abbottabad Campus.

## Build phases

- [x] **Phase 1 — Workspace shell**: landing page, file tree, Monaco code editor, TipTap document editor, localStorage auto-save
- [x] **Auth + suggestion engine**: sign-in/sign-up, detector-driven code suggestions, pause-driven document suggestions, model dropdown (Gemini/DeepSeek/ChatGPT/Claude + offline demo), accept/dismiss, encrypted API-key storage
- [x] **Adaptive stuck detection**: repeated edits, unresolved errors, and cursor thrashing combine into a score; last-20 outcomes tune per-user sensitivity
- [x] **Supabase migration**: Postgres + Supabase Auth + Row Level Security; the API now lives in Next.js Route Handlers (no separate server)
- [ ] **Phase 3b — Files in Postgres** (currently localStorage) + preferences UI
- [ ] **Phase 4 — Session history + usage limits**
- [ ] **Phase 5 — Chrome extension (live web context)**
- [ ] **Phase 6 — Admin dashboard + deploy**

## Getting started

Two processes: local Supabase (Docker) and the Next.js app.

```bash
# 1. Start Supabase locally (Docker). Applies migrations automatically.
npx supabase start

# 2. Put the printed keys into .env.local (see .env.local.example), then:
npm install && npm run dev        # http://localhost:3000
```

`npx supabase status` reprints the local URL / anon key / service-role key at any
time. `npx supabase stop` shuts the stack down; `npx supabase db reset` replays
migrations from scratch.

### Going to a hosted Supabase project

Create a project at supabase.com, run the SQL in `supabase/migrations/` against it
(or `supabase db push`), and replace the three `NEXT_PUBLIC_SUPABASE_URL` /
`_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values in `.env.local` with your
project's. No code changes needed.

For an existing project, apply the additive feedback migration with:

```bash
npx supabase db push
```

This creates `stuck_detection_settings`, `suggestions`, and
`suggestion_outcomes`. The migration enables ownership RLS and grants the
authenticated/service roles explicitly; no dashboard policy or key changes are
required.

## Stack

**Frontend + backend:** Next.js 14 (App Router, Route Handlers) · React 18 · TypeScript · Tailwind CSS · Monaco Editor · TipTap · Zustand
**Data + auth:** Supabase — Postgres, Supabase Auth, Row Level Security · Zod validation · AES-256-GCM for API keys at rest

### Security model

- **Auth:** Supabase Auth (sessions in cookies, refreshed by `src/middleware.ts`).
- **Row Level Security:** every table has RLS on; `profiles` and `files` use `auth.uid() = user_id` policies so users only ever see their own rows.
- **API keys:** the `api_keys` table has **no** client policy — the browser cannot read it at all. Only server Route Handlers, using the service-role key, decrypt keys to call AI providers. Keys are stored AES-256-GCM encrypted.

### API endpoints (Next.js Route Handlers)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/keys` | Which AI providers have a saved key (never the key itself) |
| PUT | `/api/keys/[provider]` | Save/replace an encrypted API key (gemini, openai, deepseek, anthropic) |
| DELETE | `/api/keys/[provider]` | Remove a key |
| POST | `/api/suggest` | Generate and persist a suggestion, including structured stuck metadata for code |
| GET | `/api/stuck-settings` | Resolve the signed-in user's preset, overrides, and adaptive thresholds |
| PATCH | `/api/stuck-settings` | Save a future Settings UI's preset and detector overrides |
| POST | `/api/suggestions/[id]/outcome` | Record accepted/dismissed outcomes and adapt sensitivity |

Auth (signup/login/logout/session) is handled directly by the Supabase client in
`src/lib/auth.ts` — no custom endpoints needed. The server-wide fallback AI keys
live in `.env.local`; a user's own saved key always takes priority.

Run focused detector checks with `npm run test:detectors`. The harness uses
deterministic timestamps and does not require a browser.

## Structure

```
src/
  middleware.ts          # Refreshes the Supabase auth session per request
  app/
    page.tsx             # Landing page (figure 1 of the scope document)
    login/, signup/      # Auth pages (figure 2)
    workspace/page.tsx   # Three-pane workspace
    api/
      suggest/route.ts   # Proactive suggestion endpoint
      stuck-settings/    # Typed detector preset/override API
      suggestions/[id]/  # Outcome persistence and feedback adaptation
      keys/[provider]/   # Encrypted API-key save/delete
  components/            # FileTree, CodeEditor, DocEditor, ObserverPanel …
  lib/
    supabase/            # client.ts (browser), server.ts (SSR), service.ts (service-role)
    auth.ts              # Supabase Auth wrapper
    suggest.ts           # Calls the /api route handlers
    server/              # providers, validation/feedback, and crypto (SERVER-ONLY)
    stuck-config.ts      # Typed defaults and low/medium/high presets
    stuck-detectors.ts   # Independent Monaco signal detectors + score combiner
    files.ts, store.ts   # File-kind detection, Zustand store
supabase/
  migrations/            # Schema, RLS policies, grants, signup trigger
```
