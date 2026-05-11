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
- ~~Mobile responsiveness audit~~ — **DONE** as of `72c0579`. Hamburger sidebar, panel stacking, AI panel full-width on phones.
- ~~Sidebar collapsible-to-icons mode~~ — **DONE** as of `a8dc171`. « toggle at bottom of sidebar; flyout labels on hover when collapsed.
- Page header helper extraction (would touch 12+ render functions — defer).

## Major systems shipped (Apr–May 2026 session arc)

### Command palette
- ⌘K / Ctrl+K opens a centered overlay (`#cmdp-overlay`).
- `_cmdpActions()` builds the action catalog (17 navigate + 8 create + 4 tools + N theme-profile entries).
- `getSearchItems()` / `semanticScore()` power universal data search.
- Recent actions persisted to `lu_cmdp_recent`.

### AI Chat Assistant (Cmd+J)
- Slide-out panel `#ai-panel`, 420px right, full-width on phones.
- Persistent thread in `D.prefs.aiChat.messages` (last 50, server-synced).
- `_buildAIContext()` ships workspace snapshot per turn.
- `_renderAISuggestions()` returns context-aware prompt chips per screen.
- Uses `ai.assist` tRPC + `_getAIConfig()` for shared workspace keys.

### Theme engine (per-user)
- Stored in `D.prefs.theme / pageAccents / themeProfiles / themeSchedule / themeFontFamily / themeFontScale`.
- `applyTheme()` pushes CSS vars to `:root`, rewrites `#lu-page-accents` style tag.
- `_getEffectiveTheme()` resolves defaults → stored → scheduled overrides.
- `_ensureThemeSchedulerRunning()` is a 60s interval that re-applies if the active schedule changed.
- Settings → 🎨 Appearance has the full UI: 8 presets, 14 granular pickers, 24 per-page accents, typography, save/load/delete profiles, time-of-day scheduler.

### Custom Reports (Phase 1+2+3)
- `_reportWidgets` array of `{id,title,source,filter,groupBy,metric,viz,color,sizeW,range}`.
- 8 sources (tasks/habits/goals/journal/projects/ideas/bookmarks/focus), 8 viz types (kpi/bar/line/donut/heatmap/sparkline/progress/table).
- `_widgetData()` runs filter→groupBy→metric pipeline; `_renderWidget()` switches on viz.
- HTML5 drag-and-drop reorder, ⤢ size dropdown (3/4/6/8/12 cols).
- `openAIWidgetBuilder()` — natural language → widget JSON via `ai.assist`.
- `pinWidgetToHome()` adds to `D.prefs.homePinnedWidgets`; Home renders them via `_renderWidget()`.
- `emailCurrentReport()` + `_checkReportSchedules()` — on-login email catch-up. Server endpoint `oauthSync.sendCustom` (self-delivery only).

### Notes page features
- Title banner with stat pills (📄 N · 🆕 N this week · ⭐ starred · 📌 pinned · 🏷 tagged).
- Bulk-select mode: `_notesBulkMode` toggle; bulk auto-tag, add tag, star, pin, export, delete.
- Multi-file doc import via `importDocumentsBatch()`.
- Thumbnails (`_noteFirstImage()`), color tags (`NOTE_COLOR_PALETTE`), pin (`n.pinned`), breadcrumb chips, backlink chips, word count + reading time.

