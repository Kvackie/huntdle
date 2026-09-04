/**
 * Scrapes the two smaller datasets from the Hunt: Showdown 1896 wiki:
 *
 *   Traits    — Category:Traits, {{Infobox Trait}}. Cost / Unlock / Category / Type,
 *               plus the small icon and the 512px "Big" art used on the page body.
 *   Bestiary  — Category:Monsters and Category:Targets. These pages carry no infobox
 *               at all, just a leading [[File:...]] and prose, so name, image and the
 *               opening paragraph are all there is.
 *
 * Output:
 *   src/data/traits.json      + public/traits/<slug>.png
 *   src/data/bestiary.json    + public/bestiary/<slug>.jpg
 *
 *   node scripts/scrape-extras.mjs
 *
 * Deliberately has no npm script. Running this OVERWRITES everything in public/traits/
 * and public/bestiary/ — and several creature images there were replaced by hand
 * because the wiki's own art was poor. Check `git status` afterwards and restore with
 * `git checkout -- public/bestiary/` if this has undone them.
 */
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  API,
  api,
  categoryMembers,
  chunk,
  download,
  fetchWikitext,
  obfuscate,
  parseTemplate,
  resolveFileUrls,
  slugify,
  stripWikitext,
} from './wiki.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const TRAIT_RE = /\{\{Infobox Trait(?=\s*[|\r\n])/

/**
 * A trait can carry several types, and the wiki writes them inconsistently — "Burn,Scarce",
 * "Scarce, Event". Canonicalise so the same combination always compares equal.
 */
const normaliseType = (raw) =>
  [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))].sort().join(' / ') ||
  'Unknown'

/** Remove files in `dir` that nothing in `keep` references. */
async function prune(dir, keep) {
  let removed = 0
  for (const file of await readdir(dir).catch(() => [])) {
    if (!keep.has(file)) {
      await unlink(path.join(dir, file))
      removed++
    }
  }
  if (removed) console.log(`  removed ${removed} unreferenced file(s) from ${path.basename(dir)}/`)
}

/**
 * Download one image per entry into `dir`. `from` is the entry field holding the wiki
 * file name, `to` the field to set with the public path, `suffix` distinguishes files
 * when an entry has more than one image. Returns the file names it wrote, so a caller
 * fetching several sets can prune once at the end.
 */
async function fetchImages(entries, dir, publicDir, { from, to, suffix = '' }) {
  const { urls, key } = await resolveFileUrls(entries.filter((e) => e[from]).map((e) => e[from]))
  const keep = new Set()
  for (const e of entries) {
    const url = e[from] ? urls.get(key(e[from])) : undefined
    if (!url) {
      if (e[from]) console.warn(`  ! no url for ${key(e[from])} (${e.name})`)
      continue
    }
    // Hashed, not the slug — trait banners and creature art are answers in themselves.
    const file = `${obfuscate(e.id + suffix)}${path.extname(new URL(url).pathname) || '.png'}`
    if (await download(url, dir, file)) {
      e[to] = `${publicDir}/${file}`
      keep.add(file)
    }
  }
  return keep
}

async function scrapeTraits() {
  const titles = await categoryMembers('Category:Traits', (t) => /^Traits\//.test(t))
  const pages = await fetchWikitext(titles)
  const traits = []

  for (const [page, wikitext] of pages) {
    const box = parseTemplate(wikitext, TRAIT_RE)
    if (!box) { console.warn(`  ! no infobox for ${page}`); continue }
    const f = box.fields
    const name = stripWikitext(f.Title) || page.replace('Traits/', '')

    // Two images per trait, and they serve different jobs: the infobox "Small" icon is
    // the crisp in-game symbol used in lists, the page body's 512px "Big" banner is what
    // a blur round needs — shrinking the banner to a list thumbnail reads as mush.
    const banner = wikitext.match(/\[\[File:(Trait [^|\]]*?Big[^|\]]*\.png)/i)?.[1] ?? null
    const cost = Number(f.Cost)
    const unlock = Number(f.Unlock)

    // Cut traits the game no longer has. The wiki keeps their pages in Category:Traits
    // with no marker on the infobox — the only signal is the update history saying so,
    // and their Cost/Unlock fields being left blank. Blankness alone isn't enough to go
    // on: event and pact traits are blank too and are very much still in the game.
    const removed = /removed from the game|no longer (?:available|in the game)|has been removed/i.test(
      wikitext,
    )

    traits.push({
      id: slugify(name),
      name,
      page,
      wikiUrl: `https://huntshowdown.wiki.gg/wiki/${encodeURI(page.replace(/ /g, '_'))}`,
      // Upgrade points. Event and pact traits can't be bought, so the wiki records no
      // cost for them; they count as free rather than as unknown, which keeps every
      // trait on one scale and every guess arrowed.
      cost: Number.isFinite(cost) ? cost : 0,
      costLabel: String(Number.isFinite(cost) ? cost : 0),
      // Bloodline rank at which it unlocks; 0 for those available from the start.
      unlock: Number.isFinite(unlock) ? unlock : 0,
      unlockLabel: String(Number.isFinite(unlock) ? unlock : 0),
      category: stripWikitext(f.Category) || 'Unknown',
      type: normaliseType(stripWikitext(f.Type)),
      description: stripWikitext(
        wikitext.match(/\}\}\s*\n+\[\[File:[^\]]*\]\]\s*\n+([^\n=]{20,})/)?.[1] ?? '',
      ),
      removed,
      imageSmall: (f.image ?? '').trim() || null,
      imageBanner: banner,
    })
  }

  traits.sort((a, b) => a.name.localeCompare(b.name))
  const dir = path.join(ROOT, 'public', 'traits')
  const keep = new Set([
    ...(await fetchImages(traits, dir, 'traits', { from: 'imageSmall', to: 'icon' })),
    ...(await fetchImages(traits, dir, 'traits', {
      from: 'imageBanner',
      to: 'banner',
      suffix: '-banner',
    })),
  ])
  await prune(dir, keep)
  return traits
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Pick the most portrait-like art a creature page offers, best first:
 *
 *  1. "Lore <Name> Mastery.png" — the in-game bestiary plate, ~368x560 of just the
 *     creature. 12 of 16 have one, and it's by far the best likeness.
 *  2. A model render, which is a clean character shot where it exists.
 *  3. The bare "<Name>.jpg" the page leads with — atmospheric scene art, the last resort.
 *  4. A wide "Mastery.jpg", for the few with no plate.
 */
