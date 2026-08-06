import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  Loader2,
  Send,
  Globe,
  Bot,
  User,
  Youtube,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Music,
  Scissors,
  Maximize,
  Minimize,
  Download,
  Paperclip,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listProjects, listAccounts, uploadMedia, createPost, createProject } from "@/lib/ayrshare.functions";
import { searchYouTube } from "@/lib/youtube.functions";
import { chatWithAgent } from "@/lib/agent.functions";
import { downloadMediaFromUrl, cancelDownload } from "@/lib/download.functions";
import { editVideo } from "@/lib/video.functions";
import { saveMessage, loadChatMessages, getMe, createChat } from "@/lib/auth.functions";
import { searchKeywords, analyzeCompetitor } from "@/lib/seo.functions";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    chatId: z.string().optional(),
  }),
  component: AgentChat,
});

type GeminiMessage = {
  role: "user" | "model" | "function";
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: any };
    functionResponse?: { name: string; response: any };
  }>;
};

type DownloadedMedia = {
  base64: string;
  contentType: string;
  filename: string;
  sizeBytes: number;
};

function b64toBlobUrl(b64Data: string, contentType: string) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, { type: contentType });
  return URL.createObjectURL(blob);
}

function formatError(error: any): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Extract HTTP status code prefix if present, e.g. "[400] "
  let cleaned = raw.replace(/^\[\d{3}\]\s*/, "").trim();

  // Try to extract a meaningful message from JSON error responses
  try {
    const parsed = JSON.parse(cleaned);
    // Ayrshare-style: { status: "error", posts: [{ errors: [{ message }] }] }
    if (parsed?.posts?.[0]?.errors?.[0]?.message) {
      return friendlyMessage(parsed.posts[0].errors[0].message);
    }
    // Ayrshare-style: { message: "..." }
    if (parsed?.message) return friendlyMessage(parsed.message);
    // Zod validation array: [{ message: "..." }]
    if (Array.isArray(parsed) && parsed[0]?.message) {
      return friendlyMessage(parsed[0].message);
    }
  } catch {
    // Not JSON — continue
  }

  return friendlyMessage(cleaned);
}

function friendlyMessage(msg: string): string {
  const lower = msg.toLowerCase();

  // Map known technical errors to friendly messages
  if (lower.includes("over maximum number of user profiles")) return "You've reached the maximum number of projects on your plan. Please remove an unused project or upgrade your plan.";
  if (lower.includes("error uploading youtube video") || lower.includes("youtubeoptions")) return "There was a problem posting to YouTube. Please make sure your YouTube account is properly connected and try again.";
  if (lower.includes("profile key") || lower.includes("profilekey")) return "Your project session has expired. Please refresh the page and try again.";
  if (lower.includes("generating jwt") || lower.includes("private key") || lower.includes("privatekey")) return "There was an authentication issue. Please try reconnecting your account on the Connectors page.";
  if (lower.includes("not authenticated") || lower.includes("401") || lower.includes("403")) return "Your session has expired. Please log in again.";
  if (lower.includes("too_small") || lower.includes("string must contain at least")) return "Something went wrong with the request. Please refresh the page and try again.";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused")) return "Could not connect to the server. Please check your internet connection and try again.";
  if (lower.includes("timeout")) return "The request took too long. Please try again.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Too many requests. Please wait a moment and try again.";

  // If it still looks like raw JSON structure, hide it
  if (msg.includes('{"') || msg.includes('":') || msg.includes("at async") || msg.includes("node_modules")) {
    return "Something went wrong. Please try again or contact support if the issue persists.";
  }

  return msg || "Something went wrong. Please try again.";
}

