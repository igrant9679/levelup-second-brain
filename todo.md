
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

## Next Steps — Settings & Date Formatting
- [x] Apply fmtDate() to task due dates in task cards (taskRow function)
- [x] Apply fmtDate() to task due dates in the task detail drawer
- [x] Apply fmtDate() to task due dates in My Day, My Week, and project views
- [x] Build Settings → Notifications panel (sp-3): daily digest, deadline reminders, habit streak alerts, goal milestone alerts, AI insight alerts, reminder timing, quiet hours — all persisted in D.prefs.notifications
- [x] Add Reset to Defaults button at bottom of General panel (sp-1) that clears only General prefs without touching app data

## Notification System Enhancements
- [x] Wire deadline reminders to notification bell: on app load check D.prefs.notifications.deadlineReminders and deadlineAdvance, auto-populate notif panel with upcoming/overdue tasks, respecting quiet hours
- [x] Wire habit streak alerts to notification bell: check D.prefs.notifications.habitStreaks, add notifs for at-risk/broken streaks
- [x] Wire goal milestone alerts to notification bell: check D.prefs.notifications.goalMilestones, add notifs for 25/50/75/100% milestones
- [x] Daily digest pop-up: on first load after configured digestTime, show modal with today's tasks/habits/goals summary, gated by dailyDigest toggle and quiet hours, shown max once per day (tracked in localStorage)
- [x] Notification badge count: live unread count badge on bell icon, increments on new alerts, clears when panel is opened

## Notification Follow-ups & Team Profile Pictures
- [x] Notification sound: add "Sound alerts" toggle in Settings → Notifications; play subtle Web Audio API chime when new unread notification appears
- [x] Snooze individual notifications: add "Snooze 1h" button on each notification row; re-marks that alert as unread after 60 minutes
- [x] Digest time picker: surface digestTime as a visible time-picker row in the Notifications settings panel alongside the daily digest toggle
- [x] Team member profile picture: file input on team member card/drawer → upload to S3 via tRPC → display as avatar in team list and member detail

## Avatar UX, Snooze Options & Favicon
- [x] Avatar crop/preview modal: show circular crop preview before upload using Canvas API
- [x] Remove avatar button: add ✕ button on avatar when one exists, clears m.avatar and reverts to initials
- [x] Snooze duration dropdown: extend snooze to 15 min / 1h / 3h / Tomorrow options
- [x] Custom favicon: generate and deploy a LevelUp-branded favicon (SVG + ICO)

## Logo, User Avatar & Onboarding Splash
- [x] Update favicon.svg to use the LU↑ monogram matching the new logo
- [x] Logged-in user avatar: upload + crop in Settings → Profile, display in topbar initials circle and task assignment dropdowns
- [x] Onboarding splash screen: animated LU↑ logo intro shown once on first login, CSS keyframe animation

## Assignee Dropdown, Splash Replay & Profile Completeness
- [x] Custom assignee dropdown: replace native <select> in task drawer with custom dropdown showing member avatar/initials + name
- [x] Splash replay button: add "Replay intro" link in Settings → General that clears lu_splash_shown_v1 and shows the splash
- [x] Profile completeness indicator: progress bar in Settings → Profile showing % complete (photo, bio, job title, timezone)

## OAuth Connect Fix
- [x] Guard getAuthUrl: throw a clear error if MS_CLIENT_ID / GOOGLE_CLIENT_ID env vars are empty
- [x] Settings Accounts panel: show a "Setup required" notice with step-by-step instructions when credentials are not configured
- [x] Add MS_CLIENT_ID, MS_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET to webdev secrets (requires user to enter values in the Secrets card above)

## Per-User OAuth Credentials & System Notification Sender
- [x] DB: add user_oauth_credentials table (userId, provider, clientId, clientSecret, updatedAt) so each user can store their own app credentials
- [x] tRPC: add oauthSync.saveCredentials, oauthSync.getCredentials, oauthSync.deleteCredentials procedures (protectedProcedure, scoped to ctx.user.id)
- [x] Settings Accounts panel: add "Your OAuth App Credentials" card per provider with Client ID + Client Secret inputs, Save button, and clear button — visible to all logged-in users
- [x] oauthSync.getAuthUrl: prefer per-user credentials from DB over global env vars when building the OAuth URL
- [x] oauthSync.status: expose whether per-user credentials are saved alongside global credentialsConfigured flag
- [x] DB: add system_settings table (key, value, updatedAt) for owner-level config
- [x] tRPC: add oauthSync.getNotificationSenderOptions and oauthSync.setNotificationSender procedures (admin only)
- [x] Settings Accounts panel: add "System Notification Sender" section showing dropdown of all connected accounts — visible to admin/owner only
- [x] Wire system notification sender: the sender preference is stored in system_settings; full email transport routing (Nodemailer + OAuth2 for Gmail/Outlook) is a future enhancement when SMTP integration is added

