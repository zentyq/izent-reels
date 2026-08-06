export const SERIES_STEPS = [
  { id: 1, key: "niche", title: "Format, type & niche", optional: false },
  { id: 2, key: "voice", title: "Voice", optional: false },
  { id: 3, key: "music", title: "Background Music", optional: true },
  { id: 4, key: "art", title: "Art Style", optional: false },
  { id: 5, key: "caption", title: "Caption Style", optional: false },
  { id: 6, key: "effects", title: "Visual mode & effects", optional: true },
  { id: 7, key: "social", title: "Connect Social Accounts", optional: false },
  { id: 8, key: "details", title: "Series Details", optional: false },
] as const;

/** Short vertical reels vs long horizontal videos */
export const VIDEO_FORMATS = [
  {
    id: "short",
    label: "Short Reels",
    description: "Vertical 9:16 clips for TikTok, Instagram Reels, and YouTube Shorts (10s–5min).",
    aspectRatio: "9:16" as const,
    width: 720,
    height: 1280,
  },
  {
    id: "long",
    label: "Long Video",
    description: "Horizontal 16:9 videos for YouTube & Facebook (5–30 minutes).",
    aspectRatio: "16:9" as const,
    width: 1280,
    height: 720,
  },
] as const;

/** What kind of video the series produces */
export const SERIES_CONTENT_MODES = [
  {
    id: "faceless",
    label: "Faceless stories",
    description: "Narrated story content with illustrated scenes — horror, history, myths, and more.",
  },
  {
    id: "ugc",
    label: "UGC / creator",
    description: "Creator style — product demos, routines, tips, and authentic hooks.",
  },
  {
    id: "commercial",
    label: "Commercial / ads",
    description: "Polished product ads, offers, and brand commercials ready to post.",
  },
] as const;

/** How visuals are produced for each scene */
export const VISUAL_MODES = [
  {
    id: "images",
    label: "Scene images",
    description: "Generate a unique AI image for every scene, then slideshow them (fastest).",
  },
  {
    id: "animated_hook",
    label: "Animated hook",
    description: "Real AI video for the opening scene, plus unique images for every following scene.",
  },
  {
    id: "full_video",
    label: "Full AI video",
    description: "Real AI video for every scene (Kling / Seedance / Veo), then FFmpeg merges them.",
  },
] as const;

export const NICHE_PRESETS = [
  {
    id: "scary-stories",
    label: "Scary stories",
    description: "Scary stories that give you goosebumps",
  },
  {
    id: "history",
    label: "History",
    description: "Viral videos about history spanning from ancient times to the modern day.",
  },
  {
    id: "greek-mythology",
    label: "Greek Mythology",
    description: "Shocking and dramatic stories from Greek mythology.",
  },
  {
    id: "historical-figures",
    label: "Historical Figures",
    description: "Life story in one minute videos about the most important historical figures.",
  },
  {
    id: "true-crime",
    label: "True Crime",
    description: "Viral videos about true crime stories.",
  },
  {
    id: "stoic-motivation",
    label: "Stoic Motivation",
    description: "Viral videos about stoic philosophy and life lessons.",
  },
  {
    id: "good-morals",
    label: "Good morals",
    description: "Viral videos that teach people good morals and life lessons.",
  },
] as const;

export const UGC_NICHE_PRESETS = [
  {
    id: "product-unboxing",
    label: "Product unboxing",
    description: "Creator-style unboxing with honest reactions and close-up details.",
  },
  {
    id: "skincare-routine",
    label: "Skincare / beauty routine",
    description: "Step-by-step beauty or skincare content that feels native to TikTok.",
  },
  {
    id: "app-demo",
    label: "App / tool demo",
    description: "Quick UGC demo of an app or tool solving a real problem.",
  },
  {
    id: "fitness-tip",
    label: "Fitness tip",
    description: "Short workout tips and transformations in creator style.",
  },
  {
    id: "food-review",
    label: "Food review",
    description: "Tasty food reviews and recipe hooks with strong first-second grab.",
  },
  {
    id: "day-in-life",
    label: "Day in the life",
    description: "Relatable day-in-the-life clips with a product or habit woven in.",
  },
] as const;

export const COMMERCIAL_NICHE_PRESETS = [
  {
    id: "product-launch",
    label: "Product launch",
    description: "High-energy launch ad highlighting the hero product benefit.",
  },
  {
    id: "brand-story",
    label: "Brand story",
    description: "Emotional brand film style spot that builds trust fast.",
  },
  {
    id: "offer-promo",
    label: "Offer / promo",
    description: "Limited-time offer commercial with clear CTA.",
  },
  {
    id: "testimonial-ad",
    label: "Testimonial ad",
    description: "Customer-proof style ad with problem → solution → result.",
  },
  {
    id: "saas-demo",
    label: "SaaS / service demo",
    description: "Clean commercial demo of software or a service outcome.",
  },
] as const;

