// SecondHand Safe — storefront wiring. All data is bundled; nothing leaves
// the device. Verdict copy follows the design doc exactly — never assert
// safety, red only with an exact identifier.

import { buildIndex, scoreListing } from './match.js';
import { initSmoothScroll } from './smooth.js';

initSmoothScroll();

const $ = (s) => document.querySelector(s);

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const scrollOpts = (block) => ({ behavior: REDUCED.matches ? 'auto' : 'smooth', block });

// Demo props: real recalls with extractable model numbers (reachable red tier).
const PROPS = [
  'Gudook adult bike helmet KY-055, size M — $15',
  'Acer AES015 folding electric scooter, barely used',
  'Matrix T30 treadmill, works great, you haul',
];

const CATEGORIES = [
  ['All', () => true],
  ['Helmets', (r) => hasAny(r, ['helmet'])],
  ['Bikes & wheels', (r) => hasAny(r, ['bike', 'scooter', 'skateboard', 'skate'])],
  ['Fitness', (r) => hasAny(r, ['treadmill', 'dumbbell', 'barbell', 'kettlebell', 'elliptical', 'exercise', 'fitness', 'weight', 'yoga', 'rowing'])],
  ['Water', (r) => hasAny(r, ['pool', 'swim', 'life', 'flotation', 'kayak', 'paddle', 'surfboard', 'wetsuit'])],
  ['Winter & climb', (r) => hasAny(r, ['ski', 'snowboard', 'sled', 'climbing', 'harness', 'axe', 'ice'])],
];

