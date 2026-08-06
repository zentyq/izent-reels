import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "./db";
import { getCookie } from "@tanstack/react-start/server";
import {
  ART_STYLES,
  LONG_VIDEO_DURATIONS,
  MUSIC_PRESETS,
  VIDEO_DURATIONS,
  aspectForFormat,
  durationSeconds,
} from "./series/constants";
import {
  assembleReel,
  generateElevenLabsMusic,
  generateElevenLabsSpeech,
  generateMotionVideo,
  generateSceneImages,
  generateScriptContent,
  generateVideoThumbnail,
  previewMusicSample,
  previewVoiceSample,
  type SceneClip,
} from "./series/providers";

const SESSION_COOKIE = "izent_session";

async function getUserId(): Promise<string> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  return session.userId;
}

const createSeriesSchema = z.object({
  name: z.string().min(1).max(120),
  videoFormat: z.enum(["short", "long"]).default("short"),
  contentMode: z.enum(["faceless", "ugc", "commercial"]).default("faceless"),
  niche: z.string().min(1).max(5000),
  nicheMode: z.enum(["preset", "custom"]),
  customNiche: z.string().max(5000).optional().nullable(),
  exampleScript: z.string().max(2000).optional().nullable(),
  voiceId: z.string().min(1),
  musicIds: z.array(z.string()).default([]),
  customMusicUrls: z.array(z.string()).default([]),
  artStyle: z.string().min(1),
  referenceImageUrl: z.string().max(2000).optional().nullable(),
  captionStyle: z.string().min(1),
  glitchEffect: z.boolean().default(false),
  animatedHook: z.boolean().default(false),
  visualMode: z.enum(["images", "animated_hook", "full_video"]).default("images"),
  videoModel: z.string().default("kwaivgi/kling-v3.0-std/image-to-video"),
  duration: z
    .string()
    .refine(
      (v) =>
        VIDEO_DURATIONS.some((d) => d.id === v) ||
        LONG_VIDEO_DURATIONS.some((d) => d.id === v) ||
        v === "30-40" ||
        v === "60-70",
      "Invalid duration",
    ),
  publishTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default("UTC"),
  projectId: z.string().optional().nullable(),
  platforms: z.array(z.string()).default([]),
});

function nextPublishAt(publishTime: string, from = new Date()): Date {
  const [hh, mm] = publishTime.split(":").map(Number);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() <= from.getTime() + 60_000) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export const listSeries = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const userId = await getUserId();
    const series = await prisma.series.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { videos: true } },
        videos: {
          orderBy: { scheduledAt: "desc" },
          take: 1,
          select: { status: true, scheduledAt: true, publishedAt: true },
        },
      },
    });
    return { ok: true as const, series };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, series: [] };
  }
});

export const listSeriesVideos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string().optional() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const videos = await prisma.seriesVideo.findMany({
        where: {
          series: { userId },
          ...(data.seriesId ? { seriesId: data.seriesId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          series: { select: { id: true, name: true, niche: true, videoFormat: true } },
        },
        take: 100,
      });
      return { ok: true as const, videos };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, videos: [] };
    }
  });

