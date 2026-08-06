import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Send,
  Upload,
  Link2,
  RefreshCw,
  X,
  Sparkles,
  Wand2,
  Globe,
  CheckCircle2,
  Download,
  ExternalLink,
  FileVideo,
  ImageIcon,
  Scissors,
  LayoutDashboard,
  Palette,
  TypeIcon,
  ImagePlus,
  Stamp,
  Trash2,
  Move,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  listProjects,
  createProject,
  listAccounts,
  generateOAuthUrl,
  uploadMedia,
  createPost,
} from "@/lib/ayrshare.functions";
import { suggestPostContent } from "@/lib/ai.functions";
import { downloadMediaFromUrl } from "@/lib/download.functions";
import { editVideo } from "@/lib/video.functions";
import { PLATFORMS } from "@/lib/platforms";

export const Route = createFileRoute("/composer")({
  head: () => ({
    meta: [
      { title: "Composer — Post to all your socials at once" },
      {
        name: "description",
        content:
          "Compose once, let AI write the perfect caption, and publish to X, LinkedIn, TikTok, Instagram, Facebook and YouTube in one click.",
      },
      { property: "og:title", content: "Composer — Post to all your socials at once" },
      {
        property: "og:description",
        content:
          "Compose once, let AI write the perfect caption, and publish everywhere in one click.",
      },
    ],
  }),
  component: Composer,
});
type SocialAccount = {
  id?: string;
  socialAccountId?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
};

type Project = { id?: string; projectId?: string; name?: string };

