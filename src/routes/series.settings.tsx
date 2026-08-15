import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Settings2, Upload } from "lucide-react";

import { SeriesShell } from "@/components/series/SeriesShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAPTION_STYLES,
  MUSIC_PRESETS,
  VISUAL_MODES,
  VOICE_PRESETS,
  WAVESPEED_VIDEO_MODELS,
  artStylesForContentMode,
  durationsForFormat,
  normalizeShortDuration,
  platformsForFormat,
} from "@/lib/series/constants";
import { getPlatform } from "@/lib/platforms";
import { localTimezone } from "@/lib/series/timezone";
import { cn } from "@/lib/utils";
import {
  getSeriesSettings,
  updateSeriesSettings,
  uploadSeriesAudio,
} from "@/lib/series.functions";
import { downloadMediaFromUrl } from "@/lib/download.functions";
import {
  createProject,
  generateOAuthUrl,
  listAccounts,
  listProjects,
} from "@/lib/ayrshare.functions";

export const Route = createFileRoute("/series/settings")({
  head: () => ({
    meta: [{ title: "Series Settings - Izent Reels" }],
  }),
  component: SeriesSettingsPage,
});

function SeriesSettingsPage() {
  const fnGet = useServerFn(getSeriesSettings);
  const fnUpdate = useServerFn(updateSeriesSettings);
  const fnUploadAudio = useServerFn(uploadSeriesAudio);
  const fnDownloadMedia = useServerFn(downloadMediaFromUrl);
  const fnListProjects = useServerFn(listProjects);
  const fnCreateProject = useServerFn(createProject);
  const fnListAccounts = useServerFn(listAccounts);
  const fnOAuth = useServerFn(generateOAuthUrl);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allSeries, setAllSeries] = useState<any[]>([]);
  const [seriesId, setSeriesId] = useState("");
  const [form, setForm] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [linkingProject, setLinkingProject] = useState(false);
  const [audioUploading, setAudioUploading] = useState<"voice" | "music" | null>(null);
  const [voiceSourceUrl, setVoiceSourceUrl] = useState("");

  const selected = useMemo(
    () => allSeries.find((s) => s.id === seriesId) || null,
    [allSeries, seriesId],
  );
  const artStyles = artStylesForContentMode(form?.contentMode || "faceless");
  const durationOpts = durationsForFormat(form?.videoFormat || "short");
  const platformOpts = platformsForFormat(form?.videoFormat || "short");

  async function load(preferredId?: string) {
    setLoading(true);
    try {
      const res = await fnGet({ data: { seriesId: preferredId } });
      if (!res.ok) {
        toast.error(res.error || "Failed to load settings");
        return;
      }
      setAllSeries(res.series || []);
      const sel = res.selected;
      if (sel) {
        setSeriesId(sel.id);
        setForm({
          ...sel,
          duration:
            sel.videoFormat === "long"
              ? sel.duration
              : normalizeShortDuration(sel.duration || "30-40"),
          timezone: sel.timezone || localTimezone(),
        });
      } else {
        setForm(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshAccounts(projectId: string) {
    if (!projectId) {
      setAccounts([]);
      return;
    }
    setAccountsLoading(true);
    try {
      const r = await fnListAccounts({ data: { projectId } });
      setAccounts(Array.isArray(r.data) ? r.data : []);
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }

  /** Always use THIS logged-in user's Ayrshare profile (never another account's). */
  async function ensureSeriesProject(): Promise<string | null> {
    if (!form?.id) return null;
    setLinkingProject(true);
    try {
      const r = await fnListProjects();
      let arr = Array.isArray(r.data) ? r.data : [];
      if (!arr.length) {
        const created = await fnCreateProject({ data: { name: form.name || "Series Profile" } });
        if (created?.profileKey) {
          arr = [{ projectId: created.profileKey, name: form.name || "Series Profile" }];
        } else {
          const again = await fnListProjects();
          arr = Array.isArray(again.data) ? again.data : [];
        }
      }
      const pid = arr[0]?.projectId || arr[0]?.id;
      if (!pid) {
        toast.error("Could not create a social profile - check Ayrshare setup");
        return null;
      }
      // Re-bind even if form already had a projectId (may have been another user's)
      if (form.projectId !== pid) {
        const saved = await fnUpdate({
          data: { seriesId: form.id, projectId: pid },
        });
        if (!saved.ok) throw new Error(saved.error || "Failed to link social profile");
        patch({ projectId: pid });
        setAllSeries((prev) =>
          prev.map((s) => (s.id === form.id ? { ...s, projectId: pid } : s)),
        );
      }
      localStorage.setItem("projectId", pid);
      return pid;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setLinkingProject(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Re-bind social profile to the logged-in user whenever a series is selected
  useEffect(() => {
    if (!form?.id) return;
    ensureSeriesProject().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.id]);

  useEffect(() => {
    if (!form?.projectId) {
      setAccounts([]);
      return;
    }
    refreshAccounts(form.projectId);
  }, [form?.projectId]);

  // After OAuth popup closes, refresh connected accounts
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && form?.projectId) {
        refreshAccounts(form.projectId);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [form?.projectId]);

  function patch(p: Record<string, unknown>) {
    setForm((prev: any) => (prev ? { ...prev, ...p } : prev));
  }

  async function importVoiceFromUrl() {
    const sourceUrl = voiceSourceUrl.trim();
    if (!sourceUrl) return toast.error("Paste a voice or video link first");
    try {
      new URL(sourceUrl);
    } catch {
      return toast.error("Enter a valid public URL");
    }

    setAudioUploading("voice");
    try {
      const downloaded = await fnDownloadMedia({
        data: { url: sourceUrl, audioOnly: true },
      });
      if (!downloaded.ok || !downloaded.base64) {
        throw new Error(downloaded.error || "Could not extract audio from this link");
      }
      const uploaded = await fnUploadAudio({
        data: {
          base64: downloaded.base64,
          contentType: downloaded.contentType || "audio/mpeg",
          kind: "voice",
          filename: downloaded.filename || "custom-voice.mp3",
        },
      });
      if (!uploaded.ok || !uploaded.url) {
        throw new Error(uploaded.error || "Could not save the extracted voice");
      }
      patch({ customVoiceUrl: uploaded.url, skipVoice: false });
      toast.success("Voice extracted and ready");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAudioUploading(null);
    }
  }

  async function onSave() {
    if (!form?.id) return;
    setSaving(true);
    try {
      const res = await fnUpdate({
        data: {
          seriesId: form.id,
          name: form.name,
          voiceId: form.customVoiceUrl || !form.skipVoice ? form.voiceId : "none",
          customVoiceUrl: form.skipVoice ? null : form.customVoiceUrl || null,
          skipVoice: !!form.skipVoice && !form.customVoiceUrl,
          musicIds: form.skipMusic ? [] : form.musicIds || [],
          customMusicUrls: form.skipMusic ? [] : form.customMusicUrls || [],
          skipMusic: !!form.skipMusic,
          artStyle: form.artStyle === "auto" || form.skipArtStyle ? "auto" : form.artStyle,
          captionStyle: form.skipCaptions ? "none" : form.captionStyle,
          skipCaptions: !!form.skipCaptions,
          visualMode:
            form.contentMode === "ugc" || form.contentMode === "commercial"
              ? "full_video"
              : form.visualMode,
          videoModel: form.videoModel,
          duration: form.duration,
          publishTime: form.publishTime,
          postsPerDay: 1,
          postIntervalHours: Number(form.postIntervalHours) || 4,
          timezone: form.timezone || localTimezone(),
          projectId: form.projectId,
          platforms: form.platforms || [],
          glitchEffect: !!form.glitchEffect,
          status: form.status,
        },
      });
      if (!res.ok) throw new Error(res.error || "Save failed");
      toast.success("Series settings saved");
      load(form.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function connectPlatform(platform: string) {
    setConnecting(platform);
    try {
      const projectId = await ensureSeriesProject();
      if (!projectId) return;
      const res = await fnOAuth({
        data: {
          projectId,
          platform: platform as any,
          redirectUrl: window.location.href,
        },
      });
      if (res.authorizationUrl) {
        window.open(res.authorizationUrl, "_blank");
        toast.message("Complete login in the new tab, then return here and refresh");
        // Optimistic: enable this platform for posting once they finish OAuth
        const cur: string[] = form?.platforms || [];
        if (!cur.includes(platform)) {
          patch({ platforms: [...cur, platform] });
        }
      } else {
        toast.error("Could not start OAuth");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  function togglePlatform(id: string) {
    const cur: string[] = form?.platforms || [];
    patch({
      platforms: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  }

  return (
    <SeriesShell
      title="Series Settings"
      subtitle="Configure how this series generates and posts."
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !allSeries.length || !form ? (
        <div className="rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center text-muted-foreground">
          <Settings2 className="mx-auto h-10 w-10 mb-3 opacity-60" />
          Create a series first, then manage its voice, music, captions, schedule, and social
          accounts here.
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <div>
            <Label>Series</Label>
            <Select
              value={seriesId}
              onValueChange={(id) => {
                setSeriesId(id);
                const s = allSeries.find((x) => x.id === id);
                if (s) setForm({ ...s });
              }}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allSeries.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <section className="rounded-xl border border-border/50 p-4 space-y-3">
            <h2 className="font-semibold">Basics</h2>
            <div>
              <Label>Name</Label>
              <Input
                className="mt-1.5"
                value={form.name || ""}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Duration</Label>
                <Select value={form.duration} onValueChange={(v) => patch({ duration: v })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOpts.map((d) => {
                      const tiktok = getPlatform("TIKTOK");
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="flex items-center gap-2">
                            <span>{d.label}</span>
                            {"monetizable" in d && d.monetizable ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium">
                                {tiktok && (
                                  <span className="[&>svg]:h-3 [&>svg]:w-3">{tiktok.iconSmall}</span>
                                )}
                                Monetizable
                              </span>
                            ) : null}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>First post time</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  value={form.publishTime || "12:00"}
                  onChange={(e) => patch({ publishTime: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Times use your local timezone{" "}
              <span className="font-medium text-foreground">
                ({form.timezone || localTimezone()})
              </span>
              .
            </p>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Series active</div>
                <p className="text-xs text-muted-foreground">Pause to stop auto generate/post</p>
              </div>
              <Switch
                checked={form.status === "active"}
                onCheckedChange={(v) => patch({ status: v ? "active" : "paused" })}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border/50 p-4 space-y-3">
            <h2 className="font-semibold">Voice & music</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm">Skip voice (normal / silent video)</span>
              <Switch
                checked={!!form.skipVoice && !form.customVoiceUrl}
                onCheckedChange={(v) =>
                  patch({
                    skipVoice: v,
                    ...(v ? { customVoiceUrl: null } : {}),
                  })
                }
              />
            </div>
            {!(form.skipVoice && !form.customVoiceUrl) && (
              <>
                <Select
                  value={form.customVoiceUrl ? "custom" : form.voiceId || VOICE_PRESETS[0].id}
                  onValueChange={(v) => {
                    if (v === "custom") return;
                    patch({ voiceId: v, customVoiceUrl: null, skipVoice: false });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_PRESETS.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                    {form.customVoiceUrl && (
                      <SelectItem value="custom">Custom voice</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,.mp3,.wav,.m4a"
                      className="hidden"
                      disabled={audioUploading === "voice"}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 20 * 1024 * 1024) {
                          return toast.error("Audio must be under 20MB");
                        }
                        setAudioUploading("voice");
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
                              kind: "voice",
                              filename: file.name,
                            },
                          });
                          if (!res.ok || !res.url) throw new Error(res.error || "Upload failed");
                          patch({ customVoiceUrl: res.url, skipVoice: false });
                          toast.success("Custom voice uploaded");
                        } catch (err) {
                          toast.error((err as Error).message);
                        } finally {
                          setAudioUploading(null);
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" asChild>
                      <span>
                        {audioUploading === "voice" ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Upload my voice
                      </span>
                    </Button>
                  </label>

                  <div className="space-y-2">
                    <Label>Or paste a voice / video link</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="url"
                        placeholder="Paste a public audio or video link"
                        value={voiceSourceUrl}
                        disabled={audioUploading === "voice"}
                        onChange={(e) => setVoiceSourceUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void importVoiceFromUrl();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void importVoiceFromUrl()}
                        disabled={audioUploading === "voice" || !voiceSourceUrl.trim()}
                      >
                        {audioUploading === "voice" && (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        )}
                        Extract voice
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload a file or extract audio from a public link for future videos.
                    </p>
                  </div>
                </div>
                {form.customVoiceUrl && (
                  <p className="text-xs text-muted-foreground truncate">
                    Using custom voice: {form.customVoiceUrl}
                  </p>
                )}
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm">Skip music</span>
              <Switch
                checked={!!form.skipMusic}
                onCheckedChange={(v) => patch({ skipMusic: v })}
              />
            </div>
            {!form.skipMusic && (
              <>
                <div className="flex flex-wrap gap-2">
                  {MUSIC_PRESETS.map((m) => {
                    const selected = (form.musicIds || []).includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const cur: string[] = form.musicIds || [];
                          patch({
                            musicIds: selected
                              ? cur.filter((x) => x !== m.id)
                              : [...cur, m.id],
                          });
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border/50"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,.mp3,.wav,.m4a"
                    className="hidden"
                    disabled={audioUploading === "music"}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (file.size > 20 * 1024 * 1024) {
                        return toast.error("Audio must be under 20MB");
                      }
                      setAudioUploading("music");
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
                            kind: "music",
                            filename: file.name,
                          },
                        });
                        if (!res.ok || !res.url) throw new Error(res.error || "Upload failed");
                        const cur: string[] = form.customMusicUrls || [];
                        patch({
                          customMusicUrls: [res.url, ...cur].slice(0, 5),
                          skipMusic: false,
                        });
                        toast.success("Music uploaded");
                      } catch (err) {
                        toast.error((err as Error).message);
                      } finally {
                        setAudioUploading(null);
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" asChild>
                    <span>
                      {audioUploading === "music" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Upload music / audio
                    </span>
                  </Button>
                </label>
                <div>
                  <Label className="text-xs">Custom music URLs</Label>
                  <Textarea
                    className="mt-1.5 min-h-[72px] text-sm"
                    placeholder="One audio URL per line"
                    value={(form.customMusicUrls || []).join("\n")}
                    onChange={(e) =>
                      patch({
                        customMusicUrls: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-border/50 p-4 space-y-3">
            <h2 className="font-semibold">Art, captions & visuals</h2>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Skip art style</span>
                <p className="text-xs text-muted-foreground">
                  Let AI pick visuals from the script mood per scene
                </p>
              </div>
              <Switch
                checked={form.artStyle === "auto" || !!form.skipArtStyle}
                onCheckedChange={(v) =>
                  patch({ skipArtStyle: v, artStyle: v ? "auto" : artStyles[0]?.id || "comic" })
                }
              />
            </div>
            {form.artStyle !== "auto" && !form.skipArtStyle && (
              <div>
                <Label>Art style</Label>
                <Select value={form.artStyle} onValueChange={(v) => patch({ artStyle: v, skipArtStyle: false })}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {artStyles.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm">Skip burned-in captions</span>
              <Switch
                checked={!!form.skipCaptions}
                onCheckedChange={(v) => patch({ skipCaptions: v })}
              />
            </div>
            {!form.skipCaptions && (
              <Select
                value={form.captionStyle || "bold-stroke"}
                onValueChange={(v) => patch({ captionStyle: v })}
              >
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
            )}
            {form.contentMode === "faceless" && (
              <>
                <Label>Visual mode</Label>
                <Select
                  value={form.visualMode || "images"}
                  onValueChange={(v) => patch({ visualMode: v })}
                >
                  <SelectTrigger className="mt-1.5">
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
              </>
            )}
            {(form.visualMode !== "images" ||
              form.contentMode === "ugc" ||
              form.contentMode === "commercial") && (
              <Select value={form.videoModel} onValueChange={(v) => patch({ videoModel: v })}>
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
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm">Glitch effect</span>
              <Switch
                checked={!!form.glitchEffect}
                onCheckedChange={(v) => patch({ glitchEffect: v })}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Social accounts</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Skipped during setup? Connect here anytime. Enable a platform switch to include
                  it when posting.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!form.projectId || accountsLoading}
                onClick={() => form.projectId && refreshAccounts(form.projectId)}
                title="Refresh connected accounts"
              >
                {accountsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            {!form.projectId && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
                No social profile linked yet (common if you skipped Connect during create).
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-2 h-7"
                  disabled={linkingProject}
                  onClick={() => ensureSeriesProject()}
                >
                  {linkingProject ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Set up profile"
                  )}
                </Button>
              </div>
            )}

            {!(form.platforms || []).length && (
              <p className="text-xs text-muted-foreground">
                Auto-posting is off until at least one connected platform is enabled below.
              </p>
            )}

            <div className="space-y-2">
              {platformOpts.map((p) => {
                const connected = accounts.some(
                  (a) => String(a.platform).toUpperCase() === p.id,
                );
                const selectedPlat = (form.platforms || []).includes(p.id);
                const busy = connecting === p.id || linkingProject;
                const meta = getPlatform(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {meta && (
                        <span className={cn("shrink-0", meta.smallColor)}>
                          {meta.iconSmall}
                        </span>
                      )}
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {connected ? "Connected" : "Not connected"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!connected && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => connectPlatform(p.id)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      )}
                      <Switch
                        checked={selectedPlat}
                        disabled={!connected}
                        onCheckedChange={() => togglePlatform(p.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              After connecting, click Refresh, turn the switch on, then Save series settings.
            </p>
          </section>

          <Button
            className="gradient-bg text-primary-foreground"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save series settings
              </>
            )}
          </Button>

          {selected && (
            <p className="text-xs text-muted-foreground">
              Niche: {selected.niche}
            </p>
          )}
        </div>
      )}
    </SeriesShell>
  );
}
