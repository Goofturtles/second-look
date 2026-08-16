/* SECOND LOOK dev server — static site + live shop aggregation.
   Zero dependencies. Run: node server.js  (port 3488)

   GET /api/search?q=...  →  { q, fetchedAt, stats, sources, items[] }
   Live sources: Poshmark (SSR-embedded JSON), SidelineSwap and GearTrade (public APIs),
   and eBay Browse API when EBAY_OAUTH_TOKEN is set in the environment. */

'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3488;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function fetchUrl(u, headers, redirects) {
  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US', ...headers } }, (res) => {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && (redirects || 0) < 3) {
        res.resume();
        return resolve(fetchUrl(new URL(res.headers.location, u).href, headers, (redirects || 0) + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/* ---------- Poshmark: listings ride inside the SSR page's __INITIAL_STATE__ ---------- */
async function searchPoshmark(q) {
  const html = await fetchUrl('https://poshmark.com/search?query=' + encodeURIComponent(q) + '&type=listings');
  const i = html.indexOf('__INITIAL_STATE__');
  if (i < 0) throw new Error('no state');
  const start = html.indexOf('{', i);
  const ends = [html.indexOf(';(function', start), html.indexOf('</script>', start)].filter((x) => x > -1);
  const st = JSON.parse(html.slice(start, Math.min(...ends)).trim());
  const data = (((st.$_search || {}).gridData || {}).data) || [];
  return data.map((d) => ({
    id: 'pm-' + d.id,
    title: String(d.title || '').slice(0, 90),
    price: Number(d.price) || 0,
    was: Number(d.original_price) > Number(d.price) ? Math.round(Number(d.original_price)) : 0,
    size: (d.size_obj && d.size_obj.display) || '',
    brand: d.brand || '',
    dept: (d.department && d.department.display) || '',
    cond: d.condition === 'nwt' ? 'New with tags' : 'Pre-owned',
    img: d.picture_url || '',
    big: (d.cover_shot && d.cover_shot.url_large) || d.picture_url || '',
    likes: Number(d.like_count) || 0,
    seller: d.creator_display_handle || d.creator_username || '',
    sellerAv: d.creator_picture_url || '',
    url: 'https://poshmark.com/listing/' + d.id,
    store: 'Poshmark',
  })).filter((x) => x.title && x.price > 0 && x.img.startsWith('https://'));
}

/* ---------- SidelineSwap: clean public JSON API ---------- */
async function searchSideline(q) {
  const body = await fetchUrl('https://api.sidelineswap.com/v1/facet_items?q=' + encodeURIComponent(q) + '&page=1&per_page=48&state[]=available');
  const j = JSON.parse(body);
  return (j.data || []).map((d) => {
    const price = Math.round(Number(d.price) || 0);
    const retail = Math.round(Number(d.price_retail) || 0);
    return {
      id: 'ss-' + d.id,
      title: String(d.name || '').slice(0, 90),
      price,
      was: retail > price ? retail : 0,
      size: '',
      brand: '',
      dept: '',
      cond: (d.condition_detail && d.condition_detail.name) === 'New' ? 'New with tags' : 'Pre-owned',
      img: (d.primary_image && (d.primary_image.small_url || d.primary_image.thumb_url)) || '',
      big: (d.primary_image && (d.primary_image.large_url || d.primary_image.small_url)) || '',
      likes: Number(d.favoriters_count) || 0,
      seller: (d.seller && d.seller.username) || '',
      sellerAv: '',
      url: d.url || '',
      store: 'SidelineSwap',
    };
  }).filter((x) => x.title && x.price > 0 && x.img.startsWith('https://') && x.url.startsWith('https://'));
}

/* ---------- GearTrade: Shopify storefront with public search JSON ---------- */
async function searchGearTrade(q) {
  const body = await fetchUrl('https://geartrade.com/search/suggest.json?q=' + encodeURIComponent(q) +
    '&resources%5Btype%5D=product&resources%5Blimit%5D=10');
  const ps = (((JSON.parse(body).resources || {}).results || {}).products) || [];
  return ps.filter((p) => p.available).map((p) => {
    const price = Math.round(Number(p.price) || 0);
    const compare = Math.round(Number(p.compare_at_price_max) || 0);
    let img = String((p.featured_image && p.featured_image.url) || p.image || '');
    if (img.startsWith('//')) img = 'https:' + img; // Shopify often serves protocol-relative URLs
    return {
      id: 'gt-' + p.id,
      title: String(p.title || '').slice(0, 90),
      price,
      was: compare > price ? compare : 0,
      size: '',
      brand: p.vendor || '',
      dept: '',
      cond: 'Pre-owned',
      img,
      big: img,
      likes: 0,
      seller: 'GearTrade',
      sellerAv: '',
      url: 'https://geartrade.com' + String(p.url || '').split('?')[0],
      store: 'GearTrade',
    };
  }).filter((x) => x.title && x.price > 0 && x.img.startsWith('https://') && x.url.startsWith('https://geartrade.com/'));
}

/* ---------- eBay Browse API — activates when a token is provided ---------- */
async function searchEbay(q) {
  const token = process.env.EBAY_OAUTH_TOKEN;
  if (!token) return [];
  const body = await fetchUrl('https://api.ebay.com/buy/browse/v1/item_summary/search?q=' + encodeURIComponent(q) + '&limit=48',
    { Authorization: 'Bearer ' + token });
  const j = JSON.parse(body);
  return (j.itemSummaries || []).map((d) => ({
    id: 'eb-' + d.itemId,
    title: String(d.title || '').slice(0, 90),
    price: Math.round(Number(d.price && d.price.value) || 0),
    was: 0,
    size: '',
    brand: '',
    dept: '',
    cond: d.condition === 'New' ? 'New with tags' : 'Pre-owned',
    img: (d.image && d.image.imageUrl) || (d.thumbnailImages && d.thumbnailImages[0] && d.thumbnailImages[0].imageUrl) || '',
    big: (d.image && d.image.imageUrl) || '',
    likes: 0,
    seller: (d.seller && d.seller.username) || '',
    sellerAv: '',
    url: d.itemWebUrl || '',
    store: 'eBay',
  })).filter((x) => x.title && x.price > 0 && x.img.startsWith('https://') && x.url.startsWith('https://'));
}

/* ---------- generative try-on: the free Kolors space dresses the model ---------- */
const VTON_SPACE = 'https://kwai-kolors-kolors-virtual-try-on.hf.space';
const VTON_HOSTS = ['di2ponv0v5otw.cloudfront.net', 'images.sidelineswap.com', 'edge.images.sidelineswap.com', 'cdn.shopify.com', 'i.ebayimg.com'];
const vtonCache = new Map(); // person|garment -> jpeg Buffer
let vtonBusy = false;

function requestRaw(u, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method: opts.method || 'GET', headers: opts.headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    });
    req.setTimeout(opts.timeout || 30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
async function gradioUpload(buf, name) {
  const boundary = '----slk' + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await requestRaw(VTON_SPACE + '/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length },
    body, timeout: 60000,
  });
  if (r.status !== 200) throw new Error('upload ' + r.status);
  return JSON.parse(r.buffer.toString('utf8'))[0];
}
function gradioFile(p, name) {
  return { path: p, url: VTON_SPACE + '/file=' + p, orig_name: name, mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } };
}
function vtonGenerate(personBuf, garmentBuf) {
  return (async () => {
    const pPath = await gradioUpload(personBuf, 'person.jpg');
    const gPath = await gradioUpload(garmentBuf, 'garment.jpg');
    const session = Math.random().toString(36).slice(2, 13);
    const join = await requestRaw(VTON_SPACE + '/queue/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [gradioFile(pPath, 'person.jpg'), gradioFile(gPath, 'garment.jpg'), 0, true],
        event_data: null, fn_index: 2, trigger_id: 26, session_hash: session,
      }),
      timeout: 30000,
    });
    if (join.status !== 200) throw new Error('queue join ' + join.status);
    const outUrl = await new Promise((resolve, reject) => {
      const req = https.get(VTON_SPACE + '/queue/data?session_hash=' + session, { headers: { Accept: 'text/event-stream' } }, (res) => {
        let acc = '';
        res.on('data', (c) => {
          acc += c.toString('utf8');
          let i;
          while ((i = acc.indexOf('\n\n')) > -1) {
            const frame = acc.slice(0, i); acc = acc.slice(i + 2);
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
            if (ev.msg === 'process_completed') {
              req.destroy();
              if (ev.success === false) return reject(new Error('space refused (quota or error)'));
              const out = ev.output && ev.output.data && ev.output.data[0];
              const u2 = out && (out.url || (out.path && VTON_SPACE + '/file=' + out.path));
              return u2 ? resolve(u2) : reject(new Error('no output image'));
            }
            if (ev.msg === 'close_stream') { req.destroy(); reject(new Error('stream closed early')); }
          }
        });
        res.on('end', () => reject(new Error('stream ended')));
      });
      req.setTimeout(150000, () => { req.destroy(); reject(new Error('generation timeout')); });
      req.on('error', reject);
    });
    const img = await requestRaw(outUrl, { timeout: 60000 });
    if (img.status !== 200) throw new Error('result fetch ' + img.status);
    return img.buffer;
  })();
}

