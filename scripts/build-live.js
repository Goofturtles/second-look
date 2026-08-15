/* Refreshes data/live.json for the static (GitHub Pages) deployment.
   Run by .github/workflows/refresh-live.yml on a schedule, or by hand:
   node scripts/build-live.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { apiSearch } = require('../server.js');

(async () => {
  const payload = await apiSearch('nike windrunner');
  if (!payload.items || !payload.items.length) {
    console.error('no items fetched — keeping the previous data file');
    process.exit(0); // an upstream outage must not wipe the deployed data
  }
  const out = path.join(__dirname, '..', 'data', 'live.json');
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log('wrote data/live.json: ' + payload.stats.total + ' listings (' +
    Object.entries(payload.stats.perStore).map(([k, v]) => k + ' ' + v).join(', ') + ')');
})().catch((e) => {
  console.error('build-live failed: ' + (e && e.message));
  process.exit(1);
});
