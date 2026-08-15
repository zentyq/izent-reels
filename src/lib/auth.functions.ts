import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "./db";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getUserAdminFields, promoteAdminIfNeeded, readAppSettings } from "./admin.functions";

const SESSION_COOKIE = "izent_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Register ──────────────────────────────────────────────
export const register = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      password: z.string().min(6).max(100),
    })
  )
  .handler(async ({ data }) => {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return { ok: false as const, error: "An account with this email already exists." };
    }

    const [settings, userCount] = await Promise.all([
      readAppSettings(),
      prisma.user.count(),
    ]);
    if (!settings.registrationOpen && userCount > 0) {
      return { ok: false as const, error: "Registration is closed right now." };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
      },
    });
    const user = await promoteAdminIfNeeded(created);

    // Auto-login after register
    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE),
      },
    });

    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE / 1000,
      path: "/",
    });

    return {
      ok: true as const,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

// ─── Login ─────────────────────────────────────────────────
export const login = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const found = await prisma.user.findUnique({ where: { email: data.email } });
    if (!found) {
      return { ok: false as const, error: "Invalid email or password." };
    }
    const adminFields = await getUserAdminFields(found.id);
    if (adminFields.status === "suspended") {
      return { ok: false as const, error: "This account has been suspended." };
    }

    const valid = await bcrypt.compare(data.password, found.passwordHash);
    if (!valid) {
      return { ok: false as const, error: "Invalid email or password." };
    }
    const user = await promoteAdminIfNeeded(found);

    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE),
      },
    });

    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE / 1000,
      path: "/",
    });

    return {
      ok: true as const,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  });

// ─── Logout ────────────────────────────────────────────────
export const logout = createServerFn({ method: "POST" })
  .handler(async () => {
    const token = getCookie(SESSION_COOKIE);
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
      deleteCookie(SESSION_COOKIE, { path: "/" });
    }
    return { ok: true as const };
  });

// ─── Get Current User ──────────────────────────────────────
export const getMe = createServerFn({ method: "GET" })
  .handler(async () => {
    const token = getCookie(SESSION_COOKIE);
    if (!token) {
      return { ok: false as const, user: null };
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      deleteCookie(SESSION_COOKIE, { path: "/" });
      return { ok: false as const, user: null };
    }

    const adminFields = await getUserAdminFields(session.user.id);
    if (adminFields.status === "suspended") {
      await prisma.session.delete({ where: { id: session.id } });
      deleteCookie(SESSION_COOKIE, { path: "/" });
      return { ok: false as const, user: null };
    }

    const user = await promoteAdminIfNeeded({ ...session.user, role: adminFields.role });

    return {
      ok: true as const,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasInstagramCookie: !!session.user.instagramCookie,
      },
    };
  });

// ─── Verify Auth Helper ────────────────────────────────────
async function verifyAuth() {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not authenticated");

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    throw new Error("Session expired");
  }
  return session.user;
}

// ─── Update Settings ──────────────────────────────────────
export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      instagramCookie: z.string().max(2000).optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      const user = await verifyAuth();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          instagramCookie: data.instagramCookie || null,
        },
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

// ─── Get Instagram Cookie (internal helper for download functions) ──
export const getInstagramCookie = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const user = await verifyAuth();
      return { ok: true as const, cookie: user.instagramCookie || null };
    } catch {
      return { ok: false as const, cookie: null };
    }
  });

// ─── List User Chats ───────────────────────────────────────
export const listChats = createServerFn({ method: "GET" })
  .handler(async () => {
    const token = getCookie(SESSION_COOKIE);
    if (!token) return { ok: false as const, chats: [] };

    const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
    if (!session) return { ok: false as const, chats: [] };

    const chats = await prisma.chat.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    });

    return { ok: true as const, chats };
  });

// ─── Create Chat ───────────────────────────────────────────
export const createChat = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const token = getCookie(SESSION_COOKIE);
      if (!token) return { ok: false as const, error: "Not authenticated" };

      const session = await prisma.session.findUnique({ where: { token } });
      if (!session) return { ok: false as const, error: "Not authenticated" };

      const chat = await prisma.chat.create({
        data: { userId: session.userId, title: "New Chat" },
      });

      return { ok: true as const, chatId: chat.id };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: "Failed to create chat on server." };
    }
  });

// ─── Save Message ──────────────────────────────────────────
export const saveMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      chatId: z.string(),
      role: z.string(),
      content: z.string(), // JSON stringified parts
    })
  )
  .handler(async ({ data }) => {
    await prisma.message.create({
      data: { chatId: data.chatId, role: data.role, content: data.content },
    });

    // Update the chat title from the first user message
    if (data.role === "user") {
      const chat = await prisma.chat.findUnique({ where: { id: data.chatId } });
      if (chat && chat.title === "New Chat") {
        const parsed = JSON.parse(data.content);
        const text = parsed.find((p: any) => p.text)?.text || "";
        if (text) {
          await prisma.chat.update({
            where: { id: data.chatId },
            data: { title: text.slice(0, 60) },
          });
        }
      }
    }

    return { ok: true as const };
  });

// ─── Rename Chat ──────────────────────────────────────────
export const renameChat = createServerFn({ method: "POST" })
  .inputValidator(z.object({ chatId: z.string(), title: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const user = await verifyAuth();
    const chat = await prisma.chat.findUnique({ where: { id: data.chatId } });
    if (!chat || chat.userId !== user.id) return { ok: false as const, error: "Unauthorized" };

    await prisma.chat.update({
      where: { id: data.chatId },
      data: { title: data.title },
    });
    return { ok: true as const };
  });

// ─── Delete Chat ──────────────────────────────────────────
export const deleteChat = createServerFn({ method: "POST" })
  .inputValidator(z.object({ chatId: z.string() }))
  .handler(async ({ data }) => {
    const user = await verifyAuth();
    const chat = await prisma.chat.findUnique({ where: { id: data.chatId } });
    if (!chat || chat.userId !== user.id) return { ok: false as const, error: "Unauthorized" };

    await prisma.chat.delete({
      where: { id: data.chatId },
    });
    return { ok: true as const };
  });

// ─── Load Chat Messages ───────────────────────────────────
export const loadChatMessages = createServerFn({ method: "POST" })
  .inputValidator(z.object({ chatId: z.string() }))
  .handler(async ({ data }) => {
    const messages = await prisma.message.findMany({
      where: { chatId: data.chatId },
      orderBy: { createdAt: "asc" },
    });

    return {
      ok: true as const,
      messages: messages.map((m) => ({
        role: m.role,
        parts: JSON.parse(m.content),
      })),
    };
  });
