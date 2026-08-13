import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseYouTubeVideoId(url: string): string | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id?.slice(0, 20) || null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") {
        return parts[1] || null;
      }
    }
  } catch {
    const m = raw.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[&?/]|$)/);
    return m?.[1] || null;
  }
  return null;
}

function ytDlpPath(): string {
  const isWindows = process.platform === "win32";
  return join(process.cwd(), isWindows ? "yt-dlp.exe" : "yt-dlp");
}

function nodeRuntimeArg(): string[] {
  // YouTube requires a JS runtime for reliable caption/metadata extraction.
  // See https://github.com/yt-dlp/yt-dlp/issues/15012
  return ["--js-runtimes", `node:${process.execPath}`];
}

/** Strip VTT / SRT caption files down to spoken text. */
export function captionsFileToTranscript(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "");
  // Drop WEBVTT header / NOTE / STYLE / REGION blocks
  text = text.replace(/^WEBVTT[^\n]*\n+/i, "");
  text = text.replace(/^(NOTE|STYLE|REGION)[\s\S]*?(?=\n\n|\n\d|$)/gim, "");
  // Remove cue timestamps
  text = text.replace(
    /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[\.,]\d{3}[^\n]*/g,
    "",
  );
  text = text.replace(/\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}[^\n]*/g, "");
  // Remove cue numbers
  text = text.replace(/^\d+\s*$/gm, "");
  // Drop YouTube auto-caption word-timing tags: this<00:00:00.320><c> one</c>
  text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "");
  text = text.replace(/<\/?c[^>]*>/g, "");
  text = text.replace(/<\/?[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((l) => !/^(Kind|Language):/i.test(l));

  // YouTube ASR uses rolling cues — keep growing line, flush when it resets
  const parts: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }
    if (line === current) continue;
    if (line.startsWith(current)) {
      current = line;
      continue;
    }
    if (current.startsWith(line)) continue;
    parts.push(current);
    current = line;
  }
  if (current) parts.push(current);

  const merged: string[] = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(part);
      continue;
    }
    if (part.startsWith(prev)) {
      merged[merged.length - 1] = part;
      continue;
    }
    if (prev.startsWith(part)) continue;
    merged.push(part);
  }
  return merged.join(" ").replace(/\s+/g, " ").trim();
}

async function fetchYouTubeApiMeta(videoId: string): Promise<{
  title?: string;
  description?: string;
  channelTitle?: string;
} | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    const body = await res.json();
    const sn = body?.items?.[0]?.snippet;
    if (!sn) return null;
    return {
      title: sn.title,
      description: sn.description,
      channelTitle: sn.channelTitle,
    };
  } catch {
    return null;
  }
}

function englishSubScore(filename: string): number {
  const lower = filename.toLowerCase();
  // Prefer plain English / original ASR over machine-translated en-* tracks
  if (lower.endsWith(".en.vtt") || lower.endsWith(".en.srt")) return 0;
  if (lower.includes(".en-orig.")) return 1;
  if (/\.en\./.test(lower)) return 2;
  if (lower.includes(".en-") && lower.endsWith(".vtt")) return 5;
  if (lower.endsWith(".vtt")) return 8;
  return 10;
}

/**
 * Extract English captions/auto-subs + metadata from a YouTube URL (no video download).
 */
export async function extractYouTubeTranscript(input: {
  url: string;
}): Promise<{
  videoId: string;
  url: string;
  title: string;
  channelTitle: string | null;
  description: string | null;
  transcript: string;
}> {
  const videoId = parseYouTubeVideoId(input.url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const apiMeta = await fetchYouTubeApiMeta(videoId);

  const tempDir = await mkdtemp(join(tmpdir(), "izent-yt-subs-"));
  try {
    // Prefer android/tv clients for captions (fewer PO-token requirements than web/mweb).
    // Limit to plain English tracks to avoid 429s from downloading every en-* translation.
    // Use a relative -o template under cwd=tempDir (more reliable on Windows than absolute paths).
    const args = [
      watchUrl,
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-langs",
      "en,en-orig",
      "--sub-format",
      "vtt/best",
      "--convert-subs",
      "vtt",
      "-o",
      "%(id)s.%(ext)s",
      "--no-playlist",
      "--socket-timeout",
      "30",
      "--retries",
      "3",
      ...nodeRuntimeArg(),
      "--extractor-args",
      "youtube:player_client=android,tv,ios",
      // NOTE: do NOT pass --print here — recent yt-dlp skips writing subtitle
      // files when --print is used with --skip-download.
      "--write-info-json",
      "--no-clean-info-json",
    ];

    try {
      await execFileAsync(ytDlpPath(), args, {
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
        cwd: tempDir,
      });
    } catch (e: any) {
      // yt-dlp may exit non-zero after a later subtitle 429 even if en.vtt was written
      const files = await readdir(tempDir).catch(() => [] as string[]);
      const hasSubs = files.some((f) => f.endsWith(".vtt") || f.endsWith(".srt"));
      if (!hasSubs) {
        const msg = String(e?.stderr || e?.message || "yt-dlp failed");
        if (/private|unavailable|Sign in/i.test(msg)) {
          throw new Error(
            "This YouTube video is private, unavailable, or blocked (bot check). Try another URL.",
          );
        }
        if (/429|Too Many Requests/i.test(msg)) {
          throw new Error(
            "YouTube rate-limited caption download. Wait a minute and try again.",
          );
        }
        throw new Error(`Could not extract captions: ${msg.slice(0, 240)}`);
      }
    }

    let ytTitle = apiMeta?.title || "YouTube video";
    let ytChannel = apiMeta?.channelTitle || null;
    let ytDesc = apiMeta?.description || null;
    try {
      const files = await readdir(tempDir);
      const infoFile = files.find((f) => f.endsWith(".info.json"));
      if (infoFile) {
        const info = JSON.parse(await readFile(join(tempDir, infoFile), "utf8"));
        if (info?.title) ytTitle = String(info.title);
        if (info?.channel || info?.uploader) {
          ytChannel = String(info.channel || info.uploader);
        }
        if (info?.description) ytDesc = String(info.description);
      }
    } catch {
      // keep API meta fallback
    }

    const files = await readdir(tempDir);
    const subFiles = files.filter((f) => f.endsWith(".vtt") || f.endsWith(".srt"));
    subFiles.sort((a, b) => englishSubScore(a) - englishSubScore(b));

    if (!subFiles.length) {
      throw new Error(
        "No English captions/auto-captions found for this video. Try another URL with captions enabled.",
      );
    }

    const raw = await readFile(join(tempDir, subFiles[0]), "utf8");
    const transcript = captionsFileToTranscript(raw);
    if (transcript.length < 40) {
      throw new Error("Captions were too short or empty after parsing.");
    }

    return {
      videoId,
      url: watchUrl,
      title: ytTitle.slice(0, 200),
      channelTitle: ytChannel,
      description: ytDesc ? ytDesc.slice(0, 2000) : null,
      transcript: transcript.slice(0, 20_000),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Rough spoken-word trim for a target duration (words ≈ duration * 2.4). */
export function trimTranscriptForDuration(transcript: string, durationSec: number): string {
  const words = transcript.split(/\s+/).filter(Boolean);
  const maxWords = Math.max(40, Math.min(words.length, Math.round(durationSec * 2.6)));
  if (words.length <= maxWords) return transcript;
  return words.slice(0, maxWords).join(" ").trim();
}
