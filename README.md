# Pkm Collector

A binder for a vintage Pokémon card collection — the spreadsheet replacement.
Every card in every WOTC-era set, with artwork, per-print-run tracking,
condition, and live market prices.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run build` produces a static `dist/` you can drop on any host (or open
from a phone on the same network — `npm run dev` already listens on your LAN).

On first launch the app downloads card data for all 17 vintage sets from the
[Pokémon TCG API](https://pokemontcg.io/) — names, artwork URLs, rarities and
current TCGplayer prices. That's cached in IndexedDB, so afterwards it opens
instantly and works offline.

## What it does

**Print variations are first-class.** Base Set 1st Edition, Shadowless and
Unlimited are three separate things to own, priced separately and with their
own completion bars. Same for 1st Edition vs Unlimited across Jungle through
Neo Destiny, and Reverse Holos in Legendary Collection and the e-Card sets.
Each variation carries a short note on how to identify it.

**Marking a card takes one click.** The ✓ in the corner of any card marks it
owned at your default condition (Settings). Open the card for the full detail
panel: condition, quantity, grading (PSA/BGS/CGC/SGC), what you paid, notes —
with every print run of that card editable on the same screen. `←` / `→` step
through the set, `Esc` closes, `/` jumps to search from anywhere.

**Prices come from the live feed.** Each variation resolves to its matching
TCGplayer bucket — 1st Edition prices off `1stEditionHolofoil`, Unlimited off
`unlimitedHolofoil`/`holofoil`. The set and collection views roll that up into
what you hold, what finishing costs, and what you're up against what you paid.

**Your data is yours.** The collection lives in this browser's localStorage.
Settings exports a JSON backup (re-importable) and a CSV that opens straight in
a spreadsheet.

## Importing your existing spreadsheet

Settings → **Import a spreadsheet**, or `#/import`. Export your sheet as CSV
first (File → Export / Download → CSV in Excel, Numbers or Google Sheets);
tab- and semicolon-separated files work too.

It handles the two shapes collection spreadsheets usually take, and guesses
which you have from your headers:

| Shape | Looks like |
| --- | --- |
| **A column names the print run** | `Set · Card # · Card Name · Variation · Condition · Qty · Price Paid` |
| **A column per print run** | `# · Card · 1st Edition · Shadowless · Unlimited`, each cell holding `X`, `NM`, `PSA 9`… |

Column names don't need to match anything — the mapping is guessed from your
headers and every field is a dropdown you can correct. It's forgiving about
how things are written:

- **Sets**: `Base Set`, `base1`, `BS`, `1999 Jungle`, `Base Set 1st Edition`
  (the print run is read out of the set name).
- **Numbers**: `4`, `004/102`, `H12`.
- **Print runs**: `1st Edition`, `First Ed.`, `1E`, `Shadowless`, `Unl`, `Reverse Holo`.
- **Conditions**: `NM`, `Near Mint`, `Excellent`, `LP`, `Played`, and grades
  like `PSA 10` or `BGS 9.5`, which become graded entries.
- **Owned flags**: `Yes`, `X`, `✓`, `1`, `have` — and `No`/`0` skips the row.
- **Prices**: `$9,500.50`.

Nothing is written until you press the button. The review step shows exactly
what will be imported, what's already in your collection, and every row that
couldn't be matched with the reason why — downloadable as a CSV so you can fix
the sheet and re-run. Rows never match silently: if the number and the name
disagree, the row imports under "worth checking" saying what it matched on.

On clashes you choose whether the collection or the spreadsheet wins, or
replace the collection outright. Export a backup from Settings first if you
pick replace.

## Honest notes on pricing

- **Shadowless has no separate price feed.** TCGplayer sells it as its own
  product, but the API doesn't expose it as its own bucket. Shadowless prices
  are shown as `~` against the Unlimited number, with a caveat in the card
  panel. Real Shadowless copies trade well above that.
- **A missing bucket shows `—`, not a guess.** If a card has no 1st Edition
  listing, the 1st Edition slot shows no price rather than borrowing the
  Unlimited one. "Cost to finish" says how many slots it had to skip.
- **Prices are the feed's, not a valuation.** Graded copies especially — a
  PSA 10 is a different market from the raw price shown here.
- Prices refresh automatically when the cache is over a day old, or on demand
  via "Refresh prices".

## API key

Optional. Without one the API allows ~1,000 requests/day, which is plenty since
everything is cached. A free key from [dev.pokemontcg.io](https://dev.pokemontcg.io/)
raises it to 20,000 — paste it in Settings, or set `VITE_POKEMONTCG_API_KEY`
in a `.env` file (see `.env.example`).

## Adding or changing sets

`src/data/vintageSets.ts` is the whole catalog. A set is one entry:

```ts
{ id: 'base5', name: 'Team Rocket', series: 'Base', year: 2000, total: 82,
  variants: [FIRST_EDITION, UNLIMITED] }
```

`id` is the pokemontcg.io set id (browse them at
`https://api.pokemontcg.io/v2/sets`). The shared variant definitions at the top
of that file control how each print run is labelled, identified and priced.

## Layout

```
src/
  data/vintageSets.ts   set catalog + print-variation definitions
  api/pokemonTcg.ts     API client, pagination, IndexedDB cache, TTLs
  store/collection.tsx  what you own — localStorage
  store/library.tsx     card data for every set — IndexedDB
  lib/csv.ts            CSV/TSV parsing
  lib/importer.ts       spreadsheet -> collection matching and planning
  lib/pricing.ts        variation -> price-bucket resolution
  lib/stats.ts          completion, value, spend rollups
  views/                Collection, Sets, Set detail, Search, Import, Settings
```
