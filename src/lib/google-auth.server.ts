import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { promoteAdminIfNeeded, readAppSettings } from "./admin.functions";

const SESSION_COOKIE = "izent_session";
const OAUTH_STATE_COOKIE = "izent_google_oauth";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds
const STATE_MAX_AGE = 10 * 60; // seconds

function appOrigin() {
  const raw = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (raw) return raw;
  return "http://localhost:8080";
}

function sessionCookieSecure() {
  const appUrl = process.env.APP_URL || "";
  if (appUrl.startsWith("https://")) return true;
  if (appUrl.startsWith("http://")) return false;
  return process.env.NODE_ENV === "production";
}

function cookieParts(name: string, value: string, maxAge: number) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (sessionCookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name: string) {
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (sessionCookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("=") || "");
  }
  return null;
}

function googleCreds() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function redirectUri() {
  return `${appOrigin()}/auth/google/callback`;
}

function redirectWithCookies(location: string, cookies: string[]) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

function errorRedirect(message: string, cookies: string[] = []) {
  const url = new URL(appOrigin());
  url.pathname = "/";
  url.searchParams.set("auth", "signin");
  url.searchParams.set("authError", message);
  return redirectWithCookies(url.toString(), cookies);
}

/** Start Google OAuth — redirect browser to Google consent screen. */
export async function handleGoogleAuthStart(request: Request): Promise<Response> {
  try {
    const { clientId } = googleCreds();
    const state = randomBytes(24).toString("hex");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
      state,
      include_granted_scopes: "true",
    });
    return redirectWithCookies(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      [cookieParts(OAUTH_STATE_COOKIE, state, STATE_MAX_AGE)],
    );
  } catch (e) {
    return errorRedirect((e as Error).message);
  }
}

/** Finish Google OAuth — create/link user, set session cookie, redirect into app. */
export async function handleGoogleAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const clearState = clearCookie(OAUTH_STATE_COOKIE);

  if (oauthError) {
    return errorRedirect(
      oauthError === "access_denied"
        ? "Google sign-in was cancelled."
        : `Google sign-in failed (${oauthError}).`,
      [clearState],
    );
  }

  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorRedirect("Google sign-in expired. Please try again.", [clearState]);
  }

  try {
    const { clientId, clientSecret } = googleCreds();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tokenBody = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenBody.access_token) {
      throw new Error(
        tokenBody.error_description || tokenBody.error || "Could not exchange Google auth code.",
      );
    }

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
    };
    if (!profileRes.ok || !profile.sub) {
      throw new Error("Could not load Google profile.");
    }
    if (!profile.email) {
      throw new Error("Your Google account did not share an email address.");
    }
    if (profile.email_verified === false) {
      throw new Error("Please verify your Google email, then try again.");
    }

    const email = profile.email.trim().toLowerCase();
    const name =
      (profile.name || profile.given_name || email.split("@")[0] || "Creator").trim().slice(0, 100);

    let user =
      (await prisma.user.findUnique({ where: { googleId: profile.sub } })) ||
      (await prisma.user.findUnique({ where: { email } }));

    if (user) {
      const adminFields = await prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      });
      if (adminFields?.status === "suspended") {
        return errorRedirect("This account has been suspended.", [clearState]);
      }
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.sub,
            name: user.name || name,
          },
        });
      }
    } else {
      const [settings, userCount] = await Promise.all([
        readAppSettings(),
        prisma.user.count(),
      ]);
      if (!settings.registrationOpen && userCount > 0) {
        return errorRedirect("Registration is closed right now.", [clearState]);
      }
      user = await prisma.user.create({
        data: {
          email,
          name,
          googleId: profile.sub,
          passwordHash: null,
        },
      });
    }

    user = await promoteAdminIfNeeded(user);

    const sessionToken = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      },
    });

    const seriesCount = await prisma.series.count({
      where: { userId: user.id, status: { not: "pending_payment" } },
    });
    const pending = await prisma.series.findFirst({
      where: { userId: user.id, status: "pending_payment" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    let nextPath = "/series/create";
    if (pending?.id && seriesCount === 0) {
      nextPath = `/subscribe?seriesId=${encodeURIComponent(pending.id)}`;
    } else if (seriesCount > 0) {
      nextPath = "/series/videos";
    }

    return redirectWithCookies(`${appOrigin()}${nextPath}`, [
      clearState,
      cookieParts(SESSION_COOKIE, sessionToken, SESSION_MAX_AGE),
    ]);
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return errorRedirect((e as Error).message || "Google sign-in failed.", [clearState]);
  }
}