function hasAny(recall, words) {
  const hay = `${recall.name} ${recall.title}`.toLowerCase();
  return words.some((w) => hay.includes(w));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Recall URLs must be plain https links (defense against a poisoned data file).
function safeUrl(u) {
  return typeof u === 'string' && u.startsWith('https://') ? u : 'https://www.cpsc.gov/Recalls';
}

// Images: a non-https URL must fall straight to the glyph — routing it through
// safeUrl would download an HTML page as an "image" before erroring.
function imgSrc(u) {
  return typeof u === 'string' && u.startsWith('https://') ? u : '';
}

const state = { index: null, built: '', filter: 'All', shown: 12 };

// Reduced-motion users get the poster photos; also cancel the video downloads
// (display:none alone still fetches ~561KB they will never see).
if (REDUCED.matches) {
  document.querySelectorAll('.hero-video, .card-video').forEach((v) => v.remove());
}

init();

async function init() {
  let payload;
  try {
    const res = await fetch('data/recalls.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (e) {
    $('#verdict').innerHTML =
      '<article class="verdict verdict--gray"><span class="verdict-badge">DATA UNAVAILABLE</span>' +
      '<h4>The recall database failed to load.</h4>' +
      '<p class="verdict-note">Reload the page. If this keeps happening, the bundled data file is missing.</p></article>';
    const more = $('#more-btn');
    if (more) more.style.display = 'none';
    // don't leave a dead primary CTA, and don't strand below-fold content
    // at opacity 0 in browsers using the IO reveal fallback
    $('#check-btn').disabled = true;
    $('#listing-input').disabled = true;
    const chipState = document.querySelector('.state-chip');
    if (chipState) chipState.textContent = 'OFFLINE';
    wireReveals();
    return;
  }
  state.index = buildIndex(payload.recalls);
  state.built = payload.built;

  document.querySelectorAll('[data-stat="count"]').forEach((el) => { el.textContent = payload.count.toLocaleString(); });
  document.querySelectorAll('[data-stat="built"]').forEach((el) => { el.textContent = payload.built; });

  renderChips();
  renderFilters();
  renderRack();
  renderDossier();
  renderStrip();
  renderOverview(payload);
  wireChecker();
  wireSegNav();
  wireTryon();
  wireReveals();
}

/* ---------------- lookbook strip (seve look-cards with RECALLED pills) ---------------- */

function renderStrip() {
  const strip = $('#strip');
  if (!strip) return;
  const looks = state.index.recalls.filter((r) => imgSrc(r.image)).slice(0, 6);
  strip.innerHTML = looks.map((r) => `
    <div class="strip-card">
      <img src="${esc(imgSrc(r.image))}" alt="${esc(r.name)}" loading="lazy"
        onerror="this.outerHTML='<span class=&quot;rack-glyph&quot; aria-hidden=&quot;true&quot;>⚠️</span>'">
      <span class="strip-pill">Recalled</span>
    </div>`).join('');
}

/* ---------------- registry overview (the ANALYTICS OVERVIEW panel, real data) ---------------- */

function renderOverview(payload) {
  const panel = $('#overview-panel');
  if (!panel) return;
  const recalls = state.index.recalls;
  const year = payload.built.slice(0, 4);
  const thisYear = recalls.filter((r) => (r.date || '').startsWith(year)).length;

  const catCounts = CATEGORIES.slice(1).map(([label, fn]) => [label, recalls.filter(fn).length])
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  const CAT_DOTS = { 'Helmets': '🪖', 'Bikes & wheels': '🚲', 'Fitness': '🏋️', 'Water': '🏊', 'Winter & climb': '⛷️' };

  const newest = recalls.filter((r) => r.name).slice(0, 3);

  panel.innerHTML = `
    <div class="ov-head">
      <h3 class="panel-title">Registry overview</h3>
      <button class="pill pill--solid" id="share-btn" type="button">Share</button>
    </div>
    <p class="ov-sub">CPSC / US — DATA AS OF ${esc(payload.built)}</p>
    <div class="ov-stats">
      <div class="ov-stat">
        <span class="num">${esc(payload.count.toLocaleString())}</span>
        <span class="lbl">Recalls on file</span>
      </div>
      <div class="ov-stat">
        <span class="num">${esc(String(thisYear))} <em>${esc(year)}</em></span>
        <span class="lbl">Added this year</span>
      </div>
    </div>
    <p class="ov-label">Top categories</p>
    <div class="ov-pills">
      ${catCounts.map(([label, n]) => `
        <span class="ov-pill"><span class="dot" aria-hidden="true">${CAT_DOTS[label] || '⚠️'}</span>${esc(label)}&nbsp;<span class="n">${esc(String(n))}</span></span>`).join('')}
    </div>
    <p class="ov-label">Most recent recalls</p>
    <div class="ov-tags">
      ${newest.map((r) => `<a class="ov-tag" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.name)}</a>`).join('')}
    </div>`;

  const shareBtn = $('#share-btn');
  shareBtn?.setAttribute('aria-live', 'polite'); // text swaps below announce
  shareBtn?.addEventListener('click', async () => {
    const flash = (msg) => {
      shareBtn.textContent = msg;
      setTimeout(() => { shareBtn.textContent = 'Share'; }, 1800);
    };
    const data = { title: 'SecondHand Safe', text: 'Check used sports gear against every U.S. recall — on your device.', url: location.href };
    if (navigator.share) {
      try { await navigator.share(data); } catch { /* sheet dismissed — no feedback needed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      flash('Copied');
    } catch {
      flash('Copy blocked'); // clipboard permission denied — say so, don't go silent
    }
  });
}

/* ---------------- dossier (featured recall, seve-style label rows) ---------------- */

function renderDossier() {
  const panel = $('#dossier-panel');
  if (!panel) return;
  // Featured: newest recall that has an https image, units, remedy, and hazard.
  const r = state.index.recalls.find((x) => imgSrc(x.image) && x.units && x.remedy && x.hazard)
    || state.index.recalls.find((x) => imgSrc(x.image))
    || state.index.recalls[0];
  if (!r) return;
  panel.innerHTML = `
    <div class="dossier-info">
      <p class="dossier-no">FILE ${esc(String(r.number || r.id))} — STATUS : ACTIVE RECALL</p>
      <h3>${esc(r.name)}</h3>
      <dl class="rows">
        <div class="row"><dt>Hazard</dt><dd>${esc(r.hazard)}</dd></div>
        <div class="row"><dt>Recalled</dt><dd>${esc(r.date)}</dd></div>
        ${r.units ? `<div class="row"><dt>Units</dt><dd>${esc(r.units)}</dd></div>` : ''}
        ${r.remedy ? `<div class="row"><dt>Remedy</dt><dd>${esc(r.remedy)}</dd></div>` : ''}
        <div class="row"><dt>Resale</dt><dd>Selling a recalled product is prohibited under U.S. federal law — and gear like this still shows up on secondhand marketplaces.</dd></div>
      </dl>
      <div class="verdict-actions">
        <a class="pill pill--glass" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Read the official notice</a>
      </div>
    </div>
    <figure class="dossier-figure">
      <img src="${esc(imgSrc(r.image))}" alt="${esc(r.name)}"
        onerror="this.closest('figure').style.display='none'">
      <figcaption>CPSC EVIDENCE PHOTO — RECALL ${esc(String(r.number || r.id))}</figcaption>
    </figure>`;
}


/* ---------------- checker ---------------- */

function wireChecker() {
  const input = $('#listing-input');
  const run = () => {
    const text = input.value.trim();
    if (!text) return;
    renderVerdict(scoreListing(state.index, text), text);
  };
  $('#check-btn').addEventListener('click', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); }
  });
  // grow the field with its content (and size it once on load so the row
  // never clips its own line box)
  const size = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    // long pastes must scroll, never clip
    input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden';
  };
  input.addEventListener('input', size);
  addEventListener('resize', size, { passive: true });
  size();
}

function renderChips() {
  const wrap = $('#chips');
  for (const p of PROPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p;
    b.addEventListener('click', () => {
      const input = $('#listing-input');
      input.value = p;
      input.dispatchEvent(new Event('input'));
      renderVerdict(scoreListing(state.index, p), p);
    });
    wrap.appendChild(b);
  }
}

function renderVerdict({ verdict, candidates }, pasted = '') {
  const slot = $('#verdict');
  const top = candidates[0];

  // YOUR RESULTS header (the boards' results-card frame): what you pasted,
  // when it was checked, and a way to start over
  const header = `
    <div class="results-head">
      <span class="results-title">Your results</span>
      <button class="pill pill--glass results-reset" id="verdict-reset" type="button">Start over</button>
    </div>
    ${pasted ? `<p class="results-pasted"><span>You pasted:</span> ${esc(pasted.slice(0, 140))}</p>` : ''}
    <p class="results-checked">Checked on: ${esc(state.built)}</p>`;

  let html = '';
  if (verdict === 'red') {
    const r = top.recall;
    html = `
      <article class="verdict verdict--red">
        <span class="verdict-badge">MATCHES A RECALL</span>
        <h4>Matches recall: ${esc(r.name)} — verify the model number.</h4>
        <dl class="rows">
          <div class="row"><dt>Hazard</dt><dd>${esc(r.hazard || r.description)}</dd></div>
          <div class="row"><dt>Recalled</dt><dd>${esc(r.date)}</dd></div>
          ${r.units ? `<div class="row"><dt>Units</dt><dd>${esc(r.units)}</dd></div>` : ''}
          ${r.remedy ? `<div class="row"><dt>Remedy</dt><dd>${esc(r.remedy)}</dd></div>` : ''}
        </dl>
        <div class="verdict-actions">
          <a class="pill pill--solid" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">See official notice</a>
        </div>
        ${othersHtml(candidates)}
      </article>`;
  } else if (verdict === 'amber') {
    const r = top.recall;
    html = `
      <article class="verdict verdict--amber">
        <span class="verdict-badge">POSSIBLE MATCH</span>
        <h4>Possible match: ${esc(r.name)} — check the model number.</h4>
        <p class="verdict-hazard">Check the model number against this notice. ${esc(r.hazard || r.description)}</p>
        <p class="verdict-meta">Recalled ${esc(r.date)}${r.units ? ` · ${esc(r.units)} units` : ''}</p>
        <div class="verdict-actions">
          <a class="pill pill--glass" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Read the official notice</a>
        </div>
        ${othersHtml(candidates)}
      </article>`;
  } else {
    html = `
      <article class="verdict verdict--gray">
        <span class="verdict-badge">NO RECALL FOUND</span>
        <h4>No recall found for this description.</h4>
        <p class="verdict-note">Only sports and recreation recalls are checked, using data as of
          ${esc(state.built)}. That does not mean the product is problem-free; check the model
          number and never buy a helmet that has been in a crash.</p>
      </article>`;
  }
  // replacer FUNCTION, not string: function returns are inserted literally,
  // so $& / $' in pasted text can't act as replacement patterns
  slot.innerHTML = html.replace(/<article class="verdict verdict--(red|amber|gray)">/, (m) => m + header);
  $('#verdict-reset')?.addEventListener('click', () => {
    slot.innerHTML = '';
    const input = $('#listing-input');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  slot.scrollIntoView(scrollOpts('nearest'));
}

function othersHtml(candidates) {
  const rest = candidates.slice(1);
  if (!rest.length) return '';
  return `
    <details class="verdict-others">
      <summary>${rest.length} other possible ${rest.length === 1 ? 'match' : 'matches'}</summary>
      <ul>
        ${rest.map((c) => `<li><a href="${esc(safeUrl(c.recall.url))}" target="_blank" rel="noopener">${esc(c.recall.name)}</a> — recalled ${esc(c.recall.date)}</li>`).join('')}
      </ul>
    </details>`;
}

/* ---------------- recall rack ---------------- */

function renderFilters() {
  const wrap = $('#filters');
  for (const [label] of CATEGORIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter';
    b.setAttribute('aria-pressed', String(label === state.filter));
    b.textContent = label;
    b.addEventListener('click', () => {
      state.filter = label;
      state.shown = 12;
      wrap.querySelectorAll('.filter').forEach((f) =>
        f.setAttribute('aria-pressed', String(f === b)));
      renderRack();
    });
    wrap.appendChild(b);
  }
  $('#more-btn').addEventListener('click', () => {
    state.shown += 12;
    renderRack(true);
  });
}

const GLYPHS = [['helmet', '🪖'], ['bike', '🚲'], ['scooter', '🛴'], ['trampoline', '🤸'], ['treadmill', '🏃'], ['pool', '🏊'], ['ski', '⛷️'], ['harness', '🧗'], ['skate', '🛼']];

function renderRack(fromShowMore = false) {
  const grid = $('#rack-grid');
  const filter = CATEGORIES.find(([l]) => l === state.filter)[1];
  const matches = state.index.recalls.filter(filter);
  const visible = matches.slice(0, state.shown);
  const prevCount = fromShowMore ? grid.children.length : 0;

  grid.innerHTML = visible.map((r, i) => {
    const glyphEntry = GLYPHS.find(([w]) => hasAny(r, [w]));
    const glyph = glyphEntry ? glyphEntry[1] : '⚠️';
    const src = imgSrc(r.image);
    return `
    <article class="rack-card reveal" tabindex="-1">
      <span class="rack-no" aria-hidden="true">№ ${String(i + 1).padStart(3, '0')}</span>
      <div class="rack-media">
        ${src
          ? `<img src="${esc(src)}" alt="" loading="lazy"
               onerror="this.outerHTML='<span class=&quot;rack-glyph&quot; aria-hidden=&quot;true&quot;>${glyph}</span>'">`
          : `<span class="rack-glyph" aria-hidden="true">${glyph}</span>`}
      </div>
      <div class="rack-body">
        <span class="rack-pill">Recalled ${esc((r.date || '').slice(0, 4))}</span>
        <button class="pill pill--outline rack-tryon" type="button" data-tryon="${esc(String(r.id))}">Try on</button>
        <h3 class="rack-name">${esc(r.name)}</h3>
        <p class="rack-hazard">${esc(r.hazard || r.description)}</p>
        <p class="rack-meta">${r.units ? `${esc(r.units)} units · ` : ''}<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Official notice</a></p>
      </div>
    </article>`;
  }).join('');

  const more = $('#more-btn');
  const exhausted = matches.length <= state.shown;
  more.style.display = exhausted ? 'none' : '';
  // don't strand keyboard focus on a button that just hid itself
  if (exhausted && fromShowMore) {
    const target = grid.children[prevCount] || grid.lastElementChild;
    if (target) target.focus({ preventScroll: true });
  }
  wireReveals();
}

/* ---------------- chrome ---------------- */

/* ---------------- SEE IT ON YOU (try-on composite) ---------------- */
/* The one thing this simulation proves is that the gear was recalled — the
   stamp is burned into every render. Uploaded photos never leave the device:
   they go FileReader -> canvas, nothing else. */

const TRYON = {
  canvas: null, ctx: null,
  stage: null,            // Image: athlete photo or user upload
  product: null,          // { img, name, number }
  pos: { x: 0.5, y: 0.28 }, // relative to canvas
  size: 0.45,             // relative to canvas width
  fit: 1,
  dragging: false,
};

function wireTryon() {
  const canvas = $('#tryon-canvas');
  if (!canvas) return;
  TRYON.canvas = canvas;
  TRYON.ctx = canvas.getContext('2d');

  const athlete = new Image();
  athlete.src = 'media/athlete-f.jpg';
  athlete.onload = () => { if (!TRYON.stage) { TRYON.stage = athlete; drawTryon(); } };

  $('#stage-athlete').addEventListener('click', () => {
    TRYON.stage = athlete;
    $('#stage-athlete').setAttribute('aria-pressed', 'true');
    document.querySelector('label[for="stage-upload"]')?.classList.remove('stage-active');
    drawTryon();
  });

  // keyboard path for positioning (the canvas is focusable; arrows nudge)
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.05 : 0.015;
    const k = e.key;
    if (k === 'ArrowLeft') TRYON.pos.x -= step;
    else if (k === 'ArrowRight') TRYON.pos.x += step;
    else if (k === 'ArrowUp') TRYON.pos.y -= step;
    else if (k === 'ArrowDown') TRYON.pos.y += step;
    else return;
    e.preventDefault();
    TRYON.pos.x = Math.min(1, Math.max(0, TRYON.pos.x));
    TRYON.pos.y = Math.min(1, Math.max(0, TRYON.pos.y));
    drawTryon();
  });
  const uploadLabel = document.querySelector('label[for="stage-upload"]');
  $('#stage-upload').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src); // decoded — the blob is no longer needed
      TRYON.stage = img;
      $('#stage-athlete').setAttribute('aria-pressed', 'false');
      uploadLabel?.classList.add('stage-active');
      drawTryon();
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      $('#tryon-product-name').textContent = "That image format didn't load — try a JPG or PNG.";
    };
    img.src = URL.createObjectURL(file); // stays on-device
  });

  document.querySelectorAll('.fit-btn').forEach((b) => {
    b.addEventListener('click', () => {
      TRYON.fit = parseFloat(b.dataset.scale);
      document.querySelectorAll('.fit-btn').forEach((f) =>
        f.setAttribute('aria-pressed', String(f === b)));
      drawTryon();
    });
  });
  $('#tryon-size').addEventListener('input', (e) => {
    TRYON.size = e.target.value / 100;
    drawTryon();
  });

  // drag to place the product
  const toRel = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    TRYON.dragging = true;
    canvas.setPointerCapture(e.pointerId);
    TRYON.pos = toRel(e);
    drawTryon();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!TRYON.dragging) return;
    TRYON.pos = toRel(e);
    drawTryon();
  });
  canvas.addEventListener('pointerup', () => { TRYON.dragging = false; });

  $('#tryon-download').addEventListener('click', () => {
    try {
      const a = document.createElement('a');
      a.download = 'secondhand-safe-look.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch {
      // CPSC images don't send CORS headers, so the canvas may be tainted —
      // be honest instead of failing silently
      const b = $('#tryon-download');
      b.textContent = 'Screenshot to save';
      setTimeout(() => { b.textContent = 'Save the look'; }, 2200);
    }
  });

  // event delegation: every Try-on button anywhere on the page
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tryon]');
    if (!btn) return;
    const r = state.index.recalls.find((x) => String(x.id) === btn.dataset.tryon);
    if (!r) return;
    loadTryonProduct(r);
    document.querySelector('#tryon').scrollIntoView(scrollOpts('start'));
  });
}

