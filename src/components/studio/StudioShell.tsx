import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Clapperboard,
  FolderOpen,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMe } from "@/lib/auth.functions";
import { STUDIO_BRAND } from "@/lib/studio/constants";

const NAV = [
  { to: "/studio", label: "Explore", icon: Sparkles, exact: true },
  { to: "/studio/generate", label: "Generate", icon: Wand2, exact: false },
  { to: "/studio/assets", label: "Assets", icon: FolderOpen, exact: false },
] as const;

export function StudioShell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const fnGetMe = useServerFn(getMe);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fnGetMe()
      .then((res) => {
        if (!res.ok) navigate({ to: "/login" });
        else setReady(true);
      })
      .catch(() => navigate({ to: "/login" }));
  }, []);

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
        <Link to="/studio" className="p-4 flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-bg text-primary-foreground shadow-[var(--shadow-glow)]">
            <Clapperboard className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{STUDIO_BRAND}</div>
            <div className="text-[11px] text-muted-foreground">Long AI Video</div>
          </div>
        </Link>

        <nav className="px-3 space-y-1 flex-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to || pathname === `${item.to}/`
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

        <div className="p-3 border-t border-border/40">
          <Link
            to="/series"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            ← Faceless Series
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/40 backdrop-blur-xl bg-background/60 md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Clapperboard className="h-4 w-4 text-primary" />
              {STUDIO_BRAND}
            </div>
            <Link to="/series" className="text-xs text-muted-foreground">
              Series
            </Link>
          </div>
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
        </header>

        <main className={cn("flex-1 overflow-auto", wide ? "p-0" : "px-4 sm:px-8 py-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
