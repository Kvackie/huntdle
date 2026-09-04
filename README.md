# Huntdle

A LoLdle-style daily guessing game for **Hunt: Showdown 1896**, built on real weapon
data and icons pulled from the [official wiki](https://huntshowdown.wiki.gg).

Six games, each with a daily puzzle and an endless practice mode, and each keeping its
own progress and streak:

| Game | What you get | Pool |
| --- | --- | --- |
| **Weapon** | Graded attribute grid: class, ammo, action, slots, magazine, damage, cost | 157 |
| **Trait** | Graded attribute grid: cost, category, type | 85 |
| **Hunter quote** | Lore blurb with the hunter's own name blacked out | 195 |
| **Hunter art** | Blurred greyscale portrait | 192 |
| **Trait icon** | Blurred greyscale trait banner | 85 |
| **Bestiary** | Blurred greyscale monster or boss art | 16 |

The three blur rounds start at a heavy blur in greyscale; each wrong guess clears a step
and the eighth clears it entirely. Colour returns only on reveal.

### Not giving the answer away

Two things leak an answer in a blur round, and both are handled:

- **The element.** The art is drawn into a `<canvas>` with the blur baked into the pixels
  (`ObscuredArt`), not shipped as an `<img>` with a CSS filter. An `<img>` can be opened
  in a new tab, saved, or un-blurred by deleting one property in devtools; a canvas has
  no source to open and only ever receives blurred pixels.
- **The file name.** `krampus.png` in a network log answers the question by itself, so
  art used in a guessing round is named by a hash of its id (`obfuscate()` in
  `scripts/wiki.mjs`) — stable across scrapes, so re-running doesn't churn every file.
- **Switching mode mid-round.** `answer` changes the instant `mode` does, but resetting
  the round in an effect happens a paint too late — so for one frame the new answer was
  drawn with the previous round's revealed state, showing the daily answer unblurred
  after giving up in Endless. `useRound` resets *during render* instead. Keep it that
  way: moving that reset back into a `useEffect` reintroduces the leak.

This raises the bar rather than sealing it: the source file is still fetched and can be
found in the network panel. Closing that would mean generating pre-blurred assets and
only serving the full-resolution art after a solve.

Weapon icons are deliberately *not* obfuscated — that round never displays the answer's
art before it's solved, so there's nothing to leak.

Two generic components back all six: `GridGame` for the attribute boards and
`RevealGame` for the blur rounds, both parameterised by pool, columns and accessors, so
adding a seventh is a dataset plus a config block.

## Running it

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # static bundle in dist/
```

## How the game works

You have unlimited guesses. Every guess is graded column by column:

| Colour | Meaning |
| --- | --- |
| 🟩 green | exact match |
| 🟥 red | wrong |

Grading is strict — there is no partial credit. `Long` against an answer of
`Special Long` is simply wrong, as is a number that is merely close. Numeric columns
still show ▲ / ▼ pointing at the answer, which is a direction, not a grade.

The seven compared attributes are **Class**, **Ammo**, **Action**, **Slots**,
**Magazine**, **Damage** and **Cost**, defined in `COLUMNS` in `src/lib/game.ts`. For a
melee weapon, Damage is its light melee attack, and Ammo and Action both read `Melee`.

The dataset still carries `introduced` / `introducedLabel` (the update that added each
weapon), it just isn't compared — add a column back to `COLUMNS` to use it.

The daily answer walks a per-cycle reshuffled deck of the roster, so every weapon is
used once before any repeats. It rolls over at the player's local midnight. Progress
and streaks live in `localStorage`.

## The dataset

```bash
npm run data     # scrape the wiki, then rebuild src/data/weapons.json
npm run hunters  # scrape hunters into src/data/hunters.json + public/hunters/
npm run extras   # scrape traits + bestiary into src/data/{traits,bestiary}.json
```

### Traits and bestiary

**85 traits** from `Category:Traits`, via `{{Infobox Trait}}` — Cost (upgrade points),
Unlock (bloodline rank), Category and Type, plus the 512px banner art the page body uses
rather than the small infobox icon. 25 traits have no cost, being event or pact traits
you can't buy; those compare as unknown. Type combinations are written inconsistently on
the wiki ("Burn,Scarce", "Scarce, Event"), so they're canonicalised to a sorted
` / `-joined string — 7 distinct values.

Traits carry two images and they do different jobs: the infobox's crisp 64px `Small`
icon for lists and guess rows, and the page body's 512px `Big` banner for the blur round.
Shrinking the banner into a list thumbnail reads as mush, so both are downloaded.

**16 creatures** from `Category:Monsters` (10) and `Category:Targets` (6). These pages
carry *no infobox at all* — just prose and file links — so name, art and the opening
paragraph are all that can be had.

Art is chosen by preference rather than by taking the page's first image, which is
usually an atmospheric scene rather than the creature. `pickArt()` prefers, in order:
the in-game bestiary plate `Lore <Name> Mastery.png` (~368×560 of just the creature —
**12 of 16** have one), then a model render, then the bare `<Name>.jpg`, then a wide
`Mastery.jpg`, then any file naming the creature. Brute, Firebreather and Hellborn have
only wide art; Ursa Mortis has only teasers and wallpapers. Those four get centre-cropped
in the 2:3 frame, which still lands on the creature.

Only Cost/Category/Type are compared for traits; Unlock rank is in the data if a fourth
column is ever wanted. Event and pact traits can't be bought, so the wiki records no cost
for them — they're stored as **0** rather than as unknown. That keeps all 85 traits on
one scale, so every guess gets a ▲/▼; treating them as unknown gave no direction at all,
and on the ~29% of days one was the answer, no guess did. 34 of 85 traits are free.

### Hunters

**One entry per wiki page — 195 hunters.** The wiki draws the line between "a different
hunter" and "a different look" for us, and the scraper follows it:

- `Hunters/Scourge: Midian` and `Hunters/Scourge: Morrigan` are separate pages, so they
  stay separate hunters.
- `Hunters/Oliver Whitman` is one page using `{{Infobox Hunter Variant}}`, which packs
  several forms into it (Rookie/Survivor/Veteran, or Dorothy Alice's Dream/Nightmare) as
  `<Form>_title` / `<Form>_caption` keys plus an `images=` list. Those are alternate
  looks for one hunter, so the page collapses to its first form — that form's portrait
  and blurb, under the hunter's own name. 32 pages collapse this way.

Every quote is distinct: no duplicates, no near-duplicates, and the most similar pair in
the roster shares only 14% of its words, so the quote round is never ambiguous.

Three hunters have no portrait, because the file their page references was never
uploaded to the wiki: **Lynch**, **The Dark Friar** (both only have a `Wallpaper` image)
and **Hell's Profiteer** (no image at all). They play in the quote round and are
excluded from the portrait round.

The quote round redacts the answer's own name from its blurb — Dorothy Alice's opens
"Dorothy's upbringing was idyllic", which would give it away outright. See `redact()` in
`src/lib/hunters.ts`.

The roster is **157 weapons**: all 56 base weapons plus their 94 variants (*Sparks
Sniper*, *Romero 77 Hatchet*, *LeMat Carbine*, …), the four melee tools (Knife, Heavy
Knife, Knuckle Knife, Dusters), the two derringers, and the Maxim M1895.

Those last seven live outside `Category:Weapons` — the game files them as Tools and
World Items — so each entry carries a `source` of `Weapon`, `Tool` or `World`. Tools and
world pickups take no weapon-capacity slot, so their Slots cell reads `—`.

- **`scripts/scrape-wiki.mjs`** pulls every page in `Category:Weapons` through the
  MediaWiki API — `Weapons/Sparks` and `Weapons/Sparks/Sniper` alike — plus
  `Category:Melee Tools` and the named extras in `EXTRA_PAGES` (the two derringers and
  the Maxim M1895). It parses each `{{Infobox Weapon}}`,
  `{{Infobox Tool}}` or `{{Infobox World Item}}` — they share field names — and
  downloads the icons into `public/weapons/`. Output: `src/data/weapons.raw.json`.

  The infobox match uses a lookahead rather than a prefix test, because pages also carry
  `{{Infobox Weapon Skin}}` boxes for legendary skins: a naive "starts with
  `{{Infobox Weapon`" test matches those, and on a tool page silently returns skin data.
- **`scripts/build-dataset.mjs`** turns that into `src/data/weapons.json` — the file the
  app imports.

Names come from the page path, not the infobox `Title`: page titles are unique, and a
freshly drafted page can carry a copy-pasted title (`Weapons/Burgess/Trauma` is titled
"Burgess Bayonet" on the wiki right now), which would collide with another weapon's id.
The scraper warns when the two disagree, and the build fails on a duplicate id.

Almost every field comes straight from the wiki infobox. Two do not: the wiki defines
weapon **class** and **action type** only in prose on its Weapons page, so those are
tabulated in `build-dataset.mjs` and cross-checked at build time against each weapon's
own description (the build warns if the table and the prose disagree).

Variants inherit class and action from their base weapon. `VARIANT_CLASS` and
`VARIANT_ACTION` list the exceptions — the Sparks Pistol cut down to a handgun, the
LeMat/Officer Carbines given stocks, and the three semi-automatic conversions
(Martini-Henry Ironside, Mosin-Nagant Avtomat, Vetterli 71 Cyclone). The cross-check
found the last two on its own.

### Known data gaps

**Scarce weapons have no price on the wiki.** They're claimed with Pledge Marks, so the
infobox carries no Hunt Dollar value at all. Their in-game *sell* values are recorded by
hand in `SCARCE_SELL_PRICE` in `build-dataset.mjs` — Flame Rifle 250, Shredder 200,
Wildland 175, Homestead 78 150 — and the build warns if a new Scarce weapon appears
without one. These are the only numbers in the project not sourced from the wiki.

### Weapons that are not live yet

The wiki documents announced weapons before they ship. `UNRELEASED` in
`build-dataset.mjs` holds those back so they can't be the answer or a guess. It is
currently empty — the Burgess family is included ahead of Update 2.9 (8 September 2026)
by request, and until the wiki uploads its art those three weapons render a "no icon
yet" placeholder instead of an image. The wiki also carries 2.9's balance changes
(Terminus damage, Hunting Bow range) ahead of the patch.

## Roadmap

The obvious next modes, in LoLdle's shape: **hunter**, **boss/monster**, **tool &
consumable**, plus icon-zoom and quote rounds. The grid and comparison engine are
attribute-driven, so a new mode is mostly a new dataset plus a new `COLUMNS` list.

## Licence

Three different things live in this repo and they can't share one licence.

| What | Licence |
| --- | --- |
| **Code** — `src/`, `scripts/`, config | MIT, see [`LICENSE`](LICENSE) |
| **Data** — `src/data/*.json` | CC BY-SA 4.0, adapted from the wiki |
| **Images** — `public/{weapons,hunters,traits,bestiary}/`, `src/assets/` | Crytek's, neither ours nor the wiki's to license |

**Code is MIT.** The share-alike on the wiki text does not reach it: the app isn't a
derivative of that prose, it just reads a file.

**Data is CC BY-SA 4.0.** The datasets embed wiki text verbatim — weapon and trait
descriptions, hunter lore captions, creature blurbs — so they inherit the
[wiki's licence](https://creativecommons.org/licenses/by-sa/4.0/) and must keep the
attribution and share-alike. The raw numbers (damage, slots, cost) are facts and aren't
copyrightable on their own, but they sit in the same files as the prose. Values are
reshaped rather than copied wholesale: see `scripts/build-dataset.mjs` for the
normalisation, and `SCARCE_SELL_PRICE` for the four figures that aren't from the wiki.

**Images are Crytek's.** This is the part no licence choice fixes. The wiki hosts the
game art but cannot relicense someone else's intellectual property, so CC BY-SA doesn't
apply to it and neither does MIT. They're included here on the same footing as any fan
project: unofficial, non-commercial, and dependent on Crytek's tolerance of fan works.
If you fork this and do anything commercial with it, that's the piece to think hard
about — strip the art and point at the wiki's URLs instead.

Before publishing, put your name in the `LICENSE` copyright line.

## Credits

Weapon data, descriptions and images come from the
[Hunt: Showdown 1896 Wiki](https://huntshowdown.wiki.gg) and are used under CC BY-SA.
The page backdrop (`src/assets/site-background.jpg`) is the wiki's own
[Site-background.jpg](https://huntshowdown.wiki.gg/wiki/File:Site-background.jpg). Hunt: Showdown is a trademark of Crytek. This is an unofficial fan project
with no affiliation to Crytek.
