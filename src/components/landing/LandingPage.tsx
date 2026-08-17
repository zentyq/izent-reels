import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  Rocket,
  Star,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { getMe } from "@/lib/auth.functions";
import { getPublicAppSettings } from "@/lib/admin.functions";
import { hasUserSeries } from "@/lib/series.functions";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import { AuthModal, type AuthMode } from "./AuthModal";
import { GoogleMark, InstagramMark, TikTokMark, YouTubeMark } from "./brand";
import { BLOG_POSTS, FAQS, HOW_STEPS } from "./content";
import { MarketingLayout } from "./MarketingLayout";

const AVATARS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=80&h=80&fit=crop",
];

const NICHES = [
  {
    word: "SONS",
    label: "History",
    img: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=400&h=640&fit=crop",
  },
  {
    word: "FOR",
    label: "Act of kindness",
    img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&h=640&fit=crop",
  },
  {
    word: "EVER",
    label: "Biblical stories",
    img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400&h=640&fit=crop",
  },
  {
    word: "DISCOVERED",
    label: "Anime stories",
    img: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=640&fit=crop",
  },
  {
    word: "THEY",
    label: "Heists",
    img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=640&fit=crop",
  },
  {
    word: "ANGELS",
    label: "Mythology",
    img: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&h=640&fit=crop",
  },
];

