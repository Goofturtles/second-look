# SecondHand Safe — Project Notes

Living document. Updated as the build evolves. Last updated: 2026-08-15, evening (v8 deployed — the site is public).

## Deployed

**Live at https://goofturtles.github.io/second-look/** — repo: https://github.com/Goofturtles/second-look (public, GitHub Pages from main).

GitHub Pages can't run the Node server, so the deployed site uses a third data tier between "live" and "snapshot": a GitHub Action re-fetches real listings from Poshmark and SidelineSwap four times a day and commits them as `data/live.json`. The page detects there's no server, loads that file, and labels the results honestly — "68 of 68 real listings · $23–$300, median $65 · Poshmark 48 · SidelineSwap 20 · refreshed Aug 15, 2:20 PM" — saying "real listings … refreshed [time]" rather than "live." Searches on the deployed site filter that refreshed pool by title; a search that matches nothing falls back to the bundled snapshot, labeled as such. A `no-referrer` meta tag keeps the shops' CDN photos loading from the public origin.

Verified on the public URL before sharing: 68 cards with working CDN images, product pages with real sellers and purchase links, red hearts, bag, and zero broken images.

Running `node server.js` locally (or connecting the repo to Render's free tier — `render.yaml` is included) upgrades the same code to true live search, where any query hits the shops in real time.

## What changed in v8 (live shops + the honesty pass)

The site no longer shows a frozen copy of anything. When you open Discover or search, a small server (server.js — plain Node, zero packages, same process that serves the pages) asks two real marketplaces at once — Poshmark and SidelineSwap — merges their answers, and hands the page every listing it found. Today's default search returns 68 live listings (48 Poshmark + 20 SidelineSwap). eBay has a ready slot that lights up the moment an eBay developer token is set; nothing else changes.

The stats line above the grid is computed from the live data, not typed in: "68 of 68 live listings · $23–$300, median $65 · Poshmark 48 · SidelineSwap 20." Filters, categories, sorting, and search all run over the live pool — Under $30 finds the six real cheap ones, New with tags finds the 28 the sellers actually tagged new, Men uses the department the marketplace itself reports. Results are cached for 15 minutes and the server pre-fetches the default search at boot, so the first paint is instant. If the shops can't be reached at all, the page quietly falls back to a 20-listing snapshot and labels it as a snapshot — it never pretends.

Every product page became truthful about being someone's real listing. Design details of that pass:

- The price row shows the live price big, and — when the seller declared an original price — that number struck through beside it in the muted gray (16px, weight 500, baseline-aligned, 10px gap). Cards show the same strike plus a "% off" chip.
- The condition chip and the Condition row now say exactly what the marketplace says ("New with tags" / "Pre-owned"), with the sub-line "As listed by the seller on Poshmark."
- The old "Authenticity: Verified — Passed Second Look verification" row was a fabricated claim when placed on a stranger's real listing, so for real items it became "Buyer protection — checkout and buyer protection happen on Poshmark." The lime verified badge only survives on the four demo filler items.
- Wear Details stopped inventing wear ("Light signs of wear…") and now points at the source: "Photos, wear notes and seller details are on the original listing."
- Sold by shows the marketplace's real seller — their actual handle (say, sherrific99), their real avatar when Poshmark provides one, and the listing's real like count ("2 likes on this listing · on Poshmark"). The fake CourtVision seller card only appears on the demo items.
- The breadcrumb's middle step is the real brand ("Home › Shop › Nike › …").
- The gallery uses the marketplace's large image file (Poshmark publishes small/medium/large URLs; we now take the large one), so the big photo is crisp instead of an upscaled thumbnail.
- The chip next to the price names the store in lime caps — POSHMARK or SIDELINESWAP — and the one button that leaves the site says "View listing on Poshmark," because the purchase honestly completes there.

The review-and-harden pass the user asked for ("enhance parts you're unsure about, like mobile"): on a 390px phone, the category chips grew to a 42px-tall tap size, the bag and bell buttons to 44px squares (Apple's minimum), tapping anywhere on the search pill now focuses the field (the pill is the target, not the thin text line), and the card price row wraps so the store chip never gets cut at the card edge. A full-page probe for clipped content comes back clean on every view, nothing scrolls sideways, and the try-on garment drags with a finger (the drag code also no longer dies if pointer capture is unavailable). Focus handling got one refinement: switching views still moves focus to the page title for screen-reader users, but the lime focus ring only paints for keyboard users — mouse and touch users never see it.

Verified before saying it's done: two full click-sweeps (desktop 1512px and mobile 390px) across every view, control, filter, menu, drawer, modal, and animation — all green — plus screenshots of the live grid and a live product page on both sizes.

Three independent audits (code review, accessibility, production readiness) then ran over the session's files, and everything they flagged was fixed and re-verified: a malformed URL can no longer crash the server (bad requests get a 400 and the process survives); if every shop is unreachable the page shows the full labeled snapshot ("live shops unreachable — showing the snapshot of Poshmark, 2026-08-15") instead of an empty grid; typing a second search while the first is still loading now works (newest search always wins — proven with a deliberately slowed race test); listing links from the shops are only accepted if they start with https; the results line is a screen-reader status region, so "68 of 68 live listings…" is announced when the search lands; the saved page counts only items it can actually show; and the product gallery's old five-thumbnail strip is retired everywhere, because every product now carries one real photo and stock thumbnails would lie.

## What changed in v7 (every control works)

Everything clickable does something real now. The hero became a three-slide carousel that advances every five seconds (pauses while you hover or focus it, dots are buttons, off-screen slides are inert so Tab can't land in them). Filter pills open real dropdown menus (arrow keys walk them, Escape closes and returns focus), sorting re-orders the grid, category tabs filter it. Hearts fill red everywhere and feed the Saved page. Add to Bag flies the little bag glyph up into the top-bar bag, which bumps its badge and keeps a working drawer (remove items, total, checkout toast). The bell opens a notification panel that navigates. The try-on stage lets you pick an athlete, drag the garment anywhere on the model, and resize it with a slider. The sell form accepts a photo (kept as a data URL so it can't vanish), sizes, and a price, and creates a real card. The profile page is editable through a small form (name, handle, meta — persisted). Menus, drawer, and modal all restore focus to what opened them.

## What changed in v6 (the exact-replica pass)

The user rejected v5 as not matching the boards and asked for an exact, screenshot-comparable replica of the six SECOND LOOK reference boards, with animation and clickable interfaces. The boards were saved to disk, which made true exactness possible:

Every color was pixel-sampled from the board files with ffmpeg (page background 030B12 to 04101B, sidebar 09131B, raised pill 101921, search field 0C151C, rail 071119, lime D3EA2C, olive category chip 232B16, inactive pill 111B23). Every photo on the site is cropped directly out of the boards — the hero athlete with the TRY IT / LOVE IT / KEEP IT IN PLAY graffiti, all four featured products, all eight Windrunner colorways, the four try-on athlete avatars, the community strip, the seller and profile avatars, and the product gallery with its thumbnail row. Where a crop carried a baked-in UI element that would double with the live one (hearts, card titles), ffmpeg's delogo filter erased it from the photo.

The three desktop screens are replicated as one interactive app: Home (sidebar with the exact nine menu items and the Alex Mercer card, search, category tabs with the olive All pill, hero with Shop Now, the SEE IT ON YOU rail with athlete picker, height and size dropdowns, fit pills, and the lime See it on me button, four featured picks with exact names and prices, the four-feature strip), Discover (Results for "nike windrunner", 42 items, sort, six filter pills, Clear all, eight colorway cards with exact prices, the GamePoint featured-seller card), and Product (breadcrumb, gallery with thumbnails, Vintage chip, stacked price with 46 percent OFF, the four detail rows, Wear Details, CourtVision seller, lime Add to Bag). Mobile matches the phone boards: wordmark plus bag header, full-width search, scrollable tabs, stacked hero, two-by-two product grid with the bigger board crops, and the five-item bottom tab bar.

It all works: the sidebar and tab bar route between views (with the board-correct active states — the product page lights Home, as in the boards), search routes to Discover on Enter, hearts toggle lime with a pop, athletes and fit pills select, Add to Bag counts up the bag badge, and See it on me confirms the chosen look. Verification was done against the boards before showing the user: four diff passes at the boards' own 1672x941 resolution, fixing layout (the featured row is four fixed-width cards, left-aligned, running under the rail), the double-heart artifacts, the price stack, and the mobile order.

Old skin preserved in v5-backup/. The recall-checker engine files (match.js, data, tests) remain intact on disk for the product's next step.

## What changed in v5 (the reference-board pass)

The user supplied four reference boards (a "SECOND LOOK" secondhand-sports-marketplace concept and two boards of our own brand mocked in dark-glass + acid lime) and asked for an exact match plus a try-on. What shipped:

The accent became acid lime (#CDF14B, dark-olive text #161A08 on it, ~13:1) — used only for actions and highlights ("BUY IT." in the headline, CHECK YOUR FINDS, the corner pill, active nav states, the try-on's selected pills). Recall red remains reserved for recall meaning; the two never trade jobs.

The hero is now the board: dusk basketball-court video (generated on the 4090 — empty court, chain-link, palm silhouettes, warm streetlights; 194KB loop over a matching Pexels poster), headline left with the lime "BUY IT.", a BY THE NUMBERS glass panel right (885 RECALLS / 1.09 MB DATA SIZE / LAST UPDATED / 100% PRIVATE, stacked big-number format), a WHAT WE CHECK row of seven category chips, and the segmented section nav docked at the hero's bottom edge with a lime active pill that follows your scroll.

Verdicts became YOUR RESULTS cards, exactly like the boards' mobile screens: a deep-red (or amber, or neutral) card opening with YOUR RESULTS + a START OVER pill, a "YOU PASTED:" inset quoting your listing, "CHECKED ON:" date, then the tier badge, the contract headline, and HAZARD / RECALLED / UNITS / REMEDY as label rows, closing with a white SEE OFFICIAL NOTICE pill.

SEE IT ON YOU — the try-on. Every product card carries a "Try on" button. It loads that product's real CPSC photo into a canvas over a stage: the built-in athlete photo, or — the real answer to "how can they try it on" — the visitor's own photo, loaded with a file picker straight into the canvas and never uploaded anywhere (it's the same privacy story as the checker). Fit pills (Fitted/Regular/Relaxed), a size slider, and drag-to-place. Every render is stamped RECALLED with the CPSC file number and "SIMULATION — NOT A SALE," because the one thing this try-on proves is that you shouldn't buy the thing. Save-the-look downloads the card when the browser allows it (CPSC's image host blocks canvas export, so the button honestly falls back to "Screenshot to save").

Smooth scrolling: a vendored 76-line Lenis-style lerp scroller (wheel input eased toward a target on requestAnimationFrame, native scroll position stays authoritative so anchors, the scroll-spy, and reveals keep working). Off for touch devices and reduced-motion users.

The method section became the boards' four steps: You paste / We match locally / You get an answer / You buy safe.

---

## What it is

SecondHand Safe is a website where you paste a used-gear listing — a Facebook Marketplace title, a garage-sale find, a hand-me-down — and it tells you whether that gear matches a U.S. government safety recall. It covers sports and recreation equipment: helmets, bikes, scooters, trampolines, treadmills, dumbbells, climbing gear, water gear, winter gear.

It exists because families buy used sports gear constantly, some of that gear was recalled for safety defects (cracked helmet shells, failing harness buckles, dislodging weight plates), and there is no moment in a secondhand purchase where anyone finds out. The government publishes every recall; its own search is built for lawyers, not for a parent holding a used helmet.

Built for PeddieHacks (tracks: Sports and Health — this project claims both: used sports gear is the Sports story, injury prevention is the Health story).

## Who it helps

A parent about to buy a $15 used bike helmet finds out it was recalled for failing impact tests — before their kid wears it. That is the whole pitch. One paste, one answer, no account, nothing uploaded.

## How the check works

The entire recall database ships with the page as one bundled data file. When you paste a listing, the matching runs in your browser. Nothing you type leaves your device. There is no server.

The matcher gives one of three answers, and the wording of each is a hard rule of the project:

MATCHES A RECALL (red). Only shown when an exact identifier matched — a real model number (like KY-055 or T30) or a barcode number. A brand-and-type lookalike can never produce red. The card says "Matches recall: [name] — verify the model number," shows the hazard in plain words, the recall date, units affected, the remedy, and links the official government notice.

POSSIBLE MATCH (amber). The listing strongly resembles a recalled product but no exact identifier was present. The card tells you to check the model number against the notice.

NO RECALL FOUND (gray). Says exactly this: "No recall found for this description. Only sports and recreation recalls are checked, using data as of [date]. That does not mean the product is problem-free; check the model number and never buy a helmet that has been in a crash."

Forbidden phrases, enforced by tests and audits: the site never says "is safe," "safe to buy," or "not recalled." A false "it's fine" is the one way this tool could hurt someone, so the wording never grants safety — it only reports what was found.

Matching details, for the curious: listing text is normalized (lowercase, plurals unified, abbreviations expanded — "bikes," "bicycle," and "bike" all match each other). Words are scored by how rare they are in the recall database, so "Gudook" counts for much more than "helmet." A candidate only clears the floor if the listing actually covers that product's name — sharing a brand ("Petzl headlamp" vs. a Petzl harness recall) or a category ("mountain bike" vs. a generic mountain-bike recall) is not enough. Numbers that look like sizes, ages, weights, rope lengths ("60m"), or battery types ("CR2032") are never treated as model numbers, because a bare number must never trigger the red tier. The test suite includes adversarial cases that try to force a false red; all of them stay non-red.

## The data

Source: the U.S. Consumer Product Safety Commission (CPSC) public recall database at saferproducts.gov. The API is free and needs no key.

A build-time script sweeps the API with about fifty gear-related search terms, merges results, requires every record to contain a real gear word (a fuzzy search once returned a cast-iron skillet; scope is a safety property because the gray card promises "only sports and recreation recalls are checked"), drops non-gear lookalikes (a movie-souvenir "popcorn helmet container" once leaked through), strips phone numbers and spec-numbers out of the model fields, and writes one JSON file.

Current data: 885 recalls, 1.09 MB, built 2026-08-14. Each record: product name, brand tokens, model tokens, hazard in one sentence, remedy, units, recall date, official notice URL, product photo URL, barcode numbers where the government published them.

The newest record in the file was recalled the day before this was built (Ritchey carbon bicycle forks, 2026-08-13). Rebuilding is one command and takes about two minutes.

## What is on the page (current design, v4)

The design copies the structure of seve.app/pr (a fashion-PR software site the user chose as the reference) and adapts it to recall data. White editorial base. Wide-stretched uppercase headlines. Photography carries the mood; frosted dark glass panels carry the app.

Hero. A full-screen black-and-white photograph (cyclist in fog), the headline CHECK IT BEFORE YOU BUY IT centered in wide caps, two frosted glass pill buttons top right, and a fixed black pill bottom-right that scrolls to the checker. A generated video loop for this spot is in progress (see Videos below).

Lookbook strip. Edge-to-edge row of six recalled products presented like fashion "looks," each with a small red RECALLED pill — the direct translation of seve's samples strip with OUT pills. A floating glass segmented nav (Check / The Rack / Dossier / Method) sits over the strip's top edge.

Check your finds. White editorial headline and copy, then a rounded photo card (sunset city rider) with the glass CHECK A LISTING panel: the input, a Check pill, three real example listings as chips, and the verdict card rendering inside the panel. The three chips are real recalls with model numbers, so the red tier is demonstrable on stage.

Know the registry. A second photo card (dark athlete portrait) with the REGISTRY OVERVIEW glass panel — the direct translation of seve's ANALYTICS OVERVIEW screenshot, except every number is computed live from the bundled data: 885 recalls on file, how many were added this year, top three categories as white pills with counts, the three most recent recalls as pill-shaped links, and a Share button (native share sheet, or copies the link).

Still out there. The Recall Dossier: one featured recall presented as a case file — FILE number, product name, then HAZARD / RECALLED / UNITS / REMEDY / RESALE as label-and-value rows in glass, with the CPSC evidence photo in a white inset card. This is the site's translation of seve's "try it on" panel. The resale row notes that selling a recalled product is prohibited under U.S. federal law.

The Recall Rack. The full catalog: filter pills (All, Helmets, Bikes and wheels, Fitness, Water, Winter and climb), then white product cards — numbered, with the product photo, a red RECALLED pill, the hazard in two lines, units, and the official notice link. Twelve at a time with Show more.

Honest by design. Three numbered rows: real government data; a careful match, not a guess; private by default. Then one quiet line about helmets: no recall check replaces checking the model number yourself, and never buy a helmet that has been in a crash.

Footer. A giant ghost wordmark and two small-print columns: data source and credits; and the disclaimer — this is an advisory tool, not a safety certification; "no recall found" means exactly that and nothing more.

## The design system, in full detail

Everything below is the actual shipped value, not an approximation. The reference is seve.app/pr; where seve's values were measurable from their live site, ours either match or state why they differ.

### Typography

One family, used at two widths — this is the core typographic trick. Seve uses Field Gothic, a licensed wide-gothic; we use Archivo, a free Google variable font that has a width axis running from 62 to 125 percent. Loaded once as: Archivo, italic and roman, width 62–125, weight 100–900.

The display voice: Archivo stretched to 125 percent width (the "wide" voice). Used for the hero headline, section headings, panel titles, the wordmark, card names, and the footer ghost wordmark. Always uppercase. Letter-spacing +0.015em (wide type wants slightly open tracking, never negative). Weights are deliberately non-standard numbers to sit between the named weights: 580 for headlines and panel titles, 560 for general wide text, 620–640 for the wordmarks.

The label voice: Archivo at 112 percent width, sizes 9 to 12 pixels, weight 600–700, uppercase, letter-spacing 0.05em to 0.12em (smaller text gets wider tracking). This is the voice of every pill, chip, filter, label row, and fine-print line — the "app UI" voice that makes the glass panels read as software.

The body voice: Archivo at normal width, 13 to 16 pixels, weight 400, line-height 1.55, sentence case. Used for editorial copy, hazard text, and card descriptions.

The stat voice: the registry panel's big numerals are the wide voice at weight 300 (light), sizes clamping between 38 and 56 pixels — big, light, technical, exactly the ANALYTICS OVERVIEW screenshot's numeral treatment.

Key sizes: hero headline clamps from 30px on phones to 64px on desktop (clamp(30px, 4.6vw, 64px), line-height 1.12). Section headings clamp 26–48px (line-height 1.1). Panel titles 20–28px. Card names 15px/600. Body 16px. Hazard text on cards 13px. Fine print 9–11px.

### Color

The page has exactly two worlds and one accent.

The white world (the editorial base): background pure #FFFFFF; primary ink #111111; secondary ink #4E4E4E (7.7:1 contrast on white); tertiary ink #6B6B6B (5.0:1, used only at 10–11px uppercase where it still passes); hairlines are #111111 at 12 percent opacity.

The glass world (over photographs): panel text #FFFFFF; secondary on glass #D6D4CF (a warm off-white, not gray — gray on glass goes muddy); labels on glass #B3B1AB. The LIVE chip is #A8F0A8 (soft signal green) with a 45-percent-opacity border of itself.

The accent: recall red, and it appears nowhere except recall meaning. #B42318 as the fill for badges and RECALLED pills (white text on it is 6:1); #FF5A4E as red text on dark surfaces (6:1 on the near-black); amber tier badge fill #7A5600 (white text 6.6:1). No other hue exists on the site — no brand blue, no gradient. The photography supplies all other color.

### The liquid glass recipe

Measured from seve's computed styles and adjusted only for contrast law. Panels: background rgba(12,12,14, 0.55) — seve runs 0.2, but 0.2 fails WCAG over a bright photo area, so ours is darker; backdrop-filter blur(20px) saturate(160%); border 1px rgba(255,255,255, 0.22); border-radius 24px; shadow 0 16px 48px rgba(0,0,0, 0.3) plus a 1px inner top highlight rgba(255,255,255, 0.14) that gives the top edge its glass gleam. The hero checker panel runs even darker (rgba(16,16,18, 0.74)) because the fog photo behind it is bright.

Pills (buttons): fully rounded at 50px radius, padding 12px by 22px, label-voice type at 12px/600. Variants: solid white (white bg, #111 text — flips to recall red on hover), glass (rgba(12,12,14, 0.35) plus the same 20px blur and 1px light border), outline (transparent with 1px ink border, fills to ink on hover), and the fixed corner pill (solid #111, bottom-right 20px, the seve BOOK A DEMO move). Hovers translate up 1px — nothing bounces.

Chips and inputs: 13px radius (seve's third radius). The textarea is rgba(255,255,255, 0.1) with the glass border; example chips are the same fill at 50px radius.

Browsers without backdrop-filter get solid rgba(12,12,14, 0.9) panels — same hierarchy, no glass.

### Photography and video treatment

Three photographs, all self-hosted, all chosen for dark negative space where panels sit: the hero (black-and-white cyclist in fog), the checker card (sunset city rider — the warm one, seve's Paris-street equivalent), the registry card (near-black athlete portrait — the ANALYTICS OVERVIEW equivalent). Product imagery (strip, rack, dossier) sits on warm paper #FAF9F5 with multiply blending, so the government's white-background photos read as intentional catalog plates.

Every photo gets a shade layer before a panel touches it: the hero uses a radial darkening centered behind the headline (52 percent black at center) over a vertical gradient (50 percent top, 28 percent middle, 50 percent bottom); photo cards use a simple top-to-bottom 12-to-50-percent darkening. This is what guarantees white text stays legal over any crop.

The two generated videos (LTX-Video on the local RTX 4090, 832x480, 24fps, about 4 seconds each, 449KB and 112KB) sit exactly over their poster photographs with object-fit cover: a monochrome fog-road drift behind the hero, a teal light-beam smoke drift behind the registry panel. Reduced-motion users and any load failure get the still photograph — the videos are a layer, never a dependency.

A film-grain overlay sits over the whole page: an inline SVG fractal-noise tile at 4 percent opacity, fixed, non-interactive. It is the difference between "web page" and "printed campaign."

### Layout and spacing

The page rhythm is seve's: full-bleed hero, then white editorial blocks (centered headline plus one short paragraph, 64–120px top padding), each followed by a rounded photo card. Photo cards inset from the viewport edge by 12–36px (viewport-scaled), radius 24px, minimum height 86 percent of the viewport up to 780px, and their panel sits bottom-left (checker) or right (registry, margin-left auto) with 20–48px of margin.

Horizontal page padding runs clamp(20px, 4vw, 64px). Panels cap at 560–640px wide. The rack grid caps at 1240px, three columns, 18px gaps. The lookbook strip is a six-across grid of 3:4 cards with hairline separators on near-black #0E0E10; the segmented nav floats over its top edge, centered, at 50px radius with 6px internal padding — active item is a solid white pill with #111 text.

Breakpoints: under 1024px the rack drops to two columns, the strip to three cards, the dossier stacks; under 640px everything is single-column, the strip shows two cards, the checker stacks vertically, and the corner pill tucks to 12px.

### Motion

Two easing curves total: cubic-bezier(0.16, 1, 0.3, 1) (a long decelerate) for reveals and hovers; linear only inside the scroll-driven reveal timeline. Scroll reveals rise 30px and fade over the element's entry into the viewport (native CSS animation-timeline where supported, IntersectionObserver fallback elsewhere, nothing hidden if JavaScript fails). The hero image drifts from scale 1.06 to 1 over 40 seconds, once. Videos loop. Every one of these is inside a prefers-reduced-motion guard; a reduced-motion visitor gets a fully static page with the same information.

### The details that make it read as designed

The dt labels in every glass panel end with " :" — the seve label punctuation. The state chip says LIVE in signal green. Strip and rack products carry small red RECALLED pills exactly where seve's samples carry OUT pills. Rack cards are numbered (№ 001) in the label voice. The share button is a white pill inside a glass panel. Selection color is recall red. The footer wordmark is the display voice at up to 160px, 5 percent black, unselectable — furniture, not content.

## Design history (how it got here)

Version 1 was Apple-styled: black, Liquid Glass cards, pill buttons, SF-style type. The user rejected it: not the vibe.

Version 2 was awwwards fashion-editorial: ivory paper, giant staggered Archivo Black caps, ink hairlines, a black data ticker, mono labels. The user rejected it too: still not it.

Version 3 was the first seve-inspired pass: dark cinematic base, one photo hero, glass panels with label rows. Closer — the user then said to actually study seve.app/pr itself.

Version 4 (current) copies seve's real structure, measured from their live site: white editorial base between full-bleed rounded photo cards, glass recipe lifted from their computed styles (dark translucent panels at 24px radius, pills at 50px, chips at 13px, all with 20px blur), and their wide-gothic typography voice approximated with Archivo's variable width axis stretched to 125%. Their licensed font (Field Gothic) is not free; Archivo Expanded is the closest legitimate stand-in.

Design decisions that survived every version: the verdict wording contract, the red-requires-an-identifier rule, all data bundled with no runtime API calls, film grain, and the principle that every element on the page must carry real information — the pills, numbers, dates, and labels are all live data, never decoration.

## Videos

The user's machine has an RTX 4090 running ComfyUI with LTX-Video, a local text-to-video model — free and unlimited. Two clips are being generated for the site (seve's hero is runway video, so ours gets motion too):

One: a black-and-white fog-road loop for the hero, matching the hero photograph's world, so the page opens on slow drifting mist instead of a still.

Two: a dark studio atmosphere with thin light beams in slow smoke, to sit behind the REGISTRY OVERVIEW panel.

Both ship as small mp4 loops (449KB and 112KB — each took the 4090 about 20 seconds to generate) with the photographs as posters and as the fallback for anyone with reduced motion enabled. Status: wired in and live.

## Accessibility and honesty engineering

Documented because it is unusual for a hackathon build to have this and it is worth pitching:

Verdicts are announced to screen readers (the verdict area is a polite live region) and never rely on color alone — every tier has a text badge. Filter pills expose pressed state. The example-listing chips, filters, and share are real buttons. There is a skip link. Focus outlines are visible on both the white base and the dark glass. All motion — the hero drift, scroll reveals, smooth scrolling — is disabled for users with reduced motion set. Long pastes scroll instead of clipping. If the data file ever fails to load, the page says so and disables the checker instead of silently doing nothing.

Contrast pairs were computed, not eyeballed, for the white base, the glass-over-photo panels, and the verdict tiers. The glass panels run darker than seve's originals specifically to keep label text readable over any photo crop.

Legal accuracy was checked: the resale claim cites the actual law (selling recalled products is prohibited under the Consumer Product Safety Act, 15 U.S.C. 2068), and the site's own novelty claims were softened to what can be defended.

## Technical facts

Vanilla HTML, CSS, and JavaScript. No framework, no build step. One ES module for the page, one for the matcher. Google Fonts (Archivo variable, width axis). All images self-hosted or from the CPSC's own site; the two section photographs are from Pexels (free license, self-hosted copies).

The matcher has a test suite: 44 checks covering 20 real listing-to-recall pairs, 20 non-matches including same-brand and same-category traps, and adversarial red-tier attacks. Run with one command. All passing.

Everything was audited in rounds during the build: code review (escaping, URL guards, failure paths), accessibility (WCAG), and production readiness (performance, semantics). Final verdicts: ship it, no blockers.

Local preview runs at port 3488. The data rebuild script and the test suite are one command each.

## What is left

Deploy to a public URL (GitHub Pages or Netlify; the host must gzip the data file — it compresses from 1.09 MB to roughly 200 KB on the wire). Add the final page address to the sharing metadata after deploy.

Wire in the two generated videos once encoding finishes.

The user's pre-judging assignment: screenshot one genuinely recalled item currently listed on a real marketplace (opening slide of the pitch), and confirm in the PeddieHacks Discord whether one project can enter both tracks.

Swap the test suite's synthetic listing titles for verbatim real marketplace titles during that screenshot hunt.

## The pitch, in one paragraph

The government publishes every dangerous product it recalls. Nobody reads it. We shipped the entire registry inside a webpage that looks like a fashion storefront, so checking a used helmet takes one paste and zero uploads — and the store's twist is that nothing on its shelves is for sale, because every product on them was recalled. The data is real, the matching is honest about its certainty, and the demo works with the wifi off.
