import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { execFile, ChildProcess } from "node:child_process";
import { readFile, readdir, rm, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Global registry of active downloads for cancellation */
const activeDownloads = new Map<string, ChildProcess>();

/** Max download size in bytes (50 MB) */
const MAX_SIZE = 50 * 1024 * 1024;

/** Known image / video MIME types we accept */
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/ogg",
]);

/** Extension → MIME fallback map for URLs that don't return a proper content-type */
const EXT_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
};

/**
 * Platform domains that require yt-dlp to extract the real media URL.
 * When a URL matches one of these, we shell out to yt-dlp instead of
 * doing a plain fetch.
 */
const PLATFORM_PATTERNS = [
  /(?:youtube\.com|youtu\.be)/i,
  /tiktok\.com/i,
  /instagram\.com/i,
  /(?:twitter\.com|x\.com)/i,
  /facebook\.com|fb\.watch/i,
  /vimeo\.com/i,
  /dailymotion\.com/i,
  /twitch\.tv/i,
  /reddit\.com/i,
  /pinterest\.com|pin\.it/i,
  /snapchat\.com/i,
  /linkedin\.com/i,
  /threads\.net/i,
  /bilibili\.com/i,
  /soundcloud\.com/i,
];

/**
 * Check if a URL belongs to a platform that needs yt-dlp.
 */
function isPlatformUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PLATFORM_PATTERNS.some((p) => p.test(hostname));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is an Instagram URL.
 */
function isInstagramUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return /instagram\.com/i.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a direct Instagram/Facebook CDN media URL.
 * These come from right-clicking a video/image in the browser
 * and selecting "Copy video address" or "Copy image address".
 * They look like: https://scontent-xxx.cdninstagram.com/... or https://scontent.fbcdn.net/...
 */
function isInstagramCdnUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return /cdninstagram\.com$/i.test(hostname) || /fbcdn\.net$/i.test(hostname);
  } catch {
    return false;
  }
}

/** Browser-like headers used for Instagram requests */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

/**
 * Extract the Instagram shortcode from a URL.
 * e.g., https://www.instagram.com/reel/DBlTTBpubOT/ → DBlTTBpubOT
 *       https://www.instagram.com/p/ABC123/       → ABC123
 */
