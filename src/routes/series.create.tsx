import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  Plus,
  Rocket,
  Upload,
} from "lucide-react";

import { SeriesShell } from "@/components/series/SeriesShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ART_STYLES,
  CAPTION_STYLES,
  WAVESPEED_VIDEO_MODELS,
  MUSIC_PRESETS,
  SERIES_CONTENT_MODES,
  SERIES_STEPS,
  VIDEO_FORMATS,
  VISUAL_MODES,
  VOICE_PRESETS,
  durationsForFormat,
  nichesForContentMode,
  platformsForFormat,
} from "@/lib/series/constants";
import {
  createSeries,
  previewSeriesMusic,
  previewSeriesVoice,
  uploadSeriesReferenceImage,
} from "@/lib/series.functions";
import {
  createProject,
  generateOAuthUrl,
  listAccounts,
  listProjects,
} from "@/lib/ayrshare.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/series/create")({
  head: () => ({
    meta: [
      { title: "Create Series — IzentSocial" },
      {
        name: "description",
        content: "Set up an auto-generating faceless video series.",
      },
    ],
  }),
  component: CreateSeriesWizard,
});

function CreateSeriesWizard() {
  const navigate = useNavigate();
  const fnCreate = useServerFn(createSeries);
  const fnUploadRef = useServerFn(uploadSeriesReferenceImage);
  const fnListProjects = useServerFn(listProjects);
  const fnCreateProject = useServerFn(createProject);
  const fnListAccounts = useServerFn(listAccounts);
  const fnOAuth = useServerFn(generateOAuthUrl);
  const fnPreviewVoice = useServerFn(previewSeriesVoice);
  const fnPreviewMusic = useServerFn(previewSeriesMusic);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewCache = useRef<Record<string, string>>({});

  // Step 1
  const [videoFormat, setVideoFormat] = useState<"short" | "long">("short");
  const [contentMode, setContentMode] = useState<"faceless" | "ugc" | "commercial">(
    "faceless",
  );
  const [nicheMode, setNicheMode] = useState<"preset" | "custom">("preset");
  const nichePresets = useMemo(() => nichesForContentMode(contentMode), [contentMode]);
  const durationOptions = useMemo(() => durationsForFormat(videoFormat), [videoFormat]);
  const platformOptions = useMemo(() => platformsForFormat(videoFormat), [videoFormat]);
  const [nicheId, setNicheId] = useState(nichePresets[0].id);
  const [customNiche, setCustomNiche] = useState("");
  const [exampleScript, setExampleScript] = useState("");

  // Step 2
  const [voiceId, setVoiceId] = useState(VOICE_PRESETS[0].id);

  // Step 3
  const [musicTab, setMusicTab] = useState<"preset" | "custom">("preset");
  const [musicIds, setMusicIds] = useState<string[]>([]);
  const [customMusicUrls, setCustomMusicUrls] = useState("");

  // Step 4-6
  const [artStyle, setArtStyle] = useState(ART_STYLES[0].id);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [captionStyle, setCaptionStyle] = useState(CAPTION_STYLES[0].id);
  const [glitchEffect, setGlitchEffect] = useState(false);
  const [visualMode, setVisualMode] = useState<"images" | "animated_hook" | "full_video">(
    "images",
  );
  const [videoModel, setVideoModel] = useState(WAVESPEED_VIDEO_MODELS[0].id);

  // Step 7
  const [projectId, setProjectId] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Step 8
  const [name, setName] = useState("");
  const [duration, setDuration] = useState<string>("30");
  const [publishTime, setPublishTime] = useState("12:00");

  const nicheLabel = useMemo(() => {
    if (nicheMode === "custom") return customNiche.trim();
    return nichePresets.find((n) => n.id === nicheId)?.label || nicheId;
  }, [nicheMode, nicheId, customNiche, nichePresets]);

  useEffect(() => {
    const list = nichesForContentMode(contentMode);
    if (!list.some((n) => n.id === nicheId)) {
      setNicheId(list[0].id);
    }
    if (contentMode === "ugc" && artStyle === "comic") setArtStyle("photoreal");
    if (contentMode === "commercial" && (artStyle === "comic" || artStyle === "photoreal")) {
      setArtStyle("commercial-photo");
    }
  }, [contentMode]);

  useEffect(() => {
    if (contentMode === "faceless") setReferenceImageUrl(null);
  }, [contentMode]);

  useEffect(() => {
    const opts = durationsForFormat(videoFormat);
    if (!opts.some((d) => d.id === duration)) {
      setDuration(opts[0].id);
    }
    const plats = platformsForFormat(videoFormat).map((p) => p.id);
    setPlatforms((prev) => prev.filter((p) => plats.includes(p as any)));
  }, [videoFormat]);

  useEffect(() => {
    async function boot() {
      const r = await fnListProjects();
      const arr = Array.isArray(r.data) ? r.data : [];
      if (arr.length) {
        const pid = arr[0].projectId || arr[0].id;
        setProjectId(pid);
        localStorage.setItem("projectId", pid);
      } else {
        const created = await fnCreateProject({ data: { name: "Series Profile" } });
        if (created?.profileKey) {
          setProjectId(created.profileKey);
          localStorage.setItem("projectId", created.profileKey);
        }
      }
    }
    boot().catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId || step !== 7) return;
    setLoadingAccounts(true);
    fnListAccounts({ data: { projectId } })
      .then((r) => setAccounts(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoadingAccounts(false));
  }, [projectId, step]);

  function canContinue() {
    if (step === 1) {
      return nicheMode === "preset" ? !!nicheId : customNiche.trim().length >= 10;
    }
    if (step === 2) return !!voiceId;
    if (step === 4) return !!artStyle;
    if (step === 5) return !!captionStyle;
    if (step === 8) return name.trim().length >= 2 && !!publishTime;
    return true;
  }

  function toggleMusic(id: string) {
    setMusicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  async function playPreview(
    cacheKey: string,
    fetchBase64: () => Promise<{ ok: boolean; base64?: string; contentType?: string; error?: string }>,
  ) {
    if (playingId === cacheKey) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewLoading(cacheKey);
    try {
      let url = previewCache.current[cacheKey];
      if (!url) {
        const res = await fetchBase64();
        if (!res.ok || !res.base64) throw new Error(res.error || "Preview failed");
        url = `data:${res.contentType || "audio/mpeg"};base64,${res.base64}`;
        previewCache.current[cacheKey] = url;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => {
        setPlayingId(null);
        toast.error("Could not play preview");
      };
      setPlayingId(cacheKey);
      await audio.play();
    } catch (e) {
      toast.error((e as Error).message);
      setPlayingId(null);
    } finally {
      setPreviewLoading(null);
    }
  }

  useEffect(() => {
    return () => stopPreview();
  }, []);

  function togglePlatform(id: string) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function connectPlatform(platform: string) {
    if (!projectId) return toast.error("No Ayrshare project available");
    try {
      const res = await fnOAuth({
        data: {
          projectId,
          platform: platform as any,
          redirectUrl: window.location.href,
        },
      });
      if (res.authorizationUrl) window.open(res.authorizationUrl, "_blank");
      else toast.error("Could not start OAuth");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onSubmit() {
    if (!canContinue()) return;
    setSubmitting(true);
    try {
      const niche =
        nicheMode === "custom"
          ? customNiche.trim()
          : nichePresets.find((n) => n.id === nicheId)?.description || nicheLabel;

      const res = await fnCreate({
        data: {
          name: name.trim(),
          videoFormat,
          contentMode,
          niche,
          nicheMode,
          customNiche: nicheMode === "custom" ? customNiche.trim() : null,
          exampleScript: exampleScript.trim() || null,
          voiceId,
          musicIds: musicTab === "preset" ? musicIds : [],
          customMusicUrls:
            musicTab === "custom"
              ? customMusicUrls
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          artStyle,
          referenceImageUrl:
            contentMode === "ugc" || contentMode === "commercial"
              ? referenceImageUrl
              : null,
          captionStyle,
          glitchEffect,
          animatedHook: visualMode !== "images",
          visualMode,
          videoModel,
          duration: duration as any,
          publishTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          projectId: projectId || null,
          platforms,
        },
      });
      if (!res.ok) throw new Error(res.error || "Failed to create series");
      toast.success("Series created — first video queued");
      navigate({ to: "/series" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SeriesShell>
      <div className="max-w-3xl mx-auto">
        <div className="text-sm text-muted-foreground mb-4">
          Series <span className="mx-1">›</span> Create New Series
        </div>

        <div className="grid grid-cols-8 gap-1.5 mb-8">
          {SERIES_STEPS.map((s) => (
            <div
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-colors",
                s.id <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {SERIES_STEPS[step - 1].title}
            </h1>
            <Badge className="bg-primary/15 text-primary border-0">
              Step {step} of 8
            </Badge>
            {SERIES_STEPS[step - 1].optional && (
              <Badge variant="outline" className="text-sky-600 border-sky-400/50">
                Optional
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 1 &&
              "Choose Short Reels (9:16) or Long Video (16:9 for YouTube/Facebook), then type & niche."}
            {step === 2 && "Pick the ElevenLabs voice for narration."}
            {step === 3 &&
              "Choose as many songs as you want, we'll pick a random one for each video."}
            {step === 4 &&
              (contentMode === "ugc" || contentMode === "commercial"
                ? "Upload a product/brand reference photo, then pick an art look."
                : "Choose the visual style for your video.")}
            {step === 5 && "Choose how captions will appear in your video."}
            {step === 6 &&
              "Choose images-only, animated hook, or full AI video per scene — plus optional effects."}
            {step === 7 &&
              "Connect and select the social media accounts where you want to publish."}
            {step === 8 &&
              (videoFormat === "long"
                ? "Finalize 5–30 min length, name, and posting schedule."
                : "Finalize duration (10s–5min), name, and posting schedule.")}
          </p>
        </div>

        <div className="min-h-[320px] space-y-4">
          {step === 1 && (
            <>
              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                {VIDEO_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setVideoFormat(f.id as "short" | "long")}
                    className={cn(
                      "text-left rounded-xl border px-4 py-3.5 transition-colors",
                      videoFormat === f.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border",
                    )}
                  >
                    <div className="font-medium flex items-center gap-2">
                      {f.label}
                      <Badge variant="outline" className="text-[10px]">
                        {f.aspectRatio}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{f.description}</div>
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                {SERIES_CONTENT_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setContentMode(m.id as typeof contentMode)}
                    className={cn(
                      "text-left rounded-xl border px-4 py-3.5 transition-colors",
                      contentMode === m.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border",
                    )}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{m.description}</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-4 border-b border-border/50 mb-4">
                <TabBtn
                  active={nicheMode === "preset"}
                  onClick={() => setNicheMode("preset")}
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Presets"
                />
                <TabBtn
                  active={nicheMode === "custom"}
                  onClick={() => setNicheMode("custom")}
                  icon={<Rocket className="h-3.5 w-3.5" />}
                  label="Custom"
                />
              </div>
              {nicheMode === "preset" ? (
                <div className="space-y-2">
                  {nichePresets.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setNicheId(n.id)}
                      className={cn(
                        "w-full text-left rounded-xl border px-4 py-3.5 transition-colors",
                        nicheId === n.id
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:border-border",
                      )}
                    >
                      <div className="font-medium">{n.label}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {n.description}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <Label>Niche</Label>
                    <Textarea
                      className="mt-1.5 min-h-[120px]"
                      maxLength={5000}
                      placeholder="e.g. Weird historical facts that sound fake but are real, delivered in a casual conversational tone with humor"
                      value={customNiche}
                      onChange={(e) => setCustomNiche(e.target.value)}
                    />
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>Describe your topic</span>
                      <span>{customNiche.length}/5000</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>Example script</Label>
                      <Badge variant="secondary">Optional</Badge>
                    </div>
                    <Textarea
                      className="mt-1.5 min-h-[120px]"
                      maxLength={2000}
                      placeholder="Paste an example script so AI can match style and tone…"
                      value={exampleScript}
                      onChange={(e) => setExampleScript(e.target.value)}
                    />
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>AI will match this style and tone</span>
                      <span>{exampleScript.length}/2000</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-2">
              {VOICE_PRESETS.map((v) => {
                const previewKey = `voice:${v.id}`;
                const isPlaying = playingId === previewKey;
                const isLoading = previewLoading === previewKey;
                return (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setVoiceId(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setVoiceId(v.id);
                    }}
                    className={cn(
                      "w-full text-left rounded-xl border px-4 py-3.5 flex items-center gap-3 cursor-pointer",
                      voiceId === v.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border",
                    )}
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center">
                      <Mic2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{v.label}</div>
                      <div className="text-sm text-muted-foreground">{v.description}</div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-full shrink-0"
                      disabled={isLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        playPreview(previewKey, () =>
                          fnPreviewVoice({ data: { voiceId: v.id } }),
                        );
                      }}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="flex gap-4 border-b border-border/50 mb-4">
                <TabBtn
                  active={musicTab === "preset"}
                  onClick={() => setMusicTab("preset")}
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Preset music"
                />
                <TabBtn
                  active={musicTab === "custom"}
                  onClick={() => setMusicTab("custom")}
                  icon={<Music className="h-3.5 w-3.5" />}
                  label="Custom"
                />
              </div>
              {musicTab === "preset" ? (
                <div className="space-y-2">
                  {MUSIC_PRESETS.map((m) => {
                    const selected = musicIds.includes(m.id);
                    const previewKey = `music:${m.id}`;
                    const isPlaying = playingId === previewKey;
                    const isLoading = previewLoading === previewKey;
                    return (
                      <div
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMusic(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleMusic(m.id);
                        }}
                        className={cn(
                          "w-full text-left rounded-xl border px-4 py-3.5 flex items-center gap-3 cursor-pointer",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-border",
                        )}
                      >
                        <div
                          className={cn(
                            "h-10 w-10 rounded-lg bg-gradient-to-br shrink-0",
                            m.gradient,
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            {m.label}
                            {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <div className="text-sm text-muted-foreground">{m.description}</div>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 rounded-full shrink-0"
                          disabled={isLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            playPreview(previewKey, () =>
                              fnPreviewMusic({ data: { musicId: m.id } }),
                            );
                          }}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>TikTok Sound URLs</Label>
                    <Textarea
                      className="mt-1.5 min-h-[100px]"
                      placeholder="Enter TikTok sound URLs, one per line."
                      value={customMusicUrls}
                      onChange={(e) => setCustomMusicUrls(e.target.value)}
                    />
                  </div>
                  <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                    <Upload className="mx-auto h-6 w-6 mb-2 opacity-60" />
                    Sound file upload can be added next — paste URLs for now.
                    <br />
                    MP3 / WAV up to 10MB.
                  </div>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <div className="space-y-5">
              {(contentMode === "ugc" || contentMode === "commercial") && (
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div>
                    <Label>Product / brand reference image</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload a photo of your product, packaging, logo, or person. AI will use it as
                      a visual reference in every scene (recommended for UGC & ads).
                    </p>
                  </div>
                  {referenceImageUrl ? (
                    <div className="flex items-start gap-3">
                      <div className="h-28 w-28 rounded-lg overflow-hidden border border-border/60 bg-muted shrink-0">
                        <img
                          src={referenceImageUrl}
                          alt="Reference"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-2">
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-0">
                          Reference ready
                        </Badge>
                        <div className="flex gap-2">
                          <label className="inline-flex">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setRefUploading(true);
                                try {
                                  const dataUrl = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(String(reader.result || ""));
                                    reader.onerror = () => reject(new Error("Read failed"));
                                    reader.readAsDataURL(file);
                                  });
                                  const res = await fnUploadRef({
                                    data: {
                                      base64: dataUrl,
                                      contentType: file.type || "image/png",
                                    },
                                  });
                                  if (!res.ok || !res.url) {
                                    throw new Error(res.error || "Upload failed");
                                  }
                                  setReferenceImageUrl(res.url);
                                  toast.success("Reference image updated");
                                } catch (err) {
                                  toast.error((err as Error).message);
                                } finally {
                                  setRefUploading(false);
                                  e.target.value = "";
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={refUploading}
                              asChild
                            >
                              <span>
                                {refUploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Replace
                              </span>
                            </Button>
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setReferenceImageUrl(null)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-10 cursor-pointer hover:border-primary/40 transition-colors">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 10 * 1024 * 1024) {
                            toast.error("Image must be under 10MB");
                            return;
                          }
                          setRefUploading(true);
                          try {
                            const dataUrl = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result || ""));
                              reader.onerror = () => reject(new Error("Read failed"));
                              reader.readAsDataURL(file);
                            });
                            const res = await fnUploadRef({
                              data: {
                                base64: dataUrl,
                                contentType: file.type || "image/png",
                              },
                            });
                            if (!res.ok || !res.url) {
                              throw new Error(res.error || "Upload failed");
                            }
                            setReferenceImageUrl(res.url);
                            toast.success("Reference image uploaded");
                          } catch (err) {
                            toast.error((err as Error).message);
                          } finally {
                            setRefUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {refUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <Upload className="h-6 w-6 opacity-60" />
                      )}
                      <span className="text-sm font-medium">
                        {refUploading ? "Uploading…" : "Click to upload reference image"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PNG, JPG, or WebP · max 10MB · optional but recommended
                      </span>
                    </label>
                  )}
                </div>
              )}
              <div>
                <Label className="mb-2 block">Art style</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ART_STYLES.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setArtStyle(a.id)}
                      className={cn(
                        "rounded-xl border overflow-hidden text-left transition-all",
                        artStyle === a.id
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border/50 hover:border-border",
                      )}
                    >
                      <div className="aspect-[3/4] bg-muted">
                        <img src={a.image} alt={a.label} className="h-full w-full object-cover" />
                      </div>
                      <div className="px-2 py-2 text-sm font-medium text-center">{a.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CAPTION_STYLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCaptionStyle(c.id)}
                  className={cn(
                    "rounded-xl border p-3 space-y-2",
                    captionStyle === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border",
                  )}
                >
                  <div className="aspect-video rounded-lg bg-zinc-800 grid place-items-center px-2">
                    <span
                      className={cn(
                        "text-white text-center leading-tight",
                        c.id === "bold-stroke" && "font-black text-lg drop-shadow-[0_0_2px_#000]",
                        c.id === "red-highlight" && "font-bold text-red-400",
                        c.id === "sleek" && "font-semibold tracking-wide",
                        c.id === "karaoke" && "bg-primary px-2 py-0.5 rounded text-sm",
                        c.id === "majestic" && "italic font-bold",
                        c.id === "beast" && "font-black italic text-xl -rotate-6",
                        c.id === "elegant" && "font-serif text-lg",
                        c.id === "pixel" && "font-mono text-sm tracking-widest",
                        c.id === "clarity" && "text-xs lowercase",
                      )}
                    >
                      {c.preview}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-center">{c.label}</div>
                </button>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Visual mode</Label>
                <p className="text-sm text-muted-foreground">
                  Every scene always gets its own AI image. Choose whether to also turn scenes into
                  real AI video.
                </p>
                {VISUAL_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setVisualMode(m.id as typeof visualMode)}
                    className={cn(
                      "w-full text-left rounded-xl border px-4 py-3.5 transition-colors",
                      visualMode === m.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border",
                    )}
                  >
                    <div className="font-medium flex items-center gap-2">
                      {m.label}
                      {m.id !== "images" && (
                        <Badge className="bg-orange-500/15 text-orange-600 border-0">PREMIUM</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{m.description}</div>
                  </button>
                ))}
              </div>
              {visualMode !== "images" && (
                <div className="rounded-xl border border-border/50 p-4">
                  <Label>AI video model</Label>
                  <Select value={videoModel} onValueChange={setVideoModel}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WAVESPEED_VIDEO_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label} · {m.note}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {visualMode === "full_video" && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Full AI video generates a real clip for every scene, then FFmpeg merges them
                      into one reel. Longer videos take more time and credits.
                    </p>
                  )}
                </div>
              )}
              <EffectCard
                title="Glitch effect"
                badge="NEW"
                description="Glitches the subject with chromatic distortion — perfect for horror and thrillers."
                checked={glitchEffect}
                onCheckedChange={setGlitchEffect}
              />
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 p-6">
                {loadingAccounts ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-4">
                      You haven't connected any social media accounts yet.
                    </p>
                    <Button variant="outline" onClick={() => setConnectOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Connect your first account
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        Select platforms for this series
                      </p>
                      <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Connect
                      </Button>
                    </div>
                    {platformOptions.map((p) => {
                      const connected = accounts.some(
                        (a) => String(a.platform).toUpperCase() === p.id,
                      );
                      const selected = platforms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={!connected}
                          onClick={() => togglePlatform(p.id)}
                          className={cn(
                            "w-full rounded-xl border px-4 py-3 flex items-center justify-between text-left",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border/50",
                            !connected && "opacity-50",
                          )}
                        >
                          <span className="font-medium">{p.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {connected ? (selected ? "Selected" : "Connected") : "Not connected"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                You can connect your social media accounts later.
              </p>

              {connectOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-md rounded-2xl bg-background border border-border p-6 shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">Connect social media account</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Choose one of the supported platforms.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground"
                        onClick={() => setConnectOpen(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {platformOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => connectPlatform(p.id)}
                          className="rounded-xl border border-border/60 p-4 hover:border-primary/50 text-sm font-medium"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 8 && (
            <div className="space-y-5">
              <div>
                <Label>Series Name</Label>
                <Input
                  className="mt-1.5"
                  placeholder="Enter a name for your series"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Video Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                        {"monetizable" in d && d.monetizable ? " · Monetizable" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {videoFormat === "long"
                    ? "Long 16:9 videos (5–30 min). AI builds title, description & YouTube thumbnail; scenes are merged with FFmpeg."
                    : "Short 9:16 reels (10s–5min). ~1 scene per 10s, each with its own image (and AI video if selected)."}
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">Schedule</div>
                <p className="text-sm text-muted-foreground mb-3">
                  Set when you want your videos to be published.
                </p>
                <Label>Publish time</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="w-40"
                  />
                  <span className="text-xs text-muted-foreground">(Your local time)</span>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                Note: Videos will be generated 6 hours before the scheduled publish time so you
                have time to review them.
              </div>
              {nicheLabel && (
                <div className="text-xs text-muted-foreground">
                  Niche: <span className="text-foreground">{nicheLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {step < 8 ? (
            <Button
              className="gradient-bg text-primary-foreground"
              disabled={!canContinue()}
              onClick={() => setStep((s) => Math.min(8, s + 1))}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              className="gradient-bg text-primary-foreground"
              disabled={!canContinue() || submitting}
              onClick={onSubmit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Create Series
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </SeriesShell>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 pb-2.5 text-sm font-medium border-b-2 -mb-px",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EffectCard({
  title,
  badge,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  badge?: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-4 flex items-start justify-between gap-4">
      <div>
        <div className="font-medium flex items-center gap-2">
          {title}
          {badge && (
            <Badge className="bg-primary/15 text-primary border-0">{badge}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
