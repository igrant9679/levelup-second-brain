import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Loader2, Mail as MailIcon } from "lucide-react";
import { useState } from "react";

export default function Mail() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastProvider, setLastProvider] = useState<"microsoft" | "google" | null>(null);

  const syncMailMutation = trpc.oauthSync.syncMail.useMutation();
  const getOAuthStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const handleSync = async (provider: "microsoft" | "google") => {
    setSyncing(true);
    setLastProvider(provider);
    try {
      const result = await syncMailMutation.mutateAsync({ provider, limit: 20 });
      console.log("Synced mail:", result);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const status = getOAuthStatusQuery.data;
  const msStatus = status?.microsoft;
  const lastSyncedAt = msStatus && 'lastSyncedAt' in msStatus && msStatus.lastSyncedAt
    ? new Date(msStatus.lastSyncedAt as string)
    : null;
  const minutesAgo = lastSyncedAt
    ? Math.floor((Date.now() - lastSyncedAt.getTime()) / 60000)
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <MailIcon className="w-6 h-6" />
        <h1 className="text-3xl font-bold">Mail</h1>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Microsoft 365 Mail</h2>
            {lastSyncedAt && (
              <p className="text-sm text-gray-500">
                Last synced: {minutesAgo} {minutesAgo === 1 ? "minute" : "minutes"} ago
              </p>
            )}
            {!lastSyncedAt && (
              <p className="text-sm text-gray-500">Never synced</p>
            )}
          </div>
          <Button
            onClick={() => handleSync("microsoft")}
            disabled={syncing && lastProvider === "microsoft"}
            variant="outline"
            size="sm"
          >
            {syncing && lastProvider === "microsoft" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Now
              </>
            )}
          </Button>
        </div>

        {syncMailMutation.data && lastProvider === "microsoft" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {syncMailMutation.data.messages.length} messages synced
            </p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {syncMailMutation.data.messages.map((msg, idx) => (
                <div key={idx} className="p-2 bg-gray-50 rounded text-sm">
                  <p className="font-medium">{msg?.subject || "(No subject)"}</p>
                  <p className="text-gray-600">From: {msg?.from || "(Unknown)"}</p>
                  <p className="text-gray-500 line-clamp-2">{msg?.preview || ""}</p>
                  <p className="text-xs text-gray-400">
                    {msg?.date ? new Date(msg.date).toLocaleString() : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {syncMailMutation.isError && lastProvider === "microsoft" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            Sync failed: {syncMailMutation.error?.message || "Unknown error"}
          </div>
        )}
      </Card>
    </div>
  );
}
