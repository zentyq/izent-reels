import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Film,
  ImageIcon,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";

import { SeriesShell } from "@/components/series/SeriesShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateSeriesThumbnail,
  generateSeriesVideoNow,
  listSeriesVideos,
  publishSeriesVideoNow,
} from "@/lib/series.functions";
import { downloadMediaToDevice } from "@/lib/download-media";
import {
  formatScheduleLabels,
  londonDatetimeLocalToUtc,
  toLondonDatetimeLocalValue,
} from "@/lib/series/timezone";
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
  const fnPublish = useServerFn(publishSeriesVideoNow);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [thumbBusyId, setThumbBusyId] = useState<string | null>(null);
  const [postBusyId, setPostBusyId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
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

  async function onPostNow(id: string) {
    setPostBusyId(id);
    try {
      const res = await fnPublish({ data: { videoId: id } });
      if (!res.ok) return toast.error(res.error || "Post failed");
      if ((res as any).warning) {
        toast.warning(String((res as any).warning));
      } else if ((res as any).tiktokPending) {
        toast.message("Posted — TikTok may take 1–2 minutes to appear");
      } else {
        toast.success("Posted to connected social accounts");
      }
      load();
    } finally {
      setPostBusyId(null);
    }
  }

  async function onSchedulePost(id: string) {
    if (!scheduleAt) return toast.error("Pick a date and time");
    let utc: Date;
    try {
      // datetime-local is treated as UK wall time (not browser OS timezone)
      utc = londonDatetimeLocalToUtc(scheduleAt);
    } catch {
      return toast.error("Invalid schedule date/time");
    }
    if (utc.getTime() <= Date.now() + 30_000) {
      return toast.error("Pick a future UK time");
    }
    const labels = formatScheduleLabels(utc);
    setPostBusyId(id);
    try {
      const res = await fnPublish({ data: { videoId: id, scheduleAt: utc.toISOString() } });
      if (!res.ok) return toast.error(res.error || "Schedule failed");
      toast.success(`Scheduled for ${labels.uk}`);
      toast.message(`UTC fire time: ${labels.utc}`);
      if ((res as any).calendarLink) {
        toast.message("Add to Google Calendar", {
          action: {
            label: "Open",
            onClick: () => window.open((res as any).calendarLink, "_blank"),
          },
        });
      }
      setScheduleFor(null);
      load();
    } finally {
      setPostBusyId(null);
    }
  }

  async function onDownload(video: {
    id: string;
    mediaUrl?: string | null;
    title?: string | null;
    episodeNumber?: number | null;
  }) {
    if (!video.mediaUrl) return toast.error("No video file yet");
    setDownloadBusyId(video.id);
    try {
      const base =
        (video.title || `series-ep-${video.episodeNumber || "video"}`)
          .slice(0, 80)
          .trim() || "series-video";
      const filename = base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
      const mode = await downloadMediaToDevice(video.mediaUrl, filename);
      if (mode === "shared") {
        toast.success("Use Share → Save Video / Save to Files");
      } else if (mode === "downloaded") {
        toast.success("Download started");
      } else {
        toast.message("Opened download link");
      }
    } catch (e) {
      toast.error((e as Error).message || "Download failed");
    } finally {
      setDownloadBusyId(null);
    }
  }

  return (
    <SeriesShell
      title="Videos"
      subtitle="Generate, review, post now, or schedule automatic posting. Thumbnails only for 16:9 long videos."
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
            const canPost = v.status === "ready" && v.mediaUrl;
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
                    <h3 className="font-medium truncate">{v.title || "Untitled story"}</h3>
                    {v.status === "published" ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Posted
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{v.status}</Badge>
                    )}
                    {isLong ? (
                      <Badge variant="outline" className="text-[10px]">
                        16:9 long
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        9:16 reel
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.series?.name} ·{" "}
                    {v.status === "published" && v.publishedAt
                      ? `posted ${formatScheduleLabels(new Date(v.publishedAt)).uk}`
                      : v.scheduledAt
                        ? (() => {
                            const { uk, utc } = formatScheduleLabels(new Date(v.scheduledAt));
                            return `scheduled ${uk} · fires ${utc}`;
                          })()
                        : "—"}
                  </p>
                  {(v.description || v.caption) && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {v.description || v.caption}
                    </p>
                  )}
                  {v.error && <p className="text-xs text-destructive">{v.error}</p>}
                  {scheduleFor === v.id && (
                    <div className="rounded-lg border border-border/50 p-3 space-y-2 max-w-sm">
                      <Label className="text-xs">Schedule post (UK time)</Label>
                      <Input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                      />
                      {scheduleAt &&
                        (() => {
                          try {
                            const { uk, utc } = formatScheduleLabels(
                              londonDatetimeLocalToUtc(scheduleAt),
                            );
                            return (
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                UK: {uk}
                                <br />
                                UTC fire time: {utc}
                              </p>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => onSchedulePost(v.id)}
                          disabled={postBusyId === v.id}
                        >
                          Confirm schedule
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setScheduleFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
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
                  {canPost && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => onPostNow(v.id)}
                        disabled={postBusyId === v.id}
                        className="gradient-bg text-primary-foreground w-full"
                      >
                        {postBusyId === v.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                            Post now
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setScheduleFor(v.id);
                          const d = new Date(Date.now() + 2 * 60 * 60_000);
                          setScheduleAt(toLondonDatetimeLocalValue(d));
                        }}
                      >
                        <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                        Schedule
                      </Button>
                    </>
                  )}
                  {isLong && (v.status === "ready" || v.status === "published") && (
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
                  {v.mediaUrl && (
                    <div className="space-y-2">
                      <video
                        src={v.mediaUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-w-[220px] rounded-lg bg-black"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={downloadBusyId === v.id}
                        onClick={() => onDownload(v)}
                      >
                        {downloadBusyId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Download
                      </Button>
                    </div>
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
