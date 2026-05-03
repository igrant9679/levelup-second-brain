/**
 * UpcomingEventsWidget — shows the next N Microsoft 365 calendar events
 * on the main dashboard. Fetches live from Microsoft Graph; falls back to
 * the local DB cache when offline or not yet connected.
 */

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  Video,
  CalendarX,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventTime(start: Date, end: Date, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const startStr = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endStr = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

function formatEventDate(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function getEventAccentColor(start: Date): string {
  const today = new Date();
  const diffMs = start.getTime() - today.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return "border-l-red-500 bg-red-50";
  if (diffHours < 3) return "border-l-orange-400 bg-orange-50";
  if (diffHours < 24) return "border-l-blue-500 bg-blue-50";
  return "border-l-gray-300 bg-white";
}

function minutesUntil(date: Date): number {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 60000));
}

function startingSoonBadge(start: Date): string | null {
  const mins = minutesUntil(start);
  if (mins === 0) return "Starting now";
  if (mins <= 5) return `In ${mins}m`;
  if (mins <= 15) return `In ${mins}m`;
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface UpcomingEventsWidgetProps {
  limit?: number;
  daysAhead?: number;
}

export default function UpcomingEventsWidget({ limit = 5, daysAhead = 14 }: UpcomingEventsWidgetProps) {
  const [, setLocation] = useLocation();

  const eventsQuery = trpc.oauthSync.getUpcomingEvents.useQuery(
    { limit, daysAhead },
    {
      refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
      staleTime: 2 * 60 * 1000,
    }
  );

  const events = eventsQuery.data?.events ?? [];
  const source = eventsQuery.data?.source;
  const isLoading = eventsQuery.isLoading;
  const isError = eventsQuery.isError;

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Upcoming Events</h2>
          {source === "cache" && (
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              cached
            </span>
          )}
          {source === "live" && (
            <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-gray-500"
            onClick={() => eventsQuery.refetch()}
            disabled={isLoading}
            title="Refresh events"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-blue-600"
            onClick={() => setLocation("/calendar")}
          >
            View all
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Fetching your calendar…</span>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="text-center py-4">
          <p className="text-sm text-red-600">Failed to load events.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => eventsQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && events.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <CalendarX className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No upcoming events in the next {daysAhead} days.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setLocation("/calendar")}
          >
            Go to Calendar
          </Button>
        </div>
      )}

      {/* Event list */}
      {!isLoading && !isError && events.length > 0 && (
        <div className="space-y-2">
          {events.map((event) => {
            const startDate = new Date(event.startAt);
            const endDate = new Date(event.endAt);
            const accent = getEventAccentColor(startDate);
            const soonBadge = startingSoonBadge(startDate);

            return (
              <div
                key={event.id}
                className={`border-l-4 rounded-r-lg px-3 py-2.5 ${accent} transition-colors`}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {event.title}
                      </span>
                      {soonBadge && (
                        <span className="flex-shrink-0 text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full animate-pulse">
                          {soonBadge}
                        </span>
                      )}
                      {event.isAllDay && (
                        <span className="flex-shrink-0 text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                          All day
                        </span>
                      )}
                    </div>

                    {/* Date + time */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {formatEventDate(startDate)}
                      </span>
                      {!event.isAllDay && (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <Clock className="w-3 h-3" />
                          {formatEventTime(startDate, endDate, event.isAllDay)}
                        </span>
                      )}
                    </div>

                    {/* Location */}
                    {event.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 truncate">{event.location}</span>
                      </div>
                    )}

                    {/* Organizer */}
                    {event.organizer && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500 truncate">{event.organizer}</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {event.joinUrl && (
                      <a
                        href={event.joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Video className="w-3 h-3" />
                        Join
                      </a>
                    )}
                    {event.webLink && !event.joinUrl && (
                      <a
                        href={event.webLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 px-1 py-0.5 rounded transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!isLoading && events.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Showing next {events.length} event{events.length !== 1 ? "s" : ""} · {daysAhead}-day window
          </span>
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => setLocation("/calendar")}
          >
            Full calendar →
          </button>
        </div>
      )}
    </Card>
  );
}
