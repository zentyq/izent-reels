import { execFile } from 'child_process';
import { join } from 'path';
import { readdir, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';

async function testLocalDownload(url) {
  const tempDir = join(tmpdir(), `ytdlp-${Date.now()}`);
  await import('fs').then(fs => fs.promises.mkdir(tempDir, { recursive: true }));
  
  const outputTemplate = join(tempDir, "%(id)s.%(ext)s");

  const args = [
    url,
    "-o", outputTemplate,
    "-f", "best[vcodec^=avc][filesize<50M][ext=mp4]/best[vcodec^=h264][filesize<50M][ext=mp4]/best[filesize<50M][ext=mp4]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--print", "after_move:filepath",
    "--no-playlist",
    "--socket-timeout", "30",
    "--restrict-filenames",
  ];

  const isWindows = process.platform === "win32";
  const ytDlpFilename = isWindows ? "yt-dlp.exe" : "yt-dlp";
  const executable = join(process.cwd(), ytDlpFilename);

  console.log(`Executing standalone binary: ${executable}`);

  return new Promise((resolve) => {
    execFile(executable, args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: tempDir,
    }, async (error, stdout, stderr) => {
      async function cleanup() {
        try { await rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }

      if (error) {
        await cleanup();
        console.error("yt-dlp error:", stderr || error.message);
        resolve(false);
        return;
      }

      console.log(`yt-dlp completed. stdout=${stdout}`);
      resolve(true);
    });
  });
}

testLocalDownload("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
