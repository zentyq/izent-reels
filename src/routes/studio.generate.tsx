import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadMediaToDevice } from "@/lib/download-media";
import {
  STUDIO_ASPECTS,
  STUDIO_BRAND,
  STUDIO_DURATIONS,
  STUDIO_VIDEO_MODELS,
  clipCountForDuration,
} from "@/lib/studio/constants";
import {
  createStudioJob,
  getStudioJob,
  uploadStudioReference,
} from "@/lib/studio.functions";

export const Route = createFileRoute("/studio/generate")({
  head: () => ({
    meta: [{ title: `Generate — ${STUDIO_BRAND}` }],
  }),
  component: StudioGeneratePage,
});

function StudioGeneratePage() {
  const fnCreate = useServerFn(createStudioJob);
  const fnGet = useServerFn(getStudioJob);
  const fnUpload = useServerFn(uploadStudioReference);
  const fileRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [script, setScript] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoModel, setVideoModel] = useState(STUDIO_VIDEO_MODELS[0].id);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status === "ready" || job.status === "failed") return;
    const t = setInterval(async () => {
      const res = await fnGet({ data: { jobId: job.id } });
      if (res.ok && res.job) setJob(res.job);
    }, 4000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  async function onUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) return toast.error("Max 10MB");
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fnUpload({ data: { dataUrl, fileName: file.name } });
      if (!res.ok) throw new Error(res.error || "Upload failed");
      setReferenceImageUrl(res.url);
      toast.success("Reference image attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onGenerate() {
    if (prompt.trim().length < 8) return toast.error("Describe your video (min 8 chars)");
    setBusy(true);
    try {
      const res = await fnCreate({
        data: {
          prompt: prompt.trim(),
          script: script.trim() || null,
          durationSec,
          aspectRatio,
          videoModel,
          referenceImageUrl,
        },
      });
      if (!res.ok) throw new Error(res.error || "Failed to start");
      setJob(res.job);
      toast.message(`Generating ~${clipCountForDuration(durationSec)} clips…`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const clips = clipCountForDuration(durationSec);

  return (
    <StudioShell wide>
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-0px)]">
        <div className="w-full lg:w-[400px] xl:w-[440px] border-r border-border/40 bg-card/30 p-5 space-y-5 overflow-auto">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-wider">
              <Wand2 className="h-3.5 w-3.5" /> Video Generation
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Make long videos</h1>
            <p className="text-xs text-muted-foreground mt-1">
              AI plans scenes, locks style, generates clip-by-clip, merges with FFmpeg.
            </p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Model</Label>
            <div className="mt-1.5 space-y-1.5 max-h-40 overflow-auto pr-1">
              {STUDIO_VIDEO_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setVideoModel(m.id)}
                  className={cn(
                    "w-full text-left rounded-xl border px-3 py-2 transition-colors",
                    videoModel === m.id
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-border/50 hover:border-border",
                  )}
                >
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">{m.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Character / start frame (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 w-full rounded-xl border border-dashed border-border/60 hover:border-primary/40 px-3 py-4 text-sm text-muted-foreground flex flex-col items-center gap-2"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : referenceImageUrl ? (
                <img
                  src={referenceImageUrl}
                  alt="Reference"
                  className="h-20 w-auto rounded-lg object-cover"
                />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" />
                  Upload reference for consistency
                </>
              )}
            </button>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Describe your scene… e.g. "A lone astronaut walks a crimson desert at dusk, cinematic"'
              className="mt-1.5 min-h-[110px]"
            />
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Script (optional)</Label>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste a full script — scenes will follow the story beats"
              className="mt-1.5 min-h-[80px]"
            />
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Duration</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {STUDIO_DURATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDurationSec(d.seconds)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    durationSec === d.seconds
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/50 text-muted-foreground hover:border-border",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              ~{clips} clips × 5s · longer videos take more time & credits
            </p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Aspect</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {STUDIO_ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspectRatio(a.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    aspectRatio === a.id
                      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                      : "border-border/50",
                  )}
                >
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground">{a.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-11 rounded-xl gradient-bg text-primary-foreground font-semibold"
            disabled={busy || (job && !["ready", "failed"].includes(job.status))}
            onClick={onGenerate}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>

        <div className="flex-1 bg-background p-6 md:p-10 flex flex-col items-center justify-center min-h-[480px]">
          {!job ? (
            <div className="text-center max-w-md">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border/50 bg-card/50">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Your video appears here</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Set a prompt, pick Kling / Veo / Seedance, choose length up to 15 min, then
                Generate.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-3xl space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{job.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {job.status}
                    {job.progressNote ? ` · ${job.progressNote}` : ""}
                  </div>
                </div>
                <Link to="/studio/assets" className="text-xs text-primary hover:underline">
                  All assets
                </Link>
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full gradient-bg transition-all duration-500"
                  style={{ width: `${job.progress || 0}%` }}
                />
              </div>

              {job.status === "ready" && job.mediaUrl ? (
                <div className="space-y-4">
                  <video
                    src={job.mediaUrl}
                    controls
                    playsInline
                    className="w-full rounded-2xl border border-border/50 bg-black/5 max-h-[60vh]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const name = `${(job.title || "studio-video").slice(0, 80)}.mp4`;
                        const mode = await downloadMediaToDevice(job.mediaUrl!, name);
                        if (mode === "shared") {
                          toast.success("Use Share → Save Video / Save to Files");
                        } else {
                          toast.success("Download started");
                        }
                      } catch (e) {
                        toast.error((e as Error).message || "Download failed");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl gradient-bg px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <Download className="h-4 w-4" />
                    Download MP4
                  </button>
                </div>
              ) : job.status === "failed" ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {job.error || "Generation failed"}
                </div>
              ) : (
                <div className="rounded-2xl border border-border/50 bg-card/50 px-6 py-16 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Building clip {(job.clipUrls?.length || 0) + 1}… keep this tab open.
                  </p>
                  {!!job.clipUrls?.length && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.clipUrls.length} clip(s) ready
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
