import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { prisma } from "./db";
import {
  APP_SETTINGS_KEY,
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
  toPublicSettings,
  type AppSettings,
} from "./app-settings";

const SESSION_COOKIE = "izent_session";
const STORAGE_VERSION = "izent-reels-1";
const STORAGE_VERSION_KEY = "storageVersion";
let storageReady = false;

export function adminEmailsFromEnv() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

type Fields = { role: string; status: string };

export async function getUserAdminFields(id: string): Promise<Fields> {
  try {
    const rows = await prisma.$queryRaw<Fields[]>`
      SELECT "role", "status" FROM "User" WHERE id = ${id}
    `;
    return rows[0] || { role: "user", status: "active" };
  } catch {
    return { role: "user", status: "active" };
  }
}

async function countBy(col: "role" | "status", value: string) {
  try {
    const rows =
      col === "role"
        ? await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "User" WHERE "role" = ${value}`
        : await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "User" WHERE "status" = ${value}`;
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

async function setFields(id: string, fields: { role?: string; status?: string }) {
  if (fields.role) await prisma.$executeRaw`UPDATE "User" SET "role" = ${fields.role} WHERE id = ${id}`;
  if (fields.status) await prisma.$executeRaw`UPDATE "User" SET "status" = ${fields.status} WHERE id = ${id}`;
}

async function adminMap() {
  const map = new Map<string, Fields>();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string } & Fields>>`
      SELECT id, "role", "status" FROM "User"
    `;
    for (const row of rows) map.set(row.id, { role: row.role, status: row.status });
  } catch {
    // columns not ready
  }
  return map;
}

async function wipeAll() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Message",
      "Chat",
      "Session",
      "SeriesVideo",
      "Series",
      "StudioJob",
      "AyrshareProfile",
      "AppSetting",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

async function stampVersion() {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" (id, key, value, "updatedAt")
    VALUES (${id}, ${STORAGE_VERSION_KEY}, ${STORAGE_VERSION}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()
  `;
}

export async function ensureNewStorage() {
  if (storageReady) return;
  try {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM "AppSetting" WHERE key = ${STORAGE_VERSION_KEY}
    `;
    if (rows[0]?.value === STORAGE_VERSION) {
      storageReady = true;
      return;
    }
    await wipeAll();
    await stampVersion();
  } catch {
    try {
      await wipeAll();
      await stampVersion();
    } catch {
      // schema not ready
    }
  }
  storageReady = true;
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM "AppSetting" WHERE key = ${APP_SETTINGS_KEY}
    `;
    if (!rows[0]) return { ...DEFAULT_APP_SETTINGS };
    return mergeAppSettings(JSON.parse(rows[0].value) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function writeAppSettings(settings: AppSettings, updatedBy?: string) {
  const value = JSON.stringify(mergeAppSettings(settings));
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" (id, key, value, "updatedBy", "updatedAt")
    VALUES (${id}, ${APP_SETTINGS_KEY}, ${value}, ${updatedBy ?? null}, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = NOW()
  `;
}

export async function promoteAdminIfNeeded(user: {
  id: string;
  email: string | null;
  role?: string;
}) {
  const fields = await getUserAdminFields(user.id);
  const emails = adminEmailsFromEnv();
  const email = user.email?.toLowerCase() || "";
  let role = fields.role;
  if (email && emails.includes(email) && role !== "admin") {
    await setFields(user.id, { role: "admin" });
    role = "admin";
  } else if (role !== "admin" && (await countBy("role", "admin")) === 0) {
    const first = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (first?.id === user.id) {
      await setFields(user.id, { role: "admin" });
      role = "admin";
    }
  }
  return { ...user, role, status: fields.status };
}

async function requireAdmin() {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  const fields = await getUserAdminFields(session.user.id);
  if (fields.status === "suspended") throw new Error("Account suspended");
  const user = await promoteAdminIfNeeded({ ...session.user, role: fields.role });
  if (user.role !== "admin") throw new Error("Admin access required");
  return { ...session.user, role: "admin" as const, status: fields.status };
}