function extractInstagramShortcode(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    // Matches /p/CODE/, /reel/CODE/, /tv/CODE/, /reels/CODE/
    const match = pathname.match(/\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Download a media file from a direct CDN URL and return it as base64.
 */
async function fetchMediaAsBase64(
  mediaUrl: string,
  referer: string
): Promise<{ ok: true; base64: string; contentType: string; filename: string; sizeBytes: number; isVideo: boolean } | { ok: false; error: string }> {
  try {
    const mediaRes = await fetch(mediaUrl, {
      redirect: "follow",
      headers: {
        ...BROWSER_HEADERS,
        Referer: referer,
      },
    });

    if (!mediaRes.ok) {
      return { ok: false, error: `Failed to fetch media: HTTP ${mediaRes.status}` };
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { ok: false, error: "Downloaded file is empty." };
    }
    if (arrayBuffer.byteLength > MAX_SIZE) {
      return { ok: false, error: `File too large: ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB exceeds the 50MB limit.` };
    }

    const buffer = Buffer.from(arrayBuffer);
    const rawCt = mediaRes.headers.get("content-type") || "";
    let contentType = rawCt.split(";")[0].trim().toLowerCase();

    // Guess from URL if content-type is generic
    if (!contentType || contentType === "application/octet-stream") {
      const guessed = mimeFromUrl(mediaUrl);
      if (guessed) contentType = guessed;
      else contentType = "video/mp4"; // default for Instagram
    }

    // Build a filename
    let filename = "instagram_media";
    try {
      const urlPath = new URL(mediaUrl).pathname;
      const last = urlPath.split("/").pop();
      if (last && last.includes(".")) filename = decodeURIComponent(last).slice(0, 120);
    } catch { /* ignore */ }
    if (!filename.includes(".")) {
      const ext = contentType.startsWith("video/") ? "mp4" : "jpg";
      filename = `${filename}.${ext}`;
    }

    return {
      ok: true,
      base64: buffer.toString("base64"),
      contentType,
      filename,
      sizeBytes: buffer.byteLength,
      isVideo: contentType.startsWith("video/"),
    };
  } catch (e) {
    return { ok: false, error: `Media fetch failed: ${(e as Error).message}` };
  }
}

/**
 * Try to download Instagram media directly by scraping the page HTML
 * and extracting embedded media URLs from the page's meta tags,
 * embedded JSON data, or by calling Instagram's internal API.
 *
 * Returns null if extraction fails (caller should fall back to yt-dlp).
 */
async function downloadInstagramDirect(
  url: string,
  instagramCookie?: string | null
): Promise<{ ok: true; base64: string; contentType: string; filename: string; sizeBytes: number; isVideo: boolean } | null> {
  const shortcode = extractInstagramShortcode(url);
  console.log(`Instagram direct: attempting extraction for ${url} (shortcode: ${shortcode})`);

  const headers = instagramCookie 
    ? { ...BROWSER_HEADERS, Cookie: instagramCookie } 
    : BROWSER_HEADERS;

  // ── Strategy 1: Fetch the page HTML and extract from meta tags / embedded JSON ──
  try {
    const pageRes = await fetch(url, {
      redirect: "follow",
      headers,
    });

    if (pageRes.ok) {
      const html = await pageRes.text();

      // 1a. Try to extract video_url from embedded JSON data
      //     Instagram embeds media data in various script tags
      const jsonPatterns = [
        // window.__additionalDataLoaded pattern
        /window\.__additionalDataLoaded\s*\([^,]*,\s*({.+?})\s*\)\s*;/s,
        // window._sharedData pattern
        /window\._sharedData\s*=\s*({.+?})\s*;/s,
        // Relay/Preloader pattern (newer Instagram)
        /"xdt_api__v1__media__shortcode__web_info"\s*,\s*({.+?})\}\]\]/s,
      ];

      for (const pattern of jsonPatterns) {
        const jsonMatch = html.match(pattern);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]);
            const mediaUrl = findMediaUrlInJson(data);
            if (mediaUrl) {
              console.log(`Instagram direct: found media URL via embedded JSON`);
              const result = await fetchMediaAsBase64(mediaUrl, url);
              if (result.ok) return result;
            }
          } catch (parseErr) {
            console.log(`Instagram direct: JSON parse failed for pattern, trying next`);
          }
        }
      }

      // 1b. Try to extract from og:video or og:image meta tags
      const ogVideoMatch = html.match(/<meta\s+(?:property|name)=["']og:video["']\s+content=["']([^"']+)["']/i)
        || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:video["']/i);
      if (ogVideoMatch) {
        const videoUrl = ogVideoMatch[1].replace(/&amp;/g, "&");
        console.log(`Instagram direct: found og:video URL`);
        const result = await fetchMediaAsBase64(videoUrl, url);
        if (result.ok) return result;
      }

      const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
        || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
      if (ogImageMatch) {
        const imageUrl = ogImageMatch[1].replace(/&amp;/g, "&");
        
        // Only use og:image if it's a high-quality CDN URL (not a tiny thumbnail)
        // AND if the user didn't explicitly request a video (reel/tv).
        // If they requested a video, we shouldn't return the thumbnail image.
        const isExplicitVideo = url.includes("/reel/") || url.includes("/reels/") || url.includes("/tv/");
        
        if ((imageUrl.includes("cdninstagram.com") || imageUrl.includes("fbcdn.net")) && !isExplicitVideo) {
          console.log(`Instagram direct: found og:image URL (not an explicit video)`);
          const result = await fetchMediaAsBase64(imageUrl, url);
          if (result.ok) return result;
        } else if (isExplicitVideo) {
           console.log(`Instagram direct: skipping og:image fallback because URL implies a video`);
        }
      }

      // 1c. Try to find video URLs directly in the HTML (CDN pattern)
      const cdnVideoMatch = html.match(/"video_url"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/i)
        || html.match(/"src"\s*:\s*"(https?:\/\/(?:[\w-]+\.)?cdninstagram\.com\/[^"]+\.mp4[^"]*)"/i);
      if (cdnVideoMatch) {
        const videoUrl = cdnVideoMatch[1].replace(/\\u0026/g, "&").replace(/\\\/\//g, "/");
        console.log(`Instagram direct: found CDN video URL in HTML`);
        const result = await fetchMediaAsBase64(videoUrl, url);
        if (result.ok) return result;
      }
    }
  } catch (e) {
    console.log(`Instagram direct: page fetch failed: ${(e as Error).message}`);
  }

  // ── Strategy 2: Try Instagram's GraphQL web info endpoint ──
  if (shortcode) {
    try {
      const graphqlUrl = `https://www.instagram.com/api/v1/media/${shortcode}/web_info/`;
      const graphqlRes = await fetch(graphqlUrl, {
        headers: {
          ...headers,
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
          Referer: url,
        },
      });

      if (graphqlRes.ok) {
        const contentType = graphqlRes.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const data = await graphqlRes.json();
          const mediaUrl = findMediaUrlInJson(data);
          if (mediaUrl) {
            console.log(`Instagram direct: found media URL via web_info API`);
            const result = await fetchMediaAsBase64(mediaUrl, url);
            if (result.ok) return result;
          }
        }
      }
    } catch (e) {
      console.log(`Instagram direct: web_info API failed: ${(e as Error).message}`);
    }
  }

  // ── Strategy 3: Try the embed page (often less restricted) ──
  if (shortcode) {
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
      const embedRes = await fetch(embedUrl, {
        redirect: "follow",
        headers,
      });

      if (embedRes.ok) {
        const embedHtml = await embedRes.text();

        // Look for video source in embed HTML
        const embedVideoMatch = embedHtml.match(/"video_url"\s*:\s*"(https?:\/\/[^"]+)"/i)
          || embedHtml.match(/class="[^"]*EmbeddedMediaVideo[^"]*"[^>]*src="([^"]+)"/i)
          || embedHtml.match(/data-video-url="([^"]+)"/i)
          || embedHtml.match(/<source\s+src="([^"]+)"/i);

        if (embedVideoMatch) {
          const videoUrl = embedVideoMatch[1].replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/\\\/\//g, "/");
          console.log(`Instagram direct: found video URL in embed page`);
          const result = await fetchMediaAsBase64(videoUrl, embedUrl);
          if (result.ok) return result;
        }

        // Look for image in embed (for photo posts)
        const embedImgMatch = embedHtml.match(/class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/i)
          || embedHtml.match(/<img[^>]+class="[^"]*"[^>]+src="(https?:\/\/(?:[\w-]+\.)?cdninstagram\.com\/[^"]+)"/i);

        if (embedImgMatch) {
          const imageUrl = embedImgMatch[1].replace(/&amp;/g, "&");
          console.log(`Instagram direct: found image URL in embed page`);
          const result = await fetchMediaAsBase64(imageUrl, embedUrl);
          if (result.ok) return result;
        }
      }
    } catch (e) {
      console.log(`Instagram direct: embed page failed: ${(e as Error).message}`);
    }
  }

  console.log(`Instagram direct: all extraction strategies failed for ${url}`);
  return null;
}

