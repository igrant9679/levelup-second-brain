# LevelUp Second Brain — Migration Guide

**Purpose:** Move your local development environment from one machine to another. The full state of the project lives in GitHub (`https://github.com/igrant9679/levelup-second-brain.git`) — this guide walks you through setting up a fresh machine to continue where you left off.

**Last updated:** May 12, 2026 (commit `6f4c40e`)
**Estimated time:** 15–30 minutes depending on what's already installed.

---

## Table of contents

1. [Before you leave the old machine](#1-before-you-leave-the-old-machine)
2. [What you do NOT need to copy](#2-what-you-do-not-need-to-copy)
3. [What you DO want to bring with you](#3-what-you-do-want-to-bring-with-you)
4. [On the new machine — install prerequisites](#4-on-the-new-machine--install-prerequisites)
5. [On the new machine — clone the repo](#5-on-the-new-machine--clone-the-repo)
6. [On the new machine — install dependencies](#6-on-the-new-machine--install-dependencies)
7. [On the new machine — start Claude Code](#7-on-the-new-machine--start-claude-code)
8. [Verify everything works](#8-verify-everything-works)
9. [Resume prompt for Claude Code](#9-resume-prompt-for-claude-code)
10. [Outstanding TODOs you're carrying into the next session](#10-outstanding-todos-youre-carrying-into-the-next-session)
11. [Troubleshooting](#11-troubleshooting)
12. [Appendix: where things live](#12-appendix-where-things-live)

---

## 1. Before you leave the old machine

Run these three commands in the project directory on the old machine to make sure everything is pushed:

```bash
cd C:\Users\idris\Documents\levelup-second-brain
git status
git log --oneline -3
```

**You want to see:**

- `git status` → "nothing to commit, working tree clean" and "Your branch is up to date with 'origin/main'."
- `git log` → top commit should be `6f4c40e CLAUDE.md: handoff refresh for May 11-12 session` (or whatever the latest is at the time you migrate).

If `git status` shows uncommitted changes, you have local work that hasn't been pushed. Either commit + push it, or stash it for later:

```bash
git add -A
git commit -m "WIP: migration snapshot"
git push
```

---

## 2. What you do NOT need to copy

The repo is fully self-contained on GitHub. You can leave the following behind:

| Don't copy | Why |
|---|---|
| `node_modules/` | Will be reinstalled fresh on the new machine. |
| `dist/` | Build output — regenerated on each build. |
| `.git/` | Will be re-cloned. |
| `.manus-logs/` | Local dev logs, not needed. |
| The `levelup-second-brain/` folder itself | Just re-clone it. |

---

## 3. What you DO want to bring with you

These don't live in the repo but you may want them on the new machine:

| Item | Where it is | Why you might want it |
|---|---|---|
| GitHub credentials | Browser saved logins / password manager | To push commits from the new machine. |
| Railway login | Browser saved logins / password manager | To manage env vars + see deploy logs. |
| Google Cloud Console login | Browser saved logins / password manager | To regenerate the Drive OAuth credentials if needed. |
| Microsoft 365 account | Browser saved logins / password manager | For the M365 OAuth integration. |
| Anthropic API key | Wherever you keep it | If you use Claude Code with API billing rather than the bundled Claude subscription. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` value | If you generated one already — wherever you noted it | Easier than regenerating via OAuth Playground. Optional: you can always regenerate. |
| Any Railway env-var values you keep a copy of | Password manager | Railway also holds them server-side, but a backup is sensible. |

**You do NOT need to copy any `.env` file from the old machine.** The repo has no local `.env` — all server config is on Railway, all client config is fetched at runtime.

---

## 4. On the new machine — install prerequisites

You need four tools. Install them in this order. **Close and reopen your terminal after each install** so `PATH` updates.

### 4.1. Git

**Download:** https://git-scm.com/download/win
**Install:** Run the installer with default settings. The defaults are fine — you can blow through the "Next" buttons.

**Verify:** Open a new PowerShell or Windows Terminal window:

```powershell
git --version
```

You should see something like `git version 2.46.0.windows.1`.

### 4.2. Node.js (LTS)

**Download:** https://nodejs.org/ — click the **LTS** button (the green one on the left), NOT "Current".
**Install:** Run the installer with default settings. Make sure "Add to PATH" is checked (default).

**Verify:** Open a new terminal:

```powershell
node --version
npm --version
```

You want Node `v20.x` or higher and npm `10.x` or higher.

### 4.3. pnpm

pnpm comes bundled with Node 16.13+ via **corepack**. Run this once in any terminal:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

**Verify:**

```powershell
pnpm --version
```

You want `9.x` or `10.x`.

**If `corepack` is not recognized:**

```powershell
npm install -g pnpm
```

### 4.4. Claude Code

**Install:**

```powershell
npm install -g @anthropic-ai/claude-code
```

**Verify:**

```powershell
claude --version
```

**First run** — `claude` will prompt you to sign in. Use whatever method matches how you signed in on the old machine (browser login or API key).

---

## 5. On the new machine — clone the repo

Pick where you want the project to live. Documents is a fine default.

**In PowerShell or Windows Terminal:**

```powershell
cd $HOME\Documents
git clone https://github.com/igrant9679/levelup-second-brain.git
cd levelup-second-brain
```

**In Git Bash:**

```bash
cd ~/Documents
git clone https://github.com/igrant9679/levelup-second-brain.git
cd levelup-second-brain
```

**Verify:**

```powershell
git log --oneline -3
```

You should see the same top commit as on the old machine — `6f4c40e` (or newer).

If `git clone` asks for credentials, paste your GitHub username and a **personal access token** (NOT your password — GitHub stopped accepting passwords years ago). Generate a token at https://github.com/settings/tokens with `repo` scope if you don't have one.

---

## 6. On the new machine — install dependencies

Inside the `levelup-second-brain/` folder:

```powershell
pnpm install --frozen-lockfile
```

This takes 2–5 minutes depending on your network. It will:

- Read `package.json` + `pnpm-lock.yaml`
- Download every dependency
- Create a `node_modules/` folder

**Why `--frozen-lockfile`:** ensures you get the exact same versions Railway uses, so local builds match production. Don't drop this flag unless you intentionally want to update versions.

**If install fails:**

- "ERR_PNPM_OUTDATED_LOCKFILE": run `pnpm install` (without `--frozen-lockfile`). This will update the lockfile. You'll want to commit + push the updated lockfile if it changes.
- Network errors: retry once or twice. If persistent, check your firewall / VPN.

---

## 7. On the new machine — start Claude Code

In the `levelup-second-brain/` folder:

```powershell
claude
```

This opens Claude Code in the project root. The tool will read `CLAUDE.md` automatically when you start working.

---

## 8. Verify everything works

Before doing actual work, run these sanity checks in the project folder:

### 8.1. TypeScript compiles

```powershell
pnpm run check
```

Should exit with no errors. (This runs `tsc --noEmit` against the whole repo.)

### 8.2. Tests pass

```powershell
pnpm test
```

The test suite is under `server/*.test.ts`. Should be green.

### 8.3. Dev server starts (optional)

```powershell
pnpm run dev
```

Should print "Server running on http://localhost:3000/" (or whatever port). `Ctrl+C` to stop.

You don't strictly need a local dev server — Railway is the source of truth for the live site at https://levelupnow.tools — but it's useful for fast iteration.

**If you DO want to run it locally** you'll need `DATABASE_URL` and a few other env vars. Easiest: create a `.env` file in the project root and pull them from Railway (`Variables` tab in the Railway dashboard → copy the values you need). At minimum you need `DATABASE_URL` and `JWT_SECRET`. The file is gitignored so it stays local-only.

---

## 9. Resume prompt for Claude Code

Once you're in `claude` on the new machine, paste this exact message as your first prompt:

```
Resuming the LevelUp Second Brain project on a new machine. Read CLAUDE.md
first — it has the full project context, repo layout (HTML shell + two
extracted JS chunks in client/public/js/), patterns, gotchas, and recently
shipped work through commit 6f4c40e (May 12 2026).

Active state:
- All 7 originally-picked Tier 1–4 items are shipped (knowledge graph,
  server-side cron, perf split, onboarding tour, dashboard widgets,
  drag-reorder, empty states).
- Storage layer was rebuilt to support S3, Google Drive, or Manus Forge —
  picked in that order. None are wired on Railway yet, so importers fall
  back to data URIs.
- Word Doc Import (Settings) and Notes-page Import Docs both preserve
  formatting + images via mammoth convertToHtml, with data-URI fallbacks.
  A "⚡ Skip images & attachments" bypass checkbox lets the user import
  cleanly while storage is unconfigured.
- jszip is now a direct dep for .docx attachment extraction.

Pending TODO carried into this session:
1. User to wire S3 or Google Drive env vars on Railway (instructions in
   CLAUDE.md storage section + server/_core/env.ts inline comments). Once
   set, re-import the Word doc the user was working with to capture
   images and embedded PDFs properly.

First action: Run `git pull --rebase` (manus-agent may have committed)
and `git status` to confirm clean tree, then wait for me to tell you
what to work on.
```

Claude will read `CLAUDE.md`, verify the git state, and be ready to continue.

---

## 10. Outstanding TODOs you're carrying into the next session

From this session arc, exactly **one** item is still open:

### 10.1. Wire storage on Railway

Pick **ONE** backend. Set the env vars in **Railway → your project → Variables**, then Railway will auto-redeploy.

#### Option A: Cloudflare R2 (recommended — free, no egress fees)

1. Sign up at https://dash.cloudflare.com → R2.
2. Create a bucket (any name; remember it).
3. Bucket → Settings → enable **Public R2.dev URL** OR connect a custom domain.
4. R2 Overview → "Manage R2 API Tokens" → "Create API token" → permission **Object Read & Write** → save the access key id + secret.
5. In Railway, set:

| Var | Value |
|---|---|
| `S3_BUCKET` | your bucket name |
| `S3_ACCESS_KEY_ID` | from step 4 |
| `S3_SECRET_ACCESS_KEY` | from step 4 |
| `S3_ENDPOINT` | `https://<your-account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_PUBLIC_URL_BASE` | the public R2.dev URL or your custom domain |

#### Option B: AWS S3

1. AWS Console → S3 → create bucket.
2. Bucket → Permissions → uncheck "Block all public access" → confirm.
3. Add bucket policy allowing `s3:GetObject` for `*` (public read).
4. IAM → create user with `s3:PutObject` on the bucket → save access keys.
5. In Railway:

| Var | Value |
|---|---|
| `S3_BUCKET` | your bucket name |
| `S3_ACCESS_KEY_ID` | from step 4 |
| `S3_SECRET_ACCESS_KEY` | from step 4 |
| `S3_REGION` | e.g. `us-east-1` |

Leave `S3_ENDPOINT` unset (uses AWS default). Leave `S3_PUBLIC_URL_BASE` unset (auto-derives to `https://<bucket>.s3.<region>.amazonaws.com`).

#### Option C: Google Drive

1. Google Cloud Console → APIs & Services → Library → enable **Google Drive API**.
2. Credentials → Create OAuth client → **Web application**.
3. Add `https://developers.google.com/oauthplayground` to **Authorized redirect URIs**.
4. Note the **Client ID + Secret**.
5. Open https://developers.google.com/oauthplayground:
   - Click ⚙ (top right) → check **Use your own OAuth credentials** → paste client ID + secret.
   - In the left scope list, find **Drive API v3** → check `https://www.googleapis.com/auth/drive.file` → click **Authorize APIs**.
   - Sign in to your Google account → grant access.
   - Click **Exchange authorization code for tokens** → copy the **refresh token**.
6. In your Drive, create (or pick) a folder. Open it; the URL ends with the folder ID: `drive.google.com/drive/folders/<THIS_PART>`. Copy that.
7. In Railway, set:

| Var | Value |
|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | from step 4 |
| `GOOGLE_DRIVE_CLIENT_SECRET` | from step 4 |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | from step 5 |
| `GOOGLE_DRIVE_FOLDER_ID` | from step 6 |

### 10.2. After wiring storage

Once Railway redeploys with the new env vars:

1. Hard-refresh the live app (`Ctrl+Shift+R`).
2. Go to **Settings → 📝 Word Doc Import**.
3. Re-import your `Music Production.docx` (or whichever doc was failing).
4. **Uncheck** the "⚡ Skip images & attachments" bypass.
5. Click **Analyse Document**.
6. The warnings panel should now say "X images uploaded to storage" instead of "inlined as data URIs."

If you still see "data URIs" warnings, the env vars aren't being picked up — check spelling and that Railway redeployed. Tell the next Claude Code session and it'll help debug.

---

## 11. Troubleshooting

### "git: command not found"

You haven't installed Git, or you didn't restart your terminal after installing. Restart the terminal.

### "pnpm: command not found"

Run `corepack enable && corepack prepare pnpm@latest --activate`. If that doesn't work, `npm install -g pnpm`.

### "claude: command not found"

Run `npm install -g @anthropic-ai/claude-code` again. Make sure Node is in your PATH (`node --version` should work).

### `pnpm install` errors with "ERR_PNPM_FROZEN_LOCKFILE"

The lockfile and package.json are out of sync. Either:

- Run without the flag: `pnpm install` (will update lockfile).
- Or check that you didn't pull mid-way through a manus-agent commit: `git pull --rebase` then retry.

### TypeScript errors when running `pnpm run check`

If they're real errors (red text from `tsc`), report them in the next Claude Code session — could be a regression that needs fixing.

### "claude" opens but says "no API key" or similar

You need to sign in. Run `claude` and follow the prompt. If you use the Claude Pro/Max subscription, choose the browser login. If you use the API, set `ANTHROPIC_API_KEY` as an environment variable.

### Live site at https://levelupnow.tools is broken after migration

It shouldn't be — the migration is purely local. But if Railway has redeployed in the meantime and something broke, check:

- Railway dashboard → your project → **Deployments** tab → look for failed builds.
- The repo locally: `git log` to see if a recent commit might have caused it.

### Manus-agent has pushed new commits

If you see a notice on `git pull --rebase` about new commits from `manus-agent`, that's expected — they may push small fixes between sessions. Just let the rebase finish. If there's a conflict, the next Claude Code session can help resolve.

---

## 12. Appendix: where things live

### 12.1. Repo

- **GitHub:** https://github.com/igrant9679/levelup-second-brain
- **Branch:** `main` (only branch — single-developer workflow)
- **Live deploy:** https://levelupnow.tools (Railway)
- **Railway project ID:** `0e14aeac-378a-469e-a5ca-292839f1e7ce` (a.k.a. `levelup-second-brain / production`)

### 12.2. Repo layout

```
client/
  index.html            ← HTML shell + CSS + 2 <script src> tags. ~1,660 lines.
  public/js/
    app-part1.js        ← 12,000+ lines. renderHome / renderTasks / renderNotes /
                          renderGoals / renderHabits / renderMail / renderJournal /
                          renderIdeas / renderCal / renderReports / RTE / lightbox /
                          cmd palette / AI chat / theme engine / etc.
    app-part2.js        ← 8,800+ lines. renderSettingsHTML / renderHelp /
                          renderContacts / renderClustersDashboard / tour engine /
                          knowledge-graph (s-graph) / mind-map (s-mindmap) / etc.
  src/                  ← Small React shell (App.tsx, AppLayout, ~12 pages)
server/
  _core/                ← infra (auth context, tRPC, OAuth, email, LLM, env, storage)
  routers/              ← tRPC routers (ai, bookmarks, emailAuth, oauth-sync, wordImport,
                          notesImport, etc.)
shared/                 ← shared types
drizzle/                ← schema.ts + migration SQL (auto-applied at startup)
CLAUDE.md               ← THE handoff doc — read this first
MIGRATION.md            ← This document
package.json
pnpm-lock.yaml
```

### 12.3. Key files for context

| File | What's in it |
|---|---|
| `CLAUDE.md` | Project handoff doc. Read this first in any new session. |
| `MIGRATION.md` | This document. |
| `server/_core/env.ts` | All server-side env var definitions. The storage backends (S3 / Drive / Forge) are documented inline. |
| `server/storage.ts` | The multi-backend storage layer. |
| `server/routers/wordImport.ts` | Settings → Word Doc Import server route. |
| `server/routers/notesImport.ts` | Notes page → Import Docs server route. |
| `drizzle/schema.ts` | Database schema. 33 tables, hybrid relational + JSON blob storage. |
| `client/public/js/app-part1.js` | First half of the legacy single-file UI code. NOTE: contains literal NUL bytes inside markdown-renderer string placeholders. `file(1)` reports it as "data" but it's valid UTF-8 JavaScript. Use `grep -an` via Bash if the Grep tool won't open it. |
| `client/public/js/app-part2.js` | Second half. |

### 12.4. Workflow conventions

- **User reviews before push** by default. Don't `git push` without explicit "push it" / "yes" confirmation.
- **Manus AI also commits to this repo** as `manus-agent`. Always `git pull --rebase` before working.
- **Commit format:** `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer on commits Claude Code makes.
- **Avoid huge messages in PowerShell** — special chars (`·`, smart quotes) break heredocs. Use simple ASCII.

### 12.5. Deploy flow

- Push to `main` → Railway auto-deploys.
- Build runs `pnpm install --frozen-lockfile` then `vite build && esbuild server/_core/index.ts`.
- Start runs `drizzle-kit migrate || echo … && node dist/index.js`.
- `drizzle-kit` MUST stay in `devDependencies` to keep lockfile in sync (Railway includes devDeps at runtime).

### 12.6. Hard reset (if you really need to start over)

If things get messy on the new machine, you can always:

```powershell
cd $HOME\Documents
rm -r -force levelup-second-brain   # blow it away
git clone https://github.com/igrant9679/levelup-second-brain.git
cd levelup-second-brain
pnpm install --frozen-lockfile
```

You'll lose nothing because everything important is in GitHub.

---

**Good luck on the new machine.** If anything in this document is wrong or unclear, tell the next Claude Code session and it can update this file for the next time.
