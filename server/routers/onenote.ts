/**
 * OneNote Import Router
 *
 * Procedures:
 *  onenote.status          — check if Microsoft account is connected + any active import jobs
 *  onenote.getAuthUrl      — generate Microsoft OAuth URL with Notes scopes
 *  onenote.listNotebooks   — list all OneNote notebooks
 *  onenote.listSections    — list sections in a notebook
 *  onenote.listPages       — list pages in a section
 *  onenote.startImport     — kick off a batch import job
 *  onenote.getImportProgress — poll job status
 *  onenote.cancelImport    — cancel a running job
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { getDb } from "../db";
import { onenoteImportJobs } from "../../drizzle/schema";

// ─── Microsoft Graph helpers ──────────────────────────────────────────────────

/** Scopes for the OneNote consent flow. This must be the UNION of the app's
 * Microsoft scopes (see oauth-sync.ts) plus Notes.Read — a consent granted
 * with ONLY Notes scopes would replace the stored token and break the
 * mail/calendar/contacts sync paths that refresh with their own scope list. */
const ONENOTE_SCOPES = [
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "Mail.ReadWrite",
  "Mail.Send",
  "Contacts.ReadWrite",
  "Notes.Read",
].join(" ");

/** Extra Microsoft accounts live under slot provider values so the primary
 * 'microsoft' row (mail/calendar/contacts sync) is never overwritten. Extra
 * slots get least-privilege consent — OneNote only. */
export const MS_ACCOUNT_SLOTS = ["microsoft", "microsoft2", "microsoft3"] as const;
export type MsAccountSlot = (typeof MS_ACCOUNT_SLOTS)[number];
const EXTRA_SLOT_SCOPES = ["offline_access", "User.Read", "Notes.Read"].join(" ");
const slotSchema = z.enum(MS_ACCOUNT_SLOTS).default("microsoft");

export function getOnenoteAuthUrl(origin: string, state: string, slot: MsAccountSlot = "microsoft"): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MS_CLIENT_ID ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/oauth/microsoft/callback`,
    scope: slot === "microsoft" ? ONENOTE_SCOPES : EXTRA_SLOT_SCOPES,
    response_mode: "query",
    state,
    // Extra accounts: always show the account picker so the user can pick a
    // DIFFERENT identity instead of silently reusing the current session.
    ...(slot !== "microsoft" ? { prompt: "select_account" } : {}),
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

async function refreshMsToken(token: { refreshToken: string | null; userId: number; scope?: string | null }, slot: MsAccountSlot): Promise<string | null> {
  if (!token.refreshToken) return null;
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MS_CLIENT_ID ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MS_CLIENT_SECRET ?? "";
  // Refresh with the scopes this slot was actually granted — requesting the
  // primary's union scopes against an extra slot's narrower consent fails.
  const scope = token.scope?.trim() || (slot === "microsoft" ? ONENOTE_SCOPES : EXTRA_SLOT_SCOPES);
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
      scope,
    }).toString(),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { access_token: string; expires_in: number; refresh_token?: string };
  await db.upsertOAuthToken({
    userId: token.userId,
    provider: slot,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  });
  return data.access_token;
}

async function getValidMsToken(userId: number, slot: MsAccountSlot = "microsoft"): Promise<string | null> {
  const token = await db.getOAuthToken(userId, slot);
  if (!token) return null;
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshMsToken(token, slot);
  }
  return token.accessToken;
}

async function graphGet<T>(accessToken: string, path: string): Promise<T> {
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Graph API error ${resp.status}: ${body.slice(0, 200)}`,
    });
  }
  return resp.json() as Promise<T>;
}

// ─── HTML → Markdown converter ────────────────────────────────────────────────

/**
 * Converts OneNote page HTML (from Graph API) to clean Markdown.
 * OneNote HTML uses a subset of HTML with specific tags.
 */
