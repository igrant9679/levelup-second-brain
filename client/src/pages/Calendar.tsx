import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Loader2, Calendar as CalendarIcon, MapPin, Clock, AlarmClock, Database } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function Calendar() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [creatingReminders, setCreatingReminders] = useState(false);

  const syncCalendarMutation = trpc.oauthSync.syncCalendar.useMutation();
  const createRemindersMutation = trpc.oauthSync.createEventReminders.useMutation();
  const getOAuthStatusQuery = trpc.oauthSync.status.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  // Load persisted events from DB — shows immediately on page load without re-syncing
  const dbEventsQuery = trpc.oauthSync.getCalendarEventsFromDB.useQuery(undefined, {
    enabled: !!user,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncCalendarMutation.mutateAsync({ provider: "microsoft", daysAhead: 30 });
      // Invalidate DB events query so the list refreshes with newly upserted events
      await utils.oauthSync.getCalendarEventsFromDB.invalidate();
      const count = (result as any)?.eventsUpserted ?? (result as any)?.events?.length ?? 0;
      toast.success(`Synced ${count} event${count !== 1 ? "s" : ""} to your calendar`);
    } catch (err) {
      console.error("Sync failed:", err);
      toast.error("Sync failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateReminders = async () => {
    // Use DB events if available, fall back to last mutation result
    const events = dbEventsQuery.data?.length
      ? dbEventsQuery.data
      : syncCalendarMutation.data?.events;

    if (!events || events.length === 0) {
      toast.error("No events to create reminders for. Sync calendar first.");
      return;
    }
    setCreatingReminders(true);
    try {
      const result = await createRemindersMutation.mutateAsync({
        events: events.map((e: any) => ({
          eventId: e.eventId ?? e.id ?? String(e.start),
          eventTitle: e.title,
          eventStart: e.start instanceof Date ? e.start.toISOString() : e.start,
          provider: e.provider ?? "microsoft",
        })),
      });
      toast.success(`Created ${result.created} reminder(s) for upcoming events`);
    } catch (err) {
      toast.error("Failed to create reminders: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setCreatingReminders(false);
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

  // Prefer DB events (persisted); fall back to last mutation result
  const dbEvents = dbEventsQuery.data ?? [];
  const mutationEvents = syncCalendarMutation.data?.events ?? [];
  const events = dbEvents.length > 0 ? dbEvents : mutationEvents;
  const isFromDB = dbEvents.length > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="text-3xl font-bold">Calendar</h1>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Microsoft 365 Calendar</h2>
            {lastSyncedAt ? (
              <p className="text-sm text-gray-500">
                Last synced: {minutesAgo} {minutesAgo === 1 ? "minute" : "minutes"} ago
              </p>
            ) : (
              <p className="text-sm text-gray-500">Never synced</p>
            )}
            {isFromDB && dbEvents.length > 0 && (
              <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                <Database className="w-3 h-3" />
                Loaded from local database — persists across page refreshes
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <Button
                onClick={handleCreateReminders}
                disabled={creatingReminders}
                variant="outline"
                size="sm"
              >
                {creatingReminders ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <AlarmClock className="w-4 h-4 mr-2" />
                    Create Reminders
                  </>
                )}
              </Button>
            )}
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
        </div>

        {dbEventsQuery.isLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading events from database...</span>
          </div>
        )}

        {!dbEventsQuery.isLoading && events.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-600">
              {events.length} {events.length === 1 ? "event" : "events"} in the next 30 days
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto">
              {events.map((event: any, idx: number) => {
                const startDate = event.start instanceof Date
                  ? event.start
                  : new Date(event.start);
                const isValidDate = !isNaN(startDate.getTime());
                return (
                  <div
                    key={event.id ?? event.eventId ?? idx}
                    onClick={() => setSelectedEvent(event)}
                    className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg hover:shadow-md cursor-pointer transition-shadow"
                  >
                    <h3 className="font-semibold text-blue-900 mb-2">{event.title}</h3>
                    <div className="space-y-1 text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {isValidDate
                            ? startDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                            : String(event.start)}
                        </span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                      {(event.notes || event.description) && (
                        <p className="text-xs text-blue-700 mt-2 line-clamp-2">
                          {event.notes || event.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!dbEventsQuery.isLoading && events.length === 0 && !syncing && (
          <div className="text-center py-8 text-gray-500">
            <p>No events found. Click "Sync Now" to fetch your calendar events.</p>
          </div>
        )}

        {syncCalendarMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mt-3">
            Sync failed: {syncCalendarMutation.error?.message || "Unknown error"}
          </div>
        )}
      </Card>

      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">{selectedEvent.title}</h3>
            <div className="space-y-3 mb-6">
              <div>
                <p className="text-sm text-gray-600">Start Time</p>
                <p className="font-medium">
                  {selectedEvent.start instanceof Date
                    ? selectedEvent.start.toLocaleString()
                    : new Date(selectedEvent.start).toLocaleString()}
                </p>
              </div>
              {selectedEvent.end && (
                <div>
                  <p className="text-sm text-gray-600">End Time</p>
                  <p className="font-medium">
                    {selectedEvent.end instanceof Date
                      ? selectedEvent.end.toLocaleString()
                      : new Date(selectedEvent.end).toLocaleString()}
                  </p>
                </div>
              )}
              {selectedEvent.location && (
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-medium">{selectedEvent.location}</p>
                </div>
              )}
              {(selectedEvent.notes || selectedEvent.description) && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="text-sm">{selectedEvent.notes || selectedEvent.description}</p>
                </div>
              )}
              {selectedEvent.organizer && (
                <div>
                  <p className="text-sm text-gray-600">Organizer</p>
                  <p className="text-sm">{selectedEvent.organizer}</p>
                </div>
              )}
            </div>
            <Button onClick={() => setSelectedEvent(null)} className="w-full">
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
