import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const vttPath =
  process.argv[2] ||
  join(process.env.TEMP || "/tmp", "izent-yt-test4", "XuW374jZQCQ.en.vtt");

if (!existsSync(vttPath)) {
  console.error("Missing VTT:", vttPath);
  process.exit(1);
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

const vtt = readFileSync(vttPath, "utf8");
const transcript = captionsFileToTranscript(vtt);
const words = transcript.split(/\s+/).filter(Boolean);
console.log("PARSE_OK words=", words.length);
console.log("PREVIEW=", transcript.slice(0, 320));

const key = process.env.WAVESPEED_API_KEY;
if (!key) {
  console.error("WAVESPEED_API_KEY missing");
  process.exit(1);
}
const model = process.env.WAVESPEED_LLM_MODEL || "openai/gpt-5.4-mini";
const durationSec = 30;
const maxWords = Math.max(40, Math.min(words.length, Math.round(durationSec * 2.6)));
const trimmed = words.slice(0, maxWords).join(" ");

const system = `You adapt YouTube transcripts into faceless short-form narration scripts.
Return STRICT JSON:
{"nicheId":"preset-id-or-null","nicheLabel":"...","needsEdit":true|false,"editNotes":"...","suggestedTitle":"...","finalScript":"..."}
Rules:
- Pick best nicheId from: life-hack, psychology-facts, mind-blowing-fact, ai-future-tech, or null.
- needsEdit=true if rewriting needed for faceless narration.
- finalScript: ~${durationSec}s spoken narration, standalone, no subscribe/part 2.
- Keep core idea from source.`;

const user = `Source title: Change This One YouTube Setting Now!
Target duration: ~${durationSec}s
Transcript:
${trimmed}`;

const res = await fetch("https://llm.wavespeed.ai/v1/chat/completions", {
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
  console.error("WS_FAIL", res.status, JSON.stringify(body).slice(0, 400));
  process.exit(1);
}
const text = body.choices?.[0]?.message?.content;
const parsed = JSON.parse(text);
const result = {
  ok: true,
  url: "https://youtube.com/shorts/XuW374jZQCQ",
  extract: {
    title: "Change This One YouTube Setting Now!",
    wordCount: words.length,
    transcriptPreview: transcript.slice(0, 280),
    transcript,
  },
  review: {
    ...parsed,
    finalScriptWords: String(parsed.finalScript || "")
      .split(/\s+/)
      .filter(Boolean).length,
  },
};
console.log("REVIEW_OK");
console.log(
  JSON.stringify(
    {
      nicheId: parsed.nicheId,
      nicheLabel: parsed.nicheLabel,
      needsEdit: parsed.needsEdit,
      editNotes: parsed.editNotes,
      suggestedTitle: parsed.suggestedTitle,
      finalScriptWords: result.review.finalScriptWords,
      finalScriptPreview: String(parsed.finalScript || "").slice(0, 240),
    },
    null,
    2,
  ),
);
writeFileSync(
  "scripts/youtube-import-test-result.json",
  JSON.stringify(result, null, 2),
);
console.log("Wrote scripts/youtube-import-test-result.json");