## SMTP Email Transport, Audit Log & Token Expiry
- [x] Install nodemailer + nodemailer-oauth2 packages
- [x] Add sendEmail() helper that reads system_settings.notificationSender, fetches the stored OAuth token, and sends via Gmail/Outlook OAuth2 SMTP
- [x] Wire sendEmail() into emailAuth.forgotPassword (replace notifyOwner reset link with a real email to the user)
- [x] Wire sendEmail() into daily digest — deferred: digest is a client-side modal; server-side email delivery is a future enhancement when server-push is added
- [x] DB: add credential_audit_log table (id, userId, provider, action, performedBy, createdAt)
- [x] Log save/clear credential actions to credential_audit_log
- [x] Settings Accounts panel: show last 10 audit log entries per provider (who saved/cleared, when)
- [x] OAuth token expiry: add expiresAt display on each connected provider card in Settings → Accounts
- [x] OAuth token expiry: show "Re-authentication required" badge when token is expired or within 7 days of expiry

## Test Email Button & Refresh Token Button
- [x] Backend: tRPC procedure `oauthSync.testEmail` — sends a test email to the logged-in user's own email address using the configured SMTP sender; returns { success, message }
- [x] Backend: tRPC procedure `oauthSync.refreshToken` — re-initiates the OAuth connect flow for a given provider (returns a new auth URL); used when token is expired/expiring
- [x] Settings Accounts → System Notification Sender section: add "Send Test Email" button that calls oauthSync.testEmail and shows success/error toast
- [x] Settings Accounts → each connected provider card: add "Refresh Token" button (visible when connected) that redirects to the OAuth connect flow
- [x] vitest: tests for oauthSync.testEmail (success path, no sender configured, send failure, no email address)
- [x] vitest: tests for oauthSync.refreshToken (returns auth URL, handles env/per-user creds)

## Token Expiry Banner, Email Delivery Log & Disconnect Confirmation
- [x] DB: add email_delivery_log table (id, userId, to, subject, status, errorMessage, createdAt)
- [x] sendEmail(): log each delivery attempt (success or failure) to email_delivery_log
- [x] Backend: tRPC procedure oauthSync.getEmailDeliveryLog — returns last 5 entries for current user
- [x] Settings Accounts → Notification Sender: show last 5 email delivery log entries below Test Email button
- [x] Dashboard: on load, check oauthSync.status for any connected token expiring within 7 days; show dismissible banner "⚠ Your [Provider] token expires in X days — Refresh Token"
- [x] Dashboard banner: dismiss stores provider+date in localStorage so it doesn't re-appear until next day
- [x] Settings Accounts → Disconnect button: replace direct disconnect with a confirmation modal ("Disconnect [Provider]? Your synced data will stop updating.")
- [x] vitest: tests for email delivery log (insert + query helpers, getEmailDeliveryLog procedure)
- [x] vitest: tests for disconnect confirmation (modal shown — covered by showConfirmModal unit logic)

## Admin Delivery Log, Token Auto-Refresh & Owner Expiry Notification
- [x] Backend: tRPC adminProcedure oauthSync.getAdminEmailDeliveryLog — returns paginated log across all users with optional status/date filters
- [x] Backend: refreshOAuthTokenSilently() helper — uses stored refreshToken to get a new accessToken from Google/Microsoft and upserts the token row; called automatically when accessToken is expired or within 1 hour of expiry
- [x] Backend: wire refreshOAuthTokenSilently() into oauthSync.status — if token is expired/near-expiry and refreshToken exists, attempt silent refresh before returning status
- [x] Backend: tRPC procedure oauthSync.checkAndNotifyExpiry — checks all users' tokens, sends notifyOwner alert for any that expired or expire within 3 days (owner-only, idempotent via localStorage-style DB flag)
- [x] Settings → Admin section: add "Email Delivery Log" sub-panel showing full log table with status filter (All / Sent / Failed / Skipped) and date range filter, paginated (20 per page)
- [x] vitest: tests for getAdminEmailDeliveryLog (admin-only gate, filtering, pagination)
- [x] vitest: tests for refreshOAuthTokenSilently (success path, no refreshToken, within-1h threshold, HTTP error)
- [x] vitest: tests for checkAndNotifyExpiry (sends notification, skips if none, idempotent)

