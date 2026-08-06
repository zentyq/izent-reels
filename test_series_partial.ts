/**
 * Partial pipeline test when Gemini image quota is exhausted:
 * script (Gemini) → synthetic unique frames → TTS → FFmpeg slideshow
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

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
  generateScriptContent,
  generateElevenLabsSpeech,
  assembleReel,
  saveUploadBuffer,
} = await import("./src/lib/series/providers.ts");

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Tiny unique solid-color PNG so we don't reuse art-style refs */
function makePng(r: number, g: number, b: number, w = 360, h = 640) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = (r + x + y) % 256;
      raw[i + 1] = (g + x * 2) % 256;
      raw[i + 2] = (b + y * 2) % 256;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== Partial Series Test (script + TTS + FFmpeg) ===\n");

  console.log("1) Script...");
  const content = await generateScriptContent({
    niche: "Weird historical facts that sound fake but are real",
    durationSec: 20,
    artStyle: "comic book style",
  });
  console.log("   OK:", content.title);

  console.log("\n2) Synthetic unique scenes (Gemini image quota is 0 on free tier)...");
  const s1 = await saveUploadBuffer(makePng(40, 80, 200), "png");
  const s2 = await saveUploadBuffer(makePng(200, 60, 40), "png");
  const sceneUrls = [s1.publicUrl, s2.publicUrl];
  console.log("   scenes:", sceneUrls.join(", "));

  console.log("\n3) ElevenLabs TTS...");
  const voiceUrl = await generateElevenLabsSpeech(
    content.script.slice(0, 450),
    "JBFqnCBsd6RMkjVDRZzb",
  );
  console.log("   OK:", voiceUrl);

  console.log("\n4) FFmpeg multi-scene assemble...");
  const finalUrl = await assembleReel({
    sceneUrls,
    voiceUrl,
    musicUrl: null,
    script: content.script,
    captionStyle: "bold-stroke",
    targetDurationSec: 10,
  });
  const abs = join(process.cwd(), "uploads", finalUrl.replace("/api/uploads/", ""));
  assert(existsSync(abs), "video missing");
  const size = readFileSync(abs).length;
  console.log("   OK:", finalUrl, `(${size} bytes)`);
  assert(size > 30000, "video too small");

  console.log("\n=== PASS (partial) ===");
  console.log("Preview:", `http://localhost:8080${finalUrl}`);
  console.log(
    "\nNOTE: Full AI scene images need Gemini billing — free tier image quota is currently 0.",
  );
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
