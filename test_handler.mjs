import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { readFileSync } from "node:fs";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

async function testHandler(data) {
  let tmpDir = "";
  try {
    tmpDir = await mkdtemp(join(tmpdir(), "izentsocial-edit-"));
    const inputPath = join(tmpDir, "input.mp4");
    const outputPath = join(tmpDir, "output.mp4");

    await writeFile(inputPath, Buffer.from(data.videoBase64, "base64"));

    return await new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      if (data.startTime !== undefined) command = command.setStartTime(data.startTime);
      if (data.duration !== undefined) command = command.setDuration(data.duration);

      const videoFilters = [];
      const audioFilters = [];
      let currentVideoPad = "0:v";
      let currentAudioPad = "0:a";

      if (data.speed && data.speed !== 1) {
        audioFilters.push(`[${currentAudioPad}]atempo=${data.speed}[a1]`);
        currentAudioPad = "a1";
        videoFilters.push(`[${currentVideoPad}]setpts=${1 / data.speed}*PTS[v1]`);
        currentVideoPad = "v1";
      }

      if (data.crop) {
        videoFilters.push(`[${currentVideoPad}]crop=${data.crop.width}:${data.crop.height}:${data.crop.x}:${data.crop.y}[v_crop]`);
        currentVideoPad = "v_crop";
      }

      const complexFilters = [];
      if (videoFilters.length > 0) complexFilters.push(videoFilters.join(";"));
      if (audioFilters.length > 0) complexFilters.push(audioFilters.join(";"));

      if (complexFilters.length > 0) {
        command.complexFilter(complexFilters);
        command.outputOptions([`-map [${currentVideoPad}]`]);
        if (currentAudioPad) {
          command.outputOptions([`-map [${currentAudioPad}]`]);
        }
      }

      async function finish() {
        try {
          const outBuf = await readFile(outputPath);
          resolve({ ok: true, size: outBuf.length });
        } catch (e) {
          reject(e);
        }
      }

      function errFn(err) {
        reject(new Error(`FFmpeg error: ${err.message}`));
      }

      command.output(outputPath).on('end', finish).on('error', errFn).run();
    });
  } catch (e) {
    console.error("Handler error:", e);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function run() {
  const buf = readFileSync("dummy.mp4");
  const videoBase64 = buf.toString("base64");
  
  await testHandler({
    videoBase64,
    startTime: 0,
    duration: 0.5
  });
  console.log("Test passed!");
}

run();
