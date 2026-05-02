import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Activity,
  Calendar,
  CheckCircle,
  Mail,
  RefreshCw,
  Users,
  XCircle,
  Clock,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function SyncStatus() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const syncStatusQuery = trpc.oauthSync.getSyncStatusAll.useQuery(
    undefined,
    { enabled: !!user, refetchInterval: 30000 }
  );

  const oauthStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const syncAllMutation = trpc.oauthSync.syncAll.useMutation({
    onSuccess: (results) => {
      const successCount = Object.values(results).filter((r) => r.success).length;
      const failCount = Object.values(results).filter((r) => !r.success).length;
      if (successCount > 0) {
        toast.success(`Sync complete: ${successCount} provider(s) synced`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} provider(s) failed to sync`);
      }
      syncStatusQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
    onSettled: () => setSyncing(false),
  });

  const handleSyncAll = async () => {
    setSyncing(true);
    await syncAllMutation.mutateAsync();
  };

  const statusData = syncStatusQuery.data;
  const oauthStatus = oauthStatusQuery.data;
  const providers = statusData?.providers ?? [];
  const msConnected = oauthStatus?.microsoft?.connected;

  function formatTime(date: Date | string | null | undefined) {
    if (!date) return "Never";
    const d = new Date(date);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  function getStatusIcon(status: string | null | undefined) {
    if (status === "success") return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === "failed") return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-gray-400" />;
  }

  function getStatusBadge(status: string | null | undefined) {
    if (status === "success") return "bg-green-100 text-green-700";
    if (status === "failed") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  }

  const msStatus = providers.find((p) => p.provider === "microsoft");
  const smtpStatus = providers.find((p) => p.provider === "smtp_imap");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6" />
          <h1 className="text-3xl font-bold">Sync Status</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncStatusQuery.refetch()}
            disabled={syncStatusQuery.isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${syncStatusQuery.isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleSyncAll}
            disabled={syncing || !msConnected}
            size="sm"
          >
            {syncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Sync All Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {msStatus?.totalEventsImported ?? 0}
              </p>
              <p className="text-sm text-gray-500">Events synced</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {(msStatus?.totalEmailsImported ?? 0) + (smtpStatus?.totalEmailsImported ?? 0)}
              </p>
              <p className="text-sm text-gray-500">Emails synced</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {msStatus?.totalContactsImported ?? 0}
              </p>
              <p className="text-sm text-gray-500">Contacts synced</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Provider Status */}
      <h2 className="text-lg font-semibold mb-3">Provider Status</h2>
      <div className="space-y-3 mb-6">
        {/* Microsoft 365 */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getStatusIcon(msStatus?.lastSyncStatus)}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">Microsoft 365</p>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      msConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {msConnected ? "Connected" : "Not connected"}
                  </span>
                  {msStatus?.lastSyncStatus && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusBadge(msStatus.lastSyncStatus)}`}>
                      {msStatus.lastSyncStatus}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Last sync: {formatTime(msStatus?.lastSyncAt ?? statusData?.microsoftLastSyncedAt)}
                </p>
                {msStatus?.syncErrorMessage && (
                  <p className="text-sm text-red-600 mt-1">
                    Error: {msStatus.syncErrorMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>{msStatus?.totalEventsImported ?? 0} events</p>
              <p>{msStatus?.totalEmailsImported ?? 0} emails</p>
              <p>{msStatus?.totalContactsImported ?? 0} contacts</p>
            </div>
          </div>
        </Card>

        {/* SMTP/IMAP */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getStatusIcon(smtpStatus?.lastSyncStatus)}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">SMTP/IMAP Account</p>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      oauthStatus ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {smtpStatus ? "Configured" : "Not configured"}
                  </span>
                  {smtpStatus?.lastSyncStatus && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusBadge(smtpStatus.lastSyncStatus)}`}>
                      {smtpStatus.lastSyncStatus}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Last sync: {formatTime(smtpStatus?.lastSyncAt)}
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>{smtpStatus?.totalEmailsImported ?? 0} emails</p>
            </div>
          </div>
        </Card>
      </div>

      {!msConnected && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900">
            No accounts connected. Go to <strong>Settings → Accounts</strong> to connect Microsoft 365
            or add an SMTP/IMAP account to start syncing.
          </p>
        </div>
      )}
    </div>
  );
}