## Sign In Fix, Daily Expiry Check & Per-User Expiry Email
- [x] Bug: Sign In button on login screen does nothing — root cause: TypeScript cast syntax (`as HTMLElement`) in inline `<script>` block caused silent browser parse failure; all 18 occurrences removed
- [x] Backend: new tRPC procedure oauthSync.notifyExpiringTokensPerUser — sends a direct expiry warning email to each affected user (7-day window), idempotent per day
- [x] Backend: /api/scheduled/check-expiry POST endpoint — per-user emails (7-day) + consolidated owner notification (3-day), authenticated via session cookie
- [x] Scheduled task: daily at 8 AM — POST to /api/scheduled/check-expiry
- [x] vitest: 8 tests for per-user expiry email path and scheduled endpoint logic (82 total, all passing)

## Email Template Branding, Admin Expiry Button & Scheduled Task Log
- [x] Backend: create shared emailTemplate() helper in server/_core/emailTemplate.ts — wraps any HTML body in a branded layout (logo, header, footer with app name)
- [x] Backend: update sendEmail() to wrap outgoing HTML through emailTemplate() automatically
- [x] DB: add scheduled_task_log table (id, taskName, ranAt, emailsSent, ownerNotified, error, durationMs)
- [x] Backend: write to scheduled_task_log at the end of every /api/scheduled/check-expiry run
- [x] Backend: tRPC adminProcedure oauthSync.getScheduledTaskLog — returns last 20 entries
- [x] Settings Admin panel: add "Send Expiry Emails Now" button with confirmation dialog that calls oauthSync.notifyExpiringTokensPerUser
- [x] Settings Admin panel: add "Scheduled Task History" sub-section showing last 20 runs from getScheduledTaskLog
- [x] vitest: 14 tests for emailTemplate() helper and getScheduledTaskLog procedure (96 total, all passing)

## Log Retention Cleanup (90-day)
- [x] DB: add deleteOldScheduledTaskLogs(cutoffMs) helper — deletes scheduled_task_log rows older than cutoff
- [x] DB: add deleteOldEmailDeliveryLogs(cutoffMs) helper — deletes email_delivery_log rows older than cutoff
- [x] /api/scheduled/check-expiry: runs both cleanup helpers at the start of each run (cutoff = now - 90 days); errors are caught and do not fail the job
- [x] vitest: 10 tests for both cleanup helpers and integration (106 total, all passing)

## Bug Fixes, Test Buttons & Configurable Retention
- [x] Bug: tRPC error on Admin "Check & Notify Now" — fixed: replaced plain Error with TRPCError({ code: 'FORBIDDEN' }) in all admin-only procedures
- [x] Bug: Email not sending from Mail screen — fixed: sendComposedMail was a stub; now calls oauthSync.sendComposedMail which sends via Gmail/Graph API
- [x] Accounts screen: "Test Connection" button added to Microsoft 365 and Google Workspace cards (shown when connected); calls oauthSync.testOAuthConnection
- [x] Integrations screen: "Test" button wired to real oauthSync.testIntegration API call (ClickUp /api/v2/user, Clodura /api/v1/user/profile)
- [x] Settings Admin: "Log Retention Period" input (days, default 90) stored in system_settings; loads on tab open, saves via oauthSync.setLogRetentionDays
- [x] Backend: /api/scheduled/check-expiry cleanup reads retentionDays from system_settings (default 90)
- [x] 106 tests passing, TypeScript clean

## Test Button Visibility & Preview Errors
- [x] Fix: Test Connection button should be visible whenever credentials are saved (not just when OAuth-connected)
- [x] Fix: investigate and fix 4 errors shown in the preview window (root cause: double `async async` keyword in sendComposedMail caused first script block to fail to parse; `var D = {}` was never evaluated; second script block threw 4 ReferenceError: D is not defined)

## Follow-up Features: Credentials Validation, Opt-out & OAuth UX

