
## AI Feature Batch — All Modules

### Tasks AI
- [x] Smart task decomposition: paste a goal, AI breaks it into a prioritised task list
- [x] Deadline risk detection: flag projects likely to miss deadlines
- [x] Auto-priority scoring: score tasks by urgency × importance × energy
- [x] Delegation suggestions: suggest which team member to assign a task to
- [x] Blocker resolution: suggest next action to unblock a blocked task

### Calendar AI
- [x] Meeting prep briefs: auto-generate a brief from linked notes/tasks/contacts before an event
- [x] Schedule optimisation: suggest moving meetings to protect deep-focus blocks
- [x] Natural language event creation: parse free text into a calendar event
- [x] Post-meeting action extraction: extract action items from meeting notes as tasks

### Mail AI
- [x] Smart reply drafts: one-click AI draft based on email thread context
- [x] Email triage scoring: classify mail as Action/FYI/Newsletter/Spam
- [x] Follow-up reminders: detect sent emails with no reply and create follow-up tasks
- [x] Thread summarisation: collapse long chains into a 3-sentence summary

### Notes AI
- [x] Concept linking: detect concepts matching existing notes and suggest bi-directional links
- [x] Gap detection: identify what is missing or under-documented on a topic
- [x] Q&A over notes: ask questions, get answers sourced from your own notes
- [x] Note-to-document expansion: expand a rough note into a structured document

### Habits & Wellbeing AI
- [x] Habit-mood correlation: cross-reference journal mood with habit completion
- [x] Adaptive streak coaching: suggest a more achievable cadence when a streak breaks
- [x] Weekly wellbeing report: auto-generate a Sunday evening summary

### Journal AI
- [x] Sentiment trend analysis: track emotional tone over time on a chart
- [x] Recurring theme detection: surface topics that appear repeatedly across entries
- [x] Guided reflection prompts: generate personalised journaling questions each evening

### Contacts AI
- [x] Relationship health score: score contacts by recency, follow-ups, frequency
- [x] Conversation starter suggestions: suggest talking points before a meeting
- [x] Duplicate detection: identify contacts that are likely the same person

### Goals AI
- [x] Goal progress narrative: generate plain-English progress update for each goal
- [x] Weekly review automation: auto-populate weekly review template with data
- [x] OKR alignment check: analyse whether daily tasks are moving top-level goals

### Search AI
- [x] Semantic search: find notes/tasks by meaning, not just keywords
- [x] Cross-module insights: surface all items related to a topic across all modules

## Help Center + Guided Tour Learning Layer

### DB Schema
- [x] help_categories table
- [x] help_articles table (slug, title, summary, body_markdown, category, tags, status, associated_tour_id, view/helpful/not_helpful counts)
- [x] help_search_log table
- [x] ai_help_conversations + ai_help_messages tables
- [x] tours table
- [x] tour_steps table
- [x] user_tour_progress table
- [x] user_learning_preferences table

### Help Center — Full Page
- [x] S-Help screen with PageHeader "Help & Learning"
- [x] Hero search bar with rotating placeholder queries
- [x] Browse tab: category grid cards with icon, title, article count, last-updated
- [x] Ask AI tab: chat interface with RAG over help articles, cited sources, 3 follow-up actions
- [x] Guided Tours tab: gallery of tour cards with completion status, role tags, recommended row
- [x] Article view: title, summary, body markdown, prerequisites callout, related articles, Take the Tour CTA, helpful widget
- [x] Admin: Edit/New Article buttons, draft/published toggle
- [x] Admin: Help Insights dashboard tab

### Help Drawer
- [x] Right-side slide-over (480px desktop, full-screen mobile)
- [x] Context-aware "For this page" card based on current screen
- [x] Same three tabs as full page
- [x] "Open in full view" link
- [x] Triggered by ? icon, ? keyboard shortcut, Cmd+/ shortcut

### Guided Tour Engine
- [x] Dim overlay (60% opacity) with spotlight cutout for target element
- [x] Pulsing accent ring around target (1.2s ease-in-out)
- [x] Animated SVG arrow pointing from tooltip to target
- [x] Tooltip card: step N of M, title, body, Back/Skip/Next buttons, tail pointer
- [x] Progress bar at top of viewport
- [x] Coach mascot (toggleable, line-art style, idle animation)
- [x] Click-blocker with shake + "Click here to continue" hint
- [x] Confetti on tour completion (respects prefers-reduced-motion)
- [x] Achievement toast for milestone tours
- [x] Tour controls bar: Pause / Restart / Exit
- [x] Pause/resume state persistence
- [x] Exit confirmation dialog

### data-tour-id Attributes
- [x] Add data-tour-id to all nav items in sidebar
- [x] Add data-tour-id to all primary CTAs across every screen
- [x] Add data-tour-id to key inputs and buttons in Tasks, Calendar, Mail, Notes, Habits, Journal, Goals, Contacts

### Proactive Hints
- [x] Detect same empty state opened 3x in session → offer walkthrough toast
- [x] Detect idle >90s on complex screen → pulse most likely next action
- [x] "Don't show hints" preference toggle

### Entry Points
- [x] Persistent ? icon docked bottom-right
- [x] ? keyboard shortcut (no input focused)
- [x] Cmd/Ctrl+/ shortcut focuses help search
- [x] Sidebar "Help & Learning" nav item (bottom, above profile)
- [x] Contextual ? icons next to section headers

### Admin Tour Builder
- [x] Record mode: capture clicks as steps with auto-generated targeting
- [x] Manual mode: step-by-step form with element picker
- [x] Preview mode for tours
- [x] Publish to all / specific roles / specific users

