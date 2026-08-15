import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/landing/MarketingLayout";
import { BLOG_POSTS } from "@/components/landing/content";

export const Route = createFileRoute("/blog")({
  head: () => ({ meta: [{ title: "Blog - Izent Reels" }] }),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  return (
    <MarketingLayout>
      <PageHero title="Blog" subtitle="Practical notes on niches, posting, and growing an off-camera channel." />
      <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 sm:grid-cols-2 sm:px-6">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="rounded-2xl border border-neutral-100 p-6 hover:border-[#E8D48B]"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-[#C9A227]">{post.tag}</span>
            <h2 className="mt-2 text-lg font-bold">{post.title}</h2>
            <p className="mt-2 text-sm text-neutral-500">{post.excerpt}</p>
            <p className="mt-4 text-xs text-neutral-400">{post.date}</p>
          </Link>
        ))}
      </div>
    </MarketingLayout>
  );
}
