/**
 * YouTube Data API research + script smoke test
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const key = m[1].trim();
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== YouTube Research + Script Test ===\n");
  assert(process.env.YOUTUBE_API_KEY, "YOUTUBE_API_KEY missing");

  const niche = "scary true stories";
  console.log(`1) Research niche: "${niche}"...`);
  const { researchYouTubeNiche } = await import("./src/lib/series/youtube-research.ts");
  const research = await researchYouTubeNiche(niche);

  console.log(`   videos (topByViews): ${research.topByViews.length}`);
  console.log(`   trending: ${research.trending.length}`);
  console.log(`   keywords: ${research.keywords.slice(0, 10).join(", ")}`);
  console.log(`   competitors: ${research.competitors.slice(0, 3).map((c) => c.channelTitle).join(" | ")}`);
  if (research.topByViews[0]) {
    const v = research.topByViews[0];
    console.log(`   top video: "${v.title}" — ${v.viewCount} views, ~${v.viewVelocity}/hr`);
  }
  assert(research.brief.length > 50, "brief too short");
  assert(research.keywords.length > 0, "no keywords");
  console.log("\n--- brief preview ---\n");
  console.log(research.brief.slice(0, 600) + "...\n");

  console.log("2) Generate script with research brief...");
  const { generateScriptContent } = await import("./src/lib/series/providers.ts");
  const content = await generateScriptContent({
    niche,
    durationSec: 45,
    artStyle: "comic book illustration",
    youtubeBrief: research.brief,
  });

  console.log(`   title: ${content.title}`);
  console.log(`   script (${content.script.length} chars): ${content.script.slice(0, 180)}...`);
  console.log(`   caption: ${content.caption.slice(0, 120)}...`);
  console.log(`   scenes: ${content.scenePrompts?.length || 0}`);
  assert(content.title && content.script, "script generation failed");

  console.log("\n=== PASS ===");
}

main().catch((e) => {
  console.error("\n=== FAIL ===");
  console.error(e);
  process.exit(1);
});
