import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About us - Izent Reels" }] }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <MarketingLayout>
      <PageHero
        title="About us"
        subtitle="Izent Reels helps creators publish short videos without filming themselves."
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-20 text-sm leading-relaxed text-neutral-600 sm:px-6">
        <p>
          Izent Reels is a studio for off-camera channels. You choose a niche, a voice, and a look. The product writes scripts, builds scenes, adds captions, and can post to the social accounts you connect.
        </p>
        <p>
          We built it for people who want a posting habit without a camera, a freelance editor, or a weekend spent in a timeline. One series setup should be enough to keep Instagram, TikTok, and YouTube fed.
        </p>
        <p>
          The company is focused on that loop: generate, review if you want, then publish on a schedule you control.
        </p>
      </div>
    </MarketingLayout>
  );
}
