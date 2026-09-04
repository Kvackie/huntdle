import { Fragment } from 'react'
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
          const cells = compare(guess, answer, columns)
          // These attributes don't always identify a single subject — 77% of traits
          // share their cost/category/type with another. Without saying so, an
          // all-green wrong guess just looks broken.
          const indistinguishable =
            guess.id !== answer.id && cells.every((c) => c.verdict === 'hit')

          return (
            <Fragment key={guess.id}>
            <div className="grid__row" role="row">
              <div className="cell cell--weapon">
                {src ? (
                  <img src={src} alt="" className="cell__icon" />
                ) : (
                  <span className="cell__icon icon-missing">no icon yet</span>
                )}
                <span className="cell__name">{guess.name}</span>
              </div>

              {cells.map((cell, i) => (
                <div
                  key={cell.key}
                  className={`cell cell--${cell.verdict}`}
                  // Mobile stacks each guess into a card with no header row, so every
                  // cell has to name its own column. CSS reveals this below 640px.
                  data-label={columns[i].label}
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
            {indistinguishable && (
              <p className="grid__note" role="status">
                Close but not quite. Every attribute matches, but it isn't the answer.
              </p>
            )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
