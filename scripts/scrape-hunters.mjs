/**
 * Scrapes hunters + portraits from the official Hunt: Showdown 1896 wiki.
 *
 * Hunter pages come in two shapes. Most use `{{Infobox Hunter}}` with a single
 * Title/image/caption. The rest use `{{Infobox Hunter Variant}}`, which packs several
 * forms into one page — "Dorothy Alice: Dream" and "Dorothy Alice: Nightmare", or the
 * Rookie/Survivor/Veteran tiers — as `<Form>_title`, `<Form>_caption` keys plus an
 * `images=` list mapping each file to its form. Each form carries its own portrait and
 * lore blurb, so most become their own entry; see `entriesOf` for the ones that don't.
 *
 * Output:
 *   src/data/hunters.json        - one entry per hunter you can own
 *   public/hunters/<slug>.png    - portrait
 *
 *   node scripts/scrape-hunters.mjs
 */
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  API,
  categoryMembers,
  download,
  fetchWikitext,
  obfuscate,
  parseTemplate,
  resolveFileUrls,
  slugify,
  stripWikitext,
} from './wiki.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const INFOBOX_RE = /\{\{Infobox Hunter(?: Variant)?(?=\s*[|\r\n])/

/** Bucket the free-text Source field into how you actually get the hunter. */
function classifySource(raw) {
  const text = stripWikitext(raw)
  if (!text) return { source: 'Unknown', bloodBonds: null, sourceLabel: '—' }
  const bb = text.match(/(\d+)\s*Blood Bonds?/i)
  if (bb) return { source: 'Blood Bonds', bloodBonds: Number(bb[1]), sourceLabel: `${bb[1]} BB` }
  if (/^DLC|DLC$/i.test(text) || /\bDLC\b/.test(raw)) return { source: 'DLC', bloodBonds: null, sourceLabel: 'DLC' }
  if (/Twitch/i.test(text)) return { source: 'Twitch Drops', bloodBonds: null, sourceLabel: 'Twitch' }
  if (/Prestige/i.test(text)) return { source: 'Prestige', bloodBonds: null, sourceLabel: 'Prestige' }
  if (/Bloodline/i.test(text)) return { source: 'Bloodline', bloodBonds: null, sourceLabel: text }
  if (/Story Challenge|Lore/i.test(raw)) return { source: 'Story Challenge', bloodBonds: null, sourceLabel: 'Story' }
  if (/Dark Tribute/i.test(text)) return { source: 'Dark Tribute', bloodBonds: null, sourceLabel: 'Dark Tribute' }
  if (/Event/i.test(raw)) return { source: 'Event', bloodBonds: null, sourceLabel: 'Event' }
  return { source: 'Other', bloodBonds: null, sourceLabel: text }
}

/**
 * `images=` is a comma-separated `File.png:FormName` list. Returns form -> file.
 */
function parseImageList(raw) {
  const byForm = {}
  for (const entry of (raw ?? '').split(',')) {
    const [file, form] = entry.split(':').map((s) => s?.trim())
    if (file && form) byForm[form] = file
  }
  return byForm
}

/**
 * Rookie, Survivor and Veteran are one hunter at three ranks — you level into them, you
 * don't acquire them — so they are one answer, not three. The wiki says so in the Source
 * field, except on Tennessee Morgan, whose tiers all name the Story Challenge that grants
 * them; the form names settle that case.
 */
const isTier = (form, source) =>
  /Hunter Progression/i.test(source) || form === 'Survivor' || form === 'Veteran'

/**
 * The entries a page is worth. A plain `{{Infobox Hunter}}` is one hunter.
 *
 * `{{Infobox Hunter Variant}}` packs several forms into one page, and how you get a form
 * decides whether it is its own hunter. The Royal Phantom costs 1000 Blood Bonds while
 * The Phantom is DLC, Post Malone's Ringmaster and Disciple of Death come from two
 * different events, Ambrose Hazen's Officer is a Story Challenge reward — those are all
 * bought and owned separately, so each is an answer of its own with its own portrait and
 * blurb. Rank tiers are not, and fold into the hunter they belong to.
 *
 * The page's first form is the hunter themself and keeps the page's name; the rest go by
 * the wiki's own title for them, so the answer reads "The Royal Phantom" rather than
 * "The Phantom" a second time.
 */