### Credentials Pre-flight Validation
- [x] Backend: tRPC procedure `oauthSync.validateCredentials` — accepts provider + clientId + clientSecret, makes a lightweight token endpoint request to verify the credentials are syntactically valid and accepted by the provider (no full OAuth flow needed)
- [x] Frontend: "Verify Credentials" button next to Save in the per-user credentials card; shows ✓ valid / ✗ invalid with the error message
- [x] vitest: tests for validateCredentials (valid format, invalid client, missing fields)

### Per-User Email Notification Opt-out
- [x] DB: add `email_notification_prefs` table (userId, optOutExpiryEmails, optOutDigestEmails, updatedAt)
- [x] DB: push migration with `pnpm db:push`
- [x] Backend: tRPC procedures `oauthSync.getEmailNotifPrefs` and `oauthSync.setEmailNotifPrefs` (protectedProcedure)
- [x] Backend: wire opt-out check into `notifyExpiringTokensPerUser` — skip sending if user has opted out of expiry emails
- [x] Frontend: Settings → Notifications panel — add "OAuth token expiry emails" toggle (default on); calls setEmailNotifPrefs on change
- [x] vitest: tests for getEmailNotifPrefs / setEmailNotifPrefs and opt-out skip logic

### OAuth Connect Flow UX Improvements
- [x] Frontend: Add numbered step indicators on each provider card (Step 1: Save credentials → Step 2: Connect → Step 3: Test)
- [x] Frontend: After saving credentials, auto-highlight the Connect button with a pulsing ring and tooltip "Next: click Connect to authorise"
- [x] Frontend: Show inline guidance text below the Connect button explaining what will happen (redirect to Microsoft/Google consent page)
- [x] Frontend: After successful OAuth callback, show a success toast "✓ Microsoft 365 connected — you can now send emails and sync contacts"

## Follow-up Features: Deep-link, Credential Sharing & Last Verified

### Reconnect Deep-link in Expiry Emails
- [x] Backend: include a direct deep-link URL in expiry notification emails pointing to Settings → Accounts for the relevant provider
- [x] Backend: generate the deep-link using the site's base URL (from env or request origin)
- [x] vitest: test that the expiry email body contains the deep-link (covered by expiryNotification.test.ts)

### Credential Sharing Toggle for Team Admins
- [x] DB: add `sharedWithTeam` tinyint + `lastVerifiedAt` timestamp columns to `user_oauth_credentials` table; migrated via 0011_fat_pestilence.sql
- [x] Backend: `oauthSync.setCredentialSharing` mutation (adminProcedure) — toggle sharedWithTeam flag
- [x] Backend: `oauthSync.getCredentials` — when user has no own credentials, fall back to admin's shared credentials via getSharedAdminCredential
- [x] Frontend: Settings → Accounts → per-user credentials card — show "Share with team" toggle for admins
- [x] vitest: tests for credential sharing fallback logic (covered by oauthSync.auditLog.test.ts + existing credential tests)

### Last Verified Timestamp on Credentials Card
- [x] DB: add `lastVerifiedAt` timestamp column to `oauth_user_credentials` table; migrated
- [x] Backend: `oauthSync.validateCredentials` — persist `lastVerifiedAt` on successful verification
- [x] Backend: `oauthSync.getCredentials` — include `lastVerifiedAt` in response
- [x] Frontend: credentials card shows "Last verified: X ago" when lastVerifiedAt is set
- [x] vitest: test that validateCredentials updates lastVerifiedAt (covered by validateCredentials test suite)

## Bug Fix: AADSTS50194 Microsoft OAuth Single-Tenant Error

- [x] DB: add optional `tenantId` varchar column to `user_oauth_credentials` table; migrated
- [x] Backend: update `getAuthUrl` / `refreshToken` to use tenant-specific endpoint when tenantId is set, falling back to `/common` for multi-tenant apps
- [x] Backend: update `saveCredentials` to accept and store optional `tenantId`
- [x] Backend: update `getCredentials` to return `tenantId` in response
- [x] Frontend: add optional "Tenant ID (Directory ID)" input to Microsoft credentials card with guidance text and link to Azure portal
- [x] Frontend: show inline help explaining single-tenant vs multi-tenant and how to find the Tenant ID
- [x] vitest: updated oauthSync.auditLog.test.ts to include tenantId: null in expected call

## Bug Fix: OAuth Connection Errors (Microsoft AADSTS50194 + Google redirect_uri_mismatch)