function loadTryonProduct(r) {
  const src = imgSrc(r.image);
  $('#tryon-product-name').textContent = r.name;
  if (!src) { TRYON.product = null; drawTryon(); return; }
  // CPSC's image host sends no CORS headers, so we load plain (a crossOrigin
  // attempt would just error in the console first). The canvas becomes
  // tainted, which the Save button handles honestly ("Screenshot to save").
  const img = new Image();
  img.onload = () => { TRYON.product = { img, name: r.name, number: r.number || r.id }; drawTryon(); };
  img.src = src;
}

function drawTryon() {
  const { canvas, ctx, stage, product } = TRYON;
  if (!canvas || !ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (stage) {
    // cover-fit the stage
    const s = Math.max(W / stage.width, H / stage.height);
    const sw = stage.width * s, sh = stage.height * s;
    ctx.drawImage(stage, (W - sw) / 2, (H - sh) / 2, sw, sh);
  } else {
    ctx.fillStyle = '#1A1A1E';
    ctx.fillRect(0, 0, W, H);
  }

  if (product) {
    const w = W * TRYON.size * TRYON.fit;
    const h = w * (product.img.height / product.img.width);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 28;
    ctx.drawImage(product.img, W * TRYON.pos.x - w / 2, H * TRYON.pos.y - h / 2, w, h);
    ctx.restore();
  }

  // the stamp — always, this is the point
  ctx.save();
  ctx.translate(W / 2, H - 150);
  ctx.rotate(-0.06);
  ctx.font = `700 ${Math.round(W * 0.1)}px Archivo, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(180, 35, 24, 0.92)';
  ctx.fillText('RECALLED', 0, 0);
  ctx.font = `600 ${Math.round(W * 0.022)}px "Space Mono", monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(
    product ? `CPSC FILE ${String(product.number)} — SIMULATION, NOT A SALE` : 'PICK A PRODUCT AND HIT "TRY ON"',
    0, 44);
  ctx.restore();
}

// Scroll-spy for the segmented nav: the white pill follows the section in
// view, and aria-current makes that state honest for AT users.
function wireSegNav() {
  const items = [...document.querySelectorAll('.seg-item')];
  if (!items.length) return;
  const byId = new Map(items.map((a) => [a.getAttribute('href').slice(1), a]));
  const setActive = (id) => {
    for (const a of items) {
      const on = a === byId.get(id);
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };
  setActive('check'); // hero state: the checker is the page's first stop
  // Intersection band = top 30% of the viewport, so an anchor jump (section
  // top lands at y=0) and natural scrolling both register.
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) setActive(e.target.id);
    }
  }, { rootMargin: '0px 0px -55% 0px' });
  for (const id of byId.keys()) {
    const sec = document.getElementById(id);
    if (sec) spy.observe(sec);
  }
}

let observer;
function wireReveals() {
  // IntersectionObserver fallback path only (native CSS handles the rest)
  if (CSS.supports('animation-timeline: view()')) return;
  if (REDUCED.matches) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => observer.observe(el));
}
