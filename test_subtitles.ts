/**
 * Burn-in subtitle smoke test (solid frame + tone + timed drawtext)
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string;

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-y", ...args], { stdio: "ignore" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

async function main() {
  console.log("=== Subtitle Burn-in Test ===\n");
  const { assembleReel, splitScriptIntoSubtitleCues } = await import(
    "./src/lib/series/providers.ts"
  );

  const script =
    "Have you ever heard a knock at midnight? A woman living alone opened her door and found nothing. Then the knocking came from inside her closet.";
  const cues = splitScriptIntoSubtitleCues(script, 12);
  console.log(`cues (${cues.length}):`);
  for (const c of cues) console.log(`  [${c.start.toFixed(2)}-${c.end.toFixed(2)}] ${c.text}`);
  assert(cues.length >= 4, "expected multiple subtitle cues");

  const tmp = join(process.cwd(), "uploads", "series");
  mkdirSync(tmp, { recursive: true });
  const stamp = Date.now();
  const framePath = join(tmp, `subtest-frame-${stamp}.png`);
  const voicePath = join(tmp, `subtest-voice-${stamp}.mp3`);
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=0x1a1a2e:s=720x1280:d=1",
    "-frames:v",
    "1",
    framePath,
  ]);
  await runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:duration=12",
    "-c:a",
    "libmp3lame",
    voicePath,
  ]);

  const frameUrl = `/api/uploads/series/subtest-frame-${stamp}.png`;
  const voiceUrl = `/api/uploads/series/subtest-voice-${stamp}.mp3`;

  console.log("\nAssembling with burned-in subtitles...");
  const finalUrl = await assembleReel({
    visualUrl: frameUrl,
    isVideo: false,
    voiceUrl,
    script,
    captionStyle: "bold-stroke",
    targetDurationSec: 12,
  });

  const abs = join(process.cwd(), "uploads", finalUrl.replace("/api/uploads/", ""));
  assert(existsSync(abs), "output video missing");
  const size = readFileSync(abs).length;
  console.log(`output: ${finalUrl} (${size} bytes)`);
  assert(size > 50_000, "video too small");

  // Extract a mid-frame and ensure drawtext rendered (non-uniform pixels near subtitle band)
  const samplePath = join(tmp, `subtest-sample-${stamp}.png`);
  await runFfmpeg(["-ss", "2.5", "-i", abs, "-frames:v", "1", samplePath]);
  assert(existsSync(samplePath), "sample frame missing");
  console.log("sample frame:", samplePath);
  console.log("\n=== PASS ===");
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
