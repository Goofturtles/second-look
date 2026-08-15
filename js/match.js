// SecondHand Safe — matching engine.
// Runs identically in the browser (<script type="module">) and in node tests.
//
// Verdict contract (from the design doc — do not loosen):
//   red   = top candidate is High AND an exact identifier matched (model token or UPC).
//           Fuzzy brand+type overlap alone can NEVER produce red.
//   amber = any candidate above the floor without an exact identifier
//           (including Possible-with-model-match; red stays High-only).
//   gray  = nothing above the floor. Copy must state corpus scope + build date
//           and never assert the product is problem-free.

const ABBREV = {
  bicycle: 'bike', // unify the two words everyone uses interchangeably
  hlmt: 'helmet', helm: 'helmet',
  tball: 'ball', 't-ball': 'ball',
  bball: 'basketball', bday: '',
  kids: 'kid', child: 'kid', childs: 'kid', childrens: 'kid', children: 'kid', youth: 'kid',
  bicycles: 'bike', bikes: 'bike', cycling: 'bike',
  sk8: 'skate', rollerblades: 'skate', rollerblade: 'skate',
  tramp: 'trampoline', treadmil: 'treadmill',
  wt: 'weight', wts: 'weight', lbs: '', lb: '', oz: '',
  sz: 'size', med: 'medium', sm: 'small', lg: 'large', xl: '',
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'by', 'to',
  'new', 'used', 'like', 'great', 'good', 'condition', 'euc', 'guc', 'obo',
  'pickup', 'only', 'each', 'set', 'pair', 'size', 'color', 'blue', 'red',
  'black', 'white', 'green', 'pink', 'purple', 'gray', 'grey', 'silver',
  'small', 'medium', 'large', 'inch', 'cm', 'brand',
  // seller-channel noise that pollutes CPSC manufacturer strings ("online at
  // Amazon.com from...") — never meaningful in a listing match
  'online', 'at', 'from', 'com', 'www', 'stores', 'various', 'doing',
  'business', 'as', 'imported', 'distributed', 'sold',
]);

// Light stemming so "helmets"/"helmet", "forks"/"fork" unify. Applied to BOTH
// the listing and the recall tokens (the ETL tokenizer is simpler; buildIndex
// re-normalizes recall tokens through this same pipeline).
export function stem(t) {
  let s = t in ABBREV ? ABBREV[t] : t;
  if (s.length > 5 && s.endsWith('sses')) s = s.slice(0, -2);        // harnesses -> harness
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1); // axes -> axe, bikes -> bike
  return s in ABBREV ? ABBREV[s] : s;
}

export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\$\s?\d+(\.\d+)?/g, ' ')          // prices are noise
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map(stem)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Model-shaped tokens in the LISTING text (e.g. "sr-71", "8500", "wx100").
// Years and bare small numbers are excluded — "2 helmets" is not model "2".
export function listingModelTokens(text) {
  const out = new Set();
  for (const m of (text || '').toLowerCase().matchAll(/\b([a-z]{0,4}\d{2,6}[a-z]{0,3}|[a-z]{1,5}-\d{1,6})\b/g)) {
    const t = m[1];
    if (/^(19|20)\d{2}$/.test(t)) continue;
    if (/^\d{1,2}$/.test(t)) continue;
    out.add(t.replace(/-/g, ''));
  }
  return out;
}

export function listingUPCs(text) {
  const out = new Set();
  for (const m of (text || '').matchAll(/\b(\d{11,14})\b/g)) out.add(m[1].replace(/\D/g, ''));
  return out;
}