/**
 * Recursively search a JSON object for Instagram media URLs.
 * Returns the first video_url found, or display_url as fallback.
 */
function findMediaUrlInJson(obj: any, depth = 0): string | null {
  if (depth > 15 || !obj || typeof obj !== "object") return null;

  // Prefer video URL
  if (typeof obj.video_url === "string" && obj.video_url.startsWith("http")) {
    return obj.video_url;
  }

  // Check for video_versions array (newer API format)
  if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
    const best = obj.video_versions[0];
    if (best && typeof best.url === "string") return best.url;
  }

  // Fall back to display_url (image)
  if (typeof obj.display_url === "string" && obj.display_url.startsWith("http")) {
    // Only use display_url if we haven't found video_url deeper
    // Keep searching first
  }

  // Check image_versions2 (newer API format for images)
  if (obj.image_versions2 && Array.isArray(obj.image_versions2.candidates) && obj.image_versions2.candidates.length > 0) {
    // Check if there's a video_url elsewhere first before returning image
  }

  // Recurse into child objects
  let fallbackImageUrl: string | null = null;
  const entries = Array.isArray(obj) ? obj.map((v, i) => [i, v] as const) : Object.entries(obj);

  for (const [, value] of entries) {
    if (typeof value === "object" && value !== null) {
      const found = findMediaUrlInJson(value, depth + 1);
      if (found) {
        // Prefer video URLs over image URLs
        if (found.includes(".mp4") || found.includes("video")) return found;
        if (!fallbackImageUrl) fallbackImageUrl = found;
      }
    }
  }

  // If no video found in children, check for display_url at this level
  if (!fallbackImageUrl && typeof obj.display_url === "string" && obj.display_url.startsWith("http")) {
    fallbackImageUrl = obj.display_url;
  }

  // Check image_versions2 as last resort
  if (!fallbackImageUrl && obj.image_versions2 && Array.isArray(obj.image_versions2.candidates) && obj.image_versions2.candidates.length > 0) {
    const best = obj.image_versions2.candidates[0];
    if (best && typeof best.url === "string") fallbackImageUrl = best.url;
  }

  return fallbackImageUrl;
}

