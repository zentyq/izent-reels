import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { AdminShell, type AdminSection } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteAdminSeries,
  getAdminOverview,
  getAdminSettings,
  getProviderHealth,
  listAdminSeries,
  listAdminUsers,
  listAdminVideos,
  updateAdminSeriesStatus,
  updateAdminSettings,
  updateAdminUser,
} from "@/lib/admin.functions";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";
import {
  ART_STYLES,
  CAPTION_STYLES,
  VIDEO_DURATIONS,
  VISUAL_MODES,
  VOICE_PRESETS,
  WAVESPEED_VIDEO_MODELS,
} from "@/lib/series/constants";
import { processSeriesQueue } from "@/lib/series.functions";
import { cn } from "@/lib/utils";

type Search = { section?: AdminSection };

export const Route = createFileRoute("/admin")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    section: isSection(s.section) ? s.section : "overview",
  }),
  head: () => ({ meta: [{ title: "Admin - Izent Reels" }] }),
  component: AdminPage,
});

function isSection(v: unknown): v is AdminSection {
  return (
    v === "overview" ||
    v === "users" ||
    v === "content" ||
    v === "settings" ||
    v === "providers"
  );
}

function AdminPage() {
  const { section = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();

  function setSection(next: AdminSection) {
    navigate({ search: { section: next } });
  }

  return (
    <AdminShell section={section} onSectionChange={setSection}>
      {section === "overview" && <OverviewSection />}
      {section === "users" && <UsersSection />}
      {section === "content" && <ContentSection />}
      {section === "settings" && <SettingsSection />}
      {section === "providers" && <ProvidersSection />}
    </AdminShell>
  );
}

function fmtDate(value: string | Date) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "published" || status === "ready"
      ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-0"
      : status === "failed" || status === "suspended"
        ? "bg-red-600/15 text-red-700 dark:text-red-400 border-0"
        : status === "paused" || status === "draft"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0"
          : "bg-primary/10 text-foreground border-0";
  return <Badge className={tone}>{status}</Badge>;
}

