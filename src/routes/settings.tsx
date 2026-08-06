import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { User, Settings as SettingsIcon, Instagram, Eye, EyeOff, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { getMe, updateSettings } from "@/lib/auth.functions";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fnGetMe = useServerFn(getMe);
  const fnUpdateSettings = useServerFn(updateSettings);
  const [user, setUser] = useState<any>(null);

  // Instagram cookie state
  const [instagramCookie, setInstagramCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [cookieSaving, setCookieSaving] = useState(false);
  const [cookieSaved, setCookieSaved] = useState(false);
  const [cookieError, setCookieError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fnGetMe();
      if (res.ok) setUser(res.user);
    }
    load();
  }, []);

  async function handleSaveCookie() {
    setCookieSaving(true);
    setCookieError("");
    setCookieSaved(false);
    try {
      const res = await fnUpdateSettings({ data: { instagramCookie: instagramCookie.trim() } });
      if (res.ok) {
        setCookieSaved(true);
        setUser((u: any) => ({ ...u, hasInstagramCookie: !!instagramCookie.trim() }));
        setInstagramCookie(""); // Clear the input after saving
        setTimeout(() => setCookieSaved(false), 3000);
      } else {
        setCookieError(res.error || "Failed to save.");
      }
    } catch (e) {
      setCookieError((e as Error).message);
    } finally {
      setCookieSaving(false);
    }
  }

  async function handleRemoveCookie() {
    setCookieSaving(true);
    setCookieError("");
    setCookieSaved(false);
    try {
      const res = await fnUpdateSettings({ data: { instagramCookie: "" } });
      if (res.ok) {
        setUser((u: any) => ({ ...u, hasInstagramCookie: false }));
        setInstagramCookie("");
        setCookieSaved(true);
        setTimeout(() => setCookieSaved(false), 3000);
      } else {
        setCookieError(res.error || "Failed to remove.");
      }
    } catch (e) {
      setCookieError((e as Error).message);
    } finally {
      setCookieSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="grid gap-6">
        <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Account Profile</h2>
          </div>
          
          {user ? (
            <div className="space-y-4 max-w-md">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <div className="font-medium text-lg">{user.name || "N/A"}</div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <div className="font-medium text-lg">{user.email}</div>
              </div>
            </div>
          ) : (
            <div className="animate-pulse flex flex-col gap-4">
              <div className="h-10 bg-muted/50 rounded-lg w-1/2"></div>
              <div className="h-10 bg-muted/50 rounded-lg w-2/3"></div>
            </div>
          )}
        </div>

        {/* Instagram Cookie Section */}
        <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            <h2 className="text-xl font-semibold">Instagram Integration</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Provide your Instagram session cookie so the app can download Instagram reels and posts directly.
          </p>

          {/* Status indicator */}
          {user?.hasInstagramCookie && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-emerald-400 font-medium">Instagram cookie is configured</span>
              <button
                onClick={handleRemoveCookie}
                disabled={cookieSaving}
                className="ml-auto text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          )}

          <div className="space-y-3 max-w-lg">
            <label className="text-sm font-medium text-muted-foreground">
              {user?.hasInstagramCookie ? "Update Cookie" : "Session Cookie"}
            </label>
            <div className="relative">
              <input
                type={showCookie ? "text" : "password"}
                value={instagramCookie}
                onChange={(e) => { setInstagramCookie(e.target.value); setCookieError(""); setCookieSaved(false); }}
                placeholder="sessionid=abc123def456..."
                className="w-full px-3 py-2.5 pr-10 bg-background border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowCookie(!showCookie)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCookie ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {cookieError && (
              <p className="text-sm text-red-400">{cookieError}</p>
            )}

            {cookieSaved && (
              <p className="text-sm text-emerald-400 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" />
                Saved successfully!
              </p>
            )}

            <button
              onClick={handleSaveCookie}
              disabled={cookieSaving || !instagramCookie.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {cookieSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {cookieSaving ? "Saving..." : "Save Cookie"}
            </button>
          </div>

          {/* Instructions */}
          <details className="mt-5 group">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
              How to get your Instagram cookie →
            </summary>
            <div className="mt-3 text-sm text-muted-foreground space-y-2 pl-2 border-l-2 border-border/40">
              <p><strong>1.</strong> Open <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">instagram.com</a> in your browser and make sure you are logged in.</p>
              <p><strong>2.</strong> Open Developer Tools (Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">F12</kbd> or right-click → Inspect).</p>
              <p><strong>3.</strong> Go to the <strong>Application</strong> tab (Chrome) or <strong>Storage</strong> tab (Firefox).</p>
              <p><strong>4.</strong> Under <strong>Cookies → https://www.instagram.com</strong>, find the cookie named <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">sessionid</code>.</p>
              <p><strong>5.</strong> Copy its <strong>value</strong> and paste it here in the format: <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">sessionid=YOUR_VALUE_HERE</code></p>
              <p className="text-xs text-muted-foreground/60 mt-2">⚠️ Your cookie is stored securely and only used server-side to authenticate Instagram downloads. Never share it publicly.</p>
            </div>
          </details>
        </div>

        <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <SettingsIcon className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Preferences</h2>
          </div>
          
          <div className="text-sm text-muted-foreground">
            More settings coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}