/**
 * Try to guess a MIME type from the URL path extension.
 */
function mimeFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  } catch {
    // ignore
  }
  return null;
}

/**
 * Guess MIME from a filename extension.
 */
function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_MAP[ext] || "video/mp4";
}

/**
 * Extract a reasonable filename from the URL.
 */
function filenameFromUrl(url: string, contentType: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.includes(".")) return decodeURIComponent(last).slice(0, 120);
  } catch {
    // ignore
  }
  // Fallback: construct from content type
  const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
  return `download.${ext}`;
}

/**
 * Run yt-dlp to download media from a platform URL.
 * Downloads as mp4 (best quality under 50MB) and returns the file data.
 */
async function downloadWithYtDlp(
  url: string,
  downloadId?: string,
  instagramCookie?: string | null
): Promise<{ ok: true; base64: string; contentType: string; filename: string; sizeBytes: number; isVideo: boolean } | { ok: false; error: string }> {
  let tempDir: string;
  try {
    tempDir = await mkdtemp(join(tmpdir(), "izent-dl-"));
  } catch {
    return { ok: false, error: "Failed to create temp directory for download." };
  }

  if (instagramCookie) {
    try {
      let sessionValue = instagramCookie.trim();
      if (sessionValue.startsWith("sessionid=")) {
        sessionValue = sessionValue.substring("sessionid=".length);
      }
      const cookiePath = join(tempDir, "cookies.txt");
      const cookieContent = `# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t${sessionValue}\n`;
      await writeFile(cookiePath, cookieContent);
    } catch {
      // ignore
    }
  }

  // Use video ID for the filename to avoid illegal characters on Windows
  // (video titles often contain : ? " < > | which Windows forbids)
  const outputTemplate = join(tempDir, "%(id)s.%(ext)s");

  return new Promise((resolve) => {
    // Detect Instagram for special args
    const isInsta = isInstagramUrl(url);

    // Core yt-dlp arguments
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

    if (isInsta) {
      args.push("--extractor-args", "instagram:api_type=graphql");
    }

    if (instagramCookie) {
      args.push("--cookies", join(tempDir, "cookies.txt"));
    }

    const isWindows = process.platform === "win32";
    const ytDlpFilename = isWindows ? "yt-dlp.exe" : "yt-dlp";
    const executable = join(process.cwd(), ytDlpFilename);

    console.log(`yt-dlp: executing standalone binary ${executable}`);

    const cp = execFile(executable, args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: tempDir,
    }, async (error, stdout, stderr) => {
      if (downloadId) activeDownloads.delete(downloadId);

      async function cleanup() {
        try { await rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }

      if (error) {
        await cleanup();
        const msg = stderr?.trim() || stdout?.trim() || error.message || "Unknown yt-dlp error";
        console.error("yt-dlp error:", msg);
        if (error.signal === "SIGTERM" || error.signal === "SIGKILL") {
          resolve({ ok: false, error: "Download was cancelled." });
        } else if (msg.includes("is not a valid URL") || msg.includes("Unsupported URL")) {
          resolve({ ok: false, error: "yt-dlp doesn't support this URL. Try a direct media link instead." });
        } else if (msg.includes("Video unavailable") || msg.includes("Private video")) {
          resolve({ ok: false, error: "This video is unavailable or private." });
        } else if (isInsta && (msg.includes("empty media response") || msg.includes("Sign in") || msg.includes("login") || msg.includes("csrf") || msg.includes("Restricted Video") || msg.includes("cookies"))) {
          resolve({
            ok: false,
            error: "Instagram requires login to access this content. Tip: Open the post in your browser, right-click the video/image → 'Copy video address' or 'Copy image address', then paste that direct URL here instead.",
          });
        } else if (msg.includes("Sign in") || msg.includes("login")) {
          resolve({ ok: false, error: "This content requires login and can't be downloaded." });
        } else if (error.killed) {
          resolve({ ok: false, error: "Download timed out (2 minute limit)." });
        } else {
          resolve({ ok: false, error: `Download failed: ${msg.slice(0, 200)}` });
        }
        return;
      }

      console.log(`yt-dlp completed. stdout length=${stdout?.length}, stderr length=${stderr?.length}`);
      if (stdout) console.log("yt-dlp stdout:", stdout.slice(0, 500));
      if (stderr) console.log("yt-dlp stderr:", stderr.slice(0, 500));

      let filepath = stdout.replace(/\r/g, "").trim().split("\n").pop()?.trim();

      if (!filepath) {
        try {
          const files = await readdir(tempDir);
          console.log("yt-dlp: files in tempDir:", files);
          const mediaFile = files.find((f) => /\.(mp4|webm|mkv|mov|avi|mp3|m4a|jpg|png|gif|webp)$/i.test(f));
          if (mediaFile) {
            filepath = join(tempDir, mediaFile);
          }
        } catch { /* ignore */ }
      }

      if (!filepath) {
        await cleanup();
        console.error("yt-dlp produced no file. Stdout:", stdout, "Stderr:", stderr);
        resolve({ ok: false, error: `yt-dlp completed but produced no file. stderr: ${(stderr || "none").slice(0, 200)}` });
        return;
      }

      console.log("yt-dlp downloaded file:", filepath);

      try {
        const buffer = await readFile(filepath);
        if (buffer.byteLength > MAX_SIZE) {
          await cleanup();
          resolve({ ok: false, error: `Downloaded file is ${Math.round(buffer.byteLength / 1024 / 1024)}MB, exceeding the 50MB limit.` });
          return;
        }

        const rawFilename = filepath.split(/[/\\]/).pop() || "download.mp4";
        const contentType = mimeFromFilename(rawFilename);
        const base64 = buffer.toString("base64");

        await cleanup();

        resolve({
          ok: true,
          base64,
          contentType,
          filename: rawFilename,
          sizeBytes: buffer.byteLength,
          isVideo: contentType.startsWith("video/"),
        });
      } catch (readErr) {
        console.error("Failed to read downloaded file:", filepath, readErr);
        await cleanup();
        resolve({ ok: false, error: "Downloaded the video but failed to read the file." });
      }
    });

    if (downloadId) {
      activeDownloads.set(downloadId, cp);
    }
  });
}

