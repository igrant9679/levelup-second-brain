---
name: levelup-app
description: "Operate, manage and coach on LevelUp — the personal second-brain web app at levelupnow.tools (tasks, notes, projects, goals, habits, journal, calendar, Money/budgeting, sales pipeline, mind maps, sheets, slides, contacts, reports). Use for: how to use any LevelUp page, what to do daily/weekly/monthly, capture and review routines, GTD processing, planning a day or week, budgeting and bill tracking, keeping the workspace trustworthy, decluttering an overwhelming workspace, onboarding a new teammate, troubleshooting, and for DEVELOPING the app itself (architecture, data model, deploy rules, verification traps). Triggers: LevelUp, second brain, levelupnow, My Day, Planner, Command Center, Money page, Pipeline, Clusters, Process GTD, daily review, weekly review."
---

# LevelUp — operating and coaching manual

LevelUp is a personal "second brain": one workspace for tasks, notes, projects,
goals, habits, journal, calendar, money, sales pipeline and knowledge. Live at
**https://levelupnow.tools**.

This skill has two audiences and both matter:

- **Coaching a user.** Most requests are "how do I…", "what should I do today",
  "help me set this up", "this feels overwhelming". Answer from *Part 1–3*.
- **Developing the app.** Some requests change the code. *Part 6* has the
  architecture, the invariants and the traps that have caused real outages.

Read the repo's `CLAUDE.md` before writing any code — it is the live handoff and
always outranks this file on current state.

---

## Part 1 — The mental model

Three ideas explain almost everything:

1. **Capture is cheap, sorting is deliberate.** Getting a thought in must take
   two seconds. Deciding what it *means* happens later, in a review. Users who
   try to file perfectly at capture time stop capturing.
2. **Links are the point.** A task, note, project, goal, meeting and contact can
   all reference each other. A pile of items is a to-do list; a *linked* pile is
   a second brain. This is also what makes the AI answers good, because it can
   follow those links.
3. **Reviews are what keep it true.** A workspace nobody reviews becomes a
   graveyard within a month, and a graveyard is worse than nothing because you
   stop trusting it. The routines in Part 3 exist to prevent this.

**The failure mode to watch for:** someone captures enthusiastically for two
weeks, never reviews, drowns in stale items, and concludes "the app doesn't
work". The fix is always *less capture surface, more review cadence* — not more
features.

---

## Part 2 — Every page, and when to use it

32 routes. Nobody uses all of them; see *Detail levels* below.

### Daily drivers
| Page | What it is | Use it when |
|---|---|---|
| **Home** | Dashboard of configurable widgets + Today's Plan strip | The default landing; a 10-second "where am I" |
| **Planner** (My Day) | Today's tasks, schedule and habits in one column | Every morning — decide the day once |
| **Tasks** | The full task system: List, Board, Matrix, Gantt, Cards, Clusters views | Anything task-shaped; the workhorse |
| **Notes** | Rich-text knowledge base with `[[wiki-links]]`, folders, tags. Also hosts **Sheets** and **Slides** modes | Writing, meeting notes, reference |
| **Calendar** | Week / Day / Month; drag to reschedule; time-blocking | Planning time, not just intent |

### Structure and delivery
| Page | What it is | Use it when |
|---|---|---|
| **Projects** | Multi-task efforts with health, milestones, % complete | Work spanning more than a few days |
| **Programs** | Portfolios grouping projects | Executive roll-up across many projects |
| **Clusters** | Thematic groupings that cut across projects | Organising by theme rather than deliverable |
| **Command Center** | Cross-tool PM dashboard with KPI strip, at-risk feed, by-project and by-stakeholder views | The "what is on fire" view |
| **Standup** | Yesterday / Today / Blockers, copy-as-markdown | Right before a standup |
| **Process (GTD)** | Inbox → clarify → organise buckets | The weekly sort-out |
| **My Week / My Year** | Wider planning horizons | Zooming out |

### Thinking
| Page | What it is | Use it when |
|---|---|---|
| **Ideas** | Idea lifecycle: spark → develop → stress-test → verdict, with ICE scoring | Something might be worth doing, but isn't yet |
| **Mind Maps** | Free-form node/edge maps | Thinking in shapes, not lists |
| **Knowledge Graph** | Auto-built graph of note links and shared tags | Finding unexpected connections |
| **Focus** | Pomodoro timer with session history and peak-hour detection | Actually doing the work |

### Life
| Page | What it is | Use it when |
|---|---|---|
| **Goals** | Outcomes with % progress, milestones, linked tasks | Quarterly/annual direction |
| **Habits** | Streaks, heatmap, cadence, reminders | Behaviour you want to repeat |
| **Journal** | Dated entries with mood tracking | Reflection; feeds mood trends in Reports |
| **Money** | Full personal finance: accounts, transactions, categories, budgets, bills, savings goals, SimpleFIN bank sync, AI categorisation | Budgeting and bill tracking |
| **Coach** | AI coaching thread over your own data | Feeling stuck |