### Visual polish layer
- Per-page accent CSS variable `--page-accent` set via `body[data-screen=...]` data attribute.
- Card hover lift, frosted-glass rails, empty-state helper `renderEmptyState({icon,title,hint,ctaLabel,ctaFn})`.
- Rich toast notifications with actions: `toast({type,title,msg,actions:[{label,onClick,primary}],duration})`.
- Microinteractions: button :active scale, checkbox spring, task completion strikethrough sweep, confetti for High-priority completions, tab/sidebar slide-in.
- Charts: gradient bar fills, draw-in animation, hover tooltips, sparklines in KPI tiles, animated donut fade-in.
- Image lightbox: delegated click handler opens `#lu-lightbox` for any IMG in content surfaces; ← → navigate, Esc closes.
- Shortcuts overlay (`?` key) — `#shortcuts-overlay` with categorized hotkey list.
- Sidebar collapse mode — `body.sidebar-collapsed` shrinks to 56px icons with flyout labels.
- Drawer/modal slide-in via opacity + pointer-events transitions.
- Right-rail shortcuts legend card — auto-appended to every `.rr` and `.notes-rail` via `_renderShortcutsLegend()` hooked into `renderScreen`.

### Other features shipped
- Habits "Not Today" → "Pending" label.
- Bookmark→note linking (missing 'mutation' arg fix).
- RTE colour picker save/restore selection.
- Manus AI provider removed; shared workspace keys via `D.prefs.aiKeys` → server-side `system_settings.aiKey_*`.
- Per-user notification sender via `smtp_imap_accounts.userId` + `oauthSync.adminSaveSmtpImapAccount`. Reverted to admin-shared model since the user wanted one sender for all.
- Selective Contacts import from O365 — `openContactsImportPicker()`.
- Owner auto-promotion to admin in `auth.me` (first-user OR `ENV.ownerOpenId` match).
- All habits reassigned to logged-in user via `reassignHabitsToOwner()` (one-shot localStorage flag).
- `renderMd()` — read-only markdown→HTML renderer used in project descriptions / goal previews.
- Customizable Task Context dropdown (`D.prefs.taskContexts`, `manageTaskContexts()`).
- Image insertion in every RTE via `luRTE_insertImage()` — URL paste or file picker (max 5MB).
- Goal description upgraded to full RTE (`g.descriptionHtml`).
- AI Compose Task Notes / Suggest Subtasks / Project Tasks; Journal 💬 React; Idea AI Feedback.
- Task `titleColor` applied across List/Board/Matrix/Gantt/Calendar/Clusters views.
- Reports page routing fix (SM map was missing `reports:'s-reports'`).
- News ticker wired up (was defined but never called).
- AI Summary modal parse bug fix (over-quoted JSON.stringify in onclick attribute).
- Task `context` field now a customizable dropdown via `D.prefs.taskContexts`.
- Pinned section on Notes list; sticky color dots; thumbnails from first image; backlink chips.

## Remaining work — pending TODO at end of May–9 session

User picked 7 items to ship next (from a Tier 1–4 menu I proposed). Order they were chosen in:

1. **🕸 Knowledge graph view of notes** — new sidebar entry. Force-directed pannable/zoomable graph of every note connected by `[[wiki-links]]` + shared tags. Wiki-link parser exists (search for `\[\[` regex in noteCard / showNoteInEditor). Build a new screen `s-graph` with an SVG/canvas force-layout (simple Verlet integration is fine; ~150 lines). Click a node → `showNoteInEditor(id)`. Pinch/drag pan, scroll zoom. **Wow factor: high.** ~3–4 hours.

2. **⏰ Server-side cron for scheduled reports & themes** — currently `_checkReportSchedules()` only fires on login. Add a Railway-side hourly tick (server already has `setInterval` infrastructure in `server/_core/index.ts` for OAuth-expiry — same pattern). Walks every user with a `userAppData` row whose prefs blob contains `savedReports[*].schedule` with `frequency!=='off'`, renders the report **server-side**, emails via existing `sendEmail`. Render is the hard bit — could call into the existing client renderer headless OR build a server-side mini-renderer that handles KPIs/tables (skip the SVG charts on server emails — fallback to data tables). **Heavy: needs ~2–3 hours, mostly the server render.**