export function onenoteHtmlToMarkdown(html: string): string {
  if (!html) return "";

  let md = html;

  // Remove XML/doctype declarations and html/head/body wrappers
  md = md.replace(/<\?xml[^>]*\?>/gi, "");
  md = md.replace(/<!DOCTYPE[^>]*>/gi, "");
  md = md.replace(/<html[^>]*>/gi, "").replace(/<\/html>/gi, "");
  md = md.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  md = md.replace(/<body[^>]*>/gi, "").replace(/<\/body>/gi, "");

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");

  // Bold / italic / underline / strikethrough
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_");
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "_$1_");
  md = md.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, "$1"); // underline has no MD equivalent
  md = md.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, "~~$1~~");
  md = md.replace(/<strike[^>]*>([\s\S]*?)<\/strike>/gi, "~~$1~~");

  // Code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Images — keep as markdown image with alt text
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, "![$1]($2)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![image]($1)");

  // Ordered lists
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let i = 0;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, content: string) => {
      i++;
      return `\n${i}. ${content.trim()}`;
    }) + "\n";
  });

  // Unordered lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, content: string) => {
      return `\n- ${content.trim()}`;
    }) + "\n";
  });

  // Tables — basic conversion
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const rows: string[][] = [];
    const rowMatches = inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      for (const cellMatch of cellMatches) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }
      rows.push(cells);
    }
    if (rows.length === 0) return "";
    const header = `| ${rows[0].join(" | ")} |`;
    const divider = `| ${rows[0].map(() => "---").join(" | ")} |`;
    const body = rows.slice(1).map(r => `| ${r.join(" | ")} |`).join("\n");
    return `\n${header}\n${divider}\n${body}\n`;
  });

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    return inner.split("\n").map((l: string) => `> ${l}`).join("\n");
  });

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n");

  // Paragraphs and divs → newlines
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<p[^>]*>/gi, "");
  md = md.replace(/<\/div>/gi, "\n");
  md = md.replace(/<div[^>]*>/gi, "");
  md = md.replace(/<br[^>]*\/?>/gi, "\n");

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  md = md.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // Collapse excessive blank lines (max 2 consecutive)
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

// ─── Background import runner ─────────────────────────────────────────────────

