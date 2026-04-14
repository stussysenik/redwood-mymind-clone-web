import { useEffect, useRef, useState } from 'react'

import './ReviewCard.css'

export type ReviewResolution = 'accept' | 'reject' | 'edit' | 'skip'

export type ReviewKind = 'title' | 'description'

export type ReviewCardData = {
  id: string
  kind: ReviewKind
  proposedValue: string
  currentValue: string | null
  confidence: number
  critique: string | null
}

type Props = {
  item: ReviewCardData
  position: number
  total: number
  onResolve: (resolution: ReviewResolution, editedValue?: string) => void
  announce: (msg: string) => void
}

// Labels flow through a single messages object so i18n can plug in later.
// See .impeccable.md principle 5 (i18n-ready from day one).
const MESSAGES = {
  currentLabel: {
    title: 'Current title',
    description: 'Current description',
  },
  proposedLabel: {
    title: 'Proposed title',
    description: 'Proposed description',
  },
  nullCurrent: '(none)',
  accept: 'accept',
  reject: 'reject',
  edit: 'edit',
  skip: 'skip',
  saveEdit: 'save edit',
  cancelEdit: 'cancel',
  counter: (position: number, total: number) => `${position} of ${total}`,
  shortcuts: 'a accept · r reject · e edit · s skip · ? help',
  why: 'why',
  announcement: (res: ReviewResolution, kind: ReviewKind) => {
    if (res === 'accept') return `Accepted ${kind}.`
    if (res === 'reject') return `Rejected ${kind}.`
    if (res === 'edit') return `Saved edited ${kind}.`
    return `Skipped ${kind}.`
  },
}

export function ReviewCard({ item, position, total, onResolve, announce }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.proposedValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Keep the draft in sync if the item changes under us (next card loaded).
  useEffect(() => {
    setEditing(false)
    setDraft(item.proposedValue)
  }, [item.id, item.proposedValue])

  // Auto-focus the textarea when edit mode opens.
  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
    }
  }, [editing])

  function finish(resolution: ReviewResolution, editedValue?: string) {
    announce(MESSAGES.announcement(resolution, item.kind))
    onResolve(resolution, editedValue)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // If the user is typing inside the textarea, let the textarea own the keys.
    if (editing) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key.toLowerCase()) {
      case 'a':
        e.preventDefault()
        finish('accept')
        break
      case 'r':
        e.preventDefault()
        finish('reject')
        break
      case 'e':
        e.preventDefault()
        setEditing(true)
        break
      case 's':
        e.preventDefault()
        finish('skip')
        break
      default:
        break
    }
  }

  return (
    <article
      className="rc"
      aria-labelledby={`rc-heading-${item.id}`}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <header className="rc__top">
        <span className="rc__counter" aria-live="off">
          {MESSAGES.counter(position, total)}
        </span>
        <button
          type="button"
          className="rc__topskip"
          onClick={() => finish('skip')}
          aria-label={`${MESSAGES.skip} (s)`}
        >
          {MESSAGES.skip} ✕
        </button>
      </header>

      <div className="rc__body">
        <h2 id={`rc-heading-${item.id}`} className="rc__label">
          {MESSAGES.currentLabel[item.kind]}
        </h2>
        <p className="rc__current">{item.currentValue ?? MESSAGES.nullCurrent}</p>

        <h3 className="rc__label">{MESSAGES.proposedLabel[item.kind]}</h3>
        {!editing ? (
          <p className="rc__proposed">{item.proposedValue}</p>
        ) : (
          <div className="rc__editwrap">
            <textarea
              ref={textareaRef}
              className="rc__textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={item.kind === 'title' ? 2 : 4}
              aria-label={MESSAGES.proposedLabel[item.kind]}
            />
            <div className="rc__editactions">
              <button
                type="button"
                className="rc__btn rc__btn--ghost"
                onClick={() => {
                  setEditing(false)
                  setDraft(item.proposedValue)
                }}
              >
                {MESSAGES.cancelEdit}
              </button>
              <button
                type="button"
                className="rc__btn rc__btn--primary"
                onClick={() => finish('edit', draft.trim())}
                disabled={!draft.trim()}
              >
                {MESSAGES.saveEdit}
              </button>
            </div>
          </div>
        )}

        {item.critique ? (
          <p className="rc__critique">
            <span className="rc__why">{MESSAGES.why}:</span> {item.critique}
          </p>
        ) : null}
      </div>

      {!editing ? (
        <footer className="rc__actions">
          <button
            type="button"
            className="rc__btn rc__btn--ghost"
            onClick={() => finish('reject')}
            aria-label={`${MESSAGES.reject} (r)`}
          >
            {MESSAGES.reject}
          </button>
          <button
            type="button"
            className="rc__btn rc__btn--ghost"
            onClick={() => setEditing(true)}
            aria-label={`${MESSAGES.edit} (e)`}
          >
            {MESSAGES.edit}
          </button>
          <button
            type="button"
            className="rc__btn rc__btn--primary"
            onClick={() => finish('accept')}
            aria-label={`${MESSAGES.accept} (a)`}
          >
            {MESSAGES.accept}
          </button>
        </footer>
      ) : null}

      <p className="rc__shortcuts" aria-hidden="true">
        {MESSAGES.shortcuts}
      </p>
    </article>
  )
}

export default ReviewCard