export function nichesForContentMode(mode: string) {
  if (mode === "ugc") return UGC_NICHE_PRESETS;
  if (mode === "commercial") return COMMERCIAL_NICHE_PRESETS;
  return NICHE_PRESETS;
}

export const VOICE_PRESETS = [
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    label: "George",
    description: "Warm narrative voice for storytelling",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Sarah",
    description: "Clear, engaging female narrator",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    label: "Daniel",
    description: "Deep, cinematic male voice",
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    label: "Jessica",
    description: "Bright conversational tone",
  },
] as const;

export const MUSIC_PRESETS = [
  {
    id: "creepy-melody",
    label: "Creepy melody",
    description: "Haunting and unsettling melody",
    prompt: "Haunting creepy ambient melody, unsettling soft pads, no vocals",
    gradient: "from-pink-500 to-purple-600",
  },
  {
    id: "horror-piano",
    label: "Horror piano",
    description: "Dark and chilling piano keys",
    prompt: "Dark chilling solo piano horror underscore, sparse and tense, no vocals",
    gradient: "from-red-500 to-orange-600",
  },
  {
    id: "unsolved-mystery",
    label: "Unsolved mystery",
    description: "Suspenseful and intriguing atmosphere",
    prompt: "Suspenseful mystery soundtrack, intriguing atmosphere, cinematic, no vocals",
    gradient: "from-orange-400 to-amber-600",
  },
  {
    id: "8bit-slowed",
    label: "8-bit slowed",
    description: "Eerie chiptune with a haunting retro feel",
    prompt: "Eerie slowed 8-bit chiptune, haunting retro game feel, no vocals",
    gradient: "from-teal-400 to-cyan-600",
  },
  {
    id: "quiet-before-storm",
    label: "Quiet before storm",
    description: "Building tension and anticipation for dramatic reveals",
    prompt: "Building tension cinematic underscore, quiet before the storm, no vocals",
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    id: "brilliant-symphony",
    label: "Brilliant symphony",
    description: "Orchestral and majestic for epic storytelling",
    prompt: "Orchestral majestic symphony for epic storytelling, emotional strings, no vocals",
    gradient: "from-indigo-500 to-violet-600",
  },
  {
    id: "upbeat-ugc",
    label: "Upbeat UGC",
    description: "Bright trendy energy for creator / product clips",
    prompt: "Upbeat trendy social media background track, bright positive energy, no vocals",
    gradient: "from-emerald-400 to-lime-500",
  },
  {
    id: "commercial-pulse",
    label: "Commercial pulse",
    description: "Clean modern ad soundtrack",
    prompt: "Modern clean commercial advertising underscore, confident pulse, no vocals",
    gradient: "from-sky-500 to-blue-700",
  },
] as const;

export const ART_STYLES = [
  {
    id: "comic",
    label: "Comic",
    image: "/series/art-styles/comic.png",
    promptHint: "clean comic book illustration style, bold outlines, flat colors",
  },
  {
    id: "creepy-comic",
    label: "Creepy Comic",
    image: "/series/art-styles/creepy-comic.png",
    promptHint: "creepy comic illustration, dark mood, expressive shocked characters",
  },
  {
    id: "modern-cartoon",
    label: "Modern Cartoon",
    image: "/series/art-styles/modern-cartoon.png",
    promptHint: "modern cartoon style, clean vector-like characters, soft shading",
  },
  {
    id: "disney",
    label: "Disney",
    image: "/series/art-styles/disney.png",
    promptHint: "3D animated Pixar/Disney style, soft lighting, cinematic",
  },
  {
    id: "photoreal",
    label: "Photoreal / UGC",
    image: "/series/art-styles/modern-cartoon.png",
    promptHint:
      "photorealistic vertical phone-camera UGC aesthetic, natural lighting, authentic creator look, no illustration",
  },
  {
    id: "commercial-photo",
    label: "Commercial photo",
    image: "/series/art-styles/disney.png",
    promptHint:
      "polished commercial advertising photography, cinematic product lighting, premium brand look, photoreal",
  },
] as const;

export const CAPTION_STYLES = [
  { id: "bold-stroke", label: "Bold Stroke", preview: "BOLD" },
  { id: "red-highlight", label: "Red Highlight", preview: "HOOK" },
  { id: "sleek", label: "Sleek", preview: "SLEEK" },
  { id: "karaoke", label: "Karaoke", preview: "WORD" },
  { id: "majestic", label: "Majestic", preview: "EPIC" },
  { id: "beast", label: "Beast", preview: "BEAST" },
  { id: "elegant", label: "Elegant", preview: "Elegant" },
  { id: "pixel", label: "Pixel", preview: "PIXEL" },
  { id: "clarity", label: "Clarity", preview: "clarity" },
] as const;

