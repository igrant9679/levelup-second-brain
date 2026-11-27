# LevelUp multi-workspace — plan and what was built

Status: **phases A–H built 2026-11-15 as build -278 (live). Phase I (self-serve sign-up and billing) built 2026-11-16 as build -279 — off until the operator switches it on.**
Last single-workspace build: -277.

LevelUp is sold to many companies and individuals. Each customer is a **workspace** with its
own owner, admins, members, data, AI keys, mail sender and file storage. Nothing crosses
between workspaces.

## Owner decisions (2026-11-15)

| Question | Decision |
|---|---|
| Membership | One login can belong to **several workspaces**, with a switcher (like Slack). |
| New customers | **The platform operator creates** a workspace and invites its owner. Self-serve sign-up and billing come later (Phase I). |
| AI keys | **Platform keys by default**, with per-workspace daily caps; a workspace's owner or admins may enter their own key instead. Providers: OpenAI, Anthropic, Google Gemini and (2026-11-27) **OpenRouter** — a workspace that chooses OpenRouter uses its own OpenRouter key first, else LevelUp's shared OpenRouter key. |
| Operator access | The operator **manages workspaces but does not read their data**: create, suspend, change owner, see member counts and usage. |
| File storage | **Platform Google Drive by default** (the current one). In Settings a workspace's owner or admin can switch to **their own S3 bucket** or **their own Google Drive**, with step-by-step instructions. |
| Email | **A platform transactional service** (Postmark or Resend — or, since -287, a dedicated SMTP mailbox), branded per workspace ("Acme via LevelUp"), plus one platform reply inbox routed by token. |
| Atlas, CommunityForce / LSI wording | **Private to the original workspace**, as per-workspace features. Plain wording everywhere else. |
| Address | **One address** (levelupnow.tools) plus a workspace switcher. |

## The model that was built (differs from the first draft — read this)

The first draft put a `workspaceId` column on every data table and a `workspace_members`
table. The build does something simpler and safer for this codebase (about 320 queries were
already keyed by `userId`):

- **A `users` row is one MEMBER of one workspace** (`users.workspaceId`). Every table keyed by
  `userId` is therefore inside that workspace *by construction* — a query "where userId = me"
  cannot reach another workspace, including the ones nobody remembered to change.
