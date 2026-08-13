import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie } from "@tanstack/react-start/server";
import { prisma } from "./db";
import { STUDIO_CLIP_SEC, STUDIO_VIDEO_MODELS, clipCountForDuration } from "./studio/constants";

const SESSION_COOKIE = "izent_session";

async function getUserId(): Promise<string> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  return session.userId;
}

function studioProviders() {
  return import("./studio/pipeline.server");
}

export const listStudioJobs = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const userId = await getUserId();
    const jobs = await prisma.studioJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return { ok: true as const, jobs };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, jobs: [] as any[] };
  }
});

export const getStudioJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const job = await prisma.studioJob.findFirst({
        where: { id: data.jobId, userId },
      });
      if (!job) return { ok: false as const, error: "Job not found" };
      return { ok: true as const, job };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const createStudioJob = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      prompt: z.string().min(8).max(8000),
      script: z.string().max(20000).optional().nullable(),
      durationSec: z.number().int().min(1).max(900),
      aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
      videoModel: z.string().min(3).max(200),
      referenceImageUrl: z.string().max(2000).optional().nullable(),
      title: z.string().max(120).optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const modelOk = STUDIO_VIDEO_MODELS.some((m) => m.id === data.videoModel);
      const videoModel = modelOk
        ? data.videoModel
        : STUDIO_VIDEO_MODELS[0].id;

      const job = await prisma.studioJob.create({
        data: {
          userId,
          title: data.title || data.prompt.slice(0, 80),
          prompt: data.prompt.trim(),
          script: data.script?.trim() || null,
          durationSec: data.durationSec,
          aspectRatio: data.aspectRatio,
          videoModel,
          referenceImageUrl: data.referenceImageUrl || null,
          status: "queued",
          progress: 0,
          progressNote: `Queued · ~${clipCountForDuration(data.durationSec)} clips × ${STUDIO_CLIP_SEC}s`,
        },
      });

      // Fire-and-forget — long jobs poll via getStudioJob
      void studioProviders()
        .then(({ runStudioJob }) => runStudioJob(job.id))
        .catch((e) => console.error("Studio job background error:", e));

      return { ok: true as const, job };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const deleteStudioJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      const existing = await prisma.studioJob.findFirst({
        where: { id: data.jobId, userId },
      });
      if (!existing) return { ok: false as const, error: "Not found" };
      await prisma.studioJob.delete({ where: { id: data.jobId } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const uploadStudioReference = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      dataUrl: z.string().min(20).max(15_000_000),
      fileName: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await getUserId();
      const m = data.dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
      if (!m) return { ok: false as const, error: "Invalid image data" };
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 10 * 1024 * 1024) {
        return { ok: false as const, error: "Image must be under 10MB" };
      }
      const ext = m[1].includes("png") ? "png" : "jpg";
      const { saveUploadBuffer } = await import("./series/providers.server");
      const saved = await saveUploadBuffer(buf, ext, "studio-refs");
      return { ok: true as const, url: saved.publicUrl };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