const settingsSchema = z.object({
  siteName: z.string().min(1).max(80),
  tagline: z.string().min(1).max(400),
  socialProofLabel: z.string().min(1).max(40),
  contactEmail: z.string().email(),
  registrationOpen: z.boolean(),
  maintenanceMode: z.boolean(),
  defaultVoiceId: z.string().min(1).max(80),
  defaultDuration: z.string().min(1).max(20),
  defaultArtStyle: z.string().min(1).max(80),
  defaultCaptionStyle: z.string().min(1).max(80),
  defaultVisualMode: z.enum(["images", "animated_hook", "full_video"]),
  defaultVideoModel: z.string().min(1).max(160),
  defaultPostsPerDay: z.number().int().min(1).max(10),
  defaultPostIntervalHours: z.number().int().min(1).max(12),
  defaultPublishTime: z.string().regex(/^\d{2}:\d{2}$/),
  allowYouTubeImport: z.boolean(),
  allowCustomVoice: z.boolean(),
  allowCustomMusic: z.boolean(),
  allowFullAiVideo: z.boolean(),
  maxPostsPerDay: z.number().int().min(1).max(10),
});

export const getPublicAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  await ensureNewStorage();
  return { ok: true as const, settings: toPublicSettings(await readAppSettings()) };
});

export const getSeriesDefaults = createServerFn({ method: "GET" }).handler(async () => {
  if (!getCookie(SESSION_COOKIE)) return { ok: false as const, error: "Not authenticated" };
  const s = await readAppSettings();
  return {
    ok: true as const,
    defaults: {
      voiceId: s.defaultVoiceId,
      duration: s.defaultDuration,
      artStyle: s.defaultArtStyle,
      captionStyle: s.defaultCaptionStyle,
      visualMode: s.defaultVisualMode,
      videoModel: s.defaultVideoModel,
      postsPerDay: s.defaultPostsPerDay,
      postIntervalHours: s.defaultPostIntervalHours,
      publishTime: s.defaultPublishTime,
      allowYouTubeImport: s.allowYouTubeImport,
      allowCustomVoice: s.allowCustomVoice,
      allowCustomMusic: s.allowCustomMusic,
      allowFullAiVideo: s.allowFullAiVideo,
      maxPostsPerDay: s.maxPostsPerDay,
      maintenanceMode: s.maintenanceMode,
    },
  };
});

export const resetPlatformData = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await requireAdmin();
    await wipeAll();
    await stampVersion();
    storageReady = true;
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

export const getAdminOverview = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await ensureNewStorage();
    await requireAdmin();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86400000);
    const weekAgo = new Date(now.getTime() - 604800000);
    const [
      users,
      admins,
      suspended,
      series,
      activeSeries,
      videos,
      published,
      failed,
      generating,
      newUsers24h,
      newVideos7d,
      recentUsers,
      recentVideos,
    ] = await Promise.all([
      prisma.user.count(),
      countBy("role", "admin"),
      countBy("status", "suspended"),
      prisma.series.count(),
      prisma.series.count({ where: { status: "active" } }),
      prisma.seriesVideo.count(),
      prisma.seriesVideo.count({ where: { status: "published" } }),
      prisma.seriesVideo.count({ where: { status: "failed" } }),
      prisma.seriesVideo.count({ where: { status: { in: ["generating", "pending"] } } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.seriesVideo.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.seriesVideo.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          series: { select: { name: true, user: { select: { email: true } } } },
        },
      }),
    ]);
    const map = await adminMap();
    return {
      ok: true as const,
      stats: {
        users,
        admins,
        suspended,
        series,
        activeSeries,
        videos,
        published,
        failed,
        generating,
        newUsers24h,
        newVideos7d,
      },
      recentUsers: recentUsers.map((u) => ({
        ...u,
        role: map.get(u.id)?.role || "user",
        status: map.get(u.id)?.status || "active",
      })),
      recentVideos,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

export const listAdminUsers = createServerFn({ method: "POST" })
  .inputValidator(z.object({ q: z.string().max(120).optional() }))
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      const q = data.q?.trim();
      const users = await prisma.user.findMany({
        where: q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          _count: { select: { series: true, sessions: true } },
        },
      });
      const map = await adminMap();
      return {
        ok: true as const,
        users: users.map((u) => ({
          ...u,
          role: map.get(u.id)?.role || "user",
          status: map.get(u.id)?.status || "active",
        })),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, users: [] };
    }
  });

