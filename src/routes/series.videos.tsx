import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Film, ImageIcon, Loader2, Sparkles } from "lucide-react";

import { SeriesShell } from "@/components/series/SeriesShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  generateSeriesThumbnail,
  generateSeriesVideoNow,
  listSeriesVideos,
} from "@/lib/series.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/series/videos")({
  head: () => ({
    meta: [{ title: "Series Videos — IzentSocial" }],
  }),
  component: SeriesVideosPage,
});

function SeriesVideosPage() {
  const fnList = useServerFn(listSeriesVideos);
  const fnGenerate = useServerFn(generateSeriesVideoNow);
  const fnThumb = useServerFn(generateSeriesThumbnail);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [thumbBusyId, setThumbBusyId] = useState<string | null>(null);
  const [videos, setVideos] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fnList({ data: {} });
      if (!res.ok) toast.error(res.error || "Failed to load videos");
      setVideos(res.videos || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onGenerate(id: string) {
    setBusyId(id);
    try {
      const res = await fnGenerate({ data: { videoId: id } });
      if (!res.ok) return toast.error(res.error || "Generation failed");
      toast.success("Video generated");
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function onThumbnail(id: string) {
    setThumbBusyId(id);
    try {
      const res = await fnThumb({ data: { videoId: id } });
      if (!res.ok) return toast.error(res.error || "Thumbnail failed");
      toast.success("Thumbnail generated");
      load();
    } finally {
      setThumbBusyId(null);
    }
  }

  return (
    <SeriesShell
      title="Videos"
      subtitle="Review generated videos before they publish. Generate or refresh YouTube thumbnails anytime."
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center text-muted-foreground">
          <Film className="mx-auto h-10 w-10 mb-3 opacity-60" />
          No videos yet. Create a series to queue your first video.
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => {
            const isLong = v.series?.videoFormat === "long";
            const hasThumb =
              v.thumbnailUrl &&
              !String(v.thumbnailUrl).includes(".mp4") &&
              v.thumbnailUrl !== v.mediaUrl;
            return (
              <div
                key={v.id}
                className="rounded-xl border border-border/50 bg-card/40 p-4 flex flex-col sm:flex-row gap-4"
              >
                <div
                  className={cn(
                    "shrink-0 rounded-lg bg-muted overflow-hidden",
                    isLong ? "h-24 w-40" : "h-28 w-20",
                  )}
                >
                  {hasThumb ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title || "Thumbnail"}
                      className="h-full w-full object-cover"
                    />
                  ) : v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : v.mediaUrl ? (
                    <video src={v.mediaUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-muted-foreground">
                      <Film className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium truncate">{v.title || "Untitled episode"}</h3>
                    <Badge variant="secondary">{v.status}</Badge>
                    {isLong && (
                      <Badge variant="outline" className="text-[10px]">
                        16:9 long
                      </Badge>
                    )}
                    {v.thumbnailUrl && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 border-0 text-[10px]">
                        Thumbnail
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.series?.name} · scheduled{" "}
                    {v.scheduledAt ? new Date(v.scheduledAt).toLocaleString() : "—"}
                  </p>
                  {(v.description || v.caption) && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {v.description || v.caption}
                    </p>
                  )}
                  {v.error && <p className="text-xs text-destructive">{v.error}</p>}
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                  {(v.status === "pending" || v.status === "failed") && (
                    <Button
                      size="sm"
                      onClick={() => onGenerate(v.id)}
                      disabled={busyId === v.id}
                      className="gradient-bg text-primary-foreground"
                    >
                      {busyId === v.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Generate now
                        </>
                      )}
                    </Button>
                  )}
                  {(v.status === "ready" || v.status === "published") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onThumbnail(v.id)}
                      disabled={thumbBusyId === v.id}
                      className="w-full"
                    >
                      {thumbBusyId === v.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                          {v.thumbnailUrl ? "Regen thumbnail" : "Generate thumbnail"}
                        </>
                      )}
                    </Button>
                  )}
                  {v.thumbnailUrl && (
                    <a href={v.thumbnailUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" className="w-full">
                        View thumb
                      </Button>
                    </a>
                  )}
                  {v.mediaUrl && (
                    <a href={v.mediaUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="w-full">
                        Open video
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SeriesShell>
  );
}
