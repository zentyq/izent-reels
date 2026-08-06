import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODEL = "gemini-flash-latest";

const SYSTEM_INSTRUCTION = `You are IzentSocial AI, an autonomous agent that manages social media broadcasting for the user.
You are conversational but VERY concise to save tokens.
You have access to several tools. You can search YouTube, download media from URLs, generate captions, and broadcast posts.

CRITICAL RULES:
1. BEFORE broadcasting a post, you MUST ask the user which social media platforms they want to post to, UNLESS they already specified it (e.g. "post this to all", or "post to X and Facebook").
2. If they say "all", you can use the accounts provided in the context.
3. Be helpful, quick, and conversational. Do not output markdown code blocks for normal text.
4. **SEO STEALTH MODE**: NEVER act as an SEO Q&A bot. If the user asks general SEO questions ("what are the best keywords for X?"), gracefully refuse to answer directly. Instead, you should autonomously use the SEO tools in the background *while* you are writing captions or generating hashtags to ensure your outputs are highly optimized based on real search volume and difficulty data. The user should only ever see your perfectly optimized final caption, NOT raw SEO data tables.

Available Accounts Context:
When you are ready to broadcast, ask the user to confirm the platforms. Once confirmed, you will use the 'broadcast_post' tool. The client will pass the available accounts implicitly, you just need to specify the platforms the user requested (e.g. ["X", "FACEBOOK"] or ["ALL"]).`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_youtube",
        description: "Search YouTube for videos. Returns video titles, IDs, and URLs.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "The search query." },
          },
          required: ["query"],
        },
      },
      {
        name: "download_media",
        description: "Download a video or image from a URL. Call this to fetch media before broadcasting it.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: { type: "STRING", description: "The URL of the media (YouTube, TikTok, direct link, etc.)" },
          },
          required: ["url"],
        },
      },
      {
        name: "broadcast_post",
        description: "Broadcasts a post to social media. Call this ONLY after media is downloaded (if needed) and you know which platforms the user wants.",
        parameters: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "The caption text for the post." },
            platforms: { 
              type: "ARRAY", 
              items: { type: "STRING" },
              description: "Array of platforms to post to (e.g. ['X', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'INSTAGRAM', 'YOUTUBE'] or ['ALL'])" 
            },
            hasMedia: { type: "BOOLEAN", description: "Set to true if you previously called download_media successfully." }
          },
          required: ["text", "platforms", "hasMedia"],
        },
      },
      {
        name: "edit_video",
        description: "A powerful video editing tool. Trims, crops, resizes, changes speed, mutes, adds text overlays, or extracts thumbnails from the currently loaded video. Call this when the user asks you to modify the video.",
        parameters: {
          type: "OBJECT",
          properties: {
            startTime: { type: "NUMBER", description: "The start time to trim the video from in seconds." },
            duration: { type: "NUMBER", description: "The duration of the trimmed video in seconds." },
            speed: { type: "NUMBER", description: "Speed multiplier (e.g., 1.5 for faster, 0.5 for slower)." },
            mute: { type: "BOOLEAN", description: "Set to true to remove the audio track." },
            extractThumbnail: { type: "BOOLEAN", description: "Set to true if the user asks to extract a thumbnail or image from the video." },
            crop: { 
              type: "OBJECT", 
              description: "Crop the video. Requires width, height, x, and y coordinates.",
              properties: { width: { type: "NUMBER" }, height: { type: "NUMBER" }, x: { type: "NUMBER" }, y: { type: "NUMBER" } } 
            },
            resize: { 
              type: "OBJECT", 
              description: "Resize/scale the video (e.g. 1080x1920 for TikTok). Requires width and height.",
              properties: { width: { type: "NUMBER" }, height: { type: "NUMBER" } } 
            },
            filters: { 
              type: "OBJECT", 
              description: "Color grading filters. Default brightness 0, contrast 1, saturation 1.",
              properties: { brightness: { type: "NUMBER" }, contrast: { type: "NUMBER" }, saturation: { type: "NUMBER" } } 
            },
            textOverlay: { 
              type: "OBJECT", 
              description: "Adds text over the video.",
              properties: { text: { type: "STRING" }, color: { type: "STRING", description: "e.g., white, black, red" }, fontSize: { type: "NUMBER" }, x: { type: "STRING" }, y: { type: "STRING" } } 
            }
          },
        },
      },
      {
        name: "seo_keyword_research",
        description: "STEALTH MODE ONLY. Queries the SE Ranking API for related keyword ideas, search volumes, and difficulty. Use this silently when drafting a caption to ensure your chosen hashtags and text are SEO optimized.",
        parameters: {
          type: "OBJECT",
          properties: {
            keyword: { type: "STRING", description: "The seed keyword or topic of the video." },
            region: { type: "STRING", description: "The 2-letter country code (default 'us')." }
          },
          required: ["keyword"]
        }
      },
      {
        name: "seo_competitor_analysis",
        description: "STEALTH MODE ONLY. Analyzes a competitor's domain for their top keywords and backlinks.",
        parameters: {
          type: "OBJECT",
          properties: {
            domain: { type: "STRING", description: "The competitor domain (e.g. apple.com)." },
            region: { type: "STRING", description: "The 2-letter country code (default 'us')." }
          },
          required: ["domain"]
        }
      }
    ],
  },
];

export const chatWithAgent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      history: z.array(z.any()), // Array of Gemini Content objects
    })
  )
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return { ok: false as const, error: "GEMINI_API_KEY is not configured in .env" };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
      
      const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: data.history,
        tools: TOOLS,
        generationConfig: {
          temperature: 0.7,
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        return { ok: false as const, error: body.error?.message || `Gemini API Error: ${res.status}` };
      }

      const candidate = body.candidates?.[0];
      if (!candidate) {
        return { ok: false as const, error: "No response from AI." };
      }

      const parts = candidate.content?.parts || [];
      
      // Check if it's a function call
      const functionCallPart = parts.find((p: any) => p.functionCall);
      if (functionCallPart) {
        return {
          ok: true as const,
          type: "function_call",
          functionCall: functionCallPart.functionCall,
          // return the model's message to append to history
          message: candidate.content, 
        };
      }

      // Otherwise it's a text response
      const textPart = parts.find((p: any) => p.text);
      return {
        ok: true as const,
        type: "text",
        text: textPart?.text || "",
        message: candidate.content,
      };

    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
