// Prefetch GitHub stars for every mod in the feed into site/data/stars.json.
// Run by .github/workflows/stars.yml (authenticated: 5000 req/h). Node 20+ has
// global fetch; no dependencies. Failures for a single repo don't fail the run
// — that repo is simply omitted (the browser falls back to a live fetch / -1).

import { writeFile, mkdir } from 'node:fs/promises';

const FEED_URL = process.env.FEED_URL
  || 'https://bryanthaboi.github.io/gen1recomp-mod-index/data/index.json';
const TOKEN = process.env.GH_TOKEN || '';
const OUT = 'site/data/stars.json';
const CONCURRENCY = 8; // gentle even with the 5000/h authenticated budget

const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function fetchStar(repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders });
    if (!res.ok) {
      console.warn(`  ${repo}: HTTP ${res.status}`);
      return null;
    }
    const j = await res.json();
    return typeof j.stargazers_count === 'number' ? j.stargazers_count : null;
  } catch (err) {
    console.warn(`  ${repo}: ${err.message}`);
    return null;
  }
}

// Simple worker-pool throttle so we never have more than CONCURRENCY in flight.
async function mapPool(items, worker, concurrency) {
  const out = {};
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const repo = items[i++];
      const stars = await worker(repo);
      if (stars != null) out[repo] = stars;
    }
  });
  await Promise.all(runners);
  return out;
}

async function main() {
  const feed = await (await fetch(FEED_URL, { cache: 'no-cache' })).json();
  const repos = [...new Set(
    (feed.mods || []).map((m) => m.github).filter(Boolean)
  )];
  console.log(`Fetching stars for ${repos.length} repos…`);

  const stars = await mapPool(repos, fetchStar, CONCURRENCY);

  await mkdir('site/data', { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    source: 'github-api',
    stars, // "owner/repo" -> stargazers_count
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${OUT} with ${Object.keys(stars).length}/${repos.length} repos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
