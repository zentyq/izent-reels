import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export async function saveUploadBuffer(
  buf: Buffer,
  ext: string,
  subdir = "series",
): Promise<{ path: string; publicUrl: string }> {
  const dir = join(process.cwd(), "uploads", subdir);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const path = join(dir, name);
  await writeFile(path, buf);
  return { path, publicUrl: `/api/uploads/${subdir}/${name}` };
}

function contentModeSystemHint(mode: string): string {
  switch (mode) {
    case "ugc":
      return `You write UGC / creator-style scripts. Tone is casual, authentic, first-person or host-style. Hook early. Include a soft product/habit CTA when relevant.`;
    case "commercial":
      return `You write commercial / ad scripts. Structure: hook → problem → product benefit → proof → clear CTA. Punchy lines, premium brand voice.`;
    default:
      return `You write narrated faceless video scripts. Conversational storytelling with a strong curiosity hook.`;
  }
}

/** Script + caption (+ long-form description) via Gemini, falling back to ChatGPT. */
export async function generateScriptContent(input: {
  niche: string;
  exampleScript?: string | null;
  durationSec: number;
  artStyle: string;
  youtubeBrief?: string | null;
  contentMode?: string | null;
  videoFormat?: string | null;
}): Promise<{
  title: string;
  script: string;
  caption: string;
  description: string;
  imagePrompt: string;
  scenePrompts: string[];
  thumbnailPrompt: string;
}> {
  const { sceneCountForDuration, aspectForFormat } = await import("./constants");
  const format = input.videoFormat || "short";
  const aspect = aspectForFormat(format);
  const sceneCount = sceneCountForDuration(input.durationSec, format);
  const mode = input.contentMode || "faceless";
  const isLong = format === "long";

  const system = `${contentModeSystemHint(mode)}
Format: ${isLong ? "LONG horizontal 16:9 YouTube/Facebook video" : "SHORT vertical 9:16 reel/Short"}.
Return STRICT JSON:
{"title":"...","script":"...","caption":"...","description":"...","imagePrompt":"...","scenePrompts":["..."],"thumbnailPrompt":"..."}
title: catchy ${isLong ? "YouTube" : "Shorts"} title (max ${isLong ? 90 : 70} chars).
script: spoken narration for ~${input.durationSec}s (${isLong ? "detailed, chapter-like pacing, keep viewers watching" : "hook in first sentence"}, no stage directions).
caption: social post caption with 4-8 hashtags.
description: ${isLong ? "full YouTube/Facebook description (2–4 paragraphs + timestamps vibe + CTA + hashtags)" : "short description (1–2 sentences), can mirror caption"}.
imagePrompt: first-scene visual description (${aspect}).
scenePrompts: exactly ${sceneCount} DIFFERENT vivid scene descriptions for ${aspect} visuals in ${input.artStyle} style. Each scene MUST be a distinct moment / shot. No text/watermarks.
thumbnailPrompt: eye-catching ${aspect === "16:9" ? "16:9 YouTube thumbnail" : "9:16 cover"} composition for this episode (no platform UI chrome, bold subject, readable if text is implied in scene only — prefer no literal text).`;

  const user = `Content mode: ${mode}
Video format: ${format} (${aspect})
Niche: ${input.niche}
${input.exampleScript ? `Match this style/tone:\n${input.exampleScript}\n` : ""}
${input.youtubeBrief ? `\n=== YOUTUBE RESEARCH (use before writing) ===\n${input.youtubeBrief}\n=== END RESEARCH ===\n` : ""}
Write one unique ${isLong ? "long-form" : "viral short"} episode with ${sceneCount} distinct visual scenes.`;

  try {
    return await geminiJson(system, user, sceneCount);
  } catch (e) {
    console.warn("Gemini script failed, trying OpenAI:", (e as Error).message);
    if (!process.env.OPENAI_API_KEY) throw e;
    return await openAiJson(system, user, sceneCount);
  }
}