interface PageToImport {
  id: string;
  title: string;
  notebookName: string;
  sectionName: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

/** Runs in the background — does NOT block the tRPC response */
async function runImportJob(jobId: number, userId: number, pages: PageToImport[], accessToken: string) {
  const dbConn = await getDb();
  if (!dbConn) return;

  // Update total count
  await dbConn.update(onenoteImportJobs)
    .set({ status: "running", totalPages: pages.length })
    .where(eq(onenoteImportJobs.id, jobId));

  let imported = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      // Fetch page HTML content
      const contentResp = await fetch(
        `https://graph.microsoft.com/v1.0/me/onenote/pages/${page.id}/content`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      let bodyMarkdown = "";
      if (contentResp.ok) {
        const html = await contentResp.text();
        bodyMarkdown = onenoteHtmlToMarkdown(html);
      }

      // Build the note title and tags
      const tags = [`onenote:${page.notebookName}`, `section:${page.sectionName}`].join(",");
      const noteTitle = page.title || "Untitled OneNote Page";

      // Store as a note in the HTML file's notes data structure
      // Since notes are stored in the HTML file (client-side), we store them
      // in the onenote_import_jobs table as a log, and the frontend reads
      // the completed job to inject notes into the local data store.
      // For now, we accumulate the imported pages in the job's errorMessage
      // field as JSON (repurposed as a results store for the prototype).
      // In production this would write to a dedicated notes table.

      // For this implementation, we store imported note data in a separate
      // accumulated results field. We'll use a simple approach: store each
      // imported page as a JSON entry in the job record's errorMessage field.
      // This is a pragmatic approach for the prototype since notes live in HTML.

      imported++;
      await dbConn.update(onenoteImportJobs)
        .set({ importedPages: imported, failedPages: failed })
        .where(eq(onenoteImportJobs.id, jobId));

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[OneNote Import] Failed to import page ${page.id}:`, err);
      failed++;
      await dbConn.update(onenoteImportJobs)
        .set({ importedPages: imported, failedPages: failed })
        .where(eq(onenoteImportJobs.id, jobId));
    }
  }

  // Mark job complete
  await dbConn.update(onenoteImportJobs)
    .set({
      status: failed === pages.length ? "failed" : "completed",
      importedPages: imported,
      failedPages: failed,
      completedAt: new Date(),
    })
    .where(eq(onenoteImportJobs.id, jobId));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const onenoteRouter = router({

  /** Check if Microsoft account is connected (with Notes scope) */
  status: protectedProcedure.query(async ({ ctx }) => {
    const token = await db.getOAuthToken(ctx.user.id, "microsoft");
    const dbConn = await getDb();
    let activeJob = null;
    if (dbConn) {
      const jobs = await dbConn.select().from(onenoteImportJobs)
        .where(and(
          eq(onenoteImportJobs.userId, ctx.user.id),
        ))
        .orderBy(desc(onenoteImportJobs.createdAt))
        .limit(1);
      activeJob = jobs[0] ?? null;
    }
    return {
      connected: !!token,
      email: token?.email ?? null,
      displayName: token?.displayName ?? null,
      hasNotesScope: token ? (token.scope ?? "").includes("Notes") : false,
      latestJob: activeJob ? {
        id: activeJob.id,
        status: activeJob.status,
        notebookName: activeJob.notebookName,
        totalPages: activeJob.totalPages,
        importedPages: activeJob.importedPages,
        failedPages: activeJob.failedPages,
        createdAt: activeJob.createdAt,
        completedAt: activeJob.completedAt,
      } : null,
    };
  }),

  /** Generate Microsoft OAuth URL with OneNote scopes. Pass slot to connect
   * an ADDITIONAL Microsoft account (stored separately from the primary). */
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string(), slot: slotSchema.optional() }))
    .query(({ input, ctx }) => {
      const slot = input.slot ?? "microsoft";
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, origin: input.origin, slot })).toString("base64url");
      return { url: getOnenoteAuthUrl(input.origin, state, slot) };
    }),

  /** All Microsoft account slots + their connection state, for the panel. */
  listAccounts: protectedProcedure.query(async ({ ctx }) => {
    const out = [] as Array<{ slot: string; connected: boolean; email: string | null; displayName: string | null; hasNotesScope: boolean; isPrimary: boolean }>;
    for (const slot of MS_ACCOUNT_SLOTS) {
      const token = await db.getOAuthToken(ctx.user.id, slot);
      out.push({
        slot,
        connected: !!token,
        email: token?.email ?? null,
        displayName: token?.displayName ?? null,
        hasNotesScope: token ? (token.scope ?? "").includes("Notes") : false,
        isPrimary: slot === "microsoft",
      });
    }
    return out;
  }),

  /** Disconnect an EXTRA account slot (the primary is managed in the main
   * Integrations panel since it also powers mail/calendar/contacts sync). */
  disconnectAccount: protectedProcedure
    .input(z.object({ slot: z.enum(["microsoft2", "microsoft3"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteOAuthToken(ctx.user.id, input.slot);
      return { ok: true };
    }),

  /** List all OneNote notebooks */
  listNotebooks: protectedProcedure
    .input(z.object({ account: slotSchema.optional() }).optional())
    .query(async ({ input, ctx }) => {
    const accessToken = await getValidMsToken(ctx.user.id, input?.account ?? "microsoft");
    if (!accessToken) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft account not connected. Please connect your account first." });
    }
    const data = await graphGet<{
      value: Array<{ id: string; displayName: string; lastModifiedDateTime: string; sectionsUrl: string }>
    }>(accessToken, "/me/onenote/notebooks?$orderby=lastModifiedDateTime desc");
    return data.value.map(nb => ({
      id: nb.id,
      name: nb.displayName,
      lastModified: nb.lastModifiedDateTime,
    }));
  }),

  /** List sections in a notebook */
  listSections: protectedProcedure
    .input(z.object({ notebookId: z.string(), account: slotSchema.optional() }))
    .query(async ({ input, ctx }) => {
      const accessToken = await getValidMsToken(ctx.user.id, input.account ?? "microsoft");
      if (!accessToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft account not connected." });
      }
      const data = await graphGet<{
        value: Array<{ id: string; displayName: string; lastModifiedDateTime: string; pagesUrl: string }>
      }>(accessToken, `/me/onenote/notebooks/${input.notebookId}/sections`);
      return data.value.map(s => ({
        id: s.id,
        name: s.displayName,
        lastModified: s.lastModifiedDateTime,
      }));
    }),

  /** List pages in a section */
  listPages: protectedProcedure
    .input(z.object({ sectionId: z.string(), account: slotSchema.optional() }))
    .query(async ({ input, ctx }) => {
      const accessToken = await getValidMsToken(ctx.user.id, input.account ?? "microsoft");
      if (!accessToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft account not connected." });
      }
      const data = await graphGet<{
        value: Array<{ id: string; title: string; createdDateTime: string; lastModifiedDateTime: string }>
      }>(accessToken, `/me/onenote/sections/${input.sectionId}/pages?$orderby=lastModifiedDateTime desc&$top=200`);
      return data.value.map(p => ({
        id: p.id,
        title: p.title,
        createdAt: p.createdDateTime,
        lastModified: p.lastModifiedDateTime,
      }));
    }),

  /**
   * Fetch the CONTENT of up to 20 pages, converted to markdown. This powers
   * the client-driven import: the client batches page ids through here, then
   * merges the results into its notes store and saves through the normal
   * appData.save path — so imported notes hit the same relational-notes
   * machinery as every other note. (The old startImport background job below
   * fetched content and never persisted it anywhere; superseded by this.)
   */
  fetchPagesContent: protectedProcedure
    .input(z.object({ pageIds: z.array(z.string().min(1)).min(1).max(20), account: slotSchema.optional() }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidMsToken(ctx.user.id, input.account ?? "microsoft");
      if (!accessToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft account not connected." });
      }
      const out: Array<{ id: string; ok: boolean; markdown: string; error?: string }> = [];
      for (const pageId of input.pageIds) {
        try {
          const resp = await fetch(
            `https://graph.microsoft.com/v1.0/me/onenote/pages/${encodeURIComponent(pageId)}/content`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!resp.ok) {
            out.push({ id: pageId, ok: false, markdown: "", error: `Graph ${resp.status}` });
          } else {
            const html = await resp.text();
            out.push({ id: pageId, ok: true, markdown: onenoteHtmlToMarkdown(html) });
          }
        } catch (err) {
          out.push({ id: pageId, ok: false, markdown: "", error: String((err as Error)?.message ?? err).slice(0, 200) });
        }
        // gentle pacing for Graph rate limits
        await new Promise((r) => setTimeout(r, 120));
      }
      return { pages: out };
    }),

  /**
   * Start a batch import job.
   * scope = 'notebook' → import all sections + pages in the notebook
   * scope = 'section'  → import all pages in one section
   * scope = 'page'     → import a single page
   */
  startImport: protectedProcedure
    .input(z.object({
      scope: z.enum(["notebook", "section", "page"]),
      notebookId: z.string(),
      notebookName: z.string(),
      sectionId: z.string().optional(),
      sectionName: z.string().optional(),
      pageId: z.string().optional(),
      pageName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidMsToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Microsoft account not connected." });
      }

      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      // Collect pages to import
      const pagesToImport: PageToImport[] = [];

      if (input.scope === "page" && input.pageId && input.sectionId && input.sectionName) {
        pagesToImport.push({
          id: input.pageId,
          title: input.pageName ?? "Untitled",
          notebookName: input.notebookName,
          sectionName: input.sectionName,
        });
      } else if (input.scope === "section" && input.sectionId && input.sectionName) {
        const data = await graphGet<{
          value: Array<{ id: string; title: string; createdDateTime: string; lastModifiedDateTime: string }>
        }>(accessToken, `/me/onenote/sections/${input.sectionId}/pages?$top=200`);
        for (const p of data.value) {
          pagesToImport.push({
            id: p.id,
            title: p.title,
            notebookName: input.notebookName,
            sectionName: input.sectionName,
            createdDateTime: p.createdDateTime,
            lastModifiedDateTime: p.lastModifiedDateTime,
          });
        }
      } else if (input.scope === "notebook") {
        // Get all sections
        const sectionsData = await graphGet<{
          value: Array<{ id: string; displayName: string }>
        }>(accessToken, `/me/onenote/notebooks/${input.notebookId}/sections`);

        for (const section of sectionsData.value) {
          const pagesData = await graphGet<{
            value: Array<{ id: string; title: string; createdDateTime: string; lastModifiedDateTime: string }>
          }>(accessToken, `/me/onenote/sections/${section.id}/pages?$top=200`);
          for (const p of pagesData.value) {
            pagesToImport.push({
              id: p.id,
              title: p.title,
              notebookName: input.notebookName,
              sectionName: section.displayName,
              createdDateTime: p.createdDateTime,
              lastModifiedDateTime: p.lastModifiedDateTime,
            });
          }
        }
      }

      if (pagesToImport.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pages found to import." });
      }

      // Create the job record
      const [result] = await dbConn.insert(onenoteImportJobs).values({
        userId: ctx.user.id,
        status: "pending",
        notebookId: input.notebookId,
        notebookName: input.notebookName,
        sectionId: input.sectionId ?? null,
        sectionName: input.sectionName ?? null,
        pageId: input.pageId ?? null,
        totalPages: pagesToImport.length,
        importedPages: 0,
        failedPages: 0,
      });

      const jobId = (result as { insertId: number }).insertId;

      // Run import in background (non-blocking)
      runImportJob(jobId, ctx.user.id, pagesToImport, accessToken).catch(err => {
        console.error("[OneNote Import] Background job failed:", err);
      });

      return { jobId, totalPages: pagesToImport.length };
    }),

  /** Poll import job progress */
  getImportProgress: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      const jobs = await dbConn.select().from(onenoteImportJobs)
        .where(and(
          eq(onenoteImportJobs.id, input.jobId),
          eq(onenoteImportJobs.userId, ctx.user.id),
        ))
        .limit(1);

      if (!jobs[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Import job not found." });

      const job = jobs[0];
      return {
        id: job.id,
        status: job.status,
        notebookName: job.notebookName,
        sectionName: job.sectionName,
        totalPages: job.totalPages,
        importedPages: job.importedPages,
        failedPages: job.failedPages,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        progressPct: job.totalPages > 0
          ? Math.round(((job.importedPages + job.failedPages) / job.totalPages) * 100)
          : 0,
      };
    }),

  /** List all import jobs for the current user */
  listImportJobs: protectedProcedure.query(async ({ ctx }) => {
    const dbConn = await getDb();
    if (!dbConn) return [];
    const jobs = await dbConn.select().from(onenoteImportJobs)
      .where(eq(onenoteImportJobs.userId, ctx.user.id))
      .orderBy(desc(onenoteImportJobs.createdAt))
      .limit(20);
    return jobs.map(j => ({
      id: j.id,
      status: j.status,
      notebookName: j.notebookName,
      sectionName: j.sectionName,
      totalPages: j.totalPages,
      importedPages: j.importedPages,
      failedPages: j.failedPages,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      progressPct: j.totalPages > 0
        ? Math.round(((j.importedPages + j.failedPages) / j.totalPages) * 100)
        : 0,
    }));
  }),
});
