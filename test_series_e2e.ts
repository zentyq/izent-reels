/**
 * End-to-end Faceless Series pipeline smoke test (no HTTP auth).
 * Runs: script → multi-scene AI images → TTS → FFmpeg assemble
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load .env
for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const key = m[1].trim();
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const {
  generateScriptContent,
  generateSceneImages,
  generateElevenLabsSpeech,
  assembleReel,
} = await import("./src/lib/series/providers.ts");

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== Faceless Series E2E Test ===\n");

  assert(process.env.GEMINI_API_KEY, "GEMINI_API_KEY missing");
  assert(process.env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY missing");

  const artStyleHint =
    "clean comic book illustration style, bold outlines, flat colors";
  const artStyleImage = "/series/art-styles/comic.png";
  assert(
    existsSync(join(process.cwd(), "public/series/art-styles/comic.png")),
    "comic style reference missing",
  );

  // 1) Script
  console.log("1) Generating script with Gemini...");
  const content = await generateScriptContent({
    niche: "Weird historical facts that sound fake but are real",
    exampleScript: null,
    durationSec: 20,
    artStyle: artStyleHint,
  });
  console.log("   title:", content.title);
  console.log("   scenes:", content.scenePrompts.length);
  console.log("   script chars:", content.script.length);
  assert(content.script.length > 20, "script too short");
  assert(content.scenePrompts.length >= 2, "expected multiple scene prompts");

  // Limit to 2 scenes for a faster smoke test
  const prompts = content.scenePrompts.slice(0, 2);
  console.log("\n2) Generating", prompts.length, "AI scene images (style ref only)...");
  const scenes = await generateSceneImages(prompts, artStyleHint, artStyleImage);
  const sceneUrls = scenes.map((s) => s.localUrl);
  for (const url of sceneUrls) {
    console.log("   scene:", url);
    assert(url.startsWith("/api/uploads/"), `unexpected scene url: ${url}`);
    const abs = join(process.cwd(), "uploads", url.replace("/api/uploads/", ""));
    assert(existsSync(abs), `scene file missing: ${abs}`);
    // Ensure we did NOT just copy the feature art
    const styleAbs = join(process.cwd(), "public/series/art-styles/comic.png");
    const sceneBuf = readFileSync(abs);
    const styleBuf = readFileSync(styleAbs);
    assert(sceneBuf.length !== styleBuf.length || !sceneBuf.equals(styleBuf), "scene is identical to style reference — fallback bug");
  }

  // 3) Voice
  console.log("\n3) Generating ElevenLabs voice...");
  const voiceUrl = await generateElevenLabsSpeech(
    content.script.slice(0, 500),
    "JBFqnCBsd6RMkjVDRZzb",
  );
  console.log("   voice:", voiceUrl);
  assert(existsSync(join(process.cwd(), "uploads", voiceUrl.replace("/api/uploads/", ""))), "voice file missing");

  // 4) Assemble (skip music to keep test focused)
  console.log("\n4) Assembling reel with FFmpeg slideshow...");
  const finalUrl = await assembleReel({
    sceneUrls,
    voiceUrl,
    musicUrl: null,
    script: content.script,
    captionStyle: "bold-stroke",
    glitch: false,
    targetDurationSec: 12,
  });
  console.log("   video:", finalUrl);
  const videoAbs = join(process.cwd(), "uploads", finalUrl.replace("/api/uploads/", ""));
  assert(existsSync(videoAbs), "final video missing");
  const size = readFileSync(videoAbs).length;
  console.log("   size bytes:", size);
  assert(size > 50_000, "final video too small");

  console.log("\n=== PASS — pipeline works ===");
  console.log("Open:", `http://localhost:8080${finalUrl}`);
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