const CHANNELS = [
  {
    name: "Scary History ♪",
    handle: "@scary.history.stories",
    avatar: "☠️",
    clips: [
      { title: "AMERICANS", views: "745.1K", img: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=360&h=480&fit=crop" },
      { title: "1957", views: "663.9K", img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=360&h=480&fit=crop" },
      { title: "CURSED", views: "1.3M", img: "https://images.unsplash.com/photo-1470115636492-6d2b56f47be0?w=360&h=480&fit=crop" },
    ],
  },
  {
    name: "Quiet Facts",
    handle: "@quiet.facts",
    avatar: "📘",
    clips: [
      { title: "OCEAN", views: "412.0K", img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=360&h=480&fit=crop" },
      { title: "ROME", views: "890.2K", img: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=360&h=480&fit=crop" },
      { title: "GOLD", views: "1.1M", img: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=360&h=480&fit=crop" },
    ],
  },
  {
    name: "Night Stories",
    handle: "@night.stories",
    avatar: "🌙",
    clips: [
      { title: "LOST", views: "520.4K", img: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=360&h=480&fit=crop" },
      { title: "SIGNAL", views: "777.7K", img: "https://images.unsplash.com/photo-1444703686981-a3abbc4d4d2a?w=360&h=480&fit=crop" },
      { title: "GHOST", views: "2.0M", img: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=360&h=480&fit=crop" },
    ],
  },
];

const TESTIMONIALS = [
  { name: "Jerome Morton", initials: "JM", color: "#E8D48B", text: "love it. makes it easy to post when you are having difficulty figuring an idea for a post." },
  { name: "Nana Bandoh", initials: "N", color: "#C9A227", text: "Their content is high quality, reliable, and always engaging, which is exactly what I need to keep increasing my views and subscribers. What I appreciate most is how effortless they make the creative process." },
  { name: "Josh Wright", initials: "JW", color: "#D4C4A0", text: "Izent Reels has been great. Grown my page a lot!" },
  { name: "Cynthia Duncan", initials: "CD", color: "#d4d4d8", text: "I was skeptical at first, but the videos look premium and the posting just happens." },
  { name: "Tom Atemba", initials: "TA", color: "#fcd34d", text: "For one it's convenient for those who want to tell stories but don't want to show their face" },
  { name: "Loyal Earl", initials: "L", color: "#E8D48B", text: "Very productive project love it feed back is fast and the quality keeps getting better." },
];

export function LandingPage({
  authMode,
  authError,
  onAuthModeChange,
}: {
  authMode: AuthMode | null;
  authError?: string;
  onAuthModeChange: (mode: AuthMode | null) => void;
}) {
  const fnGetMe = useServerFn(getMe);
  const fnPublic = useServerFn(getPublicAppSettings);
  const fnHasSeries = useServerFn(hasUserSeries);
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [channelIndex, setChannelIndex] = useState(0);
  const [socialProof, setSocialProof] = useState(DEFAULT_APP_SETTINGS.socialProofLabel);
  const [tagline, setTagline] = useState(DEFAULT_APP_SETTINGS.tagline);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const channel = CHANNELS[channelIndex];

  useEffect(() => {
    if (!authError) return;
    toast.error(authError);
    navigate({ to: "/", search: { auth: "signin" }, replace: true });
  }, [authError]);

  useEffect(() => {
    fnGetMe()
      .then((res) => setLoggedIn(!!res.ok))
      .finally(() => setChecking(false));
    fnPublic()
      .then((res) => {
        if (!res.ok) return;
        setSocialProof(res.settings.socialProofLabel);
        setTagline(res.settings.tagline);
        setRegistrationOpen(res.settings.registrationOpen);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!checking && loggedIn && authMode) onAuthModeChange(null);
  }, [checking, loggedIn, authMode]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.className;
    html.classList.remove("dark");
    html.classList.add("light");
    body.style.backgroundImage = "none";
    body.style.backgroundColor = "#ffffff";
    return () => {
      html.className = prevHtml;
      body.style.backgroundImage = "";
      body.style.backgroundColor = "";
    };
  }, []);

  async function goToApp() {
    const check = await fnHasSeries();
    if (check.pendingPaymentSeriesId && !check.hasActiveSeries) {
      navigate({
        to: "/subscribe",
        search: { seriesId: check.pendingPaymentSeriesId },
      });
      return;
    }
    navigate({ to: check.hasActiveSeries ? "/series/videos" : "/series/create" });
  }

  function openSignup() {
    if (loggedIn) void goToApp();
    else onAuthModeChange(registrationOpen ? "signup" : "signin");
  }

  function openSignin() {
    if (loggedIn) void goToApp();
    else onAuthModeChange("signin");
  }

  return (
    <MarketingLayout
      headerActions={
        checking ? (
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        ) : loggedIn ? (
          <button
            type="button"
            onClick={() => void goToApp()}
            className="h-10 rounded-full bg-[#C9A227] px-5 text-sm font-semibold text-neutral-950 hover:bg-[#B8961C]"
          >
            Open app
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/auth/google";
              }}
              className="hidden h-10 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:inline-flex"
            >
              <GoogleMark className="h-4 w-4" />
              Sign in with Google
            </button>
            <button
              type="button"
              onClick={openSignup}
              className="h-10 rounded-full bg-[#C9A227] px-5 text-sm font-semibold text-neutral-950 hover:bg-[#B8961C]"
            >
              {registrationOpen ? "Get started" : "Sign in"}
            </button>
          </>
        )
      }
    >
      <main id="top">
        <section className="mx-auto max-w-4xl px-4 pb-8 pt-14 text-center sm:pt-20">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="flex -space-x-2">
              {AVATARS.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-8 w-8 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            <p className="text-sm text-neutral-500">
              Trusted by <span className="font-semibold text-neutral-900">{socialProof}</span> users
            </p>
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            Faceless reels. Created and posted for you.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-neutral-500 sm:text-lg">
            {tagline}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-neutral-500">
            <span>Perfect for</span>
            <YouTubeMark />
            <InstagramMark />
            <TikTokMark />
          </div>
          <button
            type="button"
            onClick={openSignup}
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-[#C9A227] px-8 text-base font-semibold text-neutral-950 shadow-[0_16px_40px_-16px_#C9A227] hover:bg-[#B8961C]"
          >
            <Zap className="h-5 w-5 fill-neutral-950 text-neutral-950" />
            Start your first series
          </button>
          <p className="mt-3 text-xs text-neutral-400">Go from niche to scheduled posts in a few minutes.</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <p className="mb-4 text-sm font-medium text-neutral-700">
            Creates videos for any niche
            <span className="ml-2 inline-block rotate-12 text-[#C9A227]">↘</span>
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-6 sm:overflow-visible">
            {NICHES.map((n) => (
              <div
                key={n.label}
                className="relative h-56 w-36 shrink-0 overflow-hidden rounded-2xl sm:h-64 sm:w-auto"
              >
                <img src={n.img} alt={n.label} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-extrabold tracking-wide text-white">{n.word}</span>
                </div>
                <span className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-white/90">
                  {n.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">We actually get views</h2>
          <p className="mt-2 text-neutral-500">Real channels getting millions of views with our AI tool.</p>

          <div className="relative mx-auto mt-10 max-w-2xl rounded-3xl border border-neutral-100 bg-white p-4 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.25)] sm:p-6">
            <div className="mb-3 flex justify-end gap-2">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                onClick={() => setChannelIndex((i) => (i + CHANNELS.length - 1) % CHANNELS.length)}
                aria-label="Previous channel"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                onClick={() => setChannelIndex((i) => (i + 1) % CHANNELS.length)}
                aria-label="Next channel"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {channel.clips.map((clip) => (
                <div key={clip.title} className="relative aspect-[3/4] overflow-hidden rounded-xl">
                  <img src={clip.img} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/25" />
                  <span className="absolute left-2 top-2 rounded bg-[#f43f5e] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Pinned
                  </span>
                  <span className="absolute inset-0 grid place-items-center text-lg font-extrabold text-white">
                    {clip.title}
                  </span>
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-medium text-white">
                    <Play className="h-3 w-3 fill-white" />
                    {clip.views}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-neutral-950 text-lg">
                  {channel.avatar}
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{channel.name}</div>
                  <div className="text-xs text-neutral-400">{channel.handle}</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {CHANNELS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`h-1.5 w-1.5 rounded-full ${i === channelIndex ? "bg-neutral-800" : "bg-neutral-300"}`}
                    onClick={() => setChannelIndex(i)}
                    aria-label={`Show channel ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-xl grid-cols-2 gap-8 text-left sm:text-center">
            <div>
              <div className="text-3xl font-extrabold text-[#C9A227] sm:text-4xl">988,578+</div>
              <div className="mt-1 text-sm text-neutral-500">channels automated</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-[#C9A227] sm:text-4xl">2,429,632+</div>
              <div className="mt-1 text-sm text-neutral-500">videos autoposted</div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Why creators choose us</h2>
          <p className="mt-2 text-neutral-500">See how Izent Reels compares to traditional content creation methods</p>
          <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
            <CompareCard
              bad
              title="Hiring video editors"
              body="Expensive at $50-200 per video, requires management and coordination with freelancers"
            />
            <CompareCard
              bad
              title="Creating videos yourself"
              body="Time-consuming process of scripting, recording, editing, and publishing across multiple platforms"
            />
            <CompareCard
              title="Izent Reels"
              body="Create and publish high-quality faceless reels on autopilot across TikTok, Instagram, and YouTube"
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">Hear what they say about us</h2>
            <p className="mt-2 text-neutral-500">See what our users have to say about Izent Reels.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <article
                key={t.name}
                className={`rounded-2xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.25)] ${i % 2 === 1 ? "lg:translate-y-4" : ""}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-neutral-800"
                      style={{ background: t.color }}
                    >
                      {t.initials}
                    </div>
                    <div className="text-sm font-semibold">{t.name}</div>
                  </div>
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-neutral-600">{t.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
            <p className="mt-2 text-neutral-500">Three steps from empty channel to scheduled posts.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {HOW_STEPS.map((step) => (
              <div key={step.n} className="rounded-2xl border border-neutral-100 p-6 text-left">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C9A227] text-sm font-bold text-neutral-950">
                  {step.n}
                </span>
                <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/how-it-works" className="text-sm font-semibold text-[#8A7014] hover:underline">
              Full walkthrough
            </Link>
          </div>
          <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
            <GrowthGraphic />
            <div>
              <span className="inline-flex rounded-full border border-[#E8D48B] bg-[#F8F1DC] px-3 py-1 text-xs font-semibold text-[#8A7014]">
                After setup
              </span>
              <h3 className="mt-4 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
                <Rocket className="h-6 w-6 text-[#C9A227]" />
                Watch your socials grow
              </h3>
              <p className="mt-3 text-neutral-500">Connect your accounts and let us handle the posting.</p>
              <ul className="mt-5 space-y-2.5 text-sm text-neutral-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#C9A227]" />
                  Automatic posting on your schedule
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#C9A227]" />
                  Supports Instagram, TikTok, and YouTube
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">See It In Action</h2>
          <p className="mt-2 text-neutral-500">
            Watch a series go from niche to scheduled posts, start to finish
          </p>
          <div className="relative mx-auto mt-8 aspect-video max-w-3xl overflow-hidden rounded-3xl border border-neutral-100 bg-gradient-to-br from-amber-50 via-white to-yellow-50 shadow-[0_24px_60px_-28px_rgba(201,162,39,0.45)]">
            <div className="absolute inset-0 grid place-items-center">
              <button
                type="button"
                onClick={openSignup}
                className="grid h-16 w-16 place-items-center rounded-full bg-[#C9A227] text-neutral-950 shadow-lg hover:bg-[#B8961C]"
                aria-label="Create your first video"
              >
                <Play className="h-7 w-7 fill-neutral-950" />
              </button>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">FAQ</h2>
          <p className="mt-2 text-center text-neutral-500">Quick answers before you start a series.</p>
          <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
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
        </section>

        <section id="blog" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">From the blog</h2>
          <p className="mt-2 text-center text-neutral-500">Guides for growing an off-camera channel.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BLOG_POSTS.map((post) => (
              <Link
                key={post.slug}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="rounded-2xl border border-neutral-100 p-5 text-left hover:border-[#E8D48B]"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[#C9A227]">{post.tag}</span>
                <h3 className="mt-2 font-semibold">{post.title}</h3>
                <p className="mt-2 text-sm text-neutral-500">{post.excerpt}</p>
                <p className="mt-3 text-xs text-neutral-400">{post.date}</p>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/blog" className="text-sm font-semibold text-[#8A7014] hover:underline">
              View all posts
            </Link>
          </div>
        </section>
      </main>

      <AuthModal
        mode={authMode}
        onModeChange={(m) => onAuthModeChange(m)}
        onClose={() => onAuthModeChange(null)}
      />
    </MarketingLayout>
  );
}

function CompareCard({ bad, title, body }: { bad?: boolean; title: string; body: string }) {
  return (
    <div className={`relative rounded-2xl border p-5 ${bad ? "border-red-200" : "border-emerald-200"}`}>
      <div
        className={`absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full ${
          bad ? "text-red-400" : "text-emerald-500"
        }`}
      >
        {bad ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </div>
      <h3 className="pr-8 text-base font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}

function GrowthGraphic() {
  return (
    <div className="relative mx-auto h-72 w-full max-w-lg">
      <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden>
        <path
          d="M20 210 C 90 200, 120 140, 180 150 S 260 40, 400 30"
          fill="none"
          stroke="#4ade80"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <polygon points="392,8 418,34 378,38" fill="#4ade80" />
      </svg>
      <div className="absolute left-[12%] top-[38%]"><TikTokMark className="h-12 w-12" /></div>
      <div className="absolute left-[42%] top-[18%]"><InstagramMark className="h-12 w-12" /></div>
      <div className="absolute right-[8%] top-[4%]"><YouTubeMark className="h-12 w-12" /></div>
      <Bubble className="left-[6%] top-[18%]" label="100K" />
      <Bubble className="left-[34%] top-[8%]" label="250K" />
      <Bubble className="right-[28%] top-[28%]" label="50K" />
      <Bubble className="right-[2%] top-[36%]" label="1M" />
    </div>
  );
}

function Bubble({ className, label }: { className: string; label: string }) {
  return (
    <div className={`absolute flex items-center gap-1 rounded-full bg-[#C9A227] px-2.5 py-1 text-[11px] font-semibold text-neutral-950 shadow ${className}`}>
      <Play className="h-3 w-3 fill-neutral-950" />
      {label}
    </div>
  );
}
