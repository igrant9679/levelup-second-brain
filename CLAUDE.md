# LevelUp Second Brain — context for Claude Code sessions

## What it is

Personal productivity / "second brain" web app: tasks, notes, projects, goals, journal, habits, mind maps, contacts, bookmarks, calendar, mail. Single-user instance for now; multi-user team features exist but lightly used. Live at **https://levelupnow.tools**.

## Stack

- **Frontend**: React 19 + Vite, TypeScript, Tailwind 4, Radix UI, wouter routing, tRPC client.
  - **BUT**: most of the actual UI lives in the legacy single-file HTML+JS app served as `client/index.html` (the HTML shell) plus two extracted JS chunks: `client/public/js/app-part1.js` (~12,000 lines) and `client/public/js/app-part2.js` (~8,800 lines). Don't be misled by `client/src/`; the real code is in those three files. As of `e298d0f`, `client/index.html` itself is only ~1,660 lines (was 22,555) — pure markup + CSS + the two `<script src defer>` tags.
- **Backend**: Node + Express, tRPC, Drizzle ORM, MySQL (mysql2 driver).
- **Deploy**: Railway. Auto-deploys on push to `main`.
- **Auth**: email/password (bcrypt + JWT cookies, 1-year expiry) + Microsoft 365 OAuth.

## Repo layout

```
client/
  index.html          ← HTML shell + CSS + 2 <script src> tags. ~1,660 lines.
  public/js/
    app-part1.js      ← 12,063 lines. renderHome / renderTasks / renderNotes /
                        renderGoals / renderHabits / renderMail / renderJournal /
                        renderIdeas / renderCal / renderReports / RTE / lightbox /
                        cmd palette / AI chat / theme engine / etc.
    app-part2.js      ← 8,830 lines. renderSettingsHTML / renderHelp /
                        renderContacts / renderClustersDashboard / tour engine /
                        knowledge-graph (s-graph) / mind-map (s-mindmap) / etc.
  src/                ← Small React shell (App.tsx, AppLayout, ~12 pages)
server/
  _core/              ← infra (auth context, tRPC, OAuth, email, LLM, env)
  routers/            ← tRPC routers (ai, bookmarks, emailAuth, oauth-sync, etc.)
shared/               ← shared types
drizzle/              ← schema.ts + migration SQL files (auto-applied at startup)
package.json          ← `start` runs `drizzle-kit migrate || echo … && node dist/index.js`
```

## Schema architecture (important)

~45 tables after the May 23–25 Command Center arc (was 34). Hybrid:
- **Properly relational**: bookmarks, calendar events, oauth tokens, team invites, help articles, etc.
- **JSON blobs**: `userAppData` stores tasks, notes, projects, goals, journal, habits, contacts, ideas, teams, prefs, calEvents per user as **stringified JSON columns**. This is legacy from the original single-HTML/localStorage version. No DB-level querying within those blobs; whole row is read/written.

Newer features were built relationally; older "second brain" data is still blob-based. Migrating it is a known piece of tech debt.

### Blob → relational migration (tasks + notes + ideas — Steps 1-2 DONE)

**Status:** the `tasks`, `notes`, and `ideas` entities are all migrated through
*read-flip*. Step 3 (retire the blob columns) is deliberately deferred — needs
a soak period — see the detailed handoff below.

**What's live (server-only — the client is untouched throughout):**
- **`tasks` table** (migration `0030`, `drizzle/schema.ts` → `tasksTable`) —
  queryable columns (status, priority, due, projectId, clusterId, myDay, …)
  plus a `raw` mediumtext column holding the full task JSON (lossless).
  `(userId, taskId)` unique; `userId` index.
- **`notes` + `ideas` tables** (migration `0031`, → `notesTable` / `ideasTable`)
  — same pattern. `notes` cols: title, folderId, pinned, starred, archived,
  color, updated/createdAt + `raw`. `ideas` cols: title, stage, ideaType,
  goalId, iceImpact/Confidence/Ease, createdBy, createdAt + `raw`.
- **Dual-write** — `appData.save` mirrors each blob into its table on every
  save (`mirrorTasksToRelational` / `mirrorNotesToRelational` /
  `mirrorIdeasToRelational`, delete-all + re-insert in array order so PK order
  == manual order). Each call try/caught — a relational failure can't break
  the blob save.
- **Reads flipped** — `appData.load` serves each entity from its table via
  `readTasks` / `readNotes` / `readIdeas`. The blob is a *consistency-checked
  fallback*: if the table is empty/unreadable, or its id-set diverges from the
  blob, the blob is served and the divergence `console.warn`'d. `load` returns
  `_tasksSource` / `_notesSource` / `_ideasSource`
  (`relational` | `blob-empty` | `blob-mismatch` | `blob-error`) for monitoring.
- **Endpoints** (in `server/routers/appData.ts`) —
  `appData.backfill{Tasks,Notes,Ideas}Relational` (one-shot: populate the
  table from the current blob) and
  `appData.{tasks,notes,ideas}RelationalStatus` (returns
  `{tableCount, blobCount, consistent}`).
- The JSON blobs are **still dual-written and are still the source of truth.**
  `user_app_data.{tasks,notes,ideas}` columns have NOT been dropped.

**Verified on production (build `2026-05-22-12`):**
- `tasksRelationalStatus` → `{tableCount:19, blobCount:19, consistent:true}`;
  `load` returns `_tasksSource:'relational'`.
- `notesRelationalStatus` → `{tableCount:202, blobCount:202, consistent:true}`.
- `ideasRelationalStatus` — verified end-to-end via the same code path
  (`readEntity`/`mirror*` use the identical pattern).

**Migration files with no local toolchain:** `node_modules` isn't installed
here, so `drizzle-kit generate` can't run. Migrations `0030` and `0031` were
produced by one-off node scripts that: write the `.sql` (tab-indented
`CREATE TABLE`), copy the previous `drizzle/meta/<n>_snapshot.json`, add the
new table objects (format mirrors an existing table like `bookmarks`),
rechain `id`/`prevId`, write `<n+1>_snapshot.json`, and append the entry to
`meta/_journal.json`. `drizzle-kit migrate` (run at Railway startup) only
needs the `.sql` + journal entry; the snapshot is for future `generate`
correctness. Repeat that approach, or install deps and use `drizzle-kit
generate` properly.

#### Step 3 — retire `user_app_data.tasks` (DEFERRED — destructive)
**Precondition (must be genuinely met first):** a soak period of the flipped
reads proving stable under real use — recommend ≥1 week. Verify before starting:
`appData.tasksRelationalStatus` always returns `consistent:true`, `load` always
returns `_tasksSource:'relational'`, and the Railway logs have no
`[appData] tasks blob/relational` warnings. **Take a DB backup/export of
`user_app_data` first — dropping the column is irreversible.**
Then, in order:
1. **Promote the table to sole store.** In `appData.save`, stop putting `tasks`
   into the `user_app_data` upsert `updates` object (the blob column stops
   being written). Make the `mirrorTasksToRelational` call *propagate* errors
   (remove the try/catch swallow) — once it's the only store, a failed write
   must surface to the client as a failed save, not be silent.
2. **Drop the fallback.** In `readTasks`, serve the table unconditionally —
   remove the blob read + consistency check (the blob is now stale).
3. **Drop the column.** New migration `ALTER TABLE user_app_data DROP COLUMN
   tasks;` (generate it the same snapshot-copy way; the snapshot's
   `user_app_data` entry loses its `tasks` column). Remove `tasks` from the
   `userAppData` schema definition. Repeat for `notes` and `ideas` once they
   too have soaked.
