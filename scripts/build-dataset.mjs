/**
 * Turns the raw wiki scrape into the dataset the game actually plays with.
 *
 *   node scripts/scrape-wiki.mjs && node scripts/build-dataset.mjs
 *
 * Most fields come straight from the wiki infobox. Two do not: the wiki has no
 * machine-readable "class" or "action type" per weapon (it only defines them in
 * prose on the Weapons page), so those are tabulated here and cross-checked
 * against each weapon's description at build time.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

/** Weapon class, mirroring how the wiki's Weapons page groups its galleries. */
const CLASS = {
  Rifle: [
    '1865 Carbine', '1890 Cavalry', 'Berthier 1892', 'Centennial', 'Drilling', 'Frontier 73C',
    'Infantry 73L', 'Krag', 'Lebel 1886', 'Mako 1895', 'Marathon', 'Martini-Henry',
    'Maynard Sniper', 'Mosin Obrez', 'Mosin-Nagant', 'Nitro Express', 'Ranger 73', 'Sparks',
    'Springfield 1866', 'Vandal 73C', 'Vetterli 71', 'Wildland',
  ],
  Pistol: [
    'Bornheim No. 3', 'Conversion', 'Derringer Pennyshot', 'Dolch 96', 'Haymaker', 'LeMat',
    'Nagant M1895', 'New Army', 'Officer', 'Pax', 'Quad Derringer', 'Scottfield', 'Uppercut',
  ],
  Shotgun: [
    'Auto-4 Shorty', 'Auto-5', 'Burgess', 'Homestead 78', 'Rival 78', 'Romero 77', 'Slate',
    'Specter 1882', 'Terminus',
  ],
  Melee: [
    // Bought as weapons…
    'Baseball Bat', 'Cavalry Saber', 'Combat Axe', 'Katana', 'Machete', 'Railroad Hammer',
    // …or carried as tools.
    'Dusters', 'Heavy Knife', 'Knife', 'Knuckle Knife',
  ],
  Special: [
    'Bomb Lance', 'Bomb Launcher', 'Chu Ko Nu', 'Crossbow', 'Flame Rifle', 'Hand Crossbow',
    'Hunting Bow', 'Maxim M1895', 'Shredder',
  ],
}

/** Action type, using the categories the wiki's "Action Type" section defines. */
const ACTION = {
  'Lever-Action': [
    '1865 Carbine', 'Centennial', 'Frontier 73C', 'Infantry 73L', 'Mako 1895', 'Ranger 73',
    'Terminus', 'Vandal 73C', 'Wildland',
  ],
  'Bolt-Action': [
    'Berthier 1892', 'Krag', 'Lebel 1886', 'Mosin Obrez', 'Mosin-Nagant', 'Vetterli 71',
  ],
  'Pump-Action': ['Burgess', 'Marathon', 'Slate', 'Specter 1882'],
  // Derringers break open to reload, like the other break-actions.
  'Break-Action': [
    'Derringer Pennyshot', 'Drilling', 'Homestead 78', 'Nitro Express', 'Quad Derringer',
    'Rival 78', 'Romero 77',
  ],
  Automatic: ['Maxim M1895'],
  'Single-Shot': [
    '1890 Cavalry', 'Bomb Lance', 'Bomb Launcher', 'Crossbow', 'Hand Crossbow', 'Hunting Bow',
    'Martini-Henry', 'Maynard Sniper', 'Sparks', 'Springfield 1866',
  ],
  'Semi-Automatic': ['Auto-4 Shorty', 'Auto-5', 'Bornheim No. 3', 'Dolch 96'],
  'Single-Action': [
    'Conversion', 'Haymaker', 'LeMat', 'Nagant M1895', 'Pax', 'Scottfield', 'Uppercut',
  ],
  'Double-Action': ['New Army', 'Officer'],
  Melee: [
    'Baseball Bat', 'Cavalry Saber', 'Combat Axe', 'Katana', 'Machete', 'Railroad Hammer',
    'Dusters', 'Heavy Knife', 'Knife', 'Knuckle Knife',
  ],
  Special: ['Chu Ko Nu', 'Flame Rifle', 'Shredder'],
}

/**
 * Variants inherit their base weapon's class and action. These are the ones that don't:
 * a Sparks cut down to a handgun, a revolver given a carbine stock and barrel, a
 * Mosin re-actioned to fire automatically.
 */
const VARIANT_CLASS = {
  'Sparks Pistol': 'Pistol',
  'Sparks Pistol Silencer': 'Pistol',
  'LeMat Carbine': 'Rifle',
  'LeMat Carbine Marksman': 'Rifle',
  'Officer Carbine': 'Rifle',
  'Officer Carbine Deadeye': 'Rifle',
}