### People and inputs
**Mail** (connected inbox) · **Team** (members, activity, stats) ·
**Contacts** (CRM-lite, M365 sync) · **Pipeline** (sales opportunities, stages,
weighted forecast) · **Atlas** (read-only mirror of an external resource
planner) · **Bookmarks** (link library with metadata).

### Meta
**Reports** (custom widget dashboards, 8 sources × 8 chart types, schedulable by
email) · **Archive** · **Help & Learning** · **Settings**.

---

## Part 3 — The routines (this is the highest-value section)

Give users **cadence**, not features. If they adopt only one thing, make it the
weekly review.

### Daily — morning, 5 minutes
1. Open **Planner**. Do not open email first.
2. Look at the **capacity indicator**: planned hours vs hours actually free
   after meetings. If it says you are over, you are — cut now, not at 4pm.
3. Pick **no more than three** "must happen today" tasks. Mark them *My Day*.
   Three is not a suggestion; it is the number that survives a real day.
4. Scan today's calendar for anything needing prep. Prep is a task, not a hope.
5. Optionally run **AI Smart Plan** to time-block the day around your meetings,
   then apply it to the calendar.

### Daily — shutdown, 5 minutes
1. Tick off what is done. Untick honestly — a false green ruins the data.
2. Anything untouched three days running: either schedule it, shrink it, or
   drop it. Do not let it roll silently.
3. Empty your head into **Quick Capture** (`Ctrl/⌘ N`) — anything nagging.
4. One line in **Journal**, with a mood. Ten seconds. This becomes the mood
   trend and gives the AI real context about your weeks.

### Weekly — 30 minutes, same slot every week
This is the keystone. Everything else degrades without it.
1. **Process the inbox to zero** on the *Process (GTD)* page. Every captured
   item becomes: do now (<2 min), a task with a date, a project, a note, or
   deleted. "Maybe someday" is a real answer — use the Ideas page.
2. **Review overdue.** Overdue is a decision you have not made yet. Re-date,
   delegate, shrink or delete. An overdue list you scroll past is training
   yourself to ignore the app.
3. **Walk projects.** Each active project: still active? next action defined?
   Use the health strip (velocity, burn, risk, ETA). Anything with no next
   action is stalled by definition.
4. **Goals check.** Did this week move any goal? If not, that is the finding —
   either the goals or the week is wrong.
5. **Habits.** Look at the streaks. A habit missed three weeks running is not a
   habit; retire it rather than carrying the guilt.
6. **Plan the week ahead** in *My Week*. Block the two or three big rocks first.
7. Generate the **AI Portfolio Briefing** (Command Center) and read it. It is
   good at spotting stalls you have gone blind to.

### Monthly — 45 minutes
1. **Reports.** Completion rate, velocity trend, focus hours, mood trend. Look
   for direction, not single numbers.
2. **Money.** Reconcile accounts, check every budget line, confirm bills matched
   real transactions, update savings goals. Run **AI categorise** on anything
   uncategorised.
3. **Goals re-baseline.** Update %, move dates honestly, close what is done,
   kill what you no longer mean.
4. **Archive.** Completed projects, dead ideas, stale notes. A smaller workspace
   is a more trusted workspace.
5. **Prune the workspace itself.** Any page you never opened this month →
   Settings → Workspace and switch it off. It is one click to bring back.
6. **Ideas triage.** Promote, park with a review date, or kill.

### Quarterly
Set 3–5 goals, no more. Re-check the detail level. Re-publish the team starter
layout if your team's shape changed. Export a backup.

### First week for a new user
Day 1 capture only. Day 2 add Planner. Day 3 link a note to a task. Day 4 first
project. Day 5 first weekly review — even with almost no data, because the
*habit* is the point. Do not turn everything on at once.

---

## Part 4 — Coaching playbook

**"It's overwhelming."** → Settings → Workspace → **detail level 1 or 2**. Five
pages, two dashboard widgets, sidebars off. Add back one page a week. Nothing is
deleted; hiding is reversible and opening a hidden page re-enables it.

**"I stopped using it."** → Almost always no review cadence. Restart with the
5-minute shutdown alone for one week. Do not re-onboard the whole app.

**"My list is 200 items."** → Not a filing problem. Bulk-archive anything
untouched for 30 days (Reports has a Stale Content widget), then run one real
weekly review. Do this together, once.

**"I don't trust what it tells me."** → Something is stale. Check overdue count
and last-review date; usually a whole project is finished but not closed.

**"Where do I put this?"** → Task if it has a next action; Note if it is
knowledge; Idea if it might be worth doing; Project if it needs more than a few
steps. When unsure: capture as a task and let the weekly review re-file it.

**Set-up questions** → the Setup Guide (Settings → Workspace → Run the setup
guide, or `Ctrl/⌘ K`) walks role → detail level → pages → connections.

---

## Part 5 — Power features worth teaching

- **`Ctrl/⌘ K`** command palette — navigate, create, search everything.
- **`Ctrl/⌘ N`** quick capture from anywhere. **`Ctrl/⌘ J`** AI chat. **`?`** shortcuts.
- **Quick-add syntax** in the task input: `Buy milk !high tomorrow #shopping @groceries`.
- **`[[wiki-links]]`** between notes; backlinks appear automatically and feed the Knowledge Graph.
- **AI Deep Insight** on a note → summary, key points, action items you can turn
  into linked tasks in one click.
