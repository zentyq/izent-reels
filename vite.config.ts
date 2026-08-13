// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/** Keep FFmpeg / media pipeline out of the browser client graph. */
function stubSeriesServerModules(): Plugin {
  const stubIds = [
    "providers.server",
    "wavespeed.server",
    "google-scheduler.server",
    "ffmpeg-path.server",
    "pipeline.server",
  ];
  return {
    name: "stub-series-server-modules",
    enforce: "pre",
    resolveId(id, _importer, opts) {
      if (opts?.ssr) return null;
      if (stubIds.some((s) => id.includes(s))) {
        return "\0stub-series-server";
      }
      return null;
    },
    load(id) {
      if (id === "\0stub-series-server") {
        return `
          export default {};
          export async function assembleReel() { throw new Error("server only"); }
          export async function generateElevenLabsSpeech() { throw new Error("server only"); }
          export async function generateElevenLabsMusic() { throw new Error("server only"); }
          export async function generateMotionVideo() { throw new Error("server only"); }
          export async function generateSceneImages() { throw new Error("server only"); }
          export async function generateScriptContent() { throw new Error("server only"); }
          export async function generateVideoThumbnail() { throw new Error("server only"); }
          export async function previewMusicSample() { throw new Error("server only"); }
          export async function previewVoiceSample() { throw new Error("server only"); }
          export async function saveUploadBuffer() { throw new Error("server only"); }
          export async function runStudioJob() { throw new Error("server only"); }
          export async function syncGoogleCalendarEvent() { return { ok: true }; }
          export async function ensureSeriesCronSchedulerJob() { return { ok: true, skipped: true }; }
          export function googleCalendarCreateLink() { return ""; }
        `;
      }
      return null;
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [stubSeriesServerModules()],
    ssr: {
      external: ["fluent-ffmpeg", "ffmpeg-static"],
    },
  },
  nitro: {
    preset: "node-server"
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