// The only three variants that re-action their base. Every other variant is sights,
// blades, stocks or barrels, which don't change how the weapon cycles.
const VARIANT_ACTION = {
  'Martini-Henry Ironside': 'Semi-Automatic', // "modified with a semi-automatic conversion"
  'Mosin-Nagant Avtomat': 'Automatic', // "modified with an automatic action"
  'Vetterli 71 Cyclone': 'Semi-Automatic', // "modified with a semi-automatic conversion"
}

/**
 * Weapons documented on the wiki ahead of their live release. Anything listed here is
 * kept out of the answer pool until the update ships; empty means everything plays.
 * (Historically: Burgess, held back until Update 2.9 on 8 Sep 2026.)
 */
const UNRELEASED = {}

/**
 * Scarce weapons can't be bought with Hunt Dollars — they're claimed with Pledge Marks —
 * so the wiki records no price for them, only what they cost in Pledge Marks, and only
 * in patch-note prose. Their in-game *sell* value goes here; anything not listed falls
 * back to showing "Scarce" and comparing as unknown.
 */
const SCARCE_SELL_PRICE = {
  'Flame Rifle': 250,
  'Homestead 78': 150,
  Shredder: 200,
  Wildland: 175,
}

/** The Maxim's magazine isn't an infobox field; its page states it in prose. */
const MANUAL_MAGAZINE = {
  'Maxim M1895': 50, // "holds 50 Incendiary rounds by default and cannot be resupplied"
}

const SOURCE_BY_KIND = { weapon: 'Weapon', tool: 'Tool', world: 'World' }

const invert = (table) =>
  Object.fromEntries(Object.entries(table).flatMap(([k, names]) => names.map((n) => [n, k])))

const classOf = invert(CLASS)
const actionOf = invert(ACTION)

/** "7+1" -> 8, "9 / 1" -> 9 (the primary barrel), "" -> null. */
function parseLoaded(raw) {
  if (!raw) return null
  const primary = raw.split('/')[0].trim()
  const sum = primary.split('+').reduce((acc, n) => acc + Number(n.trim() || 0), 0)
  return Number.isFinite(sum) && sum > 0 ? sum : null
}

