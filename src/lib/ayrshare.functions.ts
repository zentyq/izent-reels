import { createPrivateKey } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "./db";
import { getCookie } from "@tanstack/react-start/server";

const BASE_URL = "https://api.ayrshare.com/api";
const SESSION_COOKIE = "izent_session";

function apiKey() {
  const k = process.env.AYRSHARE_API_KEY;
  if (!k) throw new Error("AYRSHARE_API_KEY is not configured");
  return k;
}

/**
 * Ayrshare JWT needs a real RSA PEM. Railway/env pastes often store the key with
 * literal `\n` (not newlines). Also never rename PKCS#8 headers to PKCS#1 without
 * re-encoding — that breaks RS256 ("secretOrPrivateKey must be an asymmetric key").
 */
function normalizeAyrsharePrivateKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (key.includes("\\n")) {
    key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  }
  key = key.replace(/\r\n/g, "\n").trim();
  if (!key.includes("BEGIN") || !key.includes("PRIVATE KEY")) {
    throw new Error(
      "AYRSHARE_PRIVATE_KEY is missing or invalid — paste the full private.key from your Ayrshare Integration Package (including BEGIN/END lines).",
    );
  }
  try {
    // Export PKCS#1 PEM — format Ayrshare documents (BEGIN RSA PRIVATE KEY)
    return createPrivateKey(key).export({ type: "pkcs1", format: "pem" }).toString();
  } catch {
    throw new Error(
      "AYRSHARE_PRIVATE_KEY could not be parsed as an RSA key. Re-download private.key from Ayrshare → API → Integration Package and set AYRSHARE_PRIVATE_KEY with \\n for newlines.",
    );
  }
}

async function resolveAyrsharePrivateKey(): Promise<string> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const fileKey = await fs.readFile(path.join(process.cwd(), "private.key"), "utf-8");
    return normalizeAyrsharePrivateKey(fileKey);
  } catch {
    // private.key is gitignored — production uses the env var
  }
  const fromEnv = process.env.AYRSHARE_PRIVATE_KEY;
  if (!fromEnv || fromEnv === "YOUR_AYRSHARE_PRIVATE_KEY") {
    throw new Error(
      "Please add AYRSHARE_PRIVATE_KEY in Railway (full private.key from Ayrshare Integration Package) to connect social accounts.",
    );
  }
  return normalizeAyrsharePrivateKey(fromEnv);
}

async function getUserId(): Promise<string> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  return session.userId;
}

/** Profile-Key must belong to the logged-in user — prevents seeing another user's accounts. */
export async function assertOwnedProfileKey(userId: string, profileKey: string) {
  const row = await prisma.ayrshareProfile.findFirst({
    where: { userId, profileKey },
  });
  if (!row) {
    throw new Error(
      "This social profile is not linked to your account. Open Series Settings → Social and connect again.",
    );
  }
  return row;
}

async function createAyrshareProfileForUser(userId: string, titleBase = "My Profile") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const title = `${titleBase} ${user?.name || "User"} ${Date.now()}`;
  const res = await api("/profiles/profile", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (!res.profileKey) throw new Error("Ayrshare did not return a profileKey");
  return prisma.ayrshareProfile.create({
    data: {
      userId,
      profileKey: res.profileKey,
      title: titleBase,
    },
  });
}

/** Always returns this user's own Ayrshare profileKey (creates one if needed). */
export async function getOrCreateOwnedProfileKey(userId: string): Promise<string> {
  const existing = await prisma.ayrshareProfile.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.profileKey;
  const created = await createAyrshareProfileForUser(userId);
  return created.profileKey;
}

/** Use client key only if owned; otherwise fall back to the user's own profile. */
export async function resolveOwnedProfileKey(
  userId: string,
  maybeKey?: string | null,
): Promise<string> {
  if (maybeKey) {
    const owned = await prisma.ayrshareProfile.findFirst({
      where: { userId, profileKey: maybeKey },
    });
    if (owned) return owned.profileKey;
  }
  return getOrCreateOwnedProfileKey(userId);
}