/** Target lengths for short vertical reels (10s → 5min) */
export const VIDEO_DURATIONS = [
  { id: "10", label: "10 seconds", seconds: 10, monetizable: false },
  { id: "15", label: "15 seconds", seconds: 15, monetizable: false },
  { id: "20", label: "20 seconds", seconds: 20, monetizable: false },
  { id: "30", label: "30 seconds", seconds: 30, monetizable: false },
  { id: "45", label: "45 seconds", seconds: 45, monetizable: false },
  { id: "60", label: "60 seconds", seconds: 60, monetizable: true },
  { id: "90", label: "90 seconds", seconds: 90, monetizable: true },
  { id: "120", label: "2 minutes", seconds: 120, monetizable: true },
  { id: "180", label: "3 minutes", seconds: 180, monetizable: true },
  { id: "240", label: "4 minutes", seconds: 240, monetizable: true },
  { id: "300", label: "5 minutes", seconds: 300, monetizable: true },
] as const;

/** Target lengths for long horizontal videos (5 → 30 min) */
export const LONG_VIDEO_DURATIONS = [
  { id: "long-5", label: "5 minutes", seconds: 300, monetizable: true },
  { id: "long-8", label: "8 minutes", seconds: 480, monetizable: true },
  { id: "long-10", label: "10 minutes", seconds: 600, monetizable: true },
  { id: "long-15", label: "15 minutes", seconds: 900, monetizable: true },
  { id: "long-20", label: "20 minutes", seconds: 1200, monetizable: true },
  { id: "long-25", label: "25 minutes", seconds: 1500, monetizable: true },
  { id: "long-30", label: "30 minutes", seconds: 1800, monetizable: true },
] as const;

/** Map duration id (including legacy) → seconds */
export function durationSeconds(duration: string): number {
  const short = VIDEO_DURATIONS.find((d) => d.id === duration);
  if (short) return short.seconds;
  const long = LONG_VIDEO_DURATIONS.find((d) => d.id === duration);
  if (long) return long.seconds;
  if (duration === "30-40") return 35;
  if (duration === "60-70") return 65;
  const n = Number(duration);
  if (Number.isFinite(n) && n >= 10 && n <= 1800) return Math.round(n);
  return 30;
}

export function durationsForFormat(format: string) {
  return format === "long" ? LONG_VIDEO_DURATIONS : VIDEO_DURATIONS;
}

/**
 * Scene count by format.
 * Short: ~1 scene / 10s (max 30). Long: ~1 scene / 25s (max 48).
 */
export function sceneCountForDuration(durationSec: number, format = "short"): number {
  if (format === "long") {
    return Math.min(48, Math.max(8, Math.round(durationSec / 25)));
  }
  return Math.min(30, Math.max(3, Math.round(durationSec / 10)));
}

export function aspectForFormat(format: string): "9:16" | "16:9" {
  return format === "long" ? "16:9" : "9:16";
}

export function frameSizeForFormat(format: string): { width: number; height: number } {
  return format === "long" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
}

export const SERIES_PLATFORMS = [
  { id: "TIKTOK", label: "TikTok", formats: ["short"] as const },
  { id: "INSTAGRAM", label: "Instagram", formats: ["short"] as const },
  { id: "YOUTUBE", label: "YouTube", formats: ["short", "long"] as const },
  { id: "FACEBOOK", label: "Facebook", formats: ["long", "short"] as const },
] as const;

export function platformsForFormat(format: string) {
  return SERIES_PLATFORMS.filter((p) =>
    (p.formats as readonly string[]).includes(format === "long" ? "long" : "short"),
  );
}

export const WAVESPEED_VIDEO_MODELS = [
  {
    id: "kwaivgi/kling-v3.0-std/image-to-video",
    label: "Kling 3.0 Std",
    note: "Fast · great motion",
  },
  {
    id: "kwaivgi/kling-v3.0-pro/image-to-video",
    label: "Kling 3.0 Pro",
    note: "Higher quality",
  },
  {
    id: "bytedance/seedance-v1-pro-fast/image-to-video",
    label: "Seedance Pro Fast",
    note: "Cinematic · fast",
  },
  {
    id: "google/veo3.1/image-to-video",
    label: "Google Veo 3.1",
    note: "Premium motion",
  },
  {
    id: "google/veo3.1-fast/image-to-video",
    label: "Google Veo 3.1 Fast",
    note: "Veo · faster",
  },
] as const;

/** @deprecated Use WAVESPEED_VIDEO_MODELS */
export const GOOGLE_VIDEO_MODELS = WAVESPEED_VIDEO_MODELS;
/** @deprecated Use WAVESPEED_VIDEO_MODELS */
export const RUNWAY_MODELS = WAVESPEED_VIDEO_MODELS;