// Document frequency across the corpus: common gear words ("bike", "helmet")
// match everything and must count for less than distinctive ones ("cranbrook").
export function buildIndex(recalls) {
  // Re-normalize recall tokens through the same stemmer the listing goes
  // through — the ETL tokenizer is intentionally simpler, and a tokenizer
  // mismatch ("helmets" vs "helmet") silently breaks every name match.
  const prepped = recalls.map((r) => {
    const nameTokens = [...new Set((r.nameTokens || []).map(stem).filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
    const brandTokens = [...new Set((r.brandTokens || []).map(stem).filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
    // Identity core: the tokens that actually name THIS product. Must come
    // from the clean product-name field — nameTokens also contain the CPSC
    // headline ("...Serious Injury and Death..."), which would poison the
    // coverage denominator and gray out real matches.
    const nameOnly = (r.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .map(stem)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
    const identity = [...new Set(nameOnly.length ? nameOnly.slice(0, 8) : nameTokens.slice(0, 6))];
    return { ...r, nameTokens, brandTokens, identity };
  });
  const df = new Map();
  for (const r of prepped) {
    for (const t of new Set([...r.nameTokens, ...r.brandTokens])) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const n = Math.max(prepped.length, 1);
  const rarity = (t) => {
    const f = df.get(t) || 0;
    if (f === 0) return 1;
    return 1 + Math.max(0, Math.log10(n / f)); // 1..~4, higher = rarer
  };
  return { recalls: prepped, rarity };
}

export const FLOOR = 3.4;   // tuned against tests/match.test.mjs
export const HIGH = 7.0;

// Words that describe a CATEGORY of gear rather than a specific product.
// The corpus contains generic-titled recalls ("Mountain Bicycles", "Bicycle
// Bells") — without this list, every mountain-bike listing in America ambers
// against them. A candidate needs at least one matched NON-generic token
// (a brand or product proper noun) to clear the floor without an exact id.
const GENERIC = new Set([
  'bike', 'helmet', 'mountain', 'road', 'kid', 'child', 'adult', 'youth',
  'light', 'bell', 'scooter', 'skate', 'skateboard', 'trampoline', 'treadmill',
  'dumbbell', 'barbell', 'kettlebell', 'ball', 'boot', 'ski', 'snowboard',
  'harness', 'electric', 'folding', 'exercise', 'fitness', 'weight', 'bench',
  'yoga', 'mat', 'pool', 'swim', 'water', 'life', 'jacket', 'vest', 'net',
  'cargo', 'seat', 'wheel', 'rear', 'front', 'carbon', 'fiber', 'fork',
  'frame', 'pedal', 'gear', 'speed', 'year', 'model', 'rechargeable',
  'degree', 'multi', 'purpose', 'indoor', 'outdoor', 'mini', 'round',
  'toddler', 'enclosure', 'portable', 'climbing', 'rope', 'hockey',
  'football', 'baseball', 'softball', 'soccer', 'basketball', 'lacrosse',
  'golf', 'shoe', 'cleat', 'glove', 'pad', 'guard', 'stick', 'bat',
  'goggle', 'axe', 'ice', 'axes', 'sled', 'kayak', 'paddle', 'pump',
  'handlebar', 'streamer', 'grip', 'basket', 'kickstand', 'training',
]);

export function scoreListing(index, listingText) {
  const lTokens = new Set(normalize(listingText));
  const lModels = listingModelTokens(listingText);
  const lUPCs = listingUPCs(listingText);

  const results = [];
  for (const r of index.recalls) {
    const brandHits = (r.brandTokens || []).filter((t) => lTokens.has(t));
    const nameHits = (r.nameTokens || []).filter((t) => lTokens.has(t) && !brandHits.includes(t));
    // Pure-numeric recall "model" tokens are usually sizes/ages from free text
    // ("55 lbs", "450 lumens"). They only count in listing model position
    // (3+ digits via lModels), and they can only unlock the red tier at 4+
    // digits — "450 lumens" matching an e-bike model "450" must never go red.
    const modelHits = (r.modelTokens || []).filter((t) => {
      const flat = t.replace(/-/g, '');
      if (/^\d+$/.test(flat)) return flat.length >= 3 && lModels.has(flat);
      // Compare model tokens RAW — stemming "130S" to "130" would let any
      // size-130 boot exact-match a "130S" model. Models are identifiers,
      // not words.
      return lModels.has(flat) || lTokens.has(t) || lTokens.has(flat);
    });
    // Defense-in-depth mirror of the ETL rule: unit-suffixed numbers and
    // battery designations are specs, never red-unlocking identifiers.
    const NOT_A_MODEL = /^(\d{1,4}(mm|cm|m|km|in|ft|lb|lbs|kg|g|oz|ml|l|v|w|mah)|(cr|lr|sr|ag)\d{3,4})$/i;
    const strongModel = modelHits.some((t) => {
      const flat = t.replace(/-/g, '');
      if (NOT_A_MODEL.test(flat)) return false;
      return !/^\d+$/.test(flat) || flat.length >= 4;
    });
    const upcHit = (r.upcs || []).some((u) => lUPCs.has(u));

    // Identity coverage: how much of THIS product's name did the listing say?
    // Below 60% and with no exact identifier, the overlap is brand/category
    // coincidence ("Nike running shoes" vs a recalled Nike basketball shoe).
    const idCore = r.identity || [];
    const idMatched = idCore.filter((t) => lTokens.has(t)).length;
    const coverage = idCore.length ? idMatched / Math.min(idCore.length, 8) : 0;

    let score = 0;
    for (const t of brandHits) score += 3 * index.rarity(t);
    for (const t of nameHits) score += 1 * index.rarity(t);
    score += modelHits.length * 2.5;
    if (upcHit) score += 100; // exact identifier — certain

    const exactId = upcHit || strongModel;
    // Without an exact identifier, a match must both cover the product's name
    // AND include a non-generic word (brand / proper noun). Category words
    // alone ("mountain" + "bike") never clear the floor.
    const nonGeneric = [...brandHits, ...nameHits].some((t) => !GENERIC.has(t));
    if (!exactId && (coverage < 0.6 || !nonGeneric)) score *= 0.15;

    if (score <= 0) continue;
    const label = upcHit || score >= HIGH ? 'High' : 'Possible';
    results.push({ recall: r, score, label, exactId, coverage, brandHits, nameHits, modelHits, upcHit });
  }

  results.sort((a, b) => b.score - a.score);
  const above = results.filter((c) => c.score >= FLOOR).slice(0, 5);

  let verdict = 'gray';
  if (above.length > 0) {
    const top = above[0];
    verdict = top.label === 'High' && top.exactId ? 'red' : 'amber';
  }
  return { verdict, candidates: above };
}