- **Ask LevelUp** (✨ menu) answers from *your own* notes and tasks with clickable citations.
- **Detail level dial** (Settings → Workspace) — 5 stops, level 5 = everything.
- **Per-page ⚙ Customize** in each right sidebar; layout syncs across devices.
- **Saved views** on Tasks and Command Center; **Reports** widgets pin to Home.
- **Time-blocking**: the 📅 button on a task offers real free slots around meetings.
- **Integrations**: Microsoft 365 / Google (calendar, mail, contacts), Smartsheet
  and NiftyPM (two-way task sync), OneNote (meeting notes), SimpleFIN (banking),
  Google Drive (file storage).

---

## Part 6 — For developing the app

**Read `CLAUDE.md` first.** Its START-HERE block is the current truth.

**Architecture.** Despite a React/Vite shell in `client/src`, the real UI is a
legacy app: `client/index.html` (markup + CSS) plus `client/public/js/app-part1.js`
(~24k lines) and `app-part2.js` (~14k lines), loaded as plain `<script src>`.
Backend is Node/Express + tRPC + Drizzle + MySQL. Deploys to Railway on push to
`main`.

**Data model.** Per-user JSON blobs in `user_app_data` (tasks, notes, projects,
goals, journal, habits, contacts, ideas, teams, prefs, calEvents, clusters,
programs, opportunities, mindmaps, sheets, decks, finance). Tasks/notes/ideas
also live in real relational tables and those tables are the source of truth —
the blob columns are frozen snapshots. Client writes via `appData.save`
(one stringified JSON per key); `prefs` is in `_syncKeys`, so anything stored
there follows the user across devices.

### Rules that exist because something broke

- **Always** `node -c client/public/js/app-part1.js && node -c client/public/js/app-part2.js`
  before pushing. A syntax error in either bundle kills boot entirely.
- **`app-part1.js` must keep exactly 12 NUL bytes** (markdown-renderer
  placeholders). Verify before and after any byte-level tooling.
- **Bump `APP_BUILD`** in `index.html` on any client-visible change or browsers
  serve stale JS.
- **`index.html` CSS is the danger zone.** Additions to its `<style>` shipped a
  broken, unstyled page twice (-132/-134), and later silently swallowed a whole
  rule block. **Prefer JS-injected stylesheets** — `#lu-page-accents`,
  `#lu-layout-css`, `#lu-daybreak-css`, `#lu-bento-css` all work reliably.
- **Theme tokens cannot live in CSS.** `applyTheme()` writes them inline on
  `<body>`, and inline beats any stylesheet. Add tokens through
  `_getEffectiveTheme()` instead, and never override `--ac` (that is the user's
  accent preference).
- **`.btn` is `white-space:nowrap`** — multi-line button content overflows
  silently and DOM assertions cannot see it.
- **`sp-N` Settings panel ids are hardcoded in ~13 places.** Never renumber
  panels; nav entries carry explicit ids.
- **Workspace layout is sparse by design.** Absent prefs must render exactly the
  stock app; every setter deletes a key once it matches its default.
- Gate shared-visibility reads on `isOwnerCtxUser`, **not** `isAdminUser` —
  invited teammates are all admins.
- `vite` and `esbuild` can OOM when chained; run them separately.

### Verification traps (each cost real debugging time)

- **`getComputedStyle` returns stale, mid-transition values here.** It once
  produced a bogus 1.01 contrast ratio and repeatedly served a stale
  `document.body` background. **Verify colour and contrast deterministically** —
  recompute from token values and the `color-mix` recipe in plain JS. For
  body-level reads, append a probe element that inherits the variable.
- **Screenshots taken mid-paint** show correct text as faded or missing. Wait
  1–2s, and wait ~6s after a cold load before measuring anything.
- **Screenshot every new multi-column panel.** Structural assertions cannot see
  overlap.
- Verify `index.html` changes against the **built** `dist/public/index.html` and
  live computed styles, not the source.

### Seeding a demo account

The app ships correctly-shaped demo records inside `app-part1.js` (the `D`
defaults that are cleared for new members). Extract those by brace-matching and
eval, refresh their dates, author only the entities that ship empty
(opportunities, finance, mindmaps, prefs), and build sheets/decks through the
app's own `SHEET_TEMPLATES` / `DECK_TEMPLATES`. Then `emailAuth.register` plus
one `appData.save`. Read the bundle as **utf8** or emoji become mojibake.
Validate that every `catId`/`accountId`/`projectId` resolves, and that journal
dates survive `_parseJournalDate` — which takes the entry **object**, not a
string, and prefers `createdAt`. Profile text fields (job title, bio, photo)
are localStorage-only and **cannot** be seeded server-side.

### Conventions with this user

Review before push unless told otherwise. Commit trailer
`Co-Authored-By: Claude <model> <noreply@anthropic.com>`. Pull first —
`manus-agent` also commits here. Avoid backticks and heredocs in Bash strings;
they get command-substituted and silently eat your text.
