import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";

import { listProjects, listAccounts, generateOAuthUrl, createProject } from "@/lib/ayrshare.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/connectors")({
  component: ConnectorsPage,
});



function ConnectorsPage() {
  const fnListProjects = useServerFn(listProjects);
  const fnCreateProject = useServerFn(createProject);
  const fnListAccounts = useServerFn(listAccounts);
  const fnOAuthUrl = useServerFn(generateOAuthUrl);

  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const r = await fnListProjects();
        const pArr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);

        if (pArr.length > 0) {
          setProjects(pArr);
          // Use saved project from localStorage if it matches one of the user's projects
          const savedPid = localStorage.getItem("projectId");
          const match = savedPid && pArr.find((p: any) => (p.projectId || p.id || p._id) === savedPid);
          const pid = match ? savedPid : (pArr[0].projectId || pArr[0].id || pArr[0]._id);
          setProjectId(pid);
          localStorage.setItem("projectId", pid);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    async function load() {
      const r = await fnListAccounts({ data: { projectId } });
      const aArr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);
      setAccounts(aArr);
    }
    load();
  }, [projectId]);

  async function onConnect(platform: string) {
    if (!projectId) return toast.error("Select a project first");
    setConnecting(platform);
    try {
      const r = await fnOAuthUrl({
        data: { projectId, platform: platform as never, redirectUrl: window.location.origin },
      });
      const url = (r as any).url || (r as any).authorizationUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  const connectedCount = accounts.length;

  return (
    <div className="p-4 sm:p-10 max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-bg text-primary-foreground shadow-[var(--shadow-glow)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Social Connectors</h1>
              <p className="text-sm text-muted-foreground">
                Link your accounts to start broadcasting
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-2 sm:mt-0">
          {/* Connected count badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {connectedCount} linked
          </div>

          {/* Project selector */}
          <div className="flex items-center gap-2">
            <Select value={projectId} onValueChange={(val) => { setProjectId(val); localStorage.setItem("projectId", val); }}>
              <SelectTrigger className="w-[140px] sm:w-[180px] bg-card/80 backdrop-blur rounded-xl border-border/50 shadow-sm h-10 text-sm">
                <SelectValue placeholder={loading ? "Loading…" : projects.length === 0 ? "No projects" : "Select project"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p, i) => (
                  <SelectItem key={p.id || p.projectId || i} value={p.id || p.projectId || String(i)}>
                    {p.name || `Project ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>

          {/* Refresh */}
          <button
            onClick={() => { if (projectId) { const r = fnListAccounts({ data: { projectId } }).then(r => { const a = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []); setAccounts(a); toast.success("Refreshed"); }); } }}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border/50 bg-card/80 backdrop-blur text-muted-foreground hover:text-foreground hover:bg-card transition-all shadow-sm"
            title="Refresh accounts"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Platform cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => {
          const isConnected = accounts.some(a => (a.platform || "").toUpperCase() === p.id);
          const isLoading = connecting === p.id;

          return (
            <button
              key={p.id}
              id={`connect-${p.id.toLowerCase()}`}
              onClick={() => onConnect(p.id)}
              disabled={isLoading}
              className={`
                group relative flex items-center justify-between
                px-5 py-4 rounded-2xl border transition-all duration-300 cursor-pointer
                ${isConnected
                  ? `${p.connectedBg} ${p.connectedBorder} shadow-sm`
                  : `bg-card border-border/40 shadow-sm hover:shadow-md ${p.bgHover}`
                }
                ${isLoading ? "opacity-70 pointer-events-none" : ""}
                hover:scale-[1.01] active:scale-[0.99]
              `}
            >
              {/* Left side: small icon + text */}
              <div className="flex items-center gap-3.5">
                <div className={`${p.smallColor} transition-transform duration-300 group-hover:scale-110`}>
                  {p.iconSmall}
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground leading-tight">{p.label}</div>
                  <div className={`text-xs mt-0.5 ${isConnected ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}`}>
                    {isLoading ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Connecting…
                      </span>
                    ) : isConnected ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    ) : (
                      "Click to Link"
                    )}
                  </div>
                </div>
              </div>

              {/* Right side: large icon */}
              <div className={`${p.largeColor} opacity-30 group-hover:opacity-50 transition-all duration-300 group-hover:scale-110`}>
                {p.iconLarge}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-center text-xs text-muted-foreground/70 pt-2">
        Clicking a platform opens a secure authorization window. Complete it, then refresh to see your linked account.
      </p>
    </div>
  );
}
