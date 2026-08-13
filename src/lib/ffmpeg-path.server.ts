/**
 * Resolve ffmpeg without loading ffmpeg-static in ESM bundles
 * (ffmpeg-static uses __dirname and crashes under Nitro).
 */

let cachedFfmpegPath: string | null = null;

export async function resolveFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  if (process.env.FFMPEG_PATH) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }

  const { execFile } = await import("node:child_process");
  const onPath = await new Promise<boolean>((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, ["ffmpeg"], { windowsHide: true }, (err) => resolve(!err));
  });
  if (onPath) {
    cachedFfmpegPath = "ffmpeg";
    return cachedFfmpegPath;
  }

  try {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(pathToFileURL(`${process.cwd()}/`).href);
    const p = req("ffmpeg-static") as string | null;
    if (p) {
      cachedFfmpegPath = p;
      return cachedFfmpegPath;
    }
  } catch (e) {
    console.warn("ffmpeg-static fallback failed:", (e as Error).message);
  }

  throw new Error(
    "ffmpeg not found. Install ffmpeg on PATH or set FFMPEG_PATH / ffmpeg-static.",
  );
}
