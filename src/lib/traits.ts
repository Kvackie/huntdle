import dataset from '../data/traits.json'
import type { Column } from './grid'

export interface Trait {
  id: string
  name: string
  page: string
  wikiUrl: string
  /** Upgrade points. 0 for the event and pact traits you can't buy. */
  cost: number
  costLabel: string
  /** Bloodline rank at which it unlocks. */
  unlock: number
  unlockLabel: string
  /** Offensive | Defensive | Movement | Supportive */
  category: string
  /** Regular | Scarce | Event | Burn, or a " / "-joined combination. */
  type: string
  description: string
  /** Traits the game no longer has. Kept in the data, kept out of play. */
  removed: boolean
  /** The crisp 64px in-game symbol — for lists and guess rows. */
  icon: string | null
  /** The 512px page banner — for the blur round, where a shrunken icon reads as mush. */
  banner: string | null
}

const data = dataset as unknown as { scrapedAt: string; traits: Trait[] }

/** Only traits still in the game are guessable. */
export const TRAITS: Trait[] = data.traits.filter((t) => !t.removed)
export const TRAITS_WITH_BANNER: Trait[] = TRAITS.filter((t) => Boolean(t.banner))

/**
 * Cost, Category and Type alone leave most traits indistinguishable — they share a
 * combination with several others. Unlock rank roughly halves that.
 */
export const TRAIT_COLUMNS: Column<Trait>[] = [
  { key: 'cost', label: 'Cost', kind: 'number', value: (t) => t.cost, format: (t) => t.costLabel },
  {
    key: 'unlock',
    label: 'Rank',
    kind: 'number',
    value: (t) => t.unlock,
    format: (t) => t.unlockLabel,
  },
  { key: 'category', label: 'Category', kind: 'category', value: (t) => t.category },
  { key: 'type', label: 'Type', kind: 'category', value: (t) => t.type },
]