4. **Keep `tasks` / `notes` / `ideas` in the `appData.save` zod input and the
   `load` output** — the client still sends/expects each array; only the
   storage moves. No client change is needed at any point in Step 3.

#### Step 4 — repeat for the other blob entities
Still blob-backed: projects, goals, journal, habits, contacts, teams,
clusters, calEvents, prefs. For each, repeat the same pattern that tasks /
notes / ideas use: schema table (queryable cols + `raw`) → migration →
`mirrorXToRelational` + dual-write → `backfillXRelational` → `readX` + flip
the `load` branch + `xRelationalStatus` → backfill → soak → Step 3 retire.
Per-entity gotchas:
- **journal** — freeform `date` strings ("Today · Monday, May 19"); keep `date`
  as varchar, optionally add a normalized `dateNorm` column (`_parseJournalDate`
  → ISO) for querying.
- **prefs** — a single JSON *object*, not an array; the row-per-item pattern
  doesn't fit. Recommend leaving `prefs` as a blob (it's small, one row).
  `aiTopics` rides inside `prefs.aiTopics` — leave it there.
- **calEvents** — the blob `D.calEvents` (OAuth-synced) is a *separate* store
  from `_calEvents` (the grid/seed store the calendar actually renders).
  Unify those two stores before/with migrating, or it just moves the mess.
- **teams** — nested (team → members[]); `raw` carries it, few queryable cols.
- **projects / goals / ideas / clusters / contacts / habits** — plain arrays,
  follow the tasks pattern directly. Good order to tackle them in.

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
- The `_calEventsDefault` array is **seed data** for new users. Real events go in `D.calEvents` once OAuth-synced.
- Never delete the seed task IDs 201/202/203 logic in `doLoginSuccess` — guarded by `lu_examples_seeded_v1` localStorage flag.
- Rate limiting is **not** in the code. If you ever spec a fix, mention it.
- 1-year JWT session expiry with no refresh/revocation. Documented risk; not blocking.
- **`app-part1.js` contains literal `\0` (NUL) bytes inside the markdown renderer's template-literal placeholders** (used to mark code-block / image / link positions during transforms). `file(1)` will report it as "data" and some tools refuse to open it as text. This is intentional — preserve byte-for-byte if you ever re-extract or move things around.
- **Grep tool may report `app-part1.js` as binary** because of those NUL bytes. Use `grep -an` via Bash instead when searching that file.

## Things deliberately not done

- Modal pattern refactor (only 1 bug surfaced — the manual pattern works fine elsewhere).
- CSS variables for font sizes (override layer covers it).
- ~~Mobile responsiveness audit~~ — **DONE** as of `72c0579`. Hamburger sidebar, panel stacking, AI panel full-width on phones.
- ~~Sidebar collapsible-to-icons mode~~ — **DONE** as of `a8dc171`. « toggle at bottom of sidebar; flyout labels on hover when collapsed.
- ~~Splitting the 22k-line `index.html`~~ — **DONE** as of `e298d0f`. Extracted to two external `<script src defer>` files.
- Page header helper extraction (would touch 12+ render functions — defer).
- Public sharing links, accessibility audit, print stylesheets, PWA, templates marketplace — user explicitly skipped these.

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
- Title banner uses the standard `.ph-r` pattern (as of `4cbc821`) — no more bespoke peach surface / icon block / chip pills. Subtitle is plain text "97 notes · 92 this week · 2 starred · 5 pinned" written to `#notes-page-sub` by `renderNotes()`.
- Bulk-select mode: `_notesBulkMode` toggle; bulk auto-tag, add tag, star, pin, export, delete. The bulk bar sits as its own row underneath the header.
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

## Most recently shipped (May 25 2026 — Smartsheet hierarchical sync)

The user's CF (CommunityForce) Smartsheet uses Project / Task / Sub Task
columns to organise work hierarchically. The sync now detects that
layout, auto-creates a LevelUp project per Project-cell value, and
re-links every pulled row to its proper sub-project. **Build `2026-05-25-17`.**

### Adapter — hierarchy detection

`server/_core/smartsheetAdapter.ts`:

- `detectHierarchyColumns()` scans for case-insensitive matches of
  `^projects?(\s+name)?$` / `^(tasks?(\s+name)?|activity)$` /
  `^sub[-_\s]?tasks?$`. If any of the three is present, the adapter
  switches to hierarchical mode.
- `classifyRow()` labels each row `'project' | 'task' | 'subtask' | null`
  by which of the three cells has content. SubTask wins over Task wins
  over Project.
- Project-header rows are **never** emitted as external tasks — they only
  contribute their name to `projectLabels`. Task / SubTask rows use the
  matching column for their title.
