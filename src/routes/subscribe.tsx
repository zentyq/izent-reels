import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SeriesShell } from "@/components/series/SeriesShell";
import { cn } from "@/lib/utils";
import { confirmMockSubscription, getMockSubscription } from "@/lib/series.functions";

export const Route = createFileRoute("/subscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    seriesId: typeof search.seriesId === "string" ? search.seriesId : "",
  }),
  component: SubscribePage,
});

const PLANS = [
  { id: "hobby", name: "Hobby", monthly: 17, cadence: "3 videos per week", pricePerVideo: "£1.31" },
  { id: "daily", name: "Daily", monthly: 35, cadence: "1 video per day", pricePerVideo: "£1.17", popular: true },
  { id: "pro", name: "Pro", monthly: 60, cadence: "2 videos per day", pricePerVideo: "£1.00", best: true },
] as const;

function SubscribePage() {
  const { seriesId } = Route.useSearch();
  const navigate = useNavigate();
  const fnGetSubscription = useServerFn(getMockSubscription);
  const fnConfirm = useServerFn(confirmMockSubscription);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [seriesName, setSeriesName] = useState("");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [planId, setPlanId] = useState<(typeof PLANS)[number]["id"]>("daily");
  const [additionalSeries, setAdditionalSeries] = useState(0);

  useEffect(() => {
    if (!seriesId) {
      navigate({ to: "/series/create" });
      return;
    }
    fnGetSubscription({ data: { seriesId } })
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error || "Could not load subscription");
          navigate({ to: "/series/create" });
          return;
        }
        if (res.series.status === "active") {
          navigate({ to: "/series/videos" });
          return;
        }
        setSeriesName(res.series.name);
      })
      .catch(() => {
        toast.error("Could not load subscription");
        navigate({ to: "/series/create" });
      })
      .finally(() => setLoading(false));
  }, [seriesId]);

  const plan = useMemo(() => PLANS.find((item) => item.id === planId) || PLANS[1], [planId]);
  const monthlyPrice = billing === "yearly" ? Math.round(plan.monthly * 0.75) : plan.monthly;

  async function confirmSubscription() {
    if (!seriesId) return;
    setConfirming(true);
    try {
      const res = await fnConfirm({
        data: { seriesId, plan: plan.id, billing, additionalSeries },
      });
      if (!res.ok) throw new Error(res.error || "Subscription confirmation failed");
      toast.success("Subscription confirmed — your first video is now generating.");
      navigate({ to: "/series/videos" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <SeriesShell>
        <div className="min-h-[60vh] grid place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </SeriesShell>
    );
  }

  return (
    <SeriesShell>
      <div className="mx-auto w-full max-w-4xl py-5">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl">
          <div className="grid md:grid-cols-[1fr_1.05fr]">
            <section className="p-6 sm:p-7 border-b md:border-b-0 md:border-r border-border/60">
              <button
                type="button"
                onClick={() => navigate({ to: "/series/create" })}
                className="float-right -mt-1 text-muted-foreground hover:text-foreground"
                aria-label="Back to setup"
              >
                <X className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-bold tracking-tight">Unlock your series</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {seriesName ? `${seriesName} is almost ready` : "Your first video is almost ready"}
              </p>

              <div className="mt-5 flex items-center gap-2 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={cn(billing === "monthly" ? "text-foreground" : "text-muted-foreground")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  aria-label="Toggle annual billing"
                  onClick={() => setBilling((value) => (value === "monthly" ? "yearly" : "monthly"))}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    billing === "yearly" ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      billing === "yearly" ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("yearly")}
                  className={cn(billing === "yearly" ? "text-foreground" : "text-muted-foreground")}
                >
                  Yearly
                </button>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  Save 25%
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                {PLANS.map((item) => {
                  const selected = planId === item.id;
                  const amount = billing === "yearly" ? Math.round(item.monthly * 0.75) : item.monthly;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPlanId(item.id)}
                      className={cn(
                        "relative w-full rounded-xl border px-3 py-3 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/60 hover:border-primary/40",
                      )}
                    >
                      {item.popular && (
                        <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          ✦ Most popular
                        </span>
                      )}
                      {item.best && (
                        <span className="absolute -top-2 left-3 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                          ✦ Best for growth
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.cadence}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">£{amount}/month</div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold">{item.pricePerVideo.replace("£", "£")}</span>
                          <span className="ml-1 text-[9px] text-muted-foreground">PER VIDEO</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Add more series</div>
                    <div className="text-xs text-muted-foreground">Want to run more channels?</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      disabled={additionalSeries === 0}
                      onClick={() => setAdditionalSeries((value) => Math.max(0, value - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-4 text-center text-sm font-medium">{additionalSeries + 1}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setAdditionalSeries((value) => Math.min(20, value + 1))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                className="mt-4 h-11 w-full text-sm font-semibold"
                onClick={() => void confirmSubscription()}
                disabled={confirming}
              >
                {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirming ? "Confirming…" : `Choose ${plan.name}`}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Mock checkout only. No payment is collected.
              </p>
            </section>

            <section className="p-6 sm:p-7">
              <h2 className="text-sm font-semibold">What you get</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "AI-generated videos in your niche",
                  "Auto-posting to TikTok, Instagram & YouTube",
                  "Get 5 premium credits as a gift",
                  "New videos created automatically on schedule",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-border/60 pt-5">
                <h2 className="text-sm font-semibold">Join 1.5M+ creators</h2>
                <Testimonial name="Jerome M." initials="J" text="Love it. Makes it easy to post when you are having difficulty figuring an idea for a post." />
                <Testimonial name="Nana B." initials="N" text="Their content is high quality, reliable, and always engaging. What I appreciate most is how effortless they make the creative process." />
              </div>

              <div className="mt-5 border-t border-border/60 pt-4 text-sm font-semibold">
                Questions?
              </div>
            </section>
          </div>
        </div>
      </div>
    </SeriesShell>
  );
}

function Testimonial({ name, initials, text }: { name: string; initials: string; text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-[9px] text-white">
            {initials}
          </span>
          {name}
        </div>
        <span className="text-xs tracking-tight text-amber-400">★★★★★</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">&quot;{text}&quot;</p>
    </div>
  );
}