async function geminiJson(system: string, user: string, sceneCount: number) {
  const key = requireEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.95, responseMimeType: "application/json" },
      }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Gemini ${res.status}`);
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseScriptJson(text, sceneCount);
}

async function openAiJson(system: string, user: string, sceneCount: number) {
  const key = requireEnv("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.95,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `OpenAI ${res.status}`);
  return parseScriptJson(body?.choices?.[0]?.message?.content || "", sceneCount);
}

function parseScriptJson(text: string, sceneCount = 4) {
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  if (!parsed.script) throw new Error("AI did not return a script");
  const scenePrompts = Array.isArray(parsed.scenePrompts)
    ? parsed.scenePrompts.map((s: any) => String(s)).filter(Boolean)
    : [];
  const imagePrompt = String(parsed.imagePrompt || scenePrompts[0] || parsed.script.slice(0, 400));
  if (scenePrompts.length === 0) scenePrompts.push(imagePrompt);
  const minScenes = Math.max(3, Math.min(sceneCount, 30));
  while (scenePrompts.length < minScenes) {
    scenePrompts.push(
      `${imagePrompt}. Alternate angle / next story beat ${scenePrompts.length + 1}`,
    );
  }
  return {
    title: String(parsed.title || "Untitled").slice(0, 120),
    script: String(parsed.script),
    caption: String(parsed.caption || parsed.script.slice(0, 280)),
    description: String(
      parsed.description || parsed.caption || parsed.script.slice(0, 800),
    ),
    imagePrompt,
    scenePrompts: scenePrompts.slice(0, Math.min(48, Math.max(minScenes, sceneCount))),
    thumbnailPrompt: String(
      parsed.thumbnailPrompt ||
        `Compelling thumbnail for: ${parsed.title || imagePrompt}. Bold subject, high contrast, no UI chrome.`,
    ),
  };
}

/**
 * Generate a NEW scene image.
 * referenceImage is a product/brand/subject photo (UGC/commercial) or art-style sample —
 * never used as the final frame itself.
 */
export async function generateSceneImage(
  prompt: string,
  artStyleHint: string,
  referenceImage?: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<{ localUrl: string; remoteUrl?: string }> {
  const orientation = aspectRatio === "16:9" ? "horizontal 16:9 widescreen" : "vertical 9:16";
  const hasProductRef = Boolean(referenceImage);
  const full = hasProductRef
    ? `Create a brand-new ${orientation} scene: ${prompt}.
Art/look: ${artStyleHint}.
A REFERENCE IMAGE is attached — treat it as the product, brand asset, person, or subject to feature.
Keep that subject recognizable (colors, shape, logo, packaging, face) across the new scene.
Invent a NEW composition, camera angle, and setting. Do NOT paste or crop the reference as-is.
No text overlays, no watermarks, no logos added by you beyond what is already on the product.`
    : `Create a brand-new ${orientation} illustration for this scene: ${prompt}.
Art style to MATCH (lines, shading, colors, rendering): ${artStyleHint}.
Important: invent a NEW subject and composition for THIS scene. Do NOT copy or reuse the reference image's characters, poses, or background. No text overlays, no watermarks, no logos.`;

  const errors: string[] = [];

  // When a product/reference photo is provided, prefer multimodal models first
  if (hasProductRef) {
    try {
      const localUrl = await geminiImage(full, referenceImage, aspectRatio);
      return { localUrl };
    } catch (e1) {
      const msg = (e1 as Error).message;
      console.warn("Gemini (reference) image failed:", msg);
      errors.push(`Gemini: ${msg}`);
    }
  }

  // WaveSpeed (with optional img2img reference)
  if (process.env.WAVESPEED_API_KEY) {
    try {
      const { generateWaveSpeedImage } = await import("./wavespeed");
      const r = await generateWaveSpeedImage(full, aspectRatio, referenceImage);
      return { localUrl: r.localUrl, remoteUrl: r.remoteUrl };
    } catch (e) {
      const msg = (e as Error).message;
      console.warn("WaveSpeed image failed:", msg);
      errors.push(`WaveSpeed: ${msg}`);
    }
  }

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const localUrl = await openAiImage(full, aspectRatio);
      return { localUrl };
    } catch (e) {
      const msg = (e as Error).message;
      console.warn("OpenAI image failed:", msg);
      errors.push(`OpenAI: ${msg}`);
    }
  }

  // Gemini / Imagen (fallback path when no ref, or second try)
  if (!hasProductRef) {
    try {
      const localUrl = await geminiImage(full, referenceImage, aspectRatio);
      return { localUrl };
    } catch (e1) {
      const msg = (e1 as Error).message;
      console.warn("Gemini image failed:", msg);
      errors.push(`Gemini: ${msg}`);
    }
  }

  try {
    const localUrl = await imagenGenerate(full, aspectRatio);
    return { localUrl };
  } catch (eImagen) {
    const msg = (eImagen as Error).message;
    console.warn("Imagen failed:", msg);
    errors.push(`Imagen: ${msg}`);
  }

  throw new Error(`Scene image generation failed. ${errors.join(" | ")}`);
}