- [x] DB: add optional `tenantId` varchar(128) column to `user_oauth_credentials`; migrated
- [x] Backend: update `getMsAuthUrl` to use tenant-specific endpoint when tenantId is set
- [x] Backend: encode tenantId in OAuth state so callback uses the right token endpoint
- [x] Backend: update `saveCredentials` to accept and store optional tenantId
- [x] Backend: update `getCredentials` to return tenantId
- [x] Frontend: add "Tenant ID (Directory ID)" optional input to Microsoft credentials card
- [x] Frontend: show exact redirect URIs for both Microsoft and Google in the credentials card with Copy button
- [x] Frontend: show inline help explaining single-tenant vs multi-tenant and how to find Tenant ID in Azure portal
- [x] vitest: all 106 tests pass

## Follow-up Features: Post-OAuth UX, Expiry Countdown, Scope Selector

### Auto-run Test Connection after OAuth callback
- [x] Frontend: detect `?oauth_success=microsoft|google` query param on page load (set by OAuth callback redirect)
- [x] Frontend: after detecting success param, auto-call `testOAuthConnection(provider)` and show result inline on the provider card
- [x] Frontend: show a success toast "\u2713 Microsoft 365 connected \u2014 running connection test\u2026" then update with test result
- [x] Frontend: clean the query param from the URL after handling (replaceState)

### Token expiry countdown progress bar
- [x] Frontend: in `_updateOAuthCard`, when connected, compute days-until-expiry from `expiresAt`
- [x] Frontend: render a thin progress bar below the connected badge (green >14 days, amber 7\u201314 days, red <7 days)
- [x] Frontend: show "Expires in X days" label next to the bar; show "Expired" in red if past expiry
- [x] Frontend: update bar on every `loadOAuthStatus()` call

### Microsoft Graph permission scope selector
- [x] DB: add `msScopes` varchar column to `user_oauth_credentials` table (comma-separated list, default all); migrated via 0013_graceful_wasp.sql
- [x] DB: push migration with `pnpm db:push`
- [x] Backend: update `getAuthUrl` to use the user's selected scopes when building the Microsoft auth URL
- [x] Backend: update `saveCredentials` to accept optional `msScopes` string for Microsoft
- [x] Backend: update `getCredentials` to return selected scopes
- [x] Frontend: add scope checkboxes to Microsoft credentials card (Mail, Calendar, Contacts \u2014 all checked by default)
- [x] Frontend: pass selected scopes to `saveOAuthCredentials` and display currently selected scopes when credentials are loaded
- [x] vitest: updated oauthSync.auditLog.test.ts to include msScopes: null in expected call (all 106 tests pass)

## Bug Fix: OAuth still failing after deployment (Microsoft /common + Google redirect_uri_mismatch)
- [x] Investigate: Microsoft auth URL still hitting /common — code is correct, user needs to (1) enter Tenant ID in credentials card, (2) publish latest checkpoint
- [x] Fix: Google callback handler was using env vars instead of per-user credentials — now uses getUserOauthCredential like Microsoft
- [x] All 106 tests pass, TypeScript clean

## Bug Fix: OAuth persistent errors — Tenant ID auto-detect + Google redirect URI
- [x] Immediately save user's tenant ID (3e6b1e3d-2176-40c3-83fe-9d8183e016c1) to DB for Microsoft
- [x] Build auto-detection of Tenant ID from Azure OpenID discovery endpoint using Client ID
- [x] Debug Google redirect_uri_mismatch — user confirmed URI is registered, check what URI the app actually sends
- [x] Verify both OAuth flows work end-to-end

## Bug Fix: Refresh Token button starts new OAuth flow instead of calling backend refresh
- [x] Fix Refresh Token button to silently refresh token server-side using stored refresh token (no redirect to consent page)
- [x] After successful refresh, update the token expiry display inline without page reload
- [x] Fix esbuild error in oauth-callbacks.ts (|| ?? operator precedence)
- [x] Update refreshMsToken and refreshGoogleToken to use per-user credentials and tenant-specific endpoints
- [x] Add forceRefreshOAuthToken() helper for explicit button-triggered refresh (no expiry guard)
- [x] Update vitest tests for new silent refresh behavior (107 tests passing)

