import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "./db";
import { getCookie } from "@tanstack/react-start/server";
import {
  ART_STYLES,
  LONG_VIDEO_DURATIONS,
  MUSIC_PRESETS,
  NICHE_PRESETS,
  VIDEO_DURATIONS,
  aspectForFormat,
  durationSeconds,
  isAutoArtStyle,
  resolveArtStyleHint,
} from "./series/constants";
import {
  SERIES_TIMEZONE,
  hmInTimeZone,
  resolveSeriesTimezone,
  ymdInTimeZone,
  zonedWallTimeToUtc,
} from "./series/timezone";

const SESSION_COOKIE = "izent_session";

type SceneClip = { kind: "image" | "video"; url: string };

async function seriesProviders() {
  // Keep node-only media pipeline off the client graph
  return await import(/* @vite-ignore */ "./series/providers.server");
}

async function getUserId(): Promise<string> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  return session.userId;
}

const MAX_REFERENCE_IMAGES = 30;

function seriesReferenceUrls(series: {
  referenceImageUrl?: string | null;
  referenceImageUrls?: string[] | null;
}): string[] {
  const urls = [...(series.referenceImageUrls || [])].filter(Boolean);
  if (series.referenceImageUrl && !urls.includes(series.referenceImageUrl)) {
    urls.unshift(series.referenceImageUrl);
  }
  return urls.slice(0, MAX_REFERENCE_IMAGES);
}

const createSeriesSchema = z.object({
  name: z.string().min(1).max(120),
  videoFormat: z.enum(["short", "long"]).default("short"),
  contentMode: z.enum(["faceless", "ugc", "commercial"]).default("faceless"),
  niche: z.string().min(1).max(5000),
  nicheMode: z.enum(["preset", "custom"]),
  customNiche: z.string().max(5000).optional().nullable(),
  exampleScript: z.string().max(2000).optional().nullable(),
  /** Full polished narration from YouTube import */
  lockedScript: z.string().max(12000).optional().nullable(),
  sourceYoutubeUrl: z.string().max(500).optional().nullable(),
  /** Optional title for first video when importing from YouTube */
  lockedTitle: z.string().max(120).optional().nullable(),
  voiceId: z.string().optional().nullable(),
  skipVoice: z.boolean().default(false),
  musicIds: z.array(z.string()).default([]),
  customMusicUrls: z.array(z.string()).default([]),
  skipMusic: z.boolean().default(false),
  artStyle: z.string().optional().nullable(),
  skipArtStyle: z.boolean().default(false),
  /** @deprecated prefer referenceImageUrls */
  referenceImageUrl: z.string().max(2000).optional().nullable(),
  referenceImageUrls: z.array(z.string().max(2000)).max(MAX_REFERENCE_IMAGES).default([]),
  captionStyle: z.string().default("bold-stroke"),
  skipCaptions: z.boolean().default(false),
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
  /** How many videos to generate & auto-post each day (1–5) */
  postsPerDay: z.number().int().min(1).max(5).default(1),
  /** Hours between each post on the same day (1–12) */
  postIntervalHours: z.number().int().min(1).max(12).default(4),
  /** ISO datetime from calendar picker */
  scheduledPublishAt: z.string().optional().nullable(),
  timezone: z.string().default(SERIES_TIMEZONE),
  projectId: z.string().optional().nullable(),
  platforms: z.array(z.string()).default([]),
  syncGoogleCalendar: z.boolean().default(true),
});

function clampPostsPerDay(n?: number | null): number {
  return Math.max(1, Math.min(5, Math.round(n || 1)));
}

function clampIntervalHours(n?: number | null): number {
  return Math.max(1, Math.min(12, Math.round(n || 4)));
}

/** Next occurrence of HH:mm in Europe/London (stored as UTC Date). */
function nextPublishAt(
  publishTime: string,
  from = new Date(),
  timeZone = SERIES_TIMEZONE,
): Date {
  const [hh, mm] = publishTime.split(":").map(Number);
  const tz = resolveSeriesTimezone(timeZone);
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000);
    const { year, month, day } = ymdInTimeZone(probe, tz);
    const candidate = zonedWallTimeToUtc(tz, year, month, day, hh, mm);
    if (candidate.getTime() > from.getTime() + 60_000) return candidate;
  }
  const { year, month, day } = ymdInTimeZone(from, tz);
  return zonedWallTimeToUtc(tz, year, month, day + 1, hh, mm);
}

/**
 * Post times for one day starting at firstPublish.
 * Uses postIntervalHours so 3/day from 2am + 4h → 2:00, 6:00, 10:00 (not all at once).
 */
function slotsForDay(
  firstPublish: Date,
  postsPerDay: number,
  postIntervalHours?: number | null,
): Date[] {
  const n = clampPostsPerDay(postsPerDay);
  if (n === 1) return [firstPublish];
  const gapMs = clampIntervalHours(postIntervalHours) * 60 * 60 * 1000;
  return Array.from({ length: n }, (_, i) => new Date(firstPublish.getTime() + i * gapMs));
}

/** Start producing the video ASAP; posting still waits for scheduledAt. */
function generateAtForSchedule(_scheduledAt: Date): Date {
  return new Date();
}

