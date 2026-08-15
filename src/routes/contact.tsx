import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";
import { getPublicAppSettings } from "@/lib/admin.functions";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact us - Izent Reels" }] }),
  component: ContactPage,
});

function ContactPage() {
  const fnPublic = useServerFn(getPublicAppSettings);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(DEFAULT_APP_SETTINGS.contactEmail);

  useEffect(() => {
    fnPublic()
      .then((res) => {
        if (res.ok) setContactEmail(res.settings.contactEmail);
      })
      .catch(() => {});
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Izent Reels contact from ${name}`);
    const body = encodeURIComponent(`${message}\n\nFrom: ${name} <${email}>`);
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
    toast.success(`Opening your email app. If nothing opens, write to ${contactEmail}`);
  }

  return (
    <MarketingLayout>
      <PageHero title="Contact us" subtitle="Questions about accounts, posting, or the studio. We read every note." />
      <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-3 px-4 pb-20 sm:px-6">
        <input
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-200 px-4 text-sm outline-none focus:border-[#C9A227]"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full rounded-xl border border-neutral-200 px-4 text-sm outline-none focus:border-[#C9A227]"
        />
        <textarea
          required
          placeholder="How can we help?"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-[#C9A227]"
        />
        <button
          type="submit"
          className="h-12 w-full rounded-xl bg-[#C9A227] text-sm font-semibold text-neutral-950 hover:bg-[#B8961C]"
        >
          Send message
        </button>
        <p className="text-center text-xs text-neutral-400">Or email {contactEmail}</p>
      </form>
    </MarketingLayout>
  );
}