export function AgentChat() {
  const { chatId } = Route.useSearch();
  const navigate = useNavigate();

  const fnChat = useServerFn(chatWithAgent);
  const fnSearchYt = useServerFn(searchYouTube);
  const fnDownloadUrl = useServerFn(downloadMediaFromUrl);
  const fnCancelDownload = useServerFn(cancelDownload);
  const fnGetMe = useServerFn(getMe);
  const fnListProjects = useServerFn(listProjects);
  const fnListAccounts = useServerFn(listAccounts);
  const fnUpload = useServerFn(uploadMedia);
  const fnCreatePost = useServerFn(createPost);
  const fnSaveMsg = useServerFn(saveMessage);
  const fnEditVideo = useServerFn(editVideo);
  const fnLoadMsgs = useServerFn(loadChatMessages);
  const fnSearchKeywords = useServerFn(searchKeywords);
  const fnAnalyzeCompetitor = useServerFn(analyzeCompetitor);

  // App State
  const [projectId, setProjectId] = useState<string>("");
  const [accounts, setAccounts] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const newMedia = {
        base64,
        contentType: file.type,
        filename: file.name,
        sizeBytes: file.size
      };
      setDownloadedMedia(newMedia);
      const blobUrl = URL.createObjectURL(file);
      setMediaPreviews(prev => ({ ...prev, [file.name]: blobUrl }));
      toast.success("File uploaded successfully! You can now ask the AI to post or edit it.");
    };
    reader.readAsDataURL(file);
  };

  // Chat State
  const [history, setHistory] = useState<GeminiMessage[]>([
    {
      role: "model",
      parts: [{ text: "Hi! I'm your IzentSocial AI Assistant. I can search YouTube, download videos, write captions, and broadcast posts to your connected accounts. What would you like to do?" }],
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Media State
  const [downloadedMedia, setDownloadedMedia] = useState<DownloadedMedia | null>(null);
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, string>>({}); 
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isProcessing]);

  const fnCreateProject = useServerFn(createProject);

  useEffect(() => {
    async function load() {
      // 1. Check local storage for globally selected project
      const savedPid = localStorage.getItem("projectId");
      if (savedPid) {
        setProjectId(savedPid);
        return;
      }

      // 2. Fetch projects and pick the first one
      const r = await fnListProjects();
      const pArr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);
      
      if (pArr.length > 0) {
        const pid = pArr[0].projectId || pArr[0].id || pArr[0]._id;
        setProjectId(pid);
        localStorage.setItem("projectId", pid); // save for later
      } else {
        console.warn("No projects returned despite backend auto-creation");
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    async function load() {
      const r = await fnListAccounts({ data: { projectId } });
      const aArr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);
      setAccounts(aArr);
    }
    load();
  }, [projectId]);

  useEffect(() => {
    if (chatId) {
      async function loadMsgs() {
        const res = await fnLoadMsgs({ data: { chatId: chatId! } });
        if (res.ok && res.messages.length > 0) {
          setHistory(res.messages as GeminiMessage[]);
        } else {
          setHistory([
            {
              role: "model",
              parts: [{ text: "Hi! I'm your IzentSocial AI Assistant. I can search YouTube, download videos, write captions, and broadcast posts to your connected accounts. What would you like to do?" }],
            },
          ]);
        }
      }
      loadMsgs();
    } else {
      setHistory([
        {
          role: "model",
          parts: [{ text: "Hi! I'm your IzentSocial AI Assistant. I can search YouTube, download videos, write captions, and broadcast posts to your connected accounts. What would you like to do?" }],
        },
      ]);
    }
  }, [chatId]);

  async function persistMessage(msg: GeminiMessage) {
    if (!chatId) return;
    await fnSaveMsg({
      data: {
        chatId,
        role: msg.role,
        content: JSON.stringify(msg.parts || []),
      }
    });
  }

  // --- Chat Execution Loop ---
  async function processAgentLoop(currentHistory: GeminiMessage[], loopMedia: DownloadedMedia | null = downloadedMedia) {
    try {
      const chatContext = `[SYSTEM CONTEXT: You must read this carefully. Connected Platforms for this project: ${accounts.map(a => a.platform).join(", ") || "None"}. If the user asks to post to a platform that is NOT in this list, DO NOT call broadcast_post. Instead, tell the user exactly which platform is not connected and ask them to connect it on the Connectors page.]`;
      
      const historyWithContext = [...currentHistory];
      const lastMsg = historyWithContext[historyWithContext.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        const parts = [...lastMsg.parts];
        const lastPart = parts[parts.length - 1];
        if (lastPart.text) {
          parts[parts.length - 1] = { text: lastPart.text + `\n\n${chatContext}` };
          historyWithContext[historyWithContext.length - 1] = { ...lastMsg, parts };
        }
      }
      
      const res = await fnChat({ data: { history: historyWithContext } });

      if (!res.ok) {
        const errObj: GeminiMessage = { role: "model", parts: [{ text: `Oops! ${formatError(res.error)}` }] };
        setHistory((prev) => [...prev, errObj]);
        await persistMessage(errObj);
        setIsProcessing(false);
        return;
      }

      const newHistory = [...currentHistory, res.message as GeminiMessage];
      setHistory(newHistory);
      await persistMessage(res.message as GeminiMessage);

      if (res.type === "function_call" && res.functionCall) {
        const name = res.functionCall.name;
        const args = res.functionCall.args;
        let functionResult: any;

        if (name === "search_youtube") {
          const ytRes = await fnSearchYt({ data: { query: args.query } });
          functionResult = ytRes.ok ? ytRes.videos : { error: formatError(ytRes.error) };
        } 
        else if (name === "download_media") {
          toast.info("Downloading media...");
          const dId = crypto.randomUUID();
          setCurrentDownloadId(dId);
          const dlRes = await fnDownloadUrl({ data: { url: args.url, downloadId: dId } });
          setCurrentDownloadId(null);
          if (dlRes.ok) {
            const dl = dlRes as DownloadedMedia;
            setDownloadedMedia(dl);
            loopMedia = dl;
            const blobUrl = b64toBlobUrl(dl.base64, dl.contentType);
            setMediaPreviews(prev => ({ ...prev, [dl.filename]: blobUrl }));
            functionResult = { success: true, filename: dl.filename, size: `${Math.round(dl.sizeBytes / 1024 / 1024)}MB` };
          } else {
            functionResult = { error: formatError(dlRes.error) };
          }
        } 
        else if (name === "seo_keyword_research") {
          const seoRes = await fnSearchKeywords({ data: { keyword: args.keyword, region: args.region } });
          functionResult = seoRes.ok ? seoRes.data : { error: formatError(seoRes.error) };
        }
        else if (name === "seo_competitor_analysis") {
          const seoRes = await fnAnalyzeCompetitor({ data: { domain: args.domain, region: args.region } });
          functionResult = seoRes.ok ? seoRes.data : { error: formatError(seoRes.error) };
        }
        else if (name === "edit_video") {
          if (!loopMedia) {
            functionResult = { error: "No media is currently downloaded to edit." };
          } else if (!loopMedia.contentType.startsWith("video/")) {
            functionResult = { error: "Current media is not a video." };
          } else {
            toast.info("Editing video...");
            try {
              const editRes = await fnEditVideo({
                data: {
                  videoBase64: loopMedia.base64,
                  mimeType: loopMedia.contentType,
                  startTime: args.startTime,
                  duration: args.duration,
                  speed: args.speed,
                  mute: args.mute,
                  extractThumbnail: args.extractThumbnail,
                  crop: args.crop,
                  resize: args.resize,
                  filters: args.filters,
                  textOverlay: args.textOverlay,
                }
              });
              if (editRes.ok && editRes.dataBase64) {
                const fnName = loopMedia.filename || "video.mp4";
                const isImage = editRes.mimeType === "image/png";
                const ext = isImage ? ".png" : "_edited.mp4";
                const newFilename = fnName.replace(/\.[^/.]+$/, "") + ext;
                const newDl = { ...loopMedia, base64: editRes.dataBase64, filename: newFilename, contentType: editRes.mimeType || "video/mp4" };
                setDownloadedMedia(newDl);
                loopMedia = newDl;
                const blobUrl = b64toBlobUrl(editRes.dataBase64, newDl.contentType);
                setMediaPreviews(prev => ({ ...prev, [newFilename]: blobUrl }));
                functionResult = { success: true, message: isImage ? "Thumbnail extracted successfully." : "Video edited successfully." };
              } else {
                functionResult = { error: formatError(editRes.error || "Edit failed") };
              }
            } catch (e) {
              functionResult = { error: formatError(e) };
            }
          }
        }
        else if (name === "broadcast_post") {
          toast.info("Broadcasting post...");
          let mediaId: string | undefined;
          
          if (args.hasMedia) {
            if (!loopMedia) {
              functionResult = { error: "No media is currently downloaded to attach." };
            } else {
              try {
                const up = await fnUpload({
                  data: {
                    projectId,
                    contentType: loopMedia.contentType,
                    base64: loopMedia.base64,
                  },
                });
                mediaId = up.mediaId;
              } catch (e) {
                functionResult = { error: `Media upload failed: ${formatError(e)}` };
              }
            }
          }

          if (!functionResult) {
            const targetPlatforms = Array.isArray(args.platforms) ? args.platforms.map((p: any) => String(p).toUpperCase()) : [];
            const isAll = targetPlatforms.includes("ALL");
            const matchedAccounts = accounts.filter(a => isAll || targetPlatforms.includes(a.platform));
            
            if (matchedAccounts.length === 0) {
              functionResult = { error: `No connected accounts found for platforms: ${targetPlatforms.join(", ")}` };
            } else {
              const socialAccounts = matchedAccounts.map(a => ({
                platform: a.platform,
                socialAccountId: a.socialAccountId || a.id || a.accountId,
                id: a.socialAccountId || a.id || a.accountId,
              }));

              const mediaKind = loopMedia ? (loopMedia.contentType.startsWith("video/") ? "video" : "image") : "none";

              try {
                const postRes = await fnCreatePost({
                  data: {
                    projectId,
                    contentText: args.text,
                    mediaId: mediaId ?? null,
                    mediaKind,
                    socialAccounts,
                  },
                });

                // Parse partial success/failure from Ayrshare response
                const posts = postRes?.posts || (Array.isArray(postRes) ? postRes : [postRes]);
                const succeeded: string[] = [];
                const failed: string[] = [];

                for (const p of posts) {
                  // Check postIds for successes
                  if (p.postIds) {
                    for (const pid of p.postIds) {
                      if (pid.status === "success" && pid.platform) succeeded.push(pid.platform);
                    }
                  }
                  // Check errors for failures
                  if (p.errors) {
                    for (const err of p.errors) {
                      if (err.platform) failed.push(err.platform);
                    }
                  }
                }

                if (failed.length > 0 && succeeded.length > 0) {
                  functionResult = {
                    partial: true,
                    message: `Posted successfully to ${succeeded.join(", ")}! However, posting to ${failed.join(", ")} didn't work — please check that ${failed.length === 1 ? "that account is" : "those accounts are"} properly connected.`,
                    details: postRes
                  };
                } else if (failed.length > 0 && succeeded.length === 0) {
                  functionResult = { error: `Posting failed for ${failed.join(", ")}. Please make sure your accounts are properly connected and try again.`, details: postRes };
                } else if (postRes?.status === "error" || postRes?.errors) {
                  functionResult = { error: postRes.message || "Ayrshare returned an error.", details: postRes };
                } else {
                  functionResult = { success: true, message: `Broadcast successful to ${socialAccounts.length} platform${socialAccounts.length > 1 ? "s" : ""}!`, details: postRes };
                }
                setDownloadedMedia(null);
              } catch (e) {
                functionResult = { error: formatError(e) };
              }
            }
          }
        }

        const fnResponseObj: GeminiMessage = {
          role: "function" as const,
          parts: [{ functionResponse: { name, response: { result: functionResult } } }],
        };
        const fnHistory = [...newHistory, fnResponseObj];
        setHistory(fnHistory);
        await persistMessage(fnResponseObj);
        
        await processAgentLoop(fnHistory, loopMedia);
      } else {
        setIsProcessing(false);
      }
    } catch (e) {
      const errObj: GeminiMessage = { role: "model", parts: [{ text: `Oops! ${formatError(e)}` }] };
      setHistory((prev) => [...prev, errObj]);
      await persistMessage(errObj);
      setIsProcessing(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || isProcessing) return;
    
    if (!chatId) {
      toast.error("Please click 'New Chat' in the sidebar first.");
      return;
    }

    const userMsg: GeminiMessage = { role: "user", parts: [{ text: input.trim() }] };
    setInput("");
    setIsProcessing(true);
    setHistory((prev) => [...prev, userMsg]);
    
    await persistMessage(userMsg);
    await processAgentLoop([...history, userMsg]);
  }

  return (
    <div className="flex-1 flex flex-col relative h-full bg-background bg-gradient-to-br from-background via-background to-muted/20">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 scroll-smooth" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-8 pb-24 sm:pb-32">
          {!chatId && (
            <div className="flex items-center justify-center h-[50vh]">
              <div className="text-center space-y-4">
                <Globe className="h-16 w-16 text-primary/30 mx-auto" />
                <h2 className="text-2xl font-semibold">Welcome to IzentSocial</h2>
                <p className="text-muted-foreground">Select a chat from the sidebar or click "New Chat" to begin.</p>
              </div>
            </div>
          )}

          {chatId && history.map((msg, idx) => {
            if (msg.role === "function") return null;
            
            const isUser = msg.role === "user";
            const parts = msg.parts || [];
            const text = parts.find(p => p.text)?.text;
            const fnCall = parts.find(p => p.functionCall)?.functionCall;

            const nextMsg = history[idx + 1];
            let fnRes: any = null;
            if (nextMsg?.role === "function" && nextMsg.parts?.[0]?.functionResponse) {
              fnRes = nextMsg.parts[0].functionResponse;
            }

            return (
              <div key={idx} className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center shadow-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border/80 text-foreground"}`}>
                  {isUser ? <User className="h-4.5 w-4.5" /> : <Bot className="h-4.5 w-4.5" />}
                </div>
                <div className={`max-w-[95%] sm:max-w-[85%] space-y-2.5 ${isUser ? "text-right" : "text-left"}`}>
                  
                  {text && (
                    <div className={`inline-block p-4 sm:p-5 rounded-[24px] text-[15px] leading-relaxed shadow-sm ${
                      isUser 
                        ? "bg-primary text-primary-foreground rounded-tr-[4px]" 
                        : "bg-card border border-border/40 rounded-tl-[4px] whitespace-pre-wrap text-card-foreground"
                    }`}>
                      {text}
                    </div>
                  )}

                  {fnCall && (
                    <div className="flex flex-col gap-2">
                      <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-muted/60 border border-border/40 text-[13px] font-medium text-muted-foreground shadow-sm w-fit">
                        {fnCall.name === "search_youtube" && <><Youtube className="h-4 w-4 text-red-500" /> Searching YouTube for "{fnCall.args.query}"...</>}
                        {fnCall.name === "download_media" && <><Loader2 className="h-4 w-4 animate-spin text-primary" /> Downloading media...</>}
                        {fnCall.name === "broadcast_post" && <><Globe className="h-4 w-4 animate-bounce text-blue-500" /> Broadcasting post to {fnCall.args.platforms.join(", ")}...</>}
                        {fnCall.name === "seo_keyword_research" && <><Sparkles className="h-4 w-4 text-purple-500" /> Researching SEO keywords...</>}
                        {fnCall.name === "seo_competitor_analysis" && <><Globe className="h-4 w-4 text-green-500" /> Analyzing competitor...</>}
                      </div>
                      {fnCall.name === "download_media" && currentDownloadId && (
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-fit h-7 text-xs rounded-full"
                          onClick={async () => {
                            await fnCancelDownload({ data: { downloadId: currentDownloadId } });
                            setCurrentDownloadId(null);
                          }}
                        >
                          Cancel Download
                        </Button>
                      )}
                    </div>
                  )}

                  {fnRes && fnRes.name === "search_youtube" && fnRes.response?.result && Array.isArray(fnRes.response.result) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      {fnRes.response.result.slice(0, 4).map((vid: any) => (
                        <div key={vid.id} className="border border-border/40 rounded-xl overflow-hidden bg-card/80 shadow-sm hover:shadow-md transition-shadow text-left group">
                          <div className="aspect-video relative bg-black/5 flex items-center justify-center">
                            <iframe 
                              src={`https://www.youtube.com/embed/${vid.id}`} 
                              className="absolute inset-0 w-full h-full border-0"
                              allowFullScreen
                            />
                          </div>
                          <div className="p-3.5">
                            <div className="text-[13px] font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">{vid.title}</div>
                            <div className="text-[11px] font-medium text-muted-foreground/80 mt-1.5">{vid.channelTitle}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {fnRes && (fnRes.name === "download_media" || fnRes.name === "edit_video") && fnRes.response?.result?.success && (
                    <div className="flex flex-col gap-3 mt-3 max-w-sm">
                      {mediaPreviews[fnRes.response.result.filename || downloadedMedia?.filename || ""] && (
                        <div className="rounded-2xl overflow-hidden border border-border/40 shadow-md bg-black/5 flex justify-center max-h-[400px]">
                          {(fnRes.response.result.filename || downloadedMedia?.filename || "").match(/\.(mp4|webm|mov)$/i) ? (
                            <video src={mediaPreviews[fnRes.response.result.filename || downloadedMedia?.filename || ""]} controls className="max-h-[400px] object-contain rounded-2xl" />
                          ) : (
                            <img src={mediaPreviews[fnRes.response.result.filename || downloadedMedia?.filename || ""]} className="max-h-[400px] object-contain rounded-2xl" alt="Preview" />
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-700 dark:text-green-400 self-start shadow-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          {fnRes.name === "download_media" ? "Downloaded successfully" : "Edited successfully"}
                        </div>
                        {mediaPreviews[fnRes.response.result.filename || downloadedMedia?.filename || ""] && (
                          <a 
                            href={mediaPreviews[fnRes.response.result.filename || downloadedMedia?.filename || ""]} 
                            download={fnRes.response.result.filename || downloadedMedia?.filename || "media"}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-sm transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            Save to Device
                          </a>
                        )}
                      </div>
                    </div>
                  )}


                </div>
              </div>
            );
          })}

          {isProcessing && history[history.length - 1]?.role === "user" && (
            <div className="flex gap-4 animate-in fade-in duration-300">
              <div className="flex-shrink-0 h-9 w-9 rounded-full bg-card border border-border/80 flex items-center justify-center shadow-sm">
                <Bot className="h-4.5 w-4.5" />
              </div>
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/40 shadow-sm rounded-tl-[4px] text-[14px] font-medium text-muted-foreground">
                <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
                Thinking...
              </div>
            </div>
          )}
        </div>
      </div>

      {chatId && (
        <div className="p-3 sm:p-6 bg-gradient-to-t from-background via-background to-transparent absolute bottom-0 left-0 right-0">
          <div className="max-w-4xl mx-auto relative group">
            {downloadedMedia && mediaPreviews[downloadedMedia.filename] && (
              <div className="mb-3 px-3 py-2 bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm flex items-center gap-3 w-fit animate-in slide-in-from-bottom-2">
                {downloadedMedia.contentType.startsWith("video/") ? (
                  <video src={mediaPreviews[downloadedMedia.filename]} className="h-10 w-10 object-cover rounded-md bg-black/10" />
                ) : (
                  <img src={mediaPreviews[downloadedMedia.filename]} className="h-10 w-10 object-cover rounded-md bg-black/10" alt="Preview" />
                )}
                <div className="text-xs font-medium max-w-[200px] truncate">{downloadedMedia.filename}</div>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 text-muted-foreground hover:text-destructive" onClick={() => setDownloadedMedia(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-blue-500/30 rounded-2xl blur opacity-30 group-focus-within:opacity-60 transition duration-500"></div>
            <div className="relative flex items-center">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="video/*,image/*"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 h-10 w-10 rounded-xl text-muted-foreground hover:text-primary z-10"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask Izent AI to search YouTube, download media, or post..."
                className="pl-14 pr-14 bg-card/90 backdrop-blur-md border-border/50 shadow-lg h-14 rounded-2xl text-[15px] focus-visible:ring-1 focus-visible:ring-primary/50 transition-all placeholder:text-muted-foreground/60"
                disabled={isProcessing}
              />
              <Button
                size="icon"
                className="absolute right-2 h-10 w-10 rounded-xl shadow-md transition-transform active:scale-95"
                disabled={!input.trim() || isProcessing}
                onClick={handleSend}
              >
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
