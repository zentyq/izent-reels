import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Auto generate + post series videos on a timer (no manual Process queue needed)
void import("./lib/series.functions")
  .then((m) => m.startSeriesBackgroundWorker())
  .catch((e) => console.warn("Series worker boot skipped:", (e as Error).message));

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Series auto-post cron (Google Cloud Scheduler / Railway cron)
      // Accept GET or POST so Railway cron HTTP checks work either way.
      if (
        url.pathname === "/api/series/cron" &&
        (request.method === "POST" || request.method === "GET")
      ) {
        try {
          const secret =
            request.headers.get("x-series-cron-secret") ||
            url.searchParams.get("secret") ||
            "";
          const { runSeriesCronJob } = await import("./lib/series.functions");
          const result = await runSeriesCronJob(secret || null);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message },
            { status: (e as Error).message === "Unauthorized cron" ? 401 : 500 },
          );
        }
      }

      // Serve locally generated series media (with Range support for <video> playback)
      if (url.pathname.startsWith("/api/uploads/")) {
        const { open, stat } = await import("node:fs/promises");
        const { join, normalize } = await import("node:path");
        const rel = decodeURIComponent(url.pathname.replace("/api/uploads/", ""));
        if (rel.includes("..")) {
          return new Response("Forbidden", { status: 403 });
        }
        const filePath = join(
          process.env.UPLOADS_DIR || join(process.cwd(), "uploads"),
          normalize(rel),
        );
        try {
          const info = await stat(filePath);
          const size = info.size;
          const ext = filePath.split(".").pop()?.toLowerCase();
          const type =
            ext === "mp4"
              ? "video/mp4"
              : ext === "mp3"
                ? "audio/mpeg"
                : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : ext === "webp"
                    ? "image/webp"
                    : "image/png";

          const baseHeaders: Record<string, string> = {
            "content-type": type,
            "accept-ranges": "bytes",
            "cache-control": "public, max-age=86400",
          };

          const wantsDownload = url.searchParams.get("download") === "1";
          if (wantsDownload) {
            const base =
              rel.split("/").pop()?.replace(/[^\w.\-() ]+/g, "_") ||
              (ext === "mp4" ? "video.mp4" : `file.${ext || "bin"}`);
            baseHeaders["content-disposition"] =
              `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(base)}`;
          }

          const range = request.headers.get("range");
          // Range requests are for <video> scrubbing — skip attachment disposition there
          if (range && !wantsDownload) {
            const m = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
            if (!m) {
              return new Response("Invalid Range", {
                status: 416,
                headers: { ...baseHeaders, "content-range": `bytes */${size}` },
              });
            }
            let start = m[1] ? Number(m[1]) : 0;
            let end = m[2] ? Number(m[2]) : size - 1;
            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
              return new Response("Range Not Satisfiable", {
                status: 416,
                headers: { ...baseHeaders, "content-range": `bytes */${size}` },
              });
            }
            end = Math.min(end, size - 1);
            const chunkSize = end - start + 1;
            const fh = await open(filePath, "r");
            try {
              const buf = Buffer.alloc(chunkSize);
              await fh.read(buf, 0, chunkSize, start);
              return new Response(buf, {
                status: 206,
                headers: {
                  ...baseHeaders,
                  "content-length": String(chunkSize),
                  "content-range": `bytes ${start}-${end}/${size}`,
                },
              });
            } finally {
              await fh.close().catch(() => {});
            }
          }

          const { readFile } = await import("node:fs/promises");
          const buf = await readFile(filePath);
          return new Response(buf, {
            status: 200,
            headers: {
              ...baseHeaders,
              "content-length": String(size),
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
