/**
 * news.ts — tRPC router for fetching live headlines from BBC RSS feeds.
 * No external API key required.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

// Map user-facing topic names (matching Settings → AI Features checkboxes) to BBC RSS paths
const TOPIC_FEEDS: Record<string, string> = {
  Technology: "technology",
  "World News": "world",
  Business: "business",
  Science: "science_and_environment",
  Politics: "politics",
  Health: "health",
  Entertainment: "entertainment_and_arts",
  Sports: "sport",
};

interface HeadlineItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  topic: string;
}

async function fetchBBCFeed(topic: string, feedPath: string, count = 3): Promise<HeadlineItem[]> {
  try {
    const url = `https://feeds.bbci.co.uk/news/${feedPath}/rss.xml`;
    const res = await fetch(url, {
      headers: { "User-Agent": "LevelUp-SecondBrain/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Parse <item> blocks
    const items: HeadlineItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null && items.length < count) {
      const block = match[1];
      const title = extractCdata(block, "title") || extractTag(block, "title");
      const link = extractTag(block, "link") || extractTag(block, "guid");
      const description = extractCdata(block, "description") || extractTag(block, "description");
      const pubDate = extractTag(block, "pubDate");
      if (title && title.length > 3) {
        items.push({ title, link: link || "", description: description || "", pubDate: pubDate || "", topic });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function extractCdata(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

export const newsRouter = router({
  /**
   * getHeadlines — fetch live headlines filtered by the user's topic preferences.
   * topics: array of topic names from Settings (e.g. ["Technology", "World News"])
   * count: headlines per topic (default 3)
   */
  getHeadlines: protectedProcedure
    .input(
      z.object({
        topics: z.array(z.string()).min(1).max(10).default(["Technology", "World News", "Business"]),
        countPerTopic: z.number().min(1).max(5).default(3),
      })
    )
    .query(async ({ input }) => {
      const { topics, countPerTopic } = input;

      // Only fetch topics we have a feed for
      const validTopics = topics.filter((t) => TOPIC_FEEDS[t]);

      // Fetch all feeds in parallel
      const results = await Promise.all(
        validTopics.map((topic) => fetchBBCFeed(topic, TOPIC_FEEDS[topic], countPerTopic))
      );

      const headlines = results.flat();

      // Shuffle so topics are interleaved
      for (let i = headlines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [headlines[i], headlines[j]] = [headlines[j], headlines[i]];
      }

      return headlines;
    }),

  /**
   * availableTopics — return the list of topic names the user can choose from.
   */
  availableTopics: protectedProcedure.query(() => Object.keys(TOPIC_FEEDS)),
});
