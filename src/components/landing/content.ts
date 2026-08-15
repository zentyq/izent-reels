export const FAQS = [
  {
    q: "Do I need to show my face?",
    a: "No. Izent Reels generates narration, visuals, captions, and posts for you. Nothing on camera is required.",
  },
  {
    q: "Which platforms can I post to?",
    a: "Connect Instagram, TikTok, and YouTube from Connectors. Izent Reels can then auto-post on your schedule.",
  },
  {
    q: "How long until my first video?",
    a: "Most series produce a first draft in a few minutes once your niche, voice, and style are set.",
  },
  {
    q: "Can I use my own script or YouTube video?",
    a: "Yes. You can lock a script or import a YouTube video so generation follows that story instead of inventing a new one.",
  },
  {
    q: "Can I review a video before it posts?",
    a: "Yes. Open Videos in the studio to preview, generate a thumbnail, or publish now. Scheduled posts only go out after a video is ready.",
  },
  {
    q: "Do I need editing or filming skills?",
    a: "No. You pick a niche and style. Izent Reels handles scripting, visuals, voice, captions, and publishing.",
  },
  {
    q: "How many videos can I post per day?",
    a: "Each series can post 1 to 5 videos per day, with hours between posts so accounts do not spam followers.",
  },
  {
    q: "Who owns the videos?",
    a: "You own the content generated for your account. Use it on your connected social profiles.",
  },
  {
    q: "Can I use my existing social accounts?",
    a: "Yes. Connect the accounts you already run. Izent Reels posts through those profiles after you authorize them.",
  },
  {
    q: "What niches work best?",
    a: "Story niches perform well: history, horror, mythology, facts, kindness stories, and similar off-camera formats. You can also set a custom niche.",
  },
  {
    q: "Is there a free way to try it?",
    a: "Create an account and start a series to see the studio. Generation uses your connected AI and posting providers.",
  },
  {
    q: "How do I get support?",
    a: "Use the Contact page. Send your email and a short note and we will reply as soon as we can.",
  },
];

export const HOW_STEPS = [
  {
    n: "1",
    title: "Create a series",
    body: "Pick a niche, voice, art style, and how often you want new videos. You can start from a prompt or import a YouTube script.",
  },
  {
    n: "2",
    title: "Connect your accounts",
    body: "Link Instagram, TikTok, and YouTube in Connectors so Izent Reels can publish to the profiles you already use.",
  },
  {
    n: "3",
    title: "We generate and post",
    body: "New videos are produced on your schedule, captions are burned in, and posts go out while you stay off camera.",
  },
];

export const BLOG_POSTS = [
  {
    slug: "off-camera-pages-that-grow",
    tag: "Growth",
    title: "How off-camera pages actually grow",
    excerpt: "Consistency beats a perfect first video. Here is how scheduled shorts compound.",
    date: "12 Aug 2026",
    body: [
      "Most new channels stall because posting is uneven. One strong video does not build a habit with the algorithm. A simple series that publishes every day does.",
      "Izent Reels is built around that loop: choose a niche, lock a voice and look, then let new standalone stories go out on a timetable. Viewers do not need to see your face. They need a reason to stay for the next clip.",
      "Start with one niche, one length, and one or two platforms. Add more posts per day only after the first week of clean publishes.",
    ],
  },
  {
    slug: "niches-that-work-in-2026",
    tag: "Strategy",
    title: "Niches that still work in 2026",
    excerpt: "History, horror, myths, and facts still travel. Pick one and stay there.",
    date: "4 Aug 2026",
    body: [
      "Short-form still rewards clear topics. History stories, quiet horror, mythology, and bite-size facts are easy to watch without context.",
      "A custom niche can work if you can describe it in one sentence. If you cannot, the model will drift and so will your audience.",
      "Once you pick a niche, keep art style and voice stable so the channel feels like one show, not a random feed.",
    ],
  },
  {
    slug: "scheduled-posting-vs-batching",
    tag: "Workflow",
    title: "Why a posting schedule beats weekend batching",
    excerpt: "Batching feels productive. Daily posts train both you and the platform.",
    date: "28 Jul 2026",
    body: [
      "Creators often film or generate ten videos on Sunday and dump them at once. Platforms prefer a steady drip. Followers also notice when a page goes quiet for six days.",
      "A series with posts per day and a gap in hours keeps the page active without looking spammy. You can still review a video in the studio before it goes live.",
      "If you are starting out, one post a day is enough. Raise the count after you trust the quality.",
    ],
  },
  {
    slug: "connect-once-post-everywhere",
    tag: "Setup",
    title: "Connect once, post to TikTok, Instagram, and YouTube",
    excerpt: "Connectors are the step most people skip, then wonder why nothing published.",
    date: "19 Jul 2026",
    body: [
      "Generation without connected accounts still makes files. Auto-posting needs Connectors. Link each platform once, then choose those platforms on the series.",
      "If a post fails, check the Videos page for the error and reconnect the account. Tokens expire. A refresh in Connectors usually fixes it.",
      "Keep one Ayrshare project per brand so the wrong page never receives a post.",
    ],
  },
];

export function getPost(slug: string) {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
