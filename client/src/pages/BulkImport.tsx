import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  Download,
  Mail,
  RefreshCw,
  CheckCircle,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ImportResult = {
  type: "calendar" | "mail";
  count: number;
  success: boolean;
  message?: string;
};

export default function BulkImport() {
  const { user } = useAuth();

  // Default date range: last 30 days to today
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(formatDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [importCalendar, setImportCalendar] = useState(true);
  const [importMail, setImportMail] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<"idle" | "calendar" | "mail" | "done">("idle");
  const [results, setResults] = useState<ImportResult[]>([]);

  const oauthStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const bulkCalendarMutation = trpc.oauthSync.bulkImportCalendar.useMutation();
  const bulkMailMutation = trpc.oauthSync.bulkImportMail.useMutation();

  const msConnected = oauthStatusQuery.data?.microsoft?.connected;

  const handleImport = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select a valid date range.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date must be before end date.");
      return;
    }
    if (!importCalendar && !importMail) {
      toast.error("Please select at least one data type to import.");
      return;
    }

    setIsImporting(true);
    setResults([]);
    const newResults: ImportResult[] = [];

    try {
      if (importCalendar) {
        setProgress("calendar");
        try {
          const calResult = await bulkCalendarMutation.mutateAsync({
            provider: "microsoft",
            startDate,
            endDate,
          });
          newResults.push({
            type: "calendar",
            count: calResult.count,
            success: true,
          });
        } catch (err) {
          newResults.push({
            type: "calendar",
            count: 0,
            success: false,
            message: err instanceof Error ? err.message : "Calendar import failed",
          });
        }
      }

      if (importMail) {
        setProgress("mail");
        try {
          const mailResult = await bulkMailMutation.mutateAsync({
            provider: "microsoft",
            startDate,
            endDate,
            limit: 100,
          });
          newResults.push({
            type: "mail",
            count: mailResult.count,
            success: true,
          });
        } catch (err) {
          newResults.push({
            type: "mail",
            count: 0,
            success: false,
            message: err instanceof Error ? err.message : "Mail import failed",
          });
        }
      }

      setResults(newResults);
      setProgress("done");

      const totalImported = newResults.reduce((sum, r) => sum + r.count, 0);
      const allSuccess = newResults.every((r) => r.success);
      if (allSuccess) {
        toast.success(`Import complete: ${totalImported} items imported`);
      } else {
        toast.error("Some imports failed. Check results below.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setProgress("idle");
    setResults([]);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Download className="w-6 h-6" />
        <h1 className="text-3xl font-bold">Bulk Import</h1>
      </div>

      {!msConnected && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
          <p className="text-sm text-amber-900">
            Microsoft 365 is not connected. Go to <strong>Settings → Accounts</strong> to connect
            before importing data.
          </p>
        </div>
      )}

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Import Configuration</h2>

        {/* Date Range */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isImporting}
              />
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 mt-5 flex-shrink-0" />
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={formatDate(today)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isImporting}
              />
            </div>
          </div>
          {/* Quick date range presets */}
          <div className="flex gap-2 mt-2">
            {[
              { label: "Last 7 days", days: 7 },
              { label: "Last 30 days", days: 30 },
              { label: "Last 90 days", days: 90 },
              { label: "Last year", days: 365 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => {
                  const from = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
                  setStartDate(formatDate(from));
                  setEndDate(formatDate(today));
                }}
                disabled={isImporting}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Data Types */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Data to Import</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={importCalendar}
                onChange={(e) => setImportCalendar(e.target.checked)}
                disabled={isImporting}
                className="w-4 h-4"
              />
              <Calendar className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Calendar Events</p>
                <p className="text-xs text-gray-500">Import events from Microsoft 365 Calendar</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={importMail}
                onChange={(e) => setImportMail(e.target.checked)}
                disabled={isImporting}
                className="w-4 h-4"
              />
              <Mail className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Emails</p>
                <p className="text-xs text-gray-500">Import emails from Microsoft 365 Inbox (up to 100)</p>
              </div>
            </label>
          </div>
        </div>

        {/* Progress Bar */}
        {isImporting && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-600">
                {progress === "calendar" && "Importing calendar events..."}
                {progress === "mail" && "Importing emails..."}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{
                  width:
                    progress === "calendar"
                      ? importMail ? "40%" : "80%"
                      : progress === "mail"
                      ? "80%"
                      : "0%",
                }}
              />
            </div>
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={isImporting || !msConnected}
          className="w-full"
        >
          {isImporting ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Start Import
            </>
          )}
        </Button>
      </Card>

      {/* Results */}
      {progress === "done" && results.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Import Results</h2>
            <Button variant="outline" size="sm" onClick={handleReset}>
              New Import
            </Button>
          </div>
          <div className="space-y-3">
            {results.map((result, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}
              >
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
                    {result.type === "calendar" ? "Calendar Events" : "Emails"}:{" "}
                    {result.success
                      ? `${result.count} item${result.count !== 1 ? "s" : ""} imported`
                      : result.message ?? "Import failed"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Total imported:</strong>{" "}
              {results.reduce((sum, r) => sum + r.count, 0)} items from{" "}
              {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
