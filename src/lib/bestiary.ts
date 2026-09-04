import dataset from '../data/bestiary.json'

export interface Creature {
  id: string
  name: string
  page: string
  wikiUrl: string
  /** Monster (world AI) or Boss (a bounty target). */
  kind: 'Monster' | 'Boss'
  description: string
  art: string | null
}

const data = dataset as unknown as { scrapedAt: string; bestiary: Creature[] }

/** The bestiary round is art-only, so anything without art can't be an answer. */
export const CREATURES_WITH_ART: Creature[] = data.bestiary.filter((c) => Boolean(c.art))
