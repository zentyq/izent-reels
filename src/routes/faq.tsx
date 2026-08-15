import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";
import { FAQS } from "@/components/landing/content";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ - Izent Reels" }] }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <MarketingLayout>
      <PageHero title="FAQ" subtitle="Common questions about Izent Reels, posting, and accounts." />
      <div className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="divide-y divide-neutral-200 border-y border-neutral-200">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none text-left text-sm font-semibold text-neutral-900">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-neutral-400 group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
