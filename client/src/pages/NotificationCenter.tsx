import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, BellOff, CheckCheck, Mail, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function NotificationCenter() {
  const { user } = useAuth();
  const [markingAll, setMarkingAll] = useState(false);

  const notificationsQuery = trpc.oauthSync.getEmailNotifications.useQuery(
    undefined,
    { enabled: !!user, refetchInterval: 30000 }
  );

  const markReadMutation = trpc.oauthSync.markEmailNotificationRead.useMutation({
    onSuccess: () => notificationsQuery.refetch(),
  });

  const markAllReadMutation = trpc.oauthSync.markAllEmailNotificationsRead.useMutation({
    onSuccess: () => notificationsQuery.refetch(),
  });

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllReadMutation.mutateAsync();
    } finally {
      setMarkingAll(false);
    }
  };

  const notifications = notificationsQuery.data ?? [];
  const isLoading = notificationsQuery.isLoading;

  function formatTime(date: Date | string) {
    const d = new Date(date);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-6 h-6" />
          <h1 className="text-3xl font-bold">Notification Center</h1>
          {notifications.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
              {notifications.length} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => notificationsQuery.refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500">Loading notifications...</p>
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="p-12 text-center">
          <BellOff className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No unread notifications</h2>
          <p className="text-sm text-gray-500">
            Email notifications will appear here when new emails are synced from your connected accounts.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{notif.emailSubject || "(No subject)"}</p>
                    <p className="text-sm text-gray-600 truncate">From: {notif.emailFrom}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatTime(notif.createdAt)}
                    </span>
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {notif.provider === "microsoft" ? "Microsoft 365" : "SMTP/IMAP"}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => markReadMutation.mutate({ id: notif.id })}
                disabled={markReadMutation.isPending}
                title="Mark as read"
              >
                <CheckCheck className="w-4 h-4 text-gray-400 hover:text-blue-600" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>How notifications work:</strong> When you sync mail from Microsoft 365 or SMTP/IMAP accounts,
          new emails are tracked here. Notifications are automatically cleared when marked as read.
        </p>
      </div>
    </div>
  );
}