3. **⚡ Performance pass — split the 20k-line `index.html`** — biggest single file is now ~21,500 lines. Initial paint ships the whole thing. Strategy: extract the per-page render code into separate `<script src="...">` chunks loaded async OR inline-but-deferred. Group by feature: `js/notes.js`, `js/tasks.js`, `js/calendar.js`, `js/mail.js`, `js/reports.js`, `js/habits.js`. Core remains in the HTML. Watch out for: hoisting / function reference timing, the many globals used by inline `onclick` handlers. **Could break things** — be defensive with `typeof X==='function'` guards. ~4 hours.

4. **🎓 Onboarding tour (L)** — `HC_TOURS` array already exists in `index.html` with tour definitions. `launchTour()` / `showTourStep()` / `_activeTour` machinery is there. Just needs (a) trigger-on-first-login wiring guarded by `localStorage.lu_tour_v1_done`, (b) polish on the spotlight/overlay UI, (c) updated step targets matching current sidebar IDs (`nav-home`, `nav-myday`, `nav-tasks`, etc.). ~2 hours.

5. **🌤 Dashboard widget variety** — new Home cards:
   - 🌤 **Weather** — `D.prefs.weatherLocation`, call `wttr.in/<city>?format=j1` (free, no key)
   - 💭 **Quote of the day** — local 30-quote rotation seeded by day-of-year (mirror the hero-tagline pattern)
   - 📸 **"1 year ago today"** — mine `D.tasks/notes/journal/ideas` for items completed/created on this date in past years
   - 🧠 **AI Insight card** — call `ai.assist` with "Generate a one-line insight about my workspace performance" once per day, cache in `D.prefs.aiInsightCard.{text,date}`
   - 🎯 **Focus suggestion** — analyse `D.prefs.focusLog` for the user's peak-energy hour, suggest blocking it
   Add to `_homeCardDefs` array. ~2 hours.

6. **🎚 Drag-to-reorder Home widgets** — Home customize already uses the `_homeCardDefs` array with `order` field. Reuse the HTML5 DnD code from `_widgetDragStart/Over/Drop` (in Reports widget) — apply same handlers to each Home card. Save reordered order to `D.prefs.homeCards`. ~30 mins.

9. **🎨 Empty-state illustrations everywhere** — `renderEmptyState({icon,title,hint,ctaLabel,ctaFn})` helper exists. Apply to:
   - Notes list (filtered to zero results)
   - Ideas page when empty
   - Goals page when empty
   - Mail inbox when empty
   - Contacts page when empty
   - Habits when none
   - Journal when none
   ~1 hour total, ~10 min each.

**Skipped (user's call)**: Public sharing links (#2), Knowledge-graph alternative #11 templates marketplace, Accessibility audit (#10), Print stylesheets (#8), PWA (#12).

## Recent commit refs (May 11 2026 onward)

- `e94a033` — right-rail shortcuts legend card
- `63caa4d` — help drawer fix + refreshed articles for new features
- `a8dc171` — four-pack: lightbox + shortcuts overlay + sidebar collapse + drawer animation
- `72c0579` — AI chat assistant + mobile responsive
- `16d658b` — Reports Phase 3: drag/resize + AI builder + pin-to-Home + email schedule
- `1f44acd` — Reports Phase 2: line/heatmap/sparkline/progress + 4 new sources + per-widget range + visual filter
- `a2593f2` — Reports Phase 1: 5-slot widget engine + 10 templates + editor modal + drag-reorder
- `66e9698` — theme engine with profiles + scheduling
- `7882338` — Reports routing fix + saved reports system
- `7bcae37` — visual polish: per-page accents + card hover + empty states + rich toasts
- `9265019` — Notes 8-feature upgrade (thumbnails, breadcrumbs, color tags, etc.)
- `4f0e623` — propagate Notes-style accent to every page

## Useful commands

```sh
git pull --rebase                         # always pull first; manus-agent may have committed
git status                                 # check uncommitted state
git log --oneline -10                      # recent context
git push                                   # only after user says push
```

The local clone lives at `C:\Users\idris\Documents\levelup-second-brain` on the user's home machine.
