import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/landing/MarketingLayout";
import { getPost } from "@/components/landing/content";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? "Post"} - Izent Reels` }],
  }),
  component: BlogPostPage,
});

function BlogPostPage() {
  const post = Route.useLoaderData();
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
        <Link to="/blog" className="text-sm text-[#8A7014] hover:underline">
          Back to blog
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-[#C9A227]">{post.tag}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-2 text-sm text-neutral-400">{post.date}</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-neutral-600">
          {post.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </article>
    </MarketingLayout>
  );
}
