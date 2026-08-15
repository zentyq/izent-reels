import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy - Izent Reels" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <MarketingLayout>
      <PageHero title="Privacy policy" subtitle="How Izent Reels handles account and product data. Last updated 14 Aug 2026." />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-20 text-sm leading-relaxed text-neutral-600 sm:px-6">
        <h2 className="text-base font-bold text-neutral-950">What we collect</h2>
        <p>
          We collect the email and name you use to register, session cookies to keep you signed in, series settings, generated media URLs, and the social profile keys needed to post on your behalf through Connectors.
        </p>
        <h2 className="text-base font-bold text-neutral-950">How we use it</h2>
        <p>
          Account data runs the studio: generating videos, scheduling posts, and showing your series. We do not sell your personal information. Provider APIs (for example video, voice, and social posting) receive only what is needed to complete a job you started.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Storage</h2>
        <p>
          Sessions live in an HTTP-only cookie. Media may be stored as uploads on our server. Connected social tokens are held by the posting provider you authorize.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Your choices</h2>
        <p>
          You can sign out, delete a series, or disconnect a platform in Connectors. To ask for account deletion, use the Contact page with the email on the account.
        </p>
        <h2 className="text-base font-bold text-neutral-950">Contact</h2>
        <p>Privacy questions: hello@izentreels.com</p>
      </div>
    </MarketingLayout>
  );
}
