import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye, EyeOff, Loader2, Users } from "lucide-react";

export default function AcceptInvite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Validate the token
  const { data: invite, isLoading, error: tokenError } = trpc.teamInvites.validate.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const accept = trpc.teamInvites.accept.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => setFormError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Please enter your name."); return; }
    if (password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setFormError("Passwords do not match."); return; }
    accept.mutate({ token, name: name.trim(), password });
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Invalid / expired token ────────────────────────────────────────────────
  if (tokenError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-2xl">⚠️</span>
            </div>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>
              {tokenError?.message ?? "This invite link is invalid, has already been used, or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Please ask your admin to send a new invite.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle>Welcome to LevelUp!</CardTitle>
            <CardDescription>
              Your account has been created. You can now sign in with your email and password.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button className="w-full" onClick={() => navigate("/")}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Accept invite form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You've been invited!</CardTitle>
          <CardDescription>
            Set up your LevelUp account to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Invite details */}
          <div className="mb-5 rounded-lg border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{invite.email}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Role</span>
              <Badge variant={invite.role === "admin" ? "default" : "secondary"} className="capitalize">
                {invite.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expires</span>
              <span className="text-muted-foreground text-xs">
                {new Date(invite.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Your Name</Label>
              <Input
                id="inv-name"
                placeholder={invite.name ?? "Jane Smith"}
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-password">Password</Label>
              <div className="relative">
                <Input
                  id="inv-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-confirm">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="inv-confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirm(v => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={accept.isPending}>
              {accept.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
