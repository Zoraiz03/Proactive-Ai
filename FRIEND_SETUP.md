# Friend Setup Guide

Use this guide to run Proactive AI Workspace on another computer and make code
changes.

The app uses **Next.js** (frontend + API) and **Supabase** (Postgres database +
auth) running locally in Docker. You only need two things installed: **Node.js**
and **Docker**.

## 1. Get Access

The repo is private, so the owner must add you as a collaborator:

GitHub repo -> Settings -> Collaborators -> Add people -> choose "Write" access.

After accepting the invitation, clone the project:

```bash
git clone https://github.com/ilyaskhan21/Proactive-AI-project.git
cd Proactive-AI-project
```

Install dependencies:

```bash
npm install
```

## 2. Install Docker (needed for local Supabase)

If Docker is not already installed:

### macOS

1. Download Docker Desktop from Docker's website.
2. Install it like a normal Mac app.
3. Open Docker Desktop and wait until it says Docker is running.

### Windows

1. Install Docker Desktop for Windows.
2. During setup, allow WSL 2 integration if asked.
3. Restart if Docker asks, then open Docker Desktop and wait until it is running.

### Linux

Install Docker Engine using the official instructions for your distribution.

Test that it works (Docker Desktop must be open/running):

```bash
docker --version
docker run hello-world
```

## 3. Start Supabase Locally

With Docker running, start the local Supabase stack. The first run downloads
several images and may take a few minutes.

```bash
npx supabase start
```

This automatically applies the database schema (tables, security policies) from
`supabase/migrations/`. When it finishes, it prints your local credentials.

You can reprint them any time with:

```bash
npx supabase status
```

You will need three values from that output:

- **API URL** (e.g. `http://127.0.0.1:54321`)
- **anon key**
- **service_role key**

Handy commands for later:

```bash
npx supabase stop        # shut the local stack down
npx supabase start       # bring it back up
npx supabase db reset    # wipe local data and replay all migrations
```

## 4. Create the Environment File

Copy the example file:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill it in using the values from `npx supabase status`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste_the_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=paste_the_service_role_key_here

# Any long random string — encrypts saved AI keys before storing them.
API_KEY_ENCRYPTION_SECRET=change_this_to_a_long_random_string

# Optional: a free Gemini key so AI suggestions work out of the box.
# Get one at https://aistudio.google.com/apikey
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Do not commit `.env.local` — it holds secrets and is already git-ignored.

> Note: the local anon/service_role keys are the same on every machine (they are
> Supabase's standard local-dev keys), so the owner can share them directly if
> that is easier than running `supabase status`.

## 5. Run the App

With Supabase running (step 3), start the app:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

That's it — there is no separate backend server to start. The API runs inside
Next.js.

Create an account on the sign-up page, open a file, type a few lines, and pause —
a suggestion appears in the right-hand panel.

## 6. Making Changes

Create a new branch before editing:

```bash
git checkout -b feature/your-change-name
```

After making changes:

```bash
git status
git add .
git commit -m "Describe your change"
git push -u origin feature/your-change-name
```

Then open a pull request on GitHub.

## 7. Common Problems

**`npx supabase start` fails or hangs** — make sure Docker Desktop is open and
says "running", then try again. A first run just takes a while (image downloads).

**Page loads but sign-up/sign-in fails** — your `.env.local` values are wrong or
missing. Re-run `npx supabase status` and copy the URL + keys exactly. Restart
`npm run dev` after editing `.env.local` (env changes need a restart).

**Suggestions say "add your key"** — either put a free `GEMINI_API_KEY` in
`.env.local`, or sign in and save a provider key from the observer panel. You can
also pick "Demo — offline" in the model dropdown to test without any key.

**Suggestions do nothing** — make sure you are signed in and the file has at
least ~20 characters, then stop typing for 5 seconds.

**Port already in use** — something else is on port 3000 (app) or 54321 (Supabase).
Stop the other process, or run `npx supabase stop` and start fresh.

## 8. Going to a Hosted Database (optional)

To use a shared cloud database instead of local Supabase:

1. Create a project at [supabase.com](https://supabase.com).
2. Push the schema: `npx supabase db push` (or run the SQL in
   `supabase/migrations/` from the dashboard SQL editor).
3. In `.env.local`, replace `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` with the
   values from your project's dashboard (Project Settings -> API).

No code changes are needed — only the environment values differ.
