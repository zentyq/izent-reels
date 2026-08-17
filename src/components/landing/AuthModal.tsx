import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, Link } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { login, register } from "@/lib/auth.functions";
import { getPublicAppSettings } from "@/lib/admin.functions";
import { hasUserSeries } from "@/lib/series.functions";
import { GoogleMark } from "./brand";

export type AuthMode = "signin" | "signup";

export function AuthModal({
  mode,
  onModeChange,
  onClose,
}: {
  mode: AuthMode | null;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}) {
  const open = mode !== null;
  const isSignup = mode === "signup";
  const fnLogin = useServerFn(login);
  const fnRegister = useServerFn(register);
  const fnPublic = useServerFn(getPublicAppSettings);
  const fnHasSeries = useServerFn(hasUserSeries);
  const navigate = useNavigate();
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    fnPublic()
      .then((res) => {
        if (res.ok) setRegistrationOpen(res.settings.registrationOpen);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === "signup" && !registrationOpen) onModeChange("signin");
  }, [mode, registrationOpen]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setConfirm("");
    setShowPw(false);
    setShowConfirm(false);
    setError("");
    setLoading(false);
  }

  function handleGoogle() {
    window.location.href = "/auth/google";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignup) {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        const name = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Creator";
        const res = await fnRegister({ data: { email, name, password } });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      } else {
        const res = await fnLogin({ data: { email, password } });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      reset();
      onClose();
      if (isSignup) {
        navigate({ to: "/series/create" });
        return;
      }
      const check = await fnHasSeries();
      if (check.pendingPaymentSeriesId && !check.hasActiveSeries) {
        navigate({
          to: "/subscribe",
          search: { seriesId: check.pendingPaymentSeriesId },
        });
        return;
      }
      navigate({ to: check.hasActiveSeries ? "/series/videos" : "/series/create" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-white/55 backdrop-blur-md" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.35)] outline-none">
          <DialogTitle className="text-[26px] font-bold tracking-tight text-neutral-950">
            {isSignup ? "Create your account" : "Sign in to Izent Reels"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-neutral-500">
            {isSignup
              ? "Enter your details to create your account"
              : "Enter your email and password to continue"}
          </DialogDescription>

          <button
            type="button"
            onClick={handleGoogle}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-[#E8D48B] bg-white text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-[11px] font-semibold tracking-wide text-neutral-400">
              <span className="bg-white px-3">OR</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
            />
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 pr-11 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isSignup && (
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 pr-11 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}

            {!isSignup && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-[#8A7014] underline underline-offset-2 hover:text-[#6F5A10]"
                  onClick={() => toast.message("Password reset isn’t available yet. Sign in with the email you registered.")}
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {isSignup && (
              <p className="pt-1 text-center text-[11px] leading-relaxed text-neutral-400">
                By creating an account, you agree to our{" "}
                <Link to="/terms" className="underline" onClick={onClose}>
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline" onClick={onClose}>
                  Privacy Policy
                </Link>
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#C9A227] text-sm font-semibold text-neutral-950 hover:bg-[#B8961C] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-neutral-500">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-[#8A7014] underline underline-offset-2"
                  onClick={() => {
                    setError("");
                    onModeChange("signin");
                  }}
                >
                  Sign in
                </button>
              </>
            ) : registrationOpen ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-[#8A7014] underline underline-offset-2"
                  onClick={() => {
                    setError("");
                    onModeChange("signup");
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              "New accounts are closed right now."
            )}
          </p>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
