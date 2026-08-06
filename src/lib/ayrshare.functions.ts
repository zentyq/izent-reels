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

async function getUserId(): Promise<string> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) throw new Error("Not authenticated");
  return session.userId;
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
    let profiles = await prisma.ayrshareProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    });
    
    // Auto-create a default profile if the user has none (ensures 1 profile per user automatically)
    if (profiles.length === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const title = `${user?.name || "User"} ${Date.now()}`;
      
      const res = await api("/profiles/profile", {
        method: "POST",
        body: JSON.stringify({ title }),
      });

      if (res.profileKey) {
        const newProfile = await prisma.ayrshareProfile.create({
          data: {
            userId,
            profileKey: res.profileKey,
            title: "My Profile",
          }
        });
        profiles = [newProfile];
      }
    }
    
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
    
    // Note: Ayrshare requires the title to be unique.
    const title = `${data.name} ${Date.now()}`;
    const res = await api("/profiles/profile", {
      method: "POST",
      body: JSON.stringify({ title }),
    });

    if (res.profileKey) {
      await prisma.ayrshareProfile.create({
        data: {
          userId,
          profileKey: res.profileKey,
          title: data.name,
        }
      });
    }

    return res;
  });

export const listAccounts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      // Fetch connected accounts for this user profile
      const res = await api("/user", {}, data.projectId);
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
        "FACEBOOK",
        "INSTAGRAM",
        "X",
        "LINKEDIN",
        "TIKTOK",
        "YOUTUBE",
        "THREADS",
        "PINTEREST",
        "BLUESKY",
        "GOOGLE",
        "REDDIT",
        "SNAPCHAT",
        "TELEGRAM",
      ]),
      redirectUrl: z.string().url(),
    })
  )
  .handler(async ({ data }) => {
    let privateKey = process.env.AYRSHARE_PRIVATE_KEY;
    
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const fileKey = await fs.readFile(path.join(process.cwd(), "private.key"), "utf-8");
      privateKey = fileKey.replace(/\r\n/g, '\n').trim();
      privateKey = privateKey.replace("BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY");
      privateKey = privateKey.replace("END PRIVATE KEY", "END RSA PRIVATE KEY");
    } catch {
      // ignore, fallback to env
    }

    if (!privateKey || privateKey === "YOUR_AYRSHARE_PRIVATE_KEY") {
      throw new Error("Please add your AYRSHARE_PRIVATE_KEY in the environment variables or provide a private.key file to connect social accounts.");
    }

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
        profileKey: data.projectId,
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
      data.projectId
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
        "Profile-Key": data.projectId,
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
    return api("/history", { method: "GET" }, data.projectId);
  });
