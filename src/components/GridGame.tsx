import { searchByName, type Guessable } from '../lib/core'
import type { Column } from '../lib/grid'
import type { GameKey } from '../lib/storage'
import { useRound, type Mode } from '../lib/useRound'
import { GuessGrid } from './GuessGrid'
import { GuessInput } from './GuessInput'

interface Props<T extends Guessable> {
  storageKey: GameKey
  salt: number
  pool: T[]
  columns: Column<T>[]
  imageOf: (item: T) => string | null | undefined
  wikiUrlOf: (item: T) => string
  descriptionOf: (item: T) => string
  subjectLabel: string
  placeholder: string
  thumb?: 'wide' | 'portrait' | 'none'
  mode: Mode
  dayKey: string
  onStats: (streak: number, wins: number) => void
}

/** The attribute-board game: guess the subject, graded column by column. */
export function GridGame<T extends Guessable>({
  storageKey,
  salt,
  pool,
  columns,
  imageOf,
  wikiUrlOf,
  descriptionOf,
  subjectLabel,
  placeholder,
  thumb = 'wide',
  mode,
  dayKey,
  onStats,
}: Props<T>) {
  const { answer, guesses, solved, guess, nextEndless } = useRound({
    mode,
    dayKey,
    pool,
    salt,
    storageKey,
    onStats,
  })

  if (!answer) return null

  return (
    <>
      {solved ? (
        <section className="victory">
          <h2 className="victory__name">{answer.name}</h2>
          <p className="victory__flavour">{descriptionOf(answer)}</p>
          <p className="victory__score">
            Found in <strong>{guesses.length}</strong>{' '}
            {guesses.length === 1 ? 'guess' : 'guesses'}
          </p>
          <div className="victory__actions">
            {mode === 'endless' && (
              <button type="button" className="button button--primary" onClick={nextEndless}>
                Next {subjectLabel.toLowerCase()}
              </button>
            )}
            <a
              className="button"
              href={wikiUrlOf(answer)}
              target="_blank"
              rel="noreferrer noopener"
            >
              Wiki page
            </a>
          </div>
        </section>
      ) : (
        <GuessInput
          pool={pool}
          guessed={guesses}
          search={searchByName}
          imageOf={imageOf}
          thumb={thumb}
          placeholder={placeholder}
          onGuess={guess}
        />
      )}
      <GuessGrid
        guesses={[...guesses].reverse()}
        answer={answer}
        columns={columns}
        imageOf={imageOf}
        subjectLabel={subjectLabel}
      />
    </>
  )
}