function OverviewSection() {
  const fnOverview = useServerFn(getAdminOverview);
  const fnProcess = useServerFn(processSeriesQueue);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof fnOverview>> | null>(null);

  async function load() {
    setLoading(true);
    const res = await fnOverview();
    setData(res);
    setLoading(false);
    if (!res.ok) toast.error(res.error || "Failed to load overview");
  }

  useEffect(() => {
    load();
  }, []);

  async function runQueue() {
    setBusy(true);
    try {
      const res = await fnProcess();
      if (!res.ok) toast.error(res.error || "Queue failed");
      else toast.success("Queue pass finished");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data?.ok) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { label: "Users", value: data.stats.users, hint: `${data.stats.newUsers24h} new today` },
    { label: "Admins", value: data.stats.admins, hint: `${data.stats.suspended} suspended` },
    { label: "Series", value: data.stats.series, hint: `${data.stats.activeSeries} active` },
    { label: "Videos", value: data.stats.videos, hint: `${data.stats.newVideos7d} this week` },
    { label: "Published", value: data.stats.published, hint: "Posted to social" },
    { label: "In queue", value: data.stats.generating, hint: `${data.stats.failed} failed` },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform health, users, and the generation queue.
          </p>
        </div>
        <Button variant="outline" onClick={runQueue} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run queue now
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border/50 bg-card/40 p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 text-sm font-medium">Recent users</div>
          <div className="divide-y divide-border/40">
            {data.recentUsers.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <StatusBadge status={u.role} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 text-sm font-medium">Recent videos</div>
          <div className="divide-y divide-border/40">
            {data.recentVideos.map((v) => (
              <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{v.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {v.series.name} · {v.series.user.email}
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersSection() {
  const fnList = useServerFn(listAdminUsers);
  const fnUpdate = useServerFn(updateAdminUser);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  async function load(query = q) {
    setLoading(true);
    const res = await fnList({ data: { q: query || undefined } });
    if (!res.ok) toast.error(res.error || "Failed to load users");
    setUsers(res.users || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(userId: string, data: { role?: "user" | "admin"; status?: "active" | "suspended" }) {
    const res = await fnUpdate({ data: { userId, ...data } });
    if (!res.ok) return toast.error(res.error || "Update failed");
    toast.success("User updated");
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Promote admins, suspend accounts, and see who is creating series.
        </p>
      </div>
      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border/40">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Series</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3">{u._count.series}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                    >
                      {u.role === "admin" ? "Make user" : "Make admin"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        patch(u.id, { status: u.status === "suspended" ? "active" : "suspended" })
                      }
                    >
                      {u.status === "suspended" ? "Restore" : "Suspend"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No users found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ContentSection() {
  const fnSeries = useServerFn(listAdminSeries);
  const fnVideos = useServerFn(listAdminVideos);
  const fnStatus = useServerFn(updateAdminSeriesStatus);
  const fnDelete = useServerFn(deleteAdminSeries);
  const [q, setQ] = useState("");
  const [seriesStatus, setSeriesStatus] = useState("all");
  const [videoStatus, setVideoStatus] = useState("all");
  const [series, setSeries] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [s, v] = await Promise.all([
      fnSeries({ data: { q: q || undefined, status: seriesStatus as any } }),
      fnVideos({ data: { status: videoStatus as any } }),
    ]);
    if (!s.ok) toast.error(s.error || "Failed to load series");
    if (!v.ok) toast.error(v.error || "Failed to load videos");
    setSeries(s.series || []);
    setVideos(v.videos || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [seriesStatus, videoStatus]);

  async function toggle(id: string, status: string) {
    const next = status === "active" ? "paused" : "active";
    const res = await fnStatus({ data: { seriesId: id, status: next } });
    if (!res.ok) return toast.error(res.error || "Update failed");
    toast.success(next === "active" ? "Series resumed" : "Series paused");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this series and all of its videos?")) return;
    const res = await fnDelete({ data: { seriesId: id } });
    if (!res.ok) return toast.error(res.error || "Delete failed");
    toast.success("Series deleted");
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All series and videos across every account.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold mr-auto">Series</h2>
          <Input
            className="w-52"
            placeholder="Search series or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <Select value={seriesStatus} onValueChange={setSeriesStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "active", "paused", "draft"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}>
            Search
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Series</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Videos</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {series.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.niche}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.user.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3">{s._count.videos}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => toggle(s.id, s.status)}>
                        {s.status === "active" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold mr-auto">Videos</h2>
          <Select value={videoStatus} onValueChange={setVideoStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "pending", "generating", "ready", "published", "failed"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border/40">
              <tr>
                <th className="px-4 py-3 font-medium">Video</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {videos.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{v.title || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground">{v.series.name}</div>
                    {v.error && <div className="text-xs text-red-600 mt-1 max-w-md">{v.error}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{v.series.user.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SettingsSection() {
  const fnGet = useServerFn(getAdminSettings);
  const fnSave = useServerFn(updateAdminSettings);
  const [form, setForm] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fnGet().then((res) => {
      if (res.ok) setForm(res.settings);
      else toast.error(res.error || "Failed to load settings");
      setLoading(false);
    });
  }, []);

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fnSave({ data: form });
      if (!res.ok) throw new Error(res.error || "Save failed");
      setForm(res.settings);
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Site copy, access, and defaults for every new series.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>

      <SectionCard title="Site & access">
        <Field label="Site name">
          <Input value={form.siteName} onChange={(e) => patch("siteName", e.target.value)} />
        </Field>
        <Field label="Tagline">
          <Input value={form.tagline} onChange={(e) => patch("tagline", e.target.value)} />
        </Field>
        <Field label="Social proof">
          <Input
            value={form.socialProofLabel}
            onChange={(e) => patch("socialProofLabel", e.target.value)}
            placeholder="50,000+"
          />
        </Field>
        <Field label="Contact email">
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(e) => patch("contactEmail", e.target.value)}
          />
        </Field>
        <Toggle
          label="Registration open"
          hint="Turn off to stop new sign-ups. Existing users can still sign in."
          checked={form.registrationOpen}
          onChange={(v) => patch("registrationOpen", v)}
        />
        <Toggle
          label="Maintenance mode"
          hint="Blocks new series for regular users. Admins can still create."
          checked={form.maintenanceMode}
          onChange={(v) => patch("maintenanceMode", v)}
        />
      </SectionCard>

      <SectionCard title="New series defaults">
        <Field label="Voice">
          <Select value={form.defaultVoiceId} onValueChange={(v) => patch("defaultVoiceId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_PRESETS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Duration">
          <Select value={form.defaultDuration} onValueChange={(v) => patch("defaultDuration", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_DURATIONS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Art style">
          <Select value={form.defaultArtStyle} onValueChange={(v) => patch("defaultArtStyle", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ART_STYLES.filter((a) => a.id !== "commercial-photo").map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Caption style">
          <Select value={form.defaultCaptionStyle} onValueChange={(v) => patch("defaultCaptionStyle", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTION_STYLES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Visual mode">
          <Select
            value={form.defaultVisualMode}
            onValueChange={(v) => patch("defaultVisualMode", v as AppSettings["defaultVisualMode"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISUAL_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Video model">
          <Select value={form.defaultVideoModel} onValueChange={(v) => patch("defaultVideoModel", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WAVESPEED_VIDEO_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Default publish time">
          <Input
            type="time"
            className="w-40"
            value={form.defaultPublishTime}
            onChange={(e) => patch("defaultPublishTime", e.target.value)}
          />
        </Field>
        <Field label="Videos per day">
          <Input
            type="number"
            min={1}
            max={10}
            className="w-40"
            value={form.defaultPostsPerDay}
            onChange={(e) => patch("defaultPostsPerDay", Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Hours between posts">
          <Input
            type="number"
            min={1}
            max={12}
            className="w-40"
            value={form.defaultPostIntervalHours}
            onChange={(e) => patch("defaultPostIntervalHours", Number(e.target.value) || 4)}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Features">
        <Toggle
          label="YouTube import"
          hint="Let creators paste a YouTube URL to lock a script."
          checked={form.allowYouTubeImport}
          onChange={(v) => patch("allowYouTubeImport", v)}
        />
        <Toggle
          label="Custom voice uploads"
          hint="Allow users to upload their own narration audio."
          checked={form.allowCustomVoice}
          onChange={(v) => patch("allowCustomVoice", v)}
        />
        <Toggle
          label="Custom music uploads"
          hint="Allow users to upload or paste their own music."
          checked={form.allowCustomMusic}
          onChange={(v) => patch("allowCustomMusic", v)}
        />
        <Toggle
          label="Full AI video"
          hint="Allow animated hook and full AI video modes. Images-only stays available."
          checked={form.allowFullAiVideo}
          onChange={(v) => patch("allowFullAiVideo", v)}
        />
        <Field label="Max videos per day">
          <Input
            type="number"
            min={1}
            max={10}
            className="w-40"
            value={form.maxPostsPerDay}
            onChange={(e) => patch("maxPostsPerDay", Number(e.target.value) || 5)}
          />
        </Field>
      </SectionCard>
    </div>
  );
}

function ProvidersSection() {
  const fnHealth = useServerFn(getProviderHealth);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof fnHealth>> | null>(null);

  useEffect(() => {
    fnHealth().then((res) => {
      setData(res);
      setLoading(false);
      if (!res.ok) toast.error(res.error || "Failed to load providers");
    });
  }, []);

  if (loading || !data?.ok) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const missingRequired = data.providers.filter((p) => p.required && !p.configured).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Environment keys are never shown. Set them in your server `.env`.
        </p>
      </div>
      {missingRequired > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
          {missingRequired} required provider{missingRequired === 1 ? "" : "s"} missing.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.providers.map((p) => (
          <div key={p.name} className="rounded-xl border border-border/50 bg-card/40 p-4 flex items-start gap-3">
            {p.configured ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className={cn("h-5 w-5 shrink-0", p.required ? "text-red-600" : "text-amber-500")} />
            )}
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {p.configured ? "Configured" : p.required ? "Missing (required)" : "Not set (optional)"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border/50 px-4 py-3 text-sm text-muted-foreground space-y-1">
        <div>
          Environment: <span className="text-foreground">{data.nodeEnv}</span>
        </div>
        <div>
          ADMIN_EMAILS:{" "}
          <span className="text-foreground">
            {data.adminEmailsConfigured ? "set" : "not set (first user becomes admin)"}
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/50 p-5 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-center">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 px-3 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