function pickArt(files, name, word) {
  const n = escapeRe(name)
  const preferences = [
    new RegExp(`^Lore ${n} Mastery\\.png$`, 'i'),
    new RegExp(`^${word} ${n} Model(\\s|\\.)`, 'i'),
    new RegExp(`^${n}\\.(jpg|png)$`, 'i'),
    new RegExp(`^Lore ${n} Mastery\\.(jpg|png)$`, 'i'),
    // Ursa Mortis has none of the above — only teasers and wallpapers. Sorting puts
    // "Monster <Name> Teaser" ahead of "Wallpaper <Name>", which is the better shot.
    new RegExp(`^(?!Event Icon)(?!Stub).*${n}.*\\.(jpg|png)$`, 'i'),
  ]
  for (const re of preferences) {
    const hit = files.filter((f) => re.test(f)).sort()[0]
    if (hit) return hit
  }
  return null
}

async function scrapeBestiary() {
  const groups = [
    { category: 'Category:Monsters', prefix: 'Monsters/', kind: 'Monster', word: 'Monster' },
    { category: 'Category:Targets', prefix: 'Targets/', kind: 'Boss', word: 'Target' },
  ]
  const entries = []

  for (const g of groups) {
    const titles = await categoryMembers(g.category, (t) => t.startsWith(g.prefix))
    const pages = await fetchWikitext(titles)

    // Every file each page uses, so we can choose rather than take the first link.
    const filesByPage = new Map()
    for (const batch of chunk(titles, 20)) {
      const d = await api({ action: 'query', prop: 'images', imlimit: '500', titles: batch.join('|') })
      for (const p of d.query.pages) {
        filesByPage.set(p.title, (p.images ?? []).map((i) => i.title.replace(/^File:/, '')))
      }
    }

    for (const [page, wikitext] of pages) {
      const name = page.replace(g.prefix, '')
      const image = pickArt(filesByPage.get(page) ?? [], name, g.word)
      if (!image) console.warn(`  ! no usable art for ${name}`)
      // First real paragraph after that link.
      const description = stripWikitext(
        wikitext.match(/\[\[File:[^\]]*\]\]\s*\n+([^\n=]{30,})/)?.[1] ?? '',
      )
      entries.push({
        id: slugify(name),
        name,
        page,
        wikiUrl: `https://huntshowdown.wiki.gg/wiki/${encodeURI(page.replace(/ /g, '_'))}`,
        kind: g.kind,
        description,
        image,
      })
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  const dir = path.join(ROOT, 'public', 'bestiary')
  await prune(dir, await fetchImages(entries, dir, 'bestiary', { from: 'image', to: 'art' }))
  return entries
}

async function main() {
  const outDir = path.join(ROOT, 'src', 'data')
  await mkdir(outDir, { recursive: true })

  console.log('Traits…')
  const traits = await scrapeTraits()
  await writeFile(
    path.join(outDir, 'traits.json'),
    JSON.stringify({ scrapedAt: new Date().toISOString(), source: API, traits }, null, 2),
  )
  console.log(
    `  ${traits.length} traits, ${traits.filter((t) => t.icon).length} icons, ` +
      `${traits.filter((t) => t.banner).length} banners`,
  )
  const gone = traits.filter((t) => t.removed)
  console.log(`  free (event/pact traits): ${traits.filter((t) => t.cost === 0 && !t.removed).length}`)
  console.log(`  removed from the game (excluded from play): ${gone.length}`)
  if (gone.length) console.log(`      ${gone.map((t) => t.name).join(', ')}`)

  console.log('Bestiary…')
  const bestiary = await scrapeBestiary()
  await writeFile(
    path.join(outDir, 'bestiary.json'),
    JSON.stringify({ scrapedAt: new Date().toISOString(), source: API, bestiary }, null, 2),
  )
  console.log(`  ${bestiary.length} creatures, ${bestiary.filter((b) => b.art).length} images`)
  for (const b of bestiary.filter((x) => !x.art)) console.log(`  ! no art: ${b.name}`)
}

main()