export async function generateSceneImages(
  prompts: string[],
  artStyleHint: string,
  referenceImage?: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<Array<{ localUrl: string; remoteUrl?: string }>> {
  const out: Array<{ localUrl: string; remoteUrl?: string }> = [];
  for (const prompt of prompts) {
    out.push(await generateSceneImage(prompt, artStyleHint, referenceImage, aspectRatio));
  }
  return out;
}

/** Dedicated YouTube/cover thumbnail (usually 16:9 for long-form). */
export async function generateThumbnailImage(
  prompt: string,
  artStyleHint: string,
  aspectRatio: "9:16" | "16:9" = "16:9",
): Promise<string> {
  const orientation =
    aspectRatio === "16:9"
      ? "horizontal 16:9 YouTube thumbnail (1280x720 feel)"
      : "vertical 9:16 cover thumbnail";
  const full = `Create a brand-new ${orientation} thumbnail image.
${prompt}
Art style: ${artStyleHint}.
Requirements: bold high-contrast focal subject, emotionally clickable, clean composition, NO platform UI chrome, NO watermarks, NO tiny unreadable text overlays, NO logos.`;
  const r = await generateSceneImage(full, artStyleHint, undefined, aspectRatio);
  return r.localUrl;
}

/** Grab a still frame from a finished MP4 as a thumbnail fallback. */
export async function extractFrameThumbnail(
  mediaUrl: string,
  atSec = 3,
): Promise<string> {
  const { mkdtemp, rm, writeFile, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { spawn } = await import("node:child_process");
  const ffmpegPath = (await import("ffmpeg-static")).default as string;
  const dir = await mkdtemp(join(tmpdir(), "izent-thumb-"));
  try {
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "thumb.jpg");
    await writeFile(inPath, await fetchAsBuffer(mediaUrl));
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        ffmpegPath,
        [
          "-y",
          "-ss",
          String(Math.max(0.5, atSec)),
          "-i",
          inPath,
          "-frames:v",
          "1",
          "-q:v",
          "2",
          outPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      p.stderr?.on("data", (d) => {
        err += d.toString();
      });
      p.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`frame extract failed: ${err.slice(-300)}`)),
      );
    });
    const saved = await saveUploadBuffer(await readFile(outPath), "jpg");
    return saved.publicUrl;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Build a YouTube-style thumbnail for a long (or short) video from its metadata.
 * Prefers AI image; falls back to a frame from the finished MP4 when available.
 */
export async function generateVideoThumbnail(input: {
  title?: string | null;
  description?: string | null;
  script?: string | null;
  niche?: string | null;
  artStyleHint: string;
  aspectRatio: "9:16" | "16:9";
  mediaUrl?: string | null;
  thumbnailPrompt?: string | null;
  referenceImageUrl?: string | null;
}): Promise<string> {
  const title = (input.title || "Episode").slice(0, 120);
  const desc = (input.description || input.script || "").slice(0, 400);
  const niche = input.niche || "";
  const prompt =
    input.thumbnailPrompt ||
    `Thumbnail for video titled "${title}". Niche: ${niche}. Story context: ${desc}. Make it look like a top-performing YouTube thumbnail for this exact episode.`;

  try {
    if (input.referenceImageUrl) {
      return await generateSceneImage(
        `${prompt}. Feature the attached product/brand/subject reference clearly.`,
        input.artStyleHint,
        input.referenceImageUrl,
        input.aspectRatio,
      ).then((r) => r.localUrl);
    }
    return await generateThumbnailImage(prompt, input.artStyleHint, input.aspectRatio);
  } catch (e) {
    console.warn("AI thumbnail failed:", (e as Error).message);
  }
  if (input.mediaUrl) {
    try {
      return await extractFrameThumbnail(input.mediaUrl, 5);
    } catch (e) {
      console.warn("Frame thumbnail failed:", (e as Error).message);
    }
  }
  throw new Error("Could not generate thumbnail");
}

