import { searchByName } from '../lib/core'
import { HUNTERS, hunterWikiUrl, redact } from '../lib/hunters'
import { useRound, type Mode } from '../lib/useRound'
import { GuessInput } from './GuessInput'

interface Props {
  mode: Mode
  dayKey: string
  onStats: (streak: number, wins: number) => void
}

/** Name the hunter from their lore blurb, with their own name blacked out. */
export function QuoteGame({ mode, dayKey, onStats }: Props) {
  const { answer, guesses, revealed, guess, giveUp, nextEndless } = useRound({
    mode,
    dayKey,
    pool: HUNTERS,
    salt: 1187,
    storageKey: 'quote',
    onStats,
  })

  if (!answer) return null

  return (
    <div className="hunter">
      <figure className="quote">
        {/* Once the answer is out the blackout has no job left to do. */}
        <blockquote className="quote__text">
          {revealed ? answer.caption : redact(answer.caption, answer)}
        </blockquote>
        <figcaption className="quote__hint">{revealed ? answer.name : 'Who is this?'}</figcaption>
      </figure>

      {!revealed && (
        <>
          <GuessInput
            pool={HUNTERS}
            guessed={guesses}
            search={searchByName}
            imageOf={(h) => h.portrait ?? null}
            thumb="portrait"
            placeholder="Name a hunter…"
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
          {[...guesses].reverse().map((g) => (
            <li key={g.id} className={`attempts__row${g.id === answer.id ? ' is-hit' : ''}`}>
              {g.portrait ? (
                <img src={g.portrait} alt="" className="attempts__portrait" loading="lazy" />
              ) : (
                <span className="attempts__portrait icon-missing">no art</span>
              )}
              <span className="attempts__name">{g.name}</span>
              <span className="attempts__mark">{g.id === answer.id ? '✓' : '✗'}</span>
            </li>
          ))}
        </ol>
      )}

      {revealed && (
        <div className="victory__actions">
          {mode === 'endless' && (
            <button type="button" className="button button--primary" onClick={nextEndless}>
              Next hunter
            </button>
          )}
          <a
            className="button"
            href={hunterWikiUrl(answer)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Wiki page
          </a>
        </div>
      )}
    </div>
  )
}
