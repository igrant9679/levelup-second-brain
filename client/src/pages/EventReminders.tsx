import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlarmClock, Calendar, CheckCheck, RefreshCw, X } from "lucide-react";
import { useState } from "react";

const reminderLabels: Record<string, string> = {
  "5min": "5 minutes before",
  "15min": "15 minutes before",
  "1hour": "1 hour before",
};

export default function EventReminders() {
  const { user } = useAuth();
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const remindersQuery = trpc.oauthSync.getEventReminders.useQuery(
    undefined,
    { enabled: !!user, refetchInterval: 60000 }
  );

  const dismissMutation = trpc.oauthSync.dismissEventReminder.useMutation({
    onSuccess: () => remindersQuery.refetch(),
    onSettled: () => setDismissingId(null),
  });

  const handleDismiss = async (id: number) => {
    setDismissingId(id);
    await dismissMutation.mutateAsync({ id });
  };

  const reminders = remindersQuery.data ?? [];
  const isLoading = remindersQuery.isLoading;

  function formatEventTime(date: Date | string) {
    const d = new Date(date);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getTimeUntil(date: Date | string) {
    const d = new Date(date);
    const diff = d.getTime() - Date.now();
    if (diff < 0) return "Past";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `In ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `In ${hours}h`;
    return `In ${Math.floor(hours / 24)}d`;
  }

  function getReminderBadgeColor(type: string) {
    switch (type) {
      case "5min": return "bg-red-100 text-red-700";
      case "15min": return "bg-orange-100 text-orange-700";
      case "1hour": return "bg-yellow-100 text-yellow-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlarmClock className="w-6 h-6" />
          <h1 className="text-3xl font-bold">Event Reminders</h1>
          {reminders.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-orange-100 text-orange-800 rounded-full">
              {reminders.length} pending
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => remindersQuery.refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500">Loading reminders...</p>
        </Card>
      ) : reminders.length === 0 ? (
        <Card className="p-12 text-center">
          <AlarmClock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No pending reminders</h2>
          <p className="text-sm text-gray-500">
            Sync your calendar to create reminders for upcoming events. Reminders are set for
            5 minutes, 15 minutes, and 1 hour before each event.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <Card
              key={reminder.id}
              className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{reminder.eventTitle}</p>
                    <p className="text-sm text-gray-600">
                      {formatEventTime(reminder.eventStart)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getReminderBadgeColor(reminder.reminderType)}`}>
                      {reminderLabels[reminder.reminderType] ?? reminder.reminderType}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {getTimeUntil(reminder.eventStart)}
                    </span>
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {reminder.provider === "microsoft" ? "Microsoft 365" : reminder.provider}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={() => handleDismiss(reminder.id)}
                disabled={dismissingId === reminder.id}
                title="Dismiss reminder"
              >
                {dismissingId === reminder.id ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                ) : (
                  <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                )}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-900">
          <strong>How reminders work:</strong> After syncing your calendar, go to the Calendar page
          and use "Create Reminders" to set up 5-minute, 15-minute, and 1-hour reminders for upcoming events.
          Dismiss reminders here once acknowledged.
        </p>
      </div>
    </div>
  );
}
