/**
 * Bookmarks router — web page bookmarking for the Second Brain.
 *
 * Provides CRUD operations, server-side metadata extraction (title, description,
 * favicon, og:image), tag management, and search/filter capabilities.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import * as db from '../db';

// ─── Metadata Extraction ────────────────────────────────────────────────────

interface PageMetadata {
  title: string | null;
  description: string | null;
  favicon: string | null;
  ogImage: string | null;
  siteName: string | null;
}

/**
 * Fetch a URL and extract Open Graph / meta tag metadata.
 * Uses a 10-second timeout and follows redirects.
 */
async function extractMetadata(url: string): Promise<PageMetadata> {
  const result: PageMetadata = {
    title: null,
    description: null,
    favicon: null,
    ogImage: null,
    siteName: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LevelUpBot/1.0; +https://levelupnow.vip)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return result;

    // Only read first 100KB to avoid downloading huge pages
    const reader = response.body?.getReader();
    if (!reader) return result;

    let html = '';
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const maxBytes = 100_000;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
    }
    reader.cancel();

    // Parse the HTML with regex (lightweight, no dependency needed)
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;

    // Title: og:title > <title>
    const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
    const htmlTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    result.title = ogTitle || htmlTitle || null;

    // Description: og:description > meta description
    result.description = extractMeta(html, 'og:description')
      || extractMeta(html, 'twitter:description')
      || extractMetaName(html, 'description')
      || null;

    // OG Image
    result.ogImage = resolveUrl(
      extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image'),
      origin
    );

    // Site name
    result.siteName = extractMeta(html, 'og:site_name') || parsedUrl.hostname.replace(/^www\./, '') || null;

    // Favicon: look for <link rel="icon"> or fall back to /favicon.ico
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    result.favicon = resolveUrl(faviconMatch?.[1], origin) || `${origin}/favicon.ico`;

  } catch (err) {
    // Metadata extraction is best-effort; return what we have
    console.warn('[Bookmarks] Metadata extraction failed for', url, err);
  }

  return result;
}

function extractMeta(html: string, property: string): string | null {
  // Match both property="..." and name="..." attributes
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  const match = html.match(regex);
  if (match) return decodeHtmlEntities(match[1].trim());

  // Try reversed attribute order: content before property
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i'
  );
  const match2 = html.match(regex2);
  return match2 ? decodeHtmlEntities(match2[1].trim()) : null;
}

function extractMetaName(html: string, name: string): string | null {
  return extractMeta(html, name);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function resolveUrl(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${origin}${url}`;
  return `${origin}/${url}`;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const bookmarksRouter = router({
  /**
   * Create a new bookmark. Accepts a URL and optional overrides.
   * Automatically fetches page metadata (title, description, favicon, og:image).
   */
  create: protectedProcedure
    .input(z.object({
      url: z.string().url('Please enter a valid URL'),
      title: z.string().max(512).optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      color: z.string().max(32).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Fetch metadata from the URL
      const meta = await extractMetadata(input.url);

      const bookmark = await db.createBookmark({
        userId: ctx.user.id,
        url: input.url,
        title: input.title || meta.title || new URL(input.url).hostname,
        description: input.description || meta.description,
        favicon: meta.favicon,
        ogImage: meta.ogImage,
        siteName: meta.siteName,
        tags: input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
        notes: input.notes || null,
        color: input.color || null,
      });

      if (!bookmark) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create bookmark' });
      }

      return bookmark;
    }),

  /**
   * List bookmarks with pagination, search, tag filter, and sort.
   */
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      tag: z.string().optional(),
      isRead: z.boolean().optional(),
      isFavorite: z.boolean().optional(),
      sort: z.enum(['newest', 'oldest', 'alpha']).optional().default('newest'),
      page: z.number().int().min(1).optional().default(1),
      pageSize: z.number().int().min(1).max(100).optional().default(30),
    }))
    .query(async ({ input, ctx }) => {
      const opts = input;
      return db.getBookmarks({
        userId: ctx.user.id,
        search: opts.search,
        tag: opts.tag,
        isRead: opts.isRead,
        isFavorite: opts.isFavorite,
        sort: opts.sort ?? 'newest',
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? 30,
      });
    }),

  /**
   * Get a single bookmark by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const bookmark = await db.getBookmarkById(input.id, ctx.user.id);
      if (!bookmark) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bookmark not found' });
      }
      return bookmark;
    }),

  /**
   * Update a bookmark's metadata, tags, notes, or status.
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      title: z.string().max(512).optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      isRead: z.boolean().optional(),
      isFavorite: z.boolean().optional(),
      color: z.string().max(32).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getBookmarkById(input.id, ctx.user.id);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bookmark not found' });
      }

      const updateData: Record<string, any> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.tags !== undefined) updateData.tags = JSON.stringify(input.tags);
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.isRead !== undefined) updateData.isRead = input.isRead ? 1 : 0;
      if (input.isFavorite !== undefined) updateData.isFavorite = input.isFavorite ? 1 : 0;
      if (input.color !== undefined) updateData.color = input.color;

      const updated = await db.updateBookmark(input.id, ctx.user.id, updateData);
      return updated;
    }),

  /**
   * Delete a bookmark.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getBookmarkById(input.id, ctx.user.id);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bookmark not found' });
      }
      await db.deleteBookmark(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Get the total bookmark count for the current user (for sidebar badge).
   */
  count: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getBookmarkCount(ctx.user.id);
    }),

  /**
   * Get all unique tags used across the user's bookmarks.
   */
  tags: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getAllBookmarkTags(ctx.user.id);
    }),

  /**
   * Re-fetch metadata for an existing bookmark (refresh title, description, etc.).
   */
  refreshMetadata: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getBookmarkById(input.id, ctx.user.id);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bookmark not found' });
      }

      const meta = await extractMetadata(existing.url as string);
      const updated = await db.updateBookmark(input.id, ctx.user.id, {
        title: meta.title || existing.title,
        description: meta.description || existing.description,
      });
      return updated;
    }),
});
