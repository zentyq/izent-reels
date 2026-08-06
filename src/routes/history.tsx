import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { History as HistoryIcon, ExternalLink, Globe, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

import { listHistory } from "@/lib/ayrshare.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fnListHistory = useServerFn(listHistory);

  useEffect(() => {
    const pId = localStorage.getItem("izent_projectId");
    if (pId) setProjectId(pId);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    
    async function load() {
      try {
        setLoading(true);
        const res = await fnListHistory({ data: { projectId } });
        // Ayrshare /history endpoint returns an array of post objects
        setHistory(Array.isArray(res) ? res : []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-sm">
          <HistoryIcon className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h2 className="text-xl font-semibold">No Project Selected</h2>
          <p className="text-sm text-muted-foreground">
            Please connect your accounts in the Connectors tab to view your broadcast history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex-shrink-0 px-6 py-4 border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl border border-primary/20 shadow-sm">
            <HistoryIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Broadcast History</h1>
            <p className="text-xs text-muted-foreground">View your past posts and analytics.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
            {error}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3">
            <Globe className="h-10 w-10 opacity-20" />
            <p>You haven't made any posts yet.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {history.map((post) => (
              <div key={post.id} className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="text-sm whitespace-pre-wrap flex-1">{post.post}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 whitespace-nowrap bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                    <Clock className="h-3.5 w-3.5" />
                    {post.created ? format(new Date(post.created), "MMM d, h:mm a") : "Unknown date"}
                  </div>
                </div>

                {post.mediaUrls && post.mediaUrls.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {post.mediaUrls.map((url: string, i: number) => (
                      <div key={i} className="h-20 w-20 flex-shrink-0 rounded-lg border border-border/50 overflow-hidden bg-muted/50">
                        {url.endsWith(".mp4") || url.endsWith(".mov") ? (
                          <div className="w-full h-full flex items-center justify-center text-xs font-medium text-muted-foreground">Video</div>
                        ) : (
                          <img src={url} alt="Media" className="w-full h-full object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                  {post.postIds?.map((pid: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 bg-muted/30 border border-border/50 rounded-full">
                      <span className="capitalize">{pid.platform}</span>
                      {pid.status === "success" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : pid.status === "pending" || pid.status === "processing" ? (
                        <Clock className="h-3.5 w-3.5 text-yellow-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      
                      {pid.postUrl && (
                        <a 
                          href={pid.postUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-1 text-primary hover:underline flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
