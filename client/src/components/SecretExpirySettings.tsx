import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Provider = "microsoft" | "google";

interface ExpiryFormState {
  id?: number;
  provider: Provider;
  label: string;
  expiresAt: string; // ISO date string for input[type=date]
  notifyDaysBefore: number;
}

const EMPTY_FORM: ExpiryFormState = {
  provider: "microsoft",
  label: "",
  expiresAt: "",
  notifyDaysBefore: 30,
};

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function ExpiryStatusBadge({ expiresAt, notifyDaysBefore }: { expiresAt: Date; notifyDaysBefore: number }) {
  const days = daysUntil(expiresAt);
  if (days < 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
        <XCircle className="w-3 h-3" /> Expired {Math.abs(days)}d ago
      </span>
    );
  }
  if (days <= notifyDaysBefore) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
        <AlertTriangle className="w-3 h-3" /> Expires in {days}d
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
      <CheckCircle className="w-3 h-3" /> {days}d remaining
    </span>
  );
}

export default function SecretExpirySettings() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExpiryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();
  const expiriesQuery = trpc.oauthSync.getSecretExpiries.useQuery();

  const upsertMutation = trpc.oauthSync.upsertSecretExpiry.useMutation({
    onSuccess: () => {
      utils.oauthSync.getSecretExpiries.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success("Secret expiry reminder saved");
    },
    onError: (err) => toast.error("Failed to save: " + err.message),
    onSettled: () => setSaving(false),
  });

  const deleteMutation = trpc.oauthSync.deleteSecretExpiry.useMutation({
    onSuccess: (_, variables) => {
      utils.oauthSync.getSecretExpiries.setData(undefined, (old) =>
        old ? old.filter((e) => e.id !== variables.id) : old
      );
      toast.success("Reminder deleted");
    },
    onError: (err) => {
      utils.oauthSync.getSecretExpiries.invalidate();
      toast.error("Failed to delete: " + err.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim() || !form.expiresAt) {
      toast.error("Label and expiry date are required");
      return;
    }
    setSaving(true);
    await upsertMutation.mutateAsync({
      id: form.id,
      provider: form.provider,
      label: form.label.trim(),
      expiresAt: new Date(form.expiresAt),
      notifyDaysBefore: form.notifyDaysBefore,
    });
  };

  const startEdit = (entry: any) => {
    setForm({
      id: entry.id,
      provider: entry.provider as Provider,
      label: entry.label,
      expiresAt: new Date(entry.expiresAt).toISOString().split("T")[0],
      notifyDaysBefore: entry.notifyDaysBefore,
    });
    setShowForm(true);
  };

  const expiries = expiriesQuery.data ?? [];

  // Compute a summary warning for the card header
  const expiredCount = expiries.filter((e) => daysUntil(new Date(e.expiresAt)) < 0).length;
  const soonCount = expiries.filter((e) => {
    const d = daysUntil(new Date(e.expiresAt));
    return d >= 0 && d <= e.notifyDaysBefore;
  }).length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Secret Expiry Reminders
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Track when your OAuth app secrets expire so you can rotate them before they lapse.
          </p>
          {(expiredCount > 0 || soonCount > 0) && (
            <div className="flex gap-2 mt-2">
              {expiredCount > 0 && (
                <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
                  {expiredCount} expired
                </span>
              )}
              {soonCount > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  {soonCount} expiring soon
                </span>
              )}
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Reminder
        </Button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <h3 className="text-sm font-semibold">{form.id ? "Edit Reminder" : "New Reminder"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
              <input
                type="text"
                placeholder="e.g. Azure App Secret"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider }))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="microsoft">Microsoft 365</option>
                <option value="google">Google</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notify this many days before expiry
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.notifyDaysBefore}
                onChange={(e) => setForm((f) => ({ ...f, notifyDaysBefore: parseInt(e.target.value) || 30 }))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {form.id ? "Save Changes" : "Add Reminder"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {expiriesQuery.isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading reminders…</span>
        </div>
      ) : expiries.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No expiry reminders yet. Add one to track your secret rotation schedule.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expiries.map((entry) => {
            const expiresAt = new Date(entry.expiresAt);
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{entry.label}</span>
                      <span className="text-xs text-gray-400 capitalize">{entry.provider}</span>
                      <ExpiryStatusBadge expiresAt={expiresAt} notifyDaysBefore={entry.notifyDaysBefore} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Expires {expiresAt.toLocaleDateString()} · Notify {entry.notifyDaysBefore}d before
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => startEdit(entry)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-500 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate({ id: entry.id })}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
