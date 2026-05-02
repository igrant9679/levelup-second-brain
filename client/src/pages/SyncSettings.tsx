import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings as SettingsIcon, Loader2 } from "lucide-react";
import { useState } from "react";

type SyncFrequency = "manual" | "every5min" | "every15min" | "every30min" | "hourly";

const frequencyLabels: Record<SyncFrequency, string> = {
  manual: "Manual (click Sync Now)",
  every5min: "Every 5 minutes",
  every15min: "Every 15 minutes",
  every30min: "Every 30 minutes",
  hourly: "Every hour",
};

export default function SyncSettings() {
  const { user } = useAuth();
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>("manual");
  const [saving, setSaving] = useState(false);

  const getStatusQuery = trpc.oauthSync.status.useQuery(
    undefined,
    { enabled: !!user }
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Add tRPC mutation to save sync settings
      // await updateSyncSettings.mutateAsync({ autoSyncEnabled, syncFrequency });
      console.log("Saved sync settings:", { autoSyncEnabled, syncFrequency });
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const status = getStatusQuery.data;
  const msConnected = status?.microsoft?.connected;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="w-6 h-6" />
        <h1 className="text-3xl font-bold">Sync Settings</h1>
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Auto-Sync Configuration</h2>

        {!msConnected && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
            <p className="text-sm text-amber-900">
              No connected accounts. Go to Settings → Accounts to connect Microsoft 365 or add an SMTP/IMAP account.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Auto-Sync Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-semibold">Enable Auto-Sync</h3>
              <p className="text-sm text-gray-600">
                Automatically sync calendar and mail at the selected frequency
              </p>
            </div>
            <button
              onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
              disabled={!msConnected}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                autoSyncEnabled ? "bg-blue-600" : "bg-gray-300"
              } ${!msConnected ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  autoSyncEnabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Sync Frequency */}
          <div>
            <h3 className="font-semibold mb-3">Sync Frequency</h3>
            <div className="space-y-2">
              {(Object.entries(frequencyLabels) as [SyncFrequency, string][]).map(([freq, label]) => (
                <label key={freq} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    value={freq}
                    checked={syncFrequency === freq}
                    onChange={() => setSyncFrequency(freq)}
                    disabled={!msConnected || !autoSyncEnabled}
                    className="mr-3"
                  />
                  <span className={!msConnected || !autoSyncEnabled ? "text-gray-400" : ""}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving || !msConnected}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Sync Status</h2>
        <div className="space-y-3">
          {msConnected && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-900">
                ✓ Microsoft 365 connected and ready to sync
              </p>
            </div>
          )}
          {!msConnected && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-900">
                No accounts connected. Auto-sync will be available once you connect an account.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-600">
            Current settings: {autoSyncEnabled ? `Auto-sync enabled (${frequencyLabels[syncFrequency]})` : "Auto-sync disabled"}
          </p>
        </div>
      </Card>
    </div>
  );
}