export const updateAdminUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      role: z.enum(["user", "admin"]).optional(),
      status: z.enum(["active", "suspended"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      if (data.userId === admin.id && data.role === "user") {
        return { ok: false as const, error: "You cannot remove your own admin role." };
      }
      if (data.userId === admin.id && data.status === "suspended") {
        return { ok: false as const, error: "You cannot suspend your own account." };
      }
      if (!(await prisma.user.findUnique({ where: { id: data.userId } }))) {
        return { ok: false as const, error: "User not found" };
      }
      const target = await getUserAdminFields(data.userId);
      if (data.role === "user" && target.role === "admin" && (await countBy("role", "admin")) <= 1) {
        return { ok: false as const, error: "Keep at least one admin." };
      }
      await setFields(data.userId, { role: data.role, status: data.status });
      if (data.status === "suspended") {
        await prisma.session.deleteMany({ where: { userId: data.userId } });
      }
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const listAdminSeries = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      q: z.string().max(120).optional(),
      status: z.enum(["all", "active", "paused", "draft"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      const q = data.q?.trim();
      const status = data.status && data.status !== "all" ? data.status : undefined;
      const series = await prisma.series.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { niche: { contains: q, mode: "insensitive" } },
                  { user: { email: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 150,
        select: {
          id: true,
          name: true,
          niche: true,
          status: true,
          duration: true,
          postsPerDay: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
          _count: { select: { videos: true } },
        },
      });
      return { ok: true as const, series };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, series: [] };
    }
  });

export const updateAdminSeriesStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string(), status: z.enum(["active", "paused", "draft"]) }))
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      await prisma.series.update({ where: { id: data.seriesId }, data: { status: data.status } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const deleteAdminSeries = createServerFn({ method: "POST" })
  .inputValidator(z.object({ seriesId: z.string() }))
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      await prisma.series.delete({ where: { id: data.seriesId } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const listAdminVideos = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      status: z.enum(["all", "pending", "generating", "ready", "published", "failed"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await requireAdmin();
      const status = data.status && data.status !== "all" ? data.status : undefined;
      const videos = await prisma.seriesVideo.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        take: 150,
        select: {
          id: true,
          title: true,
          status: true,
          error: true,
          scheduledAt: true,
          createdAt: true,
          series: { select: { name: true, user: { select: { email: true } } } },
        },
      });
      return { ok: true as const, videos };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, videos: [] };
    }
  });

export const getAdminSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    return { ok: true as const, settings: await readAppSettings() };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

export const updateAdminSettings = createServerFn({ method: "POST" })
  .inputValidator(settingsSchema)
  .handler(async ({ data }) => {
    try {
      const admin = await requireAdmin();
      const settings = mergeAppSettings(data);
      await writeAppSettings(settings, admin.id);
      return { ok: true as const, settings };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const getProviderHealth = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    const check = (name: string, value?: string | null, required = false) => ({
      name,
      configured: Boolean(value && String(value).trim()),
      required,
    });
    return {
      ok: true as const,
      providers: [
        check("Database", process.env.DATABASE_URL, true),
        check("WaveSpeed", process.env.WAVESPEED_API_KEY, true),
        check("ElevenLabs", process.env.ELEVENLABS_API_KEY, true),
        check("Ayrshare", process.env.AYRSHARE_API_KEY, true),
        check("YouTube Data API", process.env.YOUTUBE_API_KEY),
        check("Gemini", process.env.GEMINI_API_KEY),
        check("OpenAI", process.env.OPENAI_API_KEY),
        check("Google Cloud / Calendar", process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_PROJECT),
        check("Cron secret", process.env.SERIES_CRON_SECRET),
        check("App URL", process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN),
      ],
      adminEmailsConfigured: adminEmailsFromEnv().length > 0,
      nodeEnv: process.env.NODE_ENV || "development",
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
