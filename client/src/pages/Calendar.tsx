import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, Loader2, Calendar as CalendarIcon, MapPin, Clock } from "lucide-react";
import { useState } from "react";

export default function Calendar() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const syncCalendarMutation = trpc.oauthSync.syncCalendar.useMutation();
  const getOAuthStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncCalendarMutation.mutateAsync({ provider: "microsoft", daysAhead: 30 });
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

  const events = syncCalendarMutation.data?.events || [];

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

        {events.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-600">
              {events.length} {events.length === 1 ? "event" : "events"} found
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedEvent(event)}
                  className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg hover:shadow-md cursor-pointer transition-shadow"
                >
                  <h3 className="font-semibold text-blue-900 mb-2">{event.title}</h3>
                  <div className="space-y-1 text-sm text-blue-800">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{event.start}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{event.location}</span>
                      </div>
                    )}
                    {event.notes && (
                      <p className="text-xs text-blue-700 mt-2 line-clamp-2">{event.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && !syncing && (
          <div className="text-center py-8 text-gray-500">
            <p>No events synced yet. Click "Sync Now" to fetch your calendar events.</p>
          </div>
        )}

        {syncCalendarMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
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
                <p className="font-medium">{selectedEvent.start}</p>
              </div>
              {selectedEvent.end && (
                <div>
                  <p className="text-sm text-gray-600">End Time</p>
                  <p className="font-medium">{selectedEvent.end}</p>
                </div>
              )}
              {selectedEvent.location && (
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-medium">{selectedEvent.location}</p>
                </div>
              )}
              {selectedEvent.notes && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="text-sm">{selectedEvent.notes}</p>
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
