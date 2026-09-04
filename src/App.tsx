import { useCallback, useState } from 'react'
import { GridGame } from './components/GridGame'
import { QuoteGame } from './components/QuoteGame'
import { RevealGame } from './components/RevealGame'
import { CREATURES_WITH_ART } from './lib/bestiary'
import { todayKey } from './lib/core'
import { DATA_UPDATED, WEAPONS, WEAPON_COLUMNS } from './lib/game'
import { HUNTERS, HUNTERS_WITH_PORTRAIT, hunterWikiUrl } from './lib/hunters'
import { TRAITS, TRAITS_WITH_BANNER, TRAIT_COLUMNS } from './lib/traits'

type Game = 'weapon' | 'trait' | 'quote' | 'portrait' | 'trait-icon' | 'bestiary'
type Mode = 'daily' | 'endless'

const GAMES: { id: Game; label: string; blurb: string }[] = [
  { id: 'weapon', label: 'Weapon', blurb: `Guess the weapon from ${WEAPONS.length}.` },
  { id: 'trait', label: 'Trait', blurb: `Guess the trait from ${TRAITS.length}, by cost, category and type.` },
  { id: 'quote', label: 'Hunter quote', blurb: `Name the hunter from their lore, ${HUNTERS.length} in play.` },
  { id: 'portrait', label: 'Hunter art', blurb: `Name the hunter from a blurred portrait, ${HUNTERS_WITH_PORTRAIT.length} in play.` },
  { id: 'trait-icon', label: 'Trait icon', blurb: `Name the trait from a blurred icon, ${TRAITS_WITH_BANNER.length} in play.` },
  { id: 'bestiary', label: 'Bestiary', blurb: `Name the monster or boss from blurred art, ${CREATURES_WITH_ART.length} in play.` },
]

export default function App() {
  const [game, setGame] = useState<Game>('weapon')
  const [mode, setMode] = useState<Mode>('daily')
  const [dayKey] = useState(todayKey)
  const [streak, setStreak] = useState(0)
  const [wins, setWins] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  // Each game reports its own streak, since each keeps a separate daily.
  const onStats = useCallback((s: number, w: number) => {
    setStreak(s)
    setWins(w)
  }, [])

  const shared = { mode, dayKey, onStats }

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">Huntdle</h1>
        <p className="header__tagline">{GAMES.find((g) => g.id === game)!.blurb}</p>

        <nav className="tabs" aria-label="Game">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`tabs__tab${game === g.id ? ' is-active' : ''}`}
              aria-pressed={game === g.id}
              onClick={() => setGame(g.id)}
            >
              {g.label}
            </button>
          ))}
        </nav>

        <nav className="tabs tabs--sub" aria-label="Game mode">
          {(['daily', 'endless'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`tabs__tab${mode === m ? ' is-active' : ''}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === 'daily' ? 'Daily' : 'Endless'}
            </button>
          ))}
          <button type="button" className="tabs__tab" onClick={() => setShowHelp((s) => !s)}>
            {showHelp ? 'Hide rules' : 'How to play'}
          </button>
        </nav>
      </header>

      {showHelp && (
        <section className="help">
          <p>
            <b>Weapon</b> and <b>Trait</b> are graded column by column:{' '}
            <b className="k k--hit">green</b> is an exact match, <b className="k k--miss">red</b> is
            wrong, and ▲ ▼ say whether the answer is higher or lower.
          </p>
          <p>
            <b>Hunter quote</b> gives you the lore blurb with the name blacked out.{' '}
            <b>Hunter art</b>, <b>Trait icon</b> and <b>Bestiary</b> start heavily blurred and in
            greyscale; each wrong guess clears some blur, and eight clear it entirely.
          </p>
          <p>Unlimited guesses. Each game keeps its own daily and streak.</p>
          <p className="help__source">
            Stats, art and icons from the{' '}
            <a href="https://huntshowdown.wiki.gg" target="_blank" rel="noreferrer noopener">
              official Hunt: Showdown 1896 wiki
            </a>
            , synced {new Date(DATA_UPDATED).toLocaleDateString()}.
          </p>
        </section>
      )}

      <main className="main">
        {mode === 'daily' && (
          <p className="status">
            {dayKey}
            {streak > 0 && <> · streak {streak}</>}
            {wins > 0 && <> · solved {wins}</>}
          </p>
        )}

        {game === 'weapon' && (
          <GridGame
            key="weapon"
            storageKey=""
            salt={0}
            pool={WEAPONS}
            columns={WEAPON_COLUMNS}
            imageOf={(w) => w.icon}
            wikiUrlOf={(w) => w.wikiUrl}
            descriptionOf={(w) => w.description}
            subjectLabel="Weapon"
            placeholder="Name a weapon…"
            {...shared}
          />
        )}

        {game === 'trait' && (
          <GridGame
            key="trait"
            storageKey="trait"
            salt={733}
            pool={TRAITS}
            columns={TRAIT_COLUMNS}
            imageOf={(t) => t.icon}
            wikiUrlOf={(t) => t.wikiUrl}
            descriptionOf={(t) => t.description}
            subjectLabel="Trait"
            placeholder="Name a trait…"
            {...shared}
          />
        )}

        {game === 'quote' && <QuoteGame key="quote" {...shared} />}

        {game === 'portrait' && (
          <RevealGame
            key="portrait"
            storageKey="portrait"
            salt={4231}
            pool={HUNTERS_WITH_PORTRAIT}
            imageOf={(h) => h.portrait}
            wikiUrlOf={hunterWikiUrl}
            subjectLabel="Hunter"
            placeholder="Name a hunter…"
            {...shared}
          />
        )}

        {game === 'trait-icon' && (
          <RevealGame
            key="trait-icon"
            storageKey="trait-icon"
            salt={2609}
            pool={TRAITS_WITH_BANNER}
            imageOf={(t) => t.banner}
            thumbOf={(t) => t.icon}
            wikiUrlOf={(t) => t.wikiUrl}
            frame="wide"
            // Trait banners are a single bold symbol on flat ground, so they survive far
            // more blur than a portrait before becoming unrecognisable.
            maxBlur={54}
            subjectLabel="Trait"
            placeholder="Name a trait…"
            thumb="wide"
            {...shared}
          />
        )}

        {game === 'bestiary' && (
          <RevealGame
            key="bestiary"
            storageKey="bestiary"
            salt={5147}
            pool={CREATURES_WITH_ART}
            imageOf={(c) => c.art}
            wikiUrlOf={(c) => c.wikiUrl}
            frame="plate"
            subjectLabel="Creature"
            // No thumbnails: with only 16 creatures the suggestion list would show the
            // answer's art in full, a couple of keystrokes from the blurred plate.
            thumb="none"
            placeholder="Name a monster or boss…"
            {...shared}
          />
        )}
      </main>

      <footer className="footer">
        <p>
          Fan project. Text and data adapted from the{' '}
          <a href="https://huntshowdown.wiki.gg" target="_blank" rel="noreferrer noopener">
            Hunt: Showdown 1896 wiki
          </a>
          , used under{' '}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer noopener"
          >
            CC BY-SA 4.0
          </a>
          . Game art and Hunt: Showdown are the property of Crytek; this project is
          unofficial and not affiliated with Crytek.
        </p>
      </footer>
    </div>
  )
}

