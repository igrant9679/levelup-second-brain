import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import Calendar from "./pages/Calendar";
import Mail from "./pages/Mail";
import SyncSettings from "./pages/SyncSettings";
import NotificationCenter from "./pages/NotificationCenter";
import EventReminders from "./pages/EventReminders";
import SyncStatus from "./pages/SyncStatus";
import BulkImport from "./pages/BulkImport";
import ShareView from "@/pages/ShareView";
import AcceptInvite from "@/pages/AcceptInvite";

function Router() {
  return (
    <Switch>
      {/* Public share page — no auth or app shell needed */}
      <Route path="/share/:token" component={ShareView} />
      {/* Public invite accept page — no auth needed */}
      <Route path="/invite/:token" component={AcceptInvite} />
      {/* All other routes go through AppLayout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/mail" component={Mail} />
            <Route path="/sync-settings" component={SyncSettings} />
            <Route path="/notifications" component={NotificationCenter} />
            <Route path="/event-reminders" component={EventReminders} />
            <Route path="/sync-status" component={SyncStatus} />
            <Route path="/bulk-import" component={BulkImport} />
            <Route path="/404" component={NotFound} />
            {/* Final fallback route */}
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), then change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
