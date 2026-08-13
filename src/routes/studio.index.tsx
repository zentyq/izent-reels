import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Clapperboard,
  Film,
  Layers,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { STUDIO_BRAND, STUDIO_TAGLINE, STUDIO_VIDEO_MODELS } from "@/lib/studio/constants";

export const Route = createFileRoute("/studio/")({
  head: () => ({
    meta: [
      { title: `${STUDIO_BRAND} — Long AI Video` },
      {
        name: "description",
        content: "Generate 1s–15min videos with Kling, Veo, Seedance — FFmpeg merges every clip.",
      },
    ],
  }),
  component: StudioExplorePage,
});

function StudioExplorePage() {
  return (
    <StudioShell>
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 min-h-[220px] p-8 flex flex-col justify-end">
            <div className="absolute inset-0 opacity-60 pointer-events-none" style={{ background: "var(--gradient-mesh)" }} />
            <div className="relative">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">
                Long-form pipeline
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight max-w-lg">
                {STUDIO_BRAND}
              </h1>
              <p className="mt-2 text-muted-foreground max-w-md text-sm md:text-base">
                {STUDIO_TAGLINE}. Bit-by-bit WaveSpeed generation, locked characters, FFmpeg stitch.
              </p>
              <Link
                to="/studio/generate"
                className="mt-6 inline-flex items-center gap-2 rounded-full gradient-bg px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
              >
                Start generating <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/50 p-6 flex flex-col justify-between min-h-[220px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] text-primary">
                <Zap className="h-3 w-3" /> Up to 15 minutes
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">How it works</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Prompt or paste a script</li>
                <li>2. AI locks character & style bible</li>
                <li>3. Kling / Veo / Seedance clips</li>
                <li>4. FFmpeg merges → download MP4</li>
              </ol>
            </div>
            <Link
              to="/studio/assets"
              className="text-sm text-foreground/80 hover:text-primary inline-flex items-center gap-1"
            >
              View your assets <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Create
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Link
              to="/studio/generate"
              className="group rounded-2xl border border-primary/30 bg-primary/5 p-5 hover:bg-primary/10 transition-colors"
            >
              <Wand2 className="h-5 w-5 text-primary mb-3" />
              <div className="font-semibold">Video Generation</div>
              <p className="text-xs text-muted-foreground mt-1">
                Prompt → multi-clip long video with consistency lock
              </p>
              <span className="mt-4 inline-flex text-xs font-medium text-primary group-hover:gap-2 gap-1 transition-all">
                Experience now <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
              <Layers className="h-5 w-5 text-foreground/80 mb-3" />
              <div className="font-semibold">Character lock</div>
              <p className="text-xs text-muted-foreground mt-1">
                Style bible + last-frame chaining across every clip
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
              <Film className="h-5 w-5 text-foreground/80 mb-3" />
              <div className="font-semibold">FFmpeg merge</div>
              <p className="text-xs text-muted-foreground mt-1">
                Seamless concat with faststart MP4 for mobile playback
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Engines
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {STUDIO_VIDEO_MODELS.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-border/50 bg-card/50 p-4 flex items-start gap-3"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted/60">
                  <Clapperboard className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{m.label}</span>
                    {"badge" in m && m.badge && (
                      <span className="text-[10px] rounded-full gradient-bg text-primary-foreground px-1.5 py-0.5 font-semibold">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border/60 px-6 py-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-primary mb-2" />
          <p className="text-sm text-muted-foreground">
            Standalone studio at <span className="text-foreground">/studio</span> — separate from
            Faceless Series social posting.
          </p>
        </div>
      </div>
    </StudioShell>
  );
}
