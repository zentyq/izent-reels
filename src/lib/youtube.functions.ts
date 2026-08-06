import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchYouTube = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      query: z.string().min(1),
      maxResults: z.number().optional().default(5),
    }),
  )
  .handler(async ({ data }) => {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
    if (!YOUTUBE_API_KEY) {
      return { ok: false as const, error: "YOUTUBE_API_KEY is not configured in .env" };
    }

    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", data.query);
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", String(data.maxResults));
      url.searchParams.set("key", YOUTUBE_API_KEY);

      const response = await fetch(url.toString());
      const result = await response.json();

      if (!response.ok) {
        return { ok: false as const, error: result.error?.message || "Failed to search YouTube" };
      }

      const videos = result.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        channelTitle: item.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));

      return { ok: true as const, videos };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const researchYouTubeForSeries = createServerFn({ method: "POST" })
  .inputValidator(z.object({ niche: z.string().min(2).max(5000) }))
  .handler(async ({ data }) => {
    try {
      const { researchYouTubeNiche } = await import("./series/youtube-research");
      const research = await researchYouTubeNiche(data.niche);
      return { ok: true as const, research };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