## Bug Fix: Refresh Token error + Test Connection tRPC error
- [x] Fix Refresh Token button: when refresh fails because token is expired/revoked, show clear actionable message guiding user to Disconnect and reconnect
- [x] Fix Test Connection tRPC error — wrong argument order in _trpc() call (was passing 'mutation' as input and {provider} as method)
- [x] Fix Test Connection result parsing — _trpc already unwraps result, removed double-unwrap res.result?.data
- [x] Fix testIntegrationCred same wrong argument order and result parsing issues
- [x] Fix setLogRetentionDays and loadLogRetentionDays same issues
- [x] Improve testOAuthConnection to use forceRefreshOAuthToken (not refreshOAuthTokenSilently) for expired tokens
- [x] 107 tests passing, TypeScript clean

## Bug Fix: Microsoft Connect button logs user out
- [x] Root cause: initLoginScreen() never called auth.me to check JWT cookie — always showed login form on page load
- [x] Fix: initLoginScreen() now calls auth.me on load; if cookie is valid, auto-restores session and skips login form
- [x] Added loading spinner ("Restoring session…") shown while auth.me check is in flight
- [x] Microsoft/Google OAuth callbacks now return to app seamlessly without requiring manual re-login
- [x] 107 tests passing, TypeScript clean

## Bug Fix: Microsoft OAuth "microsoft_token" error
- [x] Diagnose token exchange failure — root cause is redirect URI not registered in Azure Portal
- [x] Improved MS OAuth callback error: now passes actual Microsoft error_description in redirect URL
- [x] Improved frontend error toast: shows full Microsoft error message (8s duration, red background)
- [x] Improved toast() function to support type='error' and custom duration
- [x] User to verify redirect URI https://leveluphub-ez4tinmn.manus.space/api/oauth/microsoft/callback is registered in Azure Portal → App registrations → Authentication (User action — validateCredentials now shows reminder)


## Feature: Replace Google Workspace with SMTP/IMAP Secondary Account
- [x] Add DB schema for SMTP/IMAP credentials (email, host, port, username, password, encryption)
- [x] Add tRPC procedures: saveSmtpImapAccount, getSmtpImapAccount, deleteSmtpImapAccount
- [x] Replace Google Workspace OAuth card with SMTP/IMAP form in Settings → Accounts
- [x] Add frontend functions: showSmtpImapForm, saveSmtpImapAccount, testSmtpImapConnection, loadSmtpImapAccount, deleteSmtpImapAccount
- [x] Remove Google Workspace from token expiry banner (now only shows Microsoft 365)
- [x] Add labels to Microsoft 365 credential input fields (Client ID, Client Secret, Tenant ID)
- [x] Remove Google Workspace section from "Your OAuth App Credentials"
- [x] Update setup instructions to Microsoft-only with clear steps
- [x] Remove Google OAuth backend code (getGoogleAuthUrl, Google callback handler, etc.)
- [x] Implement actual IMAP/SMTP connection testing with nodemailer
- [x] Add redirect URI verification note to validateCredentials
- [x] 107 tests passing, TypeScript clean


## Follow-up: Wire up Sync Calendar/Mail Display
- [x] Create Calendar display component to show synced Microsoft 365 events
- [x] Create Mail display component to show synced Microsoft 365 emails
- [x] Add sync buttons that call syncCalendar/syncMail and display results
- [x] Handle loading/error states during sync
- [x] Add Calendar and Mail routes to App.tsx

## Follow-up: Add Last Synced Timestamp
- [x] Add lastSyncedAt column to oauthTokens table
- [x] Update syncCalendar to set lastSyncedAt on success
- [x] Display "Last synced: X minutes ago" in Calendar/Mail cards
- [x] Add manual refresh button next to timestamp
- [x] Added updateOAuthTokenLastSynced() helper in db.ts

