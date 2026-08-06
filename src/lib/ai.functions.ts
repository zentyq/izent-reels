import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Gemini 2.5 Flash — fast, free-tier friendly, great for short generations.
const MODEL = "gemini-flash-latest";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM = `You are a social media copywriter. Given a topic, idea, or rough draft, produce:
- a punchy "title" (max 80 chars, no quotes, no emoji unless natural)
- a "description" optimized for engagement across X, LinkedIn, TikTok, Instagram (max 600 chars, may use 1-2 emojis, include a soft CTA, no hashtags inline)
- 5-8 lowercase "tags" without the # symbol, relevant and searchable
Return STRICT JSON: {"title":"...","description":"...","tags":["..."]}. No prose, no markdown.`;

export const suggestPostContent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      idea: z.string().min(1).max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return { ok: false as const, error: "GEMINI_API_KEY is not configured" };
    }
    try {
      const res = await fetch(`${URL}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: data.idea }] }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: "application/json",
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false as const,
          error: body.error?.message || `Gemini error: ${res.status}`,
        };
      }
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed: { title?: string; description?: string; tags?: string[] } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      }
      return {
        ok: true as const,
        title: parsed.title || "",
        description: parsed.description || "",
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [],
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
