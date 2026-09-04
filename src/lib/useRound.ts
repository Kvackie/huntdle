import { useCallback, useEffect, useMemo, useState } from 'react'
import { pickOfTheDay, pickRandom, type Guessable } from './core'
import { loadProgress, loadStats, recordWin, saveProgress, type GameKey } from './storage'

export type Mode = 'daily' | 'endless'

interface Options<T> {
  mode: Mode
  dayKey: string
  pool: T[]
  /** Keeps different games' dailies from moving in lockstep. */
  salt: number
  storageKey: GameKey
  onStats: (streak: number, wins: number) => void
}

interface Round<T> {
  key: string
  guesses: T[]
  endlessAnswer: T | null
  gaveUp: boolean
  /** Ids already served in this endless run, so it doesn't repeat itself. */
  seen: string[]
}

/**
 * Pick the next endless subject, avoiding anything already served in this run. Plain
 * random repeats far too readily to be pleasant — with sixteen creatures you'd expect a
 * repeat within a handful of rounds. Once the pool is exhausted it starts a fresh cycle,
 * still refusing to hand back the subject just played.
 */
function nextFromPool<T extends Guessable>(pool: T[], seen: string[], justPlayed?: string) {
  const spent = new Set(seen)
  const unseen = pool.filter((item) => !spent.has(item.id))
  if (unseen.length > 0) {
    const pick = pickRandom(unseen)
    return { pick, seen: [...seen, pick.id] }
  }
  const fresh = pool.filter((item) => item.id !== justPlayed)
  const pick = pickRandom(fresh.length > 0 ? fresh : pool)
  return { pick, seen: [pick.id] }
}

/**
 * The shared per-round state: which answer, which guesses, whether it's been revealed.
 *
 * The reset happens *during render*, not in an effect, and that matters. `answer` flips
 * the instant `mode` changes, but an effect only runs after the browser has painted — so
 * for one frame the new answer was rendered with the previous round's `gaveUp`/`guesses`.
 * Giving up in Endless and clicking Daily therefore painted the daily answer unblurred,
 * in colour, for a frame. Adjusting state during render is React's documented answer to
 * this: it re-renders before anything reaches the screen.
 */
export function useRound<T extends Guessable>({
  mode,
  dayKey,
  pool,
  salt,
  storageKey,
  onStats,
}: Options<T>) {
  const byId = useMemo(() => new Map(pool.map((item) => [item.id, item])), [pool])
  const daily = useMemo(() => pickOfTheDay(dayKey, pool, salt), [dayKey, pool, salt])

  const startRound = (forMode: Mode): Round<T> => {
    const opened = forMode === 'endless' ? nextFromPool(pool, []) : null
    return {
      key: `${forMode}:${dayKey}`,
      guesses:
        forMode === 'daily'
          ? loadProgress(storageKey, dayKey)
              .guesses.map((id) => byId.get(id))
              .filter((x): x is T => Boolean(x))
          : [],
      endlessAnswer: opened?.pick ?? null,
      gaveUp: false,
      seen: opened?.seen ?? [],
    }
  }

  const [round, setRound] = useState<Round<T>>(() => startRound(mode))

  // Built once and used for this very render, so nothing is ever a frame behind.
  let current = round
  if (round.key !== `${mode}:${dayKey}`) {
    current = startRound(mode)
    setRound(current)
  }

  // Stats are display-only, so they can safely follow a frame later.
  useEffect(() => {
    const stats = loadStats(storageKey)
    onStats(stats.streak, stats.wins)
  }, [storageKey, mode, dayKey, onStats])

  const { guesses, gaveUp } = current
  // In endless the answer only exists once a round has started; never fall back to the
  // daily, which would flash a different subject.
  const answer = mode === 'daily' ? daily : current.endlessAnswer
  const solved = answer ? guesses.some((g) => g.id === answer.id) : false
  const revealed = solved || gaveUp

  const guess = useCallback(
    (item: T) => {
      setRound((r) => {
        const next = [...r.guesses, item]
        if (mode === 'daily') {
          const done = item.id === daily.id
          saveProgress(storageKey, { day: dayKey, guesses: next.map((x) => x.id), solved: done })
          if (done) {
            const stats = recordWin(storageKey, dayKey, next.length)
            onStats(stats.streak, stats.wins)
          }
        }
        return { ...r, guesses: next }
      })
    },
    [mode, daily, dayKey, storageKey, onStats],
  )

  const giveUp = useCallback(() => setRound((r) => ({ ...r, gaveUp: true })), [])

  const nextEndless = useCallback(
    () =>
      setRound((r) => {
        const { pick, seen } = nextFromPool(pool, r.seen, r.endlessAnswer?.id)
        return { ...r, guesses: [], gaveUp: false, endlessAnswer: pick, seen }
      }),
    [pool],
  )

  return { answer, guesses, solved, revealed, guess, giveUp, nextEndless }
}
