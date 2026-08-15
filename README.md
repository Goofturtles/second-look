# SECOND LOOK

Give gear a second game. A secondhand sports-gear marketplace that shows **real listings from real shops** — Poshmark and SidelineSwap today, eBay ready behind a token — with honest stats (price range, median, per-store counts) computed from the data.

Built for PeddieHacks 2026 (Sports + Health tracks).

## What's real

- Every listing in Discover is a real item someone is selling right now, with its real price, photo, seller handle, like count, and a link to the original listing (the purchase completes on the source marketplace).
- Product pages never invent claims about other people's listings: condition comes from the marketplace, and the "sold by" card shows the actual seller.
- The stats line ("68 listings · $23–$300, median $65 · Poshmark 48 · SidelineSwap 20") is computed, not typed.

## Running it

**Live mode (full experience):**

```
node server.js
```

Then open http://localhost:3488. The zero-dependency server serves the site and `/api/search?q=…`, which fans out to the shops in real time (15-minute cache, prewarmed default query). Set `EBAY_OAUTH_TOKEN` to light up eBay as a third store.

**Static mode (GitHub Pages):** the site detects there's no server and uses `data/live.json` — refreshed four times a day by the `refresh-live` GitHub Action — labeled with its refresh time. If that's missing too, it falls back to the bundled snapshot in `js/listings.js`, labeled as a snapshot. The room is never empty and never lies about freshness.

**True live search on the web:** connect this repo as a Blueprint on Render's free tier (`render.yaml` is included) and every search hits the shops in real time.

## Also in this repo

`js/match.js` + `data/recalls.json` + `tests/` — a CPSC safety-recall matching engine (885 sports-gear recalls, exact-identifier matching with adversarial tests). It powers the project's next step: flagging recalled gear before you buy it secondhand.
