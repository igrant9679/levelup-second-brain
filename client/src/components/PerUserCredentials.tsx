/**
 * PerUserCredentials — lets each user store their own Azure / Google OAuth
 * app credentials (clientId + clientSecret) so they can connect their own
 * tenant without relying on the shared app-level secret.
 *
 * Wired to the existing tRPC procedures:
 *   oauthSync.saveCredentials   — upsert clientId + clientSecret
 *   oauthSync.getCredentials    — read clientId (secret never returned)
 *   oauthSync.deleteCredentials — clear stored credentials
 */

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Provider = "microsoft" | "google";

interface CredFormState {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  msScopes: string;
}

const EMPTY_FORM: CredFormState = {
  clientId: "",
  clientSecret: "",
  tenantId: "",
  msScopes: "",
};

const PROVIDER_META: Record<Provider, { label: string; docsUrl: string; tenantHint?: string; scopeHint?: string }> = {
  microsoft: {
    label: "Microsoft 365 / Azure",
    docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
    tenantHint: "Leave blank for multi-tenant (common). Enter your Directory (tenant) ID for single-tenant apps.",
    scopeHint: "Comma-separated scopes, e.g. User.Read,Calendars.Read,Mail.Read",
  },
  google: {
    label: "Google",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
  },
};

function ProviderCredSection({ provider }: { provider: Provider }) {
  const meta = PROVIDER_META[provider];
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<CredFormState>(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();
  const credQuery = trpc.oauthSync.getCredentials.useQuery({ provider }, { enabled: expanded });

  const saveMutation = trpc.oauthSync.saveCredentials.useMutation({
    onSuccess: () => {
      utils.oauthSync.getCredentials.invalidate({ provider });
      setForm(EMPTY_FORM);
      toast.success(`${meta.label} credentials saved`);
    },
    onError: (err) => toast.error("Failed to save: " + err.message),
    onSettled: () => setSaving(false),
  });

  const deleteMutation = trpc.oauthSync.deleteCredentials.useMutation({
    onSuccess: () => {
      utils.oauthSync.getCredentials.invalidate({ provider });
      toast.success(`${meta.label} credentials cleared`);
    },
    onError: (err) => toast.error("Failed to clear: " + err.message),
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId.trim() || !form.clientSecret.trim()) {
      toast.error("Client ID and Client Secret are required");
      return;
    }
    setSaving(true);
    await saveMutation.mutateAsync({
      provider,
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      tenantId: form.tenantId.trim() || undefined,
      msScopes: provider === "microsoft" && form.msScopes.trim() ? form.msScopes.trim() : undefined,
    });
  };

  const cred = credQuery.data;
  const hasCredential = !!cred?.clientId;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Key className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm">{meta.label}</span>
          {hasCredential && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
              <CheckCircle className="w-3 h-3" />
              Custom credentials saved
            </span>
          )}
          {!hasCredential && (
            <span className="text-xs text-gray-400">Using shared app credentials</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Current credential info */}
          {credQuery.isLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : hasCredential ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-900">Custom credentials active</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Client ID: <span className="font-mono">{cred.clientId}</span>
                  {cred.isSharedFromAdmin && " (shared by admin)"}
                </p>
                {cred.updatedAt && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Saved {new Date(cred.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {!cred.isSharedFromAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 ml-4"
                  onClick={() => deleteMutation.mutate({ provider })}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">
                No custom credentials. The app uses shared credentials. Enter your own below to override.
              </p>
            </div>
          )}

          {/* Form to enter new credentials */}
          <form onSubmit={handleSave} className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">
              {hasCredential ? "Update credentials" : "Enter your own credentials"}
            </h4>
            <p className="text-xs text-gray-500">
              Get these from the{" "}
              <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {provider === "microsoft" ? "Azure Portal" : "Google Cloud Console"}
              </a>
              . Your client secret is write-only — it is never returned after saving.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                <input
                  type="text"
                  placeholder="Application (client) ID"
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    placeholder="Paste secret value here"
                    value={form.clientSecret}
                    onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 pr-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {provider === "microsoft" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Tenant ID <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Directory (tenant) ID or leave blank"
                      value={form.tenantId}
                      onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {meta.tenantHint && (
                      <p className="text-xs text-gray-400 mt-1">{meta.tenantHint}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Scopes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="User.Read,Calendars.Read,Mail.Read"
                      value={form.msScopes}
                      onChange={(e) => setForm((f) => ({ ...f, msScopes: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {meta.scopeHint && (
                      <p className="text-xs text-gray-400 mt-1">{meta.scopeHint}</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <Button type="submit" size="sm" disabled={saving || (!form.clientId.trim() && !form.clientSecret.trim())}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save Credentials
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function PerUserCredentials() {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Key className="w-5 h-5" />
          Your OAuth App Credentials
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Override the shared app credentials with your own Azure or Google app registration.
          Useful if you have a single-tenant Azure app or want to use your own Google project.
        </p>
      </div>
      <div className="space-y-2">
        <ProviderCredSection provider="microsoft" />
        <ProviderCredSection provider="google" />
      </div>
    </Card>
  );
}
