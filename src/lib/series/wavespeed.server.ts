import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const BASE = "https://api.wavespeed.ai/api/v3";

function wavespeedKey(): string {
  const k = process.env.WAVESPEED_API_KEY;
  if (!k) throw new Error("WAVESPEED_API_KEY is not configured");
  return k;
}

function uploadsRoot(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

async function saveBuf(buf: Buffer, ext: string) {
  const dir = join(uploadsRoot(), "series");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(join(dir, name), buf);
  return `/api/uploads/series/${name}`;
}

export type WaveSpeedResult = {
  localUrl: string;
  remoteUrl: string;
};

async function submitPrediction(modelPath: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${modelPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wavespeedKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || (json.code && json.code !== 200)) {
    throw new Error(
      json?.message || json?.error || json?.data?.error || `WaveSpeed submit ${res.status}`,
    );
  }
  const data = json.data || json;
  const id = data.id;
  if (!id) throw new Error("WaveSpeed did not return a prediction id");
  const resultUrl = data.urls?.get || `${BASE}/predictions/${id}/result`;
  return { id, resultUrl };
}

async function pollPrediction(resultUrl: string, maxWaitMs = 360_000): Promise<string[]> {
  const deadline = Date.now() + maxWaitMs;
  let interval = 2000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(10_000, interval + 1000);

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${wavespeedKey()}` },
    });
    const json = await res.json();
    if (!res.ok || (json.code && json.code !== 200)) {
      throw new Error(json?.message || `WaveSpeed poll ${res.status}`);
    }
    const data = json.data || json;
    const status = data.status;
    if (status === "completed") {
      const outputs = data.outputs || [];
      if (!outputs.length) throw new Error("WaveSpeed completed with no outputs");
      return outputs.map((o: any) => (typeof o === "string" ? o : o?.url || o)).filter(Boolean);
    }
    if (status === "failed" || status === "cancelled" || status === "timeout") {
      throw new Error(data.error || `WaveSpeed task ${status}`);
    }
  }
  throw new Error("WaveSpeed generation timed out");
}

async function downloadToLocal(remoteUrl: string, extHint = "bin"): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`Failed to download WaveSpeed output: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "";
  const ext = ct.includes("mp4")
    ? "mp4"
    : ct.includes("webm")
      ? "webm"
      : ct.includes("jpeg") || ct.includes("jpg")
        ? "jpg"
        : ct.includes("png") || extHint === "png"
          ? "png"
          : extHint;
  return saveBuf(buf, ext);
}

const LLM_BASE = "https://llm.wavespeed.ai/v1";

/** OpenAI-compatible chat via WaveSpeed LLM (default: openai/gpt-5.4-mini). */
export async function waveSpeedChatCompletion(input: {
  system: string;
  user: string;
  temperature?: number;
  json?: boolean;
  model?: string;
}): Promise<string> {
  const model =
    input.model ||
    process.env.WAVESPEED_LLM_MODEL ||
    "openai/gpt-5.4-mini";
  const body: Record<string, unknown> = {
    model,
    temperature: input.temperature ?? 0.9,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
  };
  if (input.json !== false) {
    body.response_format = { type: "json_object" };
  }

  // Single attempt only — do not retry on failure (avoids wasting WaveSpeed LLM tokens)
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wavespeedKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      json?.error?.message || json?.message || `WaveSpeed LLM ${res.status}`,
    );
  }
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("WaveSpeed LLM returned empty content");
  }
  return text;
}

async function toWaveSpeedImageInput(imageUrl: string): Promise<string> {
  // Already a public HTTPS URL — use directly
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  // Local upload → data URI (WaveSpeed accepts these for many models)
  let buf: Buffer;
  if (imageUrl.startsWith("/api/uploads/")) {
    buf = await readFile(join(uploadsRoot(), imageUrl.replace("/api/uploads/", "")));
  } else if (imageUrl.startsWith("/series/") || imageUrl.startsWith("/")) {
    const rel = imageUrl.replace(/^\/public\//, "").replace(/^\//, "");
    buf = await readFile(join(process.cwd(), "public", rel));
  } else {
    buf = await readFile(imageUrl);
  }
  const mime =
    imageUrl.endsWith(".jpg") || imageUrl.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Text-to-image via WaveSpeed (Flux / Z-Image). Optional reference image for UGC/product. */
export async function generateWaveSpeedImage(
  prompt: string,
  aspectRatio: "9:16" | "16:9" = "9:16",
  referenceImageUrl?: string | null,
): Promise<WaveSpeedResult> {
  const model =
    process.env.WAVESPEED_IMAGE_MODEL || "wavespeed-ai/flux-dev";
  const size = aspectRatio === "16:9" ? "1280*720" : "720*1280";

  const body: Record<string, unknown> = {
    prompt,
    size,
    aspect_ratio: aspectRatio,
    enable_sync_mode: false,
  };

  if (referenceImageUrl) {
    try {
      body.image = await toWaveSpeedImageInput(referenceImageUrl);
      body.strength = 0.65;
    } catch (e) {
      console.warn("WaveSpeed reference image skipped:", (e as Error).message);
    }
  }

  const { resultUrl } = await submitPrediction(model, body);

  const outputs = await pollPrediction(resultUrl, 180_000);
  const remoteUrl = outputs[0];
  const localUrl = await downloadToLocal(remoteUrl, "png");
  return { localUrl, remoteUrl };
}

/**
 * Image-to-video via WaveSpeed.
 * modelPath examples:
 *  - google/veo3.1/image-to-video
 *  - kwaivgi/kling-v3.0-std/image-to-video
 *  - bytedance/seedance-v1-pro-fast/image-to-video
 */
export async function generateWaveSpeedVideo(input: {
  imageUrl: string;
  /** Optional remote HTTPS URL preferred over local path */
  remoteImageUrl?: string | null;
  prompt: string;
  modelPath: string;
  durationSec: number;
  aspectRatio?: "9:16" | "16:9";
}): Promise<WaveSpeedResult> {
  const image =
    input.remoteImageUrl &&
    (input.remoteImageUrl.startsWith("http://") || input.remoteImageUrl.startsWith("https://"))
      ? input.remoteImageUrl
      : await toWaveSpeedImageInput(input.imageUrl);

  const duration = [4, 5, 6, 8, 10].reduce((best, n) =>
    Math.abs(n - input.durationSec) < Math.abs(best - input.durationSec) ? n : best,
  5);

  const aspectRatio = input.aspectRatio || "9:16";
  const body: Record<string, unknown> = {
    prompt: input.prompt.slice(0, 2000),
    image,
    aspect_ratio: aspectRatio,
    duration,
  };

  // Veo-specific knobs
  if (input.modelPath.includes("veo")) {
    body.duration = [4, 6, 8].reduce((best, n) =>
      Math.abs(n - input.durationSec) < Math.abs(best - input.durationSec) ? n : best,
    6);
    body.resolution = "720p";
    body.generate_audio = false;
  }

  const { resultUrl } = await submitPrediction(input.modelPath, body);
  const outputs = await pollPrediction(resultUrl, 420_000);
  const remoteUrl = outputs[0];
  const localUrl = await downloadToLocal(remoteUrl, "mp4");
  return { localUrl, remoteUrl };
}
