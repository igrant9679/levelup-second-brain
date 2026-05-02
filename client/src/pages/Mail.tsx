import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Loader2, Mail as MailIcon, Clock, User } from "lucide-react";
import { useState } from "react";

export default function Mail() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);

  const syncMailMutation = trpc.oauthSync.syncMail.useMutation();
  const getOAuthStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncMailMutation.mutateAsync({ provider: "microsoft", limit: 20 });
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

  const messages = syncMailMutation.data?.messages || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
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
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            size="sm"
          >
            {syncing ? (
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

        {messages.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-600">
              {messages.length} {messages.length === 1 ? "message" : "messages"} found
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedEmail(msg)}
                  className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg hover:shadow-md cursor-pointer transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-amber-900 flex-1 line-clamp-1">
                      {msg?.subject || "(No subject)"}
                    </h3>
                  </div>
                  <div className="space-y-1 text-sm text-amber-800">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span className="truncate">{msg?.from || "(Unknown sender)"}</span>
                    </div>
                    {msg?.date && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{new Date(msg.date).toLocaleString()}</span>
                      </div>
                    )}
                    {msg?.preview && (
                      <p className="text-xs text-amber-700 mt-2 line-clamp-2">{msg.preview}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && !syncing && (
          <div className="text-center py-8 text-gray-500">
            <p>No emails synced yet. Click "Sync Now" to fetch your recent emails.</p>
          </div>
        )}

        {syncMailMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            Sync failed: {syncMailMutation.error?.message || "Unknown error"}
          </div>
        )}
      </Card>

      {selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full p-6 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">{selectedEmail.subject || "(No subject)"}</h3>
            <div className="space-y-3 mb-6">
              <div>
                <p className="text-sm text-gray-600">From</p>
                <p className="font-medium">{selectedEmail.from || "(Unknown)"}</p>
              </div>
              {selectedEmail.date && (
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{new Date(selectedEmail.date).toLocaleString()}</p>
                </div>
              )}
              {selectedEmail.preview && (
                <div>
                  <p className="text-sm text-gray-600">Preview</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedEmail.preview}</p>
                </div>
              )}
            </div>
            <Button onClick={() => setSelectedEmail(null)} className="w-full">
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
