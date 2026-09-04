import { compare, type Column } from '../lib/grid'
import type { Guessable } from '../lib/core'

interface Props<T extends Guessable> {
  /** Newest guess first. */
  guesses: T[]
  answer: T
  columns: Column<T>[]
  imageOf: (item: T) => string | null | undefined
  /** What the first column is called: "Weapon", "Trait"… */
  subjectLabel: string
}

const ARROW = { up: '▲', down: '▼' } as const
const HINT = { up: 'higher', down: 'lower' } as const

export function GuessGrid<T extends Guessable>({
  guesses,
  answer,
  columns,
  imageOf,
  subjectLabel,
}: Props<T>) {
  if (guesses.length === 0) return null

  return (
    <div className="grid-scroll">
      <div className="grid" style={{ '--columns': columns.length } as React.CSSProperties}>
        <div className="grid__head" role="row">
          <span className="grid__heading">{subjectLabel}</span>
          {columns.map((c) => (
            <span key={c.key} className="grid__heading">
              {c.label}
            </span>
          ))}
        </div>

        {guesses.map((guess, row) => {
          const src = imageOf(guess)
          return (
            <div className="grid__row" key={guess.id} role="row">
              <div className="cell cell--weapon">
                {src ? (
                  <img src={src} alt="" className="cell__icon" />
                ) : (
                  <span className="cell__icon icon-missing">no icon yet</span>
                )}
                <span className="cell__name">{guess.name}</span>
              </div>

              {compare(guess, answer, columns).map((cell, i) => (
                <div
                  key={cell.key}
                  className={`cell cell--${cell.verdict}`}
                  // Only the newest row animates; older rows are already revealed.
                  style={{ animationDelay: row === 0 ? `${i * 120}ms` : '0ms' }}
                >
                  <span className="cell__value">{cell.label}</span>
                  {cell.direction && (
                    <span className="cell__arrow" title={`The answer is ${HINT[cell.direction]}`}>
                      {ARROW[cell.direction]}
                    </span>
                  )}
                  <span className="visually-hidden">
                    {cell.verdict === 'hit' ? 'correct' : 'wrong'}
                    {cell.direction ? `, answer is ${HINT[cell.direction]}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
