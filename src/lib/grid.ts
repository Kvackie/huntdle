/**
 * The attribute-grid comparison, generic over what's being guessed so the weapon and
 * trait boards share one implementation.
 *
 * Every attribute is graded strictly: a value either matches the answer or it doesn't.
 * There is no near-miss grade — "Long" against an answer of "Special Long" is wrong.
 */
import type { CellResult, Verdict } from '../types'

interface CategoryColumn<T> {
  key: string
  label: string
  kind: 'category'
  value: (item: T) => string
}

interface NumberColumn<T> {
  key: string
  label: string
  kind: 'number'
  /** Null means "no such value" — it only ever matches another null. */
  value: (item: T) => number | null
  format: (item: T) => string
}

export type Column<T> = CategoryColumn<T> | NumberColumn<T>

function compareCategory<T>(column: CategoryColumn<T>, guess: T, answer: T): CellResult {
  const a = column.value(guess)
  const verdict: Verdict = a === column.value(answer) ? 'hit' : 'miss'
  return { key: column.key, label: a, verdict, direction: null }
}

function compareNumber<T>(column: NumberColumn<T>, guess: T, answer: T): CellResult {
  const a = column.value(guess)
  const b = column.value(answer)
  const label = column.format(guess)

  // A melee weapon has no magazine, an event trait has no cost: absent only matches absent.
  if (a === null || b === null) {
    return { key: column.key, label, verdict: a === b ? 'hit' : 'miss', direction: null }
  }
  if (a === b) return { key: column.key, label, verdict: 'hit', direction: null }

  // Still say which way the answer lies — that's a direction, not partial credit.
  return { key: column.key, label, verdict: 'miss', direction: a < b ? 'up' : 'down' }
}

export function compare<T>(guess: T, answer: T, columns: Column<T>[]): CellResult[] {
  return columns.map((column) =>
    column.kind === 'category'
      ? compareCategory(column, guess, answer)
      : compareNumber(column, guess, answer),
  )
}
