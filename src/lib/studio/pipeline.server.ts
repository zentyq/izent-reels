import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import { prisma } from "../db";
import { STUDIO_CLIP_SEC, clipCountForDuration } from "./constants";

function uploadsRoot() {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

async function saveStudioBuf(buf: Buffer, ext: string) {
  const dir = join(uploadsRoot(), "studio");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(join(dir, name), buf);
  return `/api/uploads/studio/${name}`;
}

async function resolveLocalPath(publicUrl: string): Promise<string> {
  if (publicUrl.startsWith("/api/uploads/")) {
    return join(uploadsRoot(), publicUrl.replace("/api/uploads/", ""));
  }
  if (publicUrl.startsWith("http")) {
    const res = await fetch(publicUrl);
    if (!res.ok) throw new Error(`Download failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = publicUrl.includes(".mp4") ? "mp4" : "png";
    const local = await saveStudioBuf(buf, ext);
    return join(uploadsRoot(), local.replace("/api/uploads/", ""));
  }
  return publicUrl;
}

async function updateJob(
  jobId: string,
  data: {
    status?: string;
    progress?: number;
    progressNote?: string | null;
    styleBible?: string | null;
    clipUrls?: string[];
    mediaUrl?: string | null;
    thumbnailUrl?: string | null;
    error?: string | null;
    title?: string | null;
  },
) {
  await prisma.studioJob.update({ where: { id: jobId }, data });
}

type ScenePlan = {
  title: string;
  styleBible: string;
  scenes: Array<{ prompt: string; narration?: string }>;
};

async function planScenes(input: {
  prompt: string;
  script?: string | null;
  durationSec: number;
  aspectRatio: string;
  sceneCount: number;
}): Promise<ScenePlan> {
  const system = `You are a long-form AI video director. Return STRICT JSON only:
{"title":"...","styleBible":"...","scenes":[{"prompt":"...","narration":"..."}]}
styleBible: 2–4 sentences locking character appearance, wardrobe, lighting, color grade, camera language — MUST stay identical across every scene.
scenes: exactly ${input.sceneCount} items. Each prompt is ONE cinematic shot for ${input.aspectRatio} image-to-video (no text/watermarks). Continuity: same people/places; advance the story beat by beat.
narration: optional short line for that beat.`;

  const user = `Target length ~${input.durationSec}s (${input.sceneCount} × ~${STUDIO_CLIP_SEC}s clips).
User prompt:
${input.prompt}
${input.script ? `\nFull script / dialogue:\n${input.script}\n` : ""}
Plan ${input.sceneCount} continuous scenes with locked visual consistency.`;

  const { waveSpeedChatCompletion } = await import("../series/wavespeed.server");
  try {
    const text = await waveSpeedChatCompletion({
      system,
      user,
      temperature: 0.85,
      json: true,
    });
    return normalizePlan(text, input);
  } catch (e) {
    console.warn("Studio WaveSpeed plan failed:", (e as Error).message);
  }

  // Fallback without LLM
  const styleBible = `Consistent cinematic look for: ${input.prompt.slice(0, 200)}. Same characters, wardrobe, lighting, and color grade in every shot.`;
  const scenes = Array.from({ length: input.sceneCount }, (_, i) => ({
    prompt: `${input.prompt}. Shot ${i + 1}/${input.sceneCount}, continuous story, ${styleBible}`,
  }));
  return { title: input.prompt.slice(0, 60), styleBible, scenes };
}

function normalizePlan(text: string, input: { sceneCount: number; prompt: string }): ScenePlan {
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  const styleBible = String(
    parsed.styleBible ||
      `Locked character & style for: ${input.prompt.slice(0, 160)}. Same faces, wardrobe, lighting, color.`,
  );
  let scenes = Array.isArray(parsed.scenes)
    ? parsed.scenes.map((s: any) => ({
        prompt: String(s.prompt || s),
        narration: s.narration ? String(s.narration) : undefined,
      }))
    : [];
  scenes = scenes.filter((s: { prompt: string }) => s.prompt.trim());
  while (scenes.length < input.sceneCount) {
    scenes.push({
      prompt: `${input.prompt}. Next continuous beat ${scenes.length + 1}. ${styleBible}`,
    });
  }
  return {
    title: String(parsed.title || input.prompt).slice(0, 120),
    styleBible,
    scenes: scenes.slice(0, input.sceneCount),
  };
}

async function extractLastFrame(videoPublicUrl: string): Promise<string> {
  const { resolveFfmpegPath } = await import("../ffmpeg-path.server");
  const ffmpegPath = await resolveFfmpegPath();
  const videoPath = await resolveLocalPath(videoPublicUrl);
  const dir = await mkdtemp(join(tmpdir(), "forge-frame-"));
  const outPath = join(dir, "last.jpg");
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        ffmpegPath,
        ["-y", "-sseof", "-0.35", "-i", videoPath, "-frames:v", "1", "-q:v", "2", outPath],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      p.stderr?.on("data", (d) => {
        err += d.toString();
      });
      p.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`frame extract failed: ${err.slice(-400)}`)),
      );
    });
    return await saveStudioBuf(await readFile(outPath), "jpg");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function concatVideos(clipUrls: string[]): Promise<string> {
  if (clipUrls.length === 1) return clipUrls[0];
  const { resolveFfmpegPath } = await import("../ffmpeg-path.server");
  const ffmpegPath = await resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "forge-merge-"));
  const listPath = join(dir, "list.txt");
  const outPath = join(dir, "final.mp4");
  try {
    const lines: string[] = [];
    for (let i = 0; i < clipUrls.length; i++) {
      const src = await resolveLocalPath(clipUrls[i]);
      const copy = join(dir, `c${i}.mp4`);
      await writeFile(copy, await readFile(src));
      lines.push(`file '${copy.replace(/\\/g, "/")}'`);
    }
    await writeFile(listPath, lines.join("\n"));

    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        ffmpegPath,
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          outPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      p.stderr?.on("data", (d) => {
        err += d.toString();
      });
      p.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg merge failed: ${err.slice(-800)}`)),
      );
    });
    return await saveStudioBuf(await readFile(outPath), "mp4");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Generate a long video: plan scenes → consistent image→video clips → FFmpeg merge.
 */