function entriesOf(page, fields, isVariant) {
  const shared = {
    page,
    realName: stripWikitext(fields.Name) || null,
    pacts: stripWikitext(fields.Pacts) || null,
    eventBoost: stripWikitext(fields['Event Boost']) || null,
  }
  const pageName = page.replace('Hunters/', '')

  if (!isVariant) {
    return [{
      ...shared,
      name: pageName,
      form: null,
      caption: stripWikitext(fields.caption),
      image: fields.image?.trim() || null,
      ...classifySource(fields.Source ?? ''),
    }]
  }

  const images = parseImageList(fields.images)
  // Form names are whatever prefixes a "<Form>_title" key; the first is the default look.
  const forms = Object.keys(fields)
    .filter((k) => k.endsWith('_title'))
    .map((k) => k.slice(0, -'_title'.length))

  const entries = []
  forms.forEach((form, i) => {
    // A form can override the shared source; fall back to the page's.
    const source = fields[`${form}_Source`] ?? fields.Source ?? ''
    if (i > 0 && isTier(form, stripWikitext(source))) return
    entries.push({
      ...shared,
      name: i === 0 ? pageName : stripWikitext(fields[`${form}_title`]),
      form,
      caption: stripWikitext(fields[`${form}_caption`]),
      image: images[form] ?? null,
      ...classifySource(source),
    })
  })
  return entries
}

async function main() {
  const titles = await categoryMembers('Category:Hunters', (t) => /^Hunters\//.test(t))
  titles.sort()
  const pages = await fetchWikitext(titles)
  console.log(`Found ${titles.length} hunter pages`)

  const hunters = []
  for (const [page, wikitext] of pages) {
    const box = parseTemplate(wikitext, INFOBOX_RE)
    if (!box) { console.warn(`  ! no infobox for ${page}`); continue }
    hunters.push(...entriesOf(page, box.fields, box.tag.includes('Variant')))
  }

  // Names must be unique — they're the answer, and the id.
  const seen = new Map()
  for (const h of hunters) {
    h.id = slugify(h.name)
    if (seen.has(h.id)) console.warn(`  ! duplicate id "${h.id}": ${seen.get(h.id)} vs ${h.page}`)
    seen.set(h.id, h.page)
  }

  // Portraits.
  const { urls, key } = await resolveFileUrls(hunters.filter((h) => h.image).map((h) => h.image))
  const dir = path.join(ROOT, 'public', 'hunters')
  for (const h of hunters) {
    const url = h.image ? urls.get(key(h.image)) : undefined
    if (!url) continue
    // Hashed, not `${h.id}.png` — the portrait is the answer in one of the rounds.
    const file = `${obfuscate(h.id)}.png`
    if (await download(url, dir, file)) {
      h.portrait = `hunters/${file}`
      h.portraitSource = url
    }
  }

  // Drop portraits left behind by an earlier run with a different roster, so the build
  // doesn't ship art nothing references.
  const keep = new Set(hunters.filter((h) => h.portrait).map((h) => path.basename(h.portrait)))
  let removed = 0
  for (const file of await readdir(dir).catch(() => [])) {
    if (file.endsWith('.png') && !keep.has(file)) {
      await unlink(path.join(dir, file))
      removed++
    }
  }
  if (removed) console.log(`Removed ${removed} unreferenced portrait(s)`)

  hunters.sort((a, b) => a.name.localeCompare(b.name))
  await mkdir(path.join(ROOT, 'src', 'data'), { recursive: true })
  await writeFile(
    path.join(ROOT, 'src', 'data', 'hunters.json'),
    JSON.stringify(
      { scrapedAt: new Date().toISOString(), source: API, hunters },
      null,
      2,
    ),
  )

  const noPortrait = hunters.filter((h) => !h.portrait)
  const noCaption = hunters.filter((h) => !h.caption)
  const extra = hunters.filter((h) => h.name !== h.page.replace('Hunters/', ''))
  console.log(`Wrote ${hunters.length} hunters (${hunters.length - noPortrait.length} portraits)`)
  console.log(`  ${titles.length} pages + ${extra.length} separately acquired forms`)
  if (noPortrait.length) {
    console.log(`  ! no portrait (${noPortrait.length}):`)
    for (const h of noPortrait) console.log(`      ${h.name}  [${h.page}] image=${h.image ?? 'none'}`)
  }
  if (noCaption.length) {
    console.log(`  ! no caption (${noCaption.length}): ${noCaption.map((h) => h.name).join(', ')}`)
  }
}

main()