- **A person in several workspaces** has one LOGIN row (`accountId` NULL: it holds the email,
  password hash and `tokenVersion`) and one further member row per extra workspace
  (`accountId` = the login row's id, no password of its own). The session cookie names a
  member row, so "which workspace" is part of the signed session. **Switching workspace
  re-issues the cookie** for the other member row; the browser wipes its local cache and
  reloads, exactly as when a different account signs in.
- **Owner** = `workspaces.ownerUserId` (a member row). **Admin** = `users.role = 'admin'` on a
  member row, so it is per workspace. **Operator** = `users.platformRole = 'operator'` on a
  login row.
- **What can still cross workspaces** is only code that reads rows NOT keyed by the caller's
  own id: team lists, "shared with me" scans, owner tools, background passes, and endpoints
  that take another person's id from the client. Those go through `server/_core/workspace.ts`
  (`wsMemberIds`, `scopeIds`, `sameWorkspace`, `assertSameWorkspace`, `activeMemberIds`).

Consequences worth knowing:
- **Connections are per workspace.** Outlook / Google / Nifty / SimpleFIN / SMTP belong to a
  member row, so a person connects them in each workspace they use them in. (The draft said
  "per person, shared across workspaces"; per workspace is the safer reading — a company's
  mailbox never follows someone into another company.)
- **Push notifications** are subscribed per workspace, for the same reason.
- A display name is per workspace; the email is the login's (changing it updates every member row).

## What guards it

1. **`pnpm check:tenancy`** (`scripts/check-tenancy.mjs`, in `check:all` and CI) lists every
   drizzle query on a per-user table that has no user-id condition. Each must be scoped or
   carry a reviewed `// tenancy: <reason>` marker. A single-row follow-up by primary key or
   token is allowed only when the key is not taken straight from the request.
2. **A request guard** (`sameWorkspaceInputs` in `_core/trpc.ts`): any input field that names a
   person (`ownerUserId`, `userId`, `linkedUserId`, `primaryAssigneeId`, `assignees[]`, …) must be
   a member of the caller's workspace or the call is refused as "no such person" before the
   procedure runs. A procedure added later is covered without remembering to.
3. **`server/tenancy.isolation.test.ts`** — the acceptance test. Real server code on a real
   MySQL (CI's service, or an ephemeral one from `mysql-memory-server` locally): two
   workspaces are filled through the app's own endpoints, then **every procedure of the
   router is called as a member of the other workspace** with inputs naming the victim's
   people and items — no response may contain a victim marker and none of the victim's rows
   may change — plus the channels one by one (team, shared items, owner tools, AI keys,
   quotas, mail senders, logs, invites, one login in two workspaces, files, PM people,
   names, export, suspension, create → own → close → purge). `pnpm test:tenancy`.

**Rule for every later build:** the isolation test passes before a push; a new table with
customer data has a `userId` (or `workspaceId`) column; never trust a person id from the
client; cross-workspace reads exist only in `operatorProcedure` tools and never return content.

## What each phase delivered

### A — foundation (migrations 0063, 0064)
- `workspaces`, `workspace_settings`, `files`; `users.workspaceId / accountId / platformRole`;
  `team_invites.workspaceId / asOwner`; `audit_log.workspaceId`; `email_delivery_log.workspaceId`.
- Backfill: workspace 1 is created by the migration and every existing account, invite, audit
  row and mail-log row is placed in it; the AI keys, sender and starter layout are copied into
  its settings. At boot `ensureWorkspaceBootstrap()` names its owner (the `OWNER_OPEN_ID`
  account, else its first member) and makes that login the platform operator. Nothing changes
  for current users.
- `users.workspaceId` and `team_invites.workspaceId` have DB default **0** ("no workspace",
  which never exists): a row written without a workspace — by the previous build during the
  deploy, or by a future bug — is inert instead of landing in somebody's workspace.
- Gates: `protectedProcedure`/`wsMemberProcedure`, `adminProcedure`/`wsAdminProcedure`,
  `ownerProcedure`/`wsOwnerProcedure`, `operatorProcedure`.
- `auth.me` returns `workspace {id,name,role,features,branding}`, `workspaces[]`, `isOwner`,
  `isOperator`; a session whose workspace is suspended gets `{workspaceInactive, workspaces}`.

### B — the server, scoped
- Team list, activity feed, "shared with me" for tasks, notes, projects, programs, mind maps,
  sheets, decks, reports and Money: this workspace only. Name → id resolution is one map per
  workspace. `canOverride` is false outside the actor's workspace.
- Settings per workspace (`workspace_settings`): AI keys + provider, notification sender,
  starter layout. AI: the workspace's own key, else the platform's — since -289 LevelUp's own
  keys in `system_settings` (`platformAiKey_*`, `platformAiProvider`), changed only by the
  operator in Platform console → LevelUp's AI keys (before -289 they were the operator
  workspace's keys, which that workspace's admins could change). Quotas: per member, per workspace (operator can set caps), and a platform ceiling.
  **OpenRouter (2026-11-27, `_core/openRouter.ts`):** provider id `openrouter`. Order: a
  workspace that chose OpenRouter → its own `aiKey_openrouter` → LevelUp's shared
  `platformAiKey_openrouter` (encrypted like every AI key; counted against the daily AI limit)
  → its other own keys → LevelUp's keys. The shared OpenRouter key becomes the default for
  workspaces without a key ONLY when the operator sets "Use first" (`platformAiProvider`) to
  OpenRouter. Models: `aiModel_openrouter` (workspace) / `platformAiModel_openrouter` (shared
  key; `platformAiOpenRouterAnyModel` = "1" lets a workspace's own pick apply there); none →
  the newest `anthropic/claude-sonnet…` that lists `tools`, read from OpenRouter's model list
  (`GET /api/v1/models`, no key, cached 6 h). A JSON answer only runs on a model whose
  `supported_parameters` include `response_format` / `structured_outputs` / `tools`; any
  other pick is swapped for the default on those calls. Keys are checked with
  `GET /api/v1/key` before they are saved.
- Operator-only now: backups, error log, scheduled-task log, log retention, storage status,
  `/api/scheduled/*`, the platform Drive reconnect, "check expiring connections".
  Workspace-owner tools stay with each owner: audit log (their workspace's), mail log, sender,
  invites, roles, bulk tools.
- Background jobs handle each person on their own and skip suspended / closed workspaces
  (`activeMemberIds`); each person's turn uses their workspace's AI key and limits
  (`_core/memberContext.ts`). Atlas pulls only into a workspace with the `atlas` feature.

### C — the app (`client/public/js/app-workspace.js`, the 13th bundle)
- Workspace switcher (top bar + user menu, only with more than one workspace); switching wipes
  the local cache and reloads.
- Workspace settings: General (name, role, usage), File storage, Export & close.
- "Workspace suspended / closed" screen with the person's other workspaces.
- Roles come from `auth.me` (`window._luMe`), not from which admin call happens to succeed.

### D — accounts, invites, operator console
- Invites belong to a workspace. A new person sets a password; a person who already has a
  login confirms with **that login's password** and the workspace is added to it (nothing else
  about the login changes). Removing a member ends that membership only.
- Operator console (user menu → Platform console): create a workspace and invite its owner,
  rename, suspend / reactivate, change owner, daily limits, extras, close / reopen; head counts
  and usage. No content.
- Sign-in no longer creates accounts for unknown ids; `ALLOW_SIGNUP=true` gives each sign-up
  its own new workspace.

### E — mail
- `sendEmail` knows the workspace (stated, else the sender's / recipient's). Order: the
  platform mail service if configured → the workspace's own sender (its owner's accounts) →
  for **account mail only** (invites, password resets) the operator workspace's sender.
  Content mail (digests, check-ins, reports, follow-ups) never goes through another
  workspace's mailbox; without a sender it is skipped and logged.
- Platform service (`_core/platformMail.ts`): Postmark, Resend or SMTP, off until configured:
  `MAIL_PROVIDER`, `POSTMARK_SERVER_TOKEN` or `RESEND_API_KEY`, `MAIL_FROM`; or (-287)
  `MAIL_PROVIDER=smtp` + `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (465 TLS / 587 or other STARTTLS,
  never plain), `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, optional `MAIL_SMTP_PER_MINUTE`
  (`MAIL_FROM` optional: the login is the sender); replies:
  `MAIL_INBOUND_ADDRESS`, `MAIL_INBOUND_SECRET` → `POST /api/inbound/mail?key=…`
  (`_core/platformInbound.ts`). From name: "‹Workspace› via LevelUp".
- The reply mailbox is per workspace (its owner's SMTP/IMAP account) until the platform inbox is on.

### F — files
- Every upload by a signed-in member is recorded in `files` and linked as
  `/api/files/x/<id>/<name>`; only members of the file's workspace can open it. Old `d/ s/ f/`
  links and `/manus-storage/` predate workspaces and open for workspace 1 only.
- Settings → File storage: LevelUp storage (a folder per workspace), your own S3 / R2 /
  S3-compatible bucket, or your own Google Drive — instructions, Test, "Move existing files"
  (links don't change, because a link names the record, not the provider).

### G — the original workspace's extras
- Workspace features `atlas` and `cfLabels`, on for workspace 1 only (operator console can
  change them). Server: Atlas load / save / pull, digest and weekly-review wording, coach
  tags, the weekly AI prompt. App: source badges and chips, hat chips, AI prompts, Atlas nav.

### H — data lifecycle
- Workspace export (owner): everything stored for the workspace as one JSON file; secrets left out.
- Close workspace (owner or operator): locked at once, purged after 30 days (daily job);
  the operator can reopen it until then. The nightly encrypted backup stays the platform's
  disaster recovery; the operator's "Download a copy" is now their own workspace only.

### I — self-serve sign-up and billing (build -279, migration 0065)
Everything here is OFF until the operator turns it on (Platform console → Billing & sign-up).
- **The rule:** a workspace with no billing record is not billed — never trialled, limited by a
  plan or locked. Every workspace that existed before, and every one the operator creates by
  hand, stays that way unless the operator changes it on the workspace's Manage page.
- **Plans** (Solo, Team, Business by default; the operator edits names, limits and prices):
  people, AI requests a day, emails a day, file storage; flat or per person. Prices are Stripe
  price ids — the amounts customers see are read from Stripe.
- **Sign-up:** "Create one" on the sign-in page → name, workspace name, email, password → a
  confirmation link by email → the link creates the workspace and its owner and starts the free
  trial (14 days by default, no card). Nothing exists before the link is opened. Throttled per
  address and per IP; refused when the confirmation mail cannot be sent.
- **A further workspace** for someone who already has a login: menu on their name → Create a
  workspace (one free trial at a time).
- **Paying:** the owner chooses a plan in Workspace settings → Plan & billing and pays on
  Stripe's Checkout page; days left in the trial are kept. Card, invoices, plan changes and
  cancelling are in Stripe's customer portal ("Manage billing"). Per-person plans follow the
  member list.
- **When it goes wrong:** a failed payment → email + notice to the owner, 7 days' grace, then
  the workspace is LOCKED. A trial that ends without a plan, or a cancelled subscription, locks
  too. Locked = nobody can open its items, background jobs stop, nothing is deleted; the owner
  can pay (unlocks at once), download everything or close the workspace. Reminder emails: 3
  days before a trial ends, when it has ended, on a failed payment, on the lock.
- **Operator:** plans / prices / trial length / grace / sign-up switch / Terms and Privacy
  links; per workspace: not billed, free on a plan's limits, or a (new / extended) trial. The
  console shows each workspace's billing state — never Stripe ids or content.
- **Abuse limits:** email confirmation, sign-up throttles, one trial at a time per login, trial
  workspaces on the trial plan's AI / mail / storage allowances, the platform-wide ceilings
  from phase B.
- **Not built:** an invoices list inside LevelUp (Stripe's portal has it), coupons beyond
  Stripe's own promotion codes (Checkout accepts them), usage-based pricing.

## Owner actions

- **Launch checklist (-289):** Platform console → "Ready to open sign-up?" lists what is done
  and what is left (mail, Stripe key / webhook / prices, SECRETS_KEY, BACKUP_KEY, backups,
  LevelUp's AI keys), with the steps LevelUp cannot see (Railway health check, Google consent
  screen, Azure account types, a test-mode run) to tick by hand.

- **To switch on platform mail:** choose Postmark or Resend, sign up, verify the sending
  domain (DNS: SPF / DKIM / DMARC), then set `MAIL_PROVIDER`, the API token and `MAIL_FROM` on
  Railway. **Or, without a new service (-287):** a mailbox used only for LevelUp's mail
  (e.g. `notify@` on its own domain, with an app password) — set `MAIL_PROVIDER=smtp`,
  `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (465 or 587), `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, and
  `MAIL_SMTP_PER_MINUTE` to stay under the mailbox's sending limit. Mailboxes usually allow a
  few hundred mails a day; every workspace's mail then counts against that. Don't use a
  personal mailbox: copies of customers' digests and check-ins would land in its Sent folder. For replies by email also set up inbound mail and `MAIL_INBOUND_ADDRESS` /
  `MAIL_INBOUND_SECRET`. Until then: invites to new workspaces go out through your own sender,
  and a new workspace's digests / check-ins need its owner to connect a mail account.
- **For "own Google Drive" to work for customers:** in Google Cloud, the OAuth consent screen of
  the `GOOGLE_DRIVE_CLIENT_ID` app must be **External** and **Published** (scope `drive.file`).
- **Before other companies connect Microsoft:** make the Azure app registration multi-tenant
  and unset or adjust `MS_TENANT_ID`.
- **Still open:** set `BACKUP_KEY` and `SECRETS_KEY` on Railway.
- **OpenRouter (2026-11-27), when you want it:** create a key at openrouter.ai/settings/keys
  (set a credit limit on it there if you want a ceiling) and paste it in Platform console →
  LevelUp's AI keys → OpenRouter (checked with OpenRouter on save; shows the credit left).
  From then on every workspace that picks OpenRouter in its own Settings → AI Features and
  has no OpenRouter key of its own runs on it, within its daily AI limit. Choose the model for
  that key on the same card. To make OpenRouter the default for **every** workspace without a
  key, set "Use first" to OpenRouter and Save; set it back to switch back. Nothing is needed
  on Railway.
- **To switch on sign-up and billing (Phase I):**
  1. The **platform** mail service (above: Postmark, Resend or `MAIL_PROVIDER=smtp`). Since
     build -288 (Audit 3) sign-up is not offered at all without it — otherwise sign-up
     confirmations, password resets and invitations for other companies' workspaces would go
     out from your own mailbox (which would then hold live sign-in links for every customer).
  2. A Stripe account. Start in **test mode**. Create a Product per plan with a recurring Price
     (monthly, and yearly if wanted); paste each `price_…` id into Platform console → Billing &
     sign-up.
  3. On Railway: `STRIPE_SECRET_KEY` (Stripe → Developers → API keys) and
     `STRIPE_WEBHOOK_SECRET` (Stripe → Developers → Webhooks → add endpoint
     `https://levelupnow.tools/api/stripe/webhook` with the six events listed on that screen).
  4. In Stripe → Settings → Billing → Customer portal: switch it on. Since -288 LevelUp opens
     the portal with its own settings (card, invoices, billing details, cancel at period end —
     NOT plan or quantity changes, which happen inside LevelUp with its head-count check).
  5. Decide prices and trial length. Terms and Privacy: since -290 LevelUp has built-in DRAFTS at
     `/terms` and `/privacy` (Billing & sign-up → "Use LevelUp's built-in Terms and Privacy
     pages"). Fill in the business name, contact email and governing law there, decide how long
     backups are kept (nightly backups are currently NEVER deleted; the Privacy page shows a
     placeholder for the period, which needs a text edit in `server/_core/publicPages.ts`), have
     a lawyer review both, then tick "have been reviewed" (removes the "Draft" notice). Or paste
     links to your own. Tax: Stripe Tax can be ticked on once it is set up in Stripe.
  6. Tick "Anyone can create a workspace". Try the whole path with a Stripe test card before
     putting in live keys.

## Audit 3 (build -288, 2026-11-19)

A security review of everything above before sign-up opens: 49 findings, none critical, no
confirmed way for one workspace to read another's data. All fixed in -288 (see the repo's
CLAUDE.md, block "-288") except one owner decision: admins of the operator's workspace manage
its AI keys (-277), and those keys are also the platform's fallback for customers without a key.
The main changes for customers: one free trial per person (normalised email + login), small
daily AI / email allowances during a free trial, locked workspaces get no background work,
plan upgrades apply once paid, invitation links go only to the invited mailbox, a new sign-in
email must be confirmed from that address, sign-in throttling per address and IP.

## Build -289 (2026-11-19)

The Audit 3 owner decision (O9) closed: the keys customers fall back on are LevelUp's own,
separate from the operator workspace's, and only the operator changes them. They were copied
once from the operator workspace's keys when -289 first looked them up, so nothing changed for
customers. Plus the launch checklist above.

## Build -290 (2026-11-19)

A public front page (`/welcome`, also `/pricing`): what LevelUp is, the plans with the prices
read from Stripe, "Start free trial" (`/?start=signup` opens the sign-up form). `/` shows it
only to a first-time visitor (no session, no `lu_app` cookie, which the app sets on every
browser that opens it) and only while sign-up is actually offered and "Show the front page"
is ticked — so nothing changes at `/` until sign-up opens. Draft Terms (`/terms`) and Privacy
(`/privacy`) written from what LevelUp stores and sends. All three are rendered on the server,
run no script and load nothing from another site.

## Known gaps (follow-ups)

- ~~Report widget presets, Help articles and a few Settings descriptions still say "CF / LSI"
  for every workspace (static text).~~ Fixed in build -282 (`_luWsText`, `_wsNeutralWording`).
- Billing has only ever run against the FAKE Stripe in the tests and the local playground —
  the first real run should be in Stripe's test mode.
- ~~Moving files runs in the web process; a very large workspace would want a queue.~~ Since build
  -283 a move is a stored job worked through in slices by the "file-moves" background job
  (resumes after a restart, can be stopped). It still runs inside the server's process. Since
  -285 a file is streamed from the old storage to the new one in 8 MiB pieces (S3 multipart /
  Drive resumable), not read into memory whole (legacy Forge storage excepted). Since -285 the
  owner also sees Stripe's exact amount before a plan change is confirmed.
