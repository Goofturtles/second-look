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
  let prevTotal = 0;
  try { prevTotal = (JSON.parse(fs.readFileSync(out, 'utf8')).stats || {}).total || 0; } catch (e) { /* first run */ }
  if (prevTotal && items.length < prevTotal / 2) {
    console.error('degraded fetch (' + items.length + ' vs previous ' + prevTotal + ') — keeping the previous data file');
    process.exit(0);
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
  fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), queries, stats, items }));
  console.log('wrote data/live.json: ' + stats.total + ' listings (' +
    Object.entries(perStore).map(([k, v]) => k + ' ' + v).join(', ') + ')');
})().catch((e) => {
  console.error('build-live failed: ' + (e && e.message));
  process.exit(1);
});
