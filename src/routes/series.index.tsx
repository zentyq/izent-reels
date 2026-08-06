import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Clapperboard,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { SeriesShell } from "@/components/series/SeriesShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deleteSeries,
  listSeries,
  processSeriesQueue,
  updateSeriesStatus,
} from "@/lib/series.functions";

export const Route = createFileRoute("/series/")({
  head: () => ({
    meta: [
      { title: "Series — IzentSocial" },
      {
        name: "description",
        content: "Auto-generate faceless short videos and post them on a schedule.",
      },
    ],
  }),
  component: SeriesListPage,
});

function SeriesListPage() {
  const fnList = useServerFn(listSeries);
  const fnStatus = useServerFn(updateSeriesStatus);
  const fnDelete = useServerFn(deleteSeries);
  const fnProcess = useServerFn(processSeriesQueue);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [series, setSeries] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fnList();
      if (!res.ok) toast.error(res.error || "Failed to load series");
      setSeries(res.series || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(id: string, status: string) {
    const next = status === "active" ? "paused" : "active";
    const res = await fnStatus({ data: { seriesId: id, status: next as any } });
    if (!res.ok) return toast.error(res.error || "Update failed");
    toast.success(next === "active" ? "Series resumed" : "Series paused");
    load();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this series and all its videos?")) return;
    const res = await fnDelete({ data: { seriesId: id } });
    if (!res.ok) return toast.error(res.error || "Delete failed");
    toast.success("Series deleted");
    load();
  }

  async function onProcess() {
    setProcessing(true);
    try {
      const res = await fnProcess();
      if (!res.ok) return toast.error(res.error || "Queue failed");
      toast.success(`Processed: ${res.generated} generated, ${res.posted} posted`);
      load();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <SeriesShell
      title="Your series"
      subtitle="Configure once — we generate, schedule, and post faceless reels automatically."
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onProcess} disabled={processing}>
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Process queue
          </Button>
        </div>
        <Link to="/series/create">
          <Button className="gradient-bg text-primary-foreground shadow-[var(--shadow-glow)]">
            <Plus className="h-4 w-4 mr-2" />
            Create New Series
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
          <Clapperboard className="mx-auto h-10 w-10 text-primary mb-4" />
          <h2 className="text-lg font-semibold">No series yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Create a niche-based series. We write scripts, generate art + voice +
            music, assemble reels, and post to your connected accounts.
          </p>
          <Link to="/series/create">
            <Button className="mt-6 gradient-bg text-primary-foreground">
              <Plus className="h-4 w-4 mr-2" />
              Create your first series
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {series.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-border/50 bg-card/50 p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold tracking-tight">{s.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.niche}</p>
                </div>
                <Badge variant={s.status === "active" ? "default" : "secondary"}>
                  {s.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-muted/60 px-2 py-1">{s.artStyle}</span>
                <span className="rounded-md bg-muted/60 px-2 py-1">{s.duration}s</span>
                <span className="rounded-md bg-muted/60 px-2 py-1">
                  {s._count?.videos ?? 0} videos
                </span>
                <span className="rounded-md bg-muted/60 px-2 py-1">@{s.publishTime}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => toggleStatus(s.id, s.status)}
                >
                  {s.status === "active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
                    </>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SeriesShell>
  );
}