### Seeded Content
- [x] 6 help categories with icons
- [x] 10+ seeded help articles covering Getting Started, Contacts, Calendar, Notes, Tasks, Settings
- [x] 3 seeded tours: Member Onboarding, Import First Contact, Build First Campaign

## Ask AI Tab — LLM Integration
- [x] Add tRPC procedure `help.askAI` that accepts a question and returns an LLM answer grounded in help article content
- [x] Replace the setTimeout mock in helpAskQuestion() with a real fetch call to the tRPC endpoint
- [x] Render markdown in AI answers using a simple markdown renderer
- [x] Show cited article titles with clickable links in the answer
- [x] Show typing indicator while LLM is responding

## OneNote Import Feature
- [x] DB: `onenote_connections` table (userId, accessToken, refreshToken, expiresAt, microsoftUserId, microsoftUserEmail)
- [x] DB: `onenote_import_jobs` table (id, userId, status, totalPages, importedPages, failedPages, notebookName, sectionFilter, createdAt, completedAt)
- [x] DB: push migrations with `pnpm db:push`
- [x] Backend: Microsoft OAuth redirect endpoint (`/api/onenote/connect`)
- [x] Backend: Microsoft OAuth callback endpoint (`/api/onenote/callback`) — exchange code for tokens, store in DB
- [x] Backend: tRPC `onenote.getStatus` — check if user has connected Microsoft account
- [x] Backend: tRPC `onenote.disconnect` — remove stored tokens
- [x] Backend: tRPC `onenote.listNotebooks` — fetch notebooks from Graph API
- [x] Backend: tRPC `onenote.listSections` — fetch sections for a notebook
- [x] Backend: tRPC `onenote.listPages` — fetch pages for a section
- [x] Backend: tRPC `onenote.startImport` — kick off batch import job (notebook/section/page level)
- [x] Backend: tRPC `onenote.getImportProgress` — poll import job status
- [x] Backend: HTML-to-Markdown converter for OneNote page content
- [x] Backend: token refresh logic (auto-refresh when access token expires)
- [x] Frontend: "Connect Microsoft / OneNote" button in Settings > Integrations
- [x] Frontend: Notebook tree browser modal (Notebook → Section → Page checkboxes)
- [x] Frontend: Import progress bar with live polling
- [x] Frontend: Success state showing how many notes were imported
- [x] Frontend: Imported notes appear in Notes module with `onenote:NotebookName` tag
- [x] Tests: vitest for HTML-to-Markdown converter
- [x] Tests: vitest for import job status transitions

## Notes Search & Filter Panel
- [x] Add a collapsible filter panel below the search bar in the Notes list column
- [x] Tag facet: show all unique tags as clickable chips, multi-select, active chips highlighted
- [x] Date range facet: preset buttons (Today, This Week, This Month, This Year) + custom from/to date inputs
- [x] Source facet: show all unique source values as toggle chips (Manual, OneNote Import, Markdown Import, Quick Capture, AI, Template, Clip)
- [x] Sort control: dropdown for Newest, Oldest, A–Z, Z–A, Longest, Most Tagged
- [x] Active filter summary bar: show count of results + "Clear all filters" button when any filter is active
- [x] Wire all facets into a unified applyNotesFilters() function that combines text search + tag + date + source + sort
- [x] Preserve filter state across note opens (don't reset filters when clicking a note)
- [x] Highlight matched text in note cards when text search is active

## Bug Fixes & Login Redesign
- [x] Fix tRPC error on "Connect Microsoft 365" button in Settings → Accounts
- [x] Fix tRPC error on "Connect Google Workspace" button in Settings → Accounts
- [x] Redesign login screen: replace PIN/profile selector with email + password form
- [x] Add password hashing for stored user passwords (bcrypt)

## Login UX Enhancements & Password Management
- [x] Forgot Password: add `emailAuth.forgotPassword` tRPC procedure (generate token, send reset email via notifyOwner/SMTP)
- [x] Forgot Password: add `emailAuth.resetPassword` tRPC procedure (validate token, set new password)
- [x] Forgot Password: add DB table `password_reset_tokens` (token, userId, expiresAt, usedAt)
- [x] Forgot Password: add "Forgot password?" link on login form that shows a reset email form
- [x] Forgot Password: add reset password page/overlay (enter new password after clicking email link)
- [x] Remember Me: add checkbox to login form (extends session from 1 day to 30 days)
- [x] Remember Me: pass `rememberMe` flag to `emailAuth.login` and set cookie maxAge accordingly
- [x] Login loading spinner: show spinner on Sign In button while tRPC call is in flight, disable button
- [x] Login loading spinner: show spinner on Register button while tRPC call is in flight
- [x] Change Password: add "Change Password" card in Settings → Profile section
- [x] Change Password: form with Current Password, New Password, Confirm New Password fields
- [x] Change Password: call `emailAuth.setPassword` tRPC procedure on submit
- [x] Change Password: show success toast and clear form on success

## Settings → General Panel
- [x] Add `sp-1` General panel between Profile (sp-0) and Appearance (sp-2)
- [x] Workspace Name field (persisted in D.prefs.workspaceName)
- [x] Default Home Screen dropdown (Dashboard, Tasks, Calendar, Notes, Habits, Journal, Goals, Contacts)
- [x] First Day of Week toggle (Monday / Sunday)
- [x] Date Format dropdown (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)
- [x] Time Format toggle (12-hour / 24-hour)
- [x] Language / Locale dropdown (English, Spanish, French, German, Portuguese)
- [x] Auto-save toggle (persisted in D.prefs.autoSave)
- [x] Keyboard Shortcuts toggle (persisted in D.prefs.keyboardShortcuts)
