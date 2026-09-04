import dataset from '../data/hunters.json'

export interface Hunter {
  id: string
  name: string
  /** Wiki page the form came from. Several forms can share one page. */
  page: string
  /** "Dream", "Nightmare", "Veteran"… Null for a single-form hunter. */
  form: string | null
  /** The person behind the alias, where the wiki names one. */
  realName: string | null
  /** The lore blurb from the infobox — the quote round's prompt. */
  caption: string
  /** Null for the three hunters whose portrait was never uploaded to the wiki. */
  portrait?: string
  source: string
  sourceLabel: string
  bloodBonds: number | null
}

interface HunterDataset {
  scrapedAt: string
  source: string
  hunters: Hunter[]
}

const data = dataset as unknown as HunterDataset

export const HUNTERS: Hunter[] = data.hunters
/** Portrait round can only use hunters the wiki actually has art for. */
export const HUNTERS_WITH_PORTRAIT: Hunter[] = data.hunters.filter((h) => Boolean(h.portrait))

/** Derived from `page` rather than stored, so the dataset keeps one source of truth. */
export const hunterWikiUrl = (h: Hunter) =>
  `https://huntshowdown.wiki.gg/wiki/${encodeURI(h.page.replace(/ /g, '_'))}`

/** Words too common to be worth hiding — redacting "The" helps nobody. */
const STOPWORDS = new Set(['the', 'and', 'of', 'a', 'an', 'de', 'la', 'el'])

/**
 * Hide the answer's own name inside its lore blurb. Dorothy Alice's caption opens
 * "Dorothy's upbringing was idyllic", which would give the round away outright.
 */
export function redact(caption: string, hunter: Hunter): string {
  const words = [hunter.name, hunter.realName ?? '']
    .join(' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()))

  let out = caption
  for (const word of new Set(words)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '█████')
  }
  // Collapse a redacted first and last name into one block.
  return out.replace(/█████(\s+█████)+/g, '█████')
}