async function geminiImage(
  prompt: string,
  styleRefPublicPath?: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<string> {
  const key = requireEnv("GEMINI_API_KEY");
  const models = [
    process.env.GEMINI_IMAGE_MODEL,
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3.1-flash-image-preview",
  ].filter(Boolean) as string[];

  const parts: any[] = [{ text: prompt }];
  if (styleRefPublicPath) {
    try {
      const buf = await fetchAsBuffer(styleRefPublicPath);
      parts.push({
        inline_data: {
          mime_type: styleRefPublicPath.endsWith(".jpg") || styleRefPublicPath.endsWith(".jpeg")
            ? "image/jpeg"
            : "image/png",
          data: buf.toString("base64"),
        },
      });
      parts[0] = {
        text: `${prompt}\n\nThe attached image is a STYLE REFERENCE only. Match its art style closely, but draw a completely different scene.`,
      };
    } catch (e) {
      console.warn("Could not load style reference:", (e as Error).message);
    }
  }

  let lastError = "no image model tried";
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: { aspectRatio },
              },
            }),
          },
        );
        const body = await res.json();
        if (!res.ok) {
          lastError = body?.error?.message || `Gemini image ${res.status}`;
          // Rate limit → wait once then retry same model
          if (String(lastError).toLowerCase().includes("quota") || res.status === 429) {
            // Free-tier limit: 0 means no point waiting — skip to next provider
            if (String(lastError).includes("limit: 0")) {
              break;
            }
            const waitMatch = String(lastError).match(/retry in ([0-9.]+)s/i);
            const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500 : 5000;
            if (attempt === 0) {
              console.warn(`Rate limited on ${model}, waiting ${Math.round(waitMs / 1000)}s...`);
              await sleep(Math.min(waitMs, 20000));
              continue;
            }
          }
          break; // try next model
        }
        const responseParts = body?.candidates?.[0]?.content?.parts || [];
        for (const p of responseParts) {
          const inline = p.inlineData || p.inline_data;
          if (inline?.data) {
            const buf = Buffer.from(inline.data, "base64");
            const ext = (inline.mimeType || inline.mime_type || "image/png").includes("jpeg")
              ? "jpg"
              : "png";
            const saved = await saveUploadBuffer(buf, ext);
            return saved.publicUrl;
          }
        }
        lastError = `Gemini model ${model} returned no image`;
        break;
      } catch (e) {
        lastError = (e as Error).message;
        break;
      }
    }
  }
  throw new Error(lastError);
}

async function imagenGenerate(
  prompt: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<string> {
  const key = requireEnv("GEMINI_API_KEY");
  const models = [
    process.env.IMAGEN_MODEL,
    "imagen-4.0-generate-001",
    "imagen-4.0-ultra-generate-001",
    "imagen-4.0-fast-generate-001",
  ].filter(Boolean) as string[];

  let lastError = "no imagen model tried";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
      },
    );
    const body = await res.json();
    if (!res.ok) {
      lastError = body?.error?.message || `Imagen ${res.status}`;
      continue;
    }
    const b64 =
      body?.predictions?.[0]?.bytesBase64Encoded ||
      body?.predictions?.[0]?.image?.bytesBase64Encoded;
    if (!b64) {
      lastError = `Imagen ${model} returned no image`;
      continue;
    }
    const saved = await saveUploadBuffer(Buffer.from(b64, "base64"), "png");
    return saved.publicUrl;
  }
  throw new Error(lastError);
}

async function openAiImage(
  prompt: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
): Promise<string> {
  const key = requireEnv("OPENAI_API_KEY");
  const models = [
    process.env.OPENAI_IMAGE_MODEL,
    "gpt-image-1",
    "dall-e-3",
  ].filter(Boolean) as string[];

  const portrait = aspectRatio === "9:16";
  let lastError = "no OpenAI image model tried";
  for (const model of models) {
    const bodyObj: Record<string, unknown> =
      model === "dall-e-3"
        ? {
            model,
            prompt: prompt.slice(0, 3500),
            size: portrait ? "1024x1792" : "1792x1024",
            n: 1,
            response_format: "b64_json",
          }
        : {
            model,
            prompt,
            size: portrait ? "1024x1536" : "1536x1024",
            n: 1,
          };

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyObj),
    });
    const body = await res.json();
    if (!res.ok) {
      lastError = body?.error?.message || `OpenAI image ${res.status}`;
      continue;
    }
    const b64 = body?.data?.[0]?.b64_json;
    if (b64) {
      const saved = await saveUploadBuffer(Buffer.from(b64, "base64"), "png");
      return saved.publicUrl;
    }
    const url = body?.data?.[0]?.url;
    if (!url) {
      lastError = `OpenAI ${model} returned no image`;
      continue;
    }
    const img = await fetch(url);
    const buf = Buffer.from(await img.arrayBuffer());
    const saved = await saveUploadBuffer(buf, "png");
    return saved.publicUrl;
  }
  throw new Error(lastError);
}

