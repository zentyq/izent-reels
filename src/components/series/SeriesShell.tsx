import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  Film,
  LayoutGrid,
  Loader2,
  LogOut,
  Moon,
  Settings,
  Share2,
  Shield,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMe, logout } from "@/lib/auth.functions";
import { getPublicAppSettings } from "@/lib/admin.functions";
import { hasUserSeries } from "@/lib/series.functions";
import { IzentLogo } from "@/components/landing/brand";
import { useTheme } from "@/components/ThemeProvider";

const NAV = [
  { to: "/series", label: "Series", icon: LayoutGrid, exact: true },
  { to: "/series/videos", label: "Videos", icon: Film, exact: false },
  { to: "/series/create", label: "Create", icon: Clapperboard, exact: false },
  { to: "/connectors", label: "Connectors", icon: Share2, exact: true },
  { to: "/series/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function SeriesShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const fnGetMe = useServerFn(getMe);
  const fnLogout = useServerFn(logout);
  const fnPublic = useServerFn(getPublicAppSettings);
  const fnHasSeries = useServerFn(hasUserSeries);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const isDark = theme === "dark";
  const onSetup = pathname.startsWith("/series/create");
  const onSubscribe = pathname.startsWith("/subscribe");

  useEffect(() => {
    fnGetMe()
      .then(async (res) => {
        if (!res.ok) {
          navigate({ to: "/", search: { auth: "signin" } });
          return;
        }
        setIsAdmin(res.user?.role === "admin");
        const series = await fnHasSeries();
        const setup = !series.hasSeries;
        setNeedsSetup(setup);
        if (setup && !onSetup) {
          navigate({ to: "/series/create" });
          return;
        }
        if (
          series.pendingPaymentSeriesId &&
          !series.hasActiveSeries &&
          !onSubscribe &&
          !onSetup
        ) {
          navigate({
            to: "/subscribe",
            search: { seriesId: series.pendingPaymentSeriesId },
          });
          return;
        }
        setReady(true);
      })
      .catch(() => navigate({ to: "/", search: { auth: "signin" } }));
    fnPublic()
      .then((res) => {
        if (res.ok) setMaintenance(res.settings.maintenanceMode);
      })
      .catch(() => {});
  }, [pathname]);

  async function handleLogout() {
    await fnLogout();
    navigate({ to: "/" });
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-56 flex-col border-r border-border/40 bg-card/40">
        <div className="p-4 flex items-center gap-2.5">
          <IzentLogo className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Izent Reels</div>
            <div className="text-[11px] text-muted-foreground">
              {needsSetup ? "Setup" : "Studio"}
            </div>
          </div>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {needsSetup ? (
            <div className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
              Finish setup to unlock your video dashboard.
            </div>
          ) : NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40 space-y-1">
          {isAdmin && (
            <Link
              to="/admin"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {isDark ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/40 backdrop-blur-xl bg-background/60 md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <IzentLogo className="h-5 w-5" />
              Izent Reels
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link to="/admin" className="text-xs text-muted-foreground">
                  Admin
                </Link>
              )}
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="text-xs text-muted-foreground"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-muted-foreground"
              >
                Sign out
              </button>
            </div>
          </div>
          {!needsSetup && (
            <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs whitespace-nowrap border",
                    pathname === item.to || pathname.startsWith(item.to + "/")
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/50 text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          {maintenance && (
            <div className="bg-amber-500/15 text-amber-800 dark:text-amber-300 px-4 sm:px-8 py-2 text-sm">
              The studio is in maintenance mode. New series are paused for regular users.
            </div>
          )}
          {(title || subtitle) && (
            <div className="border-b border-border/40 px-4 sm:px-8 py-5">
              {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          <div className="px-4 sm:px-8 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
