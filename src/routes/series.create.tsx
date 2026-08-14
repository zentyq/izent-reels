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
  Youtube,
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
  CAPTION_STYLES,
  WAVESPEED_VIDEO_MODELS,
  MUSIC_PRESETS,
  SERIES_CONTENT_MODES,
  SERIES_STEPS,
  VIDEO_FORMATS,
  VISUAL_MODES,
  VOICE_PRESETS,
  artStylesForContentMode,
  durationsForFormat,
  nichesForContentMode,
  platformsForFormat,
} from "@/lib/series/constants";
import {
  createSeries,
  extractYouTubeScript,
  previewSeriesMusic,
  previewSeriesVoice,
  reviewImportedYouTubeScript,
  uploadSeriesAudio,
  uploadSeriesReferenceImage,
} from "@/lib/series.functions";
import {
  SERIES_TIMEZONE,
  formatScheduleLabels,
  londonWallToUtcIso,
} from "@/lib/series/timezone";
import {
  createProject,
  generateOAuthUrl,
  listAccounts,
  listProjects,
} from "@/lib/ayrshare.functions";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

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
  const fnUploadAudio = useServerFn(uploadSeriesAudio);
  const fnListProjects = useServerFn(listProjects);
  const fnCreateProject = useServerFn(createProject);
  const fnListAccounts = useServerFn(listAccounts);
  const fnOAuth = useServerFn(generateOAuthUrl);
  const fnPreviewVoice = useServerFn(previewSeriesVoice);
  const fnPreviewMusic = useServerFn(previewSeriesMusic);
  const fnExtractYt = useServerFn(extractYouTubeScript);
  const fnReviewYt = useServerFn(reviewImportedYouTubeScript);

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
  const [nicheMode, setNicheMode] = useState<"preset" | "custom" | "youtube">("preset");
  const nichePresets = useMemo(() => nichesForContentMode(contentMode), [contentMode]);
  const durationOptions = useMemo(() => durationsForFormat(videoFormat), [videoFormat]);
  const platformOptions = useMemo(() => platformsForFormat(videoFormat), [videoFormat]);
  const [nicheId, setNicheId] = useState<string>(nichePresets[0].id);
  const [customNiche, setCustomNiche] = useState("");
  const [exampleScript, setExampleScript] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytImportPhase, setYtImportPhase] = useState<
    "idle" | "extracting" | "reviewing"
  >("idle");
  const ytImporting = ytImportPhase !== "idle";
  const [ytConfirmed, setYtConfirmed] = useState(false);
  const [lockedScript, setLockedScript] = useState("");
  const [lockedTitle, setLockedTitle] = useState("");
  const [sourceYoutubeUrl, setSourceYoutubeUrl] = useState<string | null>(null);
  const [ytNeedsEdit, setYtNeedsEdit] = useState(false);
  const [ytEditNotes, setYtEditNotes] = useState("");
  const [ytNicheLabel, setYtNicheLabel] = useState("");
  const [ytSourceTitle, setYtSourceTitle] = useState("");

  // Step 2
  const [voiceTab, setVoiceTab] = useState<"preset" | "upload">("preset");
  const [voiceId, setVoiceId] = useState(VOICE_PRESETS[0].id);
  const [customVoiceUrl, setCustomVoiceUrl] = useState<string | null>(null);
  const [customVoiceName, setCustomVoiceName] = useState("");
  const [voiceUploading, setVoiceUploading] = useState(false);

  // Step 3
  const [musicTab, setMusicTab] = useState<"preset" | "custom">("preset");
  const [musicIds, setMusicIds] = useState<string[]>([]);
  const [customMusicUrls, setCustomMusicUrls] = useState("");
  const [uploadedMusicUrls, setUploadedMusicUrls] = useState<string[]>([]);
  const [musicUploading, setMusicUploading] = useState(false);

  // Step 4-6
  const availableArtStyles = useMemo(
    () => artStylesForContentMode(contentMode),
    [contentMode],
  );
  const [artStyle, setArtStyle] = useState(availableArtStyles[0]?.id || "comic");
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [refUploading, setRefUploading] = useState(false);
  const [captionStyle, setCaptionStyle] = useState(CAPTION_STYLES[0].id);
  const [skipVoice, setSkipVoice] = useState(false);
  const [skipMusic, setSkipMusic] = useState(false);
  const [skipArtStyle, setSkipArtStyle] = useState(false);
  const [skipCaptions, setSkipCaptions] = useState(false);
  const [skipSocial, setSkipSocial] = useState(false);
  const [glitchEffect, setGlitchEffect] = useState(false);
  const [visualMode, setVisualMode] = useState<"images" | "animated_hook" | "full_video">(
    "images",
  );
  const [videoModel, setVideoModel] = useState(WAVESPEED_VIDEO_MODELS[0].id);
  const [publishDate, setPublishDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });

  const isProductMode = contentMode === "ugc" || contentMode === "commercial";
  const MAX_REF_IMAGES = 30;
  const wizardSteps = SERIES_STEPS;
  const stepMeta = wizardSteps.find((s) => s.id === step) || wizardSteps[0];
  const stepIndex = Math.max(0, wizardSteps.findIndex((s) => s.id === step));

  function goNextStep() {
    setStep((s) => Math.min(8, s + 1));
  }

  function goPrevStep() {
    setStep((s) => Math.max(1, s - 1));
  }

  function skipAndContinue(kind: "voice" | "music" | "art" | "caption" | "social") {
    if (kind === "voice") {
      setSkipVoice(true);
      setCustomVoiceUrl(null);
      setCustomVoiceName("");
    }
    if (kind === "music") {
      setSkipMusic(true);
      setUploadedMusicUrls([]);
    }
    if (kind === "art") setSkipArtStyle(true);
    if (kind === "caption") setSkipCaptions(true);
    if (kind === "social") {
      setSkipSocial(true);
      setPlatforms([]);
    }
    goNextStep();
  }

  async function uploadReferenceFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const remaining = MAX_REF_IMAGES - referenceImageUrls.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_REF_IMAGES} reference images`);
      return;
    }
    const batch = list.slice(0, remaining);
    setRefUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of batch) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is over 10MB — skipped`);
          continue;
        }
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
          throw new Error(res.error || `Upload failed: ${file.name}`);
        }
        uploaded.push(res.url);
      }
      if (uploaded.length) {
        setReferenceImageUrls((prev) => [...prev, ...uploaded].slice(0, MAX_REF_IMAGES));
        toast.success(
          uploaded.length === 1
            ? "Reference image uploaded"
            : `${uploaded.length} reference images uploaded`,
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRefUploading(false);
    }
  }

  async function uploadAudioFile(file: File, kind: "voice" | "music") {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Audio must be under 20MB");
      return;
    }
    const setBusy = kind === "voice" ? setVoiceUploading : setMusicUploading;
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      const res = await fnUploadAudio({
        data: {
          base64: dataUrl,
          contentType: file.type || "audio/mpeg",
          kind,
          filename: file.name,
        },
      });
      if (!res.ok || !res.url) throw new Error(res.error || "Upload failed");
      if (kind === "voice") {
        setCustomVoiceUrl(res.url);
        setCustomVoiceName(file.name);
        setSkipVoice(false);
        setVoiceTab("upload");
        toast.success(
          res.durationSec
            ? `Voice uploaded (${Math.round(res.durationSec)}s)`
            : "Voice uploaded",
        );
      } else {
        setUploadedMusicUrls((prev) => [res.url!, ...prev].slice(0, 5));
        setSkipMusic(false);
        setMusicTab("custom");
        toast.success(
          res.durationSec
            ? `Music uploaded (${Math.round(res.durationSec)}s)`
            : "Music uploaded",
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [postIntervalHours, setPostIntervalHours] = useState(4);

  const nicheLabel = useMemo(() => {
    if (nicheMode === "youtube") return ytNicheLabel.trim() || customNiche.trim();
    if (nicheMode === "custom") return customNiche.trim();
    return nichePresets.find((n) => n.id === nicheId)?.label || nicheId;
  }, [nicheMode, nicheId, customNiche, nichePresets, ytNicheLabel]);

  async function onImportYouTube() {
    if (!youtubeUrl.trim()) return toast.error("Paste a YouTube URL");
    setYtImportPhase("extracting");
    setYtConfirmed(false);
    setLockedScript("");
    try {
      const extracted = await fnExtractYt({
        data: { url: youtubeUrl.trim(), duration },
      });
      if (!extracted.ok) throw new Error(extracted.error || "Caption extract failed");

      setSourceYoutubeUrl(extracted.sourceUrl);
      setYtSourceTitle(extracted.sourceTitle || "");

      setYtImportPhase("reviewing");
      const res = await fnReviewYt({
        data: {
          transcript: extracted.transcript,
          title: extracted.sourceTitle,
          duration,
        },
      });
      if (!res.ok) throw new Error(res.error || "AI review failed");

      setLockedScript(res.finalScript);
      setLockedTitle(res.suggestedTitle || extracted.sourceTitle || "");
      setYtNeedsEdit(!!res.needsEdit);
      setYtEditNotes(res.editNotes || "");
      setYtNicheLabel(res.nicheLabel || "");

      if (res.nicheId && nichePresets.some((n) => n.id === res.nicheId)) {
        setNicheId(res.nicheId!);
        setCustomNiche("");
      } else {
        setCustomNiche(res.nicheLabel || "Custom");
      }

      if (!res.needsEdit) {
        setYtConfirmed(true);
        toast.success("Script ready — no edits needed. Continue the wizard to generate.");
      } else {
        toast.message("AI edited the script — review and confirm before continuing");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setYtImportPhase("idle");
    }
  }

  useEffect(() => {
    const list = nichesForContentMode(contentMode);
    if (!list.some((n) => n.id === nicheId)) {
      setNicheId(list[0].id);
    }
    const styles = artStylesForContentMode(contentMode);
    if (!styles.some((a) => a.id === artStyle)) {
      setArtStyle(styles[0]?.id || "comic");
    }
    if (contentMode === "ugc" || contentMode === "commercial") {
      setVisualMode("full_video");
      setSkipVoice(true);
      setSkipMusic(true);
      // Captions still available — user can keep or skip in step 5
    } else {
      setSkipVoice(false);
      setSkipMusic(false);
      setSkipCaptions(false);
    }
  }, [contentMode]);

  useEffect(() => {
    if (contentMode === "faceless") setReferenceImageUrls([]);
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
      if (nicheMode === "preset") return !!nicheId;
      if (nicheMode === "custom") return customNiche.trim().length >= 10;
      // YouTube: need confirmed locked script
      return (
        !!lockedScript.trim() &&
        lockedScript.trim().length >= 40 &&
        (!ytNeedsEdit || ytConfirmed) &&
        !!(ytNicheLabel.trim() || customNiche.trim() || nicheId)
      );
    }
    if (step === 2) return skipVoice || !!customVoiceUrl || !!voiceId;
    if (step === 4) return skipArtStyle || !!artStyle;
    if (step === 5) return skipCaptions || !!captionStyle;
    if (step === 8) return name.trim().length >= 2 && !!publishTime && !!publishDate;
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
        nicheMode === "youtube"
          ? nichePresets.find((n) => n.id === nicheId)?.description ||
            ytNicheLabel ||
            customNiche.trim() ||
            nicheLabel
          : nicheMode === "custom"
            ? customNiche.trim()
            : nichePresets.find((n) => n.id === nicheId)?.description || nicheLabel;

      const res = await fnCreate({
        data: {
          name: name.trim(),
          videoFormat,
          contentMode,
          niche,
          nicheMode: nicheMode === "youtube" ? (nicheId && nichePresets.some((n) => n.id === nicheId) ? "preset" : "custom") : nicheMode,
          customNiche:
            nicheMode === "custom" || (nicheMode === "youtube" && !nichePresets.some((n) => n.id === nicheId))
              ? (customNiche.trim() || ytNicheLabel || null)
              : null,
          exampleScript:
            nicheMode === "youtube"
              ? null
              : exampleScript.trim() || null,
          lockedScript: nicheMode === "youtube" ? lockedScript.trim() || null : null,
          sourceYoutubeUrl: nicheMode === "youtube" ? sourceYoutubeUrl : null,
          lockedTitle: nicheMode === "youtube" ? lockedTitle.trim() || null : null,
          voiceId: skipVoice && !customVoiceUrl ? null : voiceId,
          customVoiceUrl: skipVoice ? null : customVoiceUrl,
          skipVoice: skipVoice && !customVoiceUrl,
          musicIds: skipMusic ? [] : musicTab === "preset" ? musicIds : [],
          customMusicUrls: skipMusic
            ? []
            : [
                ...uploadedMusicUrls,
                ...(musicTab === "custom"
                  ? customMusicUrls
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : []),
              ].filter(Boolean),
          skipMusic,
          artStyle: skipArtStyle ? "auto" : artStyle,
          skipArtStyle,
          referenceImageUrl: isProductMode ? referenceImageUrls[0] || null : null,
          referenceImageUrls: isProductMode ? referenceImageUrls : [],
          captionStyle: skipCaptions ? "none" : captionStyle,
          skipCaptions,
          glitchEffect,
          animatedHook: visualMode !== "images",
          visualMode: isProductMode ? "full_video" : visualMode,
          videoModel,
          duration: duration as any,
          publishTime,
          postsPerDay,
          postIntervalHours,
          scheduledPublishAt: (() => {
            if (!publishDate) return null;
            const y = publishDate.getFullYear();
            const m = publishDate.getMonth() + 1;
            const d = publishDate.getDate();
            // Calendar day + publishTime interpreted as UK (Europe/London), not browser OS TZ
            return londonWallToUtcIso(y, m, d, publishTime);
          })(),
          timezone: SERIES_TIMEZONE,
          // Keep Ayrshare profile even if social step was skipped — connect later in Series Settings
          projectId: projectId || null,
          platforms: skipSocial ? [] : platforms,
          syncGoogleCalendar: true,
        },
      });
      if (!res.ok) throw new Error(res.error || "Failed to create series");
      toast.success("Series created — first video queued");
      if ((res as any).calendarLink) {
        toast.message("Open Google Calendar to confirm the post event", {
          action: {
            label: "Calendar",
            onClick: () => window.open((res as any).calendarLink, "_blank"),
          },
        });
      }
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

        <div
          className="grid gap-1.5 mb-8"
          style={{ gridTemplateColumns: `repeat(${wizardSteps.length}, minmax(0, 1fr))` }}
        >
          {wizardSteps.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i <= stepIndex ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {stepMeta.title}
            </h1>
            <Badge className="bg-primary/15 text-primary border-0">
              Step {stepIndex + 1} of {wizardSteps.length}
            </Badge>
            {stepMeta.optional && (
              <Badge variant="outline" className="text-sky-600 border-sky-400/50">
                Optional
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 1 &&
              "Choose format & niche — or paste a YouTube URL to extract a script."}
            {step === 2 &&
              "Pick an ElevenLabs voice, upload your own narration, or Skip for silent video. Captions still burn in either way."}
            {step === 3 &&
              "Optional background music — use a preset, paste a URL, or upload your own MP3/WAV."}
            {step === 4 &&
              (isProductMode
                ? "Upload product/brand references (optional). Skip art style to let AI match visuals to the script — UGC & ads still use full AI video."
                : "Pick an art style, or Skip so AI chooses visuals that fit each scene of the script.")}
            {step === 5 &&
              "Choose burned-in caption style (shown with or without voice/music), or Skip for no on-screen text."}
            {step === 6 &&
              (isProductMode
                ? "UGC & commercial always generate full AI video (not image slideshows)."
                : "Choose images-only, animated hook, or full AI video per scene — plus optional effects.")}
            {step === 7 &&
              "Connect social accounts now, or Skip and connect later in Series Settings."}
            {step === 8 &&
              "Name your series, pick duration, and schedule the first post with the calendar."}
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
                <TabBtn
                  active={nicheMode === "youtube"}
                  onClick={() => setNicheMode("youtube")}
                  icon={<Youtube className="h-3.5 w-3.5" />}
                  label="From YouTube"
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
              ) : nicheMode === "custom" ? (
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
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>YouTube URL</Label>
                    <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="https://www.youtube.com/watch?v=…"
                        value={youtubeUrl}
                        onChange={(e) => {
                          setYoutubeUrl(e.target.value);
                          setYtConfirmed(false);
                        }}
                      />
                      <Button
                        type="button"
                        onClick={onImportYouTube}
                        disabled={ytImporting || !youtubeUrl.trim()}
                        className="gradient-bg text-primary-foreground shrink-0"
                      >
                        {ytImporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {ytImportPhase === "reviewing"
                              ? "AI reviewing…"
                              : "Extracting captions…"}
                          </>
                        ) : (
                          <>
                            <Youtube className="h-4 w-4 mr-2" />
                            Extract script
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      We pull English captions only (no video download), detect niche, and AI-polish
                      for faceless narration. Trim uses your Step 8 length (default 30s).
                    </p>
                    {ytImporting && (
                      <p className="text-xs text-primary mt-1">
                        {ytImportPhase === "extracting"
                          ? "Fetching captions & metadata…"
                          : "Detecting niche and polishing script…"}
                      </p>
                    )}
                  </div>

                  {lockedScript && (
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Detected niche</Badge>
                        <span className="text-sm font-medium">
                          {ytNicheLabel || customNiche || "—"}
                        </span>
                        {ytNeedsEdit ? (
                          <Badge className="bg-amber-600 hover:bg-amber-600">AI edited</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">No edit needed</Badge>
                        )}
                      </div>
                      {ytSourceTitle && (
                        <p className="text-xs text-muted-foreground">
                          Source: {ytSourceTitle}
                        </p>
                      )}
                      {ytEditNotes && (
                        <p className="text-xs text-muted-foreground">{ytEditNotes}</p>
                      )}
                      <div>
                        <Label>Script for first video</Label>
                        <Textarea
                          className="mt-1.5 min-h-[180px]"
                          value={lockedScript}
                          onChange={(e) => {
                            setLockedScript(e.target.value);
                            if (ytNeedsEdit) setYtConfirmed(false);
                          }}
                        />
                      </div>
                      <div>
                        <Label>Title (optional)</Label>
                        <Input
                          className="mt-1.5"
                          value={lockedTitle}
                          onChange={(e) => setLockedTitle(e.target.value)}
                        />
                      </div>
                      {ytNeedsEdit && !ytConfirmed && (
                        <Button
                          type="button"
                          onClick={() => {
                            if (lockedScript.trim().length < 40) {
                              return toast.error("Script is too short");
                            }
                            setYtConfirmed(true);
                            toast.success("Script confirmed — continue the wizard");
                          }}
                          className="gradient-bg text-primary-foreground"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Confirm script
                        </Button>
                      )}
                      {ytConfirmed && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          Ready — finish the wizard to generate the first video from this script.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {skipVoice && !customVoiceUrl && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                  Voice skipped — video will generate without narration audio. Captions still appear if enabled.
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-2 h-7"
                    onClick={() => setSkipVoice(false)}
                  >
                    Undo
                  </Button>
                </div>
              )}
              <div className="flex gap-4 border-b border-border/50">
                <TabBtn
                  active={voiceTab === "preset"}
                  onClick={() => setVoiceTab("preset")}
                  icon={<Mic2 className="h-3.5 w-3.5" />}
                  label="AI voices"
                />
                <TabBtn
                  active={voiceTab === "upload"}
                  onClick={() => setVoiceTab("upload")}
                  icon={<Upload className="h-3.5 w-3.5" />}
                  label="Upload my voice"
                />
              </div>
              {voiceTab === "preset" ? (
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
                        onClick={() => {
                          setSkipVoice(false);
                          setCustomVoiceUrl(null);
                          setCustomVoiceName("");
                          setVoiceId(v.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSkipVoice(false);
                            setCustomVoiceUrl(null);
                            setCustomVoiceName("");
                            setVoiceId(v.id);
                          }
                        }}
                        className={cn(
                          "w-full text-left rounded-xl border px-4 py-3.5 flex items-center gap-3 cursor-pointer",
                          !skipVoice && !customVoiceUrl && voiceId === v.id
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-border",
                          skipVoice && !customVoiceUrl && "opacity-50",
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
              ) : (
                <div className="space-y-3">
                  <label className="block rounded-xl border border-dashed border-border/60 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
                      className="hidden"
                      disabled={voiceUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAudioFile(f, "voice");
                        e.target.value = "";
                      }}
                    />
                    {voiceUploading ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Upload className="mx-auto h-6 w-6 mb-2 opacity-60" />
                    )}
                    <div className="text-sm font-medium mt-2">
                      {voiceUploading ? "Uploading…" : "Upload your narration audio"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      MP3 / WAV / M4A up to 20MB — used instead of ElevenLabs for this series.
                    </p>
                  </label>
                  {customVoiceUrl && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
                      <Mic2 className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {customVoiceName || "Custom voice"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {customVoiceUrl}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCustomVoiceUrl(null);
                          setCustomVoiceName("");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              )}
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
                  <label className="block rounded-xl border border-dashed border-border/60 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
                      className="hidden"
                      disabled={musicUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAudioFile(f, "music");
                        e.target.value = "";
                      }}
                    />
                    {musicUploading ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Upload className="mx-auto h-6 w-6 mb-2 opacity-60" />
                    )}
                    <div className="text-sm font-medium mt-2">
                      {musicUploading ? "Uploading…" : "Upload your music / audio"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      MP3 / WAV / M4A up to 20MB
                    </p>
                  </label>
                  {uploadedMusicUrls.length > 0 && (
                    <div className="space-y-2">
                      {uploadedMusicUrls.map((url) => (
                        <div
                          key={url}
                          className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3"
                        >
                          <Music className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0 text-xs truncate">{url}</div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setUploadedMusicUrls((prev) => prev.filter((u) => u !== url))
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <Label>Or paste sound URLs</Label>
                    <Textarea
                      className="mt-1.5 min-h-[100px]"
                      placeholder="Enter direct audio URLs, one per line."
                      value={customMusicUrls}
                      onChange={(e) => setCustomMusicUrls(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <div className="space-y-5">
              {skipArtStyle && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                  Art style skipped — AI will pick visuals that fit each scene of the script.
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-2 h-7"
                    onClick={() => setSkipArtStyle(false)}
                  >
                    Undo
                  </Button>
                </div>
              )}
              {isProductMode && (
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label>Product / brand reference images</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload multiple photos of your product, packaging, logo, or person (up to{" "}
                        {MAX_REF_IMAGES}). AI rotates them across scenes as visual references.
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {referenceImageUrls.length}/{MAX_REF_IMAGES}
                    </Badge>
                  </div>
                  {referenceImageUrls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {referenceImageUrls.map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          className="relative aspect-square rounded-lg overflow-hidden border border-border/60 bg-muted group"
                        >
                          <img
                            src={url}
                            alt={`Reference ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() =>
                              setReferenceImageUrls((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-8 cursor-pointer hover:border-primary/40 transition-colors",
                      referenceImageUrls.length >= MAX_REF_IMAGES &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      disabled={refUploading || referenceImageUrls.length >= MAX_REF_IMAGES}
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (files?.length) await uploadReferenceFiles(files);
                        e.target.value = "";
                      }}
                    />
                    {refUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-6 w-6 opacity-60" />
                    )}
                    <span className="text-sm font-medium">
                      {refUploading
                        ? "Uploading…"
                        : referenceImageUrls.length
                          ? "Add more images"
                          : "Click to upload reference images"}
                    </span>
                    <span className="text-xs text-muted-foreground text-center">
                      PNG, JPG, or WebP · max 10MB each · select multiple · up to {MAX_REF_IMAGES}
                    </span>
                  </label>
                  {referenceImageUrls.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setReferenceImageUrls([])}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              )}
              <div>
                <Label className="mb-2 block">Art style</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {availableArtStyles.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSkipArtStyle(false);
                        setArtStyle(a.id);
                      }}
                      className={cn(
                        "rounded-xl border overflow-hidden text-left transition-all",
                        !skipArtStyle && artStyle === a.id
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border/50 hover:border-border",
                        skipArtStyle && "opacity-50",
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
            <div className="space-y-3">
              {skipCaptions && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                  Captions skipped — no burned-in narration text on the video.
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-2 h-7"
                    onClick={() => setSkipCaptions(false)}
                  >
                    Undo
                  </Button>
                </div>
              )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CAPTION_STYLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSkipCaptions(false);
                    setCaptionStyle(c.id);
                  }}
                  className={cn(
                    "rounded-xl border p-3 space-y-2",
                    !skipCaptions && captionStyle === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border",
                    skipCaptions && "opacity-50",
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
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Visual mode</Label>
                <p className="text-sm text-muted-foreground">
                  {isProductMode
                    ? "UGC & commercial always use full AI video (real video clips per scene)."
                    : "Every scene gets its own AI image. Optionally turn scenes into real AI video."}
                </p>
                {(isProductMode
                  ? VISUAL_MODES.filter((m) => m.id === "full_video")
                  : VISUAL_MODES
                ).map((m) => (
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
                <div className="font-medium mb-1 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Google Calendar schedule
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Pick the first publish date & time. We sync a Calendar event and auto-post via
                  the series scheduler.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <Calendar
                    mode="single"
                    selected={publishDate}
                    onSelect={setPublishDate}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="rounded-xl border border-border/50"
                  />
                  <div className="space-y-3">
                    <div>
                      <Label>First publish time</Label>
                      <Input
                        type="time"
                        value={publishTime}
                        onChange={(e) => setPublishTime(e.target.value)}
                        className="w-40 mt-1.5"
                      />
                    </div>
                    <div>
                      <Label>Videos per day</Label>
                      <Select
                        value={String(postsPerDay)}
                        onValueChange={(v) => setPostsPerDay(Number(v))}
                      >
                        <SelectTrigger className="w-40 mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} / day
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {postsPerDay > 1 && (
                      <div>
                        <Label>Post interval</Label>
                        <Select
                          value={String(postIntervalHours)}
                          onValueChange={(v) => setPostIntervalHours(Number(v))}
                        >
                          <SelectTrigger className="w-40 mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 8, 12].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                Every {n}h
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground mt-1 max-w-[10rem]">
                          e.g. 2:00 + 4h → 2:00, 6:00, 10:00
                        </p>
                      </div>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                          {publishDate
                            ? publishDate.toLocaleDateString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })
                            : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={publishDate}
                          onSelect={setPublishDate}
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Times are <span className="text-foreground font-medium">UK ({SERIES_TIMEZONE})</span>
                      {" — "}GMT/BST. Hosting server location is ignored.
                      {publishDate && publishTime
                        ? (() => {
                            try {
                              const iso = londonWallToUtcIso(
                                publishDate.getFullYear(),
                                publishDate.getMonth() + 1,
                                publishDate.getDate(),
                                publishTime,
                              );
                              const { uk, utc } = formatScheduleLabels(new Date(iso));
                              return (
                                <>
                                  <br />
                                  First post: {uk}
                                  <br />
                                  Fires at: {utc}
                                </>
                              );
                            } catch {
                              return null;
                            }
                          })()
                        : null}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                After create, full videos generate automatically in the background (script +
                images + AI video + merge). They post at your scheduled times with the interval
                you set — no manual Generate click needed.
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
            disabled={stepIndex === 0 || submitting}
            onClick={goPrevStep}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {stepIndex < wizardSteps.length - 1 ? (
            <div className="flex items-center gap-2">
              {(step === 2 || step === 3 || step === 4 || step === 5 || step === 7) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    skipAndContinue(
                      step === 2
                        ? "voice"
                        : step === 3
                          ? "music"
                          : step === 4
                            ? "art"
                            : step === 5
                              ? "caption"
                              : "social",
                    )
                  }
                >
                  Skip
                </Button>
              )}
              <Button
                className="gradient-bg text-primary-foreground"
                disabled={!canContinue()}
                onClick={() => {
                  if (step === 2) setSkipVoice(false);
                  if (step === 3)
                    setSkipMusic(
                      musicIds.length === 0 &&
                        !customMusicUrls.trim() &&
                        uploadedMusicUrls.length === 0,
                    );
                  if (step === 4) setSkipArtStyle(false);
                  if (step === 5) setSkipCaptions(false);
                  goNextStep();
                }}
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
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
