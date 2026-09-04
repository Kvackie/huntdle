/** Daily selection and name search, shared by every game mode. */

export interface Guessable {
  id: string
  name: string
}

/* ------------------------------------------------------------------ dailies */

/** Local calendar date as YYYY-MM-DD, so the puzzle rolls over at the player's midnight. */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** mulberry32 — small, fast, and stable across browsers, which Math.random is not. */
function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items]
  const next = rng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Walks a reshuffled deck of the whole pool, so everything is used before anything
 * repeats — rather than picking independently at random each day. `salt` keeps
 * different modes from moving in lockstep.
 */
export function pickOfTheDay<T>(key: string, pool: T[], salt = 0): T {
  const n = dayNumber(key)
  const cycle = Math.floor(n / pool.length)
  const index = ((n % pool.length) + pool.length) % pool.length
  return shuffled(pool, cycle + 1 + salt)[index]
}

export function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

/* ------------------------------------------------------------------- search */

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The name read from each of its words onwards, so a query can only match at a word
 * boundary: "Baseball Bat" -> ["baseballbat", "bat"]. That way "bat" finds the Baseball
 * Bat but not the Combat Axe, while "combat" still finds the Combat Axe.
 */
function wordStarts(name: string): string[] {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return words.map((_, i) => words.slice(i).join(''))
}

const wordStartCache = new Map<string, string[]>()

function wordStartsOf(item: Guessable): string[] {
  let starts = wordStartCache.get(item.id)
  if (!starts) {
    starts = wordStarts(item.name)
    wordStartCache.set(item.id, starts)
  }
  return starts
}

/** Empty query means no suggestions — the box shouldn't dump the whole roster. */
export function searchByName<T extends Guessable>(query: string, pool: T[]): T[] {
  const q = normalise(query)
  if (!q) return []

  const matches: { item: T; wordIndex: number }[] = []
  for (const item of pool) {
    const wordIndex = wordStartsOf(item).findIndex((start) => start.startsWith(q))
    if (wordIndex !== -1) matches.push({ item, wordIndex })
  }

  // Matches from the start of the name come first, so "nagant" lists Nagant M1895
  // above Mosin-Nagant.
  return matches
    .sort((a, b) => a.wordIndex - b.wordIndex || a.item.name.localeCompare(b.item.name))
    .map((m) => m.item)
}
