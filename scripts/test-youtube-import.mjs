/**
 * Smoke-test YouTube → transcript → WaveSpeed review for Create Series.
 * Usage: node --env-file=.env scripts/test-youtube-import.mjs [url]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

// Compile/load TS helpers via a tiny inline reimplementation that mirrors production,
// then call WaveSpeed the same way providers do.
const url =
  process.argv[2] ||
  "https://youtube.com/shorts/XuW374jZQCQ?si=jEn0RKXtXvFukdw2";

function parseYouTubeVideoId(raw) {
  const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0];
  if (host.endsWith("youtube.com")) {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const parts = u.pathname.split("/").filter(Boolean);
    if (["shorts", "live", "embed"].includes(parts[0])) return parts[1] || null;
  }
  return null;
}

function captionsFileToTranscript(raw) {
  let text = raw.replace(/^\uFEFF/, "");
  text = text.replace(/^WEBVTT[^\n]*\n+/i, "");
  text = text.replace(/^(NOTE|STYLE|REGION)[\s\S]*?(?=\n\n|\n\d|$)/gim, "");
  text = text.replace(
    /\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[\.,]\d{3}[^\n]*/g,
    "",
  );
  text = text.replace(/\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}[^\n]*/g, "");
  text = text.replace(/^\d+\s*$/gm, "");
  text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "");
  text = text.replace(/<\/?c[^>]*>/g, "");
  text = text.replace(/<\/?[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((l) => !/^(Kind|Language):/i.test(l));
  const parts = [];
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
  const merged = [];
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

function trimTranscriptForDuration(transcript, durationSec) {
  const words = transcript.split(/\s+/).filter(Boolean);
  const maxWords = Math.max(40, Math.min(words.length, Math.round(durationSec * 2.6)));
  if (words.length <= maxWords) return transcript;
  return words.slice(0, maxWords).join(" ").trim();
}

async function extract() {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) throw new Error("Invalid URL");
  const ytDlp = join(root, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  const tempDir = mkdtempSync(join(tmpdir(), "izent-yt-smoketest-"));
  try {
    const args = [
      `https://www.youtube.com/watch?v=${videoId}`,
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
      "--js-runtimes",
      `node:${process.execPath}`,
      "--extractor-args",
      "youtube:player_client=android,tv,ios",
      "--write-info-json",
    ];
    let stderr = "";
    try {
      const r = await execFileAsync(ytDlp, args, {
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
        cwd: tempDir,
      });
      stderr = r.stderr || "";
    } catch (e) {
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(tempDir);
      stderr = String(e.stderr || e.message || "");
      if (!files.some((f) => f.endsWith(".vtt"))) {
        throw new Error(`yt-dlp failed: ${stderr.slice(0, 500)}`);
      }
    }
    const { readdirSync } = await import("node:fs");
    const all = readdirSync(tempDir);
    const files = all.filter((f) => f.endsWith(".vtt"));
    files.sort((a, b) => {
      const score = (f) =>
        f.endsWith(".en.vtt") ? 0 : f.includes("en-orig") ? 1 : 5;
      return score(a) - score(b);
    });
    if (!files.length) {
      throw new Error(
        `No VTT files in ${tempDir}. dir=${all.join(",") || "(empty)"} stderr=${stderr.slice(0, 400)}`,
      );
    }
    const raw = readFileSync(join(tempDir, files[0]), "utf8");
    const transcript = captionsFileToTranscript(raw);
    let title = "Unknown";
    let channel = null;
    const infoFile = all.find((f) => f.endsWith(".info.json"));
    if (infoFile) {
      try {
        const info = JSON.parse(readFileSync(join(tempDir, infoFile), "utf8"));
        title = info.title || title;
        channel = info.channel || info.uploader || null;
      } catch {
        // ignore
      }
    }
    return {
      videoId,
      title,
      channel,
      subFile: files[0],
      transcript,
      wordCount: transcript.split(/\s+/).length,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function reviewWithWaveSpeed(extracted) {
  const key = process.env.WAVESPEED_API_KEY;
  if (!key) throw new Error("WAVESPEED_API_KEY missing");

  // Load niche presets from constants via a light regex parse of the TS file
  const constantsPath = join(root, "src/lib/series/constants.ts");
  const src = readFileSync(constantsPath, "utf8");
  const nicheIds = [...src.matchAll(/id:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((id) =>
      [
        "scary-stories",
        "history",
        "life-hack",
        "psychology-facts",
        "mind-blowing-fact",
        "ai-future-tech",
      ].includes(id) || true,
    )
    .slice(0, 40);

  const niches = nicheIds.map((id) => `- ${id}`).join("\n");
  const durationSec = 30;
  const trimmed = trimTranscriptForDuration(extracted.transcript, durationSec);

  const system = `You adapt YouTube transcripts into faceless short-form narration scripts.
Return STRICT JSON:
{"nicheId":"preset-id-or-null","nicheLabel":"...","needsEdit":true|false,"editNotes":"...","suggestedTitle":"...","finalScript":"..."}
Rules:
- Pick the best matching nicheId from the provided preset list, or null if none fit.
- needsEdit=true if rewriting is needed for faceless narration.
- finalScript: spoken narration for ~${durationSec}s, standalone, no subscribe/part 2.
- Keep the core idea from the source.`;

  const user = `Source title: ${extracted.title}
Target duration: ~${durationSec}s
Preset niches:
${niches}

Transcript:
${trimmed.slice(0, 12000)}`;

  const model = process.env.WAVESPEED_LLM_MODEL || "openai/gpt-5.4-mini";
  const endpoint = "https://llm.wavespeed.ai/v1";

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`WaveSpeed ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { raw: text };
  }
  return { trimmed, reviewed: parsed, model };
}

const out = { url, ok: false };
try {
  console.log("1) Extracting captions…", url);
  const extracted = await extract();
  out.extract = {
    videoId: extracted.videoId,
    title: extracted.title,
    channel: extracted.channel,
    subFile: extracted.subFile,
    wordCount: extracted.wordCount,
    transcriptPreview: extracted.transcript.slice(0, 280),
  };
  console.log("   title:", extracted.title);
  console.log("   words:", extracted.wordCount);
  console.log("   preview:", extracted.transcript.slice(0, 200));

  console.log("2) WaveSpeed review…");
  const { trimmed, reviewed, model } = await reviewWithWaveSpeed(extracted);
  out.review = {
    model,
    trimmedWords: trimmed.split(/\s+/).length,
    nicheId: reviewed.nicheId,
    nicheLabel: reviewed.nicheLabel,
    needsEdit: reviewed.needsEdit,
    editNotes: reviewed.editNotes,
    suggestedTitle: reviewed.suggestedTitle,
    finalScriptPreview: String(reviewed.finalScript || "").slice(0, 280),
    finalScriptWords: String(reviewed.finalScript || "")
      .split(/\s+/)
      .filter(Boolean).length,
  };
  console.log("   niche:", reviewed.nicheLabel, reviewed.nicheId);
  console.log("   needsEdit:", reviewed.needsEdit);
  console.log("   title:", reviewed.suggestedTitle);
  console.log("   script words:", out.review.finalScriptWords);
  out.ok = !!(reviewed.finalScript && String(reviewed.finalScript).length >= 40);
} catch (e) {
  out.error = e.message || String(e);
  console.error("FAIL:", out.error);
  process.exitCode = 1;
}

const reportPath = join(root, "scripts/youtube-import-test-result.json");
writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log(out.ok ? "\nPASS — ready to deploy" : "\nFAIL — see scripts/youtube-import-test-result.json");
console.log("Wrote", reportPath);