export const cancelDownload = createServerFn({ method: "POST" })
  .inputValidator(z.object({ downloadId: z.string() }))
  .handler(async ({ data }) => {
    const cp = activeDownloads.get(data.downloadId);
    if (cp) {
      cp.kill("SIGTERM");
      activeDownloads.delete(data.downloadId);
      return { ok: true, message: "Download cancelled" };
    }
    return { ok: false, error: "Download not found or already finished" };
  });

export const downloadMediaFromUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      url: z.string().url().max(2000),
      downloadId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      // ── Retrieve Instagram Cookie if authenticated ──
      let instagramCookie: string | null = null;
      try {
        const { getCookie } = await import("@tanstack/react-start/server");
        const { prisma } = await import("./db");
        const token = getCookie("izent_session");
        if (token) {
          const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
          if (session?.user?.instagramCookie) {
            instagramCookie = session.user.instagramCookie;
          }
        }
      } catch (e) {
        console.error("Error retrieving user session cookie:", e);
      }

      // ── Instagram CDN URLs: direct download (from right-click → copy video address) ──
      if (isInstagramCdnUrl(data.url)) {
        console.log(`Detected Instagram CDN URL, downloading directly...`);
        const result = await fetchMediaAsBase64(data.url, "https://www.instagram.com/");
        if (result.ok) return result;
        return { ok: false as const, error: result.error };
      }

      // ── Instagram page URLs: try direct extraction first, then yt-dlp ──
      if (isInstagramUrl(data.url)) {
        console.log(`Detected Instagram URL, trying direct extraction first...`);
        const directResult = await downloadInstagramDirect(data.url, instagramCookie);
        
        if (directResult) {
          if (!directResult.isVideo) {
            console.log(`Instagram direct extraction returned an image, but users usually want the video. Rejecting image fallback...`);
          } else {
            return directResult;
          }
        }

        console.log(`Instagram direct extraction failed or rejected, falling back to yt-dlp...`);
        return await downloadWithYtDlp(data.url, data.downloadId, instagramCookie);
      }

      // ── Check if this is a platform URL that needs yt-dlp ────────
      if (isPlatformUrl(data.url)) {
        return await downloadWithYtDlp(data.url, data.downloadId, instagramCookie);
      }

      // ── Direct media URL: use fetch ────────────────────────────────
      const res = await fetch(data.url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        return {
          ok: false as const,
          error: `Failed to fetch URL: HTTP ${res.status} ${res.statusText}`,
        };
      }

      // ── Determine content type ──────────────────────────────────
      const rawContentType = res.headers.get("content-type") || "";
      let contentType = rawContentType.split(";")[0].trim().toLowerCase();

      // If server returned a generic type, try to guess from extension
      if (
        !contentType ||
        contentType === "application/octet-stream" ||
        contentType === "binary/octet-stream"
      ) {
        const guessed = mimeFromUrl(data.url);
        if (guessed) contentType = guessed;
      }

      // If content is HTML, it's likely a platform page — try yt-dlp as fallback
      if (contentType === "text/html" || contentType === "text/plain") {
        console.log(`URL returned ${contentType}, trying yt-dlp as fallback...`);
        return await downloadWithYtDlp(data.url);
      }

      if (!ACCEPTED_TYPES.has(contentType)) {
        // One last attempt: check URL extension
        const guessed = mimeFromUrl(data.url);
        if (guessed && ACCEPTED_TYPES.has(guessed)) {
          contentType = guessed;
        } else {
          return {
            ok: false as const,
            error: `Unsupported media type: "${contentType || "unknown"}". Only images and videos are supported.`,
          };
        }
      }

      // ── Check file size from header (if available) ──────────────
      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return {
          ok: false as const,
          error: `File too large: ${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB exceeds the 50MB limit.`,
        };
      }

      // ── Read the body ───────────────────────────────────────────
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_SIZE) {
        return {
          ok: false as const,
          error: `File too large: ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB exceeds the 50MB limit.`,
        };
      }

      if (arrayBuffer.byteLength === 0) {
        return { ok: false as const, error: "Downloaded file is empty." };
      }

      // ── Convert to base64 ───────────────────────────────────────
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const filename = filenameFromUrl(data.url, contentType);
      const sizeBytes = arrayBuffer.byteLength;

      return {
        ok: true as const,
        base64,
        contentType,
        filename,
        sizeBytes,
        isVideo: contentType.startsWith("video/"),
      };
    } catch (e) {
      const msg = (e as Error).message || "Unknown error";
      // Friendly error messages for common failures
      if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
        return { ok: false as const, error: "Could not reach that URL. Check the address and try again." };
      }
      if (msg.includes("ETIMEDOUT") || msg.includes("ESOCKETTIMEDOUT")) {
        return { ok: false as const, error: "Request timed out. The server took too long to respond." };
      }
      if (msg.includes("CERT") || msg.includes("SSL")) {
        return { ok: false as const, error: "SSL/certificate error when connecting to that URL." };
      }
      return { ok: false as const, error: `Download failed: ${msg}` };
    }
  });
