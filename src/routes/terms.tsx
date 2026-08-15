import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service - Izent Reels" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <MarketingLayout>
      <PageHero title="Terms of service" subtitle="Rules for using Izent Reels. Last updated 14 Aug 2026." />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-20 text-sm leading-relaxed text-neutral-600 sm:px-6">
        <h2 className="text-base font-bold text-neutral-950">The service</h2>
        <p>
          Izent Reels lets you create video series and, if you connect social accounts, publish to those platforms. You must be allowed to use the social accounts you connect.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Your content</h2>
        <p>
          You are responsible for scripts, niches, and posts. Do not use the product to create illegal, harmful, or infringing material. You keep rights in content generated for your account, subject to the terms of any AI or posting provider you use.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Accounts</h2>
        <p>
          Keep your login details safe. We may suspend accounts that abuse generation, spam platforms, or break these terms.
        </p>
        <h2 className="text-base font-bold text-neutral-950">No guarantee of views</h2>
        <p>
          We provide tools to generate and schedule videos. Platform reach, approval, and algorithm results are outside our control.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Contact</h2>
        <p>Legal questions: hello@izentreels.com</p>
      </div>
    </MarketingLayout>
  );
}