/** AI motion: WaveSpeed (Kling / Seedance / Veo) first, then Google Veo direct. */
export async function generateMotionVideo(input: {
  imageUrl: string;
  remoteImageUrl?: string | null;
  prompt: string;
  model: string;
  durationSec: number;
  aspectRatio?: "9:16" | "16:9";
}): Promise<string> {
  if (process.env.WAVESPEED_API_KEY) {
    try {
      const { generateWaveSpeedVideo } = await import("./wavespeed");
      // Map legacy Gemini model ids to WaveSpeed paths
      let modelPath = input.model;
      if (modelPath === "veo-3.1-fast-generate-preview" || modelPath === "gen4_turbo") {
        modelPath = "kwaivgi/kling-v3.0-std/image-to-video";
      } else if (modelPath === "veo-3.1-generate-preview" || modelPath === "gen4.5") {
        modelPath = "google/veo3.1/image-to-video";
      }
      const r = await generateWaveSpeedVideo({
        imageUrl: input.imageUrl,
        remoteImageUrl: input.remoteImageUrl,
        prompt: input.prompt,
        modelPath,
        durationSec: input.durationSec,
        aspectRatio: input.aspectRatio || "9:16",
      });
      return r.localUrl;
    } catch (e) {
      console.warn("WaveSpeed video failed:", (e as Error).message);
    }
  }
  return generateGoogleVideo(input);
}