/** Scarce weapons are claimed with Pledge Marks, so the infobox carries no price. */
function parsePrice(raw, name) {
  if (/Scarce/i.test(raw ?? '')) return SCARCE_SELL_PRICE[name] ?? null
  const n = Number((raw ?? '').replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A stat the wiki hasn't filled in yet reads as a literal "?" (or ">150"). */
function parseStat(raw) {
  const n = Number((raw ?? '').split('/')[0].trim())
  return Number.isFinite(n) && raw?.trim() ? n : null
}

/**
 * Sortable key for an update string. Early Access builds predate 1.0, so they sort
 * below every retail version: "Early Access 6.0" -> 6.0, "1.6.1" -> 1006001.
 */
function parseUpdate(raw) {
  const ea = /^Early Access/i.test(raw)
  const parts = raw.replace(/[^0-9.]/g, '').split('.').map(Number)
  const [a = 0, b = 0, c = 0] = parts
  const value = a * 1e6 + b * 1e3 + c
  return {
    display: ea ? `EA ${a}.${b}` : parts.join('.'),
    value: ea ? value - 1e9 : value,
  }
}

/** Sanity-check the hand-tabulated fields against the wiki's own prose. */
function crossCheck(name, description, cls, action) {
  const d = description.toLowerCase()
  const claims = [
    [/lever-action/, 'Lever-Action'],
    [/bolt-action/, 'Bolt-Action'],
    [/pump-action|slide-action/, 'Pump-Action'],
    [/break-action/, 'Break-Action'],
    [/semi-automatic/, 'Semi-Automatic'],
    [/single-action/, 'Single-Action'],
    [/double-action/, 'Double-Action'],
  ]
  for (const [re, expected] of claims) {
    if (re.test(d) && action !== expected) {
      console.warn(`  ! ${name}: description says ${expected}, table says ${action}`)
    }
  }
  if (/\bshotgun\b/.test(d) && !/combination|underbarrel|additional shotgun/.test(d) && cls !== 'Shotgun') {
    console.warn(`  ! ${name}: description says shotgun, table says ${cls}`)
  }
}

async function main() {
  const raw = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'weapons.raw.json'), 'utf8'))

  const weapons = raw.weapons.map((w) => {
    const box = w.infobox
    const overridden = w.name in VARIANT_CLASS || w.name in VARIANT_ACTION
    const cls = VARIANT_CLASS[w.name] ?? classOf[w.base]
    const action = VARIANT_ACTION[w.name] ?? actionOf[w.base]
    if (!cls) throw new Error(`No class mapped for "${w.base}" - add it to CLASS in build-dataset.mjs`)
    if (!action) throw new Error(`No action mapped for "${w.base}" - add it to ACTION in build-dataset.mjs`)
    // A variant's description repeats its base's opening sentence, so the prose check
    // only misleads where we've deliberately overridden the inherited value.
    if (!overridden) crossCheck(w.name, w.description, cls, action)

    const melee = cls === 'Melee'
    // The wiki lists the Flame Rifle's ammo as "Oil" but files it under Special Ammo.
    const rawAmmo = box['Ammo Type']?.trim()
    const ammo = melee ? 'Melee' : rawAmmo === 'Oil' ? 'Special' : rawAmmo || 'Special'
    // A melee weapon's damage is its light melee attack.
    const damage = parseStat(melee ? box['Melee Damage'] : box.Damage)
    const price = parsePrice(box.Price, w.name)
    const scarce = /Scarce/i.test(box.Price ?? '')
    const update = parseUpdate(box.Update ?? '')

    // Tools take a tool slot and world pickups take none, so neither has a weapon size.
    const carried = w.kind === 'weapon'
    const slots = carried ? Number(box.Size) : 0
    const magazine = MANUAL_MAGAZINE[w.name] ?? parseLoaded(box.Loaded)

    return {
      id: w.slug,
      name: w.name,
      base: w.base,
      variant: w.variant,
      icon: w.icon ?? null,
      description: w.description,
      wikiUrl: `https://huntshowdown.wiki.gg/wiki/${encodeURI(w.page.replace(/ /g, '_'))}`,
      released: !UNRELEASED[w.name],
      unreleasedIn: UNRELEASED[w.name] ?? null,
      /** Weapon (loadout slot), Tool (tool slot) or World (picked up off the map). */
      source: SOURCE_BY_KIND[w.kind],
      class: cls,
      ammo: ammo === 'Shells' ? 'Shotgun Shells' : ammo,
      action,
      slots,
      slotsLabel: carried ? String(box.Size) : '—',
      magazine,
      magazineLabel: MANUAL_MAGAZINE[w.name]
        ? String(MANUAL_MAGAZINE[w.name])
        : box.Loaded?.trim() || '—',
      damage,
      cost: price,
      costLabel: price !== null ? `$${price}` : scarce ? 'Scarce' : '—',
      introducedValue: update.value,
      introducedLabel: update.display,
    }
  })

  // Replace the raw version number with a chronological rank. Ranks compare evenly,
  // which the raw values don't: Early Access sorts a billion below 1.0.
  const timeline = [...new Set(weapons.map((w) => w.introducedValue))].sort((a, b) => a - b)
  for (const w of weapons) {
    w.introduced = timeline.indexOf(w.introducedValue)
    delete w.introducedValue
  }

  weapons.sort((a, b) => a.name.localeCompare(b.name))

  const ids = new Set()
  for (const w of weapons) {
    if (ids.has(w.id)) throw new Error(`Duplicate weapon id "${w.id}" (${w.name})`)
    ids.add(w.id)
  }

  const playable = weapons.filter((w) => w.released)
  const out = {
    scrapedAt: raw.scrapedAt,
    builtAt: new Date().toISOString(),
    source: 'https://huntshowdown.wiki.gg',
    weapons,
  }
  await writeFile(path.join(ROOT, 'src', 'data', 'weapons.json'), JSON.stringify(out, null, 2))

  const count = (source) => playable.filter((w) => w.source === source).length
  console.log(
    `Built ${weapons.length} weapons (${playable.length} in the answer pool: ` +
      `${count('Weapon')} loadout, ${count('Tool')} tools, ${count('World')} world)`,
  )
  for (const w of weapons.filter((x) => !x.released)) console.log(`  held back: ${w.name} - ${w.unreleasedIn}`)
  for (const w of weapons.filter((x) => x.released && !x.icon)) console.log(`  ! no icon yet: ${w.name}`)

  const scarce = weapons.filter((w) => w.costLabel === 'Scarce')
  if (scarce.length) {
    console.log(`  ! no sell price for ${scarce.length} Scarce weapons - fill SCARCE_SELL_PRICE:`)
    console.log(`      ${[...new Set(scarce.map((w) => w.name))].join(', ')}`)
  }
}

main()