function pickId(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function normalizeArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const k of [
      "data",
      "items",
      "results",
      "projects",
      "accounts",
      "socialAccounts",
    ]) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
  }
  return [];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function Composer() {
  const fnListProjects = useServerFn(listProjects);
  const fnCreateProject = useServerFn(createProject);
  const fnListAccounts = useServerFn(listAccounts);
  const fnOAuthUrl = useServerFn(generateOAuthUrl);
  const fnUpload = useServerFn(uploadMedia);
  const fnCreatePost = useServerFn(createPost);
  const fnSuggest = useServerFn(suggestPostContent);
  const fnDownloadUrl = useServerFn(downloadMediaFromUrl);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [generating, setGenerating] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [editorTab, setEditorTab] = useState<"cut" | "layout" | "effects" | "overlays">("cut");
  const [trimStart, setTrimStart] = useState("");
  const [trimDuration, setTrimDuration] = useState("");
  const [speed, setSpeed] = useState("");
  const [mute, setMute] = useState(false);
  const [resizeW, setResizeW] = useState("");
  const [resizeH, setResizeH] = useState("");
  const [cropW, setCropW] = useState("");
  const [cropH, setCropH] = useState("");
  const [cropX, setCropX] = useState("");
  const [cropY, setCropY] = useState("");
  const [brightness, setBrightness] = useState("");
  const [contrast, setContrast] = useState("");
  const [saturation, setSaturation] = useState("");
  const [textOverlay, setTextOverlay] = useState("");
  const [textColor, setTextColor] = useState("white");
  const [extractThumbnail, setExtractThumbnail] = useState(false);

  // ── Logo/Watermark state ───────────────────────────────────────
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<string>("bottom-right");
  const logoFileRef = useRef<HTMLInputElement>(null);

  const [editingVideo, setEditingVideo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Logo preview URL lifecycle ─────────────────────────────────
  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  // ── Media from URL state ───────────────────────────────────────
  const [mediaSource, setMediaSource] = useState<"file" | "url">("file");
  const [mediaUrl, setMediaUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [urlFilename, setUrlFilename] = useState<string | null>(null);

  async function refreshProjects() {
    setLoadingProjects(true);
    try {
      const r = await fnListProjects();
      if (r.error) {
        setSetupError(r.error);
        setProjects([]);
        return;
      }
      setSetupError(null);
      const list = normalizeArray<Project>(r.data);
      setProjects(list);
      if (list.length && !projectId) {
        const pid = pickId(list[0] as Record<string, unknown>, [
          "id",
          "projectId",
          "_id",
        ]);
        if (pid) setProjectId(pid);
      }
    } catch (e) {
      setSetupError((e as Error).message);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function refreshAccounts(pid: string) {
    if (!pid) return;
    setLoadingAccounts(true);
    try {
      const r = await fnListAccounts({ data: { projectId: pid } });
      if (r.error) {
        toast.error(r.error);
        setAccounts([]);
        return;
      }
      setAccounts(normalizeArray<SocialAccount>(r.data));
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectId) refreshAccounts(projectId);
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fnEditVideo = useServerFn(editVideo);

  const onEditVideo = async () => {
    if (!file) return;
    try {
      setEditingVideo(true);
      
      const base64 = await fileToBase64(file);

      const sTime = trimStart ? parseFloat(trimStart) : undefined;
      const dTime = trimDuration ? parseFloat(trimDuration) : undefined;

      // Convert logo to base64 if present
      let watermarkBase64: string | undefined;
      if (logoFile) {
        watermarkBase64 = await fileToBase64(logoFile);
      }

      const r = await fnEditVideo({
        data: {
          videoBase64: base64,
          mimeType: file.type,
          startTime: sTime,
          duration: dTime,
          speed: speed ? parseFloat(speed) : undefined,
          mute: mute || undefined,
          extractThumbnail: extractThumbnail || undefined,
          crop: cropW && cropH && cropX && cropY ? { width: parseFloat(cropW), height: parseFloat(cropH), x: parseFloat(cropX), y: parseFloat(cropY) } : undefined,
          resize: resizeW && resizeH ? { width: parseFloat(resizeW), height: parseFloat(resizeH) } : undefined,
          filters: brightness || contrast || saturation ? {
            brightness: brightness ? parseFloat(brightness) : undefined,
            contrast: contrast ? parseFloat(contrast) : undefined,
            saturation: saturation ? parseFloat(saturation) : undefined,
          } : undefined,
          textOverlay: textOverlay ? { text: textOverlay, color: textColor } : undefined,
          watermarkBase64,
          watermarkPosition: watermarkBase64 ? logoPosition as any : undefined,
        }
      });

      if (!r.ok || !r.dataBase64) {
        throw new Error(r.error || "Failed to edit video");
      }

      const byteCharacters = atob(r.dataBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: r.mimeType || "video/mp4" });
      const ext = r.mimeType === "image/png" ? ".png" : "_edited.mp4";
      const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ext, { type: blob.type });
      
      setFile(newFile);
      toast.success(extractThumbnail ? "Thumbnail extracted!" : "Video edited successfully!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditingVideo(false);
    }
  };

  // ── Download media from URL ────────────────────────────────────
  const onDownloadFromUrl = useCallback(async () => {
    const trimmed = mediaUrl.trim();
    if (!trimmed) return toast.error("Paste a URL first");
    try {
      new globalThis.URL(trimmed);
    } catch {
      return toast.error("That doesn't look like a valid URL");
    }

    setDownloading(true);
    try {
      const r = await fnDownloadUrl({ data: { url: trimmed } });
      if (!r.ok) return toast.error(r.error);

      // Convert base64 back to a File so the existing pipeline works unchanged
      const binary = atob(r.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: r.contentType });
      const downloaded = new File([blob], r.filename, { type: r.contentType });

      setFile(downloaded);
      setUrlFilename(r.filename);
      toast.success(
        `Downloaded ${r.isVideo ? "video" : "image"} · ${(r.sizeBytes / 1024 / 1024).toFixed(1)}MB`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl]);

  const accountKey = (a: SocialAccount, i: number) =>
    a.id || a.socialAccountId || `${a.platform || "p"}-${i}`;

  async function onCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await fnCreateProject({ data: { name: newProjectName.trim() } });
      toast.success("Project created");
      setNewProjectName("");
      setCreateOpen(false);
      await refreshProjects();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingProject(false);
    }
  }

  async function onConnect(platform: string) {
    if (!projectId) return toast.error("Select a project first");
    try {
      const r = (await fnOAuthUrl({
        data: {
          projectId,
          platform: platform as never,
          redirectUrl: window.location.origin,
        },
      })) as { url?: string; authorizationUrl?: string };
      const url = r.url || r.authorizationUrl;
      if (!url) throw new Error("No authorization URL returned");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Opened authorization window", {
        description: "Complete it, then hit refresh.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggleAccount(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(accounts.map((a, i) => accountKey(a, i))));
  }
  function clearAll() {
    setSelected(new Set());
  }

  async function onGenerate() {
    const seed = idea.trim() || title.trim() || description.trim();
    if (!seed) return toast.error("Tell the AI what your post is about");
    setGenerating(true);
    try {
      const r = await fnSuggest({ data: { idea: seed } });
      if (!r.ok) return toast.error(r.error);
      setTitle(r.title || "");
      setDescription(r.description || "");
      setTags(r.tags || []);
      toast.success("AI suggestions ready");
    } finally {
      setGenerating(false);
    }
  }

  function buildPostText() {
    const parts: string[] = [];
    if (title) parts.push(title);
    if (description) parts.push(description);
    if (tags.length) parts.push(tags.map((t) => `#${t.replace(/^#/, "")}`).join(" "));
    return parts.join("\n\n").trim();
  }

  async function onBroadcast() {
    const text = buildPostText();
    if (!text && !file) return toast.error("Add some content or media");
    if (!selected.size) return toast.error("Select at least one account");
    setPosting(true);
    try {
      let mediaId: string | undefined;
      if (file) {
        toast.message("Uploading media…");
        const base64 = await fileToBase64(file);
        const up = await fnUpload({
          data: {
            projectId,
            contentType: file.type || "application/octet-stream",
            base64,
          },
        });
        mediaId = up.mediaId;
      }
      const chosen = accounts
        .filter((a, i) => selected.has(accountKey(a, i)))
        .map((a) => {
          const id =
            a.socialAccountId ||
            a.id ||
            (a as Record<string, unknown>).accountId ||
            undefined;
          return { platform: a.platform, socialAccountId: id, id };
        });
      const mediaKind: "image" | "video" | "none" = file
        ? file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("image/")
            ? "image"
            : "none"
        : "none";
      await fnCreatePost({
        data: {
          projectId,
          contentText: text || " ",
          mediaId: mediaId ?? null,
          mediaKind,
          socialAccounts: chosen,
        },
      });
      toast.success(
        `Broadcast to ${chosen.length} account${chosen.length === 1 ? "" : "s"}`,
      );
      setIdea("");
      setTitle("");
      setDescription("");
      setTags([]);
      setFile(null);
      setMediaUrl("");
      setUrlFilename(null);
      setMediaSource("file");
      setLogoFile(null);
      setLogoPosition("bottom-right");
      if (logoFileRef.current) logoFileRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  const projectOptions = useMemo(
    () =>
      projects.map((p, i) => {
        const id =
          pickId(p as Record<string, unknown>, ["id", "projectId", "_id"]) || String(i);
        return { id, name: p.name || `Project ${i + 1}` };
      }),
    [projects],
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/40 backdrop-blur-xl bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 sm:gap-4 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-xl gradient-bg text-primary-foreground shadow-[var(--shadow-glow)]">
              <Globe className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">Broadcast</div>
              <div className="text-[11px] text-muted-foreground">
                One post · every platform
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-[120px] sm:w-[200px] border-border/60 bg-card/60 backdrop-blur">
                <SelectValue
                  placeholder={loadingProjects ? "Loading…" : "Select project"}
                />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8 text-center">
          <Badge variant="secondary" className="mb-3 gap-1.5 border-border/50">
            <Sparkles className="h-3 w-3 text-primary" />
            AI-powered composer
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Post once. <span className="gradient-text">Reach everywhere.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Drop an idea, let Gemini draft your caption, and broadcast to every
            connected account in a single click.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-5">
            <Card className="glass-card overflow-hidden p-0">
              <div className="border-b border-border/50 bg-gradient-to-br from-primary/10 via-accent/30 to-transparent px-5 py-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">AI assistant</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Describe your post in one line. The AI writes title, description and tags.
                </p>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex gap-2">
                  <Input
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !generating) onGenerate();
                    }}
                    placeholder="e.g. Launching my new productivity app for designers…"
                    className="bg-background/70"
                  />
                  <Button
                    onClick={onGenerate}
                    disabled={generating}
                    className="gradient-bg text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90"
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Generate</span>
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="glass-card p-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="A punchy headline"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    placeholder="Tell your story…"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 py-1.5">
                    {tags.length === 0 && !newTag && (
                      <span className="px-1 text-xs text-muted-foreground absolute pointer-events-none">
                        AI-suggested or manual tags will appear here
                      </span>
                    )}
                    {tags.map((t, i) => (
                      <Badge
                        key={`${t}-${i}`}
                        variant="secondary"
                        className="gap-1 border-primary/20 bg-primary/10 text-primary"
                      >
                        #{t.replace(/^#/, "")}
                        <button
                          onClick={() => setTags(tags.filter((_, j) => j !== i))}
                          className="rounded hover:bg-foreground/10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          const val = newTag.trim().replace(/^#/, "");
                          if (val && !tags.includes(val)) {
                            setTags([...tags, val]);
                          }
                          setNewTag("");
                        } else if (e.key === "Backspace" && !newTag && tags.length > 0) {
                          setTags(tags.slice(0, -1));
                        }
                      }}
                      onBlur={() => {
                        const val = newTag.trim().replace(/^#/, "");
                        if (val && !tags.includes(val)) {
                          setTags([...tags, val]);
                        }
                        setNewTag("");
                      }}
                      className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground/0 focus:placeholder:text-muted-foreground/50 h-6 px-1"
                    />
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4 space-y-3">
                  {/* ── Media source toggle ─────────────────────── */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
                      <button
                        onClick={() => setMediaSource("file")}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          mediaSource === "file"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Add Media
                      </button>
                      <button
                        onClick={() => setMediaSource("url")}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                          mediaSource === "url"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Media from URL
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground w-full sm:w-auto text-right sm:text-left">
                      {selected.size} account{selected.size === 1 ? "" : "s"} selected
                    </div>
                  </div>

                  {/* ── File upload (existing) ──────────────────── */}
                  {mediaSource === "file" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          setFile(e.target.files?.[0] ?? null);
                          setUrlFilename(null);
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {file && !urlFilename ? "Change media" : "Choose file"}
                      </Button>
                      {file && !urlFilename && (
                        <Badge variant="secondary" className="gap-1">
                          {file.name}
                          <button
                            onClick={() => {
                              setFile(null);
                              if (fileRef.current) fileRef.current.value = "";
                            }}
                            className="ml-1 rounded hover:bg-foreground/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* ── URL download (new) ──────────────────────── */}
                  {mediaSource === "url" && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !downloading) onDownloadFromUrl();
                          }}
                          placeholder="Paste image or video URL…"
                          className="bg-background/70"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onDownloadFromUrl}
                          disabled={downloading || !mediaUrl.trim()}
                          className="shrink-0"
                        >
                          {downloading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {downloading ? "Downloading…" : "Download"}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Supports YouTube, TikTok, X, Facebook, Vimeo and direct media links
                        (.jpg, .png, .mp4, .webm). Max 50 MB.
                        <br />
                        <strong>Instagram tip:</strong> Right-click the video/image in your browser →
                        &quot;Copy video address&quot; and paste the direct link here.
                      </p>
                      {urlFilename && file && (
                        <Badge variant="secondary" className="gap-1.5">
                          {file.type.startsWith("video/") ? (
                            <FileVideo className="h-3 w-3" />
                          ) : (
                            <ImageIcon className="h-3 w-3" />
                          )}
                          {urlFilename}
                          <button
                            onClick={() => {
                              setFile(null);
                              setUrlFilename(null);
                              setMediaUrl("");
                            }}
                            className="ml-1 rounded hover:bg-foreground/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="space-y-4">
                    <div className="flex justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/20">
                      {file?.type.startsWith("video/") ? (
                        <video
                          src={previewUrl}
                          controls
                          className="max-h-[400px] object-contain"
                        />
                      ) : (
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="max-h-[400px] object-contain"
                        />
                      )}
                    </div>
                    {file?.type.startsWith("video/") && (
                      <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Wand2 className="h-4 w-4 text-primary" />
                          <h3 className="text-sm font-semibold">Video Editor</h3>
                        </div>
                        <div className="flex gap-2 border-b border-border/50 pb-2 mb-4 overflow-x-auto">
                          <button onClick={() => setEditorTab("cut")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorTab === "cut" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                            <Scissors className="h-3 w-3" /> Cut & Speed
                          </button>
                          <button onClick={() => setEditorTab("layout")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorTab === "layout" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                            <LayoutDashboard className="h-3 w-3" /> Layout
                          </button>
                          <button onClick={() => setEditorTab("effects")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorTab === "effects" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                            <Palette className="h-3 w-3" /> Effects
                          </button>
                          <button onClick={() => setEditorTab("overlays")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editorTab === "overlays" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                            <TypeIcon className="h-3 w-3" /> Overlays
                          </button>
                        </div>

                        {editorTab === "cut" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Trim Start (seconds)</Label>
                              <Input type="number" min="0" placeholder="e.g. 5" value={trimStart} onChange={(e) => setTrimStart(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Duration (seconds)</Label>
                              <Input type="number" min="1" placeholder="e.g. 10" value={trimDuration} onChange={(e) => setTrimDuration(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Speed (e.g. 1.5)</Label>
                              <Input type="number" step="0.1" min="0.1" max="4" placeholder="1.0" value={speed} onChange={(e) => setSpeed(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                            <div className="space-y-1.5 flex items-end">
                              <label className="flex items-center gap-2 text-xs font-medium h-8">
                                <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} className="rounded border-border/50 text-primary focus:ring-primary" />
                                Mute Audio
                              </label>
                            </div>
                          </div>
                        )}

                        {editorTab === "layout" && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Crop Width x Height</Label>
                              <div className="flex gap-2">
                                <Input type="number" placeholder="W" value={cropW} onChange={(e) => setCropW(e.target.value)} className="h-8 bg-background/50" />
                                <Input type="number" placeholder="H" value={cropH} onChange={(e) => setCropH(e.target.value)} className="h-8 bg-background/50" />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Crop X x Y (Top Left)</Label>
                              <div className="flex gap-2">
                                <Input type="number" placeholder="X" value={cropX} onChange={(e) => setCropX(e.target.value)} className="h-8 bg-background/50" />
                                <Input type="number" placeholder="Y" value={cropY} onChange={(e) => setCropY(e.target.value)} className="h-8 bg-background/50" />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Force Resize (W x H)</Label>
                              <div className="flex gap-2">
                                <Input type="number" placeholder="1080" value={resizeW} onChange={(e) => setResizeW(e.target.value)} className="h-8 bg-background/50" />
                                <Input type="number" placeholder="1920" value={resizeH} onChange={(e) => setResizeH(e.target.value)} className="h-8 bg-background/50" />
                              </div>
                            </div>
                          </div>
                        )}

                        {editorTab === "effects" && (
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Brightness</Label>
                              <Input type="number" step="0.1" placeholder="0.0" value={brightness} onChange={(e) => setBrightness(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Contrast</Label>
                              <Input type="number" step="0.1" placeholder="1.0" value={contrast} onChange={(e) => setContrast(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Saturation</Label>
                              <Input type="number" step="0.1" placeholder="1.0" value={saturation} onChange={(e) => setSaturation(e.target.value)} className="h-8 bg-background/50" />
                            </div>
                          </div>
                        )}

                        {editorTab === "overlays" && (
                          <div className="space-y-5">
                            {/* ── Text Overlay ────────────────────────── */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <Label className="text-xs font-semibold">Text Overlay</Label>
                              </div>
                              <Input type="text" placeholder="e.g. Watch till the end..." value={textOverlay} onChange={(e) => setTextOverlay(e.target.value)} className="h-8 bg-background/50" />
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Text Color</Label>
                                  <Select value={textColor} onValueChange={setTextColor}>
                                    <SelectTrigger className="h-8 bg-background/50 text-xs">
                                      <SelectValue placeholder="Select color" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="white">White</SelectItem>
                                      <SelectItem value="black">Black</SelectItem>
                                      <SelectItem value="red">Red</SelectItem>
                                      <SelectItem value="yellow">Yellow</SelectItem>
                                      <SelectItem value="green">Green</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            {/* ── Divider ─────────────────────────────── */}
                            <div className="border-t border-border/40" />

                            {/* ── Logo / Watermark Upload ──────────────── */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Stamp className="h-3.5 w-3.5 text-muted-foreground" />
                                <Label className="text-xs font-semibold">Logo / Watermark</Label>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Upload your logo (PNG with transparency recommended) to overlay it on the video.
                              </p>

                              <input
                                ref={logoFileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] ?? null;
                                  setLogoFile(f);
                                }}
                              />

                              {!logoFile ? (
                                <button
                                  type="button"
                                  onClick={() => logoFileRef.current?.click()}
                                  className="group relative flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-muted/20 px-4 py-5 transition-all hover:border-primary/50 hover:bg-primary/5"
                                >
                                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                                    <Stamp className="h-5 w-5" />
                                  </div>
                                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                                    Click to upload logo
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/60">
                                    PNG, JPG, WebP · Transparent PNG works best
                                  </span>
                                </button>
                              ) : (
                                <div className="space-y-3">
                                  {/* Logo preview */}
                                  <div className="relative flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                                    {logoPreviewUrl && (
                                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/30 bg-[repeating-conic-gradient(#80808015_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
                                        <img
                                          src={logoPreviewUrl}
                                          alt="Logo preview"
                                          className="max-h-14 max-w-14 object-contain"
                                        />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium">{logoFile.name}</p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {(logoFile.size / 1024).toFixed(1)} KB
                                      </p>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        onClick={() => logoFileRef.current?.click()}
                                        title="Replace logo"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => {
                                          setLogoFile(null);
                                          if (logoFileRef.current) logoFileRef.current.value = "";
                                        }}
                                        title="Remove logo"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Position selector */}
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                      <Move className="h-3 w-3 text-muted-foreground" />
                                      <Label className="text-xs">Position</Label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {[
                                        { id: "top-left", label: "↖ Top Left" },
                                        { id: "top-center", label: "↑ Top Center" },
                                        { id: "top-right", label: "↗ Top Right" },
                                        { id: "center-left", label: "← Center Left" },
                                        { id: "center", label: "⊕ Center" },
                                        { id: "center-right", label: "→ Center Right" },
                                        { id: "bottom-left", label: "↙ Bottom Left" },
                                        { id: "bottom-center", label: "↓ Bottom Center" },
                                        { id: "bottom-right", label: "↘ Bottom Right" },
                                      ].map((pos) => (
                                        <button
                                          key={pos.id}
                                          type="button"
                                          onClick={() => setLogoPosition(pos.id)}
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                                            logoPosition === pos.id
                                              ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                                              : "border-border/50 bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                                          }`}
                                        >
                                          {pos.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            disabled={editingVideo}
                            onClick={() => { setExtractThumbnail(false); onEditVideo(); }}
                          >
                            {editingVideo && !extractThumbnail ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
                            {editingVideo && !extractThumbnail ? "Applying edits..." : "Apply Edits"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={editingVideo}
                            onClick={() => { setExtractThumbnail(true); onEditVideo(); }}
                          >
                            {editingVideo && extractThumbnail ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-2 h-3.5 w-3.5" />}
                            Get Thumbnail
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full gradient-bg text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90"
                  size="lg"
                  onClick={onBroadcast}
                  disabled={posting || !projectId || !selected.size}
                >
                  {posting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Broadcast now
                </Button>
              </div>
            </Card>

            {setupError && (
              <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm">
                <div className="font-medium text-destructive">WoopSocial error</div>
                <div className="text-muted-foreground">{setupError}</div>
              </Card>
            )}

            <Card className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Connect a new account</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onConnect(p.id)}
                    disabled={!projectId}
                    className={`group relative overflow-hidden rounded-lg border border-border/60 bg-card/40 p-3 text-left text-sm font-medium transition-all hover:border-primary/40 hover:shadow-[var(--shadow-soft)] disabled:opacity-40 ${p.bgHover}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`[&>svg]:h-4 [&>svg]:w-4 ${p.smallColor || 'text-foreground'}`}>
                        {p.iconSmall}
                      </div>
                      <span className="truncate">{p.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </section>

          <aside className="space-y-4">
            <Card className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Your accounts</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => projectId && refreshAccounts(projectId)}
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingAccounts ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {accounts.length > 0 && (
                <div className="mb-3 flex gap-2 text-xs">
                  <button
                    onClick={selectAll}
                    className="font-medium text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={clearAll}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {!loadingAccounts && accounts.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No connected accounts yet.
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      Use the buttons on the left to connect.
                    </p>
                  </div>
                )}
                {accounts.map((a, i) => {
                  const key = accountKey(a, i);
                  const checked = selected.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition-all ${
                        checked
                          ? "border-primary/60 bg-primary/10 shadow-[var(--shadow-soft)]"
                          : "border-border/50 hover:border-primary/30 hover:bg-accent/40"
                      }`}
                    >
                      <div
                        className={`grid h-5 w-5 place-items-center rounded-md border transition-colors ${
                          checked
                            ? "gradient-bg border-transparent text-primary-foreground"
                            : "border-input bg-background"
                        }`}
                      >
                        {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAccount(key)}
                        className="sr-only"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {a.displayName || a.name || a.username || "Account"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.platform}
                          {a.username ? ` · @${a.username}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
