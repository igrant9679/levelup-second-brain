# LevelUp Second Brain — context for Claude Code sessions

## What it is

Personal productivity / "second brain" web app: tasks, notes, projects, goals, journal, habits, mind maps, contacts, bookmarks, calendar, mail. Single-user instance for now; multi-user team features exist but lightly used. Live at **https://levelupnow.tools**.

## Stack

- **Frontend**: React 19 + Vite, TypeScript, Tailwind 4, Radix UI, wouter routing, tRPC client.
  - **BUT**: most of the actual UI lives in `client/index.html` — a ~17,000-line single-file legacy HTML app with embedded JS that the React shell wraps. Don't be misled by `client/src/`; the real code is in `index.html`.
- **Backend**: Node + Express, tRPC, Drizzle ORM, MySQL (mysql2 driver).
- **Deploy**: Railway. Auto-deploys on push to `main`.
- **Auth**: email/password (bcrypt + JWT cookies, 1-year expiry) + Microsoft 365 OAuth.

## Repo layout

```
client/
  index.html          ← THE BIG ONE. 17k lines. Most edits go here.
  src/                ← Small React shell (App.tsx, AppLayout, ~12 pages)
server/
  _core/              ← infra (auth context, tRPC, OAuth, email, LLM, env)
  routers/            ← tRPC routers (ai, bookmarks, emailAuth, oauth-sync, etc.)
shared/               ← shared types
drizzle/              ← schema.ts + migration SQL files (auto-applied at startup)
package.json          ← `start` runs `drizzle-kit migrate || echo … && node dist/index.js`
```

## Schema architecture (important)

33 tables. Hybrid:
- **Properly relational**: bookmarks, calendar events, oauth tokens, team invites, help articles, etc.
- **JSON blobs**: `userAppData` stores tasks, notes, projects, goals, journal, habits, contacts, ideas, teams, prefs, calEvents per user as **stringified JSON columns**. This is legacy from the original single-HTML/localStorage version. No DB-level querying within those blobs; whole row is read/written.

Newer features were built relationally; older "second brain" data is still blob-based. Migrating it is a known piece of tech debt.

## Deploy workflow

- Push to `main` → Railway picks it up → builds → runs `pnpm install --frozen-lockfile` → builds (vite + esbuild) → starts.
- `start` script runs `drizzle-kit migrate` first so a fresh DB gets schema. **`drizzle-kit` must stay in devDependencies** to keep the lockfile in sync (Railway includes devDeps at runtime, so it works).
- Custom domain: `levelupnow.tools` (apex, no `www` configured).
- DNS hosted via Manus historically; the user moved it during a Railway project switch.
- The `terrific-presence` Railway project is **deleted**. Active project is `0e14aeac-378a-469e-a5ca-292839f1e7ce` (a.k.a. `levelup-second-brain / production`).

## Workflow conventions (with this user)

- **User reviews before push** by default. Don't `git push` without explicit "push it" / "yes" confirmation.
- **Commit format**: include `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer.
- **Avoid huge messages in PowerShell** — special chars (`·`, smart quotes) break the heredoc. Use simple ASCII.
- **Manus AI also commits to this repo** as `manus-agent`. Pull before working: `git pull --rebase` to avoid conflicts.
- The user said **skip Bookmarks and Contacts pages** during audits.

## Patterns we've established

### Sidebar / Settings section labels
`.sl` CSS class — uppercase 9px label between groups. Used in main sidebar template (line ~572) and Settings nav (in `renderSettingsHTML`).

### Color-coded sidebar icons
`.si[data-n="<route>"] svg { stroke: #xxx }` rules block. One per route. Active state overrides via `.si.on svg { stroke: var(--ach) !important }`.

### Header dropdown menus
Use `togglePopMenu(menuId)` / `closePopMenu(menuId)` helpers. Tag the menu div with `data-pop-menu="1"` so others auto-close. Live near `renderCurrentTaskView` in index.html.

### Dynamic header subtitles
Use IIFE inside the template literal to compute live counts from `D.tasks`, `D.goals`, etc. Pattern: `${(()=>{ const a=...; return \`X active${overdue?...:''}\`; })()}`.

### Tasks view dispatcher
`_taskView` is a global. `renderCurrentTaskView()` dispatches to one of 5 render functions (list/board/matrix/gantt/clusters). Tab clicks, scope toggles, and bulk actions all call this — never `renderTaskList()` directly. **Default view is `clusters`**.

### Filter state must be global
`let _someFilter = …` declared inside a render function **resets on every re-render** (looks like the filter doesn't work). All filter state vars (`_taskFilter`, `_taskMyOnly`, `_taskPriorityFilter`, `_goalsView`, `_jrnlFilter`, etc.) live at module scope.

### Inline onclick → global scope only
Inline `onclick="someFunc()"` resolves `someFunc` in global scope. **Don't declare functions inside render functions if they're called from inline onclicks** — they'll silently fail in strict mode. Hoist to global. (We hit this with `renderJournalList`.)

### Modals
`openModal(type)` is special-cased — only handles `'capture'`. For custom modals, set `#modal-content` innerHTML directly and add `.show` class to `#modal-capture`. (See `openClusterModal`.)

### Compact vs. normal mode
Body class `compact-mode` is a setting. Normal mode has bumped font sizes (15px body, 13px nav/tabs/inputs) via `body:not(.compact-mode) …` rules. Don't touch absolute pixel sizes elsewhere unless needed.

### Page width
`.bg:not(.wr) .mn { max-width: 1280px; margin-right: auto }` caps content width on rail-less pages. Pages with right rail (`.bg.wr`) are unconstrained — the rail provides the right edge.

## Known gotchas

- **Goals + Journal** had filter-resets-on-render bugs that are now fixed; if similar render functions are added, keep state at module scope.
- The `_calEventsDefault` array (~line 5062) is **seed data** for new users. Real events go in `D.calEvents` once OAuth-synced.
- Never delete the seed task IDs 201/202/203 logic in `doLoginSuccess` — guarded by `lu_examples_seeded_v1` localStorage flag.
- Rate limiting is **not** in the code. If you ever spec a fix, mention it.
- 1-year JWT session expiry with no refresh/revocation. Documented risk; not blocking.

## Things deliberately not done

- Modal pattern refactor (only 1 bug surfaced — the manual pattern works fine elsewhere).
- CSS variables for font sizes (override layer covers it).
- Mobile responsiveness audit (untested).
- Sidebar collapsible-to-icons mode (user wants to see all options first).
- Page header helper extraction (would touch 12+ render functions — defer).

## Useful commands

```sh
git pull --rebase                         # always pull first; manus-agent may have committed
git status                                 # check uncommitted state
git log --oneline -10                      # recent context
git push                                   # only after user says push
```

The local clone lives at `C:\Users\idris\Documents\levelup-second-brain` on the user's home machine.
