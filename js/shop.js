/* SECOND LOOK — every control works. State: saved hearts (persisted), bag,
   notifications, filters/sort, hero carousel, try-on, sell listings. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- catalog (board names/prices exactly; metadata powers filters) ---------- */
  /* Real Poshmark listings (js/listings.js) ARE the catalog: real titles,
     prices, photos, and listing URLs. The four board-crop items below survive
     only as profile "Recently Viewed" filler (no purchase path). */
  const REAL = window.SL_LISTINGS || { byId: {}, featured: [], windrunners: [], store: 'Poshmark', capturedAt: '' };
  const PRODUCTS = {
    cap:      { name: 'Stussy S Logo Cap', img: 'img/p-cap.jpg', big: 'img/p-cap.jpg', now: 38, size: 'M', cats: ['Accessories'], brand: 'Stussy' },
    backpack: { name: 'Nike Utility Backpack', img: 'img/p-backpack.jpg', big: 'img/p-backpack.jpg', now: 68, size: '', cats: ['Bags'], brand: 'Nike' },
    acg:      { name: 'Nike ACG Storm-FIT Jacket', img: 'img/p-acg.jpg', big: 'img/p-acg.jpg', now: 128, size: 'L', cats: ['Men'], brand: 'Nike' },
    blazer:   { name: 'Jacquemus La Veste Sarton', img: 'img/p-blazer.jpg', big: 'img/p-blazer.jpg', now: 520, size: 'S', cats: ['Women'], brand: 'Jacquemus' },
  };
  for (const [id, L] of Object.entries(REAL.byId)) {
    PRODUCTS[id] = {
      name: L.title, img: L.img, big: L.img, now: L.price,
      size: L.size || '', cats: L.cats || ['Men'], color: L.color || '',
      brand: L.brand || '', url: L.url, real: true,
      cond: /\bNWT\b/i.test(L.title) ? 'New with tags' : 'Pre-owned',
    };
  }
  const PICK_IDS = REAL.featured.length ? REAL.featured : ['cap', 'backpack', 'acg', 'blazer'];
  const WINDRUNNERS = REAL.windrunners.map((id) => ({ id, ...PRODUCTS[id] }));

  const FILTER_OPTIONS = {
    Category: ['All', 'Jackets', 'Windbreakers'],
    Size: ['All', 'M', 'L', 'XL'],
    Brand: ['All', 'Nike'],
    Color: ['All', 'Black', 'Green', 'Grey', 'Navy', 'White', 'Burgundy'],
    Condition: ['All', 'New with tags', 'Pre-owned'],
    Price: ['All', 'Under $30', '$30–$60', 'Over $60'],
  };

  // storage can throw (blocked cookies, corrupt values) — never let it kill the app
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode — session-only */ }
  }

  const state = {
    saved: new Set(loadJSON('sl-saved', [])),
    bag: [],
    bellRead: false,
    cat: 'All',
    query: '',
    filters: { Size: 'All', Color: 'All', Condition: 'All', Price: 'All', Category: 'All', Brand: 'All' },
    sort: 'Most relevant',
    athlete: 2, fit: 'Relaxed', height: "6'0\" (183 cm)", size: 'M',
    tryonProduct: PICK_IDS[0],
    currentProduct: PICK_IDS[0],
    viewed: ['cap', 'backpack', 'acg', 'blazer'],
    listings: [],
    slide: 0,
  };
  const persistSaved = () => saveJSON('sl-saved', [...state.saved]);

  /* ---------- card templates ---------- */
  const nameHtml = (n) => n.split('\n').map(esc).join('<br>');
  const money = (n) => '$' + n;
  function cardHtml(id, p, tall) {
    const savedOn = state.saved.has(id);
    return `
    <div class="card ${tall ? 'tall' : ''}">
      <button class="card-hit" type="button" data-nav="product" data-view-product="${esc(id)}"
        aria-label="${esc(p.name.replace(/\n/g, ' '))}, ${p.size ? `size ${esc(p.size)}, ` : ''}${money(p.now)}${p.was ? `, was ${money(p.was)}` : ''}${p.off ? ', ' + esc(p.off) : ''}">
        <span class="card-media">${tall
          ? `<img src="${esc(p.big || p.img)}" alt="" loading="lazy">`
          : `<picture><source media="(max-width: 640px)" srcset="${esc(p.big || p.img)}"><img src="${esc(p.img)}" alt="" loading="lazy"></picture>`}
        </span>
        <span class="card-body">
          <span class="card-name">${nameHtml(p.name)}</span>
          ${tall && p.size ? `<span class="card-sub">${esc(p.size)}</span>` : ''}
          <span class="card-price"><span class="now">${money(p.now)}</span>${p.was ? `<s><span class="visually-hidden">was </span>${money(p.was)}</s>` : ''}${!tall && p.off ? `<span class="chip-off">${esc(p.off)}</span>` : ''}${p.real ? `<span class="chip-off">${esc((p.store || REAL.store).toUpperCase())}</span>` : ''}</span>
        </span>
      </button>
      <button class="heart" type="button" data-save="${esc(id)}" aria-pressed="${savedOn}"
        aria-label="Save ${esc(p.name.replace(/\n/g, ' '))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg>
      </button>
    </div>`;
  }

  /* ---------- renders ---------- */
  // real categories come from the marketplace department plus what the title says
  function keywordCats(name) {
    const n = (name || '').toLowerCase();
    const cats = [];
    if (/shoe|sneaker|cleat|boot|trainer|slide|sandal|samba|dunk|jordan\s*\d|530|running/.test(n)) cats.push('Shoes');
    if (/\bbag\b|backpack|duffel|duffle|tote|sack/.test(n)) cats.push('Bags');
    if (/\bhat\b|\bcap\b|beanie|glove|mitt|sock|belt|scarf|headband|visor|racket|racquet/.test(n)) cats.push('Accessories');
    if (/women|womens|wmns|w's/.test(n)) cats.push('Women');
    if (/\bmen\b|mens|men's/.test(n)) cats.push('Men');
    return cats;
  }
  function augmentCats(p) {
    const extra = keywordCats(p.name);
    p.cats = [...new Set([...(p.cats || []), ...extra])];
  }
  Object.values(PRODUCTS).forEach(augmentCats);
  function renderPicks() {
    const list = PICK_IDS.concat(state.listings.map((l) => l.id));
    let filtered = list.filter((id) => state.cat === 'All' || (PRODUCTS[id].cats || []).includes(state.cat));
    if (filtered.length < 4 && state.cat !== 'All') {
      // fill the row with real listings from the live pool that match the category
      const extras = Object.keys(PRODUCTS).filter((id) =>
        !filtered.includes(id) && PRODUCTS[id].real && (PRODUCTS[id].cats || []).includes(state.cat));
      filtered = filtered.concat(extras.slice(0, 4 - filtered.length));
    }
    $('#picks').innerHTML = filtered.slice(0, 4).map((id) => cardHtml(id, PRODUCTS[id], false)).join('')
      || '<div class="empty-note">Nothing in this category yet.</div>';
  }
  function priceBand(n) { return n < 30 ? 'Under $30' : n <= 60 ? '$30–$60' : 'Over $60'; }

  /* ---------- live shop aggregation (server /api/search) ----------
     The bundled snapshot paints instantly; live results from every shop
     replace it as soon as the server answers. On static hosting (GitHub
     Pages) there is no server, so we fall back to data/live.json — a file
     our scheduled CI job refreshes from the same shops a few times a day. */
  let live = null;          // { q, stats, sources, items }
  let liveSeq = 0;          // newest search wins; superseded responses are dropped
  let bakedData = null;     // parsed data/live.json, fetched once
  let liveMiss = '';        // why live is null: 'unreachable' | 'nomatch'
  function statsFor(items) {
    const prices = items.map((i) => i.price).sort((a, b) => a - b);
    const perStore = {};
    for (const i of items) perStore[i.store] = (perStore[i.store] || 0) + 1;
    return {
      total: items.length,
      min: prices[0] || 0,
      max: prices[prices.length - 1] || 0,
      median: prices.length ? prices[Math.floor(prices.length / 2)] : 0,
      perStore,
    };
  }
  // register listings so product page, bag, hearts and try-on all work
  function registerListings(items) {
    for (const it of items) {
      const p = {
        name: it.title, img: it.img, big: it.big || it.img, now: it.price,
        was: it.was || 0,
        off: it.was ? Math.round((1 - it.price / it.was) * 100) + '% off' : '',
        size: it.size, cats: it.dept ? [it.dept] : [], color: '', brand: it.brand,
        cond: it.cond, url: it.url, real: true, store: it.store,
        seller: it.seller || '', sellerAv: it.sellerAv || '', likes: it.likes || 0,
      };
      augmentCats(p);
      PRODUCTS[it.id] = p;
    }
    if (!$('#view-home').hidden) renderPicks(); // category rows can now fill with real gear
  }
  // the multi-topic bake fills every category (bags, accessories, women…) with
  // real gear on home — in live mode AND static mode alike
  async function ensureBaked() {
    if (bakedData) return bakedData;
    try {
      const res = await fetch('data/live.json');
      if (res.ok) {
        bakedData = await res.json();
        if (bakedData && bakedData.items) registerListings(bakedData.items);
      }
    } catch (e) { /* no data file — live results still register as they arrive */ }
    return bakedData;
  }
  let loadingFor = null;    // the query whose live fetch is in flight (drives the skeleton grid)
  async function fetchLive(q) {
    q = q || ''; // undefined and '' are the same browse-mode key everywhere
    const seq = ++liveSeq;
    loadingFor = q;
    $('#results-count').textContent = 'searching live shops…';
    // browsing with an empty box still needs a server query — the house default
    const netQ = q || 'nike windrunner';
    let payload = null;
    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(netQ));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      payload = await res.json();
      // every shop failing returns an empty 200 — that's a miss
      if (!payload.items || !payload.items.length) payload = null;
      if (payload) payload.q = q; // keyed by what the USER asked, not the network query
    } catch {
      payload = null;
    }
    if (!payload) {
      // static hosting: use the CI-refreshed data file (relative path — works under a subpath)
      try {
        await ensureBaked();
        if (bakedData && bakedData.items && bakedData.items.length) {
          // each baked item carries the topic it was fetched under ("bucket"),
          // so "soccer" matches soccer-topic items even when the title says "Predator"
          const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
          const items = bakedData.items.filter((it) =>
            tokens.every((t) => it.title.toLowerCase().includes(t) || (it.bucket || '').includes(t)));
          if (items.length) payload = { q, fetchedAt: bakedData.fetchedAt, stats: statsFor(items), items, baked: true };
        }
      } catch { /* no baked data either */ }
    }
    if (seq !== liveSeq) return; // a newer search superseded this one
    if (payload) {
      registerListings(payload.items);
      live = payload;
    } else {
      live = null; // snapshot stays, honestly labeled with the true reason
      liveMiss = (bakedData && bakedData.items && bakedData.items.length) ? 'nomatch' : 'unreachable';
    }
    renderResults();
  }
  function renderResults() {
    const q = state.query || '';
    $('#results-label').innerHTML = q ? 'Results for &ldquo;' + esc(q) + '&rdquo;' : 'Trending gear';
    const isLive = !!(live && live.q === q);
    // a real user search with its live fetch still in flight shows skeletons,
    // never another query's results
    if (!isLive && q && loadingFor === q) {
      $('#results').innerHTML = '<div class="skel-card"></div>'.repeat(8);
      $('#results-count').textContent = 'searching live shops…';
      return;
    }
    const pool = isLive
      ? live.items.map((it) => ({ id: it.id, name: it.title, size: it.size, img: it.img, now: it.price, color: '', cond: it.cond }))
      : WINDRUNNERS;
    const passes = (w, ignoreQuery) =>
      (isLive || ignoreQuery || !q || (w.name.replace('\n', ' ').toLowerCase().includes(q.toLowerCase()))) &&
      (state.filters.Size === 'All' || w.size === state.filters.Size) &&
      (state.filters.Color === 'All' || w.color === state.filters.Color) &&
      (state.filters.Condition === 'All' || w.cond === state.filters.Condition) &&
      (state.filters.Price === 'All' || priceBand(w.now) === state.filters.Price) &&
      (state.filters.Brand === 'All' || (PRODUCTS[w.id] && PRODUCTS[w.id].brand === state.filters.Brand)) &&
      (state.filters.Category === 'All' || w.name.toLowerCase().includes(state.filters.Category.toLowerCase().replace(/s$/, ''))) &&
      (state.cat === 'All' || !PRODUCTS[w.id] || (PRODUCTS[w.id].cats || []).includes(state.cat));
    let list = pool.filter((w) => passes(w, false));
    // a category with no hits in the current results pulls from the full refreshed
    // pool instead of showing an empty room
    let catFallback = false;
    if (!list.length && state.cat !== 'All' && bakedData && bakedData.items) {
      const catPool = bakedData.items
        .filter((it) => PRODUCTS[it.id] && (PRODUCTS[it.id].cats || []).includes(state.cat))
        .map((it) => ({ id: it.id, name: it.title, size: it.size, img: it.img, now: it.price, color: '', cond: it.cond }));
      list = catPool.filter((w) => passes(w, true));
      catFallback = list.length > 0;
    }
    // live shops unreachable and the query matches nothing bundled: show the whole
    // snapshot, honestly labeled, instead of an empty room
    const snapshotFallback = !catFallback && !isLive && q && !list.length;
    if (snapshotFallback) list = pool.filter((w) => passes(w, true));
    if (state.sort === 'Price: low to high') list = [...list].sort((a, b) => a.now - b.now);
    if (state.sort === 'Price: high to low') list = [...list].sort((a, b) => b.now - a.now);
    // broad queries over the multi-topic pool can match 1000+ items — cap the DOM
    const shown = list.length > 120 ? list.slice(0, 120) : list;
    $('#results').innerHTML = shown.map((w) => cardHtml(w.id, PRODUCTS[w.id] || w, true)).join('')
      || '<div class="empty-note">No matches — try clearing a filter.</div>';
    if (catFallback) {
      $('#results-count').textContent =
        `${list.length} real ${state.cat} listings from today's refreshed pool`;
    } else if (isLive) {
      const s = live.stats;
      const stores = Object.entries(s.perStore).map(([k, v]) => `${k} ${v}`).join(' · ');
      const when = live.baked
        ? ` · refreshed ${new Date(live.fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
        : '';
      $('#results-count').textContent =
        `${list.length} of ${s.total} ${live.baked ? 'real' : 'live'} listings · $${s.min}–$${s.max}, median $${s.median} · ${stores}${when}${list.length > 120 ? ' · showing first 120' : ''}`;
    } else if (snapshotFallback) {
      $('#results-count').textContent = liveMiss === 'nomatch'
        ? `no matches in the refreshed listings — showing the snapshot of ${REAL.store}, ${REAL.capturedAt}`
        : `live shops unreachable — showing the snapshot of ${REAL.store}, ${REAL.capturedAt}`;
    } else {
      $('#results-count').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'} · snapshot of ${REAL.store}, ${REAL.capturedAt}`;
    }
  }
  function renderSaved() {
    // saved live items from an earlier visit may not be re-fetched yet — count only what we can show
    const ids = [...state.saved].filter((id) => PRODUCTS[id]);
    $('#saved-grid').innerHTML = ids.map((id) => cardHtml(id, PRODUCTS[id], true)).join('');
    $('#saved-empty').hidden = ids.length > 0;
    $('#saved-sub').textContent = ids.length ? `${ids.length} ${ids.length === 1 ? 'item' : 'items'} saved.` : 'Items you heart live here.';
  }
  function renderProfile() {
    $('#profile-listings').innerHTML = state.listings.length
      ? state.listings.map((l) => cardHtml(l.id, PRODUCTS[l.id], true)).join('')
      : '<div class="empty-note">No listings yet — try Sell Gear.</div>';
    const saved = [...state.saved].slice(0, 3);
    $('#profile-saved').innerHTML = saved.length
      ? saved.map((id) => PRODUCTS[id] ? cardHtml(id, PRODUCTS[id], true) : '').join('')
      : '<div class="empty-note">Nothing saved yet.</div>';
    $('#profile-viewed').innerHTML = state.viewed.slice(0, 4).map((id) => cardHtml(id, PRODUCTS[id], true)).join('');
  }
  function renderTryonProducts() {
    $('#tryon-products').innerHTML = PICK_IDS.map((id) => `
      <button class="tryon-pick ${state.tryonProduct === id ? 'selected' : ''}" type="button" data-tryon="${id}" aria-pressed="${state.tryonProduct === id}">
        <img src="${esc(PRODUCTS[id].img)}" alt="">${esc(PRODUCTS[id].name.split('\n')[0])}
      </button>`).join('');
  }
  function renderLooks() {
    // full-resolution photography — the board crops upscale badly at this size
    const looks = [['img/hero-athlete.jpg', 'Court classic'], ['media/card-rider.jpg', 'City layers'], ['img/look-sneaker.jpg', 'Daily miles'], ['media/card-athlete.jpg', 'Night session']];
    $('#looks-grid').innerHTML = looks.map(([img, cap], i) => `
      <div class="look-card">
        <img src="${esc(img)}" alt="${esc(cap)} look" loading="lazy">
        <div class="look-bar"><span>${esc(cap)}</span><button class="heart" type="button" data-save="${esc(PICK_IDS[i])}" aria-pressed="${state.saved.has(PICK_IDS[i])}" aria-label="Save ${esc(cap)} look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg></button></div>
      </div>`).join('');
  }
  /* Shop = browse by sport or type; each tile runs that search live */
  const SHOP_TILES = [
    ['Soccer', 'soccer'], ['Basketball', 'basketball'], ['Baseball', 'baseball'],
    ['Football', 'football jersey'], ['Hockey', 'hockey'], ['Running', 'running shoes'],
    ['Tennis', 'tennis'], ['Golf', 'golf'], ['Ski & Snow', 'ski jacket'],
    ['Jerseys', 'jersey'], ['Sneakers', 'sneakers'], ['Jackets', 'jacket'],
  ];
  function renderShopTiles() {
    $('#shop-tiles').innerHTML = SHOP_TILES.map(([label, q]) => `
      <button class="shop-tile" type="button" data-shopq="${esc(q)}">
        <b>${esc(label)}</b><span>Shop real listings</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>`).join('');
  }
  document.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-shopq]');
    if (!tile) return;
    state.query = tile.dataset.shopq;
    $('#search-input').value = state.query;
    live = null;
    show('discover');
  });
  function renderCommunity() {
    const posts = [['av1', 'Maya', 'Kept my first race jersey in play — 3 owners strong.'], ['av2', 'Dre', 'This windbreaker has seen 2 cities and 40 games.'], ['av3', 'Sofia', 'Sold my old cleats in a day. Someone scores in them now.'], ['av4', 'Jo', 'Thrifted the whole fit. Total: $61.']];
    $('#community-grid').innerHTML = posts.map(([av, name, text]) => `
      <div class="post-card">
        <div class="post-head"><img src="img/${av}.jpg" alt=""><b>${esc(name)}</b></div>
        <p>${esc(text)}</p>
      </div>`).join('');
  }
  function syncHearts() {
    $$('[data-save]').forEach((h) => h.setAttribute('aria-pressed', String(state.saved.has(h.dataset.save))));
  }

  /* ---------- view router ---------- */
  const VIEWS = ['home', 'discover', 'shop', 'product', 'saved', 'tryon', 'looks', 'community', 'sell', 'how', 'profile'];
  const SIDE_ACTIVE = { home: 'home', discover: 'discover', shop: 'shop', product: 'home', saved: 'saved', tryon: 'tryon', looks: 'looks', community: 'community', sell: 'sell', how: 'how', profile: 'home' };
  const TAB_ACTIVE = { home: 'home', discover: 'discover', shop: 'discover', product: 'home', saved: 'saved', tryon: 'home', looks: 'home', community: 'home', sell: 'sell', how: 'home', profile: 'profile' };
  function show(name, opts) {
    for (const v of VIEWS) {
      const el = $('#view-' + v);
      const on = v === name;
      el.hidden = !on;
      el.classList.toggle('active', on);
    }
    const target = SIDE_ACTIVE[name];
    let lit = false;
    $$('.side-link').forEach((l) => {
      const on = !lit && l.dataset.nav === target;
      if (on) lit = true;
      l.classList.toggle('active', on);
      if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    $$('.tab').forEach((t) => {
      const on = t.dataset.nav === TAB_ACTIVE[name];
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (name === 'discover') {
      // no auto-filled search: an empty box browses "Trending gear".
      // fetchLive first — it synchronously marks the query in flight, so the
      // render below shows skeletons instead of another query's cards
      if (!live || live.q !== state.query) fetchLive(state.query);
      renderResults();
    }
    if (name === 'shop') renderShopTiles();
    if (name === 'saved') renderSaved();
    if (name === 'profile') renderProfile();
    if (name === 'tryon') { renderTryonProducts(); updateTryon(); }
    if (name === 'product') {
      const id = (opts && opts.product && PRODUCTS[opts.product]) ? opts.product : state.currentProduct;
      const p = PRODUCTS[id];
      state.currentProduct = id;
      const store = p.store || REAL.store;
      $('#pd-title').textContent = p.name;
      $('#pd-now').textContent = money(p.now);
      const was = $('#pd-was');
      was.hidden = !p.was;
      if (p.was) was.innerHTML = '<span class="visually-hidden">was </span>' + money(p.was);
      $('#pd-size').textContent = p.size ? 'Size: ' + p.size : 'Size: see listing';
      $('#pd-store').textContent = p.real ? 'via ' + store : 'community item';
      $('#crumb-here').textContent = p.name;
      $('#crumb-cat').textContent = p.real ? (p.brand || store) : 'Outerwear';
      // detail rows tell the truth about real listings — no invented claims
      $('#pd-cond-chip').textContent = p.cond || 'Pre-owned';
      $('#pd-cond-b').textContent = 'Condition: ' + (p.cond || 'Pre-owned');
      $('#pd-cond-sub').textContent = p.real
        ? 'As listed by the seller on ' + store
        : 'Pre-owned · Gently worn · No major flaws';
      $('#pd-auth-b').textContent = p.real ? 'Buyer protection' : 'Authenticity: Verified';
      if (p.real) {
        $('#pd-auth-sub').textContent = 'Checkout and buyer protection happen on ' + store;
      } else {
        $('#pd-auth-sub').innerHTML = 'Passed Second Look verification <span class="visually-hidden">Verified</span><svg class="verified sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2l2.4 2 3.1-.4 1 3 2.8 1.4-1 3 1 3-2.8 1.4-1 3-3.1-.4-2.4 2-2.4-2-3.1.4-1-3L2.7 14l1-3-1-3L5.5 6.6l1-3 3.1.4z" fill="#D3EA2C"/><path d="M9 12.2l2 2 4-4.5" stroke="#0A1119" fill="none"/></svg>';
      }
      $('#pd-wear').textContent = p.real
        ? 'Photos, wear notes and seller details are on the original listing.'
        : 'Light signs of wear. Fabric and zippers in great condition.';
      const gimg = $('#gallery-img');
      gimg.src = p.big || p.img;
      gimg.style.transform = ''; // reset any zoom frame from a previous product
      const link = $('#pd-listing-link');
      link.href = p.url || '#';
      link.closest('.shops').hidden = !p.real;
      $('#pd-shop-label').textContent = 'This is a real listing — the purchase completes on ' + store + ':';
      $('#pd-link-text').textContent = 'View listing on ' + store;
      // sold-by: the marketplace's real seller handle, or the demo seller for filler items
      const av = $('#pd-seller-av');
      if (p.real) {
        $('#pd-seller-name').textContent = p.seller || store + ' seller';
        $('#pd-seller-sub').textContent = (p.likes ? p.likes + ' likes on this listing · ' : '') + 'on ' + store;
        av.hidden = !p.sellerAv;
        if (p.sellerAv) av.src = p.sellerAv;
        $('#pd-seller-btn').hidden = true;
      } else {
        $('#pd-seller-name').innerHTML = 'CourtVision <span class="visually-hidden">Verified</span><svg class="verified sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2l2.4 2 3.1-.4 1 3 2.8 1.4-1 3 1 3-2.8 1.4-1 3-3.1-.4-2.4 2-2.4-2-3.1.4-1-3L2.7 14l1-3-1-3L5.5 6.6l1-3 3.1.4z" fill="#D3EA2C"/><path d="M9 12.2l2 2 4-4.5" stroke="#0A1119" fill="none"/></svg>';
        $('#pd-seller-sub').textContent = '98% positive feedback';
        av.hidden = false;
        av.src = 'img/alex.jpg';
        $('#pd-seller-btn').hidden = false;
      }
      $('#pd-heart-big').dataset.save = id;
      $('#pd-heart-circle').dataset.save = id;
      syncHearts();
      // every product now carries a single photo (live listings and user uploads alike),
      // so the board's multi-shot thumb strip stays off — its stock photos would lie
      const thumbs = document.querySelector('.thumbs');
      if (thumbs) thumbs.style.display = 'none';
      // "free shipping / easy returns / secure checkout" are OUR promises — they don't
      // apply to a purchase that completes on another marketplace
      const strip = document.querySelector('#view-product .feature-strip');
      if (strip) strip.hidden = !!p.real;
      if (!(opts && opts.silent) && !state.viewed.includes(id)) state.viewed.unshift(id);
    }
    scrollTo({ top: 0, behavior: 'instant' });
    const h = $('#view-' + name).querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* ---------- global click delegation ---------- */
  document.addEventListener('click', (e) => {
    const heart = e.target.closest('[data-save]');
    if (heart) {
      e.preventDefault();
      const id = heart.dataset.save;
      const on = !state.saved.has(id);
      if (on) state.saved.add(id); else state.saved.delete(id);
      persistSaved();
      syncHearts();
      heart.classList.remove('pop'); void heart.offsetWidth; heart.classList.add('pop');
      toast(on ? 'Saved — find it under Saved' : 'Removed from Saved');
      if (!$('#view-saved').hidden) renderSaved();
      if (!$('#view-profile').hidden) renderProfile();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      show(nav.dataset.nav, { product: nav.dataset.viewProduct });
      return;
    }
    const dead = e.target.closest('a[href="#"]');
    if (dead && !dead.classList.contains('skip-link')) e.preventDefault();
  });

  /* ---------- hero carousel ---------- */
  const heroTrack = $('#hero-track');
  const dots = $$('#hero-dots .dot');
  let heroTimer = null;
  const slides = $$('.hero-slide');
  function goSlide(i, user) {
    const n = slides.length;
    state.slide = ((i % n) + n) % n;
    heroTrack.style.transform = `translateX(-${state.slide * 100}%)`;
    dots.forEach((d, j) => {
      d.classList.toggle('active', j === state.slide);
      d.setAttribute('aria-pressed', String(j === state.slide));
    });
    // off-screen slides must not catch Tab focus
    slides.forEach((s, j) => { s.inert = j !== state.slide; });
    if (user) restartHero();
  }
  function restartHero() {
    clearInterval(heroTimer);
    if (!REDUCED) heroTimer = setInterval(() => goSlide(state.slide + 1), 5000);
  }
  dots.forEach((d, i) => d.addEventListener('click', () => goSlide(i, true)));
  $('#hero').addEventListener('pointerenter', () => clearInterval(heroTimer));
  $('#hero').addEventListener('pointerleave', restartHero);
  // keyboard users can pause too (WCAG 2.2.2)
  $('#hero').addEventListener('focusin', () => clearInterval(heroTimer));
  $('#hero').addEventListener('focusout', restartHero);
  slides.forEach((s, j) => { s.inert = j !== 0; });
  restartHero();

  /* ---------- category tabs ---------- */
  $$('#cats .cat').forEach((c) => c.addEventListener('click', () => {
    state.cat = c.textContent.trim();
    $$('#cats .cat').forEach((x) => {
      const on = x === c;
      x.classList.toggle('active', on);
      x.setAttribute('aria-pressed', String(on));
    });
    renderPicks();
    if (!$('#view-discover').hidden) renderResults();
    toast(state.cat === 'All' ? 'Showing everything' : `Filtering: ${state.cat}`);
  }));
  $('#cats .cat').classList.add('active');

  /* ---------- dropdown helper (filters, sort, height, size) ----------
     keyboard contract: focus moves into the menu on open, arrows cycle,
     Escape/select restores focus to the opener. */
  let openPop = null;
  function closePop(restoreFocus) {
    if (!openPop) return;
    const btn = openPop.btn;
    openPop.menu.remove();
    btn.setAttribute('aria-expanded', 'false');
    openPop = null;
    if (restoreFocus !== false) btn.focus({ preventScroll: true });
  }
  function openMenu(btn, options, current, onPick) {
    if (openPop && openPop.btn === btn) { closePop(); return; }
    closePop(false);
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = options.map((o) => `<button type="button" role="menuitem" class="menu-item ${o === current ? 'selected' : ''}">${esc(o)}</button>`).join('');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.min(r.left, innerWidth - menu.offsetWidth - 12) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    openPop = { btn, menu };
    const items = [...menu.querySelectorAll('.menu-item')];
    (items.find((i) => i.classList.contains('selected')) || items[0]).focus();
    menu.addEventListener('keydown', (e) => {
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    });
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (!item) return;
      onPick(item.textContent.trim());
      closePop();
    });
  }
  document.addEventListener('click', (e) => {
    if (openPop && !e.target.closest('.menu') && !e.target.closest('[aria-expanded]')) closePop();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeDrawer(); closeModal(); closeBell(); } });

  /* filter pills */
  $$('#filters .filter-pill').forEach((pill) => pill.addEventListener('click', () => {
    const key = pill.dataset.filter;
    openMenu(pill, FILTER_OPTIONS[key], state.filters[key], (val) => {
      state.filters[key] = val;
      pill.classList.toggle('on', val !== 'All');
      pill.firstChild.textContent = val === 'All' ? key : `${key}: ${val}`;
      renderResults();
    });
  }));
  $('#clear-all').addEventListener('click', () => {
    for (const k of Object.keys(state.filters)) state.filters[k] = 'All';
    $$('#filters .filter-pill').forEach((p) => { p.classList.remove('on'); p.firstChild.textContent = p.dataset.filter; });
    renderResults();
    toast('Filters cleared');
  });

  /* sort + rail selects */
  $('#sel-sort').addEventListener('click', () => openMenu($('#sel-sort'), ['Most relevant', 'Price: low to high', 'Price: high to low'], state.sort, (v) => {
    state.sort = v;
    $('#sel-sort').firstChild.textContent = v;
    renderResults();
  }));
  $('#sel-height').addEventListener('click', () => openMenu($('#sel-height'), ["5'6\" (168 cm)", "5'9\" (175 cm)", "6'0\" (183 cm)", "6'3\" (191 cm)"], state.height, (v) => {
    state.height = v;
    $('#sel-height').firstChild.textContent = v;
    updateTryon();
  }));
  $('#sel-size').addEventListener('click', () => openMenu($('#sel-size'), ['S', 'M', 'L', 'XL'], state.size, (v) => {
    state.size = v;
    $('#sel-size').firstChild.textContent = v;
    updateTryon();
  }));

  /* ---------- try-on ---------- */
  $$('.athlete').forEach((a, i) => a.addEventListener('click', () => {
    state.athlete = i + 1;
    $$('.athlete').forEach((x, j) => {
      x.classList.toggle('selected', j === i);
      x.setAttribute('aria-pressed', String(j === i));
    });
    updateTryon();
  }));
  $$('.fits .fit').forEach((f) => f.addEventListener('click', () => {
    state.fit = f.textContent.trim();
    $$('.fits .fit').forEach((x) => {
      const on = x === f;
      x.classList.toggle('selected', on);
      x.setAttribute('aria-pressed', String(on));
    });
    updateTryon();
  }));
  /* ---------- free on-device AI: U²-Net-P cutout via onnxruntime-web ----------
     The model (models/u2netp.onnx, 4.6 MB) ships with the site; the wasm runtime
     loads lazily from jsdelivr on first use. No accounts, no keys, no uploads —
     the garment photo is segmented right in the browser and auto-placed. */
  const AI = { session: null, loading: null, failed: false };
  const cutoutCache = new Map(); // product id -> data-URL of the cutout
  function loadOrt() {
    if (window.ort) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('runtime load failed'));
      document.head.appendChild(s);
    });
  }
  function aiSession() {
    if (AI.session) return Promise.resolve(AI.session);
    if (AI.failed) return Promise.reject(new Error('ai unavailable'));
    if (!AI.loading) {
      AI.loading = (async () => {
        await loadOrt();
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
        AI.session = await ort.InferenceSession.create('models/u2netp.onnx', { executionProviders: ['wasm'] });
        return AI.session;
      })().catch((e) => {
        // a transient CDN hiccup gets one retry; a second failure disables AI for the session
        AI.loading = null;
        AI.fails = (AI.fails || 0) + 1;
        if (AI.fails >= 2) AI.failed = true;
        throw e;
      });
    }
    return AI.loading;
  }
  // remote images go through images.weserv.nl so the canvas isn't tainted
  function corsSafe(src) {
    if (!/^https?:/.test(src)) return src; // same-origin and data: are already safe
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(src.replace(/^https?:\/\//, '')) + '&w=640';
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image load failed'));
      im.src = corsSafe(src);
    });
  }
  async function aiCutout(src) {
    const im = await loadImage(src);
    const session = await aiSession();
    const S = 320; // u2netp's input size
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const cx = c.getContext('2d');
    cx.drawImage(im, 0, 0, S, S);
    const { data } = cx.getImageData(0, 0, S, S);
    const input = new Float32Array(3 * S * S);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0; i < S * S; i++) {
      input[i] = (data[i * 4] / 255 - mean[0]) / std[0];
      input[S * S + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1];
      input[2 * S * S + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2];
    }
    const feeds = {};
    feeds[session.inputNames[0]] = new ort.Tensor('float32', input, [1, 3, S, S]);
    const out = await session.run(feeds);
    const mask = out[session.outputNames[0]].data;
    let mn = 1, mx = 0;
    for (let i = 0; i < mask.length; i++) { if (mask[i] < mn) mn = mask[i]; if (mask[i] > mx) mx = mask[i]; }
    const range = mx - mn || 1;
    // alpha-only mask canvas, upscaled onto the full-res image with destination-in
    const mc = document.createElement('canvas'); mc.width = S; mc.height = S;
    const mctx = mc.getContext('2d');
    const mimg = mctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      mimg.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (mask[i] - mn) / range)) * 255);
    }
    mctx.putImageData(mimg, 0, 0);
    const w = im.naturalWidth, h = im.naturalHeight;
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
    const octx = oc.getContext('2d');
    octx.drawImage(im, 0, 0, w, h);
    octx.globalCompositeOperation = 'destination-in';
    octx.imageSmoothingEnabled = true;
    octx.drawImage(mc, 0, 0, S, S, 0, 0, w, h); // smoothing feathers the mask edge
    // sanity check + bounding box, so placement is about the garment, not the photo
    const od = octx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (od[(y * w + x) * 4 + 3] > 40) {
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const frac = (count * 4) / (w * h);
    if (frac < 0.04 || frac > 0.98 || maxX <= minX) throw new Error('mask unusable');
    const pad = Math.round(Math.max(w, h) * 0.02);
    const bx = Math.max(0, minX - pad), by = Math.max(0, minY - pad);
    const bw = Math.min(w, maxX + pad) - bx, bh = Math.min(h, maxY + pad) - by;
    const fc = document.createElement('canvas'); fc.width = bw; fc.height = bh;
    fc.getContext('2d').drawImage(oc, bx, by, bw, bh, 0, 0, bw, bh);
    return fc.toDataURL('image/png');
  }
  // the AI decides where the piece goes and how big it starts — no input needed
  function placeGarment(p) {
    const name = (p.name || '').toLowerCase();
    // "jordan 4" is a shoe; "jordan hoodie" is not. "shorts" go on legs; "short sleeve" does not.
    const kind = /shoe|sneaker|cleat|boot|trainer|slide|sandal|samba|dunk|530|jordan\s*\d/.test(name) ? 'feet'
      : /\bhat\b|\bcap\b|beanie|headband|visor/.test(name) ? 'head'
      : /short(?!\s*-?\s*sleeve)|pant|jogger|trouser|skirt|legging/.test(name) ? 'legs' : 'torso';
    const spot = { feet: [50, 80], head: [50, 13], legs: [50, 62], torso: [50, 38] }[kind];
    const base = { feet: 28, head: 20, legs: 40, torso: 44 }[kind];
    const sizeIdx = { S: 0, M: 1, L: 2, XL: 3 }[state.size] || 0;
    const fitNudge = state.fit === 'Relaxed' ? 3 : state.fit === 'Fitted' ? -3 : 0;
    const width = base + sizeIdx * 5 + fitNudge;
    const g = $('#tryon-product');
    g.style.left = spot[0] + '%';
    g.style.top = spot[1] + '%';
    g.style.width = width + '%';
    const slider = $('#tryon-size');
    if (slider) slider.value = width; // keep the manual slider in sync
  }
  let applySeq = 0;
  async function applyGarment(p) {
    const g = $('#tryon-product');
    const seq = ++applySeq;
    const key = state.tryonProduct;
    const src = p.big || p.img;
    const cached = cutoutCache.get(key);
    if (cached) {
      g.onerror = null;
      g.classList.add('cutout'); g.classList.remove('blend');
      g.src = cached;
      placeGarment(p);
      updateTryonCaption();
      return;
    }
    g.classList.remove('cutout', 'blend');
    // show the raw photo while the AI works; if the proxy is down, the direct
    // CDN URL still displays (only canvas access needed the proxy)
    g.onerror = () => { g.onerror = null; g.src = src; };
    g.src = corsSafe(src);
    placeGarment(p);
    $('#tryon-caption').textContent = `AI is fitting ${p.name.replace(/\n/g, ' ')}…`;
    try {
      const cut = await aiCutout(src);
      if (seq !== applySeq) return; // a newer pick superseded this one
      cutoutCache.set(key, cut);
      g.onerror = null;
      g.src = cut;
      g.classList.add('cutout');
    } catch (e) {
      if (seq !== applySeq) return;
      g.classList.add('blend'); // free fallback: light backgrounds melt into the scene
    }
    updateTryonCaption();
  }
  function updateTryonCaption() {
    const p = PRODUCTS[state.tryonProduct];
    $('#tryon-caption').textContent = `Athlete ${state.athlete} · ${p.name.replace('\n', ' ')} · ${state.size} · ${state.fit}`;
  }
  function updateTryon() {
    const av = $('#tryon-avatar'); if (!av) return;
    av.src = `img/av${state.athlete}.jpg`;
    // the stage model follows the chosen athlete
    const stageModel = $('#tryon-athlete');
    stageModel.src = state.athlete <= 2 ? 'img/model.jpg' : 'media/athlete-f.jpg';
    stageModel.alt = `Athlete ${state.athlete} stand-in model, full body`;
    applyGarment(PRODUCTS[state.tryonProduct]);
  }

  /* draggable + resizable garment on the model */
  (function wireTryonStage() {
    const stage = $('#tryon-stage');
    const garment = $('#tryon-product');
    if (!stage || !garment) return;
    let drag = null;
    garment.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { garment.setPointerCapture(e.pointerId); } catch (err) { /* keep dragging even if capture is unavailable */ }
      garment.classList.add('dragging');
      const gr = garment.getBoundingClientRect();
      drag = { dx: e.clientX - (gr.left + gr.width / 2), dy: e.clientY - (gr.top + gr.height / 2) };
    });
    garment.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const sr = stage.getBoundingClientRect();
      const x = ((e.clientX - drag.dx - sr.left) / sr.width) * 100;
      const y = ((e.clientY - drag.dy - sr.top) / sr.height) * 100;
      garment.style.left = Math.max(8, Math.min(92, x)) + '%';
      garment.style.top = Math.max(8, Math.min(92, y)) + '%';
    });
    const end = () => { drag = null; garment.classList.remove('dragging'); };
    garment.addEventListener('pointerup', end);
    garment.addEventListener('pointercancel', end);
    $('#tryon-size').addEventListener('input', (e) => {
      garment.style.width = e.target.value + '%';
    });
  })();
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-tryon]');
    if (!pick) return;
    state.tryonProduct = pick.dataset.tryon;
    renderTryonProducts();
    updateTryon();
  });
  $('#see-btn').addEventListener('click', () => show('tryon'));
  $('#tryon-save').addEventListener('click', () => {
    state.saved.add(state.tryonProduct);
    persistSaved();
    syncHearts();
    toast('Look saved — the gear is in your Saved list');
  });

  /* ---------- product gallery (real zoom crops of the source photo) ---------- */
  const GALLERY = [
    { scale: 1, x: 50, y: 50 }, { scale: 2.1, x: 62, y: 20 }, { scale: 1.9, x: 50, y: 42 },
    { scale: 2.1, x: 24, y: 78 }, { scale: 2.3, x: 55, y: 8 },
  ];
  let frame = 0;
  function setFrame(i) {
    frame = (i + GALLERY.length) % GALLERY.length;
    const g = GALLERY[frame];
    const img = $('#gallery-img');
    img.style.transform = `scale(${g.scale})`;
    img.style.transformOrigin = `${g.x}% ${g.y}%`;
    $$('#thumb-list .thumb').forEach((t, j) => t.classList.toggle('selected', j === frame));
  }
  $('#thumb-prev').addEventListener('click', () => setFrame(frame - 1));
  $('#thumb-next').addEventListener('click', () => setFrame(frame + 1));
  $$('#thumb-list .thumb').forEach((t, i) => t.addEventListener('click', () => setFrame(i)));

  /* ---------- bag drawer ---------- */
  let drawerClosing = false;
  function openDrawer() {
    drawerClosing = false;
    $('#bag-drawer').hidden = false;
    $('#scrim').hidden = false;
    $('#bag-btn').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => $('#bag-drawer').classList.add('open'));
    $('#bag-close').focus();
  }
  function closeDrawer() {
    const d = $('#bag-drawer');
    if (d.hidden || drawerClosing) return;
    drawerClosing = true;
    d.classList.remove('open');
    $('#scrim').hidden = true;
    $('#bag-btn').setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      d.hidden = true;
      drawerClosing = false;
      $('#bag-btn').focus({ preventScroll: true });
    }, REDUCED ? 0 : 250);
  }
  function renderBag() {
    const wrap = $('#bag-items');
    wrap.innerHTML = state.bag.map((id, i) => {
      const p = PRODUCTS[id];
      return `<div class="bag-item">
        <img src="${esc(p.img)}" alt="">
        <div><b>${esc(p.name.replace('\n', ' '))}</b><span>${money(p.now)}</span></div>
        <button class="icon-btn" type="button" data-unbag="${i}" aria-label="Remove ${esc(p.name.replace('\n', ' '))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    }).join('');
    $('#bag-empty').hidden = state.bag.length > 0;
    $('#bag-foot').hidden = state.bag.length === 0;
    $('#bag-total').textContent = money(state.bag.reduce((s, id) => s + PRODUCTS[id].now, 0));
    const b = $('#bag-badge');
    b.hidden = state.bag.length === 0;
    b.textContent = state.bag.length;
    $('#bag-btn').setAttribute('aria-label', state.bag.length ? `Bag, ${state.bag.length} ${state.bag.length === 1 ? 'item' : 'items'}` : 'Bag, empty');
  }
  $('#bag-btn').addEventListener('click', () => {
    if (drawerClosing) return; // ignore clicks during the close animation
    renderBag();
    $('#bag-drawer').hidden ? openDrawer() : closeDrawer();
  });
  $('#bag-close').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', () => { closeDrawer(); closeModal(); });
  document.addEventListener('click', (e) => {
    const un = e.target.closest('[data-unbag]');
    if (!un) return;
    state.bag.splice(Number(un.dataset.unbag), 1);
    renderBag();
    toast('Removed from bag');
  });
  // the bag glyph in the button flies up into the topbar bag, then the badge bumps
  function flyToBag(fromBtn) {
    if (REDUCED) return;
    const srcIcon = fromBtn.querySelector('svg');
    const dest = $('#bag-btn').getBoundingClientRect();
    const from = srcIcon.getBoundingClientRect();
    const fly = document.createElement('span');
    fly.className = 'fly-bag';
    fly.setAttribute('aria-hidden', 'true');
    fly.innerHTML = srcIcon.outerHTML;
    fly.style.left = from.left + 'px';
    fly.style.top = from.top + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      const dx = dest.left + dest.width / 2 - (from.left + 11);
      const dy = dest.top + dest.height / 2 - (from.top + 11);
      fly.style.transform = `translate(${dx}px, ${dy}px) scale(0.35) rotate(20deg)`;
      fly.style.opacity = '0';
    });
    fly.addEventListener('transitionend', () => {
      fly.remove();
      const b = $('#bag-badge');
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }, { once: true });
    setTimeout(() => fly.remove(), 1200); // safety net if transitionend never fires
  }
  $('#add-bag').addEventListener('click', (e) => {
    const id = state.currentProduct;
    state.bag.push(id);
    renderBag();
    flyToBag(e.currentTarget);
    toast(`Added to bag — ${PRODUCTS[id].name.replace(/\n/g, ' ')} · ${money(PRODUCTS[id].now)}`);
  });
  $('#checkout-btn').addEventListener('click', () => {
    toast(`Checkout — ${state.bag.length} ${state.bag.length === 1 ? 'item' : 'items'}, ${$('#bag-total').textContent} (demo)`);
  });

  /* ---------- notifications ---------- */
  function closeBell() {
    $('#bell-panel').hidden = true;
    $('#bell-btn').setAttribute('aria-expanded', 'false');
  }
  $('#bell-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('#bell-panel');
    if (!panel.hidden) { closeBell(); return; }
    const r = $('#bell-btn').getBoundingClientRect();
    panel.style.right = Math.max(12, innerWidth - r.right) + 'px';
    panel.style.top = (r.bottom + 8) + 'px';
    panel.hidden = false;
    $('#bell-btn').setAttribute('aria-expanded', 'true');
    if (!state.bellRead) {
      state.bellRead = true;
      $('#bell-badge').hidden = true;
      $('#bell-btn').setAttribute('aria-label', 'Notifications');
    }
  });
  document.addEventListener('click', (e) => {
    if (!$('#bell-panel').hidden && !e.target.closest('#bell-panel') && !e.target.closest('#bell-btn')) closeBell();
  });
  $$('#bell-panel .notif').forEach((n) => n.addEventListener('click', () => {
    closeBell();
    show(n.textContent.includes('Windrunner') || n.textContent.includes('Price drop') ? 'discover' : 'looks');
  }));

  /* ---------- modals ---------- */
  const MODALS = {
    size: ['Size guide', `<table><tr><th>Size</th><th>Chest</th><th>Length</th></tr><tr><td>S</td><td>34–36"</td><td>26"</td></tr><tr><td>M</td><td>38–40"</td><td>27.5"</td></tr><tr><td>L</td><td>42–44"</td><td>29"</td></tr></table><p>Vintage sizing runs roomy — when between sizes, size down.</p>`],
    fit: ['Fit guide', `<p><b>Fitted</b> — close to the body, true to size.</p><p><b>Regular</b> — everyday room, the middle path.</p><p><b>Relaxed</b> — roomy and easy, one size of extra air.</p><p>This windbreaker is cut <b>Relaxed</b>: order your usual size for the look in the photos.</p>`],
    profile: ['Edit profile', ''], // body built dynamically from current profile state
  };

  /* ---------- editable profile ---------- */
  const profile = Object.assign({ name: 'Alex Mercer', handle: '@alexmercer', meta: "NYC · 17 y/o · 5'11\"" }, loadJSON('sl-profile', {}));
  function applyProfile() {
    $('#pf-name').textContent = profile.name;
    $('#pf-handle').textContent = profile.handle.startsWith('@') ? profile.handle : '@' + profile.handle;
    $('#pf-meta').textContent = profile.meta;
    const sideName = document.querySelector('.user-name');
    sideName.childNodes[0].textContent = profile.name + ' ';
  }
  function profileFormHtml() {
    return `
      <form id="pf-form" class="sell-fields">
        <label>Display name<input type="text" id="pf-in-name" value="${esc(profile.name)}" required maxlength="30"></label>
        <label>Handle<input type="text" id="pf-in-handle" value="${esc(profile.handle)}" required maxlength="24"></label>
        <label>City · age · height<input type="text" id="pf-in-meta" value="${esc(profile.meta)}" maxlength="40"></label>
        <button class="btn-lime btn-wide" type="submit">Save profile</button>
      </form>`;
  }
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'pf-form') return;
    e.preventDefault();
    profile.name = $('#pf-in-name').value.trim() || profile.name;
    profile.handle = $('#pf-in-handle').value.trim() || profile.handle;
    profile.meta = $('#pf-in-meta').value.trim() || profile.meta;
    saveJSON('sl-profile', profile);
    applyProfile();
    closeModal();
    toast('Profile saved');
  });
  let modalOpener = null;
  function openModal(key, opener) {
    const [title, body] = MODALS[key];
    modalOpener = opener || document.activeElement;
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = key === 'profile' ? profileFormHtml() : body;
    $('#modal').hidden = false;
    $('#scrim').hidden = false;
    ($('#modal-body input') || $('#modal-close')).focus();
  }
  function closeModal() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    if ($('#bag-drawer').hidden) $('#scrim').hidden = true;
    if (modalOpener && modalOpener.isConnected) modalOpener.focus({ preventScroll: true });
    modalOpener = null;
  }
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modal]');
    if (m) openModal(m.dataset.modal, m);
    const edit = e.target.closest('.edit-dot');
    if (edit) openModal('profile', edit);
  });
  $('#modal-close').addEventListener('click', closeModal);

  /* ---------- sell form ---------- */
  $('#sell-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // data URL, not an object URL: the listing card reuses this src long after
    // the preview loads, so it must never be revoked out from under it
    const reader = new FileReader();
    reader.onload = () => {
      const img = $('#sell-preview');
      img.src = reader.result;
      img.hidden = false;
      $('#sell-photo-hint').hidden = true;
    };
    reader.onerror = () => toast('That image could not be read — try another file');
    reader.readAsDataURL(f);
  });
  $$('.sell-sizes .fit').forEach((f) => f.addEventListener('click', () => {
    $$('.sell-sizes .fit').forEach((x) => {
      const on = x === f;
      x.classList.toggle('selected', on);
      x.setAttribute('aria-pressed', String(on));
    });
  }));
  let listingN = 0;
  $('#sell-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#sell-name').value.trim();
    const price = Number($('#sell-price').value);
    if (!name || !price) { toast('Add a name and a price first'); return; }
    const id = 'listing-' + (++listingN);
    const img = $('#sell-preview').hidden ? 'img/p-reebok.jpg' : $('#sell-preview').src;
    const size = $('.sell-sizes .fit.selected')?.textContent.trim() || 'M';
    PRODUCTS[id] = { name: name.length > 18 ? name.slice(0, 18) + '\n' + name.slice(18, 40) : name + '\n ', img, big: img, now: price, was: Math.round(price * 1.5), off: 'NEW', size, cats: ['Men'], brand: 'You', cond: 'Excellent' };
    state.listings.unshift({ id });
    $('#sell-form').reset();
    $('#sell-preview').hidden = true;
    $('#sell-photo-hint').hidden = false;
    renderPicks();
    show('profile');
    toast(`Listed — ${name} · ${money(price)}`);
  });

  /* ---------- search ---------- */
  // the pill's padding is part of the tap target
  $('.search').addEventListener('click', () => $('#search-input').focus());
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    state.query = e.target.value.trim(); // empty box browses Trending gear
    live = null; // force a fresh live search for the new query
    show('discover');
  });

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- boot ---------- */
  $$('svg:not([aria-label])').forEach((s) => s.setAttribute('aria-hidden', 'true'));
  renderPicks();
  renderResults();
  renderLooks();
  renderCommunity();
  renderTryonProducts();
  syncHearts();
  applyProfile();
  ensureBaked();          // the full multi-topic pool backs home categories everywhere
  fetchLive(state.query); // warm the live default for instant Discover
})();
