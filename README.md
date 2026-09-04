# Huntdle

A LoLdle-style daily guessing game for **Hunt: Showdown 1896**, built on real data, art
and icons pulled from the [official wiki](https://huntshowdown.wiki.gg).

Six games, each with a daily puzzle and an endless practice mode, each keeping its own
progress and streak:

| Game | What you get | Pool |
| --- | --- | --- |
| **Weapon** | Attribute grid: class, ammo, action, slots, magazine, damage, cost | 157 |
| **Trait** | Attribute grid: cost, rank, category, type | 58 |
| **Hunter quote** | Lore blurb with the hunter's own name blacked out | 195 |
| **Hunter art** | Blurred greyscale portrait | 192 |
| **Trait icon** | Blurred greyscale trait banner | 58 |
| **Bestiary** | Blurred greyscale monster or boss art | 16 |

`GridGame` backs the attribute boards and `RevealGame` the blur rounds, both
parameterised by pool, columns and accessors, so a seventh game is mostly a dataset plus
a config block in `App.tsx`.

## Running it

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # tsc -b && vite build, static bundle in dist/
```

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes to
GitHub Pages. `base: './'` keeps asset paths relative, so the site works from a project
sub-path without configuration.

## How it works

**Grading is strict.** Green is an exact match, red is wrong, nothing in between — `Long`
against an answer of `Special Long` is simply wrong, as is a number that is merely close.
Numeric columns show a direction arrow, which is not a grade. Guesses are unlimited.

**Daily** walks a per-cycle reshuffled deck, so every subject is used once before any
repeats, and rolls over at local midnight. Each game is salted separately so the six
dailies don't move in lockstep. Progress and streaks live in `localStorage`, keyed per
game.

**Endless** tracks what it has served and draws only from what's left, then starts a
fresh cycle when the pool empties — still refusing to return the subject just played,
since that boundary is where a repeat would otherwise slip through.

**Layout.** The board needs 1140px plus padding to work as a table, so below 1180px each
guess becomes a card instead: subject on top, attributes packed underneath, no horizontal
scrolling at any width. Cards have no header row, so each cell names its own column via
`data-label`. Phone-sized type is a separate breakpoint at 640px, so tablets don't get
phone labels.

### Not giving the answer away

Three things leak an answer in a blur round:

- **The element.** The art is drawn into a `<canvas>` with the blur baked into the pixels
  (`ObscuredArt`), not an `<img>` with a CSS filter. An `<img>` can be opened in a new
  tab, saved, or un-blurred by deleting one property in devtools.
- **The file name.** `krampus.png` in a network log answers the question by itself, so
  art used in a guessing round is named by a hash of its id (`obfuscate()` in
  `scripts/wiki.mjs`) — stable across scrapes, so re-running doesn't churn every file.
- **Switching mode mid-round.** `answer` changes the instant `mode` does, but resetting
  the round in an effect happens a paint too late, so for one frame the new answer was
  drawn with the previous round's revealed state — showing the daily answer unblurred
  after giving up in Endless. `useRound` resets *during render* instead. Moving that
  reset into a `useEffect` reintroduces the leak.

The source file is still fetched and can be found in the network panel. Closing that
would mean generating pre-blurred assets and serving full-resolution art only after a
solve.

Weapon icons are deliberately not obfuscated: that round never shows the answer's art
before it's solved.

## The datasets

The scrapers have **no npm scripts on purpose**. They hit the wiki and overwrite
everything under `public/`, including art replaced by hand, so running one should be
deliberate rather than convenient:

```bash
node scripts/scrape-wiki.mjs      # weapons  -> src/data/weapons.raw.json + public/weapons/
node scripts/build-dataset.mjs    # weapons.raw.json -> weapons.json (local, no network)
node scripts/scrape-hunters.mjs   # hunters  -> src/data/hunters.json   + public/hunters/
node scripts/scrape-extras.mjs    # traits + bestiary -> src/data/, public/traits/, public/bestiary/
```

`build-dataset.mjs` is the safe one: it only re-reads the existing scrape and rewrites
`weapons.json`, so it's what to run after editing `SCARCE_SELL_PRICE` or the class and
action tables. The other three download. Shared MediaWiki plumbing is in
`scripts/wiki.mjs`.

**Check `git status` after any scrape.** Several creature images in `public/bestiary/`
were replaced by hand because the wiki's own art was poor, and a re-scrape reverts them
to whatever `pickArt()` picks. Restore with `git checkout -- public/bestiary/`.

### Weapons — 157

All 56 base weapons plus their 94 variants (*Sparks Sniper*, *Romero 77 Hatchet*,
*LeMat Carbine*), the four melee tools, the two derringers, and the Maxim M1895. Those
last seven live outside `Category:Weapons` — the game files them as Tools and World
Items — so each entry carries a `source` of `Weapon`, `Tool` or `World`, and the ones
taking no weapon-capacity slot show a dash for Slots.

- **The infobox match uses a lookahead, not a prefix test.** Pages also carry
  `{{Infobox Weapon Skin}}` boxes for legendary skins, and "starts with
  `{{Infobox Weapon`" matches those too — which on a tool page silently returns skin
  data.
- **Names come from the page path, not the infobox `Title`.** Page titles are unique, and
  a freshly drafted page can carry a copy-pasted title (`Weapons/Burgess/Trauma` is
  titled "Burgess Bayonet" on the wiki right now), which would collide with another
  weapon's id. The scraper warns when the two disagree; the build fails on a duplicate.
- **Class and action type are the only hand-tabulated fields**, since the wiki defines
  them in prose rather than the infobox. They're cross-checked at build time against each
  weapon's own description, and the build warns if table and prose disagree. Variants
  inherit both from their base; `VARIANT_CLASS` and `VARIANT_ACTION` hold the exceptions.
  The cross-check caught two of the three semi-automatic conversions on its own.

### Hunters — 195

One entry per wiki page. The wiki draws the line between "a different hunter" and "a
different look", and the scraper follows it: `Hunters/Scourge: Midian` and
`Hunters/Scourge: Morrigan` are separate pages and stay separate hunters, while
`Hunters/Oliver Whitman` is one page using `{{Infobox Hunter Variant}}` packing several
forms into it (Rookie/Survivor/Veteran, or Dorothy Alice's Dream/Nightmare). Those are
alternate looks for one hunter, so the page collapses to its first form. 32 pages do.

Every quote is distinct — no duplicates, no near-duplicates, most similar pair shares 14%
of its words — so the quote round is never ambiguous. It redacts the answer's own name
from the blurb, because Dorothy Alice's opens "Dorothy's upbringing was idyllic". See
`redact()` in `src/lib/hunters.ts`.

Three hunters have no portrait, because the file their page references was never
uploaded: **Lynch** and **The Dark Friar** (only a `Wallpaper` image) and
**Hell's Profiteer** (nothing at all). They play in the quote round, not the art round.

### Traits — 58 playable of 85 pages

**Ten traits have been removed from the game** and are excluded. The wiki keeps their
pages in `Category:Traits` with nothing on the infobox to say so — the only signal is an
update history line ("Tomahawk removed from the game") plus blank Cost and Unlock.
Blankness alone is not a safe filter: the event and pact traits are blank too and are
very much still in the game, so the scraper matches the history text instead.

**Seventeen Event traits are also excluded.** They cost nothing and unlock at no rank,
so they collapse onto a few `0/0` combinations — which is exactly where the attribute grid
stops separating anything. Removing them takes the share of traits sharing a full
combination from 38% down to 28%. It also settles the only two art collisions on the wiki,
since both offenders were Event traits: the *Blazeborne* infobox points at *Fire Eater's*
own files, so those two were byte-identical in icon and banner, and `Trait Instinct
Big.png` is a second upload of *Berserker's* artwork. The scraper skips their downloads,
so `prune` clears the files. A trait can carry several types at once, so `Burn / Event`
counts as an Event trait.

The pact traits that remain can't be bought either, so the wiki records no cost for them.
They're stored as **0** rather than unknown, keeping every trait on one scale so every
guess gets an arrow.

Cost, Rank, Category and Type still **cannot** identify a trait uniquely: 16 of 58 share
their whole combination with another, because 8 have neither a cost nor a rank and
collapse at `0/0` — the largest tie is four. Rank is what makes it bearable; without it
the figure is 72%. When an all-green guess isn't the answer, the board says "Close but not
quite" rather than looking broken.

Each trait carries two images doing different jobs: the infobox's crisp 64px `Small` icon
for lists and guess rows, and the page body's 512px `Big` banner for the blur round —
shrinking the banner into a thumbnail reads as mush. Type combinations are written
inconsistently ("Burn,Scarce", "Scarce, Event") and are canonicalised to a sorted
slash-joined string, giving 7 distinct values across the wiki and 4 in play.

### Bestiary — 16

10 monsters and 6 bosses. These pages carry **no infobox at all** — just prose and file
links — so name, art and the opening paragraph are all there is, which is why the
bestiary is a blur round with no attribute grid.

`pickArt()` chooses by preference rather than taking the page's first image, which is
usually an atmospheric scene rather than the creature: the in-game plate
`Lore <Name> Mastery.png` first, then a model render, then the bare `<Name>.jpg`, then a
wide `Mastery.jpg`, then any file naming the creature. Several images have since been
replaced by hand; because those vary in aspect ratio (~0.66 for plates, ~1.0 for
renders), the round fits art inside its frame rather than cropping, via `fit="contain"`.

### Known gaps

- **Scarce weapons have no price on the wiki.** They're claimed with Pledge Marks, so the
  infobox carries no Hunt Dollar value. Their in-game *sell* values are recorded by hand
  in `SCARCE_SELL_PRICE` — Flame Rifle 250, Shredder 200, Wildland 175, Homestead 78 150
  — and the build warns if a new Scarce weapon appears without one. These are the only
  numbers here not from the wiki.
- **The wiki runs ahead of the live game.** `UNRELEASED` in `build-dataset.mjs` holds
  announced-but-unshipped weapons out of play; it is currently empty, with the Burgess
  family included ahead of Update 2.9 by request. Until the wiki uploads their art those
  three show a "no icon yet" placeholder. The dataset also carries 2.9's balance changes
  ahead of the patch.

## Licence

Three different things live here and they can't share one licence.

| What | Licence |
| --- | --- |
| **Code** — `src/`, `scripts/`, config | MIT, see [`LICENSE`](LICENSE) |
| **Data** — `src/data/*.json` | CC BY-SA 4.0, adapted from the wiki |
| **Images** — `public/**`, `src/assets/` | Crytek's, not ours or the wiki's to license |

The share-alike on the wiki text does not reach the code: the app isn't a derivative of
that prose, it just reads a file. The datasets do embed wiki text verbatim — weapon and
trait descriptions, hunter lore captions, creature blurbs — so they inherit the
[wiki's licence](https://creativecommons.org/licenses/by-sa/4.0/) and keep its
attribution and share-alike.

The game art is Crytek's, and no licence choice here changes that: the wiki hosts it but
cannot relicense someone else's intellectual property. It's used on the usual fan-project
footing — unofficial and non-commercial.

The page backdrop (`src/assets/site-background.jpg`) is the wiki's own
[Site-background.jpg](https://huntshowdown.wiki.gg/wiki/File:Site-background.jpg).
Hunt: Showdown is a trademark of Crytek. This is an unofficial fan project with no
affiliation to Crytek.