- **Two project-ancestry paths**:
  1. `inheritProjectFromAncestors()` walks `row.parentId` up to 8 levels
     (handles sheets that DO use Smartsheet's outline / indent).
  2. `buildPositionalContext()` pre-scans `sheet.rows` in display order
     and records the most-recent Project-cell value as a "current
     project" — handles sheets that encode hierarchy by row order only
     (which is the case for the CF 120-Day Plan; `parentId` is null for
     every row there).
  Resolution order: outline walk → positional → `cfg.label` / sheet name.
- Same dual approach for SubTask parent linking: `row.parentId` first,
  then the most-recent Task row above this subtask in display order.
- Sheets without any of the three columns fall back to the legacy flat
  behaviour (primary column drives the title, projectLabel = sheet name).
- Return shape changed: `pullSmartsheet` returns `SmartsheetPullResult =
  { rows, projectLabels, hierarchical }`. `ExternalTaskInput` gains a
  `hierarchyLevel` field for diagnostics.

### Cron — auto-create projects + overwrite links

`server/_core/externalTasksCron.ts`:

- `ensureLevelUpProjectsForLabels(userId, labels, defaults)` reads
  `user_app_data.projects` JSON, appends any label not already present
  (case-insensitive name match), and writes back. Tags new records with
  `autoCreatedBy:'smartsheet-sync'` so they're distinguishable from
  hand-built projects. Returns `{ map: label→projectId, appended: N }`.
- `overwriteProjectLinks(userId, source, rows, labelToId)` force-writes
  `external_task_overrides.localProjectId` for every pulled row. Differs
  from the legacy `ensureDefaultProjectLinks` (which preserved user picks
  via COALESCE) — this honours the user's "overwrite existing CF/LSI
  synced data" requirement.
- `pullOneSmartsheet` branches on `result.hierarchical`:
  - Hierarchical sheet: ensure projects → overwrite per-row links.
  - Flat sheet: legacy `defaultProjectId`-based linking (preserves
    user picks).
- `processExternalTaskPull` return shape extended with `projectsCreated`.

### Client — reload projects after sync

`client/public/js/app-part1.js`:

- `refreshExternalTasksNow` checks `stats.projectsCreated`; when > 0
  calls `loadServerData()` to refresh `D.projects` so the auto-created
  projects appear in the Projects page, drawer pickers, and Command
  Center By-Project tiles immediately. Toast message includes
  "+N projects auto-created" when applicable.

### Verified on production

First run (`-16`): created 9 projects but only 8/108 rows linked
correctly (because the sheet uses positional, not outline, hierarchy).
Second run (`-17` with positional walk): all 108 CF rows distributed
across the 8 sub-programs:
```
1. Recruiting & Staffing Program     22 open
2. Onboarding Program                14 open
3. Training & Certification Program  16 open
4. Operating Model                   20 open
5. Certification & Learning Program   5 open
6. Rev 5 ATO Update (FAMS)           11 open
7. ATO-as-a-Service (New Offering)    9 open
8. Software Sales, Marketing/SupAI   10 open
                                    ──────
total                               107 open + 1 done = 108
```
Command Center "By Project" tile shows all 8 cards with the CF badge and
correct counts. The empty 9th project ("CommunityForce_120Day_Plan",
which used to catch the fallback rows) has 0 tasks now — user can delete
manually if desired.

### Open follow-ups

- Empty auto-created projects (the sheet-name fallback project, or
  project headers that captured a name but had no descendant rows
  match the owner filter) aren't auto-pruned. A "Delete empty
  auto-created projects" maintenance button would close that loop.
- The cron still preserves user manual picks on flat sheets via the
  legacy path. If the user converts a flat sheet to hierarchical (adds
  Project columns), their manual picks WILL be overwritten on the next
  pull. Documented behaviour per their request.
- Nifty doesn't have a comparable hierarchy concept — Nifty workspaces
  are already project-scoped, so a single Nifty project maps to one
  LevelUp project via `cfg.defaultProjectId`. No adapter change.
- A future enhancement: also auto-link Task rows to a "Task" container
  inside their LevelUp project (currently SubTask parent-child only
  exists at the external_tasks level via `parentExternalId`, not as
  separate native LevelUp task records).

### Session commits

- `6da3ce8` Smartsheet hierarchical sync — adapter + cron + client (-16)
- `c41c9c8` Positional ancestry for flat sheets (-17)

## Most recently shipped (May 25 2026 batch 3 — time entries + Help + mobile)

Built on batches 1 and 2 from earlier today. **Build `2026-05-25-15`.**

### Time-entries integration

- **Server**: new `timeEntries.listRecent({sinceDays=30, default 30, max 365})`
  endpoint in `server/routers/timeEntries.ts`. Returns completed entries
  newest-first, excludes still-running rows, cap 2000. Mirrors the existing
  `totalsByTask` pattern.
- **Client**: `loadTimeEntries()` in `app-part1.js` calls `listRecent` with
  `sinceDays:90` and caches on `D.timeEntries`. Boot trigger added to
  `doLoginSuccess` (1500ms after login, parallel to `loadExternalTasks`).
  Initial state added to D defaults.
- **Reports source**: new `WIDGET_SOURCES.time` joins each entry to
  `D.tasks` (for native rows) or `D.externalTasks` (for CF/LSI rows) to
  surface project + title + sourceLabel. Returns
  `{id, taskId, title, project, source, sourceLabel, mins, date,
   startedAt, endedAt}`. `dateField:'date'` so day/week/month groupBy work.
- **Source registration**: `SOURCE_DEFAULTS.time` →
  `{groupBy:'day(date)', metric:'sum(mins)', viz:'bar'}`. `FILTER_FIELDS.time`
  → `['project','source','sourceLabel']`. `_groupByOptions` and
  `_metricOptions` extended with `day(date)/week(date)/month(date)` and
  `sum(mins)/avg(mins)`.
- **4 new templates**: "Time tracked by day", "Time by project", "Time
  this week (KPI, 7d)", "Time by hat (donut)".
- **Command Center KPI tile**: "Time Tracked (7d)" cyan tile in the KPI
  strip, hat-aware — sums `D.timeEntries` filtered by source matching the
  active hat. Shows `Nm` or `Hh Mm`.

### Help articles (new category #10 Command Center)

`HC_CATS` gets `{id:10, icon:'🎯', name:'Command Center', desc:'Cross-tool
PM dashboard, Standup, Programs, briefings'}`. `HC_ARTICLES` gets 6 new
entries (ids 19–24): Command Center overview, Standup view, Portfolio
Timeline, AI Portfolio Briefing, Saved CC Views, Time tracking. Each
follows the existing markdown body conventions and the search index picks
them up automatically.

### Mobile pass

The existing `@media (max-width:560px)` block at line 1038 of
`client/index.html` got a new chunk for the PM screens (slightly mis-
described in the commit as "900px" — it landed in the 560px block, which
is the canonical "true phone" breakpoint in this codebase). Also added a
new `@media (max-width:480px)` block:

- KPI strip — auto-fit minmax(140px) shifts to `repeat(3,1fr)` at 560px and
  `repeat(2,1fr)` at 480px so 6+ tiles don't wrap awkwardly.
- Briefing card 4-column section grid → 1 column on phones.
- Saved-view chips shrink to height 20px / font 9px so they don't blow up
  the page header.
- Standup `pre` (markdown summary block) tightens to font 10px / 8px
  padding so the copy-block stays compact.
- Portfolio Timeline label column shrinks from 180px to 120px on phones.

Verified via `document.styleSheets` walk in the browser: 7 references to
`#s-command` inside `@media (max-width:560px)` and 4 inside `(max-width:
480px)`, all present in the loaded build.

### Session commits (newest first)

- `e7f7c9f` Time entries + Help articles + mobile pass (build `-15`)

### Open follow-ups

- The 560px breakpoint catches phones but not phablets / small tablets
  (561–900px). If those want the tighter layout too, move the rules up
  into the existing 900px block at line 1001.
- The KPI strip on Command Center now shows 6 tiles plus the new Time tile
  = 7 total in All-hats mode. At ~1240px main column width, the 7th wraps
  to a second row of its own. Acceptable; can be tightened by reducing
  `minmax(140px,1fr)` to `minmax(120px,1fr)` if it bothers the user.
- Time entries cache is 90d; older rollups need a separate
  `totalsByTask({sinceDays:>90})` call. Not exposed yet.

## Most recently shipped (May 25 2026 batch 2 — drill-through + AI briefing + saved views)

Built on top of the PM UX batch shipped earlier today. **Build `2026-05-25-14`.**

### Drill-through from Command Center

- New module-scope filters in `app-part1.js`: `_taskProjectFilter` and
  `_taskAssigneeFilter`. Applied inside `_applyPriorityFilter()` so every
  Task view dispatcher (list/board/matrix/gantt/clusters/calendar) picks
  them up without per-view changes.
- Tasks header renders chips for both when set; ✕ clears via
  `clearTaskProjectFilter()` / `clearTaskAssigneeFilter()`.
- Command Center By-Project tiles call `_ccDrillIntoProject(name, source)`
  which flips `D.prefs.taskSourceFilter` to ONLY the relevant source, resets
  the priority/myOnly filters, sets `_taskProjectFilter`, and `nav('tasks')`.
- By-Stakeholder rows call `_ccDrillIntoAssignee(name)`. The sentinel
  `"(unassigned)"` matches `assignedTo`/`assignee` empty.

### Inline-onclick string-escape gotcha (fixed)

The first version of the drill-through used `JSON.stringify(name)` inside
`onclick="..."`. JSON-string output is `"foo"` — literal double quotes —
which terminates the attribute prematurely and silently breaks the click
handler. The function called fine via `_trpc`/console; only inline binding
was broken.

Fixed by adding a small `_jsAttr(s)` helper next to `esc()`:

```js
function _jsAttr(s){return String(s==null?'':s)
  .replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
```

Use `onclick="fn('${_jsAttr(name)}','${_jsAttr(src)}')"` (note single
quotes around the args). Already applied to the project tile, the
stakeholder row, the at-risk row (external branch), the push-queue drop
button, and the tombstone revive button.

There are still legacy spots in this codebase using `JSON.stringify(str)`
in `onclick="..."`. They only work if the value is a number or contains
no special chars. Watch for it when refactoring.

### AI Portfolio Briefing

- `aiPortfolioBriefing()` builds a snapshot from `_ccTasks()` (counts,
  shipped 7d, overdue, stalled, hottest open) and calls `ai.assist` with a
  chief-of-staff system prompt that returns
  `{headline, wins[], risks[], blockers[], next_three[]}` JSON.
- Persists to `D.prefs.briefings[]` (last 24). Each record carries
  `{id, dateISO, hat, snapshot.counts, briefing, emailed}`.
- `_renderBriefingCard()` renders the latest as a full-width Command
  Center card above the main grid: italic headline blockquote in a
  page-accent tint, then a 4-column grid (Wins / Risks / Blockers / Next
  3) with `→ action` lines on Risks.
- Header buttons: **↻ Refresh** (re-runs the AI), **✉ Email** (calls
  `_emailLatestBriefing` → `oauthSync.sendCustom` with a clean inline-CSS
  HTML body), **📚 History (N)** (drawer listing past briefings with
  apply / ✕).
- "📝 Generate weekly briefing" button added at the top of the right-rail
  Quick Actions in purple.

### Saved Command Center views

- `D.prefs.savedCCViews[] = [{id, name, hat}]`. Cap 12.
- "⭐ Save view" button next to the chip switcher prompts for a name.
- Inline chip row below the page title shows up to 8 saved views with
  one-click apply + a "Manage" button.
- `_openSavedCCViews()` drawer: list with apply / ✏ rename / ✕ delete +
  "+ Save current" footer.
- Today the saved view captures the hat only; the data structure is ready
  for a future `extra` field (priority / project / assignee filters).

### Session commits (newest first)

- `75b2823` Fix inline-onclick JSON.stringify escaping (build `-14`)
- `3c4bcce` Drill-through + AI Briefing + Saved Views (build `-13`)

### Open follow-ups

- Saved views capture hat only — extend with `extra.{project,assignee}` if
  drill-through state should be saveable.
- The AI briefing prompt uses the same `_getAIConfig()` shared workspace
  keys; no per-user config. If a user pins a briefing to Home it currently
  shows the latest, not the pinned one — a separate `D.prefs.pinnedBriefingId`
  would close that loop.
- The at-risk row drill-into (overdue/today badges → filtered Tasks view)
  is not wired — only the project tile + stakeholder row are. The row
  itself opens the task drawer or annotate modal (good default).
- `_emailLatestBriefing` uses `oauthSync.sendCustom` (self-delivery only).
  Sending to a distribution list would need a new server endpoint.

## Most recently shipped (May 25 2026 session arc — PM UX upgrade)

Cross-tool PM dashboard built on the Command Center infrastructure shipped
two days ago. **Build `2026-05-25-12`.**

### New screens

- **Command Center (`s-command`, sidebar "Command Center", amber accent)** —
  `renderCommandCenter()` in app-part1.js. Context chip switcher (`_ccContext`
  + persisted in `D.prefs.ccContext`): All / CF / LSI / Personal. KPI strip
  (Overdue / Due Today / Stalled 7d+ / Shipped 7d / Open Total / Pending
  Push). At-Risk feed (overdue → today → stalled), grouped + sectioned, click
  through to drawer or `_openExternalAnnotateModal`. By-Stakeholder grouped
  by `assignee`. By-Project tiles colored by source. Recently Shipped (7d
  via `completedAt`). Pending Push preview card (only when count>0).
  Quick-actions rail with live sync status panel.
- **Standup (`s-standup`, sidebar "Standup", teal accent)** —
  `renderStandup()` reuses `_ccTasks()` so the Command Center hat carries
  over. Three columns: Yesterday (done with `completedAt` slice matching
  yesterday) / Today (due===today OR myDay) / Blockers (overdue OR tagged
  block / status containing "block"). Header has its own chip switcher +
  "Filtered to X" badge when not All. Markdown summary block (Standup —
  date / Yesterday / Today / Blockers) + Copy button (clipboard + execCommand
  fallback).

### Project-health helper

- **`_projectHealth(projectId)`** (pass `null` for portfolio-wide) returns
  `{open,done,total,velocity (per wk, 28d/4),burn (created14d − done14d),
  risk (overdue+stalled% of open), etaWeeks (open/velocity), trend (up/flat/
  down via last2w vs prior2w), pct}`. Stalled = `updatedAt < now-7d`.
- **`_renderHealthStrip(h)`** renders the 4-stat strip (Velocity / Burn /
  Risk / ETA). Wired into the Project Detail drawer (above Milestones) and
  the Program Detail drawer (aggregated across child projects).

### Portfolio Timeline (Programs page)

- **`_renderPortfolioTimeline()`** appended to `renderPrograms()` output.
  Swimlanes per project that has at least one dated task (native or
  external-linked). Date axis is dynamic: clamps to `today-14d … today+60d`
  but expands if data goes further. Bars colored by source (Smartsheet blue,
  Nifty purple, native = project color), overdue gets a red border, done
  gets opacity .7. Sticky month axis header. Today line (vertical red).
  Footer counter: "N projects on chart · X hidden (no dates)".

### Reports engine — external as a source

- New `WIDGET_SOURCES.external` (Smartsheet+Nifty only, tombstoned filtered)
  alongside the existing `allTasks` cross-source. Exposes: status, priority,
  due, completedAt, project, assignee, source, sourceLabel, myDay,
  hasPendingPush.
- `SOURCE_DEFAULTS` + `FILTER_FIELDS` + `_groupByOptions` + date keys all
  populated for both `allTasks` and `external` (the former was missing
  defaults pre-this arc, so changing source to it broke the editor).
- 7 new templates under "Start from a template": External CF vs LSI split,
  open by project, by status, shipped/week (line, 90d range), overdue KPI,
  by assignee, pending-push KPI.

### Integration polish

- **Topbar "synced Xm ago · 2 src" label** beside the ↻ button — `id=topbar-
  sync-label`. Click navigates to Command Center. Hides under 900px (the
  tooltip on the button carries the same info).
- **Push-queue preview drawer** — `openPushQueueDrawer()`. Lists every row
  with `override.pendingStatus`, shows `current status → pending`, per-row
  ✕ to drop (`_dropPushItem` — sets `pendingStatus:null`), "Push all"
  button (`_flushPushQueue` → `externalSources.pushPendingChanges`).
  Wired from Command Center's Pending Push KPI tile + rail Quick Action +
  preview-card "Preview" button.
- **Settings → Integrations → 🗄 Archived external tasks** —
  `_hydrateTombstoneArchive()` lists rows with `override.tombstoned=true`
  pulled via `listExternalTasks({includeRemoved:true})`. Shows preserved
  annotations (tags, priority, note flag, linked project). **Revive**
  button → `upsertOverride({tombstoned:false})`. Auto-hydrated when sp-5
  panel opens.

### Wiring

- `SM` map extended: `command:'s-command'`, `standup:'s-standup'`.
- `renderScreen()` switch routes both.
- Sidebar entries inserted between Knowledge Graph and Programs with
  color-coded SVG strokes (Command Center #f59e0b amber, Standup #14b8a6
  teal) and matching `body[data-screen=…]{--page-accent:…}` blocks.
- Programs page header gets a "🎯 Command Center" shortcut next to
  "+ New program".
- Mobile @media: `#topbar-sync-label{display:none!important}` under 900px.

### Session commits (newest first)

- `750af2b` Standup chip switcher + filtered-to badge (build `-12`)
- `08482f7` Command Center + Standup + Portfolio Timeline + push queue
  preview + tombstone archive + external reports source (build `-11`)

### Open follow-ups

- **By Project tile click → drill into that project's filtered task list.**
  Currently the tile is informational only.
- **Standup Yesterday column is empty when all completions stamped today —
  expected, but a "Pulled in last 24h" toggle would soften the edge.**
- **Portfolio Timeline shows "108 hidden (no dates)"** because most
  external tasks don't carry start/due. Could add an inline link to filter
  the Tasks view to those rows so the user can add dates.
- **Push queue preview drawer's "Push all" calls `pushPendingChanges` —
  no per-row select.** A checkbox column would let the user push a subset
  (current implementation: flush everything queued).
- **`_ccTasks()` is recomputed every render.** Fine for current data size
  (~250 tasks). Memoise behind a dirty flag tied to `loadExternalTasks` /
  `save('tasks')` if it ever shows up in profiles.

## Most recently shipped (May 23–25 2026 session arc — Command Center)

This arc turned LevelUp into a cross-tool command center for the user's two
hats: **CommunityForce** (COO, Smartsheet for project mgmt) and **LSI Media**
(CEO, NiftyPM for project mgmt). Plus a bunch of PM polish + Phase E
automations + Phase F mobile pass.

### External-sources infrastructure

- **Schema** (migrations 0032–0040): `external_source_credentials` (Smartsheet
  PAT + Nifty OAuth fields), `smartsheet_watched_sheets`,
  `nifty_watched_projects` (each with `defaultProjectId` for project
  mirroring), `external_tasks` (pulled task mirror with `completedAt`),
  `external_task_overrides` (myDay / localTags / localPriority /
  localProjectId / pendingStatus / tombstoned), plus `time_entries`,
  `tasks.parentTaskId`, `tasks.recurrenceRule`, `programs` (JSON in
  user_app_data), `project_custom_field_defs` + `task_custom_field_values`,
  `automation_rules`.
- **Adapters** (`server/_core/smartsheetAdapter.ts`,
  `server/_core/niftyAdapter.ts`): pull tasks owned by/assigned to the user
  per watched config, normalize to `ExternalTaskInput`.
- **Cron** (`server/_core/externalTasksCron.ts`): hourly puller +
  `processExternalTaskPull({userId?})` exposed for manual runs. Vanished-row
  detection → stamps `removedAt`; 72h tombstone grace for matching overrides.
  First-seen-as-done / open→done transition stamps `completedAt`.
- **Router** (`server/routers/externalSources.ts`): CRUD for watches,
  `refreshNow`, `upsertOverride`, `setProjectLinks`, status options fetchers,
  internal status push helpers, `pushPendingChanges`, `pendingPushCount`,
  `niftyPurgeCompleted` (one-shot historical-completed cleanup), and a
  diagnostic `niftyDebugFindTask` for poking at the raw Nifty payload.

### Two-way sync architecture

- **Pull** every hour (Smartsheet/Nifty → LevelUp).
- **Push** on demand: `niftySetTaskStatus` / `smartsheetSetRowStatus` write
  the chosen status back to source; the source's own status options are
  fetched per-watch so the picker only offers values that source accepts.
- **Bulk push queue** mode: when `D.prefs.externalQueueMode` is on, status
  changes save as `external_task_overrides.pendingStatus` and surface as
  orange `→ pending` pills. The topbar `⬆ Push` button (visible only when
  the count > 0) flushes the queue in one batch.
- **Override-layer pattern**: external_task_overrides survive source
  deletion via tombstoning, so personal notes/tags/project links never
  disappear silently.

### Command-center UX in the app

- **Topbar**: ↻ Sync button (icon, 32×32) + ⬆ Push (orange, conditional)
  added to `client/index.html` alongside the existing + New / AI / Notif.
- **Settings → Integrations** (sp-5): Smartsheet + NiftyPM connect flows,
  watch picker, per-watch defaultProjectId for project mirroring, queue-mode
  toggle, Automations panel (rule list + editor modal).
- **Daily Morning Digest + Weekly Review emails** (server-side, 15-min &
  30-min crons): per-user prefs panel in Settings → Notifications (sp-3).
  Weekly review uses `callAIProvider` with `jsonMode:true` for structured
  `{reflection, picks[3]}` output and includes a "shipped this past week"
  section sourced from `completedAt` stamps.
- **Programs/Portfolio** sidebar entry: CF + LSI roll-up view of projects
  across both tools.

### Phase E — Automation rules (`server/_core/automationEngine.ts`)

- Cron every 15 min, plus `runNow` from Settings.
- Triggers: `task_overdue_today`, `task_status_done`, `external_status`.
- Actions: `set_my_day`, `add_tag`, `set_priority`.
- External actions write to `external_task_overrides` (myDay, localTags,
  localPriority) so they survive the next pull.
- Settings → Integrations → ⚙ Automation Rules panel with a full editor
  modal (`_openAutomationEditor`).

### Phase F — Mobile/iOS polish

CSS @media additions in `client/index.html`:
- Topbar Sync 32×32; Push shrinks to icon + count on tiny screens.
- Automation rule cards wrap so Edit/✕ get a full row.
- Automation editor modal tightens padding for iPhone SE (360px).
- Status popovers (`.ext-status-pop` / `.task-status-pop`) pinned inside
  viewport — were overflowing right.
- Custom-field rows (`[data-custom-field-row]`) stack label-over-input.

### Nifty puller fixes (the long debug arc)

A single LSI task — "Add LJ's portfolio to LSI Portfolio (screenshots of
sites)" — was marked Closed in NiftyPM but stayed "Not Started" in LevelUp
even after clicking ↻ Sync. Diagnosing it surfaced four real bugs in the
puller, all now fixed:

