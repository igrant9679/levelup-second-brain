/**
 * Help Router — Ask AI procedure
 *
 * Procedures:
 *  help.askAI  — answer a natural-language question using help article content as context
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ---- Help article content (mirrors HC_ARTICLES in client/index.html) ----
const HELP_ARTICLES = [
  {
    id: 1,
    slug: "welcome",
    title: "Welcome to LevelUp",
    summary: "A quick overview of every module and how they connect.",
    tags: ["intro", "overview"],
    body: `## Welcome to LevelUp

LevelUp is your Second Brain — a unified workspace that connects tasks, notes, calendar, habits, goals, contacts, and mail in one place.

### Core Modules
- **Home** — daily command centre with top tasks, upcoming meetings, habit check-ins, and recent notes
- **My Day / My Week / My Year** — time-scoped views that surface what matters now
- **Quick Capture** — press C anywhere to capture a thought without losing context
- **Tasks** — full task management with AI decomposition, deadline risk detection, and auto-priority scoring
- **Notes** — rich-text knowledge base with wiki-links, AI Q&A, and concept linking
- **Calendar** — Week/Day/Month views synced with Google Calendar and Microsoft 365
- **Habits** — streak tracking with mood correlation and AI coaching
- **Goals** — OKR-style goal tracking with AI progress narratives
- **Contacts** — CRM with Clodura enrichment, health scores, and conversation starters
- **Mail** — unified inbox with AI reply drafts and triage scoring
- **Focus** — Pomodoro-style focus sessions linked to tasks
- **Coach** — AI coach that synthesises data across all modules

### Getting Started
1. Complete the **Member Onboarding** guided tour (Help & Learning → Guided Tours)
2. Add your first task with **+ New → Task** or press **T**
3. Connect your calendar in **Settings → Integrations**`,
  },
  {
    id: 2,
    slug: "quick-capture",
    title: "Quick Capture (Cmd+C)",
    summary: "How to capture any thought instantly without losing context.",
    tags: ["capture", "shortcut"],
    body: `## Quick Capture

Quick Capture lets you record any thought — task, note, idea, or event — without navigating away from what you're doing.

### How to Open Quick Capture
- Press **C** anywhere (when no text input is focused)
- Click **+ New** in the top bar
- Press **Cmd/Ctrl+C** (when no text is selected)

### Capture Types
Choose from: **Task**, **Note**, **Project**, **Goal**, **Journal**, **Habit**

### Tips
- Type naturally — LevelUp will suggest the right type based on your text
- Add **#tags** inline to categorise instantly
- Add **@person** to link to a contact
- Add **!high** or **!urgent** to set priority
- Press **Enter** to save, **Esc** to cancel`,
  },
  {
    id: 3,
    slug: "tasks-overview",
    title: "Managing Tasks",
    summary: "Create, organise, and complete tasks with AI assistance.",
    tags: ["tasks", "ai", "priority"],
    body: `## Managing Tasks

### Creating Tasks
- Click **+ Add Task** in the Tasks screen or Home widget
- Press **T** anywhere for Quick Capture → Task
- Use **+ New → Task** in the top bar

### Task Fields
- **Title** — what needs to be done
- **Priority** — High / Medium / Low (or use AI auto-scoring)
- **Due Date** — deadline with overdue detection
- **Project** — link to a project for grouping
- **Tags** — freeform labels (e.g. #deepwork, #admin)
- **Contact** — link to a CRM contact
- **Subtasks** — break a task into steps

### AI Features
- **✨ Decompose** — paste a goal and AI breaks it into a prioritised task list
- **⚠️ Risk** — flags projects likely to miss their deadlines
- **🎯 Prioritise** — scores tasks by urgency × importance × energy
- **👤 Delegate** — suggests the best team member for each task
- **🔓 Unblock** — suggests the next action when a task is blocked

### Views
Switch between **List**, **Board** (Kanban), **Timeline**, and **Calendar** views using the toolbar.`,
  },
  {
    id: 4,
    slug: "calendar-overview",
    title: "Using the Calendar",
    summary: "Navigate Week, Day, and Month views and create events.",
    tags: ["calendar", "events"],
    body: `## Using the Calendar

### Views
- **Week** — default view showing 7 days with time slots
- **Day** — single-day detail with hour-by-hour layout
- **Month** — overview with event dots

Switch views with the toolbar buttons or keyboard shortcuts: **W** (week), **D** (day), **M** (month).

### Creating Events
- Click any empty time slot to create an event
- Use **+ New → Event** in the top bar
- Type naturally in Quick Capture: "Meeting with Sarah tomorrow at 3pm"

### Connecting Your Calendar
Go to **Settings → Integrations** and connect Google Calendar or Microsoft 365. Events sync automatically every 15 minutes.

### AI Features
- **📋 Meeting Prep** — auto-generates a brief from linked notes, tasks, and contacts before an event
- **🔄 Optimise** — suggests moving meetings to protect deep-focus blocks
- **📝 Post-Meeting** — extracts action items from meeting notes as tasks`,
  },
  {
    id: 5,
    slug: "notes-overview",
    title: "Notes & Knowledge Base",
    summary: "Capture and connect your knowledge with rich text and AI.",
    tags: ["notes", "ai", "rte"],
    body: `## Notes & Knowledge Base

### Creating Notes
- Click **+ New Note** in the Notes screen or Home widget
- Press **N** anywhere for Quick Capture → Note
- Notes support rich text: headings, bold, italic, lists, code blocks, and tables

### Wiki Links
Type **[[** to link to another note. Linked notes appear in the backlinks panel on the right.

### File Attachments
Drag and drop files onto a note, or use the attachment button in the toolbar. Supported: PDF, images, Word documents, spreadsheets.

### AI Features
- **🔗 Link Concepts** — detects concepts matching existing notes and suggests bi-directional links
- **🔍 Gap Detection** — identifies what is missing or under-documented on a topic
- **💬 Q&A** — ask questions and get answers sourced from your own notes
- **📄 Expand** — expand a rough note into a structured document

### Organising Notes
Use **tags** and **folders** to organise. The search bar supports full-text and semantic search.`,
  },
  {
    id: 6,
    slug: "contacts-enrichment",
    title: "Contacts & Clodura Enrichment",
    summary: "Manage your contact database and enrich records with AI.",
    tags: ["contacts", "clodura", "enrichment"],
    body: `## Contacts & Clodura Enrichment

### Adding Contacts
Click **+ Add Contact** or import a CSV. LinkedIn export CSVs are supported directly.

### Clodura Enrichment
1. Go to **Settings → Integrations → Contact Enrichment** and add your Clodura API key
2. Click **🔍 Enrich** on any contact row, or **Enrich All via Clodura** for bulk enrichment
3. Enriched fields include: verified email, phone, LinkedIn, company size, industry, and 40+ attributes

### AI Features
- **💚 Health Score** — scores all contacts by recency, follow-up completion, and interaction frequency
- **💬 Starters** — suggests talking points before a meeting with a contact
- **🔍 Duplicates** — detects contacts that may be the same person

### Activity Log
Open any contact's detail drawer to see all tasks linked to that contact via the 'contact:' tag.`,
  },
  {
    id: 7,
    slug: "settings-integrations",
    title: "Settings & Integrations",
    summary: "Connect accounts, configure preferences, and manage your workspace.",
    tags: ["settings", "integrations", "google", "microsoft"],
    body: `## Settings & Integrations

### Profile & Preferences
Go to **Settings → Profile** to update your name, avatar, timezone, and notification preferences.

### Calendar Integration
- **Google Calendar** — click Connect under Google in Settings → Integrations. Grant calendar read/write access.
- **Microsoft 365** — click Connect under Microsoft. Syncs calendar, mail, and contacts.

### Contact Enrichment
Add your **Clodura API key** under Settings → Integrations → Contact Enrichment to enable one-click contact enrichment.

### Notifications
Configure email and in-app notifications for task due dates, mentions, habit reminders, and weekly reports.

### Team & Members
Owners and Admins can invite team members under Settings → Team. Set roles: Owner, Admin, or Member.

### Data & Privacy
Export all your data as a ZIP file from Settings → Data. Delete your account from Settings → Danger Zone.`,
  },
  {
    id: 8,
    slug: "habits-streaks",
    title: "Habits & Streak Tracking",
    summary: "Build consistent habits with streak tracking, heatmaps, and AI coaching.",
    tags: ["habits", "streaks", "ai"],
    body: `## Habits & Streak Tracking

### Creating a Habit
Click **+ Add Habit** and set:
- **Name** — what you want to track
- **Cadence** — Daily, 3x/week, Weekly, or Custom
- **Category** — Health, Learning, Work, Personal
- **Target** — optional numeric target (e.g. "Read 20 pages")

### Checking In
Tap the habit row on the Habits screen or the Home widget to mark it done for today. You can also log a value for numeric habits.

### Streaks & Heatmap
The streak counter shows your current consecutive completion run. The heatmap shows the last 30 days — green for done, purple for skipped, grey for missed.

### Cadence-Aware Streaks
- **Daily** habits count consecutive days
- **Weekly / 3x/week** habits count consecutive ISO weeks with enough completions

### AI Features
- **💜 Mood Correlation** — cross-references journal mood with habit completion
- **🎯 Coaching** — suggests a more achievable cadence when a streak breaks
- **📊 Wellbeing Report** — auto-generates a Sunday evening summary`,
  },
  {
    id: 9,
    slug: "goals-okr",
    title: "Goals & OKR Tracking",
    summary: "Set and track goals with AI-powered progress narratives and alignment checks.",
    tags: ["goals", "okr", "ai"],
    body: `## Goals & OKR Tracking

### Creating a Goal
Click **+ Add Goal** and set a title, description, target date, and linked tasks.

### Progress Tracking
Goal progress is calculated from linked task completion rates. The progress bar updates automatically.

### Milestones
Add milestones to break a goal into phases. Each milestone has its own due date and completion status.

### OKR Mode
Toggle **🎯 OKR** in the Goals toolbar to switch to OKR view. Objectives are your goals; Key Results are milestones.

### AI Features
- **✨ Progress** — generates a plain-English progress narrative for each goal
- **📅 Review** — auto-populates a weekly review template with data from tasks, habits, and calendar
- **🔗 Align** — analyses whether your daily tasks are actually moving your top-level goals forward`,
  },
  {
    id: 10,
    slug: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    summary: "Master LevelUp with keyboard shortcuts for every action.",
    tags: ["shortcuts", "keyboard", "productivity"],
    body: `## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **C** | Quick Capture |
| **T** | New Task |
| **N** | New Note |
| **Cmd/Ctrl+K** | Global Search |
| **Cmd/Ctrl+/** | Focus Help Search |
| **?** | Open Help Center |
| **Esc** | Close modal / drawer |
| **Cmd/Ctrl+S** | Save note (in editor) |
| **1–9** | Navigate to screen N in sidebar |

### In Calendar
| Shortcut | Action |
|---|---|
| **W** | Week view |
| **D** | Day view |
| **M** | Month view |
| **← →** | Previous / Next period |`,
  },
];

// Build a compact context string from all articles for the LLM system prompt
function buildArticleContext(): string {
  return HELP_ARTICLES.map(
    (a) => `### Article: ${a.title}\nSummary: ${a.summary}\nTags: ${a.tags.join(", ")}\n\n${a.body}`
  ).join("\n\n---\n\n");
}

// Find the most relevant articles for a given question
function findRelevantArticles(question: string, topN = 3): typeof HELP_ARTICLES {
  const ql = question.toLowerCase();
  const scored = HELP_ARTICLES.map((a) => {
    let score = 0;
    if (a.title.toLowerCase().includes(ql)) score += 5;
    if (a.summary.toLowerCase().includes(ql)) score += 3;
    if (a.tags.some((t) => ql.includes(t) || t.includes(ql))) score += 4;
    if (a.body.toLowerCase().includes(ql)) score += 2;
    // Also match individual words
    const words = ql.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      if (a.title.toLowerCase().includes(word)) score += 2;
      if (a.tags.some((t) => t.includes(word))) score += 2;
      if (a.body.toLowerCase().includes(word)) score += 1;
    }
    return { article: a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.article);
}

export const helpRouter = router({
  askAI: publicProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional()
          .default([]),
      })
    )
    .mutation(async ({ input }) => {
      const { question, conversationHistory } = input;

      // Find the most relevant articles for this question
      const relevantArticles = findRelevantArticles(question, 4);

      // Build focused context from relevant articles (or all if none found)
      const contextArticles = relevantArticles.length > 0 ? relevantArticles : HELP_ARTICLES.slice(0, 3);
      const articleContext = contextArticles
        .map((a) => `### ${a.title}\n${a.body}`)
        .join("\n\n---\n\n");

      const systemPrompt = `You are the LevelUp Help Assistant — a friendly, concise AI that answers questions about the LevelUp Second Brain application.

You have access to the following help articles from the LevelUp knowledge base:

${articleContext}

Instructions:
- Answer questions based ONLY on the help article content provided above
- Be concise and direct — aim for 2-4 short paragraphs maximum
- Use **bold** for key UI elements, shortcuts, and button names
- If the answer involves steps, use a numbered list
- If you cite information from a specific article, mention the article title naturally (e.g. "According to the Managing Tasks guide...")
- If the question is not covered by the articles, say so honestly and suggest the user browse the Help Center or contact support
- Do NOT make up features or functionality that are not mentioned in the articles
- End your response with a brief "💡 Tip:" if there's a relevant shortcut or pro tip from the articles`;

      // Build conversation messages
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      // Add conversation history (last 6 exchanges max)
      const recentHistory = conversationHistory.slice(-6);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Add the current question
      messages.push({ role: "user", content: question });

      const llmResponse = await invokeLLM({ messages });
      const answer = llmResponse.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate an answer. Please try again.";

      return {
        answer,
        citedArticles: contextArticles.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
        })),
      };
    }),
});
