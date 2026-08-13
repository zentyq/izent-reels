export type YouTubeVideoInsight = {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  url: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** Approximate views per hour since publish */
  viewVelocity: number;
  thumbnail?: string;
};

export type YouTubeResearch = {
  niche: string;
  queriedAt: string;
  trending: YouTubeVideoInsight[];
  topByViews: YouTubeVideoInsight[];
  popularTitles: string[];
  keywords: string[];
  competitors: Array<{
    channelId: string;
    channelTitle: string;
    videoCount: number;
    avgViews: number;
    sampleTitles: string[];
  }>;
  brief: string;
};

function ytKey(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not configured");
  return k;
}

async function ytGet(path: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.searchParams.set("key", ytKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.details?.[0]?.reason;
    const msg = body?.error?.message || `YouTube API ${res.status}`;
    if (reason === "forbidden" || String(msg).includes("blocked")) {
      throw new Error(
        `${msg} Enable YouTube Data API v3 on the Google Cloud project for this key, and allow that API under the key's API restrictions.`,
      );
    }
    throw new Error(msg);
  }
  return body;
}

function toHashtag(token: string): string {
  const cleaned = token
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/[\s_-]+/).filter(Boolean);
  const tag =
    parts.length === 1
      ? parts[0]
      : parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
  if (tag.length < 2 || tag.length > 40) return "";
  return `#${tag}`;
}

