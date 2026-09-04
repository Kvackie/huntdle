/**
 * Progress + stats persistence, namespaced per game so each mode keeps its own daily
 * and streak. The weapon game uses the empty namespace, which is where saves lived
 * before the hunter modes existed. Every access is guarded: storage can be unavailable.
 */
export type GameKey = '' | 'trait' | 'quote' | 'portrait' | 'trait-icon' | 'bestiary'

const suffix = (game: GameKey) => (game ? `:${game}` : '')
const progressKey = (game: GameKey) => `huntdle:progress${suffix(game)}`
const statsKey = (game: GameKey) => `huntdle:stats${suffix(game)}`

export interface DailyProgress {
  day: string
  guesses: string[]
  solved: boolean
}

export interface Stats {
  played: number
  wins: number
  streak: number
  bestStreak: number
  lastWinDay: string | null
  /** Guess count -> how many dailies were solved in that many. */
  distribution: Record<number, number>
}

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  lastWinDay: null,
  distribution: {},
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private browsing, quota, storage disabled — the game still plays fine */
  }
}

export function loadProgress(game: GameKey, day: string): DailyProgress {
  const saved = read<DailyProgress>(progressKey(game), { day, guesses: [], solved: false })
  return saved.day === day ? saved : { day, guesses: [], solved: false }
}

export const saveProgress = (game: GameKey, progress: DailyProgress) =>
  write(progressKey(game), progress)

export const loadStats = (game: GameKey): Stats => read(statsKey(game), EMPTY_STATS)

/** Records a solved daily. Idempotent per day, so a reload can't inflate the streak. */
export function recordWin(game: GameKey, day: string, guessCount: number): Stats {
  const stats = loadStats(game)
  if (stats.lastWinDay === day) return stats

  const yesterday = new Date(`${day}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const consecutive = stats.lastWinDay === yesterday.toISOString().slice(0, 10)

  const next: Stats = {
    played: stats.played + 1,
    wins: stats.wins + 1,
    streak: consecutive ? stats.streak + 1 : 1,
    bestStreak: Math.max(stats.bestStreak, consecutive ? stats.streak + 1 : 1),
    lastWinDay: day,
    distribution: { ...stats.distribution, [guessCount]: (stats.distribution[guessCount] ?? 0) + 1 },
  }
  write(statsKey(game), next)
  return next
}