export async function runStudioJob(jobId: string) {
  const job = await prisma.studioJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found");

  await updateJob(jobId, {
    status: "planning",
    progress: 2,
    progressNote: "Planning scenes & locking character style…",
    error: null,
  });

  try {
    const aspect = (job.aspectRatio === "9:16" ? "9:16" : "16:9") as "9:16" | "16:9";
    const sceneCount = clipCountForDuration(job.durationSec);
    const plan = await planScenes({
      prompt: job.prompt,
      script: job.script,
      durationSec: job.durationSec,
      aspectRatio: aspect,
      sceneCount,
    });

    await updateJob(jobId, {
      status: "generating",
      progress: 8,
      progressNote: `Style locked · ${plan.scenes.length} clips`,
      styleBible: plan.styleBible,
      title: plan.title,
    });

    const { generateWaveSpeedImage } = await import("../series/wavespeed.server");
    const { generateMotionVideo } = await import("../series/providers.server");

    const clipUrls: string[] = [];
    let prevFrame: string | null = job.referenceImageUrl || null;
    let prevRemote: string | null = null;

    for (let i = 0; i < plan.scenes.length; i++) {
      const scene = plan.scenes[i];
      const pct = 10 + Math.round((i / plan.scenes.length) * 75);
      await updateJob(jobId, {
        progress: pct,
        progressNote: `Clip ${i + 1}/${plan.scenes.length} — image + motion`,
      });

      const imagePrompt = `${scene.prompt}

STYLE LOCK (must match exactly): ${plan.styleBible}
Cinematic still for image-to-video, ${aspect}, no text, no watermark.`;

      const img = await generateWaveSpeedImage(imagePrompt, aspect, prevFrame);
      const motionPrompt = `${scene.prompt}. Subtle cinematic camera motion. ${plan.styleBible}`;
      // Try preferred model, then other video platforms until one succeeds
      const motionUrl = await generateMotionVideo({
        imageUrl: img.localUrl,
        remoteImageUrl: img.remoteUrl,
        prompt: motionPrompt,
        model: job.videoModel,
        durationSec: STUDIO_CLIP_SEC,
        aspectRatio: aspect,
      });

      clipUrls.push(motionUrl);
      await updateJob(jobId, { clipUrls: [...clipUrls] });

      try {
        prevFrame = await extractLastFrame(motionUrl);
        prevRemote = null;
      } catch {
        prevFrame = img.localUrl;
        prevRemote = img.remoteUrl;
      }
      void prevRemote;
    }

    await updateJob(jobId, {
      progress: 90,
      progressNote: "Merging clips with FFmpeg…",
      status: "merging",
    });

    const mediaUrl = await concatVideos(clipUrls);
    let thumbnailUrl: string | null = null;
    try {
      thumbnailUrl = await extractLastFrame(clipUrls[0] || mediaUrl);
    } catch {
      thumbnailUrl = null;
    }

    await updateJob(jobId, {
      status: "ready",
      progress: 100,
      progressNote: "Ready to download",
      mediaUrl,
      thumbnailUrl,
      clipUrls,
      error: null,
    });
  } catch (e) {
    console.error("Studio job failed:", e);
    await updateJob(jobId, {
      status: "failed",
      progressNote: "Failed",
      error: (e as Error).message,
    });
    throw e;
  }
}
