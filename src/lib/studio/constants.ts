export const STUDIO_BRAND = "Forge";
export const STUDIO_TAGLINE = "Long AI video from prompt to download";

/** WaveSpeed image→video models for Forge */
export const STUDIO_VIDEO_MODELS = [
  {
    id: "kwaivgi/kling-v3.0-std/image-to-video",
    label: "Kling 3.0 Std",
    note: "Fast · strong motion",
    badge: "Popular",
  },
  {
    id: "kwaivgi/kling-v3.0-pro/image-to-video",
    label: "Kling 3.0 Pro",
    note: "Higher fidelity",
  },
  {
    id: "bytedance/seedance-v1-pro-fast/image-to-video",
    label: "Seedance Pro Fast",
    note: "Cinematic · fast",
    badge: "New",
  },
  {
    id: "google/veo3.1/image-to-video",
    label: "Google Veo 3.1",
    note: "Premium motion",
  },
  {
    id: "google/veo3.1-fast/image-to-video",
    label: "Veo 3.1 Fast",
    note: "Veo · quicker",
  },
] as const;

export const STUDIO_ASPECTS = [
  { id: "16:9", label: "16:9 Landscape", hint: "YouTube · film" },
  { id: "9:16", label: "9:16 Vertical", hint: "Shorts · Reels · TikTok" },
] as const;

/** Duration presets from 5s up to 15 minutes */
export const STUDIO_DURATIONS = [
  { id: 5, label: "5s", seconds: 5 },
  { id: 10, label: "10s", seconds: 10 },
  { id: 15, label: "15s", seconds: 15 },
  { id: 30, label: "30s", seconds: 30 },
  { id: 60, label: "1 min", seconds: 60 },
  { id: 120, label: "2 min", seconds: 120 },
  { id: 300, label: "5 min", seconds: 300 },
  { id: 600, label: "10 min", seconds: 600 },
  { id: 900, label: "15 min", seconds: 900 },
] as const;

/** Seconds per WaveSpeed clip (models accept ~4–10s) */
export const STUDIO_CLIP_SEC = 5;

export function clipCountForDuration(durationSec: number): number {
  const d = Math.max(1, Math.min(900, Math.round(durationSec)));
  return Math.max(1, Math.ceil(d / STUDIO_CLIP_SEC));
}