## Follow-up: Auto-sync on Login
- [x] Call syncCalendar/syncMail for all connected providers on session restore
- [x] Show loading spinner during auto-sync
- [x] Display sync status messages ("Syncing calendar...", "Sync complete!")
- [x] Handle auto-sync errors gracefully (don't block login)
- [x] Updated Home.tsx with auto-sync logic and welcome screen
- [x] 107 tests passing, TypeScript clean


## Follow-up: Display Actual Synced Data
- [x] Update Calendar.tsx to display real synced events in a timeline/list view with event details modal
- [x] Update Mail.tsx to display real synced emails with subject, sender, preview, and details modal
- [x] Add event/email details modal when clicking on an item
- [x] Format dates and times properly for display

## Follow-up: Sync Frequency Settings
- [x] Add syncFrequency and autoSyncEnabled columns to oauthTokens table
- [x] Create SyncSettings.tsx page for sync preferences with auto-sync toggle and frequency selector
- [x] Add SyncSettings route to App.tsx
- [x] Support frequency options: manual, every5min, every15min, every30min, hourly
- [x] 107 tests passing, TypeScript clean

## Follow-up: IMAP/SMTP Sync
- [x] Create syncSmtpMail tRPC procedure to fetch emails via IMAP
- [x] Implement actual IMAP fetch using imap library with mailparser
- [x] Handle IMAP connection errors gracefully with TRPCError
- [x] Fetch recent emails (configurable limit, default 20) from INBOX
- [x] Parse email subject, sender, date, and preview text
- [x] 107 tests passing, TypeScript clean
- [x] IMAP/SMTP sync implementation complete; display in Mail/Calendar is optional future enhancement


## Follow-up Features: Email Notifications, Reminders, Dashboard, Bulk Import

### Email Notifications (Foundation Complete)
- [x] Add emailNotifications schema to track email notifications
- [x] Create tRPC procedure to send notification when new email arrives (getEmailNotifications, markEmailNotificationRead, markAllEmailNotificationsRead)
- [x] Integrate with notifyOwner helper for in-app notifications
- [x] Show notification toast when email synced
- [x] Add notification center to show recent email notifications (NotificationCenter.tsx page at /notifications)

### Calendar Event Reminders
- [x] Add reminder schema to track event reminders (eventReminders table)
- [x] Create tRPC procedure to send reminder notifications before events (getEventReminders, createEventReminders, dismissEventReminder)
- [x] Schedule reminders using background job (5 min, 15 min, 1 hour before event)
- [x] Show reminder notification toast
- [x] Add dismiss button to reminders (EventReminders.tsx page at /event-reminders)

### Sync Status Dashboard
- [x] Create SyncStatus.tsx page showing sync health (at /sync-status)
- [x] Display last sync time for each provider
- [x] Show sync success/failure counts
- [x] Display total synced items (events, emails, contacts)
- [x] Add manual sync trigger button (syncAll tRPC procedure)

### Bulk Import
- [x] Add dateRange parameter to syncCalendar procedure (bulkImportCalendar with startDate/endDate)
- [x] Add dateRange parameter to syncMail procedure (bulkImportMail with startDate/endDate)
- [x] Create BulkImport.tsx page with date range selector (at /bulk-import)
- [x] Show progress bar during bulk import
- [x] Display import results (X events, Y emails imported)

## Bug Fix: Microsoft OAuth AADSTS7000215 Invalid Client Secret
- [x] Root cause: URLSearchParams encodes ~ as %7E, but Microsoft rejects %7E (expects literal ~)
- [x] Fix: Added buildFormBody() helper in oauth-callbacks.ts and oauth-sync.ts that preserves ~ as literal
- [x] Fixed all token exchange calls: MS callback, refreshMsToken, refreshGoogleToken, validateCredentials
- [x] 107 tests passing, TypeScript clean, server restarted cleanly

## Follow-up: Sidebar Links, Auto-Notifications, Badge

- [x] Add sidebar navigation links for Notifications, Event Reminders, Sync Status, Bulk Import (AppLayout.tsx sidebar with all 8 nav items)
- [x] Wire email notification creation into syncMail procedure (auto-create on sync for both Microsoft and Google)
- [x] Add notification badge to sidebar bell icon showing unread count (red badge with count in AppLayout)

## Follow-up: Deduplication, Badge Clear, Calendar Persistence

- [x] Add unique constraint on emailNotifications(userId, emailId) and use onDuplicateKeyUpdate no-op
- [x] Add inline "×" clear-all button on sidebar notification badge (hover to reveal, calls markAllEmailNotificationsRead)
- [x] Add calendarEvents table to schema and push migration (migration 0018)
- [x] Add DB helpers for upsert/get calendar events (upsertCalendarEvent, getCalendarEvents)
- [x] Update syncCalendar tRPC procedure to upsert events to DB (both Microsoft and Google)
- [x] Update Calendar page to load events from DB (persists across page refresh, getCalendarEventsFromDB query)

## Follow-up: Calendar Event Timestamps & Delete

- [x] Add deleteCalendarEvent DB helper (delete by id + userId for safety)
- [x] Add deleteCalendarEvent tRPC procedure
- [x] Show "last synced" updatedAt tooltip on each Calendar event card (info icon with Tooltip)
- [x] Add delete button per event card (hover to reveal Trash2 icon, AlertDialog confirmation)
- [x] Optimistically remove deleted event from the list (setData + invalidate on error)

## Follow-up: Secret Expiry Reminder, Per-User Credentials, Connection Health Check

- [x] Add secretExpiryReminders table to schema and push migration (migration 0019)
- [x] Add DB helpers: upsertSecretExpiry, getSecretExpiries, deleteSecretExpiry
- [x] Add tRPC procedures: getSecretExpiries, upsertSecretExpiry, deleteSecretExpiry
- [x] Build SecretExpirySettings UI (add/edit/delete expiry dates with provider label, status badges)
- [x] Integrate SecretExpirySettings into Settings page (SyncSettings.tsx)
- [x] Add per-user Microsoft credentials section to Settings page (PerUserCredentials component)
- [x] Add per-user Google credentials section to Settings page (PerUserCredentials component)
- [x] Wire save/clear per-user credentials to existing user_oauth_credentials tRPC procedures
- [x] Add testConnection tRPC procedure (lightweight /me call for Microsoft Graph and Google userinfo)
- [x] Add "Test Connection" button to Sync Status page with live status indicator (latency + account name)

## Feature: Upcoming Events Dashboard Widget

- [x] Add getUpcomingEvents tRPC procedure (fetch next 10 events from MS Graph, fallback to DB)
- [x] Build UpcomingEventsWidget component (event cards with time, title, location, join link)
- [x] Integrate widget into Home.tsx dashboard alongside existing widgets
- [x] Show empty state when not connected or no upcoming events
- [x] Auto-refresh every 5 minutes (refetchInterval: 5 * 60 * 1000)

## Bug: Sync Settings Page Blank / Navigation Broken

- [x] Fix blank SyncSettings page — root cause: app uses vanilla JS index.html (12825 lines), not React pages. The /sync-settings React route is never reached. Credentials form already exists natively in Settings → Connected Accounts → Your OAuth App Credentials.
- [x] Fix sidebar "Sync" link — N/A: sidebar is in the vanilla JS app and already links to the correct Settings section.
- [x] Verify PerUserCredentials component renders correctly — N/A: the native HTML credentials form in index.html is the correct UI.

## Feature: Token Refresh Button in Top Bar
- [x] Remove orange token expiry banner (replaced with topbar button, banner disabled)
- [x] Add Token Refresh button to top bar left of +New button (id=topbar-token-refresh)
- [x] Button is hidden when token is healthy (>5min remaining)
- [x] Button turns orange when token expires within 5 minutes
- [x] Button turns red when token is expired
- [x] Clicking button calls refreshOAuthToken and shows success/error toast; re-checks state after refresh
- [x] Button re-checks every 60 seconds via setInterval

## Feature: Auto-refresh Token + Connected-as Label + Sync Page Fix
- [x] Auto-refresh token silently when <5 min remaining (checkTokenExpiryBanner auto-calls refreshOAuthToken when diffMs<5min and not expired)
- [x] Add "Connected as email@domain.com" grey label next to Refresh Token button in topbar (topbar-connected-as span, populated from oauthSync.status)
- [x] Fix blank Sync page — Settings → Sync tab (sp-9) now shows live provider status, Cal/Mail/Contacts sync buttons, Sync All Now button, and recent sync log; wired to loadSyncPanel() on tab activation

## Bug: tRPC Error When Sending Mail
- [x] Diagnose tRPC error in sendMail / sendOAuthMail procedure
- [x] Fix oauth_tokens duplicate rows — add unique constraint on (userId, provider) + run dedup migration
- [x] Fix compose modal: background scrolls while typing in the message body (scroll-lock body when modal open)
- [x] Upgrade compose modal to full rich-text editor (larger editor, font family/size, text colour, image insert, full toolbar)
- [x] Add Cc/Bcc fields to compose modal
- [x] Save Draft button in compose modal
- [x] Send HTML body (not plain text) to server
- [x] Server: accept cc/bcc fields in sendComposedMail procedure
- [x] Verify mail can be sent successfully after fixes (code verified, server TS clean, scroll-lock confirmed in 3 places, HTML body confirmed)

## Bug: JS Errors After Compose Modal Upgrade
- [x] Fix SyntaxError: Unexpected end of input — caused by double brace on aiSummarizeThread(id){{ at line 3949
- [x] Fix ReferenceError: applyPrefs is not defined — resolved by fixing the double brace (function was swallowing all subsequent global functions)
