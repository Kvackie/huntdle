import { searchByName, type Guessable } from '../lib/core'
import type { GameKey } from '../lib/storage'
import { useRound, type Mode } from '../lib/useRound'
import { GuessInput } from './GuessInput'
import { ObscuredArt } from './ObscuredArt'

/** The blur clears one step per wrong guess and is gone on the eighth. */
const BLUR_STEPS = 8

interface Props<T extends Guessable> {
  storageKey: GameKey
  salt: number
  pool: T[]
  /** The art to blur and reveal. */
  imageOf: (item: T) => string | null | undefined
  /** Smaller art for the suggestions and guess rows. Defaults to the reveal art. */
  thumbOf?: (item: T) => string | null | undefined
  wikiUrlOf: (item: T) => string
  /** How the revealed art is framed. */
  frame?: 'portrait' | 'wide' | 'plate'
  /**
   * Starting blur in pixels. Bold, simple art needs far more than a photo-like portrait
   * before it stops being recognisable at a glance.
   */
  maxBlur?: number
  subjectLabel: string
  placeholder: string
  thumb?: 'wide' | 'portrait' | 'none'
  mode: Mode
  dayKey: string
  onStats: (streak: number, wins: number) => void
}

/** Guess the subject from art that starts blurred and greyscaled, clearing as you go. */
export function RevealGame<T extends Guessable>({
  storageKey,
  salt,
  pool,
  imageOf,
  thumbOf = imageOf,
  wikiUrlOf,
  frame = 'portrait',
  maxBlur = 16,
  subjectLabel,
  placeholder,
  thumb = 'portrait',
  mode,
  dayKey,
  onStats,
}: Props<T>) {
  const { answer, guesses, revealed, guess, giveUp, nextEndless } = useRound({
    mode,
    dayKey,
    pool,
    salt,
    storageKey,
    onStats,
  })

  if (!answer) return null

  const wrong = guesses.filter((g) => g.id !== answer.id).length
  const remaining = Math.max(BLUR_STEPS - wrong, 0)
  const blur = revealed ? 0 : (maxBlur * remaining) / BLUR_STEPS

  return (
    <div className="hunter">
      <figure className="portrait">
        <div className={`portrait__frame portrait__frame--${frame}`}>
          <ObscuredArt
            src={imageOf(answer)}
            blur={blur}
            obscured={!revealed}
            label={revealed ? answer.name : `Obscured ${subjectLabel.toLowerCase()}`}
            className="portrait__image"
          />
        </div>
        <figcaption className="quote__hint">
          {revealed
            ? answer.name
            : remaining > 0
              ? `${remaining} more ${remaining === 1 ? 'guess' : 'guesses'} to clear the blur`
              : 'Fully revealed'}
        </figcaption>
      </figure>

      {!revealed && (
        <>
          <GuessInput
            pool={pool}
            guessed={guesses}
            search={searchByName}
            imageOf={thumbOf}
            thumb={thumb}
            placeholder={placeholder}
            onGuess={guess}
          />
          {guesses.length > 0 && (
            <button type="button" className="button giveup" onClick={giveUp}>
              Give up
            </button>
          )}
        </>
      )}

      {guesses.length > 0 && (
        <ol className="attempts">
          {[...guesses].reverse().map((g) => {
            const src = thumbOf(g)
            return (
              <li key={g.id} className={`attempts__row${g.id === answer.id ? ' is-hit' : ''}`}>
                {src ? (
                  <img src={src} alt="" className="attempts__portrait" loading="lazy" />
                ) : (
                  <span className="attempts__portrait icon-missing">no art</span>
                )}
                <span className="attempts__name">{g.name}</span>
                <span className="attempts__mark">{g.id === answer.id ? '✓' : '✗'}</span>
              </li>
            )
          })}
        </ol>
      )}

      {revealed && (
        <div className="victory__actions">
          {mode === 'endless' && (
            <button type="button" className="button button--primary" onClick={nextEndless}>
              Next {subjectLabel.toLowerCase()}
            </button>
          )}
          <a className="button" href={wikiUrlOf(answer)} target="_blank" rel="noreferrer noopener">
            Wiki page
          </a>
        </div>
      )}
    </div>
  )
}
