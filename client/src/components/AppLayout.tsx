import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  AlarmClock,
  Activity,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  LogOut,
  Mail,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Calendar, label: "Calendar", path: "/calendar" },
  { icon: Mail, label: "Mail", path: "/mail" },
  { icon: Bell, label: "Notifications", path: "/notifications", badge: true },
  { icon: AlarmClock, label: "Event Reminders", path: "/event-reminders" },
  { icon: Activity, label: "Sync Status", path: "/sync-status" },
  { icon: Download, label: "Bulk Import", path: "/bulk-import" },
  { icon: Settings, label: "Settings", path: "/sync-settings" },
];

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fetch unread notification count
  const notificationsQuery = trpc.oauthSync.getEmailNotifications.useQuery(
    undefined,
    {
      enabled: !!user,
      refetchInterval: 30000,
    }
  );
  const unreadCount = notificationsQuery.data?.length ?? 0;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Render children as-is for unauthenticated pages (login page)
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-40 flex flex-col bg-card border-r border-border transition-all duration-200
          ${collapsed ? "w-16" : "w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:static md:flex
        `}
      >
        {/* Header */}
        <div className={`flex items-center h-14 border-b border-border px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight truncate text-foreground">
              LevelUp
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent text-muted-foreground transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const showBadge = item.badge && unreadCount > 0;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                title={collapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 w-full rounded-lg px-2 py-2 mb-0.5 text-sm font-medium transition-colors
                  ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                  ${collapsed ? "justify-center" : ""}
                `}
              >
                <div className="relative flex-shrink-0">
                  <item.icon className="w-4 h-4" />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && showBadge && (
                  <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: user info + logout */}
        <div className="border-t border-border p-2">
          {collapsed ? (
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center justify-center w-full h-9 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-1 py-1">
              <Avatar className="h-7 w-7 border flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-foreground">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center h-14 border-b border-border px-4 bg-card sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm tracking-tight">LevelUp</span>
          {unreadCount > 0 && (
            <button
              onClick={() => setLocation("/notifications")}
              className="ml-auto relative"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </button>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