function parseScheduledAt(
  iso: string | null | undefined,
  publishTime: string,
  timeZone = SERIES_TIMEZONE,
): Date {
  const tz = resolveSeriesTimezone(timeZone);
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 60_000) return d;
  }
  return nextPublishAt(publishTime, new Date(), tz);
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
          series: {
            select: {
              id: true,
              name: true,
              niche: true,
              videoFormat: true,
              contentMode: true,
              platforms: true,
              projectId: true,
            },
          },
        },
        take: 100,
      });
      return { ok: true as const, videos };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, videos: [] };
    }
  });

/** Extract English captions + metadata from a YouTube URL (no video download). */
export const extractYouTubeScript = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      url: z.string().min(8).max(500),
      duration: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const { extractYouTubeTranscript, trimTranscriptForDuration } = await import(
        "./series/youtube-script.server"
      );
      const dur = durationSeconds(data.duration || "30");
      const extracted = await extractYouTubeTranscript({ url: data.url });
      const trimmed = trimTranscriptForDuration(extracted.transcript, dur);
      return {
        ok: true as const,
        videoId: extracted.videoId,
        sourceUrl: extracted.url,
        sourceTitle: extracted.title,
        channelTitle: extracted.channelTitle,
        transcript: trimmed,
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** WaveSpeed niche detect + polish transcript into a faceless narration script. */
export const reviewImportedYouTubeScript = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      transcript: z.string().min(40).max(20000),
      title: z.string().max(300).optional().nullable(),
      duration: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const { reviewYouTubeScript } = await seriesProviders();
      const dur = durationSeconds(data.duration || "30");
      const reviewed = await reviewYouTubeScript({
        transcript: data.transcript,
        title: data.title,
        durationSec: dur,
        niches: NICHE_PRESETS.map((n) => ({
          id: n.id,
          label: n.label,
          description: n.description,
        })),
      });
      return {
        ok: true as const,
        nicheId: reviewed.nicheId,
        nicheLabel: reviewed.nicheLabel,
        finalScript: reviewed.finalScript,
        needsEdit: reviewed.needsEdit,
        editNotes: reviewed.editNotes,
        suggestedTitle: reviewed.suggestedTitle,
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/**
 * Extract YouTube captions, detect niche, and AI-review/edit the script for faceless video.
 */
export const importYouTubeScript = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      url: z.string().min(8).max(500),
      duration: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const { extractYouTubeTranscript, trimTranscriptForDuration } = await import(
        "./series/youtube-script.server"
      );
      const { reviewYouTubeScript } = await seriesProviders();
      const dur = durationSeconds(data.duration || "30");

      const extracted = await extractYouTubeTranscript({ url: data.url });
      const trimmed = trimTranscriptForDuration(extracted.transcript, dur);

      const reviewed = await reviewYouTubeScript({
        transcript: trimmed,
        title: extracted.title,
        durationSec: dur,
        niches: NICHE_PRESETS.map((n) => ({
          id: n.id,
          label: n.label,
          description: n.description,
        })),
      });

      return {
        ok: true as const,
        videoId: extracted.videoId,
        sourceUrl: extracted.url,
        sourceTitle: extracted.title,
        channelTitle: extracted.channelTitle,
        rawTranscript: trimmed,
        nicheId: reviewed.nicheId,
        nicheLabel: reviewed.nicheLabel,
        finalScript: reviewed.finalScript,
        needsEdit: reviewed.needsEdit,
        editNotes: reviewed.editNotes,
        suggestedTitle: reviewed.suggestedTitle,
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const createSeries = createServerFn({ method: "POST" })
  .inputValidator(createSeriesSchema)
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const isProductMode =
        data.contentMode === "ugc" || data.contentMode === "commercial";
      const skipVoice = data.skipVoice || isProductMode || !data.voiceId || data.voiceId === "none";
      const skipMusic =
        data.skipMusic || isProductMode || (data.musicIds.length === 0 && !data.customMusicUrls.length);
      const skipCaptions = data.skipCaptions || isProductMode || data.captionStyle === "none";
      const visualMode = isProductMode
        ? "full_video"
        : data.visualMode || (data.animatedHook ? "animated_hook" : "images");
      const refUrls = [
        ...new Set(
          [
            ...(data.referenceImageUrls || []),
            data.referenceImageUrl || "",
          ].filter(Boolean),
        ),
      ].slice(0, MAX_REFERENCE_IMAGES);

      const skipArtStyle =
        data.skipArtStyle || !data.artStyle || data.artStyle === "auto" || data.artStyle === "none";
      const artStyleValue = skipArtStyle
        ? "auto"
        : isProductMode
          ? data.artStyle || "commercial-photo"
          : data.artStyle || "comic";

      const tz = resolveSeriesTimezone(data.timezone);
      const postsPerDay = clampPostsPerDay(data.postsPerDay);
      const postIntervalHours = clampIntervalHours(data.postIntervalHours);
      const firstAt = parseScheduledAt(data.scheduledPublishAt, data.publishTime, tz);
      const daySlots = slotsForDay(firstAt, postsPerDay, postIntervalHours);
      const publishTime =
        data.publishTime ||
        (() => {
          const { hour, minute } = hmInTimeZone(firstAt, tz);
          return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        })();

      // Always bind series to THIS user's Ayrshare profile (never another user's)
      const { resolveOwnedProfileKey } = await import("./ayrshare.functions");
      const projectId = await resolveOwnedProfileKey(userId, data.projectId);

      let calendarEventId: string | null = null;
      let calendarLink: string | undefined;
      if (data.syncGoogleCalendar !== false) {
        try {
          const { syncGoogleCalendarEvent, ensureSeriesCronSchedulerJob } = await import(
            "./series/google-scheduler.server"
          );
          const cal = await syncGoogleCalendarEvent({
            title: `Post: ${data.name}`,
            description: `IzentSocial series auto-post (${data.contentMode}) · ${postsPerDay}/day every ${postIntervalHours}h`,
            start: firstAt,
            timezone: tz,
          });
          calendarEventId = cal.eventId || null;
          calendarLink = cal.htmlLink;
          const appUrl =
            process.env.APP_URL ||
            (process.env.RAILWAY_PUBLIC_DOMAIN
              ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
              : null);
          const cronSecret = process.env.SERIES_CRON_SECRET;
          if (appUrl && cronSecret) {
            await ensureSeriesCronSchedulerJob({
              cronUrl: `${appUrl.replace(/\/$/, "")}/api/series/cron`,
              cronSecret,
            });
          }
        } catch (calErr) {
          console.warn("Calendar/scheduler sync skipped:", (calErr as Error).message);
        }
      }

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
          lockedScript: data.lockedScript?.trim() || null,
          sourceYoutubeUrl: data.sourceYoutubeUrl?.trim() || null,
          voiceId: skipVoice ? "none" : data.voiceId || "JBFqnCBsd6RMkjVDRZzb",
          skipVoice,
          musicIds: skipMusic ? [] : data.musicIds,
          customMusicUrls: skipMusic ? [] : data.customMusicUrls,
          skipMusic,
          artStyle: artStyleValue,
          referenceImageUrl: refUrls[0] || null,
          referenceImageUrls: isProductMode ? refUrls : [],
          captionStyle: skipCaptions ? "none" : data.captionStyle || "bold-stroke",
          skipCaptions,
          glitchEffect: data.glitchEffect,
          animatedHook: visualMode !== "images",
          visualMode,
          videoModel: data.videoModel,
          duration: data.duration,
          publishTime,
          postsPerDay,
          postIntervalHours,
          nextPublishAt: daySlots[daySlots.length - 1] || firstAt,
          timezone: tz,
          projectId,
          platforms: data.platforms,
          calendarEventId,
          status: "active",
        },
      });

      // Seed today's posts at interval slots (exactly postsPerDay — no second-day buffer)
      const lockedScript = data.lockedScript?.trim() || null;
      const lockedTitle = data.lockedTitle?.trim() || null;
      let video = null as Awaited<ReturnType<typeof prisma.seriesVideo.create>> | null;
      for (let i = 0; i < daySlots.length; i++) {
        const scheduledAt = daySlots[i];
        const created = await prisma.seriesVideo.create({
          data: {
            seriesId: series.id,
            episodeNumber: i + 1,
            status: "pending",
            scheduledAt,
            // Produce full video ASAP; publish waits for scheduledAt
            generateAt: generateAtForSchedule(scheduledAt),
            calendarEventId: i === 0 ? calendarEventId : null,
            // First video inherits YouTube locked script when present
            ...(i === 0 && lockedScript
              ? {
                  script: lockedScript,
                  title: lockedTitle || null,
                }
              : {}),
          },
        });
        if (i === 0) video = created;
      }

      // Kick auto generate/post in background — no manual "Generate" needed
      void runSeriesQueuePass().catch((e) =>
        console.warn("Auto queue after createSeries:", (e as Error).message),
      );

      return { ok: true as const, series, video, calendarLink };
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
      if (video.status === "generating") {
        return { ok: false as const, error: "Generation already in progress" };
      }
      if (video.status === "ready" || video.status === "published") {
        return { ok: true as const, video };
      }
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
      const format = video.series.videoFormat || "short";
      if (format !== "long") {
        return {
          ok: false as const,
          error: "Thumbnails are only for 16:9 long videos — short 9:16 reels skip thumbnails",
        };
      }

      const aspect = aspectForFormat(format);
      const { generateVideoThumbnail } = await seriesProviders();

      const thumbnailUrl = await generateVideoThumbnail({
        title: video.title,
        description: video.description,
        script: video.script,
        niche: video.series.customNiche || video.series.niche,
        artStyleHint: resolveArtStyleHint(video.series.artStyle),
        aspectRatio: aspect,
        mediaUrl: video.mediaUrl,
        referenceImageUrl: seriesReferenceUrls(video.series),
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
      const { previewVoiceSample } = await seriesProviders();
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
      const { previewMusicSample } = await seriesProviders();
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
      const { saveUploadBuffer } = await seriesProviders();
      const saved = await saveUploadBuffer(buf, ext, "series-refs");
      return { ok: true as const, url: saved.publicUrl };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Process due generations + posts. Call from cron or UI "Process queue". */
export const processSeriesQueue = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await getUserId().catch(() => null);
    const result = await runSeriesQueuePass();
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

async function runSeriesQueuePass() {
  const now = new Date();

  // Full videos should generate ASAP (not wait for a future generateAt / manual click)
  await prisma.seriesVideo.updateMany({
    where: {
      status: "pending",
      generateAt: { gt: now },
      series: { status: "active" },
    },
    data: { generateAt: now },
  });

  // Keep every active series stocked with upcoming slots
  const activeSeries = await prisma.series.findMany({
    where: { status: "active" },
    select: { id: true },
    take: 50,
  });
  for (const s of activeSeries) {
    try {
      await ensureUpcomingVideos(s.id);
    } catch (e) {
      console.warn("ensureUpcomingVideos failed:", s.id, (e as Error).message);
    }
  }

  const dueGenerate = await prisma.seriesVideo.findMany({
    where: {
      status: "pending",
      generateAt: { lte: now },
      series: { status: "active" },
    },
    take: 5,
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
    take: 8,
    include: { series: true },
    orderBy: { scheduledAt: "asc" },
  });

  const posted: string[] = [];
  const skipped: string[] = [];
  for (const v of duePost) {
    if (!v.series.platforms?.length || !v.series.projectId) {
      skipped.push(v.id);
      await prisma.seriesVideo.update({
        where: { id: v.id },
        data: {
          error:
            "Waiting for social accounts — connect platforms in Series Settings to auto-post",
        },
      });
      continue;
    }
    try {
      await publishSeriesVideo(v.id);
      posted.push(v.id);
      await ensureUpcomingVideos(v.seriesId);
    } catch (e) {
      // Keep ready so cron can retry; surface error on the video
      await prisma.seriesVideo.update({
        where: { id: v.id },
        data: { error: (e as Error).message },
      });
    }
  }

  return {
    generated: generated.length,
    posted: posted.length,
    skipped: skipped.length,
    ids: { generated, posted, skipped },
  };
}

async function runVideoGeneration(videoId: string) {
  const video = await prisma.seriesVideo.findUnique({
    where: { id: videoId },
    include: { series: true },
  });
  if (!video) throw new Error("Video not found");

  // Single attempt lock — never re-enter if already generating/ready/published
  if (video.status === "generating") {
    throw new Error("Video generation already in progress (no retry)");
  }
  if (video.status === "ready" || video.status === "published") {
    return;
  }
  // Auto-queue only claims pending. Manual "Generate now" may reset failed → one more user-triggered try.
  const claimed = await prisma.seriesVideo.updateMany({
    where: {
      id: videoId,
      status: { in: ["pending", "failed"] },
    },
    data: { status: "generating", error: null },
  });
  if (claimed.count === 0) {
    throw new Error("Could not start generation (already claimed or invalid status)");
  }

  try {
    const series = video.series;
    const dur = durationSeconds(series.duration);
    const autoArt = isAutoArtStyle(series.artStyle);
    const art = autoArt ? null : ART_STYLES.find((a) => a.id === series.artStyle);
    const artHint = resolveArtStyleHint(series.artStyle);
    const nicheLabel = series.customNiche || series.niche;
    const videoFormat = series.videoFormat || "short";
    const aspect = aspectForFormat(videoFormat);
    const {
      assembleReel,
      deriveAssetsFromLockedScript,
      generateElevenLabsMusic,
      generateElevenLabsSpeech,
      generateMotionVideo,
      generateSceneImages,
      generateScriptContent,
      generateVideoThumbnail,
    } = await seriesProviders();

    // YouTube Data API research BEFORE any AI generation
    let youtubeBrief: string | null = null;
    let youtubeKeywords: string[] = [];
    try {
      const { researchYouTubeNiche } = await import("./series/youtube-research");
      const research = await researchYouTubeNiche(nicheLabel);
      youtubeBrief = research.brief;
      youtubeKeywords = research.keywords || [];
      console.log(
        `YouTube research: ${research.topByViews.length} videos, keywords=[${research.keywords.slice(0, 8).join(", ")}]`,
      );
    } catch (ytErr) {
      console.warn("YouTube research skipped:", (ytErr as Error).message);
    }

    const isProductMode =
      series.contentMode === "ugc" || series.contentMode === "commercial";
    const skipVoice =
      series.skipVoice ||
      isProductMode ||
      !series.voiceId ||
      series.voiceId === "none";
    const skipMusic = series.skipMusic || isProductMode;
    const skipCaptions =
      series.skipCaptions || isProductMode || series.captionStyle === "none";

    // Internal sequence only — stories stay standalone (no episode continuity)
    const priorCount = await prisma.seriesVideo.count({
      where: {
        seriesId: series.id,
        id: { not: videoId },
        status: { in: ["ready", "published", "generating"] },
      },
    });
    const episodeNumber = video.episodeNumber || priorCount + 1;
    const recentTitles = (
      await prisma.seriesVideo.findMany({
        where: {
          seriesId: series.id,
          id: { not: videoId },
          title: { not: null },
          status: { in: ["ready", "published", "generating"] },
        },
        orderBy: { createdAt: "desc" },
        select: { title: true },
        take: 8,
      })
    )
      .map((p) => p.title)
      .filter((t): t is string => !!t);

    const lockedScriptText = (series.lockedScript || "").trim();
    // YouTube import: never invent a new story when series has lockedScript and
    // this video already has narration (episode 1 is seeded at create).
    const useLockedScript =
      !!lockedScriptText &&
      (!!video.script?.trim() || video.episodeNumber === 1);

    const content = useLockedScript
      ? await deriveAssetsFromLockedScript({
          script: video.script?.trim() || lockedScriptText,
          niche: nicheLabel,
          titleHint: video.title,
          durationSec: dur,
          artStyle: artHint,
          autoArtStyle: autoArt,
          contentMode: series.contentMode || "faceless",
          videoFormat,
          youtubeKeywords: youtubeKeywords.length
            ? youtubeKeywords
            : nicheLabel.split(/[\s,/|]+/).filter((w) => w.length > 2),
        })
      : await generateScriptContent({
          niche: nicheLabel,
          exampleScript: series.exampleScript,
          durationSec: dur,
          artStyle: artHint,
          autoArtStyle: autoArt,
          youtubeBrief,
          youtubeKeywords: youtubeKeywords.length
            ? youtubeKeywords
            : nicheLabel.split(/[\s,/|]+/).filter((w) => w.length > 2),
          contentMode: series.contentMode || "faceless",
          videoFormat,
          recentTitles,
          storyIndex: Math.max(0, episodeNumber - 1),
        });

    const productRefs = seriesReferenceUrls(series);

    // Product refs for UGC/commercial; only use art-style sample images when a fixed style is chosen
    const imageRef = productRefs.length
      ? productRefs
      : isProductMode || autoArt
        ? null
        : art?.image;

    const scenes = await generateSceneImages(
      content.scenePrompts,
      artHint,
      imageRef || undefined,
      aspect,
    );
    const sceneUrls = scenes.map((s) => s.localUrl);
    const imageUrl = sceneUrls[0];

    let voiceUrl: string | null = null;
    let voiceDurationSec: number | null = null;
    let musicUrl: string | null = null;
    if (!skipVoice) {
      // One ElevenLabs TTS attempt — failure stops the whole job
      const speech = await generateElevenLabsSpeech(content.script, series.voiceId);
      voiceUrl = speech.publicUrl;
      voiceDurationSec = speech.durationSec;
    }
    if (!skipMusic) {
      // One music attempt — on failure, continue without music (do not call another ElevenLabs path)
      if (series.musicIds.length > 0) {
        const musicId = series.musicIds[Math.floor(Math.random() * series.musicIds.length)];
        const preset = MUSIC_PRESETS.find((m) => m.id === musicId);
        if (preset) {
          musicUrl = await generateElevenLabsMusic(
            preset.prompt,
            Math.min(Math.max(voiceDurationSec || dur, 8), 60) * 1000,
          );
        }
      } else if (series.customMusicUrls[0]) {
        musicUrl = series.customMusicUrls[0];
      }
    }

    // UGC/commercial always full AI video; faceless respects series.visualMode
    const visualMode = isProductMode
      ? "full_video"
      : series.visualMode || (series.animatedHook ? "animated_hook" : "images");
    const model = series.videoModel || "kwaivgi/kling-v3.0-std/image-to-video";
    const assembleDur = voiceDurationSec && voiceDurationSec > 1 ? voiceDurationSec : dur;
    const perSceneSec = Math.max(
      4,
      Math.min(8, Math.ceil(assembleDur / Math.max(1, scenes.length))),
    );

    const sceneClips: SceneClip[] = scenes.map((s) => ({
      kind: "image" as const,
      url: s.localUrl,
    }));

    if (visualMode === "full_video") {
      for (let i = 0; i < scenes.length; i++) {
        // One WaveSpeed attempt per scene — any failure aborts remaining scenes
        const motionUrl = await generateMotionVideo({
          imageUrl: scenes[i].localUrl,
          remoteImageUrl: scenes[i].remoteUrl,
          prompt: `${content.scenePrompts[i] || content.imagePrompt}. Cinematic motion, ${artHint}`,
          model,
          durationSec: perSceneSec,
          aspectRatio: aspect,
        });
        sceneClips[i] = { kind: "video", url: motionUrl };
        console.log(`Scene ${i + 1}/${scenes.length}: AI video ready`);
      }
    } else if (visualMode === "animated_hook") {
      const motionUrl = await generateMotionVideo({
        imageUrl: scenes[0].localUrl,
        remoteImageUrl: scenes[0].remoteUrl,
        prompt: `${content.imagePrompt}. Subtle cinematic camera motion, ${artHint}`,
        model,
        durationSec: perSceneSec,
        aspectRatio: aspect,
      });
      sceneClips[0] = { kind: "video", url: motionUrl };
    }

    console.log(
      `Assembling ${sceneClips.length} scenes (${aspect}) — voice=${voiceDurationSec || 0}s target=${dur}s`,
    );

    const finalUrl = await assembleReel({
      sceneClips,
      voiceUrl,
      voiceDurationSec,
      musicUrl,
      script: content.script,
      captionStyle: series.captionStyle,
      burnSubtitles: !skipCaptions && !skipVoice,
      glitch: series.glitchEffect,
      targetDurationSec: assembleDur,
      aspectRatio: aspect,
    });

    // Thumbnails only for 16:9 long videos
    let thumbnailUrl: string | null = null;
    if (videoFormat === "long") {
      try {
        thumbnailUrl = await generateVideoThumbnail({
          title: content.title,
          description: content.description,
          script: content.script,
          niche: nicheLabel,
          artStyleHint: artHint,
          aspectRatio: aspect,
          mediaUrl: finalUrl,
          thumbnailPrompt: content.thumbnailPrompt,
          referenceImageUrl: productRefs.length ? productRefs : series.referenceImageUrl,
        });
        console.log("Thumbnail ready:", thumbnailUrl);
      } catch (thumbErr) {
        console.warn("Thumbnail generation failed:", (thumbErr as Error).message);
        thumbnailUrl = imageUrl;
      }
    }

    await prisma.seriesVideo.update({
      where: { id: videoId },
      data: {
        status: "ready",
        episodeNumber,
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

async function publishSeriesVideo(
  videoId: string,
  opts?: { scheduleAt?: Date | null; platforms?: string[] },
) {
  const video = await prisma.seriesVideo.findUnique({
    where: { id: videoId },
    include: { series: true },
  });
  if (!video?.mediaUrl) throw new Error("Video has no media");
  const platformsRaw = opts?.platforms?.length
    ? opts.platforms
    : video.series.platforms;
  if (!platformsRaw.length) throw new Error("No platforms selected — connect accounts in Series Settings");

  const apiKey = process.env.AYRSHARE_API_KEY;
  if (!apiKey) throw new Error("AYRSHARE_API_KEY is not configured");

  // Always post with THIS series owner's Ayrshare profile (never a shared/wrong key)
  const { resolveOwnedProfileKey } = await import("./ayrshare.functions");
  const profileKey = await resolveOwnedProfileKey(
    video.series.userId,
    video.series.projectId,
  );
  if (profileKey !== video.series.projectId) {
    await prisma.series.update({
      where: { id: video.seriesId },
      data: { projectId: profileKey },
    });
  }

  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const uploadsRoot = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
  let mediaUrl = video.mediaUrl;
  if (mediaUrl.startsWith("/api/uploads/")) {
    const rel = mediaUrl.replace("/api/uploads/", "");
    const buf = await readFile(join(uploadsRoot, rel));
    const fileDataUri = `data:video/mp4;base64,${buf.toString("base64")}`;
    const up = await fetch("https://api.ayrshare.com/api/media/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Profile-Key": profileKey,
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

  const platforms = platformsRaw.map((p) => p.toLowerCase());
  const isLong = (video.series.videoFormat || "short") === "long";
  let postText =
    video.caption ||
    video.description ||
    video.title ||
    "New video";
  // TikTok ignores line breaks and caps at 2200; keep one shared caption safe for all networks
  if (platforms.includes("tiktok")) {
    postText = postText.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }
  postText = postText.slice(0, 2200);

  let thumbUrl: string | undefined;
  if (
    isLong &&
    platforms.includes("youtube") &&
    video.thumbnailUrl &&
    video.thumbnailUrl.startsWith("/api/uploads/")
  ) {
    try {
      const rel = video.thumbnailUrl.replace("/api/uploads/", "");
      const thumbBuf = await readFile(join(uploadsRoot, rel));
      const mime = rel.endsWith(".jpg") || rel.endsWith(".jpeg") ? "image/jpeg" : "image/png";
      const upThumb = await fetch("https://api.ayrshare.com/api/media/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Profile-Key": profileKey,
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

  const scheduleAt = opts?.scheduleAt;
  const isFuture = scheduleAt && scheduleAt.getTime() > Date.now() + 60_000;

  const bodyObj: any = {
    post: postText,
    platforms,
    mediaUrls: [mediaUrl],
    isVideo: true,
  };
  if (isFuture && scheduleAt) {
    // Ayrshare deferred post
    bodyObj.scheduleDate = scheduleAt.toISOString();
  }
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
    bodyObj.faceBookOptions = {};
  }
  if (platforms.includes("tiktok")) {
    // Explicit TikTok options — without visibility, posts often fail or stay invisible
    bodyObj.tikTokOptions = {
      visibility: "public",
      isAIGenerated: true,
      disableComments: false,
      disableDuet: false,
      disableStitch: false,
    };
  }

  const res = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Profile-Key": profileKey,
    },
    body: JSON.stringify(bodyObj),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status >= 400) {
    throw new Error(body?.message || body?.error || `Ayrshare post failed (${res.status})`);
  }

  // Ayrshare can succeed overall while one platform (often TikTok) fails in `errors`
  const platformErrors: string[] = [];
  const errList = Array.isArray(body?.errors) ? body.errors : [];
  for (const err of errList) {
    const plat = String(err?.platform || "unknown");
    const msg = String(err?.message || err?.code || "post failed");
    platformErrors.push(`${plat}: ${msg}`);
  }
  const postIds = Array.isArray(body?.postIds) ? body.postIds : [];
  for (const p of postIds) {
    if (String(p?.status).toLowerCase() === "error" || String(p?.id).toLowerCase() === "failed") {
      platformErrors.push(
        `${p?.platform || "unknown"}: ${p?.message || p?.status || "failed"}`,
      );
    }
  }
  const tiktokPending = postIds.some(
    (p: any) =>
      String(p?.platform).toLowerCase() === "tiktok" &&
      String(p?.id).toLowerCase() === "pending",
  );
  if (platformErrors.length) {
    console.warn("Ayrshare partial platform errors:", platformErrors.join(" | "));
  }
  if (tiktokPending) {
    console.log("TikTok accepted post — processing asynchronously (status pending)");
  }

  const partialNote = platformErrors.length
    ? `Partial post: ${platformErrors.join("; ")}`
    : tiktokPending
      ? "TikTok is processing (usually 1–2 min). Check TikTok inbox / profile shortly."
      : null;

  if (isFuture && scheduleAt) {
    try {
      const { syncGoogleCalendarEvent } = await import("./series/google-scheduler.server");
      const cal = await syncGoogleCalendarEvent({
        title: `Post: ${video.title || video.series.name}`,
        description: postText.slice(0, 500),
        start: scheduleAt,
        timezone: video.series.timezone || SERIES_TIMEZONE,
      });
      await prisma.seriesVideo.update({
        where: { id: videoId },
        data: {
          status: "ready",
          scheduledAt: scheduleAt,
          ayrsharePostId: body?.id || null,
          mediaUrl,
          calendarEventId: cal.eventId || video.calendarEventId,
          error: partialNote,
        },
      });
      return { scheduled: true as const, calendarLink: cal.htmlLink, warning: partialNote };
    } catch {
      await prisma.seriesVideo.update({
        where: { id: videoId },
        data: {
          status: "ready",
          scheduledAt: scheduleAt,
          ayrsharePostId: body?.id || null,
          mediaUrl,
          error: partialNote,
        },
      });
      return { scheduled: true as const, warning: partialNote };
    }
  }

  const tiktokOnlyFailed =
    platforms.includes("tiktok") &&
    platformErrors.some((e) => e.toLowerCase().startsWith("tiktok:")) &&
    postIds.filter((p: any) => String(p?.platform).toLowerCase() !== "tiktok").every(
      (p: any) => String(p?.status).toLowerCase() !== "error",
    );

  await prisma.seriesVideo.update({
    where: { id: videoId },
    data: {
      status: "published",
      publishedAt: new Date(),
      ayrsharePostId: body?.id || null,
      mediaUrl,
      error: partialNote,
    },
  });
  return {
    scheduled: false as const,
    warning: partialNote,
    tiktokPending: !!tiktokPending,
    tiktokFailed: !!tiktokOnlyFailed || platformErrors.some((e) => /tiktok/i.test(e)),
  };
}

async function enqueueNextVideo(seriesId: string) {
  const created = await ensureUpcomingVideos(seriesId);
  return created[0] || null;
}

/**
 * Keep one day of upcoming pending/ready slots (= postsPerDay).
 * Do not pre-queue a second day — that doubled generation (e.g. 2/day → 4 videos).
 */
async function ensureUpcomingVideos(seriesId: string) {
  const series = await prisma.series.findUnique({ where: { id: seriesId } });
  if (!series || series.status !== "active") return [] as Awaited<
    ReturnType<typeof prisma.seriesVideo.create>
  >[];

  const postsPerDay = clampPostsPerDay(series.postsPerDay);
  const postIntervalHours = clampIntervalHours(series.postIntervalHours);
  const tz = resolveSeriesTimezone(series.timezone);
  const targetUpcoming = postsPerDay;

  // Heal old 2-day buffer that queued 2× postsPerDay (e.g. 2/day → 4 pending)
  const pendingUpcoming = await prisma.seriesVideo.findMany({
    where: {
      seriesId,
      status: "pending",
      scheduledAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
  });
  if (pendingUpcoming.length > targetUpcoming) {
    const dropIds = pendingUpcoming.slice(targetUpcoming).map((v) => v.id);
    await prisma.seriesVideo.deleteMany({
      where: { id: { in: dropIds }, status: "pending" },
    });
  }

  const upcoming = await prisma.seriesVideo.count({
    where: {
      seriesId,
      // Count failed too so we do NOT auto-spawn replacements that burn more tokens
      status: { in: ["pending", "ready", "generating", "failed"] },
      scheduledAt: { gte: new Date(Date.now() - 60_000) },
    },
  });
  if (upcoming >= targetUpcoming) return [];

  const last = await prisma.seriesVideo.findFirst({
    where: { seriesId },
    orderBy: [{ episodeNumber: "desc" }, { scheduledAt: "desc" }],
  });
  let nextEp = (last?.episodeNumber || 0) + 1;
  let cursor = last?.scheduledAt
    ? new Date(last.scheduledAt.getTime() + 60_000)
    : new Date();

  const created: Awaited<ReturnType<typeof prisma.seriesVideo.create>>[] = [];
  let guard = 0;
  while (upcoming + created.length < targetUpcoming && guard < 20) {
    guard++;
    const dayStart = nextPublishAt(series.publishTime, cursor, tz);
    const slots = slotsForDay(dayStart, postsPerDay, postIntervalHours).filter(
      (s) => s.getTime() > cursor.getTime(),
    );
    if (!slots.length) {
      cursor = new Date(dayStart.getTime() + 60_000);
      continue;
    }
    for (const scheduledAt of slots) {
      if (upcoming + created.length >= targetUpcoming) break;
      const row = await prisma.seriesVideo.create({
        data: {
          seriesId,
          episodeNumber: nextEp++,
          status: "pending",
          scheduledAt,
          generateAt: generateAtForSchedule(scheduledAt),
        },
      });
      created.push(row);
      cursor = new Date(scheduledAt.getTime() + 60_000);
    }
  }

  if (created.length) {
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        nextPublishAt: created[created.length - 1].scheduledAt || series.nextPublishAt,
      },
    });
  }
  return created;
}

/** Post a ready video now, or schedule via Ayrshare + calendar. */
export const publishSeriesVideoNow = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      videoId: z.string(),
      scheduleAt: z.string().optional().nullable(),
      platforms: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const video = await prisma.seriesVideo.findFirst({
        where: { id: data.videoId, series: { userId } },
      });
      if (!video) return { ok: false as const, error: "Video not found" };
      if (video.status !== "ready" && video.status !== "published") {
        return { ok: false as const, error: "Video must be ready before posting" };
      }
      const result = await publishSeriesVideo(video.id, {
        scheduleAt: data.scheduleAt ? new Date(data.scheduleAt) : null,
        platforms: data.platforms,
      });
      if (!result.scheduled) {
        await enqueueNextVideo(video.seriesId);
      }
      return { ok: true as const, ...result };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Queue the next standalone story and optionally generate immediately. */
export const generateNextEpisode = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      seriesId: z.string(),
      generateNow: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const series = await prisma.series.findFirst({
        where: { id: data.seriesId, userId },
      });
      if (!series) return { ok: false as const, error: "Series not found" };

      const video = await enqueueNextVideo(series.id);
      if (!video) return { ok: false as const, error: "Could not queue next story" };

      if (data.generateNow) {
        await runVideoGeneration(video.id);
        const fresh = await prisma.seriesVideo.findUnique({ where: { id: video.id } });
        return { ok: true as const, video: fresh };
      }
      return { ok: true as const, video };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Series-specific settings (not Agent settings). */
export const getSeriesSettings = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string().optional() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const { resolveOwnedProfileKey } = await import("./ayrshare.functions");
      const ownKey = await resolveOwnedProfileKey(userId, null);

      // Heal any series that still point at another user's (or missing) profile
      await prisma.series.updateMany({
        where: {
          userId,
          OR: [{ projectId: null }, { NOT: { projectId: ownKey } }],
        },
        data: { projectId: ownKey },
      });

      const series = await prisma.series.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      const selected = data.seriesId
        ? series.find((s) => s.id === data.seriesId) || series[0] || null
        : series[0] || null;
      return { ok: true as const, series, selected };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, series: [], selected: null };
    }
  });

export const updateSeriesSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      seriesId: z.string(),
      name: z.string().min(1).max(120).optional(),
      voiceId: z.string().optional().nullable(),
      skipVoice: z.boolean().optional(),
      musicIds: z.array(z.string()).optional(),
      skipMusic: z.boolean().optional(),
      artStyle: z.string().optional(),
      captionStyle: z.string().optional(),
      skipCaptions: z.boolean().optional(),
      visualMode: z.enum(["images", "animated_hook", "full_video"]).optional(),
      videoModel: z.string().optional(),
      duration: z.string().optional(),
      publishTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      postsPerDay: z.number().int().min(1).max(5).optional(),
      postIntervalHours: z.number().int().min(1).max(12).optional(),
      timezone: z.string().optional(),
      projectId: z.string().optional().nullable(),
      platforms: z.array(z.string()).optional(),
      glitchEffect: z.boolean().optional(),
      status: z.enum(["active", "paused", "draft"]).optional(),
      referenceImageUrls: z.array(z.string()).max(MAX_REFERENCE_IMAGES).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const existing = await prisma.series.findFirst({
        where: { id: data.seriesId, userId },
      });
      if (!existing) return { ok: false as const, error: "Series not found" };
      const {
        seriesId,
        projectId: rawProjectId,
        postsPerDay,
        postIntervalHours,
        ...rest
      } = data;

      const { resolveOwnedProfileKey } = await import("./ayrshare.functions");
      const projectId =
        rawProjectId !== undefined
          ? await resolveOwnedProfileKey(userId, rawProjectId)
          : await resolveOwnedProfileKey(userId, existing.projectId);

      const series = await prisma.series.update({
        where: { id: seriesId },
        data: {
          ...rest,
          // Always keep UK time for posting schedules
          timezone: SERIES_TIMEZONE,
          projectId,
          ...(postsPerDay != null ? { postsPerDay: clampPostsPerDay(postsPerDay) } : {}),
          ...(postIntervalHours != null
            ? { postIntervalHours: clampIntervalHours(postIntervalHours) }
            : {}),
          voiceId:
            rest.skipVoice || rest.voiceId === "none"
              ? "none"
              : rest.voiceId ?? existing.voiceId,
          referenceImageUrl: rest.referenceImageUrls?.[0] ?? existing.referenceImageUrl,
        },
      });

      // Re-stock queue when schedule cadence changes
      if (
        postsPerDay != null ||
        postIntervalHours != null ||
        rest.publishTime ||
        rest.timezone ||
        rest.status === "active"
      ) {
        await ensureUpcomingVideos(seriesId);
        void runSeriesQueuePass().catch((e) =>
          console.warn("Auto queue after settings save:", (e as Error).message),
        );
      }

      return { ok: true as const, series };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Cron / in-process worker entry. */
export async function runSeriesCronJob(
  secret?: string | null,
  opts?: { internal?: boolean },
) {
  if (!opts?.internal) {
    const expected = process.env.SERIES_CRON_SECRET;
    if (expected && secret !== expected) {
      throw new Error("Unauthorized cron");
    }
  }
  return runSeriesQueuePass();
}

/** Start background auto-generate + auto-post loop (used by server.ts). */
export function startSeriesBackgroundWorker() {
  const g = globalThis as any;
  if (g.__izentSeriesWorkerStarted) return;
  g.__izentSeriesWorkerStarted = true;

  const tick = () => {
    void runSeriesCronJob(null, { internal: true }).catch((e) =>
      console.warn("Series worker:", (e as Error).message),
    );
  };

  // First pass shortly after boot, then every 3 minutes
  setTimeout(() => {
    tick();
    setInterval(tick, 3 * 60_000);
  }, 20_000);
  console.log("Series background worker scheduled (every 3 min)");
}