/** Google Veo image-to-video via Gemini API. Returns a local upload URL. */
export async function generateGoogleVideo(input: {
  imageUrl: string;
  prompt: string;
  model: string;
  durationSec: number;
  remoteImageUrl?: string | null;
}): Promise<string> {
  const key = requireEnv("GEMINI_API_KEY");
  const model = input.model || process.env.GOOGLE_VIDEO_MODEL || "veo-3.1-fast-generate-preview";
  // Veo accepts 4, 6, or 8 seconds
  const durationSeconds = [4, 6, 8].reduce((best, n) =>
    Math.abs(n - input.durationSec) < Math.abs(best - input.durationSec) ? n : best,
  6);

  const imageBuf = await fetchAsBuffer(input.imageUrl);
  const mimeType =
    input.imageUrl.endsWith(".jpg") || input.imageUrl.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";

  const create = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt: input.prompt.slice(0, 1000),
            image: {
              bytesBase64Encoded: imageBuf.toString("base64"),
              mimeType,
            },
          },
        ],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds,
          sampleCount: 1,
          personGeneration: "allow_adult",
        },
      }),
    },
  );
  const created = await create.json();
  if (!create.ok) {
    throw new Error(
      created?.error?.message || created?.message || `Google Veo create ${create.status}`,
    );
  }

  const operationName = created.name;
  if (!operationName) throw new Error("Google Veo did not return an operation name");

  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const poll = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${encodeURIComponent(key)}`,
    );
    const op = await poll.json();
    if (!poll.ok) {
      throw new Error(op?.error?.message || `Google Veo poll ${poll.status}`);
    }
    if (op.error) {
      throw new Error(op.error.message || "Google Veo generation failed");
    }
    if (!op.done) continue;

    const samples =
      op.response?.generateVideoResponse?.generatedSamples ||
      op.response?.generatedVideos ||
      op.response?.generated_videos ||
      [];
    const sample = samples[0];
    const video = sample?.video || sample;
    const b64 =
      video?.bytesBase64Encoded ||
      video?.videoBytes ||
      op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.bytesBase64Encoded;
    if (b64) {
      const saved = await saveUploadBuffer(Buffer.from(b64, "base64"), "mp4");
      return saved.publicUrl;
    }
    const uri = video?.uri || video?.url;
    if (uri) {
      const videoRes = await fetch(uri, {
        headers: { "x-goog-api-key": key },
      });
      // Some uris need key as query param
      const buf = videoRes.ok
        ? Buffer.from(await videoRes.arrayBuffer())
        : Buffer.from(
            await (
              await fetch(
                `${uri}${uri.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`,
              )
            ).arrayBuffer(),
          );
      const saved = await saveUploadBuffer(buf, "mp4");
      return saved.publicUrl;
    }
    throw new Error("Google Veo finished but returned no video data");
  }
  throw new Error("Google Veo generation timed out");
}

/** @deprecated Prefer generateMotionVideo */
export async function generateRunwayVideo(input: {
  imageUrl: string;
  prompt: string;
  model: string;
  durationSec: number;
  remoteImageUrl?: string | null;
}): Promise<string> {
  return generateMotionVideo(input);
}

export async function generateElevenLabsSpeech(text: string, voiceId: string): Promise<string> {
  // Chunk long scripts (5–30 min) so TTS stays within API limits
  const chunks = splitTextForTts(text, 2200);
  if (chunks.length === 1) {
    const buf = await elevenLabsTtsBuffer(chunks[0], voiceId);
    const saved = await saveUploadBuffer(buf, "mp3");
    return saved.publicUrl;
  }

  const { mkdtemp, rm, writeFile, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { spawn } = await import("node:child_process");
  const ffmpegPath = (await import("ffmpeg-static")).default as string;
  const dir = await mkdtemp(join(tmpdir(), "izent-tts-"));
  try {
    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const buf = await elevenLabsTtsBuffer(chunks[i], voiceId);
      const p = join(dir, `part_${i}.mp3`);
      await writeFile(p, buf);
      parts.push(p);
    }
    const listPath = join(dir, "list.txt");
    await writeFile(
      listPath,
      parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );
    const outPath = join(dir, "voice.mp3");
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        ffmpegPath,
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      p.stderr?.on("data", (d) => {
        err += d.toString();
      });
      p.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`TTS concat failed: ${err.slice(-400)}`)),
      );
    });
    const saved = await saveUploadBuffer(await readFile(outPath), "mp3");
    return saved.publicUrl;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function splitTextForTts(text: string, maxLen: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return [cleaned];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > maxLen && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
  }
  if (cur) chunks.push(cur.trim());
  // Hard-split any oversized leftovers
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxLen) out.push(c);
    else {
      for (let i = 0; i < c.length; i += maxLen) out.push(c.slice(i, i + maxLen));
    }
  }
  return out.length ? out : [cleaned.slice(0, maxLen)];
}

async function elevenLabsTtsBuffer(text: string, voiceId: string): Promise<Buffer> {
  const key = requireEnv("ELEVENLABS_API_KEY");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2",
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    let message = err;
    try {
      const parsed = JSON.parse(err);
      message = parsed?.detail?.message || parsed?.message || err;
      if (parsed?.detail?.status === "missing_permissions") {
        message = `${message} Create a new ElevenLabs API key with Text to Speech enabled, then update ELEVENLABS_API_KEY and restart the server.`;
      }
    } catch {}
    throw new Error(`ElevenLabs TTS failed: ${message}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function generateElevenLabsMusic(prompt: string, lengthMs: number): Promise<string> {
  const buf = await elevenLabsMusicBuffer(prompt, lengthMs);
  const saved = await saveUploadBuffer(buf, "mp3");
  return saved.publicUrl;
}

async function elevenLabsMusicBuffer(prompt: string, lengthMs: number): Promise<Buffer> {
  const key = requireEnv("ELEVENLABS_API_KEY");
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: Math.min(600000, Math.max(3000, lengthMs)),
      model_id: process.env.ELEVENLABS_MUSIC_MODEL || "music_v1",
    }),
  });
  if (!res.ok) {
    // Fallback: sound generation API (often available on more plans)
    const sfx = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: Math.min(22, Math.max(3, lengthMs / 1000)),
      }),
    });
    if (!sfx.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs music failed: ${err}`);
    }
    return Buffer.from(await sfx.arrayBuffer());
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Short voice sample for UI preview (base64 mp3). */
export async function previewVoiceSample(voiceId: string): Promise<string> {
  const buf = await elevenLabsTtsBuffer(
    "This is how your series narration will sound. Ready for the next viral clip?",
    voiceId,
  );
  return buf.toString("base64");
}

/** Short music/sfx sample for UI preview (base64 mp3). */
export async function previewMusicSample(prompt: string): Promise<string> {
  const buf = await elevenLabsMusicBuffer(prompt, 8000);
  return buf.toString("base64");
}

type SubtitleCue = { start: number; end: number; text: string };

/** Split spoken script into timed on-screen subtitle cues. */
export function splitScriptIntoSubtitleCues(
  script: string,
  durationSec: number,
): SubtitleCue[] {
  const cleaned = script.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const wordsPerCue = 4;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const phrases: string[] = [];
  for (const sentence of sentences.length ? sentences : [cleaned]) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += wordsPerCue) {
      phrases.push(words.slice(i, i + wordsPerCue).join(" "));
    }
  }
  if (!phrases.length) phrases.push(cleaned.slice(0, 48));

  const duration = Math.max(5, durationSec);
  const leadIn = 0.12;
  const usable = Math.max(1, duration - leadIn - 0.15);
  const totalWeight = phrases.reduce((sum, p) => sum + Math.max(3, p.length), 0);

  let t = leadIn;
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < phrases.length; i++) {
    const weight = Math.max(3, phrases[i].length) / totalWeight;
    const len = Math.max(0.7, usable * weight);
    const end = i === phrases.length - 1 ? duration : Math.min(duration, t + len);
    cues.push({ start: t, end, text: phrases[i] });
    t = end;
  }
  return cues;
}

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assStylePrimary(style: string): { primary: string; outline: string; back: string; size: number; border: number } {
  // ASS colors are &HAABBGGRR
  switch (style) {
    case "red-highlight":
      return { primary: "&H000000FF", outline: "&H00000000", back: "&H80000000", size: 52, border: 4 };
    case "karaoke":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&HE08B3AED", size: 48, border: 0 };
    case "sleek":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000", size: 44, border: 2 };
    case "elegant":
      return { primary: "&H00FFFFFF", outline: "&H64000000", back: "&H80000000", size: 40, border: 2 };
    case "clarity":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H90000000", size: 38, border: 0 };
    case "beast":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000", size: 58, border: 5 };
    case "pixel":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000", size: 42, border: 2 };
    case "majestic":
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000", size: 50, border: 4 };
    case "bold-stroke":
    default:
      return { primary: "&H00FFFFFF", outline: "&H00000000", back: "&H80000000", size: 52, border: 5 };
  }
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

async function writeAssSubtitles(
  dir: string,
  cues: SubtitleCue[],
  captionStyle: string,
  width = 720,
  height = 1280,
): Promise<string> {
  const s = assStylePrimary(captionStyle);
  const box = captionStyle === "karaoke" || captionStyle === "clarity" ? 3 : 1; // 1=outline, 3=opaque box
  const fontSize = width >= 1280 ? Math.round(s.size * 0.85) : s.size;
  const marginV = Math.round(height * 0.12);
  const assPath = join(dir, "subs.ass");
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${s.primary},&H000000FF,${s.outline},${s.back},-1,0,0,0,100,100,0,0,${box},${s.border},1,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${escapeAssText(c.text)}`,
    )
    .join("\n");
  await writeFile(assPath, `${header}${events}\n`, "utf8");
  return assPath;
}