export const createSeries = createServerFn({ method: "POST" })
  .inputValidator(createSeriesSchema)
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const visualMode =
        data.visualMode ||
        (data.animatedHook ? "animated_hook" : "images");
      const series = await prisma.series.create({
        data: {
          userId,
          name: data.name,
          videoFormat: data.videoFormat,
          contentMode: data.contentMode,
          niche: data.nicheMode === "custom" ? data.customNiche || data.niche : data.niche,
          nicheMode: data.nicheMode,
          customNiche: data.customNiche || null,
          exampleScript: data.exampleScript || null,
          voiceId: data.voiceId,
          musicIds: data.musicIds,
          customMusicUrls: data.customMusicUrls,
          artStyle: data.artStyle,
          referenceImageUrl: data.referenceImageUrl || null,
          captionStyle: data.captionStyle,
          glitchEffect: data.glitchEffect,
          animatedHook: visualMode !== "images",
          visualMode,
          videoModel: data.videoModel,
          duration: data.duration,
          publishTime: data.publishTime,
          timezone: data.timezone || "UTC",
          projectId: data.projectId || null,
          platforms: data.platforms,
          status: "active",
        },
      });

      // Queue first video: generate 6h before next publish slot
      const scheduledAt = nextPublishAt(data.publishTime);
      const generateAt = new Date(scheduledAt.getTime() - 6 * 60 * 60 * 1000);
      const video = await prisma.seriesVideo.create({
        data: {
          seriesId: series.id,
          status: "pending",
          scheduledAt,
          generateAt: generateAt < new Date() ? new Date() : generateAt,
        },
      });

      return { ok: true as const, series, video };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const updateSeriesStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string(), status: z.enum(["active", "paused", "draft"]) }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const existing = await prisma.series.findFirst({
        where: { id: data.seriesId, userId },
      });
      if (!existing) return { ok: false as const, error: "Series not found" };
      const series = await prisma.series.update({
        where: { id: data.seriesId },
        data: { status: data.status },
      });
      return { ok: true as const, series };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const deleteSeries = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const existing = await prisma.series.findFirst({
        where: { id: data.seriesId, userId },
      });
      if (!existing) return { ok: false as const, error: "Series not found" };
      await prisma.series.delete({ where: { id: data.seriesId } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const generateSeriesVideoNow = createServerFn({ method: "POST" })
  .inputValidator(z.object({ videoId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const video = await prisma.seriesVideo.findFirst({
        where: { id: data.videoId, series: { userId } },
        include: { series: true },
      });
      if (!video) return { ok: false as const, error: "Video not found" };
      await runVideoGeneration(video.id);
      const updated = await prisma.seriesVideo.findUnique({ where: { id: video.id } });
      return { ok: true as const, video: updated };
    } catch (e) {
      console.error("generateSeriesVideoNow failed:", e);
      try {
        await prisma.seriesVideo.update({
          where: { id: data.videoId },
          data: { status: "failed", error: (e as Error).message },
        });
      } catch {}
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Generate / regenerate a YouTube-style thumbnail for an existing ready video. */
export const generateSeriesThumbnail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ videoId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const video = await prisma.seriesVideo.findFirst({
        where: { id: data.videoId, series: { userId } },
        include: { series: true },
      });
      if (!video) return { ok: false as const, error: "Video not found" };
      if (!video.mediaUrl && !video.script) {
        return { ok: false as const, error: "Generate the video first" };
      }

      const art = ART_STYLES.find((a) => a.id === video.series.artStyle);
      const format = video.series.videoFormat || "short";
      const aspect = aspectForFormat(format);

      const thumbnailUrl = await generateVideoThumbnail({
        title: video.title,
        description: video.description,
        script: video.script,
        niche: video.series.customNiche || video.series.niche,
        artStyleHint: art?.promptHint || video.series.artStyle,
        aspectRatio: aspect,
        mediaUrl: video.mediaUrl,
        referenceImageUrl: video.series.referenceImageUrl,
      });

      const updated = await prisma.seriesVideo.update({
        where: { id: video.id },
        data: { thumbnailUrl },
      });
      return { ok: true as const, video: updated, thumbnailUrl };
    } catch (e) {
      console.error("generateSeriesThumbnail failed:", e);
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const previewSeriesVoice = createServerFn({ method: "POST" })
  .inputValidator(z.object({ voiceId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const base64 = await previewVoiceSample(data.voiceId);
      return { ok: true as const, base64, contentType: "audio/mpeg" };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const previewSeriesMusic = createServerFn({ method: "POST" })
  .inputValidator(z.object({ musicId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const preset = MUSIC_PRESETS.find((m) => m.id === data.musicId);
      if (!preset) return { ok: false as const, error: "Unknown music preset" };
      const base64 = await previewMusicSample(preset.prompt);
      return { ok: true as const, base64, contentType: "audio/mpeg" };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Upload a product/brand reference image for UGC or commercial series. */
export const uploadSeriesReferenceImage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      base64: z.string().min(32),
      contentType: z.string().default("image/png"),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const raw = data.base64.replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      if (!buf.length) return { ok: false as const, error: "Empty image" };
      if (buf.length > 10 * 1024 * 1024) {
        return { ok: false as const, error: "Image must be under 10MB" };
      }
      const ct = (data.contentType || "").toLowerCase();
      const ext = ct.includes("jpeg") || ct.includes("jpg")
        ? "jpg"
        : ct.includes("webp")
          ? "webp"
          : "png";
      const { saveUploadBuffer } = await import("./series/providers");
      const saved = await saveUploadBuffer(buf, ext, "series-refs");
      return { ok: true as const, url: saved.publicUrl };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Process due generations + posts. Call from cron or UI "Process queue". */
export const processSeriesQueue = createServerFn({ method: "POST" }).handler(async () => {
  try {
    // Optional: allow unauthenticated cron via secret
    const cronSecret = process.env.SERIES_CRON_SECRET;
    const headerSecret = getCookie("izent_session");
    if (!headerSecret && cronSecret) {
      // authenticated users OR cron with no session — for cron use generateNow after auth
    }
    await getUserId().catch(() => null);

    const now = new Date();
    const dueGenerate = await prisma.seriesVideo.findMany({
      where: {
        status: "pending",
        generateAt: { lte: now },
        series: { status: "active" },
      },
      take: 3,
      orderBy: { generateAt: "asc" },
    });

    const generated: string[] = [];
    for (const v of dueGenerate) {
      try {
        await runVideoGeneration(v.id);
        generated.push(v.id);
      } catch (e) {
        await prisma.seriesVideo.update({
          where: { id: v.id },
          data: { status: "failed", error: (e as Error).message },
        });
      }
    }

    const duePost = await prisma.seriesVideo.findMany({
      where: {
        status: "ready",
        scheduledAt: { lte: now },
        series: { status: "active" },
      },
      take: 5,
      include: { series: true },
      orderBy: { scheduledAt: "asc" },
    });

    const posted: string[] = [];
    for (const v of duePost) {
      try {
        await publishSeriesVideo(v.id);
        posted.push(v.id);
        await enqueueNextVideo(v.seriesId);
      } catch (e) {
        await prisma.seriesVideo.update({
          where: { id: v.id },
          data: { status: "failed", error: (e as Error).message },
        });
      }
    }

    return {
      ok: true as const,
      generated: generated.length,
      posted: posted.length,
      ids: { generated, posted },
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

async function runVideoGeneration(videoId: string) {
  const video = await prisma.seriesVideo.findUnique({
    where: { id: videoId },
    include: { series: true },
  });
  if (!video) throw new Error("Video not found");

  await prisma.seriesVideo.update({
    where: { id: videoId },
    data: { status: "generating", error: null },
  });

  try {
    const series = video.series;
    const dur = durationSeconds(series.duration);
    const art = ART_STYLES.find((a) => a.id === series.artStyle);
    const nicheLabel = series.customNiche || series.niche;
    const videoFormat = series.videoFormat || "short";
    const aspect = aspectForFormat(videoFormat);

    // YouTube Data API research BEFORE any AI generation
    let youtubeBrief: string | null = null;
    try {
      const { researchYouTubeNiche } = await import("./series/youtube-research");
      const research = await researchYouTubeNiche(nicheLabel);
      youtubeBrief = research.brief;
      console.log(
        `YouTube research: ${research.topByViews.length} videos, keywords=[${research.keywords.slice(0, 8).join(", ")}]`,
      );
    } catch (ytErr) {
      console.warn("YouTube research skipped:", (ytErr as Error).message);
    }

    const content = await generateScriptContent({
      niche: nicheLabel,
      exampleScript: series.exampleScript,
      durationSec: dur,
      artStyle: art?.promptHint || series.artStyle,
      youtubeBrief,
      contentMode: series.contentMode || "faceless",
      videoFormat,
    });

    // Prefer user product/brand reference for UGC & commercial; else art-style sample
    const imageRef =
      series.referenceImageUrl ||
      ((series.contentMode === "ugc" || series.contentMode === "commercial")
        ? null
        : art?.image);

    const scenes = await generateSceneImages(
      content.scenePrompts,
      art?.promptHint || series.artStyle,
      imageRef || undefined,
      aspect,
    );
    const sceneUrls = scenes.map((s) => s.localUrl);
    const imageUrl = sceneUrls[0];
    const voiceUrl = await generateElevenLabsSpeech(content.script, series.voiceId);

    let musicUrl: string | null = null;
    try {
      if (series.musicIds.length > 0) {
        const musicId = series.musicIds[Math.floor(Math.random() * series.musicIds.length)];
        const preset = MUSIC_PRESETS.find((m) => m.id === musicId);
        if (preset) {
          musicUrl = await generateElevenLabsMusic(
            preset.prompt,
            Math.min(Math.max(dur, 8), 60) * 1000,
          );
        }
      } else if (series.customMusicUrls[0]) {
        musicUrl = series.customMusicUrls[0];
      }
    } catch (musicErr) {
      console.warn("Music generation skipped:", (musicErr as Error).message);
      musicUrl = null;
    }

    const visualMode =
      series.visualMode || (series.animatedHook ? "animated_hook" : "images");
    const model = series.videoModel || "kwaivgi/kling-v3.0-std/image-to-video";
    const perSceneSec = Math.max(4, Math.min(8, Math.ceil(dur / Math.max(1, scenes.length))));

    const sceneClips: SceneClip[] = scenes.map((s) => ({
      kind: "image" as const,
      url: s.localUrl,
    }));

    if (visualMode === "full_video") {
      for (let i = 0; i < scenes.length; i++) {
        try {
          const motionUrl = await generateMotionVideo({
            imageUrl: scenes[i].localUrl,
            remoteImageUrl: scenes[i].remoteUrl,
            prompt: `${content.scenePrompts[i] || content.imagePrompt}. Cinematic motion, ${art?.promptHint || ""}`,
            model,
            durationSec: perSceneSec,
            aspectRatio: aspect,
          });
          sceneClips[i] = { kind: "video", url: motionUrl };
          console.log(`Scene ${i + 1}/${scenes.length}: AI video ready`);
        } catch (motionErr) {
          console.warn(
            `Scene ${i + 1} video failed, keeping image:`,
            (motionErr as Error).message,
          );
        }
      }
    } else if (visualMode === "animated_hook") {
      try {
        const motionUrl = await generateMotionVideo({
          imageUrl: scenes[0].localUrl,
          remoteImageUrl: scenes[0].remoteUrl,
          prompt: `${content.imagePrompt}. Subtle cinematic camera motion, ${art?.promptHint || ""}`,
          model,
          durationSec: perSceneSec,
          aspectRatio: aspect,
        });
        sceneClips[0] = { kind: "video", url: motionUrl };
      } catch (motionErr) {
        console.warn("Animated hook failed, all-image slideshow:", (motionErr as Error).message);
      }
    }

    // Assemble first so we can fall back to a video frame for the thumbnail
    console.log(
      `Assembling ${sceneClips.length} scenes (${aspect}) — ${sceneClips.filter((c) => c.kind === "video").length} video / ${sceneClips.filter((c) => c.kind === "image").length} image for ${dur}s`,
    );

    const finalUrl = await assembleReel({
      sceneClips,
      voiceUrl,
      musicUrl,
      script: content.script,
      captionStyle: series.captionStyle,
      glitch: series.glitchEffect,
      targetDurationSec: dur,
      aspectRatio: aspect,
    });

    // Dedicated thumbnail matched to this episode (required for long YouTube videos)
    let thumbnailUrl = imageUrl;
    try {
      thumbnailUrl = await generateVideoThumbnail({
        title: content.title,
        description: content.description,
        script: content.script,
        niche: nicheLabel,
        artStyleHint: art?.promptHint || series.artStyle,
        aspectRatio: aspect,
        mediaUrl: finalUrl,
        thumbnailPrompt: content.thumbnailPrompt,
        referenceImageUrl: series.referenceImageUrl,
      });
      console.log("Thumbnail ready:", thumbnailUrl);
    } catch (thumbErr) {
      console.warn("Thumbnail generation failed, using first scene:", (thumbErr as Error).message);
      thumbnailUrl = imageUrl;
    }

    await prisma.seriesVideo.update({
      where: { id: videoId },
      data: {
        status: "ready",
        title: content.title,
        description: content.description,
        script: content.script,
        caption: content.caption,
        thumbnailUrl,
        audioUrl: voiceUrl,
        musicUrl,
        mediaUrl: finalUrl,
        error: null,
      },
    });
  } catch (e) {
    await prisma.seriesVideo.update({
      where: { id: videoId },
      data: { status: "failed", error: (e as Error).message },
    });
    throw e;
  }
}

async function publishSeriesVideo(videoId: string) {
  const video = await prisma.seriesVideo.findUnique({
    where: { id: videoId },
    include: { series: true },
  });
  if (!video?.mediaUrl) throw new Error("Video has no media");
  if (!video.series.projectId) throw new Error("Series has no connected Ayrshare project");
  if (!video.series.platforms.length) throw new Error("Series has no platforms selected");

  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) throw new Error("AYRSHARE_API_KEY is not configured");

  // Read local file and upload to Ayrshare
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  let mediaUrl = video.mediaUrl;
  if (mediaUrl.startsWith("/api/uploads/")) {
    const rel = mediaUrl.replace("/api/uploads/", "");
    const buf = await readFile(join(process.cwd(), "uploads", rel));
    const fileDataUri = `data:video/mp4;base64,${buf.toString("base64")}`;
    const up = await fetch("https://api.ayrshare.com/api/media/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Profile-Key": video.series.projectId,
      },
      body: JSON.stringify({
        file: fileDataUri,
        fileName: `${video.id}.mp4`,
        description: video.title || "Series video",
      }),
    });
    const upBody = await up.json();
    if (!up.ok) throw new Error(upBody?.message || "Ayrshare media upload failed");
    mediaUrl = upBody.url;
  }

  const platforms = video.series.platforms.map((p) => p.toLowerCase());
  const isLong = (video.series.videoFormat || "short") === "long";
  const postText =
    video.description ||
    video.caption ||
    video.title ||
    "New video";

  // Upload thumbnail for YouTube when available
  let thumbUrl: string | undefined;
  if (
    platforms.includes("youtube") &&
    video.thumbnailUrl &&
    video.thumbnailUrl.startsWith("/api/uploads/")
  ) {
    try {
      const rel = video.thumbnailUrl.replace("/api/uploads/", "");
      const thumbBuf = await readFile(join(process.cwd(), "uploads", rel));
      const mime = rel.endsWith(".jpg") || rel.endsWith(".jpeg") ? "image/jpeg" : "image/png";
      const upThumb = await fetch("https://api.ayrshare.com/api/media/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Profile-Key": video.series.projectId,
        },
        body: JSON.stringify({
          file: `data:${mime};base64,${thumbBuf.toString("base64")}`,
          fileName: `${video.id}-thumb.${mime.includes("jpeg") ? "jpg" : "png"}`,
          description: video.title || "Thumbnail",
        }),
      });
      const upThumbBody = await upThumb.json();
      if (upThumb.ok && upThumbBody.url) thumbUrl = upThumbBody.url;
    } catch (e) {
      console.warn("Thumbnail upload skipped:", (e as Error).message);
    }
  }

  const bodyObj: any = {
    post: postText,
    platforms,
    mediaUrls: [mediaUrl],
  };
  if (platforms.includes("youtube")) {
    bodyObj.youTubeOptions = {
      title: (video.title || "Series video").slice(0, 95),
      description: (video.description || video.caption || video.title || "").slice(0, 4900),
      visibility: "public",
      ...(isLong ? { shorts: false } : {}),
      ...(thumbUrl ? { thumbNail: thumbUrl } : {}),
    };
  }
  if (platforms.includes("facebook")) {
    // Facebook uses the main post text; no separate thumbnail required
    bodyObj.faceBookOptions = {
      // keep defaults; caption is `post`
    };
  }

  const res = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Profile-Key": video.series.projectId,
    },
    body: JSON.stringify(bodyObj),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status >= 500) throw new Error("Ayrshare server error");

  await prisma.seriesVideo.update({
    where: { id: videoId },
    data: {
      status: "published",
      publishedAt: new Date(),
      ayrsharePostId: body?.id || body?.postIds?.[0] || null,
      mediaUrl,
    },
  });
}

async function enqueueNextVideo(seriesId: string) {
  const series = await prisma.series.findUnique({ where: { id: seriesId } });
  if (!series || series.status !== "active") return;

  const last = await prisma.seriesVideo.findFirst({
    where: { seriesId },
    orderBy: { scheduledAt: "desc" },
  });
  const from = last?.scheduledAt || new Date();
  const scheduledAt = nextPublishAt(series.publishTime, new Date(from.getTime() + 60_000));
  const generateAt = new Date(scheduledAt.getTime() - 6 * 60 * 60 * 1000);

  await prisma.seriesVideo.create({
    data: {
      seriesId,
      status: "pending",
      scheduledAt,
      generateAt: generateAt < new Date() ? new Date() : generateAt,
    },
  });
}
