import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const syncCalendarMutation = trpc.oauthSync.syncCalendar.useMutation();
  const syncMailMutation = trpc.oauthSync.syncMail.useMutation();
  const getStatusQuery = trpc.oauthSync.status.useQuery(undefined, { enabled: !!user });

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
          await syncMailMutation.mutateAsync({ provider: "microsoft", limit: 20 });
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
  }, [user, getStatusQuery.data, autoSyncing, syncCalendarMutation, syncMailMutation]);

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
        <p className="text-gray-600 mb-8">Your second brain is syncing...</p>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-3">📅 Calendar</h2>
            <p className="text-gray-600 mb-4">View your synced Microsoft 365 events</p>
            <Button variant="outline" className="w-full">
              Open Calendar
            </Button>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-3">📧 Mail</h2>
            <p className="text-gray-600 mb-4">Check your synced Microsoft 365 emails</p>
            <Button variant="outline" className="w-full">
              Open Mail
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
