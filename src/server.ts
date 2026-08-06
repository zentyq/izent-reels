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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Serve locally generated series media
      if (url.pathname.startsWith("/api/uploads/")) {
        const { readFile } = await import("node:fs/promises");
        const { join, normalize } = await import("node:path");
        const rel = decodeURIComponent(url.pathname.replace("/api/uploads/", ""));
        if (rel.includes("..")) {
          return new Response("Forbidden", { status: 403 });
        }
        const filePath = join(process.cwd(), "uploads", normalize(rel));
        try {
          const buf = await readFile(filePath);
          const ext = filePath.split(".").pop()?.toLowerCase();
          const type =
            ext === "mp4"
              ? "video/mp4"
              : ext === "mp3"
                ? "audio/mpeg"
                : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : "image/png";
          return new Response(buf, {
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=86400",
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