async function api(path: string, init: RequestInit = {}, profileKey?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey()}`,
    ...((init.headers as any) || {}),
  };

  if (profileKey) {
    headers["Profile-Key"] = profileKey;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const raw = await res.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }

  if (!res.ok || body.status === "error") {
    console.error("Ayrshare error", path, res.status, raw);
    throw new Error(`[${res.status}] ${body.message || raw}`);
  }
  return body;
}

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const userId = await getUserId();
    await getOrCreateOwnedProfileKey(userId);
    const profiles = await prisma.ayrshareProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    const projects = profiles.map((p) => ({
      projectId: p.profileKey,
      name: p.title,
    }));
    return { data: projects, error: null as string | null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
});

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const userId = await getUserId();
    // Prefer reusing the user's existing profile (1 profile per user on Business plan)
    const existing = await prisma.ayrshareProfile.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      return { profileKey: existing.profileKey, title: existing.title, reused: true };
    }
    const created = await createAyrshareProfileForUser(userId, data.name);
    return { profileKey: created.profileKey, title: created.title, reused: false };
  });

export const listAccounts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const userId = await getUserId();
      // Never list another user's Ayrshare profile
      const profileKey = await resolveOwnedProfileKey(userId, data.projectId);
      const res = await api("/user", {}, profileKey);
      const activePlatforms = res.activeSocialAccounts || [];
      const displayNames = res.displayNames || [];

      const accounts = activePlatforms.map((platform: string) => {
        const details = displayNames.find((d: any) => d.platform === platform) || {};
        return {
          platform: platform.toUpperCase(),
          socialAccountId: details.id || platform,
          username: details.username || "",
          displayName: details.displayName || "",
          avatarUrl: details.userImage || "",
        };
      });
      return { data: accounts, error: null as string | null };
    } catch (e) {
      if ((e as Error).message.includes("403")) {
        // If profile doesn't exist anymore or unauthorized, return empty array
        return { data: [], error: null };
      }
      return { data: null, error: (e as Error).message };
    }
  });

export const generateOAuthUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      platform: z.enum([
        "YOUTUBE",
        "FACEBOOK",
        "INSTAGRAM",
        "TIKTOK",
      ]),
      redirectUrl: z.string().url(),
    })
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const profileKey = await resolveOwnedProfileKey(userId, data.projectId);
    const privateKey = await resolveAyrsharePrivateKey();
    const domain = process.env.AYRSHARE_DOMAIN || "id-ENrMP";

    const res = await fetch("https://api.ayrshare.com/api/profiles/generateJWT", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain,
        privateKey,
        profileKey,
        allowedSocial: [data.platform.toLowerCase()],
      }),
    });

    const raw = await res.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }

    if (!res.ok || body.status === "error") {
      throw new Error(`[${res.status}] ${body.message || raw}`);
    }

    return { authorizationUrl: body.url };
  });

export const uploadMedia = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      contentType: z.string().min(1).max(100),
      base64: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const profileKey = await resolveOwnedProfileKey(userId, data.projectId);
    const ext = data.contentType.startsWith("video/")
      ? data.contentType.split("/")[1] || "mp4"
      : data.contentType.startsWith("image/")
        ? data.contentType.split("/")[1] || "jpg"
        : "bin";
    const filename = `upload.${ext}`;

    const fileDataUri = `data:${data.contentType};base64,${data.base64}`;

    const res = await api(
      "/media/upload",
      {
        method: "POST",
        body: JSON.stringify({
          file: fileDataUri,
          fileName: filename,
          description: "Uploaded via IzentSocial",
        }),
      },
      profileKey,
    );

    return { mediaId: res.url }; // Return the URL as mediaId
  });

export const createPost = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1),
      contentText: z.string().min(1).max(10000),
      mediaId: z.string().optional().nullable(),
      mediaKind: z.enum(["image", "video", "none"]).optional(),
      socialAccounts: z.array(z.any()).min(1),
    })
  )
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const profileKey = await resolveOwnedProfileKey(userId, data.projectId);
    // Map platforms to ayrshare format (lowercase string array)
    const platforms = data.socialAccounts.map((a) => a.platform.toLowerCase());
    const mediaUrls = data.mediaId ? [data.mediaId] : undefined;

    const bodyObj: any = {
      post: data.contentText,
      platforms,
      mediaUrls,
    };

    if (platforms.includes("youtube")) {
      // YouTube strictly requires a title. Use the first line of the post or a default.
      let title = data.contentText.split('\n')[0].trim().substring(0, 95);
      if (!title) title = "Uploaded via IzentSocial";
      
      bodyObj.youTubeOptions = {
        title: title,
        visibility: "public"
      };
    }

    // Use direct fetch instead of api() helper so partial success doesn't throw
    const res = await fetch(`https://api.ayrshare.com/api/post`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "Profile-Key": profileKey,
      },
      body: JSON.stringify(bodyObj),
    });

    const raw = await res.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }

    // Only throw on complete HTTP failure (not Ayrshare partial errors)
    if (!res.ok && res.status >= 500) {
      throw new Error("Server error. Please try again later.");
    }

    return body;
  });

export const listHistory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await getUserId();
    const profileKey = await resolveOwnedProfileKey(userId, data.projectId);
    return api("/history", { method: "GET" }, profileKey);
  });
