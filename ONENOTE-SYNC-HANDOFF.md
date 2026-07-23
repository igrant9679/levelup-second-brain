# OneNote Sync — Handoff Notes

_Last updated: 2026-07-18. Repo: `levelup-second-brain`. Live: https://levelupnow.tools (Railway auto-deploys `main`)._

## TL;DR — where things stand

- OneNote → LevelUp meeting-notes sync is **built and deployed** (app build `2026-07-17-135`, plus two server-only follow-up commits).
- **BLOCKED on one thing:** the user's Microsoft token still lacks the `Notes.Read` scope, so any OneNote call returns a friendly "reconnect your Microsoft account" error. The user must **reconnect the primary Microsoft account once more** and approve the consent (which now includes OneNote). After the last fix this reconnect should finally stick.
- Everything is pushed. No uncommitted work. `main` is at `91ac77e`.

## What the feature does (user-facing)

1. **Take notes from a calendar event** — event popup has 📝 Take notes / Open notes; creates a note typed *Meeting Notes*, tagged, filed, linked to the event.
2. **Link an existing note to a meeting** — note view has a 📅 Meetings row + "＋ Link meeting" picker (±7 days).
3. **Today's Meetings** strip in the Notes-page right rail.
4. **OneNote sync** — pulls pages from a chosen "meeting-notes section" into LevelUp notes (Meeting Notes type, tagged, filed to a Meeting folder), and **auto-links each imported note to the matching calendar event** by date + fuzzy title match. Incremental: re-syncs skip unchanged pages, update edited ones in place (preserving the user's tags/stars/links), never duplicate.
5. **Multiple Microsoft accounts** — connect up to 3; primary + two extras.

## How to use it (the intended flow)

1. Settings → **📝 Word Doc Import** panel (`sp-8`) → scroll to **📓 OneNote Meeting-Notes Sync**.
2. Connect / reconnect Microsoft account (Connect button, or account chips).
3. **Browse notebooks** → open a notebook → click the **★** on the section where Outlook files your meeting notes. That pins it as the meeting-notes source (`D.prefs.onenoteSync = {notebookId, notebookName, sectionId, sectionName, account}`).
4. Sync anytime: the panel's **⟳ Sync meeting notes now**, or **Notes page → ⋮ menu → ⟳ Sync OneNote meeting notes**.

## Architecture / where the code is

Real UI lives in the two legacy bundles, NOT `client/src`. See CLAUDE.md.

### Server
- **`server/routers/onenote.ts`** — the OneNote tRPC router.
  - `ONENOTE_SCOPES` = union of the app's MS scopes + `Notes.Read` (primary slot).
  - `MS_ACCOUNT_SLOTS = ["microsoft","microsoft2","microsoft3"]` — extra accounts stored under slot provider values so the primary `microsoft` token (mail/calendar/contacts) is never overwritten. Extra slots get `Notes.Read`-only consent + `prompt=select_account`.
  - Key procedures: `getAuthUrl({origin,slot?})`, `listAccounts`, `disconnectAccount({slot})`, `listNotebooks/listSections/listPages` (all take optional `account` slot), **`fetchPagesContent({pageIds[],account?})`** (returns page content as markdown — this is the real import primitive), plus the OLD stub `startImport`/`getImportProgress` job machinery (kept but superseded; the job never persisted notes).
  - `getValidMsToken(userId, slot)` + `refreshMsToken(...)` — **refresh omits the `scope` param** (see gotcha below).
  - `onenoteHtmlToMarkdown(html)` — OneNote HTML → markdown converter (pre-existing, unchanged).
- **`server/routers/oauth-sync.ts`** — the MAIN Microsoft connect flow (used by the "Connect" button).
  - `DEFAULT_MS_SCOPES` now **includes `Notes.Read`** so the primary consent grants OneNote in one shot.
  - Its bespoke refresh path also had the scope-stripping bug — fixed (scope param removed).
- **`server/routers/oauth-callbacks.ts`** — `/api/oauth/microsoft/callback`. `parseState` carries an optional `slot`; the token is upserted under that slot (default `microsoft`). `MS_PROVIDER_SLOTS` guards valid slots.
- **`server/_core/refreshOAuthToken.ts`** — the generic scheduled refresh (already correctly omitted scope; untouched).

### Client (`client/public/js/app-part2.js` unless noted)
- OneNote panel markup: appended inside the `sp-8` panel (`#on-accounts`, `#on-browser`, `#on-status-badge`, `#on-progress-*`, etc.).
- `loadOnenoteStatus()` / `loadOnenoteAccounts()` — render account chips + connection state. `_onAccount` module var = the currently-targeted slot.
- `_onSelectAccount / _onConnectExtra / _onDisconnectExtra` — account chip actions.
- `startOnenoteImport(scope, pageId?, pageName?)` — **the real pull-merge import**: lists pages, filters out unchanged (by `lastModified`), batches ids through `onenote.fetchPagesContent` (10 at a time), merges via `_onenoteMergePage`, then `save('notes')`.
- `_onenoteMergePage(p, markdown)` — create-or-update a note keyed on `note.onenotePageId`; sets `noteType:'Meeting Notes'`, tags, Meeting folder; calls `_onenoteMatchMeeting(p)` for the auto calendar link. Preserves user tags/stars/meetings on update.
- `_onenoteMatchMeeting(p)` — fuzzy match a page to a calendar event on its creation date.
- `_onenoteSetMeetingSource / syncOnenoteMeetingNotes` — star a section as source / one-click sync.
- **Meeting↔note linking** (`client/public/js/app-part1.js`): `openMeetingNote`, `openMeetingPicker`, `_noteForEvent`, `unlinkNoteMeeting`, `_noteMeetings`; notes carry `meetings:[{id,title,date}]` snapshots (note = source of truth, so calendar re-syncs can't orphan links). Injected into `openCalEvent` (event popup button), the note read-mode props grid (chips + picker), and the Notes rail (Today's Meetings).

## Data shapes

- Note gains: `onenotePageId`, `onenoteLastModified`, `noteType:'Meeting Notes'`, `source:'OneNote'`, `meetings:[{id,title,date}]`.
- `D.prefs.onenoteSync = { notebookId, notebookName, sectionId, sectionName, account }`.
- OAuth tokens: one row per `(userId, provider)`; provider ∈ `microsoft | microsoft2 | microsoft3 | google`. Unique constraint `uq_oauth_token_user_provider`. **No migration was needed** — slots reuse the existing table.

## Gotchas learned the hard way (READ before touching OAuth)

1. **Never send an explicit `scope` on a Microsoft refresh_token grant.** Naming a subset of consented scopes SILENTLY STRIPS the rest from the new access token (this is why the user reconnected and OneNote still 401'd within the hour). Naming a superset ERRORS. Omit the param → Microsoft returns all originally-consented scopes. Two bespoke refresh paths had this bug (onenote.ts + oauth-sync.ts); both fixed in `d0cb6b2`.
2. **`/common` vs tenant endpoint.** Building the authorize URL against `login.microsoftonline.com/common` routes personal accounts to `login.live.com`, where an org-only Azure app registration fails with `unauthorized_client: not enabled for consumers`. Fix (`91ac77e`): resolve per-user `clientId` + `tenantId` exactly like the main flow and use the tenant endpoint; carry `tenantId` in OAuth state so the callback exchanges at the same endpoint.
3. **Connecting a second account from a DIFFERENT Azure tenant** requires the Azure app registration to be "Accounts in any organizational directory" — a **Azure Portal setting**, not code. Same-tenant second accounts work as-is.
4. The pre-existing OneNote import was a **façade**: `runImportJob` fetched + converted pages then discarded them ("✅ imported N!" but nothing appeared), the settings panel markup never existed, and every toast called an undefined `showToast` (→ `toast`, 13 sites).

## Verify / build / deploy

- Bundles are served verbatim; `index.html` goes through `vite build`. Toolchain IS installed locally now (`pnpm`, `tsc`, `vite`).
- Pre-push checks:
  - `node -c client/public/js/app-part1.js && node -c client/public/js/app-part2.js`
  - **app-part1.js must keep exactly 12 NUL bytes** (markdown-renderer placeholders): `node -e "const b=require('fs').readFileSync('client/public/js/app-part1.js');let n=0;for(const x of b)if(x===0)n++;console.log(n)"`
  - `npx tsc --noEmit` — NOTE: 6 PRE-EXISTING errors in other files (externalTasksCron, smartsheetAdapter, automations, externalSources, imageMigration). The esbuild production build does NOT typecheck, so these never blocked deploys. Only ensure CHANGED files add zero new errors.
  - `pnpm build` then `cmp -s client/public/js/app-part1.js dist/public/js/app-part1.js` (should be identical).
- Bump `APP_BUILD` in `client/index.html` on any client-visible change. Server-only changes keep the build number (detect deploy by behavior, e.g. the new friendly 401 message).
- User reviews before push; commit trailer `Co-Authored-By: Claude ...`.

## Relevant commits (newest first)

- `91ac77e` OneNote connect: main-flow client-credential + tenant resolution (fixes the `unauthorized_client` on "Connect another account").
- `d0cb6b2` MS OAuth: `Notes.Read` on the main consent + stop refreshes stripping scopes.
- `3b4fc17` Meeting-note linking + real OneNote sync + Microsoft multi-account (build -135).

## NEXT STEPS (do these in the new session)

1. Have the user **reconnect the primary Microsoft account** (Settings → Word Doc Import → OneNote → Connect, or the main Accounts panel). Approve OneNote in the consent.
2. Verify the scope stuck: `onenote.listAccounts` should show `hasNotesScope:true` for `microsoft`.
3. Browse notebooks → confirm the right notebook/section with the user → click ★ to set the meeting-notes source.
4. Run **⟳ Sync meeting notes now** and confirm notes appear (Meeting Notes type, auto-linked where a calendar event matches).
5. Optional: if the user wants a genuinely different-tenant 2nd account, walk them through flipping the Azure app registration to multi-tenant.