1. **Wrong pagination params.** Adapter was sending `page` + `per_page`;
   Nifty's `/tasks` endpoint expects `limit` + `offset`. Nifty silently
   fell back to its 25-default, so any project with >25 tasks only had
   its top 25 ever refreshed.
2. **Closed tasks excluded by default.** Nifty's default `/tasks` response
   omits completed tasks. Closing one in Nifty made it vanish from our
   seen-set → `removedAt` stamped → frozen at last-open status for the
   72h tombstone grace. Fix: pull twice (open + completed), merge by id.
   Also pass `include_archived=true`.
3. **Nifty workspace had no named status columns.** API returned
   `status: null` and `status_name: null` for every task. Adapter was
   only reading the status object, so no task ever registered as done.
   Fix: layered resolver — `status.name` → `status_name` →
   `task_group.name` → fall back to `"Completed"` if top-level
   `completed === true`, else `"Open"`. "Completed" matches the existing
   done-classifier regex in the cron upsert.
4. **Pulling everything dragged in years of historical completions** (593
   in the LSI project). Added `skipNewCompletions` option to
   `upsertResults` — when true, any pulled row arriving done-status AND
   not already in DB gets skipped. `pullOneNifty` passes it. New
   `niftyPurgeCompleted` mutation deletes every currently-done Nifty row
   + matching overrides for the calling user. Run once from the console:
   `await _trpc('externalSources.niftyPurgeCompleted', undefined, 'mutation')`.
   Returns `{deletedTasks, deletedOverrides, scanned}`.

