import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Activity,
  Clapperboard,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Settings2,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMe, logout } from "@/lib/auth.functions";
import { IzentLogo } from "@/components/landing/brand";

export const ADMIN_NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "content", label: "Content", icon: Clapperboard },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "providers", label: "Providers", icon: KeyRound },
] as const;

export type AdminSection = (typeof ADMIN_NAV)[number]["id"];

export function AdminShell({
  section,
  onSectionChange,
  children,
}: {
  section: AdminSection;
  onSectionChange: (id: AdminSection) => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const fnGetMe = useServerFn(getMe);
  const fnLogout = useServerFn(logout);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fnGetMe()
      .then((res) => {
        if (!res.ok) {
          navigate({ to: "/", search: { auth: "signin" } });
          return;
        }
        if (res.user?.role !== "admin") {
          navigate({ to: "/series" });
          return;
        }
        setReady(true);
      })
      .catch(() => navigate({ to: "/", search: { auth: "signin" } }));
  }, []);

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
      <aside className="hidden md:flex w-60 flex-col border-r border-border/40 bg-card/40">
        <div className="p-4 flex items-center gap-2.5">
          <IzentLogo className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Izent Reels</div>
            <div className="text-[11px] text-primary font-medium flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Admin
            </div>
          </div>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40 space-y-1">
          <Link
            to="/series"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Activity className="h-3.5 w-3.5" />
            Back to studio
          </Link>
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
              Admin
            </div>
            <Link to="/series" className="text-xs text-muted-foreground">
              Studio
            </Link>
          </div>
          <div className="flex gap-1 px-3 pb-2 overflow-x-auto">
            {ADMIN_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs whitespace-nowrap border",
                  section === item.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/50 text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