/** Burn timed subtitles onto a labeled video stream (ASS via libass). */
async function appendSubtitleFilters(
  filters: string[],
  inputLabel: string,
  outputLabel: string,
  cues: SubtitleCue[],
  captionStyle: string,
  dir: string,
  width = 720,
  height = 1280,
) {
  if (!cues.length) {
    filters.push(`[${inputLabel}]copy[${outputLabel}]`);
    return;
  }
  const assPath = await writeAssSubtitles(dir, cues, captionStyle, width, height);
  // Relative path — absolute Windows paths break ass=/subtitles= on the drive colon
  const assName = assPath.split(/[/\\]/).pop() || "subs.ass";
  filters.push(`[${inputLabel}]ass=${assName}[${outputLabel}]`);
}

async function runFfmpegAssemble(opts: {
  inputs: Array<{ path: string; inputOptions?: string[] }>;
  filters: string[];
  outPath: string;
  duration: number;
  dir: string;
}) {
  const { spawn } = await import("node:child_process");
  const ffmpegPath = (await import("ffmpeg-static")).default as string;

  // Prefer inline filter_complex via spawn (avoids fluent-ffmpeg Windows quoting bugs)
  const filterComplex = opts.filters.join(";");

  const args: string[] = ["-y"];
  for (const inp of opts.inputs) {
    if (inp.inputOptions?.length) args.push(...inp.inputOptions);
    args.push("-i", inp.path);
  }
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    String(opts.duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    opts.outPath,
  );

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpegPath, args, {
      cwd: opts.dir,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr?.on("data", (d) => {
      err += d.toString();
    });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-1500)}`));
    });
  });
}

export type SceneClip = { kind: "image" | "video"; url: string };

export async function assembleReel(input: {
  /** Preferred: ordered scene clips (image and/or real AI video) merged with FFmpeg */
  sceneClips?: SceneClip[];
  /** Legacy: image URLs only */
  sceneUrls?: string[];
  visualUrl?: string;
  isVideo?: boolean;
  voiceUrl: string;
  musicUrl?: string | null;
  /** Spoken narration — burned in as timed subtitles */
  script: string;
  captionStyle: string;
  glitch?: boolean;
  targetDurationSec: number;
  /** short 9:16 or long 16:9 */
  aspectRatio?: "9:16" | "16:9";
}): Promise<string> {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const dir = await mkdtemp(join(tmpdir(), "izent-series-"));
  try {
    const voicePath = join(dir, "voice.mp3");
    const musicPath = join(dir, "music.mp3");
    const outPath = join(dir, "out.mp4");
    // Short up to 5min; long up to 30min
    const maxDur = input.aspectRatio === "16:9" ? 1800 : 300;
    const duration = Math.max(5, Math.min(maxDur, input.targetDurationSec));
    const cues = splitScriptIntoSubtitleCues(input.script, duration);
    const width = input.aspectRatio === "16:9" ? 1280 : 720;
    const height = input.aspectRatio === "16:9" ? 720 : 1280;

    await writeFile(voicePath, await fetchAsBuffer(input.voiceUrl));
    if (input.musicUrl) {
      await writeFile(musicPath, await fetchAsBuffer(input.musicUrl));
    }

    const glitch = input.glitch
      ? "rgbashift=rh=2:bh=-2,eq=contrast=1.2:saturation=1.3,"
      : "";
    const scale = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,`;

    let clips: SceneClip[] = (input.sceneClips || []).filter((c) => c?.url);
    if (!clips.length && input.sceneUrls?.length) {
      clips = input.sceneUrls.filter(Boolean).map((url) => ({ kind: "image" as const, url }));
    }
    if (!clips.length && input.visualUrl) {
      clips = [
        {
          kind: input.isVideo ? "video" : "image",
          url: input.visualUrl,
        },
      ];
    }
    if (!clips.length) throw new Error("No scene visuals to assemble");

    const n = clips.length;
    const per = Math.max(1.5, duration / n);
    const localPaths: string[] = [];
    for (let i = 0; i < n; i++) {
      const ext = clips[i].kind === "video" ? "mp4" : "png";
      const p = join(dir, `scene_${i}.${ext}`);
      await writeFile(p, await fetchAsBuffer(clips[i].url));
      localPaths.push(p);
    }

    const vLabels: string[] = [];
    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      filters.push(`[${i}:v]${glitch}${scale}fps=30,format=yuv420p[v${i}]`);
      vLabels.push(`[v${i}]`);
    }
    filters.push(`${vLabels.join("")}concat=n=${n}:v=1:a=0[vcat]`);
    await appendSubtitleFilters(
      filters,
      "vcat",
      "vout",
      cues,
      input.captionStyle,
      dir,
      width,
      height,
    );

    const voiceIdx = n;
    const musicIdx = n + 1;
    if (input.musicUrl) {
      filters.push(
        `[${voiceIdx}:a]volume=1.0[voice]`,
        `[${musicIdx}:a]aloop=loop=-1:size=2e+09,atrim=0:${duration},volume=0.22[music]`,
        `[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      );
    } else {
      filters.push(
        `[${voiceIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[aout]`,
      );
    }

    await runFfmpegAssemble({
      inputs: [
        ...localPaths.map((p, i) =>
          clips[i].kind === "video"
            ? { path: p, inputOptions: ["-stream_loop", "-1", "-t", String(per)] }
            : { path: p, inputOptions: ["-loop", "1", "-t", String(per)] },
        ),
        { path: voicePath },
        ...(input.musicUrl ? [{ path: musicPath }] : []),
      ],
      filters,
      outPath,
      duration,
      dir,
    });

    const buf = await readFile(outPath);
    const saved = await saveUploadBuffer(buf, "mp4");
    return saved.publicUrl;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/api/uploads/")) {
    const rel = url.replace("/api/uploads/", "");
    return readFile(join(process.cwd(), "uploads", rel));
  }
  if (url.startsWith("/series/") || url.startsWith("/public/")) {
    const rel = url.replace(/^\/public\//, "").replace(/^\//, "");
    return readFile(join(process.cwd(), "public", rel));
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch media: ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(url);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