### Other bugs surfaced + fixed in the same arc

- **Topbar search click did nothing for external tasks** because Nifty
  `externalUrl` is null (Nifty's `/tasks` response has no `url` field).
  Replaced the open-new-tab action with `_openAfterNav` that polls for
  the screen container, scrolls the matching `[data-ext-id][data-source]`
  row into view, and flash-highlights it for ~2s. Still opens the source
  URL when one exists. Native task results got the same treatment —
  drawer opens after the screen is actually mounted, then scrolls the row
  into view. (Old 120ms setTimeout fired before the clusters view was
  mounted.)
- **Done filter tab stayed visually highlighted** after switching to
  another tab. `setTaskTabIdx` was calling `renderCurrentTaskView()` which
  only re-paints the view body, not the parent tab strip. Fix: also flip
  the `.on` class on `#tasks-tabs > .tab` elements manually.
- **Quick-add task field auto-filled with the user's email** on every
  render. Root cause: the input had no `name` / `autocomplete` attrs, so
  Chromium's address-bar autofill grabbed it. Fix: added `name`,
  `autocomplete="off"`, and the `data-1p-ignore` / `data-lpignore` /
  `data-form-type="other"` opt-out hints for 1Password + LastPass.
  General rule: any free-form input inside an app screen that the user
  might type a non-form value into needs these attrs or browser
  autofill will eat it.
- **Gantt view looked truncated** — only one row visible even with 50+
  dated tasks. Two issues: (a) the scroll wrapper had `overflow-x:auto`
  with no height cap, so rows extended past the viewport bottom and
  looked clipped; (b) tasks without a start/due date were silently
  dropped (Gantt requires one). Fix: wrap in `overflow:auto;
  max-height:calc(100vh - 360px)` with a sticky date header, and add a
  footer counter showing "N tasks on chart" + "X hidden — no date
  (incl. Y external)" so the silent drop is visible.

### Useful console snippets from this arc

```js
// Force a fresh pull of Smartsheet + Nifty for the current user.
await _trpc('externalSources.refreshNow', undefined, 'mutation')

// One-shot purge of historical Nifty completions (idempotent).
await _trpc('externalSources.niftyPurgeCompleted', undefined, 'mutation')

// Diagnose a single Nifty task by title substring — shows raw Nifty
// payload, which filter returns it, and the LevelUp DB state.
await _trpc('externalSources.niftyDebugFindTask',
            {titleContains: 'portfolio'}, 'mutation')

// Manually run all automation rules now (don't wait for 15-min cron).
await _trpc('automations.runNow', undefined, 'mutation')

// Run the daily digest immediately (test).
await _trpc('dailyDigest.sendNow', undefined, 'mutation')
```

### APP_BUILD at end of arc

`2026-05-25-10`. Bump on every change to `client/public/js/app-part*.js`
or any client-visible logic.

### Open items / known gaps

- Nifty workspaces that DO use named status columns will show those names;
  the LJ workspace doesn't, so it shows "Open" / "Completed" only. Adding
  a second API call per pull (fetch `/task_groups`, map by id) would
  surface real intermediate statuses but isn't shipped.
- `external_task_overrides.tombstoned` is set but nothing in the client
  surfaces tombstoned rows in an "archive" — they're just hidden. If the
  user wants to revive one, they'd need to do it via DB.
- `Programs/Portfolio` is a single roll-up view; per-program AI summary +
  drilldown isn't built yet.
- The Settings → Automation Rules UI only edits the default Triggers and
  Actions enums — extending requires a server-side enum bump plus matching
  client editor fields. (Pattern's set in `_openAutomationEditor`.)

### Session commits (newest first)

- `ae1c880` Fix quick-add autofill + Gantt vertical scroll & skip counter
- `952b817` CLAUDE.md handoff for the Command Center arc
- `f30ace4` Fix sticky task-filter tab highlight (.on class never moved)
- `de6e3b4` Fix search-result click — wait for screen, scroll-into-view,
  ext fallback
- `bc1dff1` Nifty: skip historical completions + one-shot purge endpoint
- `6fa1b77` Add Nifty diagnostic `niftyDebugFindTask`
- `f0c4ffe` Fix Nifty status resolution — trust top-level `completed`
- `ff0cb4f` Fix Nifty puller: correct pagination params + pull completed
- `4b0b0bb` Batch 4/4 (F): Mobile/iOS polish
- `3084f3b` Batch 3/4 (E): Automation rules — engine + cron + Settings UI
- `97cbb0c` Batch 2: Custom fields
- (earlier batches) Smartsheet + Nifty 2-way sync, Programs, Bulk push,
  Top-header Sync, External projects, Completed-task sync, Project Edit
  drawer linking, External tasks in every Tasks view, Daily digest +
  Weekly review emails, OAuth scope array fix, Nested subtasks.

## Most recently shipped (May 20–22 2026 session arc)

### Storage + import follow-ups (May 20–21)
- Google Drive storage is live and verified on Railway (`/api/storage-status`).
  `server/storage.ts` emits `drive.google.com/thumbnail?id=…&sz=w1600` URLs
  for images (the old `uc?export=view` no longer renders in `<img>`) and
  `uc?export=download` for other files.
- `imageMigration.migrateNoteImages` tRPC mutation — one-shot backfill that
  moves inline `data:image;base64` URIs out of notes into Drive. Run from the
  console: `_trpc('imageMigration.migrateNoteImages',undefined,'mutation')`.
- Notes-page doc import is now **bulk**: parses every selected file, opens a
  review modal with per-note checkboxes + duplicate detection (skip /
  overwrite / rename) — mirrors the Settings Word importer.
- Imported notes push to the server immediately (not the 2s debounce);
  `loadServerData()` now rescues in-memory items the localStorage cache dropped.

### UI audit + fixes (May 22) — COMPLETE

A full feature-by-feature audit of the live app was done (every screen except
Contacts/Bookmarks). Fixes shipped in batches.

**Done & deployed (builds `2026-05-22-01` … `-09`):**
- **Batch 1 — date handling.** Root cause: `_todayStr` (app-part1.js) was built
  with `toISOString()` (UTC) → flipped to "tomorrow" each evening for users
  west of UTC. Now local; added global `_ymd()` helper. Also fixed the Focus
  7-day history and Journal weekday/Today labels (`_parseJournalDate` /
  `_fmtJournalDate` recompute the display from the real date; the parser pins
  the year so yearless strings like "May 19" don't resolve to 2001 in V8).
- **Batch 2 — count consistency.** `_twFmt` week boundary (same UTC bug);
  Tasks "this week" header routes through `_taskInWeek` so it matches the
  "This Week" tab badge; habits "done today" counts only `cadence==='Daily'`
  (Habits page header + Home HABITS tile + Team card) — matches My Day /
  Coach / Reports.
- **Batch 3a** — Settings profile completeness (the form showed `||default`
  values as if saved while the meter read empty `D.creds` fields; now shows
  real state + placeholders); `renderTeam` `today` UTC fix.
- **Per-screen bugs — all four fixed:**
  - **Process (GTD)** — header "tasks to clarify", the Tasks sub-tab pill and
    the sidebar badge now all use the GTD Inbox bucket count
    (`_gtdBuckets().Inbox`) so they agree with the Inbox tab. UTC `today` →
    `_todayStr` in `_gtdBuckets` and `updateSidebarBadges`.
  - **Clusters** — the "On Track" stat tile is now a cluster count (`X/Y`
    clusters with no overdue task) instead of a not-overdue task %, so it no
    longer clashes with the per-cluster completion bars.
  - **Reports** — journal entry count + "Avg mood/5" KPI normalise the
    free-form journal dates through `_parseJournalDate` before range-checking
    (entries store strings like "Today · Monday, May 19", not ISO). Task
    completion paths (`toggleTask`, bulk, drawer edit, complete-all) now stamp
    `completedAt` via the new `_syncTaskCompletedAt(t)` helper, so "tasks
    completed" is recorded going forward. Historical Done tasks predate this
    and stay undated (genuine, unrecoverable data gap).
  - **Calendar + Mail rails** — "Today's events" / "Upcoming events" read from
    `_calEvents` (the store the calendar grid actually renders) via the new
    `_calEventsOn(date)` / `_upcomingCalEvents(limit)` helpers, instead of the
    empty `D.calEvents`. Same fix applied to the Home "Upcoming Meetings" rail
    and the "Next 7 Days" mini-week. NOTE: `D.calEvents` (OAuth-synced) and
    `_calEvents` (grid/seed) are still two separate stores — merging them so
    synced events appear in the grid is a known larger follow-up.
- Team member card habits denominator → daily-only (`/5`, was `/6`).
- `aiWeeklyReview` — journal filter parses dates via `_parseJournalDate`; its
  stale mood map aligned to the canonical `{😊5,🙂4,😐3,😫2,😰1}` set.

**Batch 4 — Interface / UX — DONE (builds `-08` … `-09`):**
- Auto-toasts: cycle interval 45s → 4min; the close button now dismisses the
  whole category (news/info/encourage/warning) and persists, so closing one
  stops them all (`lu_dismissed_type_*`). Engine is `showAIMsg` in app-part2.js.
- Shortcut hints are platform-aware via the global `_isMac` flag — Mac/iOS keep
  `⌘`, Windows/Linux show `Ctrl`. `_renderShortcutsLegend` renders the right
  glyph; `_applyPlatformKeys()` rewrites the static index.html `<kbd>` /
  `.cmdp-kbd` / search-hint markup. NOTE: it's called from the renderScreen
  hook, not a DOMContentLoaded listener — the bundles are injected as dynamic
  scripts that load *after* DOMContentLoaded, so that listener never fires.
- Ideas page: the rail had an inline `width:320px` fighting the 280px grid
  track — removed. `.rr` got `min-width:0` so it always respects its track.
- My Week + Settings: `.bg:not(.wr) .mn` had `margin-right:auto` with no
  definite width → it sized to content (too wide on My Week — clipped the
  + button; too narrow on Settings — empty space right). Added `width:100%`
  so it fills the track, still capped at `max-width:1280px` on wide monitors.
- Projects: cards with no linked tasks show "No linked tasks" instead of a
  confusing "0/0 tasks done" next to the progress donut.
- Archive: dateless rows show a muted "—"; project archive records `archivedAt`.
- Goals "unequal card heights" — NOT reproduced: `#goals-grid` cells already
  stretch equal (grid default `align-items`). Left as-is.

**Reclassified — not code fixes:**
- "Jun 31" dates (one Project card + one Goal) = bad data typed into those
  records; edit the records, no code change helps.
- Team activity feed "Yesterday + 41m ago" = not a bug (audited at the
  midnight rollover; a late-yesterday event legitimately read "41m ago").
- Team member card "Goals Avg 5%" vs Goals page "14%" = by design — the member
  card is `createdBy`-scoped. Real issue: the "Velocity" goal has no
  `createdBy` (data attribution gap).

All audit fixes are client-side in `client/public/js/app-part*.js` — **bump
`APP_BUILD` in `client/index.html` on every change** or browsers serve stale
JS. Keep everything iPhone/iPad/iOS-compatible.

Session commits (newest first): `93caa2b` relational notes + ideas tables
(Step 4 — two more entities) · `cc40bea` calendar two-store unification ·
`78cdf44` Reports filter consolidation · `7eae284` flip task reads to
relational table + status endpoint · `6ab8afa` fix overlays closing on
text-selection drag · `0262958` relational tasks-table pilot ·
`8f940df` Batch 4 layout + platform-key timing ·
`a99af9b` Batch 4 logic (toasts/glyph/Projects/Archive) · `d50af55` CLAUDE.md ·
`21c431e` Home rail + weekly review ·
`2a21c34` per-screen audit batch (Process/Clusters/Reports/Calendar) ·
`cba4c4a` Team card habits · `3990eec` batch 3a · `6847986` batch 2 ·
`b8caea4` journal parser · `f1117c5` batch 1 · `c8c1bd7` bulk doc import ·
`7b1c3a0` image migration · `58d8024` CLAUDE.md storage · `aa768fe` APP_BUILD
bump · `219e615` doc-import URL + persistence fix.

## Most recently shipped (May 11–12 2026 session arc)

### Storage backend overhaul (May 11–12)

User stopped using Manus AI, so the Forge presign flow is dead on this env.
`server/storage.ts` now supports three backends, picked in this order:

1. **S3-compatible** — set `S3_BUCKET` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY`.
   Optional: `S3_REGION` (default `us-east-1`), `S3_ENDPOINT` (for R2 / B2 / MinIO),
   `S3_PUBLIC_URL_BASE` (CDN / custom domain), `S3_FORCE_PATH_STYLE=1`.
   Bucket needs public-read OR a fronting CDN. Uses `@aws-sdk/client-s3`.
2. **Google Drive** — set `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET` +
   `GOOGLE_DRIVE_REFRESH_TOKEN` + `GOOGLE_DRIVE_FOLDER_ID`. Refresh-token OAuth,
   no new deps (plain `fetch`). Uploads to the folder, shares "anyone with the
   link can view", returns `drive.google.com/thumbnail?id=…&sz=w1600` URLs for
   images and `uc?export=download` URLs for other files. (The `uc?export=view`
   form Google no longer serves to `<img>` tags — it returns an HTML
   interstitial; switched to `thumbnail` on 2026-05-21.) See `env.ts` inline
   comments for the refresh-token generation flow via OAuth Playground.
3. **Manus Forge presign** — legacy fallback. Only used if 1 & 2 unconfigured.

If none are configured, `storagePut` throws and the caller's data-URI fallback
kicks in (see Word/Notes import section below).

**Status (2026-05-21):** Google Drive is the live backend — the four
`GOOGLE_DRIVE_*` env vars are wired on the `levelup-second-brain / production`
Railway service and verified end-to-end via `/api/storage-status`. Importers
now upload images to Drive instead of inlining `data:` URIs. Two open
follow-ups: (a) notes imported before the Drive wiring still carry inline
`data:` URI images — no retroactive backfill yet, and they bloat the
localStorage cache; (b) any note imported before the 2026-05-21 URL fix has
dead `uc?export=view` image URLs that need rewriting to the `thumbnail` form
(one-shot console snippet does this — see commit `219e615`).

### Word/Notes document import (May 11–12)

- **Notes-page importer** (`notesImport.ts` via the 📥 Import Docs button):
  Single-doc upload → mammoth `convertToHtml` with image-upload hook →
  uploads each image to storage, or falls back to data: URI (≤4 MB) →
  returns `body` (plain text fallback) + `bodyHtml` (rich HTML with images
  inline). Saved on the note as `n.bodyHtml`; the read-only renderer prefers
  this over the markdown-rendered `n.body`. Inline RTE init also reads from
  `n.bodyHtml`. `saveNoteInlineEdit` writes both back.
- **Settings → Word Doc Import** (`wordImport.ts` via the dropzone):
  Multi-note split (Title → Date → Time → Body pattern). Mammoth HTML →
  split at block boundaries → derive plain text per block → existing title
  detection algorithm. Each note gets `content` + `contentHtml`. Embedded
  non-image files (PDFs / .xlsx / .pptx / OLE bins) are pulled from
  `word/embeddings/` via JSZip and either uploaded to storage or inlined as
  data URIs (≤10 MB) — listed in a "📎 Attachments from this document"
  block at the end of the FIRST imported note.
- **Bypass mode**: a "⚡ Skip images & attachments" checkbox in the Settings
  importer panel sends `skipBinaries:true` to the server, which replaces
  images with styled `[Image N skipped]` placeholders and lists attachment
  filenames in a yellow "Skipped attachments" block without uploading or
  encoding anything. Use this when storage isn't configured yet to avoid
  bloating the prefs blob with megabytes of data URIs.
- **Upload size cap**: 100 MB end-to-end (client check, zod limit, express
  body parser at 200 MB to fit base64 inflation).
- **jszip** is now a direct dep (was transitive of mammoth, promoted in
  `a2de9e0` with matching `pnpm-lock.yaml` importer entry).

### Other May 12 fixes

- **M365 contacts import** (`syncContacts` in `oauth-sync.ts`): paginates
  through `@odata.nextLink` (MS Graph) and `nextPageToken` (Google People)
  with a default cap of 5000 contacts and a 200-page safety ceiling. Was
  fetching only the first page of ~50 before.
- **doFASave save-button hang** (`app-part2.js`): wrapped the setTimeout
  body in try/catch/finally so the "Saving…" spinner always resets and
  errors get toasted instead of swallowed.
- **Notes page banner**: replaced the bespoke `.notes-page-header` (peach
  surface, icon block, chip pills) with the standard `.ph-r` pattern used
  by Tasks / Projects / Goals / Journal. Stats now in a single subtitle
  line written to `#notes-page-sub` by `renderNotes()`.

## Most recently shipped (May 11 2026 session arc) — all 7 picked items done

1. ✅ **🕸 Knowledge graph view of notes** (`dcf0452`) — new `s-graph` screen. `renderKnowledgeGraph()` extracts `[[wiki]]` links + shared-tag edges; `_kgStartSimulation()` runs Verlet integration (REPULSION=2500, SPRING=0.012, SPRING_LEN=120, FRICTION=0.86, CENTER_PULL=0.0008, 240 ticks). Click a node → `showNoteInEditor(id)`. Sidebar entry purple `#a855f7`, palette nav, SM map entry.

2. ✅ **⏰ Server-side cron for scheduled reports** (`cd16624`) — `server/_core/scheduledReports.ts` ships a hourly `setInterval` (kicked off 30s after `server.listen`) that walks every `user_app_data` row, finds due `savedReports[*]` by mirroring the client's `isReportDue` logic against `lastSentISO`, looks up the user's email, renders a mini HTML email (KPIs + per-section tables + widget summary list — no SVG charts), and ships via existing `sendEmail`. `lastSentISO` is persisted back to the prefs blob so both server cron and the client login catch-up converge on the same dedupe key. Also exposed as `POST /api/scheduled/run-reports` (auth-gated).

3. ✅ **⚡ Performance pass — split `index.html`** (`e298d0f`) — extracted both giant inline `<script>` blocks verbatim into `client/public/js/app-part1.js` and `app-part2.js`, both loaded with `defer`. HTML went from 1.5MB → 132KB. JS bytes unchanged but cacheable separately and parallel-downloadable. No logic touched — pure extraction.

4. ✅ **🎓 Onboarding tour** (`ebd5ef2`) — `_maybeOfferTour()` shows a rich toast with "Start tour" / "Later" actions, gated by `lu_tour_v1_offered` (one-shot) and `lu_tour_v1_done` (set when user finishes or skips). Wired into `doLoginSuccess` for both first-ever and returning-but-unseen flows. Fixed missing `@keyframes tourPulse`, cleared stale `translate(-50%,-50%)` transform between steps, made tour 1's welcome step target-less (centered).

5. ✅ **🌤 Dashboard widget variety** (`5f7e6ea`) — 5 new home cards: weather (wttr.in), quote of the day (30-rotation), "1 year ago today", AI insight (daily-cached), focus suggestion (peak-hour from `D.prefs.focusByHour`).

6. ✅ **🎚 Drag-to-reorder Home widgets** (`5f7e6ea`) — `_homeDragStart/Over/Drop` handlers on `.home-card-wrap` elements, order persisted to `D.prefs.homeCards`.

7. ✅ **🎨 Empty states everywhere** (`46ca165`) — `renderEmptyState()` applied to Notes (filtered), Goals (empty grid), Ideas (per-tab), Habits (scope-aware), Journal (initial + filtered), Mail Inbox + Sent (query vs sync-needed), Contacts (filtered vs empty).

**Skipped (user's call)**: Public sharing links, templates marketplace, accessibility audit, print stylesheets, PWA.

### Plus along the way (smaller fixes shipped in the same arc)

- `3492bed` Insert Image modal — replaced `prompt()` (which broke the file-picker user-gesture chain) with an in-DOM modal that preserves the gesture chain and the caret position.
- `f2663ab` Upload size 20MB → 100MB across the Word/notes import paths (client checks, zod limits, express body parser 50mb→200mb).
- `8aebba0` Settings nav label "OneNote Import" → "📝 Word Doc Import" so it matches the panel content.
- `4cbc821` + `f4585bf` Notes title banner — replaced the bespoke `.notes-page-header` (icon block + chip pills + peach surface) with the standard `.ph-r` pattern used by every other page; added the Notes layout to the global `.ph-r::before` accent-strip selector since its parent isn't `.mn`.
- `aa3f770` Home hero banner restored to the original indigo→purple→magenta gradient after experiments with indigo / red variants.

## Recent commit refs (May 11–21 2026, newest first)

- `aa768fe` — Bump APP_BUILD cache-buster (`2026-05-21-01`) so import fixes reach cached clients
- `219e615` — Fix doc-import Drive image URLs (`thumbnail?id=`) + imported-note persistence (in-memory merge rescue + immediate server push)
- `355c558` — Storage: trim Drive env vars + show masked config on status page
- `48bb93e` — Storage: add `/api/storage-status` health-check endpoint
- `bd8a874` — doFASave: defensive try/catch/finally so Save button never hangs
- `23c22eb` — Word import: bypass binaries checkbox + Google Drive storage backend
- `1ebfe0b` — Storage: add S3-compatible backend (works without Manus Forge)
- `34aea71` — Word doc importer: data-URI fallback for embedded attachments
- `49a1f2c` — Word/Notes doc import: data-URI fallback when storage fails
- `057e02c` — M365 contacts import: paginate through all pages
- `a2de9e0` — Settings Word Doc importer: preserve images + embedded attachments
- `5e56c8c` — (reverted) Settings/Word-doc importer to plain-text behaviour
- `e22579d` — Word/Notes doc import: preserve formatting + images
- `0301563` — CLAUDE.md: refresh handoff doc for end-of-session arc
- `46ca165` — empty states across Ideas / Goals / Mail / Contacts / Habits / Journal
- `f4585bf` — Notes banner: clean up dead CSS + give it the standard accent strip
- `4cbc821` — Notes title banner refactored to use the standard `.ph-r` pattern
- `aa3f770` — revert Home hero banner to original indigo→purple→magenta
- `2452da3` — (reverted) Home hero banner red variant
- `fd7d918` — (reverted) Home hero banner indigo variant
- `e298d0f` — **perf #4** split index.html → /js/app-part1.js + app-part2.js (1.5MB → 132KB HTML)
- `8aebba0` — settings nav "OneNote Import" → "📝 Word Doc Import"
- `f2663ab` — bump Word/notes file-upload cap 20MB → 100MB end-to-end
- `cd16624` — **#3** server-side scheduled-reports cron + `POST /api/scheduled/run-reports`
- `ebd5ef2` — **#5** onboarding tour: first-login offer + polish
- `3492bed` — Insert Image modal: replace `prompt()` with in-DOM modal so file picker actually opens
- `dcf0452` — **#1** Knowledge Graph view (force-directed `s-graph`)
- `5f7e6ea` — **#6 + #7** Home widget variety (5 new cards) + drag-reorder + Notes empty state
- `e94a033` — right-rail shortcuts legend card
- `63caa4d` — help drawer fix + refreshed articles for new features
- `a8dc171` — four-pack: lightbox + shortcuts overlay + sidebar collapse + drawer animation
- `72c0579` — AI chat assistant + mobile responsive
- `16d658b` — Reports Phase 3: drag/resize + AI builder + pin-to-Home + email schedule
- `1f44acd` — Reports Phase 2: line/heatmap/sparkline/progress + 4 new sources + per-widget range
- `a2593f2` — Reports Phase 1: 5-slot widget engine + 10 templates + editor modal
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
