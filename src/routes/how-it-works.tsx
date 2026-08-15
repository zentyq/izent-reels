import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";
import { HOW_STEPS } from "@/components/landing/content";
import { Check } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How it works - Izent Reels" }] }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <MarketingLayout>
      <PageHero
        title="How it works"
        subtitle="Create a series, connect your accounts, then let Izent Reels generate and publish on your schedule."
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-20 sm:px-6">
        {HOW_STEPS.map((step) => (
          <article key={step.n} className="rounded-2xl border border-neutral-100 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#C9A227] text-sm font-bold text-neutral-950">
                {step.n}
              </span>
              <h2 className="text-xl font-bold">{step.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{step.body}</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-700">
              {step.n === "1" && (
                <>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Choose short or long format and a niche.</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Set voice, music, captions, and how many posts per day.</li>
                </>
              )}
              {step.n === "2" && (
                <>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Open Connectors and link Instagram, TikTok, and YouTube.</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Pick those platforms on the series so posts have a destination.</li>
                </>
              )}
              {step.n === "3" && (
                <>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Videos appear on the Videos page when they are ready.</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#C9A227]" /> Review, publish now, or let the schedule send them.</li>
                </>
              )}
            </ul>
          </article>
        ))}
      </div>
    </MarketingLayout>
  );
}