function computeStats(items) {
  const prices = items.map((i) => i.price).sort((a, b) => a - b);
  const perStore = {};
  for (const i of items) perStore[i.store] = (perStore[i.store] || 0) + 1;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const avg = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
  return { total: items.length, min: prices[0] || 0, max: prices[prices.length - 1] || 0, median, avg, perStore };
}

const cache = new Map(); // q -> { t, payload }
const TTL = 15 * 60 * 1000;
const gzCache = new Map(); // file|mtime -> gzipped buffer (bounded, see static branch)

async function apiSearch(q) {
  const key = q.toLowerCase().trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.payload;
  const tasks = [
    ['Poshmark', searchPoshmark(q)],
    ['SidelineSwap', searchSideline(q)],
    ['GearTrade', searchGearTrade(q)],
    ['eBay', searchEbay(q)],
  ];
  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const items = [];
  const sources = [];
  settled.forEach((r, i) => {
    const store = tasks[i][0];
    if (store === 'eBay' && !process.env.EBAY_OAUTH_TOKEN) return; // not configured — omit
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      sources.push({ store, ok: true, count: r.value.length });
    } else {
      sources.push({ store, ok: false, error: String(r.reason && r.reason.message || r.reason).slice(0, 80) });
    }
  });
  const payload = { q, fetchedAt: new Date().toISOString(), stats: computeStats(items), sources, items };
  if (items.length) {
    cache.set(key, { t: Date.now(), payload });
    if (cache.size > 50) cache.delete(cache.keys().next().value); // drop the oldest entry
  }
  return payload;
}

