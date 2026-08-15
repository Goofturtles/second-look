// Build-time ETL: CPSC Recall API -> data/recalls.json (sports/rec gear only).
// Run once before the weekend: node scripts/build-data.mjs
// The site never calls the API at runtime — verdict logic is fully offline.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://www.saferproducts.gov/RestWebServices/Recall';

// Keyword sweep instead of the full dump: bounded, polite, and every term maps
// to a gear category we actually cover (the gray card promises exactly this scope).
const SWEEP = [
  'helmet', 'bicycle', 'bike', 'trampoline', 'scooter', 'skateboard', 'skate',
  'hockey', 'football', 'baseball', 'softball', 'lacrosse', 'soccer', 'basketball',
  'golf', 'ski', 'snowboard', 'sled', 'treadmill', 'exercise', 'fitness',
  'dumbbell', 'weight bench', 'elliptical', 'rowing machine', 'yoga',
  'life jacket', 'life vest', 'flotation', 'swim', 'pool', 'goggles',
  'baseball bat', 'batting', 'protective pad', 'shin guard', 'mouthguard',
  'climbing', 'harness', 'gymnastics', 'boxing', 'wrestling', 'archery',
  'fishing rod', 'kayak', 'paddle', 'surfboard', 'wetsuit', 'cleats',
];

const STRONG_GEAR = /\b(helmets?|bicycles?|bikes?|trampolines?|scooters?|skateboards?|(inline|roller|ice) ?skates?|hockey|football|baseball|softball|lacrosse|soccer|basketball|golf|skis?|snowboards?|sleds?|treadmills?|ellipticals?|rowing|dumbbells?|barbells?|kettlebells?|weight bench(es)?|yoga|life (jackets?|vests?)|flotation|goggles?|bats?\b|batting|shin guards?|mouthguards?|climbing|harness(es)?|gymnastics?|boxing|wrestling|archery|kayaks?|paddles?|surfboards?|wetsuits?|cleats?|fishing|swim (vests?|rings?|aids?|trainers?)|pool (floats?|noodles?|slides?|ladders?|toys?))\b/i;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'by', 'to',
  'recall', 'recalls', 'recalled', 'due', 'hazard', 'risk', 'sold', 'brand',
  'inc', 'llc', 'ltd', 'co', 'company', 'corp', 'usa', 'new', 'used',
  'com', 'www', 'online', 'at', 'from', 'stores', 'various',
  // sale-period text that pollutes retailer/manufacturer strings
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'through', 'between',
  'nationwide', 'retailers', 'about',
]);

// Unit-suffixed numbers ("60m" rope length, "55lb") and battery designations
// ("CR2032") are specs, not models — they must never become exact identifiers.
const NOT_A_MODEL = /^(\d{1,4}(mm|cm|m|km|in|ft|lb|lbs|kg|g|oz|ml|l|v|w|mah)|(cr|lr|sr|ag)\d{3,4})$/i;

function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Model tokens live in Products[].Model when CPSC filled it in, but are often
// buried in free text ("model number ABC-123") or absent ("all units").
function modelTokens(rec) {
  const out = new Set();
  for (const p of rec.Products || []) {
    // Model-field tokens must look like models too: contain a digit, not be a
    // bare small number, not be a spec ("All models" must not red via "all").
    for (const t of tokens(p.Model)) {
      if (!/\d/.test(t)) continue;
      if (/^\d+$/.test(t) && t.length < 4) continue;
      if (NOT_A_MODEL.test(t)) continue;
      out.add(t);
    }
  }
  const text = `${rec.Description || ''} ${(rec.Products || []).map((p) => p.Description || '').join(' ')}`
    // phone numbers (CPSC hotline etc.) must not become "models"
    .replace(/\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g, ' ');
  // model-number-shaped strings: letters+digits mixes like "sr-71", "8500", "wx100"
  for (const m of text.matchAll(/\b([a-z]{0,4}\d{2,6}[a-z]{0,3}|[a-z]{1,5}-\d{1,6})\b/gi)) {
    const t = m[1].toLowerCase();
    if (/^(19|20)\d{2}$/.test(t)) continue;          // years are not models
    if (/^\d+$/.test(t) && t.length < 4) continue;   // bare sizes/ages/counts are not models
    if (NOT_A_MODEL.test(t)) continue;               // specs and batteries are not models
    out.add(t);
  }
  return [...out].slice(0, 24);
}

