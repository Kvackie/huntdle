/**
 * Scrapes weapon data + icons from the official Hunt: Showdown 1896 wiki
 * (https://huntshowdown.wiki.gg) via the MediaWiki API. Covers base weapons
 * (Weapons/Sparks), their variants (Weapons/Sparks/Sniper), and the handful of
 * tools that are really weapons — the melee tools and the derringers.
 *
 * Output:
 *   src/data/weapons.raw.json   - parsed infobox data, one entry per weapon
 *   public/weapons/<slug>.png   - the in-game icon
 *
 * Re-run after a game update to refresh the dataset:
 *   node scripts/scrape-wiki.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  API,
  categoryMembers,
  download,
  fetchWikitext,
  parseTemplate,
  resolveFileUrls,
  slugify,
} from './wiki.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

/**
 * Where the roster comes from. Tools use `{{Infobox Tool}}` but with the same field
 * names, so they parse identically; only the melee tools and derringers are weapons
 * in any meaningful sense, so the rest of Category:Tools stays out.
 */
const SOURCES = [
  { category: 'Category:Weapons', keep: /^Weapons\/[^/]+(\/[^/]+)?$/ },
  { category: 'Category:Melee Tools', keep: /^Tools\/[^/]+$/ },
]

/** Weapons that live outside those categories: the derringers, and the Maxim. */
const EXTRA_PAGES = ['Tools/Quad Derringer', 'Tools/Derringer Pennyshot', 'World Items/Maxim M1895']

const KIND_BY_NAMESPACE = { Weapons: 'weapon', Tools: 'tool', 'World Items': 'world' }

/**
 * The lookahead matters: pages also carry `{{Infobox Weapon Skin}}` boxes for their
 * legendary skins, and a plain "starts with {{Infobox Weapon" test matches those too —
 * which on a tool page (whose own box is {{Infobox Tool}}) silently returns skin data.
 */
const INFOBOX_RE = /\{\{Infobox (?:Weapon|Tool|World Item)(?=\s*[|\r\n])/

/** Grab the prose under `== Description ==`. */
function parseDescription(wikitext) {
  const m = wikitext.match(/==\s*Description\s*==\s*\n([\s\S]*?)(?=\n==|$)/)
  if (!m) return ''
  return m[1]
    .replace(/\{\{[^{}]*\|([^{}|]*)\}\}/g, '$1') // {{Template|text}} -> text
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

async function main() {
  // 1. Collect the pages to scrape from every source category, plus the named extras.
  const titles = new Set(EXTRA_PAGES)
  for (const source of SOURCES) {
    for (const title of await categoryMembers(source.category, (t) => source.keep.test(t))) {
      titles.add(title)
    }
  }
  const all = [...titles].sort()
  const weaponPages = all.filter((t) => t.startsWith('Weapons/'))
  const baseCount = weaponPages.filter((t) => t.split('/').length === 2).length
  const tools = all.filter((t) => t.startsWith('Tools/')).length
  console.log(
    `Found ${all.length} pages: ${baseCount} base weapons, ${weaponPages.length - baseCount} ` +
      `variants, ${tools} tools, ${all.length - weaponPages.length - tools} world items`,
  )

  // 2. Parse each page's infobox.
  const pages = await fetchWikitext(all)
  const weapons = []
  for (const [title, wikitext] of pages) {
    const box = parseTemplate(wikitext, INFOBOX_RE)
    if (!box) { console.warn(`  ! no infobox for ${title}`); continue }
    const info = box.fields
    const [namespace, base, variant] = title.split('/')
    // Name comes from the page path, not the infobox Title: page titles are unique,
    // and a draft page can carry a copy-pasted Title (Burgess/Trauma says "Burgess
    // Bayonet"), which would collide with another weapon's id.
    const name = [base, variant].filter(Boolean).join(' ')
    if (info.Title && info.Title.replace(/\s+/g, ' ') !== name) {
      console.warn(`  ~ ${title}: infobox Title is "${info.Title}", using "${name}"`)
    }
    weapons.push({
      page: title,
      name,
      infoboxTitle: info.Title ?? null,
      // Tools and world pickups have no weapon-capacity size; the builder labels theirs.
      kind: KIND_BY_NAMESPACE[namespace] ?? 'weapon',
      base,
      variant: variant ?? null,
      image: info.image || '',
      description: parseDescription(wikitext),
      scarce: /\{\{Scarce\}\}/.test(wikitext),
      infobox: info,
    })
  }
  weapons.sort((a, b) => a.name.localeCompare(b.name))

  // 3. Resolve and download icons.
  const { urls, key } = await resolveFileUrls(weapons.filter((w) => w.image).map((w) => w.image))
  const iconDir = path.join(ROOT, 'public', 'weapons')
  for (const w of weapons) {
    w.slug = slugify(w.name)
    const url = w.image ? urls.get(key(w.image)) : undefined
    if (!url) {
      if (w.image) console.warn(`  ! no image url for ${key(w.image)}`)
      continue
    }
    const file = `${w.slug}.png`
    if (await download(url, iconDir, file)) {
      w.icon = `weapons/${file}`
      w.iconSource = url
    }
  }

  const outDir = path.join(ROOT, 'src', 'data')
  await mkdir(outDir, { recursive: true })
  await writeFile(
    path.join(outDir, 'weapons.raw.json'),
    JSON.stringify({ scrapedAt: new Date().toISOString(), source: API, weapons }, null, 2),
  )
  console.log(`Wrote ${weapons.length} weapons + ${weapons.filter((w) => w.icon).length} icons`)
}

main()
