
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
- [ ] help_categories table
- [ ] help_articles table (slug, title, summary, body_markdown, category, tags, status, associated_tour_id, view/helpful/not_helpful counts)
- [ ] help_search_log table
- [ ] ai_help_conversations + ai_help_messages tables
- [ ] tours table
- [ ] tour_steps table
- [ ] user_tour_progress table
- [ ] user_learning_preferences table

### Help Center — Full Page
- [ ] S-Help screen with PageHeader "Help & Learning"
- [ ] Hero search bar with rotating placeholder queries
- [ ] Browse tab: category grid cards with icon, title, article count, last-updated
- [ ] Ask AI tab: chat interface with RAG over help articles, cited sources, 3 follow-up actions
- [ ] Guided Tours tab: gallery of tour cards with completion status, role tags, recommended row
- [ ] Article view: title, summary, body markdown, prerequisites callout, related articles, Take the Tour CTA, helpful widget
- [ ] Admin: Edit/New Article buttons, draft/published toggle
- [ ] Admin: Help Insights dashboard tab

### Help Drawer
- [ ] Right-side slide-over (480px desktop, full-screen mobile)
- [ ] Context-aware "For this page" card based on current screen
- [ ] Same three tabs as full page
- [ ] "Open in full view" link
- [ ] Triggered by ? icon, ? keyboard shortcut, Cmd+/ shortcut

### Guided Tour Engine
- [ ] Dim overlay (60% opacity) with spotlight cutout for target element
- [ ] Pulsing accent ring around target (1.2s ease-in-out)
- [ ] Animated SVG arrow pointing from tooltip to target
- [ ] Tooltip card: step N of M, title, body, Back/Skip/Next buttons, tail pointer
- [ ] Progress bar at top of viewport
- [ ] Coach mascot (toggleable, line-art style, idle animation)
- [ ] Click-blocker with shake + "Click here to continue" hint
- [ ] Confetti on tour completion (respects prefers-reduced-motion)
- [ ] Achievement toast for milestone tours
- [ ] Tour controls bar: Pause / Restart / Exit
- [ ] Pause/resume state persistence
- [ ] Exit confirmation dialog

### data-tour-id Attributes
- [ ] Add data-tour-id to all nav items in sidebar
- [ ] Add data-tour-id to all primary CTAs across every screen
- [ ] Add data-tour-id to key inputs and buttons in Tasks, Calendar, Mail, Notes, Habits, Journal, Goals, Contacts

### Proactive Hints
- [ ] Detect same empty state opened 3x in session → offer walkthrough toast
- [ ] Detect idle >90s on complex screen → pulse most likely next action
- [ ] "Don't show hints" preference toggle

### Entry Points
- [ ] Persistent ? icon docked bottom-right
- [ ] ? keyboard shortcut (no input focused)
- [ ] Cmd/Ctrl+/ shortcut focuses help search
- [ ] Sidebar "Help & Learning" nav item (bottom, above profile)
- [ ] Contextual ? icons next to section headers

### Admin Tour Builder
- [ ] Record mode: capture clicks as steps with auto-generated targeting
- [ ] Manual mode: step-by-step form with element picker
- [ ] Preview mode for tours
- [ ] Publish to all / specific roles / specific users

### Seeded Content
- [ ] 6 help categories with icons
- [ ] 10+ seeded help articles covering Getting Started, Contacts, Calendar, Notes, Tasks, Settings
- [ ] 3 seeded tours: Member Onboarding, Import First Contact, Build First Campaign