function firstSentence(s, max = 260) {
  const clean = (s || '')
    .replace(/(\w)\?(\w)/g, '$1 $2') // CPSC encoding artifacts: "for?bicycle?helmets"
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const atSentence = cut.lastIndexOf('. ');
  if (atSentence > max * 0.5) return cut.slice(0, atSentence + 1).trim();
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '…';
}

async function sweep(term) {
  const url = `${API}?format=json&ProductName=${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${term}: HTTP ${res.status}`);
  return res.json();
}

const byId = new Map();
const counts = {};
for (const term of SWEEP) {
  try {
    const rows = await sweep(term);
    counts[term] = rows.length;
    for (const rec of rows) {
      const hay = `${rec.Title} ${rec.Description} ${(rec.Products || []).map((p) => `${p.Name} ${p.Description || ''}`).join(' ')}`;
      // Every record must contain a real gear word, whatever term found it —
      // the API's ProductName search is fuzzy and leaks non-gear (a cast iron
      // skillet once arrived via this sweep). The gray card promises
      // "only sports and recreation recalls", so scope is a safety property.
      if (!STRONG_GEAR.test(hay)) continue;
      // Not-gear despite a gear word: souvenir cups with "helmet" in the name etc.
      if (/\b(popcorn|drinking cups?|tumblers?|souvenirs?|costumes?|halloween)\b/i.test(hay)) continue;
      if (!byId.has(rec.RecallID)) byId.set(rec.RecallID, rec);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite
  } catch (e) {
    counts[term] = `FAILED: ${e.message}`;
  }
  process.stdout.write(`${term}: ${counts[term]}\n`);
}

const out = [...byId.values()]
  .map((rec) => {
    const product = rec.Products?.[0] || {};
    return {
      id: rec.RecallID,
      number: rec.RecallNumber || '',
      date: (rec.RecallDate || '').slice(0, 10),
      title: rec.Title || '',
      name: product.Name || rec.Title || '',
      hazard: firstSentence(
        (rec.Hazards || []).map((h) => h.Name).join('; ') ||
          (rec.Title || '').split(/ due to | because /i)[1] ||
          rec.Description
      ),
      remedy: (rec.Remedies || []).map((r) => r.Name).join('; ') || '',
      units: product.NumberOfUnits || '',
      description: firstSentence(rec.Description),
      url: rec.URL || '',
      image: rec.Images?.[0]?.URL || '',
      injuries: firstSentence((rec.Injuries || []).map((i) => i.Name).join('; '), 160),
      upcs: (rec.ProductUPCs || []).map((u) => String(u.UPC || u).replace(/\D/g, '')).filter(Boolean).slice(0, 20),
      // matcher fields
      nameTokens: [...new Set(tokens(`${product.Name} ${rec.Title}`))].slice(0, 40),
      brandTokens: [...new Set((rec.Manufacturers || []).concat(rec.Importers || [], rec.Retailers || []).flatMap((m) => tokens(m.Name)))]
        .filter((t) => !/^\d+$/.test(t)) // "2025"/"10" from sale periods are not brands
        .slice(0, 12),
      modelTokens: modelTokens(rec),
    };
  })
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

mkdirSync(join(ROOT, 'data'), { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const payload = { built: stamp, source: 'CPSC Recall Database (saferproducts.gov)', count: out.length, recalls: out };
writeFileSync(join(ROOT, 'data', 'recalls.json'), JSON.stringify(payload));
const bytes = JSON.stringify(payload).length;
console.log(`\nWrote ${out.length} recalls (${(bytes / 1024 / 1024).toFixed(2)} MB) to data/recalls.json, data as of ${stamp}`);
