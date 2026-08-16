/* Refreshes data/live.json for the static (GitHub Pages) deployment.
   Bakes MANY topics so searches on the static site return different, relevant
   real listings. Run by .github/workflows/refresh-live.yml on a schedule, or:
   node scripts/build-live.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { apiSearch } = require('../server.js');

const TOPICS = [
  'nike windrunner', // the default Discover query — must stay first
  'soccer jersey', 'soccer cleats', 'basketball shoes', 'basketball jersey',
  'baseball glove', 'football jersey', 'hockey jersey', 'running shoes',
  'tennis racket', 'golf polo', 'ski jacket', 'track jacket', 'hoodie',
  'new balance', 'adidas samba', 'gym bag', 'baseball cap',
];

(async () => {
  const byId = new Map();
  const queries = [];
  for (const q of TOPICS) {
    try {
      const p = await apiSearch(q);
      queries.push({ q, count: p.items.length });
      for (const it of p.items) {
        if (!byId.has(it.id)) byId.set(it.id, { ...it, bucket: q });
      }
      console.log(q + ': ' + p.items.length + ' (pool ' + byId.size + ')');
    } catch (e) {
      queries.push({ q, count: 0, error: String(e && e.message).slice(0, 60) });
      console.error(q + ' failed: ' + (e && e.message));
    }
  }
  const items = [...byId.values()];
  const out = path.join(__dirname, '..', 'data', 'live.json');
  if (!items.length) {
    console.error('no items fetched — keeping the previous data file');
    process.exit(0); // an upstream outage must not wipe the deployed data
  }
  // a bad run must not quietly shrink the public pool by half or more
  let prevTotal = 0, prevFetchedAt = 0;
  try {
    const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
    prevTotal = (prev.stats || {}).total || 0;
    prevFetchedAt = Date.parse(prev.fetchedAt) || 0;
  } catch (e) { /* first run, or the retained file is unreadable */ }

  // rejecting keeps the previous file. Nobody watches this job, so say so loudly
  // enough that a wedged pipeline is visible in the Action log, and fail outright
  // once the data we are choosing to keep has gone stale.
  const keepPrevious = (why) => {
    console.error('::warning::' + why + ' — keeping the previous data file');
    const ageH = prevFetchedAt ? (Date.now() - prevFetchedAt) / 36e5 : Infinity;
    if (ageH > 48) {
      console.error('::error::retained data is ' + (ageH === Infinity ? 'of unknown age' : Math.round(ageH) + 'h old') +
        ' — the feed has been failing for too long to keep passing silently');
      process.exit(1); // a failed step skips the commit, so this still cannot publish bad data
    }
    process.exit(0);
  };

  if (prevTotal && items.length < prevTotal / 2) {
    keepPrevious('degraded fetch (' + items.length + ' vs previous ' + prevTotal + ')');
  }
  // the demo film and thumbnail both claim "1,000+ real listings", so the pool is
  // never allowed to commit below that. Halving alone is too loose to protect it:
  // losing SidelineSwap outright leaves ~929, which clears prevTotal/2 and would
  // publish a total that makes the claim false. Unlike the halving check this one
  // needs no baseline — gating it on prevTotal would switch the floor off in exactly
  // the case it matters most, a missing or corrupt retained file.
  const CLAIMED_FLOOR = 1000;
  if (items.length < CLAIMED_FLOOR && !process.env.ALLOW_BELOW_FLOOR) {
    keepPrevious('fetch of ' + items.length + ' is below the claimed floor of ' + CLAIMED_FLOOR);
  }
  const prices = items.map((i) => i.price).sort((a, b) => a - b);
  const perStore = {};
  for (const i of items) perStore[i.store] = (perStore[i.store] || 0) + 1;
  const stats = {
    total: items.length,
    min: prices[0] || 0,
    max: prices[prices.length - 1] || 0,
    median: prices[Math.floor(prices.length / 2)] || 0,
    avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) || 0,
    perStore,
  };
  // write-then-rename: writeFileSync truncates on open, so a run killed mid-write
  // would leave a half-written file that the next run cannot parse — which is the
  // one state that turns the guards above off
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ fetchedAt: new Date().toISOString(), queries, stats, items }));
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // never publish something we can't read back
  fs.renameSync(tmp, out);
  console.log('wrote data/live.json: ' + stats.total + ' listings (' +
    Object.entries(perStore).map(([k, v]) => k + ' ' + v).join(', ') + ')');
})().catch((e) => {
  console.error('build-live failed: ' + (e && e.message));
  process.exit(1);
});
