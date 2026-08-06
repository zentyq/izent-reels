/**
 * WaveSpeed image + Kling motion smoke test
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const key = m[1].trim();
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const { generateWaveSpeedImage, generateWaveSpeedVideo } = await import(
  "./src/lib/series/wavespeed.ts"
);
const { generateElevenLabsSpeech, assembleReel } = await import(
  "./src/lib/series/providers.ts"
);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== WaveSpeed Image + Motion Test ===\n");
  assert(process.env.WAVESPEED_API_KEY, "WAVESPEED_API_KEY missing");

  console.log("1) WaveSpeed text-to-image...");
  const img = await generateWaveSpeedImage(
    "Vertical 9:16 comic book illustration of a medieval knight discovering a glowing map in a forest, bold outlines, flat colors, no text",
  );
  console.log("   local:", img.localUrl);
  console.log("   remote:", img.remoteUrl);
  assert(existsSync(join(process.cwd(), "uploads", img.localUrl.replace("/api/uploads/", ""))));

  console.log("\n2) WaveSpeed Kling image-to-video...");
  const vid = await generateWaveSpeedVideo({
    imageUrl: img.localUrl,
    remoteImageUrl: img.remoteUrl,
    prompt: "Subtle cinematic camera push-in, leaves rustle, magical glow pulses gently",
    modelPath: "kwaivgi/kling-v3.0-std/image-to-video",
    durationSec: 5,
  });
  console.log("   local:", vid.localUrl);
  assert(existsSync(join(process.cwd(), "uploads", vid.localUrl.replace("/api/uploads/", ""))));

  if (process.env.ELEVENLABS_API_KEY) {
    console.log("\n3) Mix with voice via FFmpeg...");
    const voice = await generateElevenLabsSpeech(
      "In the heart of the forest, a forgotten map began to glow.",
      "JBFqnCBsd6RMkjVDRZzb",
    );
    const finalUrl = await assembleReel({
      visualUrl: vid.localUrl,
      isVideo: true,
      voiceUrl: voice,
      script: "The glowing map reveals a secret path through the dark forest.",
      captionStyle: "bold-stroke",
      targetDurationSec: 8,
    });
    console.log("   final:", finalUrl);
    console.log("\n=== PASS ===");
    console.log("Open:", `http://localhost:8080${finalUrl}`);
  } else {
    console.log("\n=== PASS (image+motion) ===");
    console.log("Open:", `http://localhost:8080${vid.localUrl}`);
  }
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
