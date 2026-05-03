import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Calendar, Mail, Bell, AlarmClock, Activity, Download, Settings } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import UpcomingEventsWidget from "@/components/UpcomingEventsWidget";

const quickLinks = [
  { icon: Calendar, label: "Calendar", path: "/calendar", description: "View synced Microsoft 365 events", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  { icon: Mail, label: "Mail", path: "/mail", description: "Check synced emails from all accounts", color: "bg-purple-50 border-purple-200 hover:bg-purple-100" },
  { icon: Bell, label: "Notifications", path: "/notifications", description: "Review unread email notifications", color: "bg-orange-50 border-orange-200 hover:bg-orange-100" },
  { icon: AlarmClock, label: "Event Reminders", path: "/event-reminders", description: "Manage upcoming event reminders", color: "bg-yellow-50 border-yellow-200 hover:bg-yellow-100" },
  { icon: Activity, label: "Sync Status", path: "/sync-status", description: "Monitor sync health across providers", color: "bg-green-50 border-green-200 hover:bg-green-100" },
  { icon: Download, label: "Bulk Import", path: "/bulk-import", description: "Import historical data by date range", color: "bg-teal-50 border-teal-200 hover:bg-teal-100" },
  { icon: Settings, label: "Settings", path: "/sync-settings", description: "Configure sync accounts and preferences", color: "bg-gray-50 border-gray-200 hover:bg-gray-100" },
];

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const [, setLocation] = useLocation();
  const syncCalendarMutation = trpc.oauthSync.syncCalendar.useMutation();
  const syncMailMutation = trpc.oauthSync.syncMail.useMutation();
  const getStatusQuery = trpc.oauthSync.status.useQuery(undefined, { enabled: !!user });
  const notificationsQuery = trpc.oauthSync.getEmailNotifications.useQuery(undefined, { enabled: !!user });

  // Auto-sync on login
  useEffect(() => {
    if (!user || autoSyncing) return;

    const performAutoSync = async () => {
      setAutoSyncing(true);
      setSyncStatus("Syncing calendar and mail...");

      try {
        const status = getStatusQuery.data;
        if (status?.microsoft?.connected) {
          setSyncStatus("Syncing Microsoft Calendar...");
          await syncCalendarMutation.mutateAsync({ provider: "microsoft", daysAhead: 30 });

          setSyncStatus("Syncing Microsoft Mail...");
          const mailResult = await syncMailMutation.mutateAsync({ provider: "microsoft", limit: 20 });
          const notifCount = (mailResult as any)?.notificationsCreated ?? 0;
          if (notifCount > 0) {
            toast.info(`${notifCount} new email notification${notifCount > 1 ? "s" : ""}`, {
              description: "Check the Notifications page to review them.",
              action: { label: "View", onClick: () => setLocation("/notifications") },
            });
          }
        }

        setSyncStatus("Sync complete!");
        setTimeout(() => setSyncStatus(null), 3000);
      } catch (err) {
        console.error("Auto-sync failed:", err);
        setSyncStatus("Sync failed (check console)");
        setTimeout(() => setSyncStatus(null), 5000);
      } finally {
        setAutoSyncing(false);
      }
    };

    // Debounce auto-sync to avoid running multiple times
    const timer = setTimeout(performAutoSync, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, getStatusQuery.data]);

  const unreadCount = notificationsQuery.data?.length ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="p-8 max-w-md">
          <h1 className="text-3xl font-bold mb-4">LevelUp</h1>
          <p className="text-gray-600 mb-6">Your Second Brain Hub</p>
          <Button onClick={() => (window.location.href = getLoginUrl())} className="w-full">
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name}! 👋</h1>
        <p className="text-gray-600 mb-6">Your second brain is ready.</p>

        {autoSyncing && (
          <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-blue-900">{syncStatus || "Syncing..."}</span>
            </div>
          </Card>
        )}

        {syncStatus && !autoSyncing && (
          <Card className="p-4 mb-6 bg-green-50 border-green-200">
            <span className="text-green-900">{syncStatus}</span>
          </Card>
        )}

        {unreadCount > 0 && !autoSyncing && (
          <Card
            className="p-4 mb-6 bg-orange-50 border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
            onClick={() => setLocation("/notifications")}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-orange-600" />
              <span className="text-orange-900 font-medium">
                You have {unreadCount} unread email notification{unreadCount > 1 ? "s" : ""}
              </span>
              <span className="ml-auto text-sm text-orange-700 underline">View all →</span>
            </div>
          </Card>
        )}

        {/* Quick links grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {quickLinks.map(({ icon: Icon, label, path, description, color }) => (
            <Card
              key={path}
              className={`p-5 border cursor-pointer transition-colors ${color}`}
              onClick={() => setLocation(path)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Icon className="w-5 h-5 text-gray-700" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900">{label}</h2>
                    {label === "Notifications" && unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Upcoming Events widget — live Microsoft 365 calendar */}
        <UpcomingEventsWidget limit={5} daysAhead={14} />
      </div>
    </div>
  );
}
