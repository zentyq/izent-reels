/**
 * ElevenLabs music smoke test (+ mix into a short reel if possible)
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

const {
  generateElevenLabsMusic,
  generateElevenLabsSpeech,
  assembleReel,
  saveUploadBuffer,
} = await import("./src/lib/series/providers.ts");
const { MUSIC_PRESETS } = await import("./src/lib/series/constants.ts");

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== ElevenLabs Music Test ===\n");
  assert(process.env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY missing");

  const preset = MUSIC_PRESETS.find((m) => m.id === "unsolved-mystery") || MUSIC_PRESETS[0];
  console.log("1) Generating music:", preset.label);
  console.log("   prompt:", preset.prompt);

  const musicUrl = await generateElevenLabsMusic(preset.prompt, 12_000);
  console.log("   music:", musicUrl);
  const musicAbs = join(process.cwd(), "uploads", musicUrl.replace("/api/uploads/", ""));
  assert(existsSync(musicAbs), "music file missing");
  const musicSize = readFileSync(musicAbs).length;
  console.log("   size bytes:", musicSize);
  assert(musicSize > 5_000, "music file too small");

  console.log("\n2) Mixing voice + music over a still frame...");
  // Tiny solid-ish PNG via WaveSpeed/OpenAI not needed — reuse last comic style as visual only for mix test
  // Prefer an existing generated scene if present; else copy style ref into uploads via saveUploadBuffer
  const { readFileSync: rfs } = await import("node:fs");
  const style = rfs(join(process.cwd(), "public/series/art-styles/comic.png"));
  const still = await saveUploadBuffer(style, "png");

  const voiceUrl = await generateElevenLabsSpeech(
    "A soft mystery theme rises as the story unfolds.",
    "JBFqnCBsd6RMkjVDRZzb",
  );
  console.log("   voice:", voiceUrl);

  const finalUrl = await assembleReel({
    sceneUrls: [still.publicUrl],
    voiceUrl,
    musicUrl,
    script: "This is a music mix subtitle test for the faceless series reel.",
    captionStyle: "bold-stroke",
    targetDurationSec: 8,
  });
  const finalAbs = join(process.cwd(), "uploads", finalUrl.replace("/api/uploads/", ""));
  assert(existsSync(finalAbs), "final video missing");
  console.log("   video:", finalUrl, `(${readFileSync(finalAbs).length} bytes)`);

  console.log("\n=== PASS ===");
  console.log("Music:", `http://localhost:8080${musicUrl}`);
  console.log("Mixed:", `http://localhost:8080${finalUrl}`);
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
