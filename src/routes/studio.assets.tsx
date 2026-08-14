import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STUDIO_BRAND } from "@/lib/studio/constants";
import { deleteStudioJob, listStudioJobs } from "@/lib/studio.functions";
import { downloadMediaToDevice } from "@/lib/download-media";

export const Route = createFileRoute("/studio/assets")({
  head: () => ({
    meta: [{ title: `Assets — ${STUDIO_BRAND}` }],
  }),
  component: StudioAssetsPage,
});

function StudioAssetsPage() {
  const fnList = useServerFn(listStudioJobs);
  const fnDelete = useServerFn(deleteStudioJob);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fnList();
      if (!res.ok) toast.error(res.error || "Failed to load");
      setJobs(res.jobs || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function onDelete(id: string) {
    if (!confirm("Delete this video job?")) return;
    const res = await fnDelete({ data: { jobId: id } });
    if (!res.ok) return toast.error(res.error || "Delete failed");
    toast.success("Deleted");
    load();
  }

  return (
    <StudioShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-primary" />
              Assets
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your Forge generations — download anytime.
            </p>
          </div>
          <Link
            to="/studio/generate"
            className="rounded-full gradient-bg px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            New video
          </Link>
        </div>

        {loading && !jobs.length ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !jobs.length ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center text-muted-foreground">
            No videos yet. Generate your first long clip.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="rounded-2xl border border-border/50 bg-card/50 overflow-hidden flex flex-col"
              >
                <div className="aspect-video bg-muted/40 relative">
                  {j.mediaUrl && j.status === "ready" ? (
                    <video
                      src={j.mediaUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : j.thumbnailUrl ? (
                    <img
                      src={j.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover opacity-90"
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-muted-foreground text-xs">
                      {j.status === "failed" ? "Failed" : `${j.progress || 0}%`}
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="capitalize">
                      {j.status}
                    </Badge>
                  </div>
                </div>
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div>
                    <div className="font-medium text-sm line-clamp-1">
                      {j.title || "Untitled"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {j.durationSec}s · {j.aspectRatio} · {j.clipUrls?.length || 0} clips
                    </div>
                  </div>
                  {j.error && (
                    <p className="text-[11px] text-destructive line-clamp-2">{j.error}</p>
                  )}
                  <div className="mt-auto flex gap-2">
                    {j.mediaUrl && j.status === "ready" && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const name = `${(j.title || "studio-video").slice(0, 80)}.mp4`;
                            const mode = await downloadMediaToDevice(j.mediaUrl, name);
                            if (mode === "shared") {
                              toast.success("Use Share → Save Video / Save to Files");
                            } else {
                              toast.success("Download started");
                            }
                          } catch (e) {
                            toast.error((e as Error).message || "Download failed");
                          }
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(j.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