// per-IP throttle for UNCACHED searches only — a public visitor must not be able
// to use this box to hammer the shops (cached answers stay free and instant)
const ipSearches = new Map(); // ip -> [timestamps of cache-miss searches]
const RATE_MAX = 12, RATE_WINDOW = 60 * 1000;
function rateLimited(ip) {
  const now = Date.now();
  const hits = (ipSearches.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  if (hits.length >= RATE_MAX) { ipSearches.set(ip, hits); return true; }
  hits.push(now);
  ipSearches.set(ip, hits);
  if (ipSearches.size > 1000) ipSearches.clear(); // crude bound, resets politely
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/search') {
      const q = (u.searchParams.get('q') || '').slice(0, 80).trim();
      if (!q) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"q required"}'); }
      const cachedHit = cache.get(q.toLowerCase());
      const isCached = cachedHit && Date.now() - cachedHit.t < TTL;
      if (!isCached && rateLimited(req.socket.remoteAddress || '')) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' });
        return res.end('{"error":"too many searches — try again in a moment"}');
      }
      try {
        const payload = await apiSearch(q);
        const body = JSON.stringify(payload);
        const head = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
        if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
          head['Content-Encoding'] = 'gzip';
          res.writeHead(200, head);
          return res.end(zlib.gzipSync(body));
        }
        res.writeHead(200, head);
        return res.end(body);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: String(e.message || e).slice(0, 120) }));
      }
    }
    if (u.pathname === '/api/vton') {
      const g = (u.searchParams.get('g') || '').slice(0, 500);
      const person = { 1: 'img/model1.jpg', 2: 'img/model2.jpg', 3: 'img/model3.jpg', 4: 'img/model4.jpg', 5: 'img/model5.jpg', 6: 'img/model6.jpg' }[u.searchParams.get('p')] || 'img/model2.jpg';
      const key = person + '|' + g;
      const hit = vtonCache.get(key);
      if (hit) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }); return res.end(hit); }
      // resolve the garment source: our own file, or a whitelisted shop CDN
      let garmentBuf = null;
      if (/^https:\/\//.test(g)) {
        let host = ''; try { host = new URL(g).hostname; } catch (e) {}
        if (!VTON_HOSTS.includes(host)) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"unsupported image host"}'); }
      } else {
        // same rules as the static branch: no traversal, no dotfiles — a repo file
        // must never be readable here and shipped off to the try-on service
        const local = path.join(ROOT, g);
        if (!local.startsWith(ROOT + path.sep) || g.includes('..') || g.includes('\0') ||
            /(^|[\\/])\./.test(g) || !fs.existsSync(local) || !/\.(jpe?g|png|webp)$/i.test(g)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end('{"error":"bad garment"}');
        }
      }
      if (vtonBusy) { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '10' }); return res.end('{"error":"busy"}'); }
      if (rateLimited(req.socket.remoteAddress || '')) { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' }); return res.end('{"error":"slow down"}'); }
      vtonBusy = true;
      try {
        if (/^https:\/\//.test(g)) {
          const r = await requestRaw(g, { timeout: 30000, headers: { 'User-Agent': UA } });
          if (r.status !== 200) throw new Error('garment fetch ' + r.status);
          garmentBuf = r.buffer;
        } else {
          garmentBuf = fs.readFileSync(path.join(ROOT, g));
        }
        const personBuf = fs.readFileSync(path.join(ROOT, person));
        const out = await vtonGenerate(personBuf, garmentBuf);
        vtonCache.set(key, out);
        if (vtonCache.size > 30) vtonCache.delete(vtonCache.keys().next().value);
        const type = out.slice(0, 4).toString('ascii') === 'RIFF' ? 'image/webp' : 'image/jpeg';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(out);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: String(e.message || e).slice(0, 120) }));
      } finally {
        vtonBusy = false;
      }
    }
    // static files: gzip text, cache aggressively, answer revalidations with 304
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    // no traversal, no NULs, and no dotfiles — /.git/config must never be servable
    if (!file.startsWith(ROOT + path.sep) || p.includes('..') || p.includes('\0') || /(^|[\\/])\./.test(p)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (serr, st) => {
      if (serr || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      const lastMod = st.mtime.toUTCString();
      const ext = path.extname(file).toLowerCase();
      // everything revalidates (no-cache = "check first"): a 304 costs only headers,
      // and shipped fixes are visible immediately instead of a day later
      const baseHead = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Last-Modified': lastMod,
        'Cache-Control': 'no-cache',
      };
      if (req.headers['if-modified-since'] === lastMod) { res.writeHead(304, baseHead); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        const texty = ['.html', '.css', '.js', '.json', '.svg'].includes(ext);
        if (texty && buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
          const key = file + '|' + st.mtimeMs;
          let gz = gzCache.get(key);
          if (!gz) {
            gz = zlib.gzipSync(buf);
            gzCache.set(key, gz);
            if (gzCache.size > 40) gzCache.delete(gzCache.keys().next().value);
          }
          baseHead['Content-Encoding'] = 'gzip';
          res.writeHead(200, baseHead);
          return res.end(gz);
        }
        res.writeHead(200, baseHead);
        res.end(buf);
      });
    });
  } catch (e) {
    // a malformed URL (bad percent-encoding etc.) must never take the process down
    try { res.writeHead(400); res.end('bad request'); } catch (e2) { /* response already gone */ }
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('SECOND LOOK server on http://localhost:' + PORT +
      (process.env.EBAY_OAUTH_TOKEN ? ' (eBay live)' : ' (eBay off — set EBAY_OAUTH_TOKEN to enable)'));
    // prewarm the default query so first paint gets live data instantly
    apiSearch('nike windrunner').then(
      (p) => console.log('prewarmed "nike windrunner": ' + p.stats.total + ' listings'),
      (e) => console.log('prewarm failed: ' + (e && e.message)),
    );
    // prewarm the default garment on ALL SIX models (default athlete first) so
    // switching people in the demo always shows a finished AI look instantly.
    (async () => {
      const garment = 'img/listings/r2.jpg';
      const garmentBuf = fs.readFileSync(path.join(ROOT, garment));
      for (const person of ['img/model2.jpg', 'img/model1.jpg', 'img/model3.jpg', 'img/model4.jpg', 'img/model5.jpg', 'img/model6.jpg']) {
        try {
          vtonBusy = true;
          const out = await vtonGenerate(fs.readFileSync(path.join(ROOT, person)), garmentBuf);
          vtonCache.set(person + '|' + garment, out);
          console.log('prewarmed try-on look for ' + person + ' (' + out.length + 'b)');
        } catch (e) {
          console.log('prewarm skipped for ' + person + ': ' + (e && e.message));
        } finally {
          vtonBusy = false;
        }
      }
    })();
  });
}

module.exports = { apiSearch }; // used by scripts/build-live.js for the static deployment
