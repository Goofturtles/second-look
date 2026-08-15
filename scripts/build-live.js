/* Refreshes data/live.json for the static (GitHub Pages) deployment.
   Run by .github/workflows/refresh-live.yml on a schedule, or by hand:
   node scripts/build-live.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { apiSearch } = require('../server.js');

(async () => {
  const payload = await apiSearch('nike windrunner');
  const out = path.join(__dirname, '..', 'data', 'live.json');
  if (!payload.items || !payload.items.length) {
    console.error('no items fetched — keeping the previous data file');
    process.exit(0); // an upstream outage must not wipe the deployed data
  }
  // one store timing out must not quietly shrink the public grid by 70%
  let prevTotal = 0;
  try { prevTotal = JSON.parse(fs.readFileSync(out, 'utf8')).stats.total || 0; } catch (e) { /* first run */ }
  const okSources = (payload.sources || []).filter((s) => s.ok).length;
  if (prevTotal && payload.stats.total < prevTotal / 2 && okSources < 2) {
    console.error('degraded fetch (' + payload.stats.total + ' vs previous ' + prevTotal +
      ', ' + okSources + ' source ok) — keeping the previous data file');
    process.exit(0);
  }
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log('wrote data/live.json: ' + payload.stats.total + ' listings (' +
    Object.entries(payload.stats.perStore).map(([k, v]) => k + ' ' + v).join(', ') + ')');
})().catch((e) => {
  console.error('build-live failed: ' + (e && e.message));
  process.exit(1);
});
