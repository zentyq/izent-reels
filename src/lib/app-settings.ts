export const APP_SETTINGS_KEY = "app";

export type VisualModeId = "images" | "animated_hook" | "full_video";

export type AppSettings = {
  siteName: string;
  tagline: string;
  socialProofLabel: string;
  contactEmail: string;
  registrationOpen: boolean;
  maintenanceMode: boolean;

  defaultVoiceId: string;
  defaultDuration: string;
  defaultArtStyle: string;
  defaultCaptionStyle: string;
  defaultVisualMode: VisualModeId;
  defaultVideoModel: string;
  defaultPostsPerDay: number;
  defaultPostIntervalHours: number;
  defaultPublishTime: string;

  allowYouTubeImport: boolean;
  allowCustomVoice: boolean;
  allowCustomMusic: boolean;
  allowFullAiVideo: boolean;
  maxPostsPerDay: number;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  siteName: "Izent Reels",
  tagline: "Izent Reels scripts, produces, and publishes shorts to your connected accounts. You stay off camera.",
  socialProofLabel: "50,000+",
  contactEmail: "hello@izentreels.com",
  registrationOpen: true,
  maintenanceMode: false,

  defaultVoiceId: "JBFqnCBsd6RMkjVDRZzb",
  defaultDuration: "30-40",
  defaultArtStyle: "comic",
  defaultCaptionStyle: "bold-stroke",
  defaultVisualMode: "images",
  defaultVideoModel: "kwaivgi/kling-v3.0-std/image-to-video",
  defaultPostsPerDay: 1,
  defaultPostIntervalHours: 4,
  defaultPublishTime: "12:00",

  allowYouTubeImport: true,
  allowCustomVoice: true,
  allowCustomMusic: true,
  allowFullAiVideo: true,
  maxPostsPerDay: 5,
};

export function mergeAppSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_APP_SETTINGS,
    ...src,
    registrationOpen: src.registrationOpen ?? DEFAULT_APP_SETTINGS.registrationOpen,
    maintenanceMode: src.maintenanceMode ?? DEFAULT_APP_SETTINGS.maintenanceMode,
    allowYouTubeImport: src.allowYouTubeImport ?? DEFAULT_APP_SETTINGS.allowYouTubeImport,
    allowCustomVoice: src.allowCustomVoice ?? DEFAULT_APP_SETTINGS.allowCustomVoice,
    allowCustomMusic: src.allowCustomMusic ?? DEFAULT_APP_SETTINGS.allowCustomMusic,
    allowFullAiVideo: src.allowFullAiVideo ?? DEFAULT_APP_SETTINGS.allowFullAiVideo,
    defaultPostsPerDay: clampInt(src.defaultPostsPerDay, 1, 10, DEFAULT_APP_SETTINGS.defaultPostsPerDay),
    defaultPostIntervalHours: clampInt(
      src.defaultPostIntervalHours,
      1,
      12,
      DEFAULT_APP_SETTINGS.defaultPostIntervalHours,
    ),
    maxPostsPerDay: clampInt(src.maxPostsPerDay, 1, 10, DEFAULT_APP_SETTINGS.maxPostsPerDay),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export type PublicAppSettings = Pick<
  AppSettings,
  | "siteName"
  | "tagline"
  | "socialProofLabel"
  | "contactEmail"
  | "registrationOpen"
  | "maintenanceMode"
>;

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  return {
    siteName: settings.siteName,
    tagline: settings.tagline,
    socialProofLabel: settings.socialProofLabel,
    contactEmail: settings.contactEmail,
    registrationOpen: settings.registrationOpen,
    maintenanceMode: settings.maintenanceMode,
  };
}
