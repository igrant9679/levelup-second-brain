/**
 * ShareView — public page for viewing a shared bookmark collection or selection.
 * Accessible at /share/:token without authentication.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";

interface SharedBookmark {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  ogImage: string | null;
  siteName: string | null;
  tags: string | null;
  notes: string | null;
  isRead: number;
  isFavorite: number;
  wordCount: number | null;
  createdAt: string;
}

interface ShareData {
  title: string | null;
  description: string | null;
  shareType: "collection" | "selection";
  createdAt: string;
  expiresAt: string | null;
  bookmarks: SharedBookmark[];
}

export default function ShareView() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔖</div>
          <p className="text-muted-foreground">Loading shared bookmarks…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2">Could not load shared bookmarks</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const bookmarks = data.bookmarks || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl">🔖</div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {data.title || "Shared Bookmarks"}
              </h1>
              {data.description && (
                <p className="text-muted-foreground mt-1">{data.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>Shared {new Date(data.createdAt).toLocaleDateString()}</span>
                {data.expiresAt && (
                  <>
                    <span>·</span>
                    <span>Expires {new Date(data.expiresAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bookmark list */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {bookmarks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-4xl mb-3">📭</div>
            <p>No bookmarks in this share.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bookmarks.map((b) => {
              const tags: string[] = b.tags ? JSON.parse(b.tags) : [];
              const domain = (() => {
                try { return new URL(b.url).hostname.replace(/^www\./, ""); }
                catch { return ""; }
              })();
              const readMins = b.wordCount ? Math.max(1, Math.round(b.wordCount / 200)) : null;
              return (
                <a
                  key={b.id}
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-border bg-card p-4 hover:border-primary transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {b.favicon ? (
                          <img
                            src={b.favicon}
                            alt=""
                            className="w-4 h-4 rounded flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-sm flex-shrink-0">🌐</span>
                        )}
                        <span className="font-semibold text-sm text-foreground truncate flex-1">
                          {b.title || "Untitled"}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{domain}</span>
                      </div>
                      {b.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {b.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="inline-block bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                        {readMins && (
                          <span className="text-[10px] text-muted-foreground">⏱ {readMins} min read</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {b.ogImage && (
                      <img
                        src={b.ogImage}
                        alt=""
                        className="w-20 h-14 rounded-lg object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border mt-8 py-4 text-center text-xs text-muted-foreground">
        Shared via <strong>LevelUp Second Brain</strong>
      </div>
    </div>
  );
}
