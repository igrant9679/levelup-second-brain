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

### UI audit + fixes (May 22) — per-screen bugs DONE, Batch 4 UX remaining

A full feature-by-feature audit of the live app was done (every screen except
Contacts/Bookmarks). Fixes shipped in batches.

**Done & deployed (builds `2026-05-22-01` … `-07`):**
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

**Remaining — Interface / UX (Batch 4):**
- Auto-toasts (NEWS / INFO / ENCOURAGE) pop on nearly every screen and overlap
  content — reduce frequency / make "don't show again" stick.
- Shortcut hints show the Mac `⌘` glyph on Windows. Make it **platform-aware**
  (detect Mac/iOS → `⌘`, else `Ctrl`) — iPad with a keyboard uses ⌘, keep
  that. Note `⌘J`→`Ctrl+J` on Windows collides with Chrome's downloads.
- Ideas page: content + right rail overflow the viewport horizontally.
- My Week: top-right "+ New / + Full Add" button clipped at the viewport edge.
- Settings: narrow content column with a large empty area to the right.
- Goals: cards in the same row have unequal heights.
- Projects: progress donuts show 90%/70% next to "0/0 tasks done" (confusing).
- Archive: some items show an archived date, others none.

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

Session commits (newest first): `21c431e` Home rail + weekly review ·
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
