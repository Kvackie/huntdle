import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Guessable } from '../lib/core'

interface Props<T extends Guessable> {
  /** Already-played answers, dropped from the suggestions. */
  guessed: T[]
  pool: T[]
  search: (query: string, pool: T[]) => T[]
  /** Thumbnail for a suggestion, or null to show a placeholder. */
  imageOf: (item: T) => string | null | undefined
  /**
   * How to frame that thumbnail. "wide" suits weapon icons, which are 4:1 and read fine
   * whole. "portrait" suits hunter art, which is a full body on transparency — shown
   * whole at this size the head is about eight pixels tall, so it crops to the head.
   * "none" drops thumbnails entirely, for rounds where the suggestion art is the answer.
   */
  thumb?: 'wide' | 'portrait' | 'none'
  placeholder: string
  onGuess: (item: T) => void
}

export function GuessInput<T extends Guessable>({
  guessed,
  pool,
  search,
  imageOf,
  thumb = 'wide',
  placeholder,
  onGuess,
}: Props<T>) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const spent = useMemo(() => new Set(guessed.map((g) => g.id)), [guessed])
  const matches = useMemo(
    () => search(query, pool).filter((item) => !spent.has(item.id)),
    [query, pool, search, spent],
  )
  const showList = open && query.trim().length > 0

  useEffect(() => setActive(0), [matches])

  // Close the dropdown when focus or a click lands outside the combobox.
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('focusin', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('focusin', close)
    }
  }, [open])

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const submit = (item: T | undefined) => {
    if (!item) return
    onGuess(item)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      setOpen(true)
      setActive((i) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        return (i + delta + matches.length) % matches.length
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      submit(matches[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="combobox" ref={rootRef}>
      <input
        type="text"
        className="combobox__input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul className="combobox__list" id={listId} role="listbox" ref={listRef}>
          {matches.length === 0 && <li className="combobox__empty">Nothing by that name.</li>}
          {matches.map((item, i) => {
            const src = imageOf(item)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`combobox__option${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => submit(item)}
                >
                  {thumb === 'none' ? null : thumb === 'portrait' ? (
                    <span className={`combobox__thumb${src ? '' : ' icon-missing'}`}>
                      {src ? <img src={src} alt="" loading="lazy" /> : 'no art'}
                    </span>
                  ) : src ? (
                    <img src={src} alt="" className="combobox__icon" loading="lazy" />
                  ) : (
                    <span className="combobox__icon icon-missing">no art</span>
                  )}
                  <span className="combobox__name">{item.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
