import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";

import { platform } from "node:os";
import fs from "node:fs";

// Find a valid font path based on OS (computed lazily inside the handler)
function getFontPath() {
  if (platform() === "win32") {
    return "C\\\\:/Windows/Fonts/arial.ttf";
  }
  // Common Linux font paths
  const linuxFonts = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf"
  ];
  for (const p of linuxFonts) {
    if (fs.existsSync(p)) return p;
  }
  return "";
}

export const editVideo = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      videoBase64: z.string(),
      mimeType: z.string().optional().default("video/mp4"),
      startTime: z.number().optional(), // In seconds
      duration: z.number().optional(), // In seconds
      speed: z.number().optional(), // Multiplier, e.g. 1.5
      mute: z.boolean().optional(),
      extractThumbnail: z.boolean().optional(),
      crop: z.object({ width: z.number(), height: z.number(), x: z.number(), y: z.number() }).optional(),
      resize: z.object({ width: z.number(), height: z.number() }).optional(),
      filters: z.object({ brightness: z.number().optional(), contrast: z.number().optional(), saturation: z.number().optional() }).optional(),
      textOverlay: z.object({ text: z.string(), fontSize: z.number().optional(), color: z.string().optional(), x: z.string().optional(), y: z.string().optional() }).optional(),
      watermarkBase64: z.string().optional(),
      watermarkPosition: z.enum(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]).optional().default("bottom-right"),
      backgroundAudioBase64: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    // Map position name to FFmpeg overlay coordinates
    function getOverlayPosition(pos: string) {
      const pad = 10;
      const positions: Record<string, string> = {
        "top-left":      `${pad}:${pad}`,
        "top-center":    `(main_w-overlay_w)/2:${pad}`,
        "top-right":     `main_w-overlay_w-${pad}:${pad}`,
        "center-left":   `${pad}:(main_h-overlay_h)/2`,
        "center":        `(main_w-overlay_w)/2:(main_h-overlay_h)/2`,
        "center-right":  `main_w-overlay_w-${pad}:(main_h-overlay_h)/2`,
        "bottom-left":   `${pad}:main_h-overlay_h-${pad}`,
        "bottom-center": `(main_w-overlay_w)/2:main_h-overlay_h-${pad}`,
        "bottom-right":  `main_w-overlay_w-${pad}:main_h-overlay_h-${pad}`,
      };
      return positions[pos] || positions["bottom-right"];
    }

    // Dynamically import ffmpeg-static to avoid client-side bundling issues
    const ffmpegStatic = (await import("ffmpeg-static")).default;
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }

    let tmpDir = "";
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "izentsocial-edit-"));
      const inputPath = join(tmpDir, "input.mp4");
      const outputPath = data.extractThumbnail ? join(tmpDir, "output.png") : join(tmpDir, "output.mp4");

      // Write primary video
      await writeFile(inputPath, Buffer.from(data.videoBase64, "base64"));

      // Optional external files
      let watermarkPath = "";
      if (data.watermarkBase64) {
        watermarkPath = join(tmpDir, "watermark.png");
        await writeFile(watermarkPath, Buffer.from(data.watermarkBase64, "base64"));
      }

      let bgAudioPath = "";
      if (data.backgroundAudioBase64) {
        bgAudioPath = join(tmpDir, "bgaudio.mp3");
        await writeFile(bgAudioPath, Buffer.from(data.backgroundAudioBase64, "base64"));
      }

      return await new Promise<{ ok: boolean; dataBase64?: string; mimeType?: string; error?: string }>((resolve, reject) => {
        let command = ffmpeg(inputPath);

        // ── Input & Timeline Config ──
        if (data.startTime !== undefined) command = command.setStartTime(data.startTime);
        if (data.duration !== undefined) command = command.setDuration(data.duration);
        if (data.extractThumbnail) {
          command.frames(1);
          command.output(outputPath).on('end', finish).on('error', errFn).run();
          return;
        }

        // Add additional inputs
        if (watermarkPath) command.input(watermarkPath);
        if (bgAudioPath) command.input(bgAudioPath);

        // ── Complex Filters Builder ──
        const videoFilters: string[] = [];
        const audioFilters: string[] = [];
        let currentVideoPad = "0:v";
        let currentAudioPad = "0:a";

        // Mute or Speed (Audio)
        if (data.mute) {
          command.noAudio();
          currentAudioPad = "";
        } else if (data.speed && data.speed !== 1) {
          audioFilters.push(`[${currentAudioPad}]atempo=${data.speed}[a1]`);
          currentAudioPad = "a1";
        }

        // Speed (Video)
        if (data.speed && data.speed !== 1) {
          videoFilters.push(`[${currentVideoPad}]setpts=${1 / data.speed}*PTS[v1]`);
          currentVideoPad = "v1";
        }

        // Crop
        if (data.crop) {
          videoFilters.push(`[${currentVideoPad}]crop=${data.crop.width}:${data.crop.height}:${data.crop.x}:${data.crop.y}[v_crop]`);
          currentVideoPad = "v_crop";
        }

        // Resize
        if (data.resize) {
          videoFilters.push(`[${currentVideoPad}]scale=${data.resize.width}:${data.resize.height}[v_scale]`);
          currentVideoPad = "v_scale";
        }

        // Effects (Color Grading)
        if (data.filters && (data.filters.brightness !== undefined || data.filters.contrast !== undefined || data.filters.saturation !== undefined)) {
          const b = data.filters.brightness !== undefined ? data.filters.brightness : 0;
          const c = data.filters.contrast !== undefined ? data.filters.contrast : 1;
          const s = data.filters.saturation !== undefined ? data.filters.saturation : 1;
          videoFilters.push(`[${currentVideoPad}]eq=brightness=${b}:contrast=${c}:saturation=${s}[v_eq]`);
          currentVideoPad = "v_eq";
        }

        // Text Overlay
        if (data.textOverlay) {
          const { text, fontSize = 24, color = "white", x = "(w-text_w)/2", y = "(h-text_h)/2" } = data.textOverlay;
          const sanitizedText = text.replace(/'/g, "\u2019").replace(/:/g, "\\:");
          const fontPath = getFontPath();
          const fontConfig = fontPath ? `fontfile='${fontPath}':` : ""; 
          videoFilters.push(`[${currentVideoPad}]drawtext=${fontConfig}text='${sanitizedText}':fontsize=${fontSize}:fontcolor=${color}:x=${x}:y=${y}[v_text]`);
          currentVideoPad = "v_text";
        }

        // Watermark Overlay
        if (watermarkPath) {
          // Assume watermark is input index 1
          const overlayPos = getOverlayPosition(data.watermarkPosition || "bottom-right");
          videoFilters.push(`[${currentVideoPad}][1:v]overlay=${overlayPos}[v_wm]`);
          currentVideoPad = "v_wm";
        }

        // Background Audio Mix
        if (bgAudioPath && currentAudioPad) {
          // If watermark is 1, bg audio is 2. If no watermark, bg audio is 1.
          const audioInputIdx = watermarkPath ? 2 : 1;
          audioFilters.push(`[${currentAudioPad}][${audioInputIdx}:a]amix=inputs=2:duration=first:dropout_transition=2[a_mix]`);
          currentAudioPad = "a_mix";
        } else if (bgAudioPath && !currentAudioPad) {
          // Muted original, just use bg audio directly
          const audioInputIdx = watermarkPath ? 2 : 1;
          currentAudioPad = `${audioInputIdx}:a`;
        }

        // Compile complex filter graph
        const complexFilters: string[] = [];
        if (videoFilters.length > 0) complexFilters.push(videoFilters.join(";"));
        if (audioFilters.length > 0) complexFilters.push(audioFilters.join(";"));

        if (complexFilters.length > 0) {
          command.complexFilter(complexFilters);
          command.outputOptions([`-map [${currentVideoPad}]`]);
          if (currentAudioPad) {
            if (currentAudioPad.includes(":")) {
              command.outputOptions([`-map ${currentAudioPad}?`]);
            } else {
              command.outputOptions([`-map [${currentAudioPad}]`]);
            }
          }
        }

        async function finish() {
          try {
            const outBuf = await readFile(outputPath);
            resolve({ 
              ok: true as const, 
              dataBase64: outBuf.toString("base64"), 
              mimeType: data.extractThumbnail ? "image/png" : "video/mp4" 
            });
          } catch (e) {
            reject(e);
          }
        }

        function errFn(err: any) {
          console.error("FFmpeg error:", err);
          reject(new Error(`FFmpeg error: ${err.message}`));
        }

        command.output(outputPath).on('end', finish).on('error', errFn).run();
      });
    } catch (e) {
      console.error("Video editing failed:", e);
      return { ok: false as const, error: (e as Error).message };
    } finally {
      if (tmpDir) {
        try { await rm(tmpDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  });