/** Build unique #tags from YouTube research keywords / niche phrases. */
export function hashtagsFromKeywords(keywords: string[], limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const tag = toHashtag(kw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ensure caption/description end with research hashtags (idempotent). */
export function ensureResearchHashtags(
  text: string,
  keywords: string[],
  limit = 8,
): string {
  const tags = hashtagsFromKeywords(keywords, limit);
  if (!tags.length) return text;
  const lower = text.toLowerCase();
  const missing = tags.filter((t) => !lower.includes(t.toLowerCase()));
  if (!missing.length) return text;
  const base = text.trimEnd();
  const sep = base ? (base.includes("\n") ? "\n\n" : " ") : "";
  return `${base}${sep}${missing.join(" ")}`.trim();
}

function hoursSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(1, ms / (1000 * 60 * 60));
}

function extractKeywords(texts: string[], limit = 20): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "is", "are", "was", "were", "be", "been", "being", "with", "from", "by",
    "this", "that", "these", "those", "it", "its", "as", "into", "about",
    "how", "what", "why", "when", "where", "who", "which", "you", "your",
    "my", "our", "their", "his", "her", "not", "no", "yes", "vs", "vs.",
    "shorts", "short", "video", "videos", "watch", "full", "new", "best",
    "top", "part", "episode", "ep", "official",
  ]);
  const counts = new Map<string, number>();
  for (const title of texts) {
    const words = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s#]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));
    const unique = new Set(words);
    for (const w of unique) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

async function hydrateStats(items: Array<{
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnail?: string;
}>): Promise<YouTubeVideoInsight[]> {
  if (!items.length) return [];
  const ids = items.map((i) => i.id).join(",");
  const stats = await ytGet("videos", {
    part: "statistics,snippet",
    id: ids,
  });
  const byId = new Map<string, any>();
  for (const v of stats.items || []) byId.set(v.id, v);

  return items.map((item) => {
    const v = byId.get(item.id);
    const viewCount = Number(v?.statistics?.viewCount || 0);
    const likeCount = Number(v?.statistics?.likeCount || 0);
    const commentCount = Number(v?.statistics?.commentCount || 0);
    const publishedAt = v?.snippet?.publishedAt || item.publishedAt;
    const viewVelocity = Math.round(viewCount / hoursSince(publishedAt));
    const description = String(v?.snippet?.description || "").slice(0, 600);
    return {
      id: item.id,
      title: v?.snippet?.title || item.title,
      description,
      channelTitle: v?.snippet?.channelTitle || item.channelTitle,
      channelId: v?.snippet?.channelId || item.channelId,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      publishedAt,
      viewCount,
      likeCount,
      commentCount,
      viewVelocity,
      thumbnail:
        item.thumbnail ||
        v?.snippet?.thumbnails?.medium?.url ||
        v?.snippet?.thumbnails?.default?.url,
    };
  });
}

async function searchVideos(query: string, order: string, maxResults: number) {
  const data = await ytGet("search", {
    part: "snippet",
    q: query,
    type: "video",
    order,
    maxResults: String(maxResults),
    relevanceLanguage: "en",
    videoDuration: "short", // faceless shorts / short-form bias
  });
  return (data.items || [])
    .map((item: any) => ({
      id: item.id?.videoId as string,
      title: item.snippet?.title as string,
      channelTitle: item.snippet?.channelTitle as string,
      channelId: item.snippet?.channelId as string,
      publishedAt: item.snippet?.publishedAt as string,
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url,
    }))
    .filter((v: any) => v.id);
}

async function mostPopularRelated(query: string, maxResults = 8) {
  // Most popular in region, then filter by query keyword soft-match via a second search
  try {
    const popular = await ytGet("videos", {
      part: "snippet,statistics",
      chart: "mostPopular",
      regionCode: "US",
      maxResults: "25",
      videoCategoryId: "22", // People & Blogs — common for faceless; fallback handled below
    });
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matched = (popular.items || [])
      .filter((v: any) => {
        const t = `${v.snippet?.title || ""} ${v.snippet?.description || ""}`.toLowerCase();
        return words.some((w) => t.includes(w));
      })
      .slice(0, maxResults)
      .map((v: any) => ({
        id: v.id as string,
        title: v.snippet.title as string,
        channelTitle: v.snippet.channelTitle as string,
        channelId: v.snippet.channelId as string,
        publishedAt: v.snippet.publishedAt as string,
        thumbnail: v.snippet?.thumbnails?.medium?.url,
      }));
    if (matched.length >= 3) return hydrateStats(matched);
  } catch {
    // category may fail — ignore
  }
  // Fallback: date-ordered search ≈ “trending now” for niche
  const recent = await searchVideos(query, "date", maxResults);
  return hydrateStats(recent);
}

function buildCompetitors(videos: YouTubeVideoInsight[]) {
  const map = new Map<
    string,
    { channelId: string; channelTitle: string; views: number[]; titles: string[] }
  >();
  for (const v of videos) {
    const cur = map.get(v.channelId) || {
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      views: [] as number[],
      titles: [] as string[],
    };
    cur.views.push(v.viewCount);
    if (cur.titles.length < 3) cur.titles.push(v.title);
    map.set(v.channelId, cur);
  }
  return [...map.values()]
    .map((c) => ({
      channelId: c.channelId,
      channelTitle: c.channelTitle,
      videoCount: c.views.length,
      avgViews: Math.round(c.views.reduce((a, b) => a + b, 0) / Math.max(1, c.views.length)),
      sampleTitles: c.titles,
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 8);
}

function buildBrief(research: Omit<YouTubeResearch, "brief">): string {
  const topTitles = research.popularTitles.slice(0, 8);
  const hot = [...research.trending, ...research.topByViews]
    .sort((a, b) => b.viewVelocity - a.viewVelocity)
    .slice(0, 5);
  const comps = research.competitors.slice(0, 4);

  return [
    `YouTube research for niche: "${research.niche}"`,
    `Keywords / topics: ${research.keywords.slice(0, 12).join(", ")}`,
    `Required hashtags (include these in caption AND description): ${hashtagsFromKeywords(research.keywords, 8).join(" ")}`,
    `Popular title patterns:\n${topTitles.map((t) => `- ${t}`).join("\n")}`,
    `High view-velocity clips:\n${hot
      .map(
        (v) =>
          `- "${v.title}" (${v.viewCount.toLocaleString()} views, ~${v.viewVelocity}/hr) — ${v.channelTitle}`,
      )
      .join("\n")}`,
    `Competitor channels:\n${comps
      .map((c) => `- ${c.channelTitle} (avg ${c.avgViews.toLocaleString()} views)`)
      .join("\n")}`,
    `Write a unique, self-contained story that can compete with these patterns. Do NOT copy titles verbatim. Do NOT make sequels, episodes, or part 2. Use hooks similar to high-velocity videos. Weave 3–6 keywords naturally into the spoken script. Caption and description MUST include the required hashtags listed above (plus 2–4 related tags).`,
  ].join("\n\n");
}

/**
 * Collect trending/popular YouTube signals for a faceless niche
 * BEFORE script/image/video generation.
 */
export async function researchYouTubeNiche(niche: string): Promise<YouTubeResearch> {
  const query = niche.slice(0, 120);

  const [byViewsRaw, byRelevanceRaw, trending] = await Promise.all([
    searchVideos(query, "viewCount", 10).then(hydrateStats),
    searchVideos(query, "relevance", 8).then(hydrateStats),
    mostPopularRelated(query, 8),
  ]);

  const merged = new Map<string, YouTubeVideoInsight>();
  for (const v of [...byViewsRaw, ...byRelevanceRaw, ...trending]) {
    const prev = merged.get(v.id);
    if (!prev || v.viewCount > prev.viewCount) merged.set(v.id, v);
  }
  const all = [...merged.values()];
  const topByViews = [...all].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
  const popularTitles = topByViews.map((v) => v.title);
  const keywords = extractKeywords([
    ...popularTitles,
    ...trending.map((v) => v.title),
    ...topByViews.map((v) => v.description.slice(0, 240)),
    ...trending.map((v) => v.description.slice(0, 240)),
    niche,
  ]);
  const competitors = buildCompetitors(all);

  const base = {
    niche: query,
    queriedAt: new Date().toISOString(),
    trending: [...trending].sort((a, b) => b.viewVelocity - a.viewVelocity).slice(0, 8),
    topByViews,
    popularTitles,
    keywords,
    competitors,
  };

  return { ...base, brief: buildBrief(base) };
}
